import test from 'node:test'
import assert from 'node:assert/strict'
import { tidyLayout } from '../src/radial.js'
import { NODE_MAX_WIDTH, NODE_HEIGHT } from '../src/nodes/dimensions.js'
import { createScaleNetwork } from './fixtures/scale-network.js'
const node = (id, type = 'switch') => ({ id, type, position: { x: 9999, y: -9999 }, data: { label: id, ip: '' } })
const edge = (source, target) => ({ id: source + target, source, target })
const positions = nodes => Object.fromEntries(nodes.map(n => [n.id, n.position]))
const assertSeparated = nodes => {
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    assert.ok(Math.abs(nodes[a].position.x - nodes[b].position.x) >= NODE_MAX_WIDTH || Math.abs(nodes[a].position.y - nodes[b].position.y) >= NODE_HEIGHT, nodes[a].id + ' overlaps ' + nodes[b].id)
  }
}

test('tidy layout puts connected peers close despite distant saved positions, without mutating inventory', () => {
  const nodes = [node('router', 'router'), node('a'), node('b'), node('leaf')]
  const edges = [edge('router', 'a'), edge('b', 'router'), edge('a', 'leaf')]
  const before = structuredClone({ nodes, edges })
  const layout = tidyLayout(nodes, edges), byId = positions(layout)
  assertSeparated(layout)
  assert.ok(byId.router.y < byId.a.y && byId.a.y < byId.leaf.y)
  for (const e of edges) assert.ok(Math.hypot(byId[e.source].x - byId[e.target].x, byId[e.source].y - byId[e.target].y) < 450)
  assert.deepEqual({ nodes, edges }, before)
  assert.deepEqual(positions(tidyLayout([...nodes].reverse(), edges.map(e => ({ ...e, source: e.target, target: e.source })).reverse())), byId)
  assert.deepEqual(tidyLayout([], []), [])
  assert.deepEqual(tidyLayout([node('one')], [])[0].position, { x: 0, y: 0 })
})

test('tidy layout avoids collisions in a cyclic mesh, a 100-spoke star and disconnected components', () => {
  const fixture = createScaleNetwork(Date.now())
  const star = fixture.nodes.slice(1).map(n => edge(fixture.nodes[0].id, n.id))
  for (const edges of [fixture.edges, star, []]) {
    const layout = tidyLayout(fixture.nodes, edges)
    assertSeparated(layout)
    assert.ok(layout.every(n => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)))
    const width = Math.max(...layout.map(n => n.position.x)) - Math.min(...layout.map(n => n.position.x))
    const height = Math.max(...layout.map(n => n.position.y)) - Math.min(...layout.map(n => n.position.y))
    assert.ok(width < 4000 && height < 4000, 'Compact component packing')
  }
})
