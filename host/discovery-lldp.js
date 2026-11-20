import snmp from 'net-snmp'
import { createHash } from 'node:crypto'
import { normalizeAddress } from '../src/inventory.js'

const base = '1.0.8802.1.1.2.1'
const local = base + '.3'
const remote = base + '.4'
const identityOids = [local + '.1.0', local + '.2.0', '1.3.6.1.2.1.1.5.0', '1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.2.0']
const text = (value) =>
  Buffer.isBuffer(value) && value.length <= 255
    ? value
        .toString('utf8')
        .replace(/[\p{Cc}\p{Cf}\uFFFD]/gu, ' ')
        .trim()
        .slice(0, 100)
    : ''
const bytes = (value) => Buffer.isBuffer(value) && value.length > 0 && value.length <= 255
const mac = (value) => (bytes(value) && value.length === 6 ? value.toString('hex').match(/../g).join(':') : null)

export function chassisKey(subtype, value) {
  if (!Number.isInteger(subtype) || subtype < 1 || subtype > 7 || !bytes(value)) return null
  if (subtype === 4) return mac(value) ? 'mac:' + mac(value) : null
  return 'lldp:' + subtype + ':' + createHash('sha256').update(value).digest('hex')
}

function compareOid(left, right) {
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return left.length - right.length
}

async function table(request, root, cap) {
  let cursor = root
  let next = false
  const rows = new Map()
  for (let page = 0; page < cap + 1; page++) {
    let result
    try {
      const response = next ? await request('getNext', [cursor]) : await request('getBulk', [cursor], 0, 16)
      result = next ? response : response?.[0]
    } catch (error) {
      if (next || error.message !== 'snmp_too_big') throw error
      next = true
      continue
    }
    if (!Array.isArray(result) || !result.length || result.length > (next ? 1 : 16)) throw Error('snmp_invalid')
    for (const row of result) {
      if (snmp.isVarbindError(row) || !row.oid?.startsWith(root + '.')) return { rows, partial: false }
      const suffix = row.oid.slice(root.length + 1)
      if (!/^\d{1,10}(\.\d{1,10}){0,23}$/.test(suffix)) throw Error('snmp_invalid')
      const index = suffix.split('.').map(Number)
      if (
        index.some((n) => n > 4294967295) ||
        compareOid(
          index,
          cursor === root
            ? []
            : cursor
                .slice(root.length + 1)
                .split('.')
                .map(Number),
        ) <= 0
      )
        throw Error('snmp_invalid')
      if (rows.size >= cap) return { rows, partial: true }
      rows.set(suffix, row.value)
      cursor = row.oid
    }
  }
  return { rows, partial: true }
}

function addressFromIndex(index) {
  const [, , , family, length, ...octets] = index
  if (octets.length !== length || octets.some((n) => n > 255)) return null
  if (family === 1 && length === 4) return octets.join('.')
  if (family !== 2 || length !== 16) return null
  return normalizeAddress(
    Array.from({ length: 8 }, (_, i) => ((octets[2 * i] << 8) | octets[2 * i + 1]).toString(16)).join(':'),
  )
}

function resolvePort(interfaces, subtype, value) {
  const label = subtype === 3 ? mac(value) : text(value)
  if (!label) return { label: '', index: null }
  const field = { 1: 'alias', 3: 'mac', 5: 'name', 7: 'name' }[subtype]
  const matches = field ? interfaces.filter((port) => port[field] === label) : []
  if (matches.length !== 1) return { label, subtype, index: null }
  const { index, admin, oper, speedBps } = matches[0]
  return { label, subtype, index, admin, oper, speedBps }
}

const cdpRoot = '1.3.6.1.4.1.9.9.23.1.2.1.1'
export async function readCdp(request) {
  const columns = await Promise.all(
    [3, 4, 6, 7, 8, 9].map(async (column) => (await table(request, cdpRoot + '.' + column, 128)).rows),
  )
  const [families, addresses, ids, ports, platforms, capabilities] = columns
  return [...ids].flatMap(([suffix, id]) => {
    if (!/^\d{1,10}\.\d{1,10}$/.test(suffix)) return []
    const [index, entry] = suffix.split('.').map(Number)
    if (index < 1 || index > 2147483647 || entry < 1 || entry > 2147483647) return []
    const device = text(id),
      peerPort = text(ports.get(suffix))
    if (!device || !peerPort) return []
    const raw = addresses.get(suffix)
    const scheme = families.get(suffix)
    let address
    if (Buffer.isBuffer(raw) && scheme === 1 && raw.length === 4) address = [...raw].join('.')
    const capability = capabilities.get(suffix)
    return [
      {
        index,
        device,
        peerPort,
        ...(address && { address }),
        platform: text(platforms.get(suffix)),
        capabilities: Buffer.isBuffer(capability) && capability.length <= 4 ? capability.toString('hex') : '',
      },
    ]
  })
}

export function correlateCdp(neighbors, cdp) {
  return neighbors.map((row) => {
    const candidate = cdp.filter(
      (report) => report.index === row.localPort.index && report.address && row.addresses.includes(report.address),
    )
    if (!candidate.length) return row
    const claims = candidate.flatMap((report) => {
      const mac = report.device.toLowerCase().replace(/[:.\-]/g, '')
      const key = /^[0-9a-f]{12}$/.test(mac) ? 'mac:' + mac.match(/../g).join(':') : null
      if (key) return [key === row.chassisKey && report.peerPort === row.peerPort.label]
      if (row.name && report.device.toLowerCase() === row.name.toLowerCase())
        return [report.peerPort === row.peerPort.label]
      return []
    })
    return !claims.length
      ? row
      : { ...row, ...(claims.every(Boolean) ? { source: 'both' } : { protocolConflict: true }) }
  })
}

export async function readDiscoveryLldp(request, checkedAt) {
  const scalar = await request('get', identityOids)
  if (!Array.isArray(scalar) || scalar.length > identityOids.length) throw Error('snmp_invalid')
  const values = new Map(scalar.filter((row) => !snmp.isVarbindError(row)).map(({ oid, value }) => [oid, value]))
  const key = chassisKey(values.get(identityOids[0]), values.get(identityOids[1]))
  if (!key)
    return { checkedAt, state: 'identity_unavailable', neighbors: [], cdp: await readCdp(request).catch(() => []) }
  let partial = false
  const read = async (oid, cap = 512) => {
    const result = await table(request, oid, cap)
    partial ||= result.partial
    return result.rows
  }
  const names = await read('1.3.6.1.2.1.31.1.1.1.1')
  const aliases = await read('1.3.6.1.2.1.31.1.1.1.18')
  const macs = await read('1.3.6.1.2.1.2.2.1.6')
  const admin = await read('1.3.6.1.2.1.2.2.1.7')
  const oper = await read('1.3.6.1.2.1.2.2.1.8')
  const descriptions = await read('1.3.6.1.2.1.2.2.1.2')
  const speeds = await read('1.3.6.1.2.1.31.1.1.1.15')
  const status = (value, max) => (Number.isInteger(value) && value >= 1 && value <= max ? value : null)
  const interfaces = [...new Set([...names.keys(), ...aliases.keys(), ...macs.keys()])]
    .filter((index) => /^[1-9]\d{0,9}$/.test(index) && Number(index) <= 2147483647)
    .map((index) => ({
      index: Number(index),
      name: text(names.get(index)) || text(descriptions.get(index)),
      admin: status(admin.get(index), 3),
      oper: status(oper.get(index), 7),
      speedBps: status(speeds.get(index), 4294967295) * 1000000 || null,
      alias: text(aliases.get(index)),
      mac: mac(macs.get(index)),
    }))
  const portTypes = await read(local + '.7.1.2')
  const ports = await read(local + '.7.1.3')
  const neighborTypes = await read(remote + '.1.1.4')
  const neighbors = await read(remote + '.1.1.5')
  const remoteTypes = await read(remote + '.1.1.6')
  const remotePorts = await read(remote + '.1.1.7')
  const remoteNames = await read(remote + '.1.1.9')
  const capabilities = await read(remote + '.1.1.12')
  const management = await read(remote + '.2.1.3')
  const addresses = new Map()
  for (const suffix of management.keys()) {
    const index = suffix.split('.').map(Number)
    const address = addressFromIndex(index)
    if (!address) continue
    const tuple = index.slice(0, 3).join('.')
    if (!addresses.has(tuple)) addresses.set(tuple, new Set())
    if (addresses.get(tuple).size < 8) addresses.get(tuple).add(address)
  }
  const sightings = []
  for (const [index, value] of neighbors) {
    const tuple = index.split('.')
    const peerKey = chassisKey(neighborTypes.get(index), value)
    const remotePort = remotePorts.get(index)
    if (tuple.length !== 3 || !peerKey || !bytes(remotePort)) {
      partial = true
      continue
    }
    const capability = capabilities.get(index)
    const mask = Buffer.isBuffer(capability) && capability.length <= 4 ? (capability[0] ?? 0) : 0
    const type = mask & 0x14 ? 'other' : mask & 0x08 ? 'router' : mask & 0x20 ? 'switch' : 'other'
    const localNumber = tuple[1]
    const peerPortSubtype = remoteTypes.get(index)
    sightings.push({
      chassisKey: peerKey,
      name: text(remoteNames.get(index)),
      type,
      addresses: [...(addresses.get(index) ?? [])].sort(),
      localPort: resolvePort(interfaces, portTypes.get(localNumber), ports.get(localNumber)),
      peerPort: {
        label: peerPortSubtype === 3 ? (mac(remotePort) ?? '') : text(remotePort),
        subtype: peerPortSubtype,
        index: null,
      },
    })
  }
  const cdp = await readCdp(request).catch(() => [])
  return {
    checkedAt,
    chassisKey: key,
    name: text(values.get(identityOids[5])) || text(values.get(identityOids[2])),
    state: partial ? 'partial' : sightings.length ? 'current' : 'empty',
    neighbors: correlateCdp(sightings, cdp),
    ...(cdp.length && { cdp }),
  }
}
