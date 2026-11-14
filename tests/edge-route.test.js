import test from 'node:test'
import assert from 'node:assert/strict'
import { edgeRoute } from '../src/nodes/edgeRoute.js'

test('edges meet the measured card boundaries and reroute when a card moves through the link', () => {
  const source = { x: 0, y: 0, width: 240, height: 56 }
  const target = { x: 600, y: 0, width: 160, height: 56 }
  const blocker = { x: 320, y: 0, width: 160, height: 56 }
  const endpoints = [{ x: 240, y: 28 }, { x: 600, y: 28 }]
  assert.deepEqual(edgeRoute(source, target, [source, target]), endpoints)
  const route = edgeRoute(source, target, [source, blocker, target])
  assert.deepEqual([route[0], route.at(-1)], endpoints)
  assert.equal(route.length, 4)
  assert.ok(route.slice(1, -1).every(({ y }) => y < 0) ||
    route.slice(1, -1).every(({ y }) => y > 56))
  assert.deepEqual(edgeRoute(source, target, [source, { ...blocker, y: 100 }, target]), endpoints)
})

test('an offset wide card routes from its bottom boundary to its peer', () => {
  const source = { x: 0, y: 0, width: 280, height: 56 }
  const target = { x: 110, y: 110, width: 160, height: 56 }
  const [start, end] = edgeRoute(source, target, [source, target])
  assert.equal(start.y, 56)
  assert.equal(end.y, 110)
  assert.ok(Math.abs((end.x - start.x) / (end.y - start.y) - 50 / 110) < 1e-9)
})
