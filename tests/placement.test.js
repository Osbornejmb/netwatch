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
