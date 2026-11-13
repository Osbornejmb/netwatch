import test from 'node:test'
import assert from 'node:assert/strict'
import { gridPosition, nextFreePosition } from '../src/nodes/placement.js'
import { NODE_WIDTH, NODE_HEIGHT } from '../src/nodes/dimensions.js'

test('placement skips occupied and overlapping cells and reuses gaps', () => {
  const nodes = [{ position: { x: 0, y: 0 } }, { position: gridPosition(2) }]
  assert.deepEqual(nextFreePosition([]), gridPosition(0))
  assert.deepEqual(nextFreePosition(nodes), gridPosition(1))
  assert.deepEqual(nextFreePosition([{ position: { x: 5, y: 5 } }, nodes[1]]), gridPosition(3))
  const placed = Array.from({ length: 12 }, (_, index) => ({ position: gridPosition(index) }))
  assert.deepEqual(nextFreePosition(placed), gridPosition(12))
  for (const a of placed) for (const b of placed) if (a !== b) assert.ok(Math.abs(a.position.x - b.position.x) >= NODE_WIDTH || Math.abs(a.position.y - b.position.y) >= NODE_HEIGHT)
})

// Wide, short cards should use their bottom/top edges for shallow diagonals.
test('side handles account for compact card proportions', async () => {
  const { radialHandles } = await import('../src/radial.js')
  assert.deepEqual(radialHandles({ x: 0, y: 0 }, { x: 200, y: 190 }), { sourceHandle: 'radial-source-bottom', targetHandle: 'radial-target-top' })
})

test('dragging is not tethered to an anchor but still refuses collisions and invalid positions', async () => {
  const { constrainDrag } = await import('../src/nodes/placement.js')
  const nodes = [{ id: 'a', position: { x: 0, y: 0 } }, { id: 'b', position: { x: 0, y: 104 } }]
  assert.deepEqual(constrainDrag('a', { x: -10000, y: -10000 }, nodes), { x: -10000, y: -10000 })
  assert.equal(constrainDrag('a', { x: 0, y: 74 }, nodes), null)
  assert.equal(constrainDrag('b', { x: 0, y: 74 }, nodes, { a: { x: 0, y: 30 } }), null)
  assert.equal(constrainDrag('missing', { x: 0, y: 0 }, nodes), null)
  assert.equal(constrainDrag('a', { x: NaN, y: 0 }, nodes), null)
  assert.deepEqual(nodes[0].position, { x: 0, y: 0 })
})

test('reach limits use connected peers, honor existing long layouts and prevent repeated drag drift', async () => {
  const { withinLinkReach } = await import('../src/nodes/placement.js')
  const nodes = [{ id: 'a', position: { x: 0, y: 0 } }, { id: 'b', position: { x: 0, y: 104 } }, { id: 'isolated', position: { x: 1000, y: 0 } }]
  const edges = [{ source: 'b', target: 'a' }]
  assert.equal(withinLinkReach(nodes, edges, { a: { x: 300, y: 0 } }), true)
  assert.equal(withinLinkReach(nodes, edges, { a: { x: 400, y: 0 } }), false)
  assert.equal(withinLinkReach(nodes, edges, { a: { x: 1000, y: 1000 }, b: { x: 1000, y: 1104 }, isolated: { x: 10000, y: 10000 } }), true)
  assert.equal(withinLinkReach(nodes, edges, { a: { x: NaN, y: 0 } }), false)
  assert.equal(withinLinkReach(nodes, [], { isolated: { x: 10000, y: 10000 } }), true)
  const long = nodes.map(node => node.id === 'b' ? { ...node, position: { x: 1000, y: 0 } } : node)
  assert.equal(withinLinkReach(long, edges, { b: { x: 1500, y: 0 } }), true)
  assert.equal(withinLinkReach(long, edges, { b: { x: 1501, y: 0 } }), false)
})
