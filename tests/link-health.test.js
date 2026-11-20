import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateLinks } from '../src/link-health.js'
import { validateTopology } from '../src/topology.js'
import { uniqueConnections } from '../src/connections.js'

const now = Date.parse('2026-11-20T05:00:00Z')
const staleAfterMs = 90_000
const node = (id, type = 'switch') => ({ id, type, position: { x: 0, y: 0 }, data: { label: id } })
const port = (index) => ({ index, label: String(index) })
const edge = (id, source, target, index = 1) => ({
  id,
  source,
  target,
  uplink: { label: '', source: port(index), target: port(index) },
})
const observed = (age, oper = 1, extra = {}) => ({
  checkedAt: new Date(now - age).toISOString(),
  admin: 1,
  oper,
  ...extra,
})
const up = [observed(10)]
const down = [observed(10, 2), observed(20, 2)]
const reading = (id, source = up, target = up) => ({ id, source, target })
const graph = (edges, roots = ['r'], groups = []) => ({
  nodes: ['r', 'q', 'a', 'b', 'c'].map((id) => node(id, roots.includes(id) ? 'router' : 'switch')),
  edges,
  roots,
  groups,
})
const evaluate = (topology, samples = []) => evaluateLinks(topology, samples, now, staleAfterMs)

test('root-relative failure points handle chains, trees, rings, dual homes, parallel edges, and multiple roots', () => {
  const ra = edge('ra', 'r', 'a')
  const ab = edge('ab', 'a', 'b')
  const ac = edge('ac', 'a', 'c')
  const br = edge('br', 'b', 'r', 2)
  const cases = [
    [graph([ra, ab]), ['a', 'r'], ['ab', 'ra']],
    [graph([ra, ab, ac]), ['a', 'r'], ['ab', 'ac', 'ra']],
    [graph([ra, ab, br]), ['r'], []],
    [graph([ra, edge('qa', 'q', 'a', 2)], ['r', 'q']), [], []],
    [graph([ra, ab, edge('ba2', 'b', 'a', 2)]), ['a', 'r'], ['ra']],
    [graph([ra, ab, edge('bq', 'b', 'q')], ['r', 'q']), [], []],
  ]
  for (const [topology, devices, links] of cases) {
    assert.deepEqual(evaluate(topology).failurePoints, { devices, links })
  }
})

test('evidence keeps ping-only, stale, partial, mismatch, speed mismatch, standby and instability distinct', () => {
  const topology = graph([edge('ra', 'r', 'a')])
  const cases = [
    [undefined, 'unknown', 'reachabilityOnly', false],
    [reading('ra', [observed(staleAfterMs + 1)], up), 'oneSided', 'snmpOneEnd', false],
    [reading('ra', up, [observed(10, 2)]), 'mismatch', 'snmpBothEnds', false],
    [reading('ra', [observed(10, 2)], []), 'oneSided', 'snmpOneEnd', false],
    [reading('ra', down, []), 'down', 'snmpOneEnd', false],
    [reading('ra', [observed(10, 2), observed(10, 2)], []), 'oneSided', 'snmpOneEnd', false],
    [reading('ra', up, up), 'portsUp', 'snmpBothEnds', false],
    [
      reading('ra', [observed(10, 1, { speed: 100 })], [observed(10, 1, { speed: 1000 })]),
      'mismatch',
      'snmpBothEnds',
      false,
    ],
    [reading('ra', up, [observed(10, 1, { forwarding: 'standby' })]), 'standby', 'snmpBothEnds', false],
    [reading('ra', up, [observed(10, 1), observed(20, 2), observed(30, 1)]), 'portsUp', 'snmpBothEnds', true],
  ]
  for (const [sample, state, scope, flapping] of cases) {
    const [link] = evaluate(topology, sample ? [sample] : []).links
    assert.deepEqual({ state: link.state, scope: link.scope, flapping: link.flapping }, { state, scope, flapping })
  }
})

test('baseline health distinguishes dual paths, failed bundle member, isolation, standby and missing evidence', () => {
  const ra = edge('ra', 'r', 'a', 1)
  const alternate = edge('ra2', 'r', 'a', 2)
  const baseline = { id: 'g', protectedDevice: 'a', links: ['ra', 'ra2'] }
  const topology = graph([ra, alternate, edge('ab', 'a', 'b', 3)], ['r'], [baseline])
  const state = (samples, design = topology) => evaluate(design, samples).redundancy[0].state
  assert.equal(state([]), 'unknown')
  assert.equal(state([reading('ra')]), 'unknown')
  assert.equal(state([reading('ra'), reading('ra2')]), 'healthy')
  assert.equal(state([reading('ra'), reading('ra2', up, down)]), 'degraded')
  assert.equal(state([reading('ra', down, down), reading('ra2', down, down), reading('ab')]), 'isolated')
  assert.equal(state([reading('ra'), reading('ra2', up, [observed(10, 1, { forwarding: 'standby' })])]), 'healthy')
  assert.equal(state([reading('ra'), reading('ra2', [observed(staleAfterMs + 1)], up)]), 'unknown')
  const deadEnd = graph([ra, edge('ra2', 'a', 'b', 2)], ['r'], [baseline])
  assert.equal(state([reading('ra'), reading('ra2')], deadEnd), 'degraded')
  const conflicting = graph([ra, alternate, edge('ab', 'a', 'b')], ['r'], [baseline])
  assert.equal(evaluate(conflicting, [reading('ra'), reading('ra2')]).links[0].state, 'mismatch')
  assert.equal(state([reading('ra'), reading('ra2')], conflicting), 'degraded')
})

test('versioned topology keeps reverse aliases and unresolved IDs while showing distinct physical paths', () => {
  const ra = edge('ra', 'r', 'a')
  const reverse = edge('reverse', 'a', 'r')
  const parallel = edge('ra2', 'a', 'r', 2)
  const unresolved = { id: 'legacy', source: 'r', target: 'a', label: 'Port 3' }
  const topology = validateTopology({ ...graph([ra, reverse, parallel, unresolved]), schemaVersion: 2 })
  assert.deepEqual(
    topology.edges.map(({ id }) => id),
    ['ra', 'reverse', 'ra2', 'legacy'],
  )
  assert.equal(topology.edges[3].uplink, undefined)
  assert.deepEqual(
    uniqueConnections(topology.edges).map(({ id }) => id),
    ['legacy', 'ra', 'ra2'],
  )
  assert.throws(
    () =>
      validateTopology({
        ...topology,
        groups: [{ id: 'g', name: 'Baseline', protectedDevice: 'a', links: ['ra', 'reverse'] }],
      }),
    /distinct mapped/,
  )
})
