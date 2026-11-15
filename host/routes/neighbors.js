import { createHash, randomUUID } from 'node:crypto'
import { connectionKey } from '../../src/connections.js'
import { invalid } from '../store.js'

export function readNeighbors({ store, interfaces, id }) {
  const { topology, revision } = store.read()
  if (!topology.nodes.some((node) => node.id === id)) throw invalid('Device not found.', 404)
  return {
    revision,
    ...(interfaces?.neighbors?.(id) ?? { state: 'unavailable', neighbors: [] }),
    peers: topology.nodes
      .filter((node) => node.id !== id)
      .map(({ id, data }) => ({ id, label: data.label, ip: data.ip })),
  }
}

export function applyNeighbor({ store, interfaces, id, body }) {
  const current = store.read()
  if (body?.baseRevision !== current.revision) throw invalid('Inventory changed.', 409)
  const { topology, monitoring, revision } = current
  const source = topology.nodes.find((node) => node.id === id)
  if (!source) throw invalid('Device not found.', 404)
  const sample = interfaces?.neighbors?.(id)
  const neighbor = sample?.neighbors.find((row) => row.id === body.neighborId)
  if (!neighbor || !['current', 'partial'].includes(sample.state) || sample.checkedAt !== body.checkedAt)
    throw invalid('Neighbor observations changed.', 409)
  const nodes = [...topology.nodes]
  let target
  if (typeof body.peerId === 'string') {
    target = nodes.find((node) => node.id === body.peerId && node.id !== id)
    if (!target) throw invalid('Choose a saved peer.')
  } else {
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    if (body.peerId !== null || !label || label.length > 100 || !['router', 'switch'].includes(body.type))
      throw invalid('Choose a name and device type.')
    const peerId =
      'lldp-' +
      createHash('sha256')
        .update(JSON.stringify([id, neighbor.chassisKey]))
        .digest('hex')
    target = nodes.find((node) => node.id === peerId)
    if (!target) {
      target = {
        id: peerId,
        type: body.type,
        position: { ...source.position, x: source.position.x + (source.position.x <= 0 ? 320 : -320) },
        data: { label, ip: '', description: '' },
      }
      nodes.push(target)
    }
  }
  const link = { source: id, target: target.id }
  if (topology.edges.some((edge) => connectionKey(edge) === connectionKey(link))) return { revision, added: false }
  const edge = {
    ...link,
    id: randomUUID(),
    label: `LLDP · Port ${neighbor.localPort} ↔ ${neighbor.remotePort}`.slice(0, 100),
  }
  const saved = store.write(
    { source: 'inventory', topology: { ...topology, nodes, edges: [...topology.edges, edge] }, monitoring },
    revision,
  )
  return { revision: saved.revision, added: true }
}
