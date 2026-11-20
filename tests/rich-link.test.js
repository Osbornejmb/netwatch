import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import snmp from 'net-snmp'
import { interfaceRates } from '../host/interfaces.js'
import { associateStp, qualityRates, qualityThresholds, readLinkEvidence } from '../host/link-evidence.js'
import { correlateCdp } from '../host/discovery-lldp.js'
import { evaluateLinks } from '../src/link-health.js'
import { openStore } from '../host/store.js'
import { backupDatabase, validateDatabase } from '../host/maintenance.js'
import { createSnapshotRoute } from '../host/routes/snapshot.js'
import { validateSnapshot } from '../src/monitoring.js'

const now = Date.parse('2026-11-20T06:00:00Z')
const stamp = (time) => new Date(time).toISOString()
const row = (index) => ({
  index,
  name: 'Gi' + index,
  description: '',
  admin: 1,
  oper: 1,
  speedBps: 1e9,
  discontinuity: 0,
  counterBits: 64,
  inOctets: '1000',
  outOctets: '1000',
})
const sample = (time, inOctets, uptime, discontinuity = 0) => ({
  checkedAt: stamp(time),
  uptime,
  interfaces: [{ ...row(1), inOctets, discontinuity }],
})
const telemetry = (index, errors, discards, stp = 'forwarding', aggregateId = 100) => ({
  index,
  inErrors: errors,
  outErrors: 0,
  inDiscards: discards,
  outDiscards: 0,
  stp,
  aggregateId,
})
const mapPort = (index) => ({ label: 'Gi' + index, index })
const link = (id, source, target, index, role) => ({
  id,
  source,
  target,
  ...(role && { role }),
  uplink: { label: '', source: mapPort(index), target: mapPort(index) },
})
const nodes = ['r', 's', 'z'].map((id, i) => ({
  id,
  type: id === 'r' ? 'router' : 'switch',
  position: { x: 0, y: 0 },
  data: { label: id, ip: '192.0.2.' + (i + 1) },
}))
const group = { id: 'g', name: 'Access', protectedDevice: 's', links: ['a', 'b'] }
const topology = {
  roots: ['r'],
  nodes,
  edges: [link('a', 'r', 's', 1), link('b', 's', 'r', 2, 'peer')],
  groups: [group],
}

test('a plausible 64-bit wrap yields a rate, while resets and discontinuities remain unknown', () => {
  const before = sample(now - 1000, ((1n << 64n) - 20n).toString(), 1000)
  assert.equal(interfaceRates(before, sample(now, '30', 1100))[0].inBps, 400)
  assert.equal(interfaceRates(before, sample(now, '30', 0))[0].inBps, null)
  assert.equal(interfaceRates(before, sample(now, '30', 1100, 1))[0].inBps, null)
  assert.equal(interfaceRates(sample(now - 1000, '200', 1000), sample(now, '30', 1100))[0].inBps, null)
})

test('rates and independent streaks require consecutive compatible readings', () => {
  const thresholds = qualityThresholds({})
  const currentPort = [row(1)]
  let previous = [telemetry(1, 0, 0)]
  for (let i = 1; i <= 3; i++) {
    const next = qualityRates(previous, [telemetry(1, i, 10 * i)], currentPort, currentPort, 1000, true, thresholds)
    assert.equal(next[0].errorsPerSec, 1)
    assert.equal(next[0].discardsPerSec, 10)
    assert.equal(next[0].errorStreak, i)
    assert.equal(next[0].discardStreak, i)
    previous = next
  }
  const reboot = qualityRates(previous, [telemetry(1, 1, 1)], currentPort, currentPort, 1000, false, thresholds)
  assert.equal(reboot[0].errorsPerSec, null)
  assert.equal(reboot[0].errorStreak, 0)
  assert.throws(() => qualityThresholds({ NETWATCH_LINK_ERRORS_PER_SEC: 'Infinity' }), /Invalid/)
})

test('STP mapping handles ambiguous bridge ports conservatively', () => {
  const rows = new Map([
    [10, { ifIndex: 1, state: 5 }],
    [11, { ifIndex: 2, state: 2 }],
    [12, { ifIndex: 3, state: 5 }],
    [13, { ifIndex: 3, state: 2 }],
    [14, { ifIndex: 4, state: 7 }],
  ])
  assert.deepEqual(
    [...associateStp(rows)],
    [
      [1, 'forwarding'],
      [2, 'blocking'],
    ],
  )
})

test('inference respects overrides and consistent bundles count as one path', () => {
  const report = (extra) => ({
    checkedAt: stamp(now),
    admin: 1,
    oper: 1,
    speed: 1e9,
    stp: 'forwarding',
    aggregateId: 100,
    ...extra,
  })
  const evidence = [
    { id: 'a', source: [report()], target: [report()] },
    { id: 'b', source: [report({ oper: 2 })], target: [report()] },
  ]
  const partial = evaluateLinks(topology, evidence, now, 1000)
  assert.equal(partial.links[0].role, 'downlink')
  assert.equal(partial.links[1].role, 'peer')
  assert.deepEqual(partial.bundles, [{ id: 'a', members: ['a', 'b'], total: 2, up: 1, state: 'degraded' }])
  assert.deepEqual(partial.redundancy, [{ id: 'g', deviceId: 's', state: 'degraded', basis: 'stpAndLacp' }])
  evidence[1].source = [report()]
  const intact = evaluateLinks(topology, evidence, now, 1000)
  assert.equal(intact.bundles[0].state, 'up')
  assert.equal(intact.redundancy[0].state, 'degraded')
  evidence[1].source = [report({ stp: 'blocking', aggregateId: undefined })]
  const alternate = evaluateLinks(topology, evidence, now, 1000)
  assert.equal(alternate.links[1].state, 'standby')
  assert.equal(alternate.redundancy[0].basis, 'stp')
  assert.equal(evaluateLinks(topology, evidence, now + 1001, 1000).links[0].state, 'unknown')
})

test('CDP corroborates compatible port and address evidence and flags disagreement', () => {
  const report = {
    chassisKey: 'mac:02:00:00:00:00:02',
    addresses: ['192.0.2.2'],
    name: 'Peer',
    localPort: { index: 2 },
    peerPort: { label: 'Gi1/0/3' },
  }
  const cdp = { index: 2, address: '192.0.2.2', peerPort: 'Gi1/0/3', device: '0200.0000.0002' }
  assert.equal(correlateCdp([report], [cdp])[0].source, 'both')
  assert.equal(correlateCdp([report], [{ ...cdp, peerPort: 'Gi1/0/4' }])[0].protocolConflict, true)
  assert.equal(correlateCdp([report], [{ ...cdp, device: '0200.0000.0003' }])[0].protocolConflict, true)
  assert.deepEqual(correlateCdp([report], [{ ...cdp, address: '192.0.2.3' }]), [report])
})

test('v13 verifies a v12 backup, persists telemetry, and only projects approved viewer fields', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'netwatch-v13-'))
  let store
  t.after(() => {
    store?.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const file = join(dir, 'network.sqlite')
  assert.throws(
    () =>
      openStore(file, {
        migrateV13() {
          throw Error('v12 fixture')
        },
      }),
    /v12 fixture/,
  )
  const old = new DatabaseSync(file)
  assert.equal(old.prepare('PRAGMA user_version').get().user_version, 12)
  old.close()
  assert.throws(() => openStore(file), /pre-v13/)
  backupDatabase(file, file + '.pre-v13.bak')
  let clock = now
  store = openStore(file, { now: () => clock })
  store.write({ source: 'inventory', topology }, 0)
  for (const id of ['r', 's']) store.authorizeInterfaces(id, '00000000-0000-0000-0000-000000000001', 1)
  for (let i = 0; i <= 3; i++) {
    clock = now + i * 1000
    for (const id of ['r', 's'])
      store.appendInterfaces(
        id,
        {
          checkedAt: stamp(clock),
          uptime: i + 1000,
          interfaces: [row(1), row(2)],
          linkEvidence: [telemetry(1, i, 10 * i), telemetry(2, 0, 0)],
        },
        { revision: 1, authorization: '00000000-0000-0000-0000-000000000001' },
      )
  }
  assert.equal(validateDatabase(file), 1)
  const route = createSnapshotRoute('v13')
  const read = (role) =>
    route({
      store,
      role,
      requestHeaders: {},
      response: {},
      interfaces: { snapshot: () => ({ state: 'running', freshness: { staleAfterMs: 1000 } }) },
    })
  const viewer = read('viewer')
  const [first] = validateSnapshot(viewer).linkHealth.links
  assert.equal(first.state, 'degraded')
  assert.equal(first.source.errorsPerSec, 1)
  assert.equal(first.source.discardsPerSec, 10)
  assert.equal(first.source.stp, 'forwarding')
  assert.deepEqual(first.bundle, { total: 2, up: 2, state: 'degraded' })
  assert.equal(first.role, undefined)
  assert.equal(viewer.linkHealth.failurePoints, undefined)
  assert.equal(viewer.linkHealth.bundles, undefined)
  assert.doesNotMatch(JSON.stringify(viewer), /aggregateId|inErrors|errorStreak|cdpReports/)
  assert.equal(read('admin').linkHealth.bundles.length, 1)
  clock += 1001
  assert.equal(read('viewer').linkHealth.links[0].source.errorsPerSec, undefined)
})

test('optional SNMP reads map bridge ports and aggregate interfaces without guessing indexes', async () => {
  const counter = snmp.ObjectType.Counter,
    integer = snmp.ObjectType.Integer
  const end = { type: snmp.ObjectType.EndOfMibView, oid: '0.0' }
  const table = new Map([
    ['1.3.6.1.2.1.2.2.1.14', [[1, 12, counter]]],
    [
      '1.3.6.1.2.1.17.1.4.1.2',
      [
        [9, 100, integer],
        [10, 2, integer],
      ],
    ],
    [
      '1.3.6.1.2.1.17.2.15.1.3',
      [
        [9, 5, integer],
        [10, 2, integer],
      ],
    ],
    ['1.2.840.10006.300.43.1.2.1.1.13', [[1, 100, integer]]],
  ])
  const read = (_method, oids) =>
    oids.map((root) => [
      ...(table.get(root) ?? []).map(([index, value, type]) => ({ oid: root + '.' + index, type, value })),
      end,
    ])
  assert.deepEqual(await readLinkEvidence(read, [row(1), row(2), row(100)]), [
    { index: 1, inErrors: 12, stp: 'forwarding', aggregateId: 100 },
    { index: 2, stp: 'blocking' },
    { index: 100, stp: 'forwarding' },
  ])
  assert.deepEqual(
    await readLinkEvidence(() => {
      throw Error('unsupported')
    }, [row(1)]),
    [],
  )
})
