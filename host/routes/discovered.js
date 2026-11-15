import { randomUUID } from 'node:crypto'
import { invalid } from '../store.js'
import { queryNumber } from './query.js'

export function listDiscovered({ store, url }) {
  return store.discovered({ after: queryNumber(url, 'after', 0), limit: queryNumber(url, 'limit', 100) })
}

export function scanNow(discovery) {
  let lastScanRequest = 0
  return async () => {
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

export async function addDiscoveredToMap({ store, discovery, id, body }) {
  const discovered = store.discoveredDevice(id)
  if (!discovered) throw invalid('Discovered device not found.', 404)
  if (body?.baseRevision !== store.revision()) throw invalid('Inventory changed.', 409)
  const gatewayIp = await discovery?.gatewayFor?.(discovered.ip)
  // The scan or another client can change data while the gateway lookup runs.
  const item = store.discoveredDevice(id)
  if (!item) throw invalid('Discovered device not found.', 404)
  const current = store.read()
  if (body.baseRevision !== current.revision) throw invalid('Inventory changed.', 409)
  let deviceId = item.savedDeviceId,
    node = deviceId && current.topology.nodes.find((candidate) => candidate.id === deviceId),
    topology = current.topology,
    promotedRouter = false,
    monitoring = { ...current.monitoring }
  if (item.status === 'added' && !node) throw invalid('The saved device is missing from the map.', 409)
  if (!node) {
    deviceId = randomUUID()
    node = {
      id: deviceId,
      type: item.ip === gatewayIp ? 'router' : 'switch',
      position: { x: 0, y: 0 },
      data: { label: item.hostname || item.ip, ip: item.ip, description: '' },
    }
    topology = { ...topology, nodes: [...topology.nodes, node] }
    monitoring[deviceId] = true
  } else if (item.ip === gatewayIp && node.type !== 'router') {
    node = { ...node, type: 'router' }
    topology = {
      ...topology,
      nodes: topology.nodes.map((candidate) => (candidate.id === deviceId ? node : candidate)),
    }
    promotedRouter = true
  }
  const gateway = topology.nodes.find(
      (candidate) => candidate.type === 'router' && candidate.data.ip === gatewayIp && candidate.id !== deviceId,
    ),
    hasLink =
      gateway &&
      topology.edges.some(
        (edge) =>
          (edge.source === deviceId && edge.target === gateway.id) ||
          (edge.source === gateway.id && edge.target === deviceId),
      ),
    edge =
      gateway && !hasLink && topology.edges.length < 10000
        ? { id: randomUUID(), source: deviceId, target: gateway.id, label: 'Gateway route' }
        : null
  if (edge) topology = { ...topology, edges: [...topology.edges, edge] }
  const saved =
    topology === current.topology
      ? current
      : store.write(
          { source: 'inventory', topology, monitoring },
          current.revision,
          item.status === 'added' ? undefined : () => store.discoveryAction(id, 'added', deviceId),
        )
  return {
    ...saved,
    discoveryLink: edge ? { label: gateway.data.label || gateway.data.ip } : null,
    promotedRouter,
  }
}
