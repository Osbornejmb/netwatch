const BUFFER = 3

const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

function port(box, toward) {
  const point = center(box)
  const dx = toward.x - point.x, dy = toward.y - point.y
  const scale = 1 / Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2))
  return Number.isFinite(scale) ? { x: point.x + dx * scale, y: point.y + dy * scale } : point
}

export function crosses(a, b, box) {
  const interval = (start, end, min, max) => {
    if (start === end) return start > min && start < max ? [-Infinity, Infinity] : [1, 0]
    const first = (min - start) / (end - start), last = (max - start) / (end - start)
    return [Math.min(first, last), Math.max(first, last)]
  }
  const x = interval(a.x, b.x, box.x, box.x + box.width)
  const y = interval(a.y, b.y, box.y, box.y + box.height)
  return Math.max(0, x[0], y[0]) < Math.min(1, x[1], y[1])
}

export function edgeRoute(source, target, cards) {
  const start = port(source, center(target)), end = port(target, center(source))
  if (!cards.some(box => box !== source && box !== target && crosses(start, end, box))) return [start, end]

  // Route through clear rectangle corners only when a card blocks the direct link.
  const obstacles = cards.map(box => box === source || box === target ? box : ({
    x: box.x - BUFFER, y: box.y - BUFFER, width: box.width + 2 * BUFFER, height: box.height + 2 * BUFFER
  }))
  const points = [start, end]
  const added = new Set()
  const distances = [0, Infinity], previous = [], visited = new Set()
  while (true) {
    let current = -1
    for (let i = 0; i < points.length; i++) {
      if (!visited.has(i) && distances[i] < (distances[current] ?? Infinity)) current = i
    }
    if (current < 0) return [start, end] // shortcut: keep a visible link if no buffered route exists.
    if (current === 1) {
      const route = []
      for (let i = current; i !== undefined; i = previous[i]) route.unshift(points[i])
      return route
    }
    visited.add(current)
    const a = points[current]
    for (let i = 1; i < points.length; i++) {
      if (visited.has(i)) continue
      const b = points[i]
      const blocker = obstacles.find(box => crosses(a, b, box))
      if (blocker) {
        if (!added.has(blocker)) {
          added.add(blocker)
          for (const x of [blocker.x, blocker.x + blocker.width]) {
            for (const y of [blocker.y, blocker.y + blocker.height]) {
              points.push({ x, y })
              distances.push(Infinity)
            }
          }
          visited.clear()
        }
        continue
      }
      const distance = distances[current] + Math.hypot(b.x - a.x, b.y - a.y)
      if (distance < distances[i]) {
        distances[i] = distance
        previous[i] = current
      }
    }
  }
}
