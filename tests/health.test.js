import test from 'node:test'
import assert from 'node:assert/strict'
import { deviceHealth, summarizeHealth, connectionHealth, nextEvidenceChange } from '../src/health.js'
import { createHealthNetwork } from './fixtures/health-network.js'
import { validateTopology } from '../src/topology.js'

const now = Date.parse('2026-11-12T00:00:00Z')
const check = (age, status = 'up') => ({ status, checkedAt: new Date(now - age).toISOString() })

test('the dashboard wakes only when device or port evidence can change state', () => {
  const checks = { a: check(1000), b: check(-500), c: check(1990, 'unknown') }
  const ports = new Map([['link', { source: check(1980) }]])
  assert.equal(nextEvidenceChange(checks, 2000, ports, 2000, now), now + 21)
  assert.equal(nextEvidenceChange(checks, 2000, ports, 2000, now + 21), now + 500)
  assert.equal(nextEvidenceChange(checks, 2000, ports, 2000, now + 500), now + 1001)
  assert.equal(nextEvidenceChange(checks, 2000, ports, 2000, now + 2501), Infinity)
})

test('a failed router colors only its paths; a responding redundant switch stays up', () => {
  const checks = { a: check(0, 'down'), b: check(0), sw: check(0) }
  const status = id => deviceHealth(checks[id], now)
  assert.equal(connectionHealth(status('a'), status('sw')), 'down')
  assert.equal(connectionHealth(status('b'), status('sw')), 'up')
  assert.equal(status('sw'), 'up')
  checks.b = check(0, 'down')
  assert.equal(connectionHealth(status('b'), status('sw')), 'down')
  assert.equal(status('sw'), 'up')
  checks.a = check(0)
  assert.equal(connectionHealth(status('a'), status('sw')), 'up')
})

test('connection tint is conservative for unknown and stale endpoints, independent of orientation', () => {
  for (const [a, b, expected] of [['up', 'up', 'up'], ['up', 'unknown', 'unknown'], ['up', 'stale', 'stale'], ['stale', 'unknown', 'unknown'], ['down', 'unknown', 'down'], ['down', 'stale', 'down'], ['up', undefined, 'unknown']]) {
    assert.equal(connectionHealth(a, b), expected)
    assert.equal(connectionHealth(b, a), expected)
  }
})

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

test('summary counts only inventory devices and test network remains valid topology', () => {
  const network = createHealthNetwork(now)
  assert.equal(validateTopology(network).nodes.length, 14)
  network.checks['not-in-inventory'] = check(0, 'down')
  assert.deepEqual(summarizeHealth(network.nodes, network.checks, now), { all: 14, up: 11, down: 1, stale: 1, unknown: 1 })
  assert.deepEqual(summarizeHealth(network.nodes, {}, now), { all: 14, up: 0, down: 0, stale: 0, unknown: 14 })
  assert.deepEqual(summarizeHealth([], {}, now), { all: 0, up: 0, down: 0, stale: 0, unknown: 0 })
})
