import test from 'node:test'
import assert from 'node:assert/strict'
import { compareDiscovery } from '../host/dynamics.js'
import { openStore } from '../host/store.js'
import { estimateFailure, incidentAnchors } from '../src/failure-impact.js'

const devices = ['a', 'b', 'c'].map((id) => ({ chassisKey: id, label: id, state: 'manageable' }))
const link = (id, source, target, port = '1', confidence = 'verified') => ({
  id, source, target, confidence, sourcePort: { label: port }, targetPort: { label: port },
})
const first = link('ab', 'a', 'b')
const second = link('bc', 'b', 'c')
const run = (links) => ({ devices, links })

test('discovery distinguishes a moved port from an added or repeatedly missing link', () => {
  const initial = compareDiscovery(undefined, run([first]))
  assert.deepEqual(initial.changes, [])
  const moved = compareDiscovery(initial.baseline, run([link('ab2', 'a', 'b', '2'), second]))
  assert.deepEqual(moved.changes.map(({ kind }) => kind), ['linkMoved', 'linkAdded'])
  const oneMiss = compareDiscovery(moved.baseline, run([second]))
  assert.deepEqual(oneMiss.changes, [])
  const ambiguous = compareDiscovery(oneMiss.baseline, run([second, link('partial', 'a', 'b', '2', 'oneSided')]))
  assert.deepEqual(ambiguous.changes, [])
  const freshMiss = compareDiscovery(ambiguous.baseline, run([second]))
  assert.deepEqual(freshMiss.changes, [])
  const confirmed = compareDiscovery(freshMiss.baseline, run([second]))
  assert.deepEqual(confirmed.changes.map(({ kind }) => kind), ['linkMissing'])
  assert.deepEqual(compareDiscovery(confirmed.baseline, run([second])).changes, [])
})

const topology = {
  roots: ['a'],
  nodes: devices.map(({ chassisKey: id }) => ({ id, data: { label: id } })),
  edges: [first, second],
  groups: [],
}

test('failure estimates identify downstream devices and incidents use the upstream anchor', () => {
  assert.deepEqual(estimateFailure(topology, { deviceId: 'b' }), { isolated: ['c'], degraded: [] })
  assert.deepEqual(estimateFailure(topology, { linkId: 'ab' }), { isolated: ['b', 'c'], degraded: [] })
  assert.equal(estimateFailure({ ...topology, roots: [] }, { linkId: 'ab' }), null)
  const redundancy = ['b', 'c'].map((deviceId) => ({ deviceId, state: 'isolated' }))
  assert.deepEqual(incidentAnchors(topology, redundancy), [{ deviceId: 'b', state: 'isolated', affected: 1 }])
})

test('incidents persist through uncertain evidence and resolve on confirmed recovery', (t) => {
  let now = Date.UTC(2026, 0, 1)
  const store = openStore(':memory:', { now: () => now })
  t.after(() => store.close())
  const observe = (state) => store.dynamics.observe(topology, { links: [], redundancy: [{ deviceId: 'b', state }] })
  assert.deepEqual(store.dynamics.schedule(), { seedId: '', intervalMinutes: 0 })
  store.dynamics.setSchedule({ seedId: 'a', intervalMinutes: 60 })
  assert.deepEqual(store.dynamics.schedule(), { seedId: 'a', intervalMinutes: 60 })
  observe('degraded')
  now += 1000
  observe('unknown')
  assert.equal(store.dynamics.read().incidents[0].resolvedAt, null)
  observe('healthy')
  assert.equal(store.dynamics.read().incidents.length, 1)
  assert.equal(store.dynamics.read().incidents[0].resolvedAt, new Date(now).toISOString())
})
