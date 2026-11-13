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

// A short tether permits inspection gestures without moving devices into neighboring cards.
export function constrainDrag(id, position, nodes, positions = {}) {
  const node = nodes.find(node => node.id === id)
  if (!node || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null
  const dx = position.x - node.position.x, dy = position.y - node.position.y
  const scale = Math.min(1, 64 / (Math.hypot(dx, dy) || 1))
  const candidate = { x: node.position.x + dx * scale, y: node.position.y + dy * scale }
  return nodes.some(other => {
    const otherPosition = positions[other.id] || other.position
    return other.id !== id && Math.abs(otherPosition.x - candidate.x) < NODE_MAX_WIDTH + 8 && Math.abs(otherPosition.y - candidate.y) < NODE_HEIGHT + 8
  }) ? null : candidate
}
