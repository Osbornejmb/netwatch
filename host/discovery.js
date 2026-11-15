import os from 'node:os'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isIPv4 } from 'node:net'
import { promisify } from 'node:util'
import { connectionKey } from '../src/connections.js'
import { normalizeAddress } from '../src/inventory.js'
import { reverseHints } from './discovery-names.js'

const execute = promisify(execFile)
const privateIPv4 = (ip) => isIPv4(ip) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
export const DISCOVERY_POLICY = Object.freeze({
  intervalMs: 300000,
  deadlineMs: 140000,
  maxHosts: 1022,
  concurrency: 8,
})
const ipv4 = (value) => {
  const a = normalizeAddress(value)
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(a)) throw Error()
  return a.split('.').reduce((n, x) => n * 256 + Number(x), 0)
}
const dotted = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')
export function parseDefaultGateways(output, interfaces = os.networkInterfaces()) {
  if (typeof output !== 'string' || Buffer.byteLength(output) > 32768) throw Error('invalid_routes')
  const local = new Map()
  for (const rows of Object.values(interfaces))
    for (const row of rows || [])
      if (
        row.family === 'IPv4' &&
        !row.internal &&
        row.address &&
        row.netmask &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(row.address)
      ) {
        try {
          local.set(row.address, { ip: ipv4(row.address), mask: ipv4(row.netmask) })
        } catch {}
      }
  const routes = []
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(
      /^\s*((?:\d{1,3}\.){3}\d{1,3})\s+((?:\d{1,3}\.){3}\d{1,3})\s+((?:\d{1,3}\.){3}\d{1,3})\s+((?:\d{1,3}\.){3}\d{1,3})\s+(\d+)\s*$/,
    )
    if (!m || m[1] !== '0.0.0.0' || m[2] !== '0.0.0.0') continue
    try {
      const gateway = ipv4(m[3]),
        iface = local.get(m[4]),
        metric = Number(m[5])
      if (iface && gateway && Number.isSafeInteger(metric) && (gateway & iface.mask) === (iface.ip & iface.mask))
        routes.push({ interfaceIp: m[4], gatewayIp: m[3], metric })
    } catch {}
  }
  routes.sort((a, b) => a.metric - b.metric)
  const result = new Map()
  for (const route of routes) if (!result.has(route.interfaceIp)) result.set(route.interfaceIp, route.gatewayIp)
  return result
}
export function localSubnets(interfaces = os.networkInterfaces(), maxPrefix = 24) {
  const result = []
  for (const rows of Object.values(interfaces))
    for (const row of rows || []) {
      if (
        row.family !== 'IPv4' ||
        row.internal ||
        !row.address ||
        !row.netmask ||
        !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(row.address)
      )
        continue
      try {
        const ip = ipv4(row.address),
          mask = ipv4(row.netmask),
          prefix = mask.toString(2).replace(/0/g, '').length
        if (prefix > 32 || (prefix < 32 && mask !== (0xffffffff << (32 - prefix)) >>> 0) || prefix === 32) continue
        const network = (ip & mask) >>> 0
        if (['127.', '169.254.'].some((p) => row.address.startsWith(p))) continue
        if (prefix < 22 || prefix < maxPrefix) throw Error('subnet_too_large')
        const first = prefix === 31 ? network : network + 1,
          last = prefix === 31 ? network + 1 : ((network | (~mask >>> 0)) >>> 0) - 1
        if (last < first) continue
        result.push({
          cidr: `${dotted(network)}/${prefix}`,
          interfaceAddress: row.address,
          addresses: Array.from({ length: last - first + 1 }, (_, i) => dotted(first + i)),
        })
      } catch (e) {
        if (e.message === 'subnet_too_large') throw e
      }
    }
  return result
}
export function parseNeighbors(output, now = Date.now()) {
  if (typeof output !== 'string' || Buffer.byteLength(output) > 65536) throw Error('invalid_output')
  const found = []
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([\da-f]{2}([:-])[\da-f]{2}(?:\3[\da-f]{2}){4})\s+(\S.*)$/i)
    if (!m) continue
    const type = m[4].trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    const mac = m[2].toLowerCase().replaceAll('-', ':')
    if (
      /^(?:invalid|incomplete|ungultig|unvollstandig|invalide|non valide|incomplet(?:e|o|a)?|invalido|no valido)$/.test(
        type,
      )
    )
      continue
    if (mac === 'ff:ff:ff:ff:ff:ff' || mac.startsWith('01:00:5e:')) continue
    try {
      found.push({
        ip: normalizeAddress(m[1]),
        mac,
        source: 'neighbor',
        seenAt: now,
      })
    } catch {}
  }
  return found
}

function observedPair(output, gateways, target) {
  const hops = new Map()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*([12])\s+(?:<?\s*\d+\s*ms|\*)(?:\s+(?:<?\s*\d+\s*ms|\*)){2}\s+([\d.]+)\s*$/i)
    if (match && isIPv4(match[2])) hops.set(Number(match[1]), match[2])
  }
  return hops.get(2) === target ? gateways.get(hops.get(1)) : undefined
}

export function createDiscovery(
  store,
  {
    enabled = false,
    active = false,
    platform = process.platform,
    interfaces = os.networkInterfaces,
    runner = async ({ signal } = {}) => {
      const r = await execute('arp.exe', ['-a'], {
        shell: false,
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 65536,
        signal,
      })
      return r.stdout
    },
    gatewayRunner = async ({ signal } = {}) => {
      const r = await execute('route.exe', ['print', '-4'], {
        shell: false,
        windowsHide: true,
        timeout: 2000,
        maxBuffer: 32768,
        signal,
      })
      return r.stdout
    },
    traceRunner = async (ip, { signal }) => {
      const r = await execute('tracert.exe', ['-4', '-d', '-h', '2', '-w', '350', ip], {
        shell: false,
        windowsHide: true,
        timeout: 3500,
        maxBuffer: 8192,
        signal,
      })
      return r.stdout
    },
    pingRunner = async () => ({ outcome: 'error', code: 'unsupported_platform' }),
    nameLookup,
    probeGate = async (task) => task(),
    now = () => Date.now(),
    policy = DISCOVERY_POLICY,
    maxPrefix = 24,
  } = {},
) {
  let activeRun = null,
    timer,
    stopped = false,
    lastRunAt = null,
    durationMs = 0,
    upstreamLinks = 0,
    traceOffset = 0,
    diagnostics = [],
    controller,
    progress = { phase: 'idle', processed: 0, total: 0 }
  const snapshot = () => ({
    state: !enabled ? 'disabled' : platform !== 'win32' ? 'unsupported' : activeRun ? 'running' : 'idle',
    lastRunAt,
    durationMs,
    upstreamLinks,
    ...progress,
    counts: store.discoveryCounts(),
    diagnostics: [...diagnostics],
  })
  async function runOnce({ saveUpstream = true } = {}) {
    if (!enabled || platform !== 'win32' || stopped) return
    if (activeRun) return activeRun
    controller = new AbortController()
    activeRun = (async () => {
      const start = now()
      diagnostics = []
      upstreamLinks = 0
      let deadline
      try {
        const currentInterfaces = interfaces()
        const subnets = localSubnets(currentInterfaces, maxPrefix)
        if (!subnets.length) throw Error('no_interface')
        const addresses = [...new Set(subnets.flatMap((s) => s.addresses))]
        if (addresses.length > policy.maxHosts) throw Error('sweep_cap')
        const allowed = new Set(addresses),
          cycleDeadline = Math.max(policy.deadlineMs, Math.ceil(addresses.length / policy.concurrency) * 4000 + 25000)
        progress = { phase: 'neighbors', processed: 0, total: addresses.length }
        const [output, gateways] = await Promise.race([
          Promise.all([runner({ signal: controller.signal }), readGateways(currentInterfaces, controller.signal)]),
          new Promise((_, reject) => {
            deadline = setTimeout(() => {
              controller.abort()
              reject(Error('timeout'))
            }, cycleDeadline)
          }),
        ])
        const byIp = new Map(
          parseNeighbors(output, now())
            .filter((r) => allowed.has(r.ip))
            .map((r) => [r.ip, r]),
        )
        const observedGateways = store.observedGatewayAddresses()
        const knownByIp = new Map(observedGateways.map(({ ip, mac }) => [ip, mac]))
        const knownMacs = new Set(knownByIp.values())
        for (const row of byIp.values()) {
          if (knownMacs.has(row.mac)) row.source = knownByIp.get(row.ip) === row.mac ? 'gateway' : 'gateway-mac'
        }
        for (const ip of gateways.values()) {
          if (allowed.has(ip)) byIp.set(ip, { ...byIp.get(ip), ip, source: 'gateway', seenAt: now() })
        }
        if (active) {
          progress = { phase: 'icmp', processed: 0, total: addresses.length }
          let next = 0
          const workers = Array.from({ length: Math.min(policy.concurrency, addresses.length) }, async () => {
            while (!controller.signal.aborted) {
              const ip = addresses[next++]
              if (!ip) return
              const result = await probeGate(() => pingRunner(ip, { signal: controller.signal }), controller.signal)
              progress = { ...progress, processed: progress.processed + 1 }
              if (result?.outcome === 'reachable' && !byIp.has(ip))
                byIp.set(ip, { ip, mac: null, source: 'icmp', seenAt: now() })
            }
          })
          await Promise.all(workers)
        }
        if (controller.signal.aborted) throw Error('cancelled')
        progress = { phase: 'names', processed: 0, total: Math.min(byIp.size, 128) }
        const names = await reverseHints(
          [...byIp.values()].filter((row) => !row.hostname),
          {
            signal: controller.signal,
            lookup: nameLookup,
            limit: 128,
            onProgress: (processed) => {
              progress = { ...progress, processed: Math.min(processed, progress.total) }
            },
          },
        )
        for (const row of byIp.values()) if (names.has(row.ip)) row.hostname = names.get(row.ip)
        if (controller.signal.aborted) throw Error('cancelled')
        if (saveUpstream && active && gateways.size) await traceUpstream(gateways, allowed, controller.signal)
        if (controller.signal.aborted) throw Error('cancelled')
        progress = { phase: 'saving', processed: progress.total, total: progress.total }
        store.recordDiscovery([...byIp.values()])
        lastRunAt = new Date(now()).toISOString()
      } catch (e) {
        diagnostics = [
          e.message === 'subnet_too_large'
            ? 'subnet_too_large'
            : e.message === 'sweep_cap'
              ? 'sweep_cap'
              : e.message === 'timeout'
                ? 'timeout'
                : controller.signal.aborted
                  ? 'cancelled'
                  : 'discovery_error',
        ]
      } finally {
        clearTimeout(deadline)
        durationMs = Math.max(0, now() - start)
        progress = { phase: 'idle', processed: 0, total: 0 }
        activeRun = null
        controller = null
      }
    })()
    return activeRun
  }
  async function traceUpstream(gateways, allowed, signal) {
    const { topology, monitoring, revision } = store.read()
    const routers = topology.nodes.filter((node) => node.type === 'router' && privateIPv4(node.data.ip))
    const gatewayIps = new Set(gateways.values())
    const local = new Map(routers.filter((node) => gatewayIps.has(node.data.ip)).map((node) => [node.data.ip, node.id]))
    const remainingEdges = 10000 - topology.edges.length
    if (!local.size || !remainingEdges) return
    const links = new Set(topology.edges.map(connectionKey))
    const pending = routers.filter(
      (node) =>
        !allowed.has(node.data.ip) &&
        [...local.values()].some((source) => !links.has(connectionKey({ source, target: node.id }))),
    )
    if (!pending.length) return
    const total = Math.min(pending.length, remainingEdges, 4)
    const edges = []
    progress = { phase: 'routes', processed: 0, total }
    for (let i = 0; i < total && !signal.aborted; i++) {
      const target = pending[(traceOffset + i) % pending.length]
      let output
      try {
        output = await probeGate(() => traceRunner(target.data.ip, { signal }), signal)
      } catch {}
      if (typeof output === 'string' && Buffer.byteLength(output) <= 8192) {
        const source = observedPair(output, local, target.data.ip)
        if (source && !links.has(connectionKey({ source, target: target.id }))) {
          edges.push({ id: randomUUID(), source, target: target.id, label: 'Observed upstream route' })
        }
      }
      progress = { ...progress, processed: i + 1 }
    }
    traceOffset = (traceOffset + total) % pending.length
    if (signal.aborted || !edges.length || store.revision() !== revision) return
    try {
      store.write(
        { source: 'inventory', topology: { ...topology, edges: [...topology.edges, ...edges] }, monitoring },
        revision,
      )
      upstreamLinks = edges.length
    } catch (error) {
      if (error.status !== 409) throw error
    }
  }
  async function readGateways(currentInterfaces, signal) {
    try {
      return parseDefaultGateways(await gatewayRunner({ signal }), currentInterfaces)
    } catch {
      return new Map()
    }
  }
  async function gatewayLookup() {
    if (platform !== 'win32') return () => null
    try {
      const currentInterfaces = interfaces()
      const subnets = localSubnets(currentInterfaces, maxPrefix)
      const gateways = await readGateways(currentInterfaces)
      return (ip) => {
        const subnet = subnets.find((item) => item.addresses.includes(ip))
        return gateways.get(subnet?.interfaceAddress) ?? null
      }
    } catch {
      return () => null
    }
  }
  return {
    snapshot,
    runOnce,
    gatewayLookup,
    async gatewayFor(ip) {
      return (await gatewayLookup())(ip)
    },
    start() {
      if (enabled && platform === 'win32' && !timer && !stopped) {
        void runOnce()
        timer = setInterval(() => void runOnce(), policy.intervalMs)
      }
    },
    async stop() {
      stopped = true
      clearInterval(timer)
      controller?.abort()
      await activeRun
    },
  }
}
