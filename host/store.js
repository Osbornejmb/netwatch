import { DatabaseSync } from 'node:sqlite'
import { validateTopology } from '../src/topology.js'

export const MAX_BODY = 5 * 1024 * 1024
export function invalid(message, status = 400) { return Object.assign(new Error(message), { status }) }
export function inventory(value) {
  if (!value || value.source !== 'inventory') throw invalid('Only explicitly selected inventory is accepted; sample data is not inventory.')
  let topology
  try { topology = validateTopology(value.topology) } catch(e) { throw invalid(e.message) }
  for (const item of [...topology.nodes, ...topology.edges]) if (item.id.length > 100) throw invalid('IDs must be at most 100 characters.')
  for (const node of topology.nodes) if (Math.abs(node.position.x) > 1e7 || Math.abs(node.position.y) > 1e7) throw invalid('Position out of range.')
  const monitoring = value.monitoring ?? {}
  if (!monitoring || Array.isArray(monitoring) || typeof monitoring !== 'object') throw invalid('Invalid monitoring settings.')
  const ids = new Set(topology.nodes.map(n => n.id))
  for (const [id, enabled] of Object.entries(monitoring)) if (!ids.has(id) || typeof enabled !== 'boolean') throw invalid('Monitoring requires an existing ID and a boolean.')
  for (const n of topology.nodes) if (monitoring[n.id] && !n.data.ip) throw invalid('Monitoring requires a management address.')
  return { topology, monitoring: Object.fromEntries(topology.nodes.map(n => [n.id, monitoring[n.id] === true])) }
}
export function openStore(path, { now = () => Date.now(), migrate } = {}) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;')
  const version = db.prepare('PRAGMA user_version').get().user_version
  if (version > 1) { db.close(); throw new Error('Database schema is newer than this host. Use a compatible host; do not delete the database.') }
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
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result } catch (e) { db.exec('ROLLBACK'); throw e }
  }
  const read = () => { const row = db.prepare('SELECT * FROM inventory').get(); return {...JSON.parse(row.payload),revision:row.revision,updatedAt:row.updated_at} }
  const cleanup = () => {
    db.prepare('DELETE FROM checks WHERE checked_at < ?').run(now() - 30 * 86400000)
    db.exec('DELETE FROM checks WHERE seq NOT IN (SELECT seq FROM checks ORDER BY seq DESC LIMIT 100000)')
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
      for (const n of previous.topology.nodes) if (allowed.get(n.id) !== `${n.type}:${n.data.ip}`) db.prepare('DELETE FROM checks WHERE device_id=?').run(n.id)
      hook?.(db)
      return read()
    })
  }
  cleanup()
  return {
    read,
    write(input, revision, hook) { return write(input,revision,hook) },
    append(observations) {
      if (!Array.isArray(observations) || observations.length > 2000) throw invalid('At most 2000 observations per batch.')
      return transaction(() => {
        const state = read()
        for (const o of observations) {
          const time = typeof o?.checkedAt === 'string' ? Date.parse(o.checkedAt) : NaN
          if (state.monitoring[o?.deviceId] !== true || !['up','down'].includes(o.status) || !Number.isFinite(time) || new Date(time).toISOString() !== o.checkedAt || time > now() || time < now()-30*86400000) throw invalid('Invalid or unauthorized observation.')
          db.prepare('INSERT INTO checks(device_id,status,checked_at) VALUES(?,?,?)').run(o.deviceId,o.status,time)
        }
        cleanup()
      })
    },
    history(id, { before, limit = 50 } = {}) {
      if (!read().topology.nodes.some(n => n.id === id)) throw invalid('Device not found.',404)
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || (before !== undefined && (!Number.isSafeInteger(before) || before < 1))) throw invalid('Invalid history pagination.')
      cleanup()
      const rows = db.prepare('SELECT * FROM checks WHERE device_id=? AND seq < ? ORDER BY seq DESC LIMIT ?').all(id,before ?? Number.MAX_SAFE_INTEGER,limit+1)
      const checks = rows.slice(0,limit).map(r=>({id:r.seq,deviceId:r.device_id,status:r.status,checkedAt:new Date(r.checked_at).toISOString()}))
      return {checks,nextBefore:rows.length>limit?checks.at(-1).id:null}
    },
    snapshot() {
      cleanup()
      const observations = db.prepare('SELECT c.* FROM checks c JOIN (SELECT device_id,MAX(checked_at) time FROM checks GROUP BY device_id) latest ON c.device_id=latest.device_id AND c.checked_at=latest.time ORDER BY c.seq').all()
      return {generatedAt:new Date(now()).toISOString(),collector:{state:'not-implemented',lastSeenAt:null},freshness:{staleAfterMs:90000},observations:Object.values(Object.fromEntries(observations.map(r=>[r.device_id,{deviceId:r.device_id,status:r.status,checkedAt:new Date(r.checked_at).toISOString()}])))}
    },
    close:()=>db.close(), db,
  }
}
