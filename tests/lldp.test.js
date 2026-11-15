import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import snmp from 'net-snmp'
import { readLldp } from '../host/lldp.js'
import { backupDatabase, restoreDatabase } from '../host/maintenance.js'
import { createHost } from '../host/server.js'
import { createInterfaceCollector } from '../host/snmp-collector.js'
import { openStore } from '../host/store.js'
import { fetchWriteToken, writeTokenFixture } from './fixtures/write-token.js'

const ROOT = '1.0.8802.1.1.2.1.4.1.1'
const timestamp = new Date().toISOString()
const end = { type: snmp.ObjectType.EndOfMibView }
const cell = (column, index, value) => ({
  oid: `${ROOT}.${column}.${index}`,
  type: typeof value === 'number' ? snmp.ObjectType.Integer : snmp.ObjectType.OctetString,
  value: typeof value === 'number' ? value : Buffer.from(value),
})
const rows = async () =>
  readLldp(
    async (_method, columns) =>
      columns.map((column) => {
        const field = Number(column.split('.').at(-1))
        const value = { 4: 4, 5: [2, 0, 0, 0, 0, 1], 6: 5, 7: 'Gi1/0/2', 9: 'Peer\u202e' }[field]
        return [
          cell(field, '10.3.1', value),
          cell(field, '11.3.1', value),
          ...(field === 7 ? [] : [cell(field, '12.4.2', value)]),
          end,
        ]
      }),
    timestamp,
  )

test('LLDP ignores incomplete neighbors, collapses duplicate evidence and sanitizes display text', async () => {
  const sample = await rows()
  assert.equal(sample.state, 'partial')
  assert.equal(sample.neighbors.length, 1)
  const [neighbor] = sample.neighbors
  assert.equal(neighbor.name, 'Peer')
  assert.equal(neighbor.localPort, 3)
  assert.equal(neighbor.remotePort, 'Gi1/0/2')
  assert.equal(neighbor.chassis, '02:00:00:00:00:01')
  assert.equal((await readLldp(async (_method, columns) => columns.map(() => [end]), timestamp)).state, 'empty')
  await assert.rejects(
    readLldp(async () => [[cell(4, '9.3.1', 1), cell(4, '8.3.1', 1)]], timestamp),
    /index/,
  )
})

test('LLDP review protects writes, preserves manual links, and blocks application of stale observations', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'netwatch-lldp-'))
  const path = join(dir, 'live.sqlite')
  const store = openStore(path)
  const node = (id, label) => ({ id, type: 'switch', position: { x: 100, y: 200 }, data: { label, ip: '' } })
  const source = node('source', 'Saved switch')
  source.data.ip = '192.0.2.1'
  const manual = { id: 'manual', source: 'source', target: 'existing', label: 'Existing link' }
  store.write(
    {
      source: 'inventory',
      topology: { schemaVersion: 1, nodes: [source, node('existing', 'Saved peer')], edges: [manual] },
      monitoring: { source: true },
    },
    0,
  )
  store.authorizeInterfaces('source', randomUUID(), 1)
  const savedSource = store.read().topology.nodes[0]
  const sample = await rows()
  let result = { checkedAt: sample.checkedAt, uptime: 10, interfaces: [], lldp: sample }
  const collector = createInterfaceCollector(store, {
    enabled: true,
    platform: 'win32',
    vault: { load: async () => ({}) },
    runner: async () => result,
  })
  await collector.runOnce()
  const server = createHost(store, { port: 0, dist: writeTokenFixture(dir), interfaces: collector })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await collector.stop()
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const url = `${base}/api/v1/devices/source/neighbors`
  const value = await (await fetch(url)).json()
  assert.equal(value.state, 'partial')
  assert.equal(value.neighbors.length, 1)
  assert.equal(store.revision(), 1, 'Review or dismissal does not update inventory')
  const headers = { 'Content-Type': 'application/json', 'X-NetWatch-Write': await fetchWriteToken(base) }
  const body = { baseRevision: 1, checkedAt: value.checkedAt, neighborId: value.neighbors[0].id }
  const save = (selection, writeHeaders = headers) =>
    fetch(url, { method: 'PUT', headers: writeHeaders, body: JSON.stringify({ ...body, ...selection }) })
  assert.equal((await save({ peerId: 'existing' }, {})).status, 403)
  assert.deepEqual(await (await save({ peerId: 'existing' })).json(), { revision: 1, added: false })
  assert.deepEqual(await (await save({ peerId: null, label: 'Reviewed peer', type: 'switch' })).json(), {
    revision: 2,
    added: true,
  })
  const saved = store.read()
  const peer = saved.topology.nodes[2]
  assert.deepEqual(saved.topology.nodes[0], savedSource)
  assert.equal(peer.data.label, 'Reviewed peer')
  assert.equal(peer.data.ip, '')
  assert.equal(saved.monitoring[peer.id], false)
  assert.equal(saved.topology.edges[0].label, 'Existing link')
  assert.equal(saved.topology.edges[1].label, 'LLDP · Port 3 ↔ Gi1/0/2')
  result = { error: 'snmp_timeout' }
  await collector.runOnce()
  assert.equal((await (await fetch(url)).json()).state, 'stale')
  assert.equal((await save({ baseRevision: 2, peerId: 'existing' })).status, 409)
  store.authorizeInterfaces('source', null, 2)
  assert.equal((await (await fetch(url)).json()).state, 'unconfigured')
  assert.equal(store.read().topology.edges.length, 2)
  const backup = join(dir, 'backup.sqlite')
  const restoredPath = join(dir, 'restored.sqlite')
  backupDatabase(path, backup)
  restoreDatabase(restoredPath, backup)
  const restored = openStore(restoredPath)
  try {
    assert.deepEqual(restored.read().topology, saved.topology)
    assert.equal(restored.read().monitoring[peer.id], false)
  } finally {
    restored.close()
  }
})
