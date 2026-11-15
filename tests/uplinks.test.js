import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { validateTopology } from '../src/topology.js'
import { validateSnapshot } from '../src/monitoring.js'
import { redundancyState, uplinkState } from '../src/uplinks.js'
import { openStore } from '../host/store.js'
import { createSnapshotRoute } from '../host/routes/snapshot.js'

const now = Date.now()
const checkedAt = new Date(now - 1000).toISOString()
const node = (id, type, octet) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { label: id, ip: `192.0.2.${octet}` },
})
const port = { label: 'Gi1/0/2', index: 2 }
const uplink = { label: 'Uplink', source: port, target: port }
const topology = {
  nodes: [node('r1', 'router', 1), node('r2', 'router', 2), node('sw', 'switch', 3)],
  edges: [
    { id: 'a', source: 'r1', target: 'sw', label: 'LLDP · Port 2', uplink },
    { id: 'b', source: 'r2', target: 'sw', uplink },
  ],
  groups: [{ id: 'group', name: 'WAN paths', links: ['a', 'b'] }],
}

test('uplink and group settings round-trip with old map compatibility and preserve link provenance', () => {
  const clean = validateTopology(topology)
  assert.deepEqual(validateTopology(JSON.parse(JSON.stringify(clean))), clean)
  assert.equal(clean.edges[0].label, 'LLDP · Port 2')
  assert.deepEqual(clean.edges[0].uplink, uplink)
  assert.equal(validateTopology({ nodes: [], edges: [] }).groups, undefined)
  assert.throws(() => validateTopology({ ...topology, groups: [{ ...topology.groups[0], links: ['a', 'a'] }] }))
  assert.throws(() =>
    validateTopology({ ...topology, edges: [topology.edges[0], { ...topology.edges[1], source: 'r1' }] }),
  )
  assert.throws(() =>
    validateTopology({
      ...topology,
      edges: [{ ...topology.edges[0], uplink: { ...uplink, source: { ...port, index: 0 } } }, topology.edges[1]],
    }),
  )
})

test('port evidence is independent of reachability and requires fresh mappings before reporting group availability', () => {
  const up = { admin: 1, oper: 1, checkedAt }
  const down = { ...up, oper: 2 }
  const path = (source, target) => uplinkState(topology.edges[0], { source, target }, now, 10000)
  assert.equal(path(up, undefined), 'unknown')
  assert.equal(path(up, { ...up, checkedAt: new Date(now - 10001).toISOString() }), 'unknown')
  assert.equal(path(up, { ...up, oper: 5 }), 'unknown')
  assert.equal(path(up, { ...up, checkedAt: new Date(now + 1).toISOString() }), 'unknown')
  assert.equal(redundancyState([path(up, up), path(up, undefined)]), 'Unknown')
  assert.equal(redundancyState([path(up, up), path(up, down)]), 'Degraded')
  assert.equal(redundancyState([path(down, up), path(up, down)]), 'Unavailable')
  assert.equal(redundancyState([path(up, up), path(up, up)]), 'Available')
})

test('snapshots invalidate when authorized mapped ports change and expose no unrelated interface properties', (t) => {
  const store = openStore(':memory:', { now: () => now })
  t.after(() => store.close())
  store.write({ source: 'inventory', topology, monitoring: {} }, 0)
  const authorization = randomUUID()
  store.authorizeInterfaces('r1', authorization, 1)
  const read = createSnapshotRoute('fixture')
  const context = { store, interfaces: { snapshot: () => ({ state: 'running', freshness: { staleAfterMs: 10000 } }) } }
  const before = {}
  assert.equal(read({ ...context, role: 'viewer', requestHeaders: {}, response: before }).uplinkPorts, undefined)
  store.appendInterfaces(
    'r1',
    {
      checkedAt,
      uptime: 100,
      interfaces: [
        {
          index: 2,
          name: 'Private description',
          description: '',
          admin: 1,
          oper: 1,
          speedBps: null,
          discontinuity: null,
          counterBits: null,
          inOctets: null,
          outOctets: null,
        },
      ],
    },
    { revision: 1, authorization },
  )
  const after = {}
  const result = read({
    ...context,
    role: 'viewer',
    requestHeaders: { 'if-none-match': before.headers.ETag },
    response: after,
  })
  assert.notEqual(after.headers.ETag, before.headers.ETag)
  assert.deepEqual(result.uplinkPorts, [{ id: 'a', source: { checkedAt, admin: 1, oper: 1 } }])
  assert.equal(validateSnapshot(result).uplinkPorts.get('a').source.oper, 1)
  assert.deepEqual(result.observations, [])
  store.authorizeInterfaces('r1', null, 1)
  assert.equal(read({ ...context, requestHeaders: {}, response: {} }).uplinkPorts, undefined)
})
