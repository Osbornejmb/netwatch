import { createHash } from 'node:crypto'
import { connectionKey } from '../../src/connections.js'
import { invalid } from '../store.js'
import { queryNumber } from './query.js'
import { saveSwitchPortLink, switchPortFor } from '../switch-ports.js'

export function listDiscovered({ store, url, interfaces }) {
  const pending = store.pendingDiscovery()
  const page = store.discovered({
    after: queryNumber(url, 'after', 0),
    limit: queryNumber(url, 'limit', 100),
    includeMisses: true,
  })
  const ports = interfaces?.switchPorts?.()
  const nodes = ports?.size ? store.read().topology.nodes : []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const byIp = new Map(nodes.map((node) => [node.data.ip, node]))
  page.devices = page.devices.map(({ misses, ...device }) => {
    if (misses || !ports?.size) return device
    const port = switchPortFor(ports, byIp.get(device.ip) ?? { data: { ip: device.ip } }, device)
    const owner = port && byId.get(port.switchId)
    return owner ? { ...device, switchPort: { switch: owner.data.label || owner.data.ip, name: port.name } } : device
  })
  return {
    ...page,
    pendingCount: pending.length,
    pendingVersion: pendingVersion(pending),
  }
}

export function scanNow(discovery) {
  let lastScanRequest = 0
  return async ({ infrastructureOnly } = {}) => {
    if (infrastructureOnly) return { state: 'disabled' }
    if (Date.now() - lastScanRequest < 30000) throw invalid('Wait before starting another scan.', 429)
    lastScanRequest = Date.now()
    await discovery?.runOnce()
    return discovery?.snapshot() ?? { state: 'disabled' }
  }
}

export function clearDiscovered({ store }) {
  return { removed: store.clearDiscovery() }
}

export function removeDiscovered({ store, id }) {
  store.removeDiscovery(id)
  return { ok: true }
}

export async function addDiscoveredToMap({ store, discovery, interfaces, infrastructureOnly, id, body }) {
  if (infrastructureOnly) throw invalid('Local neighbor discovery is paused in router and switch mode.', 409)
  const bulk = id === undefined
  const record = bulk ? null : store.discoveredDevice(id)
  if (!bulk && !record) throw invalid('Discovered device not found.', 404)
  if (body?.baseRevision !== store.revision()) throw invalid('Inventory changed.', 409)
  const gatewayFor = bulk ? await discovery?.gatewayLookup?.() : null
  const singleGateway = bulk ? null : await discovery?.gatewayFor?.(record.ip)
  const current = store.read()
  if (body.baseRevision !== current.revision) throw invalid('Inventory changed.', 409)
  const items = bulk ? store.pendingDiscovery() : [{ id, ...store.discoveredDevice(id) }]
  if (!bulk && !items[0].ip) throw invalid('Discovered device not found.', 404)
  if (bulk && pendingVersion(items) !== body.pendingVersion) throw invalid('Scan results changed.', 409)
  const topology = { ...current.topology, nodes: [...current.topology.nodes], edges: [...current.topology.edges] }
  const existing = new Map(topology.edges.map((edge) => [edge.id, edge]))
  const members = new Set()
  const ports = interfaces?.switchPorts?.() ?? new Map()
  let addedCount = 0
  const linksToPlan = []
  for (const item of items) {
    const gateway = bulk ? gatewayFor?.(item.ip) : singleGateway
    const port = !item.misses && switchPortFor(ports, { data: { ip: item.ip } }, item)
    let node = topology.nodes.find((candidate) => candidate.id === item.savedDeviceId || candidate.data.ip === item.ip)
    if (!node) {
      if (item.status === 'added') throw invalid('The saved device is missing from the map.', 409)
      node = {
        id: item.id,
        type:
          item.ip === gateway || ['gateway', 'gateway-mac'].includes(item.source)
            ? 'router'
            : (port?.peerType ?? 'endpoint'),
        position: { x: 0, y: 0 },
        data: { label: item.hostname || item.ip, ip: item.ip, description: '' },
      }
      topology.nodes.push(node)
      addedCount++
    }
    members.add(node.id)
    linksToPlan.push({ node, gateway, item })
  }
  for (const { node, gateway, item } of linksToPlan) {
    const port = !item.misses && switchPortFor(ports, node, item)
    if (port) {
      saveSwitchPortLink(
        topology,
        node,
        port,
        port.remotePort ? store.currentInterfaces?.(node.id, interfaces?.snapshot?.().freshness?.staleAfterMs) : [],
      )
      continue
    }
    const router = topology.nodes.find((candidate) => candidate.type === 'router' && candidate.data.ip === gateway)
    if (!router || router.id === node.id || topology.edges.length >= 10000) continue
    const pair = { source: node.id, target: router.id }
    if (!topology.edges.some((edge) => connectionKey(edge) === connectionKey(pair))) {
      const key = createHash('sha256').update(connectionKey(pair)).digest('hex')
      topology.edges.push({ ...pair, id: 'gateway-' + key, label: 'Gateway route' })
    }
  }
  const edges = topology.edges.filter((edge) => existing.get(edge.id) !== edge)
  const replaceEdges = edges.flatMap(({ id }) => (existing.has(id) ? [existing.get(id)] : []))
  for (const { source, target } of edges) {
    members.add(source)
    members.add(target)
  }
  return {
    draft: {
      nodes: topology.nodes.filter((node) => members.has(node.id)),
      edges,
      ...(replaceEdges.length && { replaceEdges }),
    },
    addedCount,
    existingCount: items.length - addedCount,
    revision: current.revision,
  }
}

function pendingVersion(items) {
  return createHash('sha256').update(JSON.stringify(items)).digest('hex')
}
