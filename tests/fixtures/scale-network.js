// Synthetic documentation addresses only. Never pass this fixture to probes.
export function createScaleNetwork(now) {
  const nodes = [], edges = [], checks = {}
  const idAt = index => index === 0 ? 'core-a' : `scale-${String(index + 1).padStart(3, '0')}`
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const index = row * 10 + col
      const id = idAt(index)
      nodes.push({ id, type: col === 0 ? 'router' : 'switch', position: { x: col * 280, y: row * 170 }, data: { label: `QA-${col === 0 ? 'ROUTER' : 'SWITCH'}-${String(index + 1).padStart(3, '0')}`, ip: `198.51.100.${index + 1}`, description: 'Synthetic scale fixture — no live observations or probes' } })
      if (col !== 2) checks[id] = { status: col === 0 ? 'down' : 'up', checkedAt: new Date(now - (col === 1 ? 180_000 : 15_000)).toISOString() }
      if (col < 9) edges.push({ id: `${id}-right`, source: id, target: idAt(index + 1) })
      if (row < 9) edges.push({ id: `${id}-below`, source: id, target: idAt(index + 10) })
    }
  }
  return { nodes, edges, checks }
}
