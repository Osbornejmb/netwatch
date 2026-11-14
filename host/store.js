import { DatabaseSync } from 'node:sqlite'
import { validateTopology } from '../src/topology.js'
import {validateInterfaces,interfaceRates} from './interfaces.js'
import { randomUUID } from 'node:crypto'
import { normalizeAddress } from '../src/inventory.js'
const normalizeDiscoveryIp=value=>{try{const ip=normalizeAddress(value);if(!/^\d+\.\d+\.\d+\.\d+$/.test(ip))throw Error();return ip}catch{throw invalid('Invalid discovered address.')}}
const normalizeDiscoveryMac=value=>{if(value==null)return null;if(typeof value!=='string'||!/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(value))throw invalid('Invalid discovered hardware address.');return value.toLowerCase()}
const normalizeDiscoveryName=value=>{if(value==null)return null;if(typeof value!=='string'||value.length>253||!/^[\w.-]+$/.test(value)||value.startsWith('.')||value.endsWith('.'))throw invalid('Invalid discovered name.');return value}

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
export function openStore(path, { now = () => Date.now(), migrate, migrateV2, migrateV3, migrateV4, migrateV5 } = {}) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;')
  const version = db.prepare('PRAGMA user_version').get().user_version
  if (version > 5) { db.close(); throw new Error('Database schema is newer than this host. Use a compatible host; do not delete the database.') }
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
  if(version<4) {
    try {
      db.exec('BEGIN IMMEDIATE; CREATE TABLE snmp_targets(device_id TEXT PRIMARY KEY,authorization TEXT NOT NULL); CREATE TABLE interface_samples(device_id TEXT PRIMARY KEY,checked_at INTEGER NOT NULL,payload TEXT NOT NULL);')
      migrateV4?.(db);db.exec('PRAGMA user_version=4; COMMIT')
    }catch(error){try{db.exec('ROLLBACK')}catch{}db.close();throw error}
  }
  if(version<5) {
    try {db.exec("BEGIN IMMEDIATE; CREATE TABLE discovered_devices(id TEXT PRIMARY KEY,ip TEXT NOT NULL,mac TEXT,hostname TEXT,source TEXT NOT NULL,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('new','changed','ignored','added','gone')),saved_device_id TEXT,misses INTEGER NOT NULL DEFAULT 0);");migrateV5?.(db);db.exec('PRAGMA user_version=5; COMMIT')}
    catch(error){try{db.exec('ROLLBACK')}catch{}db.close();throw error}
  }
  // Additive, idempotent index migration; no stored check row shape changes.
  try {
    db.exec('BEGIN IMMEDIATE; CREATE INDEX IF NOT EXISTS checks_device_latest ON checks(device_id,checked_at DESC,seq DESC); COMMIT')
  } catch (error) {try {db.exec('ROLLBACK')} catch {} db.close();throw error}
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
    db.prepare('DELETE FROM discovered_devices WHERE last_seen < ?').run(now()-30*86400000)
    db.exec('DELETE FROM discovered_devices WHERE rowid IN (SELECT rowid FROM discovered_devices ORDER BY last_seen DESC LIMIT -1 OFFSET 10000)')
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
        db.prepare('DELETE FROM snmp_targets WHERE device_id=?').run(n.id)
        db.prepare('DELETE FROM interface_samples WHERE device_id=?').run(n.id)
      }
      hook?.(db)
      return read()
    })
  }
  cleanup()
  return {
    read,
    revision: () => db.prepare('SELECT revision FROM inventory').get().revision,
    discoveryCounts:()=>db.prepare("SELECT COUNT(*) total,SUM(status='new') new,SUM(status='changed') changed,SUM(status='gone') gone,SUM(status='ignored') ignored,SUM(status='added') added FROM discovered_devices").get(),
    discovered({after=0,limit=100}={}) {if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw invalid('Invalid discovery pagination.');const rows=db.prepare('SELECT rowid AS cursor,* FROM discovered_devices WHERE rowid>? ORDER BY rowid LIMIT ?').all(after,limit+1);return {devices:rows.slice(0,limit).map(r=>({id:r.id,ip:r.ip,mac:r.mac,hostname:r.hostname,source:r.source,firstSeen:new Date(r.first_seen).toISOString(),lastSeen:new Date(r.last_seen).toISOString(),status:r.status,savedDeviceId:r.saved_device_id})),nextAfter:rows.length>limit?rows[limit-1].cursor:null}},
    recordDiscovery(rows) {return transaction(()=>{const seen=new Set();for(const item of rows){const ip=normalizeDiscoveryIp(item.ip),mac=normalizeDiscoveryMac(item.mac),hostname=normalizeDiscoveryName(item.hostname);if(seen.has(ip))continue;seen.add(ip);const old=db.prepare('SELECT * FROM discovered_devices WHERE ip=?').get(ip),other=mac&&db.prepare("SELECT * FROM discovered_devices WHERE mac=? AND ip<>? AND status NOT IN ('gone','ignored')").get(mac,ip),changed=!!old&&old.mac&&mac&&old.mac!==mac||!!other;const status=old?.status==='ignored'?'ignored':old?.status==='added'?'added':changed?'changed':old?.status==='changed'?'changed':'new';db.prepare(`INSERT INTO discovered_devices(id,ip,mac,hostname,source,first_seen,last_seen,status,saved_device_id,misses) VALUES(?,?,?,?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET mac=excluded.mac,hostname=excluded.hostname,source=excluded.source,last_seen=excluded.last_seen,status=excluded.status,misses=0`).run(old?.id||randomUUID(),ip,mac,hostname,item.source||'neighbor',now(),now(),status,old?.saved_device_id||null)}db.prepare("UPDATE discovered_devices SET misses=misses+1,status=CASE WHEN misses+1>=3 AND status NOT IN ('ignored','added') THEN 'gone' ELSE status END WHERE status NOT IN ('ignored','added') AND ip NOT IN ("+(seen.size?[...seen].map(()=>'?').join(','):'SELECT ip FROM discovered_devices WHERE 0')+")").run(...seen);cleanup()})},
    discoveryAction(id,action,savedDeviceId=null){const row=db.prepare('SELECT * FROM discovered_devices WHERE id=?').get(id);if(!row)throw invalid('Discovered device not found.',404);if(!['ignore','unignore','added'].includes(action))throw invalid('Invalid discovery action.');if(action==='added'&&row.status==='added')throw invalid('Device is already on the map.',409);db.prepare('UPDATE discovered_devices SET status=?,saved_device_id=COALESCE(?,saved_device_id) WHERE id=?').run(action==='ignore'?'ignored':action==='unignore'?'new':'added',savedDeviceId,id)},
    write(input, revision, hook) { return write(input,revision,hook) },
    interfaceTargets() {
      const state=read(),targets=new Map(db.prepare('SELECT * FROM snmp_targets').all().map(r=>[r.device_id,r.authorization]))
      return state.topology.nodes.filter(n=>n.data.ip&&targets.has(n.id)).map(n=>({deviceId:n.id,address:n.data.ip,type:n.type,authorization:targets.get(n.id)}))
    },
    authorizeInterfaces(id,authorization,revision) {
      return transaction(()=>{
        const state=read();if(state.revision!==revision)throw invalid('Inventory changed.',409)
        if(!state.topology.nodes.some(n=>n.id===id&&n.data.ip))throw invalid('Saved device with an address required.')
        if(authorization!==null && (typeof authorization!=='string'||!/^[a-f0-9-]{36}$/.test(authorization)))throw invalid('Invalid authorization.')
        db.prepare('DELETE FROM snmp_targets WHERE device_id=?').run(id)
        db.prepare('DELETE FROM interface_samples WHERE device_id=?').run(id)
        if(authorization!==null)db.prepare('INSERT INTO snmp_targets VALUES(?,?)').run(id,authorization)
      })
    },
    appendInterfaces(id,value,{revision,authorization}={}) {
      const clean=validateInterfaces(value),time=Date.parse(clean.checkedAt)
      if(time>now()||time<now()-180000)throw invalid('Invalid interface time.')
      return transaction(()=>{
        if(read().revision!==revision || db.prepare('SELECT authorization FROM snmp_targets WHERE device_id=?').get(id)?.authorization!==authorization)throw invalid('Interface authorization changed.',409)
        const row=db.prepare('SELECT payload,checked_at FROM interface_samples WHERE device_id=?').get(id)
        if(row&&time<=row.checked_at)throw invalid('Interface sample is not newer.')
        const payload={...clean,interfaces:interfaceRates(row?JSON.parse(row.payload):null,clean)}
        const total=db.prepare('SELECT COALESCE(SUM(json_array_length(payload,\'$.interfaces\')),0) n FROM interface_samples WHERE device_id!=?').get(id).n
        if(total+payload.interfaces.length>20000)throw invalid('Interface storage limit reached.')
        db.prepare('INSERT INTO interface_samples VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET checked_at=excluded.checked_at,payload=excluded.payload').run(id,time,JSON.stringify(payload))
      })
    },
    interfaces(id,{after=0,limit=50}={}) {
      return transaction(()=>{
        const state=read();if(!state.topology.nodes.some(n=>n.id===id))throw invalid('Device not found.',404)
        if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw invalid('Invalid interface pagination.')
        const row=db.prepare('SELECT payload FROM interface_samples WHERE device_id=?').get(id),value=row?JSON.parse(row.payload):null
        const rows=value?.interfaces.filter(r=>r.index>after)||[],interfaces=rows.slice(0,limit)
        return {revision:state.revision,configured:!!db.prepare('SELECT device_id FROM snmp_targets WHERE device_id=?').get(id),checkedAt:value?.checkedAt??null,uptime:value?.uptime??null,total:value?.interfaces.length??0,interfaces,nextAfter:rows.length>limit?interfaces.at(-1).index:null}
      })
    },
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
      const state=read()
      const latest=db.prepare('SELECT * FROM checks WHERE device_id=? ORDER BY checked_at DESC,seq DESC LIMIT 1')
      const observations=state.topology.nodes.map(node=>latest.get(node.id)).filter(Boolean)
      return {inventory:state,activeIncidents:db.prepare('SELECT * FROM incidents WHERE resolved_at IS NULL ORDER BY id DESC').all().map(incidentRow),generatedAt:new Date(now()).toISOString(),collector:{state:'not-implemented',lastSeenAt:null},freshness:{staleAfterMs:90000},observations:observations.map(r=>({deviceId:r.device_id,status:r.status,checkedAt:new Date(r.checked_at).toISOString(),outcome:r.outcome,reason:r.reason,latencyMs:r.latency_ms}))}
      })
    },
    close:()=>db.close(), db,
  }
}
