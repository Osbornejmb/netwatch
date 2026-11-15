import { NODE_MAX_WIDTH as CARD_WIDTH, NODE_HEIGHT as CARD_HEIGHT } from './nodes/dimensions.js'
import { crosses } from './nodes/edgeRoute.js'
const COLUMN_GAP = 20
const ROW_GAP = 24
const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const componentWidth = (levels, sizes) => {
  let width = 0
  for (const level of levels)
    for (const id of level) {
      const measured = sizes?.[id]?.width
      if (!(measured > 0) || !Number.isFinite(measured)) return CARD_WIDTH
      width = Math.max(width, measured)
    }
  return width
}

function layoutLevels(nodes, edges, centerId) {
  if (!nodes.length) return []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const neighbors = new Map(nodes.map((node) => [node.id, new Set()]))
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
        if (!visited.has(id)) {
          visited.add(id)
          ids.push(id)
        }
      }
    }
    const root = ids.includes(centerId)
      ? centerId
      : [...ids].sort(
          (a, b) =>
            Number(byId.get(b).type === 'router') - Number(byId.get(a).type === 'router') ||
            neighbors.get(b).size - neighbors.get(a).size ||
            compareIds(a, b),
        )[0]
    const levels = [[root]],
      discovered = new Set([root]),
      children = new Map()
    for (let depth = 0; levels[depth]?.length; depth++) {
      const next = []
      for (const parent of levels[depth])
        for (const child of [...neighbors.get(parent)].sort(compareIds)) {
          if (!discovered.has(child)) {
            discovered.add(child)
            if (!children.has(parent)) children.set(parent, [])
            children.get(parent).push(child)
            next.push(child)
          }
        }
      if (next.length) levels.push(next)
    }
    const weights = new Map()
    for (let depth = levels.length - 1; depth >= 0; depth--)
      for (const id of levels[depth])
        weights.set(id, children.get(id)?.reduce((sum, child) => sum + weights.get(child), 0) ?? 1)
    const hasCycles = ids.reduce((sum, id) => sum + neighbors.get(id).size, 0) > 2 * (ids.length - 1)
    components.push({ levels, children, weights, hasCycles })
  }
  return components
}

function packLayout(nodes, layouts) {
  const components = layouts.map((positions) => {
    const values = [...positions.values()]
    const minX = Math.min(...values.map((p) => p.x)),
      minY = Math.min(...values.map((p) => p.y))
    return {
      positions,
      minX,
      minY,
      width: Math.max(...values.map((p) => p.x)) - minX + CARD_WIDTH,
      height: Math.max(...values.map((p) => p.y)) - minY + CARD_HEIGHT,
    }
  })
  if (!components.length) return []
  // Pack disconnected components without drawing invented connecting links.
  const gap = 32
  const rowWidth = Math.max(
    ...components.map((c) => c.width),
    Math.sqrt(components.reduce((sum, c) => sum + (c.width + gap) * (c.height + gap), 0)),
  )
  const positions = new Map()
  let x = 0,
    y = 0,
    rowHeight = 0
  for (const component of components) {
    if (x && x + component.width > rowWidth) {
      x = 0
      y += rowHeight + gap
      rowHeight = 0
    }
    for (const [id, position] of component.positions)
      positions.set(id, { x: x + position.x - component.minX, y: y + position.y - component.minY })
    x += component.width + gap
    rowHeight = Math.max(rowHeight, component.height)
  }
  return nodes.map((node) => ({ ...node, position: positions.get(node.id) }))
}

// Display-only positions. Link direction, observations and saved coordinates do not affect layout.
export function tidyLayout(nodes, edges, sizes) {
  return packLayout(
    nodes,
    layoutLevels(nodes, edges, '').map((component) => tidyComponent(component, sizes)),
  )
}

function tidyComponent({ levels, children, weights }, sizes) {
  const root = levels[0][0]
  const positions = new Map()
  const columnWidth = componentWidth(levels, sizes) + COLUMN_GAP
  // shortcut: wrap broad trees to bound canvas width, use separate branch columns where they fit.
  if (levels.length > 2 && weights.get(root) * columnWidth <= 3600) {
    const blocks = new Map()
    const rowHeight = CARD_HEIGHT + 2 * ROW_GAP
    for (let depth = levels.length - 1; depth >= 0; depth--) {
      for (const id of levels[depth]) {
        const peers = children.get(id) ?? []
        const leaves = peers.filter((child) => !children.has(child))
        const branches = peers.filter((child) => children.has(child))
        const columns = leaves.length <= 4 ? leaves.length : Math.ceil(Math.sqrt(leaves.length))
        const width = Math.max(
          1,
          branches.reduce((sum, child) => sum + blocks.get(child).width, columns),
        )
        blocks.set(id, { leaves, branches, columns, width })
      }
    }
    const origins = new Map([[root, { x: 0, y: 0 }]])
    for (const level of levels) {
      for (const id of level) {
        const { x, y } = origins.get(id)
        const { leaves, branches, columns, width } = blocks.get(id)
        positions.set(id, {
          x: x + ((width - 1) * columnWidth) / 2,
          y,
        })
        leaves.forEach((child, index) => {
          origins.set(child, {
            x: x + (index % columns) * columnWidth,
            y: y + (1 + Math.floor(index / columns)) * rowHeight,
          })
        })
        let offset = x + columns * columnWidth
        for (const child of branches) {
          origins.set(child, { x: offset, y: y + rowHeight })
          offset += blocks.get(child).width * columnWidth
        }
      }
    }
    return positions
  }
  const count = levels.reduce((sum, level) => sum + level.length, 0)
  const columns = Math.max(1, Math.ceil(Math.sqrt((count * (CARD_HEIGHT + ROW_GAP)) / columnWidth)))
  let row = 0
  for (const level of levels) {
    const width = Math.min(columns, level.length)
    level.forEach((id, index) =>
      positions.set(id, {
        x: ((index % columns) - (width - 1) / 2) * columnWidth,
        y: (row + Math.floor(index / columns)) * (CARD_HEIGHT + ROW_GAP),
      }),
    )
    row += Math.ceil(level.length / columns)
  }
  return positions
}

// Find the closest ring radius that clears every card, including earlier rings.
function clearRingRadius(directions, positions, minimum, cardWidth) {
  const width = cardWidth + COLUMN_GAP,
    height = CARD_HEIGHT + ROW_GAP
  let radius = minimum
  for (let a = 0; a < directions.length; a++)
    for (let b = a + 1; b < directions.length; b++) {
      radius = Math.max(
        radius,
        Math.min(
          width / Math.abs(directions[a].x - directions[b].x),
          height / Math.abs(directions[a].y - directions[b].y),
        ),
      )
    }
  const interval = (direction, center, extent) => {
    if (Math.abs(direction) < 1e-10) return Math.abs(center) < extent ? [-Infinity, Infinity] : [Infinity, -Infinity]
    const a = (center - extent) / direction,
      b = (center + extent) / direction
    return [Math.min(a, b), Math.max(a, b)]
  }
  const blocked = []
  for (const direction of directions)
    for (const position of positions.values()) {
      const x = interval(direction.x, position.x + cardWidth / 2, width)
      const y = interval(direction.y, position.y + CARD_HEIGHT / 2, height)
      const enter = Math.max(0, x[0], y[0]),
        exit = Math.min(x[1], y[1])
      if (exit > radius && enter < exit) blocked.push([enter, exit])
    }
  blocked.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  for (const [enter, exit] of blocked) if (radius + 1e-6 >= enter && radius < exit) radius = exit
  return radius + 1e-6
}

export function radialLayout(nodes, edges, centerId = '', sizes) {
  const gateways = new Map()
  for (const edge of edges) {
    if (edge.label !== 'Gateway route') continue
    if (!gateways.has(edge.target)) gateways.set(edge.target, new Set())
    gateways.get(edge.target).add(edge.source)
  }
  const layouts = layoutLevels(nodes, edges, centerId).map((component) => {
    const { levels, children, weights, hasCycles } = component
    const root = levels[0][0]
    const cardWidth = componentWidth(levels, sizes)
    const clients = gateways.get(root)
    if (
      levels.length === 2 &&
      (levels[1].length >= 24 || (!centerId && levels[1].length > 4 && levels[1].every((id) => clients?.has(id))))
    ) {
      const peers = levels[1]
      const half = Math.max(
        1,
        Math.ceil(Math.sqrt((peers.length * (CARD_HEIGHT + ROW_GAP)) / (cardWidth + COLUMN_GAP)) / 2),
      )
      const columns = 2 * half + 1
      const slots = []
      const rows = Math.ceil((peers.length + 1) / columns)
      for (let row = -Math.floor(rows / 2); row <= Math.floor(rows / 2); row++) {
        for (let column = -half; column <= half; column++) {
          if (row || column)
            slots.push({ x: (column + (row % 2) / 2) * (cardWidth + COLUMN_GAP), y: row * (CARD_HEIGHT + ROW_GAP) })
        }
      }
      slots.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
      const origin = { x: cardWidth / 2, y: CARD_HEIGHT / 2 }
      const center = (slot) => ({ x: slot.x + origin.x, y: slot.y + origin.y })
      const box = (slot) => ({ ...slot, width: cardWidth, height: CARD_HEIGHT })
      const chosen = []
      for (const slot of slots.slice(0, peers.length + Math.min(half, 2))) {
        if (chosen.length === peers.length) break
        if (
          chosen.every((peer) => !crosses(origin, center(slot), box(peer)) && !crosses(origin, center(peer), box(slot)))
        )
          chosen.push(slot)
      }
      const remaining = slots.filter((slot) => !chosen.includes(slot))
      return new Map([[root, { x: 0, y: 0 }], ...peers.map((id, i) => [id, chosen[i] ?? remaining[i - chosen.length]])])
    }
    const positions = new Map([[root, { x: -cardWidth / 2, y: -CARD_HEIGHT / 2 }]])
    const firstRing = levels[1]
    if (!firstRing) return positions
    const start = -Math.PI / 2 - Math.PI / firstRing.length
    const sectors = new Map([[root, [start, start + 2 * Math.PI]]])
    const cardRatio = (cardWidth + COLUMN_GAP) / (CARD_HEIGHT + ROW_GAP)
    const horizontalScale = firstRing.length <= 4 && weights.size <= 12 ? cardRatio : Math.sqrt(cardRatio)
    const direction = (angle) => ({ x: Math.cos(angle) * horizontalScale, y: Math.sin(angle) })
    let radius = 0
    for (let depth = 1; depth < levels.length; depth++) {
      const ring = levels[depth]
      for (const parent of levels[depth - 1]) {
        const [from, to] = sectors.get(parent)
        const span = depth === 1 ? to - from : Math.min(to - from, (2 * Math.PI) / 3)
        let cursor = (from + to - span) / 2
        for (const child of children.get(parent) ?? []) {
          const end = cursor + (span * weights.get(child)) / weights.get(parent)
          sectors.set(child, [cursor, end])
          cursor = end
        }
      }
      const bandCount = ring.length <= 12 ? 1 : Math.ceil(Math.sqrt(ring.length / 8))
      const bands = Array.from({ length: bandCount }, () => [])
      ring.forEach((id, index) => bands[index % bandCount].push(id))
      for (const band of bands) {
        const angles = band.map((id) => {
          const [from, to] = sectors.get(id)
          return (from + to) / 2
        })
        let directions = angles.map(direction)
        const minimum = radius + CARD_HEIGHT + ROW_GAP
        radius = clearRingRadius(directions, positions, minimum, cardWidth)
        // Keep branch order, but open the angles if a crowded sector would stretch the whole map.
        if (weights.size > 12 && band.length > 1 && radius > minimum + cardWidth * Math.sqrt(band.length)) {
          const step = (2 * Math.PI) / band.length
          const start = angles.reduce((sum, angle, index) => sum + angle - index * step, 0) / band.length
          const spread = angles.map((_, index) => direction(start + index * step))
          const compactRadius = clearRingRadius(spread, positions, minimum, cardWidth)
          if (compactRadius < radius) {
            directions = spread
            radius = compactRadius
          }
        }
        // shortcut: pack very wide cyclic components with the same breadth levels instead of reserving more ring space.
        if (hasCycles && weights.size >= 32 && 2 * radius * horizontalScale > 3600)
          return tidyComponent(component, sizes)
        band.forEach((id, index) =>
          positions.set(id, {
            x: radius * directions[index].x - cardWidth / 2,
            y: radius * directions[index].y - CARD_HEIGHT / 2,
          }),
        )
      }
    }
    return positions
  })
  return packLayout(nodes, layouts)
}

// Direct peers only; both incoming and outgoing configured links count.
export function connectedDevices(deviceId, nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id))
  const neighbors = new Set()
  if (!ids.has(deviceId)) return neighbors
  for (const edge of edges) {
    const peer = edge.source === deviceId ? edge.target : edge.target === deviceId ? edge.source : null
    if (peer && peer !== deviceId && ids.has(peer)) neighbors.add(peer)
  }
  return neighbors
}
