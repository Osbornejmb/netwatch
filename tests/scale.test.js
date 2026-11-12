import test from 'node:test'
import assert from 'node:assert/strict'
import { createScaleNetwork } from './fixtures/scale-network.js'
import { validateTopology } from '../src/topology.js'
import { summarizeHealth } from '../src/health.js'

test('repeatable 100-device/180-link scale fixture is valid and uses unique documentation addresses', () => {
  const now = Date.parse('2026-11-12T00:00:00Z')
  const fixture = createScaleNetwork(now)
  assert.deepEqual(createScaleNetwork(now), fixture)
  const topology = validateTopology(fixture)
  assert.equal(topology.nodes.length, 100)
  assert.equal(topology.edges.length, 180)
  assert.equal(new Set(topology.nodes.map(node => node.data.ip)).size, 100)
  assert.ok(topology.nodes.every(node => /^198\.51\.100\.(?:[1-9]\d?|100)$/.test(node.data.ip)))
  assert.deepEqual(summarizeHealth(fixture.nodes, fixture.checks, now), { all: 100, up: 70, down: 10, stale: 10, unknown: 10 })
  assert.deepEqual(summarizeHealth(fixture.nodes, {}, now), { all: 100, up: 0, down: 0, stale: 0, unknown: 100 })
})
