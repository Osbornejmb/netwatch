import { createHash } from 'node:crypto'
import snmp from 'net-snmp'
import { chassisKey as normalizeChassis } from './discovery-lldp.js'

const ROOT = '1.0.8802.1.1.2.1.4.1.1'
const FIELDS = [4, 5, 6, 7, 9].map((column) => `${ROOT}.${column}`)
const MAX_ROWS = 64
const REPEATS = 12
const text = (buffer) =>
  buffer
    .toString('utf8')
    .replace(/[\p{Cc}\p{Cf}\uFFFD]/gu, ' ')
    .trim()
    .slice(0, 80)
const hash = (fields) => createHash('sha256').update(JSON.stringify(fields)).digest('hex')

export async function readLldp(request, checkedAt) {
  const rows = new Map()
  const compare = (a, b) => {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return 0
  }
  let partial = false
  let columns = FIELDS.map((root, field) => ({ root, field, cursor: root, last: [-1, -1, -1] }))
  for (let page = 0; columns.length && page < 6; page++) {
    const result = await request(
      'getBulk',
      columns.map(({ cursor }) => cursor),
      0,
      REPEATS,
    )
    if (!Array.isArray(result) || !result.length || result.length > columns.length) throw Error('Invalid LLDP response')
    columns = columns.filter((column, i) => {
      if (i >= result.length) return true
      if (!Array.isArray(result[i]) || !result[i].length || result[i].length > REPEATS)
        throw Error('Invalid LLDP column')
      for (const value of result[i]) {
        if (snmp.isVarbindError(value) || !value.oid?.startsWith(column.root + '.')) return false
        const suffix = value.oid.slice(column.root.length + 1)
        if (!/^\d{1,10}\.\d{1,10}\.\d{1,10}$/.test(suffix)) throw Error('Invalid LLDP index')
        const index = suffix.split('.').map(Number)
        if (index.some((part) => part > 4294967295) || index[1] < 1 || index[2] < 1 || compare(index, column.last) <= 0)
          throw Error('Invalid LLDP index')
        column.last = index
        column.cursor = value.oid
        if (!rows.has(suffix)) {
          if (rows.size >= MAX_ROWS) {
            partial = true
            continue
          }
          rows.set(suffix, { localPort: index[1], values: [] })
        }
        const valid =
          column.field === 0 || column.field === 2
            ? value.type === snmp.ObjectType.Integer &&
              Number.isInteger(value.value) &&
              value.value >= 1 &&
              value.value <= 7
            : value.type === snmp.ObjectType.OctetString && Buffer.isBuffer(value.value) && value.value.length <= 255
        if (valid) rows.get(suffix).values[column.field] = value.value
        else partial = true
      }
      return true
    })
  }
  const neighbors = new Map()
  for (const {
    localPort,
    values: [chassisType, chassis, portType, port, name],
  } of rows.values()) {
    if (
      !chassisType ||
      !chassis?.length ||
      !portType ||
      !port?.length ||
      (chassisType === 4 && chassis.length !== 6) ||
      (portType === 3 && port.length !== 6)
    ) {
      partial = true
      continue
    }
    const chassisKey = hash([chassisType, chassis.toString('hex')])
    const id = hash([localPort, chassisKey, portType, port.toString('hex')])
    const chassisMac = chassisType === 4 ? chassis.toString('hex').match(/../g).join(':') : null
    neighbors.set(id, {
      id,
      chassisKey,
      normalizedChassisKey: normalizeChassis(chassisType, chassis),
      localPort,
      chassis: chassisMac ?? (text(chassis) || chassis.toString('hex').slice(0, 80)),
      ...(chassisMac && { chassisMac }),
      remotePort:
        portType === 3 ? port.toString('hex').match(/../g).join(':') : text(port) || port.toString('hex').slice(0, 80),
      name: name ? text(name) : '',
    })
  }
  return {
    checkedAt,
    state: partial || columns.length ? 'partial' : neighbors.size ? 'current' : 'empty',
    neighbors: [...neighbors.values()],
  }
}
