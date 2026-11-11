import test from 'node:test'
import assert from 'node:assert/strict'
import { deviceHealth, summarizeHealth, createSampleNetwork } from '../src/health.js'
import { validateTopology } from '../src/topology.js'

const now = Date.parse('2026-11-12T00:00:00Z')
const check = (age, status = 'up') => ({ status, checkedAt: new Date(now - age).toISOString() })

test('missing, invalid, and future checks never imply a healthy or failed device', () => {
  for (const value of [undefined, {}, { status: 'up' }, { ...check(0), checkedAt: 'invalid' }, check(-1), check(0, 'unsupported')]) {
    assert.equal(deviceHealth(value, now), 'unknown')
  }
})

test('fresh up/down observations expire to stale at the freshness boundary', () => {
  assert.equal(deviceHealth(check(90_000), now), 'up')
  assert.equal(deviceHealth(check(10_000, 'down'), now), 'down')
  assert.equal(deviceHealth(check(90_001), now), 'stale')
  assert.equal(deviceHealth(check(90_001, 'down'), now), 'stale')
})

test('summary counts only inventory devices and sample network remains valid topology', () => {
  const sample = createSampleNetwork(now)
  assert.equal(validateTopology(sample).nodes.length, 14)
  sample.checks['not-in-inventory'] = check(0, 'down')
  assert.deepEqual(summarizeHealth(sample.nodes, sample.checks, now), { all: 14, up: 11, down: 1, stale: 1, unknown: 1 })
  assert.deepEqual(summarizeHealth(sample.nodes, {}, now), { all: 14, up: 0, down: 0, stale: 0, unknown: 14 })
  assert.deepEqual(summarizeHealth([], {}, now), { all: 0, up: 0, down: 0, stale: 0, unknown: 0 })
})
