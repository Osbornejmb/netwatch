import { normalizeAddress } from './inventory.js'
import { physicalConnectionKey } from './connections.js'
import { validateTopology } from './topology.js'

export function nextDiscoveryPosition(nodes) {
  const occupied = new Set(
    nodes.map(({ position }) => JSON.stringify([Math.round(position.x / 240), Math.round(position.y / 160)])),
  )
  for (let i = 0; i <= nodes.length; i++) {
    const x = i % 8,
      y = Math.floor(i / 8)
    if (!occupied.has(JSON.stringify([x, y]))) return { x: x * 240, y: y * 160 }
  }
}

export function mergeDiscoveryDraft(draft, patch) {
  const nodes = [...draft.nodes]
  const ids = new Map(nodes.map((node) => [node.id, node]))
  const chassis = new Map(nodes.filter((node) => node.chassisKey).map((node) => [node.chassisKey, node.id]))
  const addresses = new Map(
    nodes.filter((node) => node.data.ip).map((node) => [normalizeAddress(node.data.ip), node.id]),
  )
  for (const node of patch.nodes) {
    const current = ids.get(node.id)
    if (node.chassisKey && chassis.has(node.chassisKey) && chassis.get(node.chassisKey) !== node.id)
      throw Error('This device already has a different entry in your draft.')
    if (current) {
      if (node.chassisKey && current.chassisKey && current.chassisKey !== node.chassisKey)
        throw Error('The proposed device conflicts with your draft.')
      if (!current.chassisKey && node.chassisKey) {
        nodes[nodes.indexOf(current)] = { ...current, chassisKey: node.chassisKey }
        chassis.set(node.chassisKey, node.id)
      }
      continue
    }
    const ip = normalizeAddress(node.data.ip)
    if (ip && addresses.has(ip)) throw Error('The proposed address already belongs to a device in your draft.')
    const added = { ...node, position: nextDiscoveryPosition(nodes) }
    nodes.push(added)
    ids.set(node.id, added)
    if (ip) addresses.set(ip, node.id)
    if (node.chassisKey) chassis.set(node.chassisKey, node.id)
  }
  const edges = [...draft.edges]
  const keys = new Set(edges.map(physicalConnectionKey))
  for (const link of patch.edges) {
    const key = physicalConnectionKey(link)
    if (keys.has(key)) continue
    keys.add(key)
    edges.push(link)
  }
  return validateTopology({ ...draft, nodes, edges })
}
