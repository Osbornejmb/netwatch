import test from 'node:test'
import assert from 'node:assert/strict'
import { hierarchyLayout, layoutTiers, refocusSummary } from '../src/refocus.js'
import { validateSnapshot } from '../src/monitoring.js'

const nodes = ['r', 'a', 'b', 'unlinked'].map((id) => ({
  id,
  type: id === 'r' ? 'router' : 'switch',
  position: { x: 0, y: 0 },
  data: { label: id },
}))
const edges = [
  { id: 'ra', source: 'r', target: 'a' },
  { id: 'ab', source: 'a', target: 'b' },
]
const topology = { nodes, edges, roots: ['r'] }
const now = Date.parse('2026-11-20T06:00:00Z')
const checkedAt = new Date(now).toISOString()
const evidence = {
  links: edges.map((edge) => ({
    id: edge.id,
    state: 'portsUp',
    scope: 'snmpBothEnds',
    source: { deviceId: edge.source, checkedAt, portLabel: 'x', speedBps: 1000000000 },
    target: { deviceId: edge.target, checkedAt, portLabel: 'y', speedBps: 1000000000 },
  })),
  redundancy: [{ id: 'baseline', deviceId: 'a', state: 'degraded', basis: 'linkStatusOnly' }],
}

test('root-relative tiers place children below roots and put disconnected devices in an unassigned row', () => {
  const tiers = layoutTiers(topology)
  assert.deepEqual(tiers, [
    { deviceId: 'r', tier: 0 },
    { deviceId: 'a', tier: 1 },
    { deviceId: 'b', tier: 2 },
  ])
  assert.deepEqual(
    hierarchyLayout(nodes, tiers, {}).map((node) => node.position.y),
    [0, 205, 410, 615],
  )
})

test('dashboard health never treats expired, disconnected, or missing evidence as healthy coverage', () => {
  const current = refocusSummary(nodes, edges, evidence, now, 1000, true)
  assert.equal(current.monitored, 2)
  assert.match(current.headline, /running without redundancy/)
  assert.equal(current.devices.find(({ node }) => node.id === 'unlinked').state, 'none')
  for (const [clock, connected] of [
    [now + 1001, true],
    [now, false],
  ]) {
    const stale = refocusSummary(nodes, edges, evidence, clock, 1000, connected)
    assert.equal(stale.monitored, 0)
    assert.equal(stale.links[0].state, 'unknown')
    assert.equal(stale.devices[0].state, 'unknown')
    assert.doesNotMatch(stale.headline, /available|isolated|running without/)
  }
  assert.equal(refocusSummary(nodes, edges, undefined, now, 1000, true).monitored, 0)
})

test('snapshot validation accepts approved speeds and tiers and rejects unknown IDs or invalid speeds', () => {
  const value = {
    inventory: { revision: 1, topology, monitoring: {} },
    generatedAt: checkedAt,
    collector: { state: 'running' },
    freshness: { staleAfterMs: 1000 },
    observations: [],
    tiers: layoutTiers(topology),
    linkHealth: evidence,
  }
  assert.equal(validateSnapshot(value).linkHealth.links[0].source.speedBps, 1000000000)
  assert.throws(() => validateSnapshot({ ...value, tiers: [{ deviceId: 'other', tier: 1 }] }), /tiers/)
  const invalid = structuredClone(value)
  invalid.linkHealth.links[0].source.speedBps = -1
  assert.throws(() => validateSnapshot(invalid), /port evidence/)
})
