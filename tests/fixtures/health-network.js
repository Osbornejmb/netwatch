// Test-only reachability fixture; never included in the application.
export function createHealthNetwork(now) {
  const nodes = [
    { id: 'core-a', type: 'router', position: { x: 290, y: 0 }, data: { label: 'CORE-ROUTER-01', ip: '192.0.2.1', description: 'Test primary core router' } },
    { id: 'core-b', type: 'router', position: { x: 640, y: 0 }, data: { label: 'CORE-ROUTER-02', ip: '192.0.2.2', description: 'Test secondary core router' } },
  ]
  const edges = []
  for (let group = 0; group < 3; group++) {
    const id = `dist-${group}`
    nodes.push({ id, type: 'switch', position: { x: 90 + group * 380, y: 190 }, data: { label: `DISTRIBUTION-0${group + 1}`, ip: `192.0.2.${10 + group}`, description: `Test distribution group ${group + 1}` } })
    for (const source of ['core-a', 'core-b']) edges.push({ id: `${source}-${id}`, source, target: id, targetHandle: source === 'core-a' ? 'uplink-a' : 'uplink-b' })
    for (let row = 0; row < 3; row++) {
      const accessId = `access-${group}-${row}`
      nodes.push({ id: accessId, type: 'switch', position: { x: 130 + group * 380, y: 370 + row * 135 }, data: { label: `ACCESS-${group + 1}-0${row + 1}`, ip: `192.0.2.${30 + group * 3 + row}`, description: `Test access switch · Group ${group + 1}` } })
      edges.push({ id: `${id}-${accessId}`, source: id, target: accessId, sourceHandle: 'fan-out', targetHandle: 'fan-in' })
    }
  }
  const checks = Object.fromEntries(nodes.map(node => [node.id, { status: 'up', checkedAt: new Date(now - 15_000).toISOString(), latencyMs: 3 }]))
  checks['access-2-1'] = { status: 'down', checkedAt: new Date(now - 15_000).toISOString() }
  checks['access-1-2'] = { status: 'up', checkedAt: new Date(now - 180_000).toISOString(), latencyMs: 5 }
  delete checks['access-0-2']
  return { nodes, edges, checks }
}
