import { BlockList, isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash, randomUUID } from 'node:crypto'
import { invalid } from './store.js'

const privateRanges = new BlockList()
for (const [network, prefix, family] of [
  ['10.0.0.0', 8, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['fc00::', 7, 'ipv6'],
])
  privateRanges.addSubnet(network, prefix, family)
const family = (address) => (isIP(address) === 4 ? 'ipv4' : 'ipv6')
const privateAddress = (address) => !!isIP(address) && privateRanges.check(address, family(address))

export function discoveryScope({ interfaces = networkInterfaces(), additional = '' } = {}) {
  const networks = new BlockList()
  const add = (cidr) => {
    const [ip, bits, extra] = cidr.split('/')
    const prefix = Number(bits)
    if (
      extra !== undefined ||
      !/^\d{1,3}$/.test(bits) ||
      !privateAddress(ip) ||
      prefix < (family(ip) === 'ipv4' ? 8 : 7) ||
      prefix > (family(ip) === 'ipv4' ? 32 : 128)
    )
      return false
    networks.addSubnet(ip, prefix, family(ip))
    return true
  }
  for (const entries of Object.values(interfaces))
    for (const entry of entries ?? []) if (!entry.internal && entry.cidr) add(entry.cidr)
  const supplied = additional ? additional.split(',').map((value) => value.trim()) : []
  if (supplied.length > 32 || supplied.some((cidr) => !add(cidr))) throw Error('Invalid topology discovery scope.')
  return (ip) => privateAddress(ip) && networks.check(ip, family(ip))
}

const stable = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const crawlLimits = Object.freeze({
  devices: 200,
  depth: 8,
  neighbors: 512,
  proposals: 2000,
  deadlineMs: 300000,
  spacingMs: 100,
})
export function configuredCrawlLimits(env = process.env) {
  const result = { ...crawlLimits }
  for (const [name, maximum] of Object.entries({ devices: 200, depth: 8, neighbors: 512, deadlineMs: 300000 })) {
    const key =
      'NETWATCH_LLDP_' +
      { devices: 'MAX_DEVICES', depth: 'MAX_DEPTH', neighbors: 'MAX_NEIGHBORS', deadlineMs: 'TIME_MS' }[name]
    if (env[key] === undefined) continue
    const value = Number(env[key])
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw Error('Invalid ' + key + '.')
    result[name] = value
  }
  return result
}
const chassis = (key) =>
  typeof key === 'string' && /^(mac:(?:[a-f\d]{2}:){5}[a-f\d]{2}|lldp:[1-7]:[a-f\d]{64})$/.test(key)
const text = (value) =>
  typeof value === 'string'
    ? value
        .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
        .trim()
        .slice(0, 80)
    : ''
const port = (value) => ({
  label: text(value?.label),
  ...(Number.isInteger(value?.admin) && value.admin >= 1 && value.admin <= 3 && { admin: value.admin }),
  ...(Number.isInteger(value?.oper) && value.oper >= 1 && value.oper <= 7 && { oper: value.oper }),
  ...(Number.isSafeInteger(value?.speedBps) && value.speedBps > 0 && { speedBps: value.speedBps }),
  ...(Number.isInteger(value?.subtype) && value.subtype >= 1 && value.subtype <= 7 && { subtype: value.subtype }),
  index: Number.isInteger(value?.index) && value.index > 0 && value.index <= 2147483647 ? value.index : null,
})

export async function crawlTopology({
  seed,
  targets,
  read,
  allowed,
  signal,
  now = Date.now,
  limits = crawlLimits,
  onProgress,
}) {
  const deadline = now() + limits.deadlineMs
  const devices = new Map()
  const sightings = new Map()
  const cdpReports = []
  const byAddress = new Map(targets.map((target) => [target.address, target]))
  const queue = [{ target: seed, depth: 0, expected: null }]
  const queued = new Set([seed.deviceId])
  const attempted = new Set()
  const diagnostics = new Set()
  const ensure = (key) => {
    if (!devices.has(key)) {
      if (devices.size >= limits.proposals) return null
      devices.set(key, {
        id: stable(['device', key]),
        chassisKey: key,
        label: '',
        addresses: [],
        type: 'other',
        state: 'unmanaged',
        status: 'proposed',
      })
    }
    return devices.get(key)
  }
  while (queue.length && !signal.aborted && now() < deadline && attempted.size < limits.devices) {
    const { target, depth, expected } = queue.shift()
    if (expected && devices.get(expected)?.state === 'manageable') continue
    attempted.add(target.deviceId)
    onProgress?.({ queried: attempted.size, devices: devices.size, queued: queue.length })
    let result
    try {
      result = await read(target.deviceId, signal, target)
    } catch {
      result = { error: 'snmp_failed' }
    }
    if (signal.aborted) break
    if (Array.isArray(result?.cdp) && cdpReports.length < 512) {
      for (const entry of result.cdp.slice(0, Math.min(128, 512 - cdpReports.length))) {
        if (!Number.isInteger(entry.index) || entry.index < 1 || entry.index > 2147483647) continue
        cdpReports.push({
          reporterId: target.deviceId,
          sourceProtocol: 'cdp',
          index: entry.index,
          device: text(entry.device),
          peerPort: text(entry.peerPort),
          platform: text(entry.platform),
          ...(typeof entry.address === 'string' && isIP(entry.address) && { address: entry.address }),
          ...(typeof entry.capabilities === 'string' &&
            /^[a-f\d]{2,8}$/.test(entry.capabilities) && { capabilities: entry.capabilities }),
        })
      }
    }
    if (!chassis(result?.chassisKey) || (expected && result.chassisKey !== expected)) {
      const reason =
        expected && chassis(result?.chassisKey)
          ? 'identity_conflict'
          : [
                'cancelled',
                'credentials_unavailable',
                'credentials_rejected',
                'collection_unavailable',
                'snmp_timeout',
                'snmp_limit',
                'snmp_failed',
                'monitoring_busy',
              ].includes(result?.error)
            ? result.error
            : 'identity_unavailable'
      diagnostics.add(reason)
      if (expected && devices.has(expected)) devices.get(expected).reason = reason
      continue
    }
    const device = ensure(result.chassisKey)
    if (!device) {
      diagnostics.add('proposal_limit')
      break
    }
    Object.assign(device, {
      state: 'manageable',
      depth,
      label: device.label || text(result.name),
      type: target.type,
      enrolledId: target.deviceId,
    })
    if (!device.addresses.includes(target.address) && device.addresses.length < 8) device.addresses.push(target.address)
    delete device.reason
    if (result.state === 'empty') diagnostics.add('empty_lldp')
    if (result.state === 'partial' || result.neighbors?.length > limits.neighbors) diagnostics.add('neighbor_limit')
    for (const row of (Array.isArray(result.neighbors) ? result.neighbors : []).slice(0, limits.neighbors)) {
      if (!chassis(row.chassisKey) || row.chassisKey === device.chassisKey) continue
      if (sightings.size >= limits.proposals) {
        diagnostics.add('proposal_limit')
        break
      }
      const peer = ensure(row.chassisKey)
      if (!peer) {
        diagnostics.add('proposal_limit')
        break
      }
      const addresses = (Array.isArray(row.addresses) ? row.addresses : [])
        .slice(0, 8)
        .filter((address) => typeof address === 'string' && isIP(address))
      peer.addresses = [...new Set([...peer.addresses, ...addresses])].slice(0, 8)
      if (peer.depth === undefined || peer.depth > depth + 1) {
        peer.depth = depth + 1
        peer.via = device.chassisKey
      }
      if (!peer.label) peer.label = text(row.name)
      if (peer.state !== 'manageable' && ['switch', 'router'].includes(row.type)) peer.type = row.type
      const local = port(row.localPort),
        remote = port(row.peerPort)
      const endpoints = [
        [device.chassisKey, local.label, local.index],
        [peer.chassisKey, remote.label, remote.index],
      ]
      const id = stable(endpoints)
      sightings.set(id, {
        source: device.chassisKey,
        target: peer.chassisKey,
        local,
        remote,
        checkedAt: result.checkedAt,
        sourceProtocol: row.source === 'both' ? 'both' : 'lldp',
        ...(row.protocolConflict === true && { protocolConflict: true }),
      })
      if (peer.state === 'manageable' || !['router', 'switch'].includes(row.type)) continue
      const eligible = addresses
        .filter(allowed)
        .map((address) => byAddress.get(address))
        .find(Boolean)
      if (!eligible) {
        peer.reason ??= addresses.some(allowed)
          ? 'not_enrolled'
          : addresses.length
            ? 'outside_scope'
            : 'no_management_address'
        continue
      }
      if (depth >= limits.depth) {
        diagnostics.add('depth_limit')
        continue
      }
      if (queued.has(eligible.deviceId)) continue
      queued.add(eligible.deviceId)
      queue.push({ expected: peer.chassisKey, target: eligible, depth: depth + 1 })
    }
    onProgress?.({ queried: attempted.size, devices: devices.size, queued: queue.length })
    if (queue.length && limits.spacingMs) await delay(limits.spacingMs, undefined, { signal }).catch(() => {})
  }
  if (signal.aborted) diagnostics.add('cancelled')
  else if (now() >= deadline) diagnostics.add('time_limit')
  else if (queue.length && attempted.size >= limits.devices) diagnostics.add('device_limit')
  const directed = new Map()
  for (const sighting of sightings.values()) {
    const pair = JSON.stringify([sighting.source, sighting.target])
    if (!directed.has(pair)) directed.set(pair, [])
    directed.get(pair).push(sighting)
  }
  const links = new Map()
  for (const row of sightings.values()) {
    const reverse = directed.get(JSON.stringify([row.target, row.source])) ?? []
    const paired = reverse.filter(
      (candidate) =>
        row.local.label &&
        row.remote.label &&
        candidate.local.label === row.remote.label &&
        candidate.remote.label === row.local.label &&
        (!candidate.local.subtype || !row.remote.subtype || candidate.local.subtype === row.remote.subtype) &&
        (!candidate.remote.subtype || !row.local.subtype || candidate.remote.subtype === row.local.subtype),
    )
    const reciprocal = paired.length === 1 ? paired[0] : null
    const targetPort = reciprocal?.local ?? row.remote
    const confidence =
      row.protocolConflict || reciprocal?.protocolConflict
        ? 'conflict'
        : reciprocal && row.local.index && targetPort.index
          ? 'verified'
          : reverse.length && !reciprocal
            ? 'conflict'
            : !row.local.index || (reciprocal && !targetPort.index)
              ? 'unresolved_port'
              : 'single_sided'
    const ends = [
      [row.source, row.local],
      [row.target, targetPort],
    ].sort(([a], [b]) => a.localeCompare(b))
    const id = stable(
      ends.map(([chassisKey, port]) => [
        chassisKey,
        port.index === null ? ['reported', port.subtype ?? 0, port.label] : ['index', port.index],
      ]),
    )
    links.set(id, {
      id,
      source: ends[0][0],
      target: ends[1][0],
      sourcePort: ends[0][1],
      targetPort: ends[1][1],
      confidence,
      sourceProtocol: row.sourceProtocol === 'both' || reciprocal?.sourceProtocol === 'both' ? 'both' : 'lldp',
      status: 'proposed',
      evidence: reciprocal ? [row, reciprocal] : [row],
    })
  }
  return {
    devices: [...devices.values()],
    links: [...links.values()],
    diagnostics: [...diagnostics],
    ...(cdpReports.length && { cdpReports }),
  }
}

export function createTopologyDiscovery(store, { read, allowed, limits = crawlLimits, now = Date.now, audit }) {
  const db = store.db
  let active
  db.prepare(
    "UPDATE topology_runs SET status='partial', payload=json_set(payload,'$.diagnostics',json_array('interrupted')) WHERE status='running'",
  ).run()
  const get = (id) => {
    const row = db.prepare('SELECT * FROM topology_runs WHERE id=?').get(id)
    if (!row) throw invalid('Discovery run not found.', 404)
    return {
      id,
      seedId: row.seed_id,
      status: row.status,
      startedAt: new Date(row.started_at).toISOString(),
      ...JSON.parse(row.payload),
      ...(active?.id === id && { progress: active.progress }),
    }
  }
  return {
    get,
    latest: () => {
      const row = db.prepare('SELECT id FROM topology_runs ORDER BY rowid DESC LIMIT 1').get()
      return row ? get(row.id) : null
    },
    seeds: () =>
      store
        .interfaceTargets()
        .filter((target) => allowed(target.address))
        .map(({ deviceId }) => deviceId),
    start(seedId) {
      if (active) throw invalid('A discovery run is already active.', 409)
      const targets = store.interfaceTargets()
      const seed = targets.find((target) => target.deviceId === seedId)
      if (!seed || !allowed(seed.address)) throw invalid('Choose an enrolled device within the discovery scope.')
      const id = randomUUID(),
        controller = new AbortController()
      const empty = { devices: [], links: [], diagnostics: [] }
      db.prepare("INSERT INTO topology_runs VALUES(?,?,?,'running',?)").run(id, seedId, now(), JSON.stringify(empty))
      db.exec(
        'DELETE FROM topology_runs WHERE rowid NOT IN (SELECT rowid FROM topology_runs ORDER BY rowid DESC LIMIT 10)',
      )
      active = { id, controller, progress: { queried: 0, devices: 0, queued: 1 } }
      const budget = setTimeout(() => controller.abort('time_limit'), limits.deadlineMs)
      active.done = crawlTopology({
        seed,
        targets,
        read,
        allowed,
        signal: controller.signal,
        limits,
        now,
        onProgress: (progress) => {
          active.progress = progress
        },
      })
        .then((result) => {
          if (controller.signal.reason === 'time_limit')
            result.diagnostics = result.diagnostics.filter((code) => code !== 'cancelled').concat('time_limit')
          const partial = controller.signal.aborted || result.diagnostics.some((code) => code !== 'empty_lldp')
          const currentIds = new Set([...result.devices, ...result.links].map((item) => item.id))
          const older = db
            .prepare('SELECT id,payload FROM topology_runs WHERE id!=? ORDER BY rowid DESC LIMIT 9')
            .all(id)
          for (const row of older) {
            const previous = JSON.parse(row.payload)
            const superseded = [...previous.devices, ...previous.links].filter(
              (item) => item.status === 'proposed' && currentIds.has(item.id),
            )
            if (!superseded.length) continue
            for (const item of superseded) item.status = 'superseded'
            db.prepare('UPDATE topology_runs SET payload=? WHERE id=?').run(JSON.stringify(previous), row.id)
          }
          db.prepare('UPDATE topology_runs SET status=?,payload=? WHERE id=?').run(
            partial ? 'partial' : 'complete',
            JSON.stringify(result),
            id,
          )
        })
        .catch(() => {
          db.prepare("UPDATE topology_runs SET status='partial',payload=? WHERE id=?").run(
            JSON.stringify({ ...empty, diagnostics: ['snmp_failed'] }),
            id,
          )
        })
        .finally(() => {
          clearTimeout(budget)
          active = null
          audit?.record('topology_discovery_completed')
        })
      return get(id)
    },
    cancel(id) {
      if (active?.id !== id || active.controller.signal.aborted) throw invalid('There is no active run to cancel.', 409)
      active.controller.abort('cancelled')
      return get(id)
    },
    review(id, proposalIds, status) {
      const run = get(id)
      if (run.status === 'running') throw invalid('Wait for the discovery run to finish.', 409)
      const ids = new Set(proposalIds)
      const proposals = [...run.links, ...run.devices].filter((item) => ids.has(item.id) && item.status === 'proposed')
      if (!ids.size || ids.size !== proposals.length) throw invalid('Some proposals have already changed.', 409)
      for (const item of proposals) item.status = status
      const { devices, diagnostics, cdpReports } = run
      db.prepare('UPDATE topology_runs SET payload=? WHERE id=?').run(
        JSON.stringify({ devices, links: run.links, diagnostics, ...(cdpReports?.length && { cdpReports }) }),
        id,
      )
      return proposals
    },
    async stop() {
      active?.controller.abort('cancelled')
      await active?.done
    },
  }
}
