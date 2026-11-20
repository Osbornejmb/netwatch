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
  const indexes = new Map(edges.map(({ id }, index) => [id, index]))
  const replacements = new Map((patch.replaceEdges ?? []).map((edge) => [edge.id, edge]))
  const same = (a, b) =>
    a?.source === b.source && a.target === b.target && a.label === b.label && a.role === b.role && !a.uplink
  for (const link of patch.edges) {
    const key = physicalConnectionKey(link)
    const index = indexes.get(link.id)
    const previous = replacements.get(link.id)
    if (previous) {
      const current = edges[index]
      if (same(current, link)) continue
      if (
        !same(current, previous) ||
        draft.groups?.some((group) => group.links.includes(link.id)) ||
        (physicalConnectionKey(current) !== key && keys.has(key))
      )
        throw Error('This connection changed in your draft. Review the existing link before applying the port hint.')
      keys.delete(physicalConnectionKey(current))
      keys.add(key)
      edges[index] = link
    } else if (index === undefined && !keys.has(key)) {
      indexes.set(link.id, edges.length)
      keys.add(key)
      edges.push(link)
    }
  }
  return validateTopology({ ...draft, nodes, edges })
}
