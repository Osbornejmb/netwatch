import test from 'node:test'
import assert from 'node:assert/strict'
import { gridPosition, nextFreePosition } from '../src/nodes/placement.js'
import { NODE_WIDTH, NODE_HEIGHT } from '../src/nodes/dimensions.js'

test('placement skips occupied and overlapping cells and reuses gaps', () => {
  const nodes = [{ position: { x: 5, y: 5 } }, { position: gridPosition(2) }]
  assert.deepEqual(nextFreePosition([]), gridPosition(0))
  assert.deepEqual(nextFreePosition(nodes), gridPosition(1))
  const placed = Array.from({ length: 12 }, (_, index) => ({ position: gridPosition(index) }))
  assert.deepEqual(nextFreePosition(placed), gridPosition(12))
  for (const a of placed) for (const b of placed) if (a !== b) assert.ok(Math.abs(a.position.x - b.position.x) >= NODE_WIDTH || Math.abs(a.position.y - b.position.y) >= NODE_HEIGHT)
})
