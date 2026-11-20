import { createHash } from 'node:crypto'
import { incidentAnchors } from '../src/failure-impact.js'

const day = 86400000
const pair = (link) => JSON.stringify([link.source, link.target].sort())
const name = (device) => device?.label || 'Unnamed device'
const title = (link, devices) => name(devices.get(link.source)) + ' ↔ ' + name(devices.get(link.target))

export function compareDiscovery(previous, run) {
  const devices = new Map(run.devices.map((device) => [device.chassisKey, device]))
  const known = new Map((previous?.devices ?? []).map((device) => [device.chassisKey, device]))
  const current = new Map(run.links.filter((link) => link.confidence === 'verified').map((link) => [link.id, link]))
  const prior = new Map((previous?.links ?? []).map((link) => [link.id, link]))
  const changes = []
  if (previous)
    for (const [key, device] of devices) {
      if (!known.has(key)) changes.push({ kind: 'deviceAdded', label: name(device) })
    }
  // Carry known devices and missing links across runs. Reappearance clears the missing streak.
  for (const [key, device] of known) if (!devices.has(key)) devices.set(key, device)
  const reporting = new Set(
    run.devices.filter(({ state }) => state === 'manageable').map(({ chassisKey }) => chassisKey),
  )
  const observedPairs = new Set(run.links.filter(({ confidence }) => confidence !== 'verified').map(pair))
  const unseen = [...prior.values()].filter(
    (link) =>
      !current.has(link.id) &&
      reporting.has(link.source) &&
      reporting.has(link.target) &&
      !observedPairs.has(pair(link)),
  )
  const additions = [...current.values()].filter((link) => !prior.has(link.id))
  const moved = new Set()
  for (const link of additions) {
    if (!previous) break
    const old = unseen.filter((candidate) => pair(candidate) === pair(link) && !candidate.missing)
    const samePair = additions.filter((candidate) => pair(candidate) === pair(link))
    if (old.length === 1 && samePair.length === 1) {
      moved.add(old[0].id)
      changes.push({
        kind: 'linkMoved',
        label: title(link, devices),
        before: [old[0].sourcePort.label, old[0].targetPort.label].join(' ↔ '),
        after: [link.sourcePort.label, link.targetPort.label].join(' ↔ '),
      })
    } else changes.push({ kind: 'linkAdded', label: title(link, devices) })
  }
  const eligibleMissing = new Set(unseen.map(({ id }) => id))
  for (const [id, link] of prior) {
    if (current.has(id) || moved.has(id)) continue
    const missing = eligibleMissing.has(id) ? Math.min(2, (link.missing ?? 0) + 1) : 0
    if (missing === 2 && link.missing !== 2) changes.push({ kind: 'linkMissing', label: title(link, devices) })
    current.set(id, { ...link, missing })
  }
  return {
    changes,
    baseline: { devices: [...devices.values()].slice(-2000), links: [...current.values()].slice(0, 2000) },
  }
}

export function createDynamics(db, now, transaction, changed) {
  const get = (key) => {
    const row = db.prepare('SELECT payload FROM dynamics_state WHERE key=?').get(key)
    return row && JSON.parse(row.payload)
  }
  const put = (key, value) =>
    db
      .prepare('INSERT INTO dynamics_state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload')
      .run(key, JSON.stringify(value))
  const append = (events) => {
    const insert = db.prepare('INSERT INTO topology_changes(at,payload) VALUES(?,?)')
    for (const event of events) insert.run(now(), JSON.stringify(event))
    db.prepare('DELETE FROM topology_changes WHERE at<?').run(now() - 30 * day)
    db.exec(
      'DELETE FROM topology_changes WHERE id IN (SELECT id FROM topology_changes ORDER BY id DESC LIMIT -1 OFFSET 500)',
    )
  }
  return {
    discovery(seed, run, finish) {
      const key = 'discovery:' + createHash('sha256').update(seed).digest('hex')
      transaction(() => {
        const { changes, baseline } = compareDiscovery(get(key), run)
        finish?.()
        put(key, baseline)
        db.exec(
          "DELETE FROM dynamics_state WHERE key LIKE 'discovery:%' AND rowid NOT IN (SELECT rowid FROM dynamics_state WHERE key LIKE 'discovery:%' ORDER BY rowid DESC LIMIT 16)",
        )
        append(changes)
      })
      changed()
    },
    schedule: () => get('schedule') ?? { seedId: '', intervalMinutes: 0 },
    setSchedule(value) {
      transaction(() => put('schedule', value))
      changed()
      return value
    },
    read() {
      const changes = db
        .prepare('SELECT * FROM topology_changes WHERE at>=? ORDER BY id DESC LIMIT 50')
        .all(now() - 30 * day)
        .map(({ id, at, payload }) => ({ id, at: new Date(at).toISOString(), ...JSON.parse(payload) }))
      const incidents = db
        .prepare('SELECT * FROM redundancy_incidents ORDER BY (resolved_at IS NULL) DESC, id DESC LIMIT 100')
        .all()
        .map(({ id, device_id, state, affected, opened_at, resolved_at }) => ({
          id,
          deviceId: device_id,
          state,
          affected,
          openedAt: new Date(opened_at).toISOString(),
          resolvedAt: resolved_at === null ? null : new Date(resolved_at).toISOString(),
        }))
      return { changes, incidents }
    },
    observe(topology, health) {
      if (!health) return
      const current = incidentAnchors(topology, health.redundancy)
      const known = new Map()
      for (const { deviceId, state } of health.redundancy) {
        if (!known.has(deviceId)) known.set(deviceId, [])
        known.get(deviceId).push(state)
      }
      const add = new Map(current.map((row) => [row.deviceId, row]))
      const names = new Map(topology.nodes.map((node) => [node.id, node.data.label]))
      transaction(() => {
        const at = now()
        const open = db.prepare('SELECT * FROM redundancy_incidents WHERE resolved_at IS NULL').all()
        for (const row of open) {
          const update = add.get(row.device_id)
          if (update) {
            db.prepare('UPDATE redundancy_incidents SET state=?,affected=? WHERE id=?').run(
              update.state,
              update.affected,
              row.id,
            )
            add.delete(row.device_id)
          } else {
            const states = known.get(row.device_id)
            if (!names.has(row.device_id) || !states || !states.includes('unknown'))
              db.prepare('UPDATE redundancy_incidents SET resolved_at=? WHERE id=?').run(at, row.id)
          }
        }
        for (const row of add.values())
          db.prepare('INSERT INTO redundancy_incidents(device_id,state,affected,opened_at) VALUES(?,?,?,?)').run(
            row.deviceId,
            row.state,
            row.affected,
            at,
          )
        db.prepare('DELETE FROM redundancy_incidents WHERE resolved_at<?').run(at - 30 * day)
        db.exec(
          'DELETE FROM redundancy_incidents WHERE id IN (SELECT id FROM redundancy_incidents WHERE resolved_at IS NOT NULL ORDER BY id DESC LIMIT -1 OFFSET 500)',
        )
        const previous = get('speeds') ?? {}
        const next = Object.create(null)
        const events = []
        for (const link of health.links) {
          const prior = Object.hasOwn(previous, link.id) ? previous[link.id] : undefined
          next[link.id] = { ...prior }
          for (const side of ['source', 'target']) {
            const end = link[side]
            if (!end.fresh || !end.speedBps || ['down', 'unknown', 'oneSided', 'standby'].includes(link.state)) continue
            const old = prior?.[side]
            if (old && old !== end.speedBps)
              events.push({
                kind: 'speedChanged',
                label: (names.get(end.deviceId) ?? 'Device') + ' · ' + (end.portLabel || 'Port'),
                before: old,
                after: end.speedBps,
              })
            next[link.id][side] = end.speedBps
          }
        }
        put('speeds', next)
        append(events)
      })
      changed()
    },
  }
}
