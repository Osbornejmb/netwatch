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

export function pushNodes(id, position, nodes, positions = {}, sizes = {}) {
  const node = nodes.find(node => node.id === id)
  if (!node || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return positions
  const next = Object.assign(Object.create(null), positions)
  const at = node => next[node.id] || node.position
  for (const [axis, cross, size, crossSize, fallback, crossFallback] of [
    ['x', 'y', 'width', 'height', NODE_MAX_WIDTH, NODE_HEIGHT],
    ['y', 'x', 'height', 'width', NODE_HEIGHT, NODE_MAX_WIDTH],
  ]) {
    const start = at(node)[axis]
    const direction = Math.sign(position[axis] - start)
    if (!direction) continue
    const peers = nodes.filter(peer => peer.id !== id && direction * (at(peer)[axis] - start) >= 0)
    peers.sort((a, b) => direction * (at(a)[axis] - at(b)[axis]))
    const ordered = [node, ...peers]
    const pushed = new Set([id])
    next[id] = { ...at(node), [axis]: position[axis] }
    for (let i = 0; i < ordered.length; i++) {
      const pusher = ordered[i]
      if (!pushed.has(pusher.id)) continue
      const from = at(pusher)
      const extent = sizes[pusher.id]?.[size] ?? fallback
      const crossExtent = sizes[pusher.id]?.[crossSize] ?? crossFallback
      for (let j = i + 1; j < ordered.length; j++) {
        const peer = ordered[j], point = at(peer)
        const peerExtent = sizes[peer.id]?.[size] ?? fallback
        const peerCrossExtent = sizes[peer.id]?.[crossSize] ?? crossFallback
        if (point[cross] >= from[cross] + crossExtent || point[cross] + peerCrossExtent <= from[cross]) continue
        const boundary = direction > 0 ? from[axis] + extent + 8 : from[axis] - peerExtent - 8
        if (direction * (boundary - point[axis]) > 0) {
          pushed.add(peer.id)
          next[peer.id] = { ...point, [axis]: boundary }
        }
      }
    }
  }
  return { ...next }
}

// Each connection gets half its arranged length as slack, with room for small groups.
export function withinLinkReach(nodes, edges, positions) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  return edges.every(edge => {
    const source = byId.get(edge.source), target = byId.get(edge.target)
    if (!source || !target) return false
    const a = Object.hasOwn(positions, source.id) ? positions[source.id] : source.position
    const b = Object.hasOwn(positions, target.id) ? positions[target.id] : target.position
    const arranged = Math.hypot(source.position.x - target.position.x, source.position.y - target.position.y)
    return Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y) &&
      Math.hypot(a.x - b.x, a.y - b.y) <= Math.max(NODE_MAX_WIDTH + GAP, arranged * 1.5)
  })
}
