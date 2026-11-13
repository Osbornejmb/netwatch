import { DatabaseSync } from 'node:sqlite'
import { validateTopology } from '../src/topology.js'

export const MAX_BODY = 5 * 1024 * 1024
export function invalid(message, status = 400) { return Object.assign(new Error(message), { status }) }
export function inventory(value) {
  if (!value || value.source !== 'inventory') throw invalid('Only explicitly selected saved devices are accepted.')
  let topology
  try { topology = validateTopology(value.topology) } catch(e) { throw invalid(e.message) }
  for (const item of [...topology.nodes, ...topology.edges]) if (item.id.length > 100) throw invalid('IDs must be at most 100 characters.')
  for (const node of topology.nodes) if (Math.abs(node.position.x) > 1e7 || Math.abs(node.position.y) > 1e7) throw invalid('Position out of range.')
  const monitoring = value.monitoring ?? {}
  if (!monitoring || Array.isArray(monitoring) || typeof monitoring !== 'object') throw invalid('Invalid monitoring settings.')
  const ids = new Set(topology.nodes.map(n => n.id))
  for (const [id, enabled] of Object.entries(monitoring)) if (!ids.has(id) || typeof enabled !== 'boolean') throw invalid('Monitoring requires an existing ID and a boolean.')
  for (const n of topology.nodes) if (monitoring[n.id] === true && !n.data.ip) throw invalid('Monitoring requires a management address.')
  return { topology, monitoring: Object.fromEntries(topology.nodes.map(n => [n.id, monitoring[n.id] === true])) }
}
export function openStore(path, { now = () => Date.now(), migrate, migrateV2, migrateV3 } = {}) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;')
  const version = db.prepare('PRAGMA user_version').get().user_version
  if (version > 3) { db.close(); throw new Error('Database schema is newer than this host. Use a compatible host; do not delete the database.') }
  try {
    if (!version) {
      db.exec('BEGIN IMMEDIATE')
      db.exec(`CREATE TABLE inventory (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE checks (seq INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('up','down')), checked_at INTEGER NOT NULL);
        CREATE INDEX checks_device_time ON checks(device_id, seq);
        CREATE INDEX checks_time ON checks(checked_at);`)
      db.prepare('INSERT INTO inventory VALUES(1,0,?,?)').run(new Date(now()).toISOString(), JSON.stringify({topology:{schemaVersion:1,nodes:[],edges:[]},monitoring:{}}))
      migrate?.(db)
      db.exec('PRAGMA user_version=1; COMMIT')
    }
  } catch (e) { try { db.exec('ROLLBACK') } catch {} db.close(); throw e }
  if (version < 2) {
    try {
      db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE checks RENAME TO checks_v1;
        CREATE TABLE checks (seq INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('up','down','unknown')), checked_at INTEGER NOT NULL,
          outcome TEXT NOT NULL CHECK(outcome IN ('reachable','unreachable')), reason TEXT NOT NULL,
          latency_ms REAL CHECK(latency_ms IS NULL OR (latency_ms >= 0 AND latency_ms <= 1500)));
        INSERT INTO checks(seq,device_id,status,checked_at,outcome,reason,latency_ms)
          SELECT seq,device_id,status,checked_at,CASE status WHEN 'up' THEN 'reachable' ELSE 'unreachable' END,'legacy',NULL FROM checks_v1;
        UPDATE sqlite_sequence SET seq=MAX(seq,COALESCE((SELECT seq FROM sqlite_sequence WHERE name='checks_v1'),0)) WHERE name='checks';
        DROP TABLE checks_v1;
        CREATE INDEX checks_device_time ON checks(device_id, seq);
        CREATE INDEX checks_time ON checks(checked_at);`)
      migrateV2?.(db)
      db.exec('PRAGMA user_version=2; COMMIT')
    } catch (error) {try {db.exec('ROLLBACK')} catch {} db.close();throw error}
  }
  if (version < 3) {
    try {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE incidents (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
          opened_at INTEGER NOT NULL, resolved_at INTEGER CHECK(resolved_at IS NULL OR resolved_at >= opened_at));
        CREATE UNIQUE INDEX incidents_active ON incidents(device_id) WHERE resolved_at IS NULL;
        CREATE INDEX incidents_device ON incidents(device_id,id);`)
      migrateV3?.(db)
      db.exec('PRAGMA user_version=3; COMMIT')
    } catch (error) {try {db.exec('ROLLBACK')} catch {} db.close();throw error}
  }
  const incidentRow = r => ({id:r.id,deviceId:r.device_id,openedAt:new Date(r.opened_at).toISOString(),resolvedAt:r.resolved_at === null ? null : new Date(r.resolved_at).toISOString()})
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result } catch (e) { db.exec('ROLLBACK'); throw e }
  }
  const read = () => { const row = db.prepare('SELECT * FROM inventory').get(); return {...JSON.parse(row.payload),revision:row.revision,updatedAt:row.updated_at} }
  const cleanup = () => {
    db.prepare('DELETE FROM incidents WHERE resolved_at < ?').run(now() - 30 * 86400000)
    db.exec('DELETE FROM incidents WHERE id IN (SELECT id FROM incidents WHERE resolved_at IS NOT NULL ORDER BY id DESC LIMIT -1 OFFSET 10000)')
    db.prepare('DELETE FROM checks WHERE checked_at < ?').run(now() - 30 * 86400000)
    const excess = db.prepare('SELECT COUNT(*) AS count FROM checks').get().count - 100000
    if (excess > 0) db.prepare('DELETE FROM checks WHERE seq IN (SELECT seq FROM checks ORDER BY seq LIMIT ?)').run(excess)
  }
  const write = (input, revision, hook) => {
    const clean = inventory(input)
    if (!Number.isSafeInteger(revision) || revision < 0) throw invalid('A nonnegative baseRevision is required.')
    return transaction(() => {
      const previous=read()
      if (previous.revision !== revision) throw invalid('Inventory changed. Preview the current host inventory before saving again.', 409)
      db.prepare('UPDATE inventory SET revision=revision+1,updated_at=?,payload=? WHERE singleton=1').run(new Date(now()).toISOString(),JSON.stringify(clean))
      // Identity/address changes invalidate observations rather than reassigning old evidence.
      const allowed = new Map(clean.topology.nodes.map(n => [n.id,`${n.type}:${n.data.ip}`]))
      for (const n of previous.topology.nodes) if (allowed.get(n.id) !== `${n.type}:${n.data.ip}`) {
        db.prepare('DELETE FROM checks WHERE device_id=?').run(n.id)
        db.prepare('DELETE FROM incidents WHERE device_id=?').run(n.id)
      }
      hook?.(db)
      return read()
    })
  }
  cleanup()
  return {
    read,
    revision: () => db.prepare('SELECT revision FROM inventory').get().revision,
    write(input, revision, hook) { return write(input,revision,hook) },
    append(observations, { revision } = {}) {
      if (!Array.isArray(observations) || observations.length > 2000) throw invalid('At most 2000 observations per batch.')
      return transaction(() => {
        const state = read()
        if (revision !== undefined && revision !== state.revision) throw invalid('Inventory changed during probe.',409)
        for (const o of observations) {
          const time = typeof o?.checkedAt === 'string' ? Date.parse(o.checkedAt) : NaN
          if (state.monitoring[o?.deviceId] !== true || !['up','down','unknown'].includes(o.status) || !Number.isFinite(time) || new Date(time).toISOString() !== o.checkedAt || time > now() || time < now()-30*86400000) throw invalid('Invalid or unauthorized observation.')
          const outcome = o.outcome ?? (o.status === 'up' ? 'reachable' : o.status === 'down' ? 'unreachable' : null)
          const latency = o.latencyMs ?? null
          const reason = o.reason ?? 'legacy'
          if (!['reachable','unreachable'].includes(outcome) || (latency !== null && (!Number.isFinite(latency) || latency < 0 || latency > 1500 || outcome !== 'reachable')) || typeof reason !== 'string' || !reason || reason.length > 80) throw invalid('Invalid reachability result or latency.')
          const latest = db.prepare('SELECT MAX(checked_at) time FROM checks WHERE device_id=?').get(o.deviceId).time
          db.prepare('INSERT INTO checks(device_id,status,checked_at,outcome,reason,latency_ms) VALUES(?,?,?,?,?,?)').run(o.deviceId,o.status,time,outcome,reason,latency)
          // Only current confirmed results change incidents; pending checks and service errors cannot resolve outages.
          if (latest === null || time >= latest) {
            if (o.status === 'down' && outcome === 'unreachable') db.prepare('INSERT INTO incidents(device_id,opened_at) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM incidents WHERE device_id=? AND resolved_at IS NULL)').run(o.deviceId,time,o.deviceId)
            if (o.status === 'up' && outcome === 'reachable') db.prepare('UPDATE incidents SET resolved_at=? WHERE device_id=? AND resolved_at IS NULL AND opened_at<=?').run(time,o.deviceId,time)
          }
        }
        cleanup()
      })
    },
    incidents(id, { before, limit = 25 } = {}) {
      return transaction(() => {
        const state=read()
        if (!state.topology.nodes.some(n=>n.id===id)) throw invalid('Device not found.',404)
        if (!Number.isSafeInteger(limit) || limit<1 || limit>200 || (before!==undefined && (!Number.isSafeInteger(before) || before<1))) throw invalid('Invalid incident pagination.')
        cleanup()
        const rows=db.prepare('SELECT * FROM incidents WHERE device_id=? AND id<? ORDER BY id DESC LIMIT ?').all(id,before ?? Number.MAX_SAFE_INTEGER,limit+1)
        const incidents=rows.slice(0,limit).map(incidentRow)
        return {revision:state.revision,incidents,nextBefore:rows.length>limit?incidents.at(-1).id:null}
      })
    },
    history(id, { before, limit = 50 } = {}) {
      return transaction(() => {
      const state=read()
      if (!state.topology.nodes.some(n => n.id === id)) throw invalid('Device not found.',404)
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || (before !== undefined && (!Number.isSafeInteger(before) || before < 1))) throw invalid('Invalid history pagination.')
      cleanup()
      const rows = db.prepare('SELECT * FROM checks WHERE device_id=? AND seq < ? ORDER BY seq DESC LIMIT ?').all(id,before ?? Number.MAX_SAFE_INTEGER,limit+1)
      const checks = rows.slice(0,limit).map(r=>({id:r.seq,deviceId:r.device_id,status:r.status,checkedAt:new Date(r.checked_at).toISOString(),outcome:r.outcome,reason:r.reason,latencyMs:r.latency_ms}))
      return {revision:state.revision,checks,nextBefore:rows.length>limit?checks.at(-1).id:null}
      })
    },
    snapshot() {
      return transaction(() => {
      cleanup()
      const observations = db.prepare('SELECT c.* FROM checks c JOIN (SELECT device_id,MAX(checked_at) time FROM checks GROUP BY device_id) latest ON c.device_id=latest.device_id AND c.checked_at=latest.time ORDER BY c.seq').all()
      return {inventory:read(),activeIncidents:db.prepare('SELECT * FROM incidents WHERE resolved_at IS NULL ORDER BY id DESC').all().map(incidentRow),generatedAt:new Date(now()).toISOString(),collector:{state:'not-implemented',lastSeenAt:null},freshness:{staleAfterMs:90000},observations:Object.values(Object.fromEntries(observations.map(r=>[r.device_id,{deviceId:r.device_id,status:r.status,checkedAt:new Date(r.checked_at).toISOString(),outcome:r.outcome,reason:r.reason,latencyMs:r.latency_ms}])))}
      })
    },
    close:()=>db.close(), db,
  }
}
