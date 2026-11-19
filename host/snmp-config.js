import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { secret } from './secret-prompt.js'
import { openStore } from './store.js'
import { lock } from './files.js'
import { createCredentialVault, credentialDirectory } from './snmp-secrets.js'
import { createSnmpProbe, validateSnmpUser } from './snmp-probe.js'

async function enroll(store, vault, state, node, user) {
  const authorization = randomUUID()
  await vault.save({
    version: 1,
    deviceId: node.id,
    address: node.data.ip,
    type: node.type,
    authorization,
    user,
  })
  store.authorizeInterfaces(node.id, authorization, state.revision)
}

export async function manageLauncherSnmp(store, vault, request, probe = createSnmpProbe()) {
  const state = store.read()
  if (request?.command === 'list') {
    const configured = new Set(store.interfaceTargets().map((target) => target.deviceId))
    return {
      devices: state.topology.nodes
        .filter((node) => node.data.ip)
        .map((node) => ({
          id: node.id,
          label: node.data.label,
          address: node.data.ip,
          type: node.type,
          configured: configured.has(node.id),
        })),
    }
  }
  if (!['test', 'enable'].includes(request?.command)) throw new Error('Invalid setup command.')
  const node = state.topology.nodes.find((node) => node.id === request.id)
  if (!node?.data.ip || node.data.ip !== request.address || node.type !== request.type)
    return { error: 'Saved device changed. Reopen Port monitoring and select it again.' }
  let user
  try {
    user = validateSnmpUser({ ...request.user, privProtocol: 'aes' })
  } catch {
    return { error: 'Enter a valid SNMP username and passwords of at least 8 characters.' }
  }
  const result = await probe(node.data.ip, user)
  if (!result.interfaces?.some((row) => row.oper !== null))
    return { error: 'Could not read port status. Check the device address, SNMP credentials and IF-MIB access.' }
  if (request.command === 'enable') await enroll(store, vault, state, node, user)
  return { portCount: result.interfaces.length }
}

async function readLauncherRequest() {
  let data = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    data += chunk
    if (data.length > 8192) throw new Error('Invalid setup command.')
  }
  return JSON.parse(data)
}

async function visible(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await new Promise((resolve) => rl.question(question, resolve))
  } finally {
    rl.close()
  }
}
async function main() {
  if (process.platform !== 'win32') throw new Error('SNMP credential setup requires Windows.')
  const [command, id] = process.argv.slice(2)
  const launcher = command === '--launcher' && process.argv.length === 3
  if (
    !launcher &&
    (!['set', 'remove', 'list'].includes(command) ||
      (command !== 'list' && !id) ||
      process.argv.length > (command === 'list' ? 3 : 4))
  )
    throw new Error(
      'Usage: npm run snmp -- set <saved-device-id> | remove <id> | list. Stop the host first; set requires an interactive terminal.',
    )
  const path = resolve(process.env.NETWATCH_DB || 'data/netwatch.sqlite')
  mkdirSync(dirname(path), { recursive: true })
  const release = lock(path)
  let store
  try {
    store = openStore(path)
    const vault = createCredentialVault(credentialDirectory(path))
    if (launcher) {
      console.log(JSON.stringify(await manageLauncherSnmp(store, vault, await readLauncherRequest())))
      return
    }
    if (command === 'list') {
      const configured = new Set(store.interfaceTargets().map((t) => t.deviceId))
      for (const node of store.read().topology.nodes)
        console.log(JSON.stringify({ id: node.id, label: node.data.label, configured: configured.has(node.id) }))
      return
    }
    const state = store.read(),
      node = state.topology.nodes.find((n) => n.id === id)
    if (command === 'remove') {
      if (node?.data.ip) store.authorizeInterfaces(id, null, state.revision)
      vault.remove(id)
      console.log('Interface monitoring removed.')
      return
    }
    if (!node?.data.ip) throw new Error('Choose a saved device with a management address.')
    console.log(
      'This authorizes read-only SNMPv3 checks of this saved device/address. No device configuration is changed. Passwords are hidden and protected for this Windows account.',
    )
    console.log(JSON.stringify({ deviceId: id, address: node.data.ip, type: node.type }))
    const authProtocol = (await visible('Authentication (sha256 or sha for older IOS): ')).trim(),
      name = await secret('SNMP username (hidden): ')
    const authKey = await secret('Authentication password: '),
      privKey = await secret('AES-128 privacy password: ')
    await enroll(store, vault, state, node, { name, authProtocol, authKey, privProtocol: 'aes', privKey })
    console.log(
      'Credentials protected and device authorized. Start the host with NETWATCH_SNMP=1 to collect interfaces; ICMP authorization is separate.',
    )
  } finally {
    store?.close()
    release()
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error(
      'SNMP setup did not complete. Check the command, stopped host, saved device and Windows credential access. Existing data was preserved; retry setup if needed.',
    )
    process.exitCode = 1
  })
