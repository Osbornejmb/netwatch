import { NODE_MAX_WIDTH, NODE_HEIGHT } from './dimensions.js'

const GAP = 40
export function gridPosition(index) {
  return { x: (index % 5) * (NODE_MAX_WIDTH + GAP), y: Math.floor(index / 5) * (NODE_HEIGHT + GAP) }
}

export function nextFreePosition(nodes) {
  for (let index = 0; ; index++) {
    const position = gridPosition(index)
    if (nodes.every(node => Math.abs(node.position.x - position.x) >= NODE_MAX_WIDTH + GAP || Math.abs(node.position.y - position.y) >= NODE_HEIGHT + GAP)) return position
  }
}

// Reject overlapping cards while letting the pointer move freely.
export function constrainDrag(id, position, nodes, positions = {}) {
  const node = nodes.find(node => node.id === id)
  if (!node || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null
  const candidate = { x: position.x, y: position.y }
  return nodes.some(other => {
    const otherPosition = positions[other.id] || other.position
    return other.id !== id && Math.abs(otherPosition.x - candidate.x) < NODE_MAX_WIDTH + 8 && Math.abs(otherPosition.y - candidate.y) < NODE_HEIGHT + 8
  }) ? null : candidate
}

// Each connection gets half its arranged length as slack, with room for small groups.
export function withinLinkReach(nodes, edges, positions) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  return edges.every(edge => {
    const source = byId.get(edge.source), target = byId.get(edge.target)
    if (!source || !target) return false
    const a = positions[source.id] || source.position, b = positions[target.id] || target.position
    const arranged = Math.hypot(source.position.x - target.position.x, source.position.y - target.position.y)
    return Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y) &&
      Math.hypot(a.x - b.x, a.y - b.y) <= Math.max(NODE_MAX_WIDTH + GAP, arranged * 1.5)
  })
}
