import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import snmp from 'net-snmp'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { backupDatabase } from '../host/maintenance.js'
import { crawlLimits, crawlTopology, createTopologyDiscovery, discoveryScope } from '../host/topology-discovery.js'
import { chassisKey, readDiscoveryLldp } from '../host/discovery-lldp.js'
import { openStore } from '../host/store.js'
import { discoveryRoutes } from '../host/routes/topology-discovery.js'
import { createInterfaceCollector } from '../host/snmp-collector.js'
import { createCollector } from '../host/collector.js'
import { mergeDiscoveryDraft } from '../src/discovery-draft.js'

const at = '2026-11-20T00:00:00.000Z'
const id = (i) => 'd' + i
const address = (i) => '192.168.9.' + (i + 10)
const key = (i) => chassisKey(4, Buffer.from([2, 0, 0, 0, 0, i]))
const targets = Array.from({ length: 9 }, (_, i) => ({
  deviceId: id(i),
  type: i ? 'switch' : 'router',
  address: address(i),
}))
const sample = (i) => ({
  chassisKey: key(i),
  name: i ? 'Same switch' : 'Router',
  state: 'current',
  checkedAt: at,
  neighbors: [],
})
const sighting = (i, local, remote, addresses = [address(i)], type = 'switch') => ({
  chassisKey: key(i),
  name: 'Same\u0001 switch',
  type,
  addresses,
  localPort: { label: 'port-' + local, index: local },
  peerPort: { label: 'port-' + remote, index: null },
})
const fixtureGraph = () => {
  const samples = targets.map((_, i) => sample(i))
  for (const [a, b, aPort, bPort] of [
    [0, 1, 1, 1],
    [0, 1, 2, 2],
    [0, 2, 3, 1],
    [1, 3, 3, 1],
    [1, 4, 4, 1],
    [2, 5, 2, 1],
    [2, 6, 3, 1],
    [3, 7, 2, 1],
    [4, 8, 2, 1],
    [6, 7, 2, 2],
  ]) {
    samples[a].neighbors.push(sighting(b, aPort, bPort))
    samples[b].neighbors.push(sighting(a, bPort, aPort))
  }
  return samples
}
const idx = (value) => Number(value.slice(1))
const scope = discoveryScope({ interfaces: {}, additional: '192.168.9.0/24,fd00::/64' })
const options = (samples, overrides = {}) => ({
  seed: targets[0],
  targets,
  allowed: scope,
  read: async (id) => samples[idx(id)],
  now: Date.now,
  signal: new AbortController().signal,
  limits: { ...crawlLimits, spacingMs: 0 },
  ...overrides,
})

test('bounded traversal finds eight switches across three hops, closes loops, and keeps parallel links and distinct chassis', async () => {
  const samples = fixtureGraph()
  const queried = []
  samples[0].neighbors[0].addresses.push('192.168.9.77')
  samples[0].neighbors.push(
    sighting(11, 9, 1, ['192.168.9.99']),
    sighting(12, 10, 1, ['169.254.1.1']),
    sighting(13, 11, 1, ['9.9.9.9']),
    sighting(14, 12, 1, [], 'other'),
  )
  const result = await crawlTopology(
    options(samples, {
      read: async (id) => {
        queried.push(id)
        return samples[idx(id)]
      },
    }),
  )
  assert.equal(queried.length, 9)
  assert.equal(new Set(queried).size, 9)
  assert.equal(result.devices.filter(({ state, type }) => state === 'manageable' && type === 'switch').length, 8)
  assert.equal(result.devices.find((device) => device.chassisKey === key(8)).depth, 3)
  assert.equal(result.links.filter(({ confidence }) => confidence === 'verified').length, 10)
  assert.equal(result.devices.find((device) => device.chassisKey === key(11)).reason, 'not_enrolled')
  assert.equal(result.devices.find((device) => device.chassisKey === key(12)).reason, 'outside_scope')
  assert.equal(result.devices.find((device) => device.chassisKey === key(13)).reason, 'outside_scope')
  assert.equal(result.devices.find((device) => device.chassisKey === key(14)).state, 'unmanaged')
  assert.equal(scope('127.0.0.1'), false)
  assert.equal(scope('fd00::c'), true)
  assert.equal(scope('fe80::1'), false)
})

test('malformed, mismatched, partial, timed-out, unauthorized and unresolved observations do not become verified', async () => {
  const samples = fixtureGraph()
  samples[0].neighbors[0].peerPort.label = 'mismatch'
  samples[0].neighbors.at(-1).localPort.index = null
  samples[1].neighbors.push({ chassisKey: 'untrusted\nsecret' })
  samples[3] = { error: 'snmp_timeout' }
  samples[4] = { error: 'credentials_unavailable' }
  const result = await crawlTopology(options(samples))
  assert.ok(result.links.some(({ confidence }) => confidence === 'conflict'))
  assert.ok(result.links.some(({ confidence }) => confidence === 'unresolved_port'))
  assert.ok(result.links.some(({ confidence }) => confidence === 'single_sided'))
  assert.ok(result.diagnostics.includes('snmp_timeout'))
  assert.ok(result.diagnostics.includes('credentials_unavailable'))
  assert.doesNotMatch(JSON.stringify(result), /untrusted|secret|\u0001/)
  for (const [limits, diagnostic] of [
    [{ depth: 0 }, 'depth_limit'],
    [{ devices: 1 }, 'device_limit'],
    [{ neighbors: 1 }, 'neighbor_limit'],
    [{ proposals: 1 }, 'proposal_limit'],
    [{ deadlineMs: 0 }, 'time_limit'],
  ]) {
    const limited = await crawlTopology(options(samples, { limits: { ...crawlLimits, spacingMs: 0, ...limits } }))
    assert.ok(limited.diagnostics.includes(diagnostic), diagnostic)
  }
  const controller = new AbortController()
  const cancelled = await crawlTopology(
    options(samples, {
      signal: controller.signal,
      read: async () => {
        controller.abort()
        return samples[0]
      },
    }),
  )
  assert.deepEqual(cancelled.diagnostics, ['cancelled'])
})

test('walk handles bulk fallback, opaque chassis keys, named, aliased and MAC port resolution', async () => {
  const local = '1.0.8802.1.1.2.1.3',
    remote = '1.0.8802.1.1.2.1.4'
  const dictionary = new Map()
  const column = (root, entries) => {
    for (const [suffix, value] of entries) dictionary.set(root + '.' + suffix, value)
  }
  column(local + '.7.1.2', [
    ['1', 5],
    ['2', 1],
    ['3', 3],
  ])
  const phys = Buffer.from([2, 0, 1, 2, 3, 4])
  column(local + '.7.1.3', [
    ['1', Buffer.from('eth1')],
    ['2', Buffer.from('uplink')],
    ['3', phys],
  ])
  column('1.3.6.1.2.1.31.1.1.1.1', [['10', Buffer.from('eth1')]])
  column('1.3.6.1.2.1.31.1.1.1.18', [['20', Buffer.from('uplink')]])
  column('1.3.6.1.2.1.2.2.1.6', [['30', phys]])
  const keys = ['0.1.1', '0.2.1', '0.3.1']
  for (const [j, suffix] of keys.entries()) {
    column(remote + '.1.1.4', [[suffix, 4]])
    column(remote + '.1.1.5', [[suffix, Buffer.from([2, 0, 0, 0, 0, j + 1])]])
    column(remote + '.1.1.6', [[suffix, 5]])
    column(remote + '.1.1.7', [[suffix, Buffer.from('eth2')]])
    column(remote + '.1.1.12', [[suffix, Buffer.from([0x20])]])
    column(remote + '.2.1.3', [[suffix + '.1.4.192.168.9.' + (20 + j), 1]])
  }
  const end = { oid: '9', type: snmp.ObjectType.EndOfMibView }
  const data = (oid, value) => ({
    oid,
    value,
    type: Buffer.isBuffer(value) ? snmp.ObjectType.OctetString : snmp.ObjectType.Integer,
  })
  let fallback = 0
  const result = await readDiscoveryLldp(async (method, cursors) => {
    const [cursor] = cursors
    if (method === 'get') return [data(cursors[0], 7), data(cursors[1], Buffer.from('opaque'))]
    const root = [...dictionary.keys()].map((oid) => oid.slice(0, oid.lastIndexOf('.')))
    const hasNext = (oid) => {
      const left = oid.split('.').map(Number),
        right = cursor.split('.').map(Number)
      for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] > right[i]
      return left.length > right.length
    }
    if (cursor === local + '.7.1.2' && method === 'getBulk') throw Error('snmp_too_big')
    const rows = [...dictionary].filter(([oid]) => hasNext(oid)).map(([oid, value]) => data(oid, value))
    const compare = (a, b) => a.oid.localeCompare(b.oid, 'en', { numeric: true })
    rows.sort(compare)
    assert.ok(root.length)
    if (method === 'getNext') {
      fallback++
      return [rows[0] ?? end]
    }
    return [[...rows.slice(0, 15), end]]
  }, at)
  assert.ok(fallback > 0)
  assert.equal(result.chassisKey, chassisKey(7, Buffer.from('opaque')))
  assert.notEqual(result.chassisKey, chassisKey(5, Buffer.from('opaque')))
  assert.deepEqual(
    result.neighbors.map(({ localPort }) => localPort.index),
    [10, 20, 30],
  )
  assert.deepEqual(result.neighbors[0].addresses, ['192.168.9.20'])
})

test('run progress, draft review and cancellation are isolated from saved inventory', async (t) => {
  const store = openStore(':memory:')
  const nodes = targets.map(({ deviceId, type, address }) => ({
    id: deviceId,
    type,
    position: { x: 0, y: 0 },
    data: {
      ip: address,
      label: 'Manual ' + deviceId,
      description: 'Keep this text',
    },
  }))
  store.write({ source: 'inventory', topology: { nodes, edges: [] } }, 0)
  for (const target of targets) store.authorizeInterfaces(target.deviceId, '00000000-0000-0000-0000-000000000001', 1)
  const samples = fixtureGraph()
  const read = async (id, signal) => {
    await delay(3, undefined, { signal })
    return samples[idx(id)]
  }
  const service = createTopologyDiscovery(store, { read, allowed: scope, limits: { ...crawlLimits, spacingMs: 0 } })
  t.after(async () => {
    await service.stop()
    store.close()
  })
  const { id } = service.start('d0')
  assert.throws(() => service.start('d0'), /already active/)
  for (let i = 0; i < 150 && service.get(id).status === 'running'; i++) await delay(5)
  const run = service.get(id)
  assert.equal(run.status, 'complete')
  const routes = discoveryRoutes(service)
  const accepted = run.links.filter(({ confidence }) => confidence === 'verified').map(({ id }) => id)
  const body = { baseRevision: 1, ids: accepted }
  const draft = routes.accept({ store, id, body: { ...body, preview: true } }).draft
  assert.equal(service.get(id).links[0].status, 'proposed')
  assert.equal(draft.edges.length, 10)
  routes.accept({ store, id, body })
  assert.equal(store.revision(), 1)
  assert.equal(store.read().topology.edges.length, 0)
  const current = store.read()
  const merged = mergeDiscoveryDraft(current.topology, draft)
  assert.equal(merged.nodes.length, nodes.length)
  assert.equal(merged.nodes[0].data.description, 'Keep this text')
  assert.equal(merged.nodes[0].chassisKey, key(0))
  const saved = store.write({ source: 'inventory', topology: merged, monitoring: current.monitoring }, 1)
  assert.ok(Object.values(saved.monitoring).every((enabled) => !enabled))
  const next = service.start('d0').id
  service.cancel(next)
  for (let i = 0; i < 150 && service.get(next).status === 'running'; i++) await delay(5)
  assert.equal(service.get(next).status, 'partial')
  assert.ok(service.get(next).diagnostics.includes('cancelled'))
})

test('scheduled interface checks preempt a pending discovery session without forwarding credentials', async (t) => {
  const store = openStore(':memory:')
  store.write(
    {
      source: 'inventory',
      topology: {
        nodes: [
          {
            id: 'seed',
            type: 'router',
            position: { x: 0, y: 0 },
            data: { label: 'Router', ip: address(0) },
          },
        ],
        edges: [],
      },
    },
    0,
  )
  store.authorizeInterfaces('seed', '00000000-0000-0000-0000-000000000001', 1)
  let signalReady
  const entered = new Promise((resolve) => {
    signalReady = resolve
  })
  const collector = createInterfaceCollector(store, {
    enabled: true,
    platform: 'win32',
    vault: { load: async () => ({ secret: 'fixture only' }) },
    async runner(_address, _user, options) {
      if (options.discovery) {
        signalReady()
        await delay(10000, undefined, { signal: options.signal })
      }
      return { checkedAt: new Date().toISOString(), uptime: 1, interfaces: [] }
    },
  })
  t.after(async () => {
    await collector.stop()
    store.close()
  })
  const discovery = collector.topologySample('seed', new AbortController().signal)
  await entered
  const monitoring = collector.runOnce()
  assert.deepEqual(await discovery, { error: 'monitoring_busy' })
  await monitoring
  assert.equal(collector.device('seed').state, 'ok')
  assert.deepEqual(await collector.topologySample('unknown', new AbortController().signal), { error: 'cancelled' })
})

test('v11 to v12 migration requires the matching offline backup and preserves saved topology', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'netwatch-lldp-migration-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'netwatch.sqlite')
  assert.throws(
    () =>
      openStore(path, {
        migrateV12() {
          throw Error('v11 fixture')
        },
      }),
    /v11 fixture/,
  )
  const source = new DatabaseSync(path)
  const nodes = [
    {
      id: 'seed',
      type: 'router',
      position: { x: 2, y: 3 },
      data: { label: 'Saved router', ip: address(0), description: '' },
    },
  ]
  const topology = { schemaVersion: 2, nodes, edges: [] }
  source
    .prepare('UPDATE inventory SET revision=7,payload=?')
    .run(JSON.stringify({ topology, monitoring: { seed: true } }))
  source.close()
  assert.throws(() => openStore(path), /pre-v12.bak/)
  backupDatabase(path, path + '.pre-v12.bak')
  assert.throws(
    () =>
      openStore(path, {
        migrateV12() {
          throw Error('interrupted v12')
        },
      }),
    /interrupted v12/,
  )
  const before = new DatabaseSync(path)
  assert.equal(before.prepare('PRAGMA user_version').get().user_version, 11)
  assert.equal(before.prepare("SELECT name FROM sqlite_schema WHERE name='topology_runs'").get(), undefined)
  before.close()
  for (let i = 0; i < 2; i++) {
    const store = openStore(path)
    try {
      assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 12)
      assert.equal(store.revision(), 7)
      assert.deepEqual(store.read().topology, topology)
      assert.deepEqual(store.read().monitoring, { seed: true })
      assert.deepEqual(store.topologyHints(), [])
    } finally {
      store.close()
    }
  }
})

test('IP-only candidates require an explicit match and preserve hand-edited saved fields', async (t) => {
  const store = openStore(':memory:')
  const nodes = [
    { id: 'd0', type: 'router', position: { x: 0, y: 0 }, data: { label: 'Router', ip: address(0) } },
    { id: 'manual', type: 'switch', position: { x: 100, y: 0 }, data: { label: 'Chosen name', ip: address(1) } },
  ]
  store.write({ source: 'inventory', topology: { nodes, edges: [] } }, 0)
  store.authorizeInterfaces('d0', '00000000-0000-0000-0000-000000000001', 1)
  const service = createTopologyDiscovery(store, {
    read: async () => ({ ...sample(0), neighbors: [sighting(1, 1, 2)] }),
    allowed: scope,
    limits: { ...crawlLimits, spacingMs: 0 },
  })
  t.after(async () => {
    await service.stop()
    store.close()
  })
  const { id } = service.start('d0')
  while (service.get(id).status === 'running') await delay(1)
  const routes = discoveryRoutes(service)
  const { links, devices } = routes.get({ store, id })
  const peer = devices.find((device) => device.chassisKey === key(1))
  assert.deepEqual(peer.matches, [{ id: 'manual', label: 'Chosen name' }])
  const body = { baseRevision: 1, ids: [links[0].id] }
  assert.throws(() => routes.accept({ store, id, body }), /Confirm the address match/)
  const { draft } = routes.accept({ store, id, body: { ...body, matches: { [peer.id]: 'manual' } } })
  assert.equal(store.revision(), 1)
  const combined = mergeDiscoveryDraft(store.read().topology, draft)
  assert.equal(combined.nodes.length, 2)
  assert.equal(combined.nodes[1].data.label, 'Chosen name')
  assert.equal(combined.nodes[1].chassisKey, key(1))
})

test('reachability cycles continue during a large fixture crawl', async (t) => {
  const store = openStore(':memory:')
  const size = 100
  const nodes = Array.from({ length: size }, (_, i) => ({
    id: id(i),
    type: i ? 'switch' : 'router',
    position: { x: 0, y: 0 },
    data: { label: id(i), ip: address(i) },
  }))
  store.write({ source: 'inventory', topology: { nodes, edges: [] }, monitoring: { d0: true } }, 0)
  for (const node of nodes) store.authorizeInterfaces(node.id, '00000000-0000-0000-0000-000000000001', 1)
  let attempts = 0
  const nextSample = async (deviceId, signal) => {
    await delay(3, undefined, { signal })
    const i = idx(deviceId)
    const peers = [i * 2 + 1, i * 2 + 2].filter((j) => j < size)
    return { ...sample(i), neighbors: peers.map((j, n) => sighting(j, n + 2, 1)) }
  }
  const topology = createTopologyDiscovery(store, {
    read: nextSample,
    allowed: scope,
    limits: { ...crawlLimits, spacingMs: 0 },
  })
  const collector = createCollector(store, {
    enabled: true,
    platform: 'win32',
    runner: async () => {
      attempts++
      return { outcome: 'reachable', reason: 'success', latencyMs: 1 }
    },
  })
  t.after(async () => {
    await topology.stop()
    await collector.stop()
    store.close()
  })
  const { id: runId } = topology.start('d0')
  for (let i = 0; i < 3; i++) {
    await collector.runOnce()
    assert.equal(topology.get(runId).status, 'running')
  }
  assert.equal(attempts, 3)
  for (let i = 0; i < 500 && topology.get(runId).status === 'running'; i++) await delay(5)
  assert.equal(topology.get(runId).devices.length, size)
})
