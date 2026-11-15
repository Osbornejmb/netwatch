import { BlockList, isIP } from 'node:net'
import { hostname, networkInterfaces } from 'node:os'
import { invalid } from './store.js'

const privateV4 = new BlockList()
for (const [address, prefix] of [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
])
  privateV4.addSubnet(address, prefix)
const privateV6 = new BlockList()
privateV6.addSubnet('fe80::', 10, 'ipv6')
privateV6.addSubnet('fc00::', 7, 'ipv6')
const loopback = new BlockList()
loopback.addSubnet('127.0.0.0', 8)
loopback.addAddress('::1', 'ipv6')

export function requestSource(address) {
  const ip = address?.split('%')[0]
  const family = isIP(ip)
  if (!family) return
  const type = family === 4 ? 'ipv4' : 'ipv6'
  if (loopback.check(ip, type)) return 'local'
  if (privateV4.check(ip, type) || privateV6.check(ip, type)) return 'remote'
}

export function admitRequest(req, origin, authorities, remoteAddress) {
  const source = requestSource(remoteAddress)
  if (!source) throw invalid('Unexpected client address.', 403)
  const host = req.headers.host
  if (!authorities.has(host)) {
    if (/^(?:localhost|\[::1\])(?::\d+)?$/i.test(host ?? '')) throw invalid('Use ' + origin + '.', 403)
    throw invalid('Unexpected host.', 403)
  }
  const scheme = origin.slice(0, origin.indexOf('://') + 3)
  if (
    (req.headers.origin || (source === 'remote' && req.headers.origin !== undefined)) &&
    !authorities.has(req.headers.origin.startsWith(scheme) && req.headers.origin.slice(scheme.length))
  )
    throw invalid('Unexpected origin.', 403)
  const fetchSite = req.headers['sec-fetch-site']
  if ((fetchSite || (source === 'remote' && fetchSite !== undefined)) && !['same-origin', 'none'].includes(fetchSite))
    throw invalid('Cross-site requests are disabled.', 403)
  return source
}

export function createLanListeners({
  port,
  createServer,
  interfaces = networkInterfaces,
  names = process.env.NETWATCH_HOSTNAMES ?? hostname(),
  interval = 60000,
  scheme = 'http',
  log = console.log,
}) {
  const hosts = names
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(name) && name !== 'localhost' && !isIP(name))
  const listeners = new Map()
  const closing = new Set()
  let timer
  let stopped = false
  let retry
  const addressUrls = () => [...listeners].filter(([, server]) => server.listening).map(([ip]) => ip + ':' + port)
  const authorities = () =>
    new Set([...addressUrls(), ...(addressUrls().length ? hosts.map((host) => host + ':' + port) : [])])
  const close = (server) => {
    const done = new Promise((resolve) => server.close(resolve))
    closing.add(done)
    server.closeAllConnections()
    void done.then(() => closing.delete(done))
  }
  function refresh() {
    if (stopped) return
    const addresses = new Set(
      Object.values(interfaces())
        .flat()
        .filter((entry) => entry && !entry.internal && isIP(entry.address) === 4 && privateV4.check(entry.address))
        .map((entry) => entry.address),
    )
    for (const [address, server] of listeners) {
      if (addresses.has(address)) continue
      listeners.delete(address)
      close(server)
      log('NetWatch LAN listener removed: ' + address)
    }
    for (const address of addresses) {
      if (listeners.has(address)) continue
      const server = createServer(authorities)
      listeners.set(address, server)
      server.on('error', () => {
        if (stopped || listeners.get(address) !== server) return
        listeners.delete(address)
        if (server.listening) close(server)
        log('NetWatch LAN listener failed: ' + address)
        retry ??= setTimeout(
          () => {
            retry = undefined
            refresh()
          },
          Math.min(interval, 5000),
        )
        retry.unref()
      })
      server.listen(port, address, () => log('NetWatch LAN listener added: ' + address))
    }
  }
  return {
    start() {
      refresh()
      timer = setInterval(refresh, interval)
      timer.unref()
    },
    authorities,
    urls: () => [...authorities()].map((authority) => scheme + '://' + authority),
    async stop() {
      stopped = true
      clearInterval(timer)
      clearTimeout(retry)
      for (const server of listeners.values()) close(server)
      listeners.clear()
      await Promise.all(closing)
    },
  }
}
