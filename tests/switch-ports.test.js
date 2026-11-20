import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import snmp from 'net-snmp'
import { createDiscovery } from '../host/discovery.js'
import { createInterfaceCollector } from '../host/snmp-collector.js'
import { openStore } from '../host/store.js'
import { addDiscoveredToMap, listDiscovered } from '../host/routes/discovered.js'
import { readSwitchPorts, linkScannedSwitchPorts } from '../host/switch-ports.js'

const bridge = '1.3.6.1.2.1.17.1.4.1.2'
const vlan = '1.3.6.1.2.1.17.7.1.2.2.1.2'
const legacy = '1.3.6.1.2.1.17.4.3.1.2'
const end = { type: snmp.ObjectType.EndOfMibView }
const row = (oid, value) => ({ oid, value, type: snmp.ObjectType.Integer })
const policy = { maxInterfaces: 10, repetitions: 10 }
const interfaces = [
  { index: 104, name: 'Gi1/0/4' },
  { index: 107, name: 'Gi1/0/7' },
]
const mac = '02:00:00:00:00:01'
const expected = [{ mac, index: 104, name: 'Gi1/0/4' }]
const ports = [row(bridge + '.4', 104), row(bridge + '.7', 107), end]
const read = (tables, neighbors) =>
  readSwitchPorts(async (_method, [oid]) => [tables[oid] ?? [end]], interfaces, policy, neighbors)

test('resolves VLAN-aware bridge port numbers to IF-MIB interface names', async () => {
  assert.deepEqual(await read({ [bridge]: ports, [vlan]: [row(vlan + '.10.2.0.0.0.0.1', 4), end] }), expected)
})

test('uses the standard bridge table when VLAN forwarding entries are unavailable', async () => {
  assert.deepEqual(await read({ [bridge]: ports, [legacy]: [row(legacy + '.2.0.0.0.0.1', 4), end] }), expected)
})

test('skips shared ports and MACs learned on multiple ports', async () => {
  assert.deepEqual(
    await read({
      [bridge]: ports,
      [vlan]: [
        row(vlan + '.10.2.0.0.0.0.1', 4),
        row(vlan + '.10.2.0.0.0.0.2', 4),
        row(vlan + '.20.2.0.0.0.0.1', 7),
        end,
      ],
    }),
    [],
  )
})

test('rejects a forwarding table with an unmapped port', async () => {
  await assert.rejects(read({ [bridge]: ports, [vlan]: [row(vlan + '.10.2.0.0.0.0.1', 8), end] }), /Unmapped/)
})

test('a lone MAC on a known LLDP port is still transit traffic when it differs from the peer', async () => {
  assert.deepEqual(
    await read({ [bridge]: ports, [vlan]: [row(vlan + '.10.2.0.0.0.0.2', 4), end] }, [
      { chassisMac: mac, localPort: 4, remotePort: 'port 1' },
    ]),
    [{ ...expected[0], remotePort: 'port 1' }],
  )
})

test('scan saves a switch link, updates a moved device, and leaves manual links intact', () => {
  const device = { id: 'device', data: { ip: '192.168.1.42' } }
  const sw = { id: 'switch', type: 'switch', data: { label: 'Switch A', ip: '192.168.1.3' } }
  const manual = { id: 'manual', source: 'device', target: 'router', label: 'Manual' }
  const current = { topology: { nodes: [device, sw], edges: [manual] }, revision: 1, monitoring: {} }
  let writes = 0
  const store = {
    read: () => current,
    write({ topology }, revision) {
      assert.equal(revision, 1)
      current.topology = topology
      writes++
    },
  }
  const scanned = [{ ip: device.data.ip, mac }]
  const scan = (...ports) => linkScannedSwitchPorts(store, new Map([[mac, ports]]), scanned)
  scan({ switchId: sw.id, name: 'Gi1/0/4' })
  const [, link] = current.topology.edges
  assert.equal(link.target, sw.id)
  assert.equal(link.label, 'Last seen on Gi1/0/4')
  scan({ switchId: sw.id, name: 'Gi1/0/7' })
  scan({ switchId: sw.id, name: 'Gi1/0/7' })
  scan({ switchId: sw.id, name: 'Gi1/0/4' }, { switchId: 'other', name: 'Gi1/0/9' })
  assert.equal(writes, 2)
  assert.deepEqual(current.topology.edges, [manual, { ...link, label: 'Last seen on Gi1/0/7' }])
})

test('discovery shows the matched port and adds the switch link instead of the gateway route', async (t) => {
  const store = openStore(':memory:')
  t.after(() => store.close())
  const ip = '192.168.1.42'
  const node = (id, type, ip) => ({ id, type, position: { x: 0, y: 0 }, data: { ip, label: id } })
  store.write(
    {
      source: 'inventory',
      topology: {
        schemaVersion: 1,
        nodes: [node('Switch A', 'switch', '192.168.1.3'), node('Gateway', 'router', '192.168.1.1')],
        edges: [],
      },
    },
    0,
  )
  store.recordDiscovery([{ ip, mac, source: 'neighbor' }])
  const interfaces = { switchPorts: () => new Map([[mac, [{ switchId: 'Switch A', index: 104, name: 'Gi1/0/4' }]]]) }
  const page = listDiscovered({ store, interfaces, url: new URL('http://localhost/discovered') })
  assert.deepEqual(page.devices[0].switchPort, { switch: 'Switch A', name: 'Gi1/0/4' })
  const added = await addDiscoveredToMap({
    store,
    interfaces,
    discovery: { gatewayFor: async () => '192.168.1.1' },
    id: page.devices[0].id,
    body: { baseRevision: 1 },
  })
  assert.deepEqual(added.discoveryLink, { label: 'Switch A', port: 'Gi1/0/4' })
  assert.deepEqual(
    added.topology.edges.map(({ target, label }) => [target, label]),
    [['Switch A', 'Last seen on Gi1/0/4']],
  )
})

test('adds access and LLDP trunk links, then locates a downstream device after its switch is enrolled', async (t) => {
  const store = openStore(':memory:')
  const ip = (last) => `192.168.50.${last}`
  const macFor = (last) => `02:00:00:00:00:${last.toString(16).padStart(2, '0')}`
  const switch2 = { id: 's2', type: 'switch', position: { x: 0, y: 0 }, data: { ip: ip(2), label: 'Switch 2' } }
  store.write({ source: 'inventory', topology: { nodes: [switch2], edges: [] } }, 0)
  store.authorizeInterfaces(switch2.id, randomUUID(), store.revision())
  const tables = {
    [ip(2)]: [
      [2, 2],
      [3, 2],
      [10, 3],
      [100, 4],
      [101, 2],
    ],
    [ip(3)]: [
      [2, 1],
      [10, 1],
      [100, 1],
      [101, 5],
    ],
  }
  const collector = createInterfaceCollector(store, {
    enabled: true,
    platform: 'win32',
    vault: { load: async () => ({}) },
    async runner(address) {
      const bridgePorts = [...new Set(tables[address].map(([, port]) => port))].sort((a, b) => a - b)
      const interfaces = bridgePorts.map((port) => ({
        index: port + 100,
        name: `port ${port}`,
        description: '',
        admin: 1,
        oper: 1,
        speedBps: null,
        discontinuity: null,
        counterBits: null,
        inOctets: null,
        outOctets: null,
      }))
      const forwarding = tables[address].map(([mac, port]) => row(`${vlan}.50.2.0.0.0.0.${mac}`, port))
      const mapping = bridgePorts.map((port) => row(`${bridge}.${port}`, port + 100))
      const peer =
        address === ip(2)
          ? { chassisMac: macFor(3), localPort: 2, remotePort: 'port 1' }
          : { chassisMac: macFor(2), localPort: 1, remotePort: 'port 2' }
      const switchPorts = await readSwitchPorts(
        async (_method, [oid]) => [[...(oid === bridge ? mapping : forwarding), end]],
        interfaces,
        policy,
        [peer],
      )
      t.diagnostic(
        `${address} FDB=${JSON.stringify(forwarding)} bridge=${JSON.stringify(mapping)} matches=${JSON.stringify(switchPorts)}`,
      )
      return { checkedAt: new Date().toISOString(), uptime: 10, interfaces, switchPorts }
    },
    onSwitchPorts: (ports) => linkScannedSwitchPorts(store, ports, store.recentDiscoveryAddresses(0)),
  })
  t.after(async () => {
    await collector.stop()
    store.close()
  })
  const discovery = createDiscovery(store, {
    enabled: true,
    platform: 'win32',
    interfaces: () => ({
      ethernet: [{ family: 'IPv4', address: ip(10), netmask: '255.255.255.0', mac: macFor(10).toUpperCase() }],
    }),
    runner: async () =>
      [2, 100, 101, 3]
        .map((last) => `${ip(last)} ${macFor(last).replaceAll(':', '-').toUpperCase()} dynamic`)
        .join('\n'),
    gatewayRunner: async () => '',
    nameLookup: async () => [],
    onDiscovery: async (rows) => {
      t.diagnostic(`ARP + local adapter=${JSON.stringify(rows.map(({ ip, mac }) => [ip, mac]))}`)
      await collector.runOnce()
      linkScannedSwitchPorts(store, collector.switchPorts(), rows)
    },
  })
  await discovery.runOnce()
  const page = listDiscovered({ store, interfaces: collector, url: new URL('http://localhost/discovered') })
  assert.equal(page.pendingCount, 5)
  assert.deepEqual(page.devices.find((device) => device.ip === ip(10)).switchPort, {
    switch: 'Switch 2',
    name: 'port 3',
  })
  await addDiscoveredToMap({
    store,
    discovery,
    interfaces: collector,
    body: { baseRevision: store.revision(), pendingVersion: page.pendingVersion },
  })

  function links() {
    const { nodes, edges } = store.read().topology
    const addresses = new Map(nodes.map(({ id, data }) => [id, data.ip]))
    return Object.fromEntries(
      edges.map(({ source, target, label }) => [addresses.get(source), [addresses.get(target), label]]),
    )
  }
  const firstLinks = {
    [ip(10)]: [ip(2), 'Last seen on port 3'],
    [ip(100)]: [ip(2), 'Last seen on port 4'],
    [ip(3)]: [ip(2), 'LLDP · port 2 ↔ port 1'],
  }
  assert.deepEqual(links(), firstLinks)
  const switch1 = store.read().topology.nodes.find(({ data }) => data.ip === ip(3))
  store.authorizeInterfaces(switch1.id, randomUUID(), store.revision())
  await collector.runOnce()
  t.diagnostic(`Final links=${JSON.stringify(links())}`)
  assert.deepEqual(links(), { ...firstLinks, [ip(101)]: [ip(3), 'Last seen on port 5'] })
})
