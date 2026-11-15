import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { openStore } from './store.js'
import { createLanListeners } from './lan.js'
import { manageLauncherAccess } from './auth-config.js'
import { createSessions } from './sessions.js'
import { createHost } from './server.js'
import { loopbackUrl, readPort } from './port.js'
import { lock } from './files.js'
import { createCollector } from './collector.js'
import { createWindowsProbe } from './windows-probe.js'
import { prepareWindowsHelper } from './windows-helper.js'
import { createCredentialVault, credentialDirectory } from './snmp-secrets.js'
import { createInterfaceCollector } from './snmp-collector.js'
import { createDiscovery } from './discovery.js'
import { createProbeGate } from './probe-gate.js'
const port = readPort()
const path = resolve(process.env.NETWATCH_DB || 'data/netwatch.sqlite')
mkdirSync(dirname(path), { recursive: true })
const release = lock(path)
let store
try {
  store = openStore(path)
} catch (e) {
  release()
  throw e
}
const runner = createWindowsProbe({
  prepare: () => prepareWindowsHelper({ directory: resolve(dirname(path), 'collector') }),
})
const probeGate = createProbeGate(8)
const collector = createCollector(store, { enabled: process.env.NETWATCH_ICMP === '1', runner, probeGate })
const interfaces = createInterfaceCollector(store, {
  enabled: process.env.NETWATCH_SNMP === '1',
  vault: createCredentialVault(credentialDirectory(path)),
})
const discoveryPrefix =
  process.env.NETWATCH_DISCOVERY_MAX_PREFIX === undefined ? 24 : Number(process.env.NETWATCH_DISCOVERY_MAX_PREFIX)
if (!Number.isInteger(discoveryPrefix) || discoveryPrefix < 16 || discoveryPrefix > 30)
  throw new Error('NETWATCH_DISCOVERY_MAX_PREFIX must be a prefix length from 16 through 30.')
const discovery = createDiscovery(store, {
  enabled: process.env.NETWATCH_DISCOVERY === '1',
  active: process.env.NETWATCH_DISCOVERY_ICMP === '1',
  pingRunner: (ip, { signal }) => runner(ip, { signal }),
  probeGate,
  maxPrefix: discoveryPrefix,
})
const auth = createSessions(store.db, { lan: process.env.NETWATCH_LAN === '1' })
const hostOptions = { port, collector, interfaces, discovery, auth }
const lan =
  process.env.NETWATCH_LAN === '1'
    ? createLanListeners({
        port,
        createServer: (lanAuthorities) => createHost(store, { ...hostOptions, lanAuthorities }),
      })
    : undefined
const server = createHost(store, { ...hostOptions, lanAuthorities: lan?.authorities })
server.listen(port, '127.0.0.1', () => {
  if (stopping) {
    server.close()
    return
  }
  lan?.start()
  collector.start()
  interfaces.start()
  discovery.start()
  console.log('NetWatch: ' + loopbackUrl(port) + ' Collector: ' + collector.snapshot().state)
  if (process.connected)
    process.send({ type: 'ready', port, collector: collector.snapshot().state, urls: lan?.urls() ?? [] })
})
const sessionCleanup = setInterval(() => auth.purge(), 60000)
sessionCleanup.unref()
let stopping = false
let accessUpdate
async function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  clearInterval(sessionCleanup)
  const closed = new Promise((resolve) => server.close(resolve))
  server.closeAllConnections()
  await Promise.all([collector.stop(), interfaces.stop(), discovery.stop(), lan?.stop()])
  await closed
  await accessUpdate
  store.close()
  release()
  process.exitCode = code
  if (process.connected) process.disconnect()
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void shutdown())
if (process.send) {
  process.on('message', (message) => {
    if (message?.type === 'shutdown') void shutdown()
    if (message?.type !== 'access' || stopping) return
    if (accessUpdate) {
      if (message.request?.command !== 'status' && process.connected)
        process.send({ type: 'access', error: 'Wait for the current change and try again.' })
      return
    }
    accessUpdate = (async () => {
      try {
        const result = await manageLauncherAccess(store.db, message.request)
        if (message.request?.command !== 'status') auth.invalidate()
        auth.purge()
        const sessions = store.db
          .prepare('SELECT role, ip, last_seen_at AS lastSeen FROM sessions ORDER BY last_seen_at DESC')
          .all()
        if (process.connected) process.send({ type: 'access', ...result, sessions, urls: lan?.urls() ?? [] })
      } catch {
        if (process.connected) process.send({ type: 'access', error: 'Unable to update access settings.' })
      }
    })().finally(() => {
      accessUpdate = undefined
    })
  })
  process.on('disconnect', () => void shutdown())
}
server.on('error', (e) => {
  console.error(e.message)
  void shutdown(1)
})
