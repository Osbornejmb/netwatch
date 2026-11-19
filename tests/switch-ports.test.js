import test from 'node:test'
import assert from 'node:assert/strict'
import snmp from 'net-snmp'
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
const read = (tables) => readSwitchPorts(async (_method, [oid]) => [tables[oid] ?? [end]], interfaces, policy)

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
