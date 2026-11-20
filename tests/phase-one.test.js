import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openStore } from '../host/store.js'
import { backupDatabase } from '../host/maintenance.js'
import { createSnapshotRoute } from '../host/routes/snapshot.js'

const devices = [
  { id: 'r', type: 'router', position: { x: 0, y: 0 }, data: { label: 'Router', ip: '192.0.2.1', description: '' } },
  { id: 's', type: 'switch', position: { x: 100, y: 0 }, data: { label: 'Switch', ip: '192.0.2.2', description: '' } },
]
const mapped = (id, index) => ({
  id,
  source: 's',
  target: 'r',
  label: id,
  sourceHandle: null,
  targetHandle: null,
  uplink: { label: '', source: { label: 'Switch port', index }, target: { label: 'Router port', index } },
})
const legacy = { id: 'legacy', source: 'r', target: 's', label: 'Port 4', sourceHandle: null, targetHandle: null }
const topology = { schemaVersion: 1, nodes: devices, edges: [mapped('one', 1), mapped('two', 2), legacy] }

function temporaryDatabase(t) {
  const directory = mkdtempSync(join(tmpdir(), 'netwatch-phase-one-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return join(directory, 'network.sqlite')
}

test('v11 requires a current verified offline backup and preserves v10 inventory and observations across retries', (t) => {
  const path = temporaryDatabase(t)
  const backup = path + '.pre-v11.bak'
  assert.throws(
    () =>
      openStore(path, {
        migrateV11() {
          throw Error('v10 fixture')
        },
      }),
    /v10 fixture/,
  )
  const old = new DatabaseSync(path)
  const now = Date.now()
  old
    .prepare('UPDATE inventory SET revision=7, payload=?')
    .run(JSON.stringify({ topology, monitoring: { r: true, s: false } }))
  old.prepare("INSERT INTO checks VALUES(12,'r','up',?,'reachable','fixture',3)").run(now)
  old.prepare("INSERT INTO latest_check VALUES('r','up',?,'reachable','fixture',3)").run(now)
  old.prepare("INSERT INTO incidents VALUES(3,'r',?,?)").run(now - 1, now)
  old.exec("INSERT INTO snmp_targets VALUES('r','00000000-0000-0000-0000-000000000001')")
  old.close()
  assert.throws(() => openStore(path), /verified database backup/)
  writeFileSync(backup, 'invalid')
  assert.throws(() => openStore(path), /verified database backup/)
  rmSync(backup)
  backupDatabase(path, backup)
  const changed = new DatabaseSync(path)
  changed.prepare("INSERT INTO checks VALUES(13,'r','up',?,'reachable','fixture',3)").run(now + 1)
  changed.close()
  assert.throws(() => openStore(path), /verified database backup/)
  rmSync(backup)
  backupDatabase(path, backup)
  assert.throws(
    () =>
      openStore(path, {
        migrateV11() {
          throw Error('interrupted')
        },
      }),
    /interrupted/,
  )
  const oldAgain = new DatabaseSync(path)
  assert.equal(oldAgain.prepare('PRAGMA user_version').get().user_version, 10)
  assert.equal(JSON.parse(oldAgain.prepare('SELECT payload FROM inventory').get().payload).topology.schemaVersion, 1)
  oldAgain.close()
  for (let i = 0; i < 2; i++) {
    const store = openStore(path)
    try {
      assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 12)
      assert.deepEqual(store.read().topology, { ...topology, schemaVersion: 2 })
      assert.deepEqual(store.read().monitoring, { r: true, s: false })
      assert.equal(store.revision(), 7)
      assert.equal(store.history('r').checks.length, 2)
      assert.equal(store.incidents('r').incidents[0].id, 3)
      assert.equal(store.interfaces('r').configured, true)
    } finally {
      store.close()
    }
  }
})

test('snapshot roles allowlist link evidence and invalidate cached state as port observations expire', (t) => {
  const path = temporaryDatabase(t)
  let now = Date.now()
  const store = openStore(path, { now: () => now })
  try {
    store.write(
      {
        source: 'inventory',
        topology: {
          ...topology,
          schemaVersion: 2,
          roots: ['r'],
          edges: [{ ...topology.edges[0], role: 'uplink' }, ...topology.edges.slice(1)],
          groups: [{ id: 'group', name: 'Baseline', protectedDevice: 's', links: ['one', 'two'] }],
        },
      },
      0,
    )
    const route = createSnapshotRoute('phase-one')
    const collector = { snapshot: () => ({ state: 'running', freshness: { staleAfterMs: 90000 } }) }
    const interfaces = { snapshot: () => ({ state: 'running', freshness: { staleAfterMs: 1000 } }) }
    const invoke = (role, tag) => {
      const response = {}
      const value = route({ store, collector, interfaces, role, requestHeaders: { 'if-none-match': tag }, response })
      return { value, response, tag: response.headers.ETag }
    }
    const initial = invoke('viewer')
    assert.equal(initial.value.linkHealth.links[0].state, 'unknown')
    assert.equal(initial.value.linkHealth.redundancy[0].state, 'unknown')
    assert.equal(initial.value.linkHealth.failurePoints, undefined)
    assert.equal(initial.value.inventory.topology.roots, undefined)
    assert.equal(initial.value.inventory.topology.edges[0].role, undefined)
    assert.equal(initial.value.linkHealth.links[0].flapping, undefined)
    assert.equal(invoke('admin').value.inventory.topology.edges[0].role, 'uplink')
    for (const { id } of devices) {
      const authorization = '00000000-0000-0000-0000-000000000001'
      store.authorizeInterfaces(id, authorization, 1)
      store.appendInterfaces(
        id,
        {
          checkedAt: new Date(now).toISOString(),
          uptime: 1,
          interfaces: [1, 2].map((index) => ({
            index,
            name: String(index),
            description: '',
            admin: 1,
            oper: 1,
            speedBps: 1000,
            inOctets: null,
            outOctets: null,
            discontinuity: null,
            counterBits: null,
          })),
        },
        { revision: 1, authorization },
      )
    }
    const live = invoke('viewer')
    assert.equal(live.value.linkHealth.links[0].state, 'portsUp')
    assert.equal(live.value.linkHealth.redundancy[0].state, 'healthy')
    assert.equal(live.value.uplinkPorts[0].source.oper, 1)
    assert.equal(invoke('viewer', live.tag).response.status, 304)
    now += 1001
    const stale = invoke('viewer', live.tag)
    assert.notEqual(stale.tag, live.tag)
    assert.equal(stale.value.linkHealth.links[0].state, 'unknown')
    assert.equal(stale.value.linkHealth.redundancy[0].state, 'unknown')
  } finally {
    store.close()
  }
})
