import { createHash, randomUUID } from 'node:crypto'
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

export async function addDiscoveredToMap({ store, discovery, interfaces, id, body, source = 'local' }) {
  const bulk = id === undefined
  const discovered = bulk ? null : store.discoveredDevice(id)
  if (!bulk && !discovered) throw invalid('Discovered device not found.', 404)
  if (body?.baseRevision !== store.revision()) throw invalid('Inventory changed.', 409)
  let gatewayFor
  if (bulk) {
    gatewayFor = await discovery?.gatewayLookup?.()
  } else {
    const gatewayIp = await discovery?.gatewayFor?.(discovered.ip)
    gatewayFor = () => gatewayIp
  }

  // Use current records after awaiting Windows, then commit without yielding.
  const current = store.read()
  if (body.baseRevision !== current.revision) throw invalid('Inventory changed.', 409)
  const items = bulk ? store.pendingDiscovery() : [{ id, ...store.discoveredDevice(id) }]
  if (!bulk && !items[0].ip) throw invalid('Discovered device not found.', 404)
  if (bulk && pendingVersion(items) !== body.pendingVersion) throw invalid('Scan results changed.', 409)

  const topology = { ...current.topology, nodes: [...current.topology.nodes], edges: [...current.topology.edges] }
  const monitoring = { ...current.monitoring }
  const nodesById = new Map(topology.nodes.map((node) => [node.id, node]))
  const nodesByIp = new Map(topology.nodes.map((node) => [node.data.ip, node]))
  const links = new Set(topology.edges.map(connectionKey))
  const updates = []
  const routes = []
  const ports = interfaces?.switchPorts?.() ?? new Map()
  let promotedRouter = false,
    discoveryLink = null,
    addedCount = 0

  for (const item of items) {
    const gatewayIp = gatewayFor?.(item.ip)
    const isRouter = item.ip === gatewayIp || item.source === 'gateway-mac'
    let node = nodesById.get(item.savedDeviceId) ?? (item.status === 'added' ? null : nodesByIp.get(item.ip))
    if (item.status === 'added' && !node) throw invalid('The saved device is missing from the map.', 409)
    if (!node) {
      node = {
        id: randomUUID(),
        type: isRouter ? 'router' : 'switch',
        position: { x: 0, y: 0 },
        data: { label: item.hostname || item.ip, ip: item.ip, description: '' },
      }
      topology.nodes.push(node)
      nodesByIp.set(item.ip, node)
      monitoring[node.id] = source === 'local'
      addedCount++
    } else if (!bulk && item.ip === gatewayIp && node.type !== 'router') {
      const index = topology.nodes.indexOf(node)
      node = { ...node, type: 'router' }
      topology.nodes[index] = node
      nodesByIp.set(item.ip, node)
      promotedRouter = true
    }
    if (item.status !== 'added') updates.push([item.id, node.id])
    const port = !item.misses && switchPortFor(ports, node, item)
    if (port) discoveryLink = saveSwitchPortLink(topology, node, port) ?? discoveryLink
    else routes.push([node.id, gatewayIp])
  }

  for (const [deviceId, gatewayIp] of routes) {
    const gateway = nodesByIp.get(gatewayIp)
    if (gateway?.type !== 'router' || gateway.id === deviceId || topology.edges.length >= 10000) continue
    const key = connectionKey({ source: deviceId, target: gateway.id })
    if (links.has(key)) continue
    links.add(key)
    topology.edges.push({ id: randomUUID(), source: deviceId, target: gateway.id, label: 'Gateway route' })
    discoveryLink = { label: gateway.data.label || gateway.data.ip }
  }

  const saved =
    updates.length || promotedRouter || discoveryLink
      ? store.write({ source: 'inventory', topology, monitoring }, current.revision, () => {
          for (const [deviceId, nodeId] of updates) store.discoveryAction(deviceId, 'added', nodeId)
        })
      : current
  return bulk ? { addedCount, existingCount: items.length - addedCount } : { ...saved, discoveryLink, promotedRouter }
}

function pendingVersion(items) {
  return createHash('sha256').update(JSON.stringify(items)).digest('hex')
}
