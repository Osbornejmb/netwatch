import snmp from 'net-snmp'

const bridgeIndex = '1.3.6.1.2.1.17.1.4.1.2'
const stpState = '1.3.6.1.2.1.17.2.15.1.3'
const attachedAgg = '1.2.840.10006.300.43.1.2.1.1.13'
const states = [null, 'disabled', 'blocking', 'listening', 'learning', 'forwarding', 'broken']
const validIndex = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647
const counterKeys = ['inErrors', 'outErrors', 'inDiscards', 'outDiscards']
const counter = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295

export function qualityThresholds(env = process.env) {
  const get = (key, fallback) => {
    if (env[key] === undefined) return fallback
    const value = Number(env[key])
    if (!Number.isFinite(value) || value <= 0 || value > 1e9) throw Error('Invalid ' + key + '.')
    return value
  }
  return { errors: get('NETWATCH_LINK_ERRORS_PER_SEC', 1), discards: get('NETWATCH_LINK_DISCARDS_PER_SEC', 10) }
}

// Each optional table has a separate row cap and stays inside the request and time budgets of the existing session.
async function readColumns(request, columns) {
  const rows = new Map()
  let open = Object.entries(columns).map(([name, root]) => ({ name, root, cursor: root, last: 0 }))
  for (let page = 0; page < 32 && open.length; page++) {
    const response = await request(
      'getBulk',
      open.map(({ cursor }) => cursor),
      0,
      16,
    )
    if (!Array.isArray(response) || !response.length || response.length > open.length)
      throw Error('Invalid optional SNMP table')
    open = open.filter((column, i) => {
      if (i >= response.length) return true
      const entries = response[i]
      if (!Array.isArray(entries) || !entries.length || entries.length > 16) throw Error('Invalid optional SNMP column')
      for (const row of entries) {
        if (snmp.isVarbindError(row) || !row.oid?.startsWith(column.root + '.')) return false
        const index = Number(row.oid.slice(column.root.length + 1))
        if (!validIndex(index) || index <= column.last) throw Error('Invalid optional SNMP index')
        column.last = index
        column.cursor = row.oid
        if (!rows.has(index)) rows.set(index, {})
        if (rows.size > 512) throw Error('Optional SNMP table limit')
        const expected = counterKeys.includes(column.name) ? snmp.ObjectType.Counter : snmp.ObjectType.Integer
        if (row.type === expected) rows.get(index)[column.name] = row.value
      }
      return true
    })
  }
  // Incomplete bridge walks cannot disambiguate port mappings.
  if (open.length) throw Error('Optional SNMP table incomplete')
  return rows
}

export function associateStp(rows) {
  const mapped = new Map()
  const seen = new Set()
  const ambiguous = new Set()
  for (const { ifIndex, state } of rows.values()) {
    if (!validIndex(ifIndex)) continue
    if (seen.has(ifIndex)) ambiguous.add(ifIndex)
    seen.add(ifIndex)
    if (Number.isInteger(state) && states[state]) mapped.set(ifIndex, states[state])
  }
  for (const index of ambiguous) mapped.delete(index)
  return mapped
}

export async function readLinkEvidence(request, interfaces) {
  const optional = (columns) => readColumns(request, columns).catch(() => new Map())
  const errors = await optional({
    inErrors: '1.3.6.1.2.1.2.2.1.14',
    outErrors: '1.3.6.1.2.1.2.2.1.20',
    inDiscards: '1.3.6.1.2.1.2.2.1.13',
    outDiscards: '1.3.6.1.2.1.2.2.1.19',
  })
  const stp = associateStp(await optional({ ifIndex: bridgeIndex, state: stpState }))
  const lacp = await optional({ aggregateId: attachedAgg })
  const interfaceIds = new Set(interfaces.map(({ index }) => index))
  return interfaces.flatMap(({ index }) => {
    const telemetry = { index }
    for (const key of counterKeys) {
      const sample = errors.get(index)?.[key]
      if (counter(sample)) telemetry[key] = sample
    }
    const aggregateId = lacp.get(index)?.aggregateId
    const aggregateState = interfaceIds.has(aggregateId) ? stp.get(aggregateId) : undefined
    const portState = stp.get(index)
    if ((portState || aggregateState) && !(aggregateState && portState && aggregateState !== portState))
      telemetry.stp = portState ?? aggregateState
    if (validIndex(aggregateId)) telemetry.aggregateId = aggregateId
    return Object.keys(telemetry).length > 1 ? [telemetry] : []
  })
}

export function normalizeLinkEvidence(rows, interfaces) {
  if (rows === undefined) return []
  if (!Array.isArray(rows) || rows.length > interfaces.length) throw Error('Invalid link telemetry.')
  const indices = new Set(interfaces.map(({ index }) => index))
  const seen = new Set()
  return rows.map((row) => {
    if (!indices.has(row?.index) || seen.has(row.index)) throw Error('Invalid link telemetry port.')
    seen.add(row.index)
    const result = { index: row.index }
    for (const key of counterKeys) {
      if (row[key] === undefined) continue
      if (!counter(row[key])) throw Error('Invalid link counter.')
      result[key] = row[key]
    }
    if (row.stp !== undefined) {
      if (!states.includes(row.stp) || row.stp === null) throw Error('Invalid spanning tree state.')
      result.stp = row.stp
    }
    if (row.aggregateId !== undefined) {
      if (!validIndex(row.aggregateId)) throw Error('Invalid aggregation identifier.')
      result.aggregateId = row.aggregateId
    }
    return result
  })
}

export function qualityRates(previous, current, previousPorts, currentPorts, elapsed, continuous, thresholds) {
  const old = new Map(previous.map((row) => [row.index, row]))
  const before = new Map(previousPorts.map((row) => [row.index, row]))
  const after = new Map(currentPorts.map((row) => [row.index, row]))
  return current.map((row) => {
    const prior = old.get(row.index),
      left = before.get(row.index),
      right = after.get(row.index)
    const same =
      continuous &&
      elapsed >= 1000 &&
      elapsed <= 180000 &&
      left &&
      right &&
      left.discontinuity !== null &&
      left.discontinuity === right.discontinuity &&
      left.name === right.name &&
      left.description === right.description &&
      left.oper === 1 &&
      right.oper === 1
    const rate = (a, b) =>
      same && [row[a], row[b], prior?.[a], prior?.[b]].every(counter) && row[a] >= prior[a] && row[b] >= prior[b]
        ? ((row[a] + row[b] - prior[a] - prior[b]) * 1000) / elapsed
        : null
    const errorsPerSec = rate('inErrors', 'outErrors')
    const discardsPerSec = rate('inDiscards', 'outDiscards')
    return {
      ...row,
      errorsPerSec,
      discardsPerSec,
      errorStreak:
        errorsPerSec !== null && errorsPerSec >= thresholds.errors ? Math.min(3, (prior?.errorStreak ?? 0) + 1) : 0,
      discardStreak:
        discardsPerSec !== null && discardsPerSec >= thresholds.discards
          ? Math.min(3, (prior?.discardStreak ?? 0) + 1)
          : 0,
    }
  })
}
