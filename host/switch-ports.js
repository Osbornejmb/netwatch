import { createHash } from 'node:crypto'
import snmp from 'net-snmp'
import { connectionKey } from '../src/connections.js'

const BRIDGE_PORT_INDEX = '1.3.6.1.2.1.17.1.4.1.2'
const VLAN_FDB_PORT = '1.3.6.1.2.1.17.7.1.2.2.1.2'
const BRIDGE_FDB_PORT = '1.3.6.1.2.1.17.4.3.1.2'

const positive = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647

async function walk(request, root, repetitions, limit, consume) {
  let cursor = root
  let previous = []
  let count = 0
  for (;;) {
    const result = await request('getBulk', [cursor], 0, repetitions)
    const rows = result?.[0]
    if (!Array.isArray(rows) || !rows.length || rows.length > repetitions || result.length !== 1)
      throw new Error('Invalid bridge table response')
    for (const row of rows) {
      if (snmp.isVarbindError(row)) {
        if (row.type === snmp.ObjectType.EndOfMibView || !count) return count
        throw new Error('Incomplete bridge table')
      }
      if (typeof row.oid !== 'string') throw new Error('Invalid bridge table OID')
      if (!row.oid.startsWith(root + '.')) return count
      const parts = row.oid.slice(root.length + 1).split('.')
      const index = parts.map(Number)
      const firstDifference = index.findIndex((value, i) => value !== previous[i])
      if (
        parts.some((part) => !/^\d{1,10}$/.test(part)) ||
        (previous.length && (firstDifference === -1 || index[firstDifference] <= previous[firstDifference])) ||
        row.type !== snmp.ObjectType.Integer ||
        !Number.isInteger(row.value) ||
        row.value < 0 ||
        row.value > 2147483647 ||
        ++count > limit
      )
        throw new Error('Invalid or incomplete bridge table')
      consume(index, row.value)
      previous = index
      cursor = row.oid
    }
  }
}

export async function readSwitchPorts(request, interfaces, policy, neighbors = [], cdp = []) {
  const indexes = new Map()
  const names = new Map(interfaces.map(({ index, name }) => [index, name]))
  await walk(request, BRIDGE_PORT_INDEX, policy.repetitions, policy.maxInterfaces, (suffix, index) => {
    if (suffix.length !== 1 || !positive(suffix[0]) || !positive(index)) throw new Error('Invalid bridge port')
    indexes.set(suffix[0], index)
  })
  const macsByPort = new Map()
  function addMac(bytes, bridgePort) {
    if (bytes.length !== 6 || bytes.some((byte) => byte < 0 || byte > 255)) throw new Error('Invalid MAC')
    if (!bridgePort || bytes[0] & 1 || bytes.every((byte) => byte === 0)) return
    const index = indexes.get(bridgePort)
    if (!index) throw new Error('Unmapped bridge port')
    if (!macsByPort.has(index)) macsByPort.set(index, new Set())
    macsByPort.get(index).add(bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(':'))
  }
  if (!indexes.size) return []
  const vlanRows = await walk(request, VLAN_FDB_PORT, policy.repetitions, 2048, (suffix, port) => {
    if (suffix[0] < 0 || suffix[0] > 4294967295) throw new Error('Invalid forwarding database')
    addMac(suffix.slice(1), port)
  })
  if (!vlanRows) await walk(request, BRIDGE_FDB_PORT, policy.repetitions, 2048, addMac)
  const neighborsByIndex = new Map()
  for (const peer of neighbors) {
    if (!peer.chassisMac || !peer.remotePort) continue
    const index = indexes.get(peer.localPort)
    if (!index) continue
    neighborsByIndex.set(index, neighborsByIndex.has(index) ? null : peer)
  }
  const cdpPorts = new Set(cdp.filter(({ index }) => names.has(index)).map(({ index }) => index))
  const byMac = new Map()
  for (const [index, macs] of macsByPort) {
    for (const mac of macs) {
      const name = names.get(index)
      const port =
        macs.size === 1 && !neighborsByIndex.has(index) && !cdpPorts.has(index) && name ? { index, name } : null
      byMac.set(mac, byMac.has(mac) ? null : port)
    }
  }
  // LLDP locates the adjacent peer. Other MACs on that interface may be downstream.
  const direct = new Map()
  for (const [index, peer] of neighborsByIndex) {
    const name = names.get(index)
    if (!name || !peer) continue
    direct.set(peer.chassisMac, direct.has(peer.chassisMac) ? null : { index, name, remotePort: peer.remotePort })
  }
  for (const [mac, port] of direct) byMac.set(mac, port)
  const cdpNeighbors = cdp.flatMap(({ index, address, peerPort }) => {
    const name = names.get(index)
    return name && address ? [{ peerIp: address, index, name, remotePort: peerPort, protocol: 'CDP' }] : []
  })
  return [...byMac].flatMap(([mac, port]) => (port ? [{ mac, ...port }] : [])).concat(cdpNeighbors)
}

export function switchPortFor(ports, node, discovery) {
  if (node.data.ip !== discovery.ip) return null
  const cdp = ports.get('ip:' + discovery.ip)?.filter(({ switchId }) => switchId !== node.id)
  if (cdp?.length) return cdp.length === 1 ? cdp[0] : null
  if (!discovery.mac) return null
  const matches = ports.get(discovery.mac)?.filter(({ switchId }) => switchId !== node.id)
  const direct = matches?.filter(({ remotePort }) => remotePort)
  if (direct?.length) return direct.length === 1 ? direct[0] : null
  return matches?.length === 1 ? matches[0] : null
}

export function saveSwitchPortLink(topology, node, port) {
  const owner = topology.nodes.find(({ id, type }) => id === port.switchId && type === 'switch')
  if (!owner) return null
  const id = 'discovery-port-' + createHash('sha256').update(node.id).digest('hex')
  const label = port.remotePort
    ? `${port.protocol ?? 'LLDP'} · ${port.name.slice(0, 45)} ↔ ${port.remotePort.slice(0, 45)}`
    : `Last seen on ${port.name}`.slice(0, 100)
  const link = { id, source: node.id, target: owner.id, label }
  const key = connectionKey(link)
  const index = topology.edges.findIndex((edge) => edge.id === id)
  if (index >= 0) {
    const prior = topology.edges[index]
    if (
      prior.source !== node.id ||
      !(
        prior.label.startsWith('Last seen on ') ||
        prior.label.startsWith('LLDP · ') ||
        prior.label.startsWith('CDP · ')
      ) ||
      prior.uplink ||
      prior.role !== undefined ||
      topology.groups?.some((group) => group.links.includes(id))
    )
      return null
  }
  const existing = topology.edges.find((edge) => edge !== topology.edges[index] && connectionKey(edge) === key)
  if (existing || (index < 0 && topology.edges.length >= 10000)) return null
  if (index >= 0 && topology.edges[index].target === link.target && topology.edges[index].label === link.label)
    return null
  if (index < 0) topology.edges.push(link)
  else topology.edges[index] = link
  return { label: owner.data.label || owner.data.ip, port: port.name }
}

export function linkScannedSwitchPorts(store, ports, rows) {
  if (!ports.size) return
  const current = store.read()
  const topology = { ...current.topology, edges: [...current.topology.edges] }
  const byIp = new Map()
  for (const node of topology.nodes) byIp.set(node.data.ip, node)
  let changed = false
  for (const row of rows) {
    const node = byIp.get(row.ip)
    const port = node && switchPortFor(ports, node, row)
    if (port && saveSwitchPortLink(topology, node, port)) changed = true
  }
  if (changed) {
    const original = new Map(current.topology.edges.map((edge) => [edge.id, edge]))
    const hints = topology.edges
      .filter((edge) => original.get(edge.id) !== edge)
      .map((edge) => ({
        ...edge,
        id:
          'hint-' +
          createHash('sha256')
            .update(JSON.stringify([edge.source, edge.target, edge.label]))
            .digest('hex'),
      }))
    store.recordTopologyHints(hints)
  }
}
