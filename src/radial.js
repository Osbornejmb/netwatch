import { NODE_MAX_WIDTH as CARD_WIDTH, NODE_HEIGHT as CARD_HEIGHT } from './nodes/dimensions.js'
const COLUMN_GAP = 32
const ROW_GAP = 48
const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0

function layoutLevels(nodes, edges, centerId) {
  if (!nodes.length) return []
  const byId = new Map(nodes.map(node => [node.id, node]))
  const neighbors = new Map(nodes.map(node => [node.id, new Set()]))
  for (const edge of edges) {
    if (edge.source !== edge.target && byId.has(edge.source) && byId.has(edge.target)) {
      neighbors.get(edge.source).add(edge.target)
      neighbors.get(edge.target).add(edge.source)
    }
  }
  const visited = new Set()
  const components = []
  for (const start of [...byId.keys()].sort(compareIds)) {
    if (visited.has(start)) continue
    const ids = [start]
    visited.add(start)
    for (let index = 0; index < ids.length; index++) {
      for (const id of [...neighbors.get(ids[index])].sort(compareIds)) {
        if (!visited.has(id)) { visited.add(id); ids.push(id) }
      }
    }
    const root = ids.includes(centerId) ? centerId : [...ids].sort((a, b) =>
      Number(byId.get(b).type === 'router') - Number(byId.get(a).type === 'router') ||
      neighbors.get(b).size - neighbors.get(a).size || compareIds(a, b))[0]
    const levels = [[root]], discovered = new Set([root])
    for (let depth = 0; levels[depth]?.length; depth++) {
      const next = []
      for (const parent of levels[depth]) for (const child of [...neighbors.get(parent)].sort(compareIds)) {
        if (!discovered.has(child)) { discovered.add(child); next.push(child) }
      }
      if (next.length) levels.push(next)
    }
    components.push(levels)
  }
  return components
}

function packLayout(nodes, layouts) {
  const components = layouts.map(positions => {
    const values = [...positions.values()]
    const minX = Math.min(...values.map(p => p.x)), minY = Math.min(...values.map(p => p.y))
    return { positions, minX, minY,
      width: Math.max(...values.map(p => p.x)) - minX + CARD_WIDTH,
      height: Math.max(...values.map(p => p.y)) - minY + CARD_HEIGHT }
  })
  if (!components.length) return []
  // Pack disconnected components without drawing invented connecting links.
  const gap = 64
  const rowWidth = Math.max(...components.map(c => c.width), Math.sqrt(components.reduce((sum, c) => sum + (c.width + gap) * (c.height + gap), 0)))
  const positions = new Map()
  let x = 0, y = 0, rowHeight = 0
  for (const component of components) {
    if (x && x + component.width > rowWidth) { x = 0; y += rowHeight + gap; rowHeight = 0 }
    for (const [id, position] of component.positions) positions.set(id, { x: x + position.x - component.minX, y: y + position.y - component.minY })
    x += component.width + gap
    rowHeight = Math.max(rowHeight, component.height)
  }
  return nodes.map(node => ({ ...node, position: positions.get(node.id) }))
}

// Display-only positions. Link direction, observations and saved coordinates do not affect layout.
export function tidyLayout(nodes, edges) {
  const layouts = layoutLevels(nodes, edges, '').map(levels => {
    const count = levels.reduce((sum, level) => sum + level.length, 0)
    const columns = Math.max(1, Math.ceil(Math.sqrt(count * (CARD_HEIGHT + ROW_GAP) / (CARD_WIDTH + COLUMN_GAP))))
    const positions = new Map()
    let row = 0
    for (const level of levels) {
      const width = Math.min(columns, level.length)
      level.forEach((id, index) => positions.set(id, {
        x: (index % columns - (width - 1) / 2) * (CARD_WIDTH + COLUMN_GAP),
        y: (row + Math.floor(index / columns)) * (CARD_HEIGHT + ROW_GAP),
      }))
      row += Math.ceil(level.length / columns)
    }
    return positions
  })
  return packLayout(nodes, layouts)
}

// Find the closest ring radius that clears every card, including earlier rings.
function clearRingRadius(directions, positions, minimum) {
  const width = CARD_WIDTH + COLUMN_GAP, height = CARD_HEIGHT + ROW_GAP
  let radius = minimum
  for (let a = 0; a < directions.length; a++) for (let b = a + 1; b < directions.length; b++) {
    radius = Math.max(radius, Math.min(width / Math.abs(directions[a].x - directions[b].x), height / Math.abs(directions[a].y - directions[b].y)))
  }
  const interval = (direction, center, extent) => {
    if (Math.abs(direction) < 1e-10) return Math.abs(center) < extent ? [-Infinity, Infinity] : [Infinity, -Infinity]
    const a = (center - extent) / direction, b = (center + extent) / direction
    return [Math.min(a, b), Math.max(a, b)]
  }
  const blocked = []
  for (const direction of directions) for (const position of positions.values()) {
    const x = interval(direction.x, position.x + CARD_WIDTH / 2, width)
    const y = interval(direction.y, position.y + CARD_HEIGHT / 2, height)
    const enter = Math.max(0, x[0], y[0]), exit = Math.min(x[1], y[1])
    if (exit > radius && enter < exit) blocked.push([enter, exit])
  }
  blocked.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  for (const [enter, exit] of blocked) if (radius + 1e-6 >= enter && radius < exit) radius = exit
  return radius + 1e-6
}

export function radialLayout(nodes, edges, centerId = '') {
  const layouts = layoutLevels(nodes, edges, centerId).map(levels => {
    const root = levels[0][0]
    const positions = new Map([[root, { x: -CARD_WIDTH / 2, y: -CARD_HEIGHT / 2 }]])
    let radius = 0
    for (let depth = 1; depth < levels.length; depth++) {
      const ring = levels[depth]
      const directions = ring.map((_, index) => {
        const angle = -Math.PI / 2 + 2 * Math.PI * index / ring.length
        return { x: Math.cos(angle), y: Math.sin(angle) }
      })
      radius = clearRingRadius(directions, positions, radius + CARD_HEIGHT + ROW_GAP)
      ring.forEach((id, index) => positions.set(id, {
        x: radius * directions[index].x - CARD_WIDTH / 2,
        y: radius * directions[index].y - CARD_HEIGHT / 2,
      }))
    }
    return positions
  })
  return packLayout(nodes, layouts)
}

export function radialHandles(source, target) {
  const dx = target.x - source.x, dy = target.y - source.y
  const side = Math.abs(dx) / CARD_WIDTH > Math.abs(dy) / CARD_HEIGHT ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top')
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
  return { sourceHandle: `radial-source-${side}`, targetHandle: `radial-target-${opposite[side]}` }
}

// Direct peers only; both incoming and outgoing configured links count.
export function connectedDevices(deviceId, nodes, edges) {
  const ids = new Set(nodes.map(node => node.id))
  const neighbors = new Set()
  if (!ids.has(deviceId)) return neighbors
  for (const edge of edges) {
    const peer = edge.source === deviceId ? edge.target : edge.target === deviceId ? edge.source : null
    if (peer && peer !== deviceId && ids.has(peer)) neighbors.add(peer)
  }
  return neighbors
}
