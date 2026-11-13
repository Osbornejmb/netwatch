import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { copyFileSync, renameSync, rmSync, existsSync } from 'node:fs'
import { lock, mustNotExist } from './files.js'
import { inventory } from './store.js'
import {validateInterfaces} from './interfaces.js'

export function validateDatabase(path) {
  const db=new DatabaseSync(path,{readOnly:true})
  try {
    const version=db.prepare('PRAGMA user_version').get().user_version
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok' || ![1,2,3,4].includes(version)) throw new Error('Invalid or unsupported backup database.')
    const rows=db.prepare('SELECT * FROM inventory').all()
    if(rows.length!==1 || rows[0].singleton!==1 || !Number.isSafeInteger(rows[0].revision) || rows[0].revision<0 || !Number.isFinite(Date.parse(rows[0].updated_at))) throw new Error('Invalid inventory metadata.')
    const state=inventory({source:'inventory',...JSON.parse(rows[0].payload)})
    const ids=new Set(state.topology.nodes.map(n=>n.id))
    let count=0
    for(const row of db.prepare('SELECT * FROM checks').iterate()) {
      if ('outcome' in row && (!['reachable','unreachable'].includes(row.outcome) || (row.latency_ms !== null && (!Number.isFinite(row.latency_ms) || row.latency_ms < 0 || row.latency_ms > 1500 || row.outcome !== 'reachable')) || typeof row.reason !== 'string' || !row.reason || row.reason.length > 80)) throw new Error('Invalid reachability data in backup.')
      if(++count>100000 || !ids.has(row.device_id) || !['up','down','unknown'].includes(row.status) || !Number.isSafeInteger(row.checked_at) || row.checked_at>Date.now() || !Number.isSafeInteger(row.seq) || row.seq<1) throw new Error('Invalid history in backup.')
    }
    if(version>=3) {
      const active=new Set();let resolved=0
      for(const row of db.prepare('SELECT * FROM incidents').iterate()) {
        if(!ids.has(row.device_id) || !Number.isSafeInteger(row.id) || row.id<1 || !Number.isSafeInteger(row.opened_at) || row.opened_at>Date.now() || (row.resolved_at!==null && (!Number.isSafeInteger(row.resolved_at) || row.resolved_at<row.opened_at || row.resolved_at>Date.now()))) throw new Error('Invalid incidents in backup.')
        if(row.resolved_at===null) {if(active.has(row.device_id)) throw new Error('Duplicate active incident.');active.add(row.device_id)}
        else if(++resolved>10000) throw new Error('Incident retention exceeded.')
      }
    }
    if(version>=4) {
      for(const row of db.prepare('SELECT * FROM snmp_targets').iterate())if(!ids.has(row.device_id)||!/^[a-f0-9-]{36}$/.test(row.authorization))throw new Error('Invalid interface authorization in backup.')
      let total=0
      for(const row of db.prepare('SELECT * FROM interface_samples').iterate()) {
        if(typeof row.payload!=='string'||Buffer.byteLength(row.payload)>512*1024)throw new Error('Invalid interface payload in backup.')
        const value=JSON.parse(row.payload),clean=validateInterfaces(value)
        if(Object.keys(value).some(k=>!['checkedAt','uptime','interfaces'].includes(k)))throw new Error('Unexpected interface data in backup.')
        if(!ids.has(row.device_id)||row.checked_at!==Date.parse(clean.checkedAt)||row.checked_at>Date.now()||(total+=clean.interfaces.length)>20000)throw new Error('Invalid interfaces in backup.')
        for(const item of value.interfaces){if(Object.keys(item).some(k=>!['index','name','description','admin','oper','speedBps','discontinuity','counterBits','inOctets','outOctets','inBps','outBps'].includes(k)))throw new Error('Unexpected interface fields in backup.');for(const key of ['inBps','outBps'])if(item[key]!==null&&(!Number.isFinite(item[key])||item[key]<0||item[key]>1e15))throw new Error('Invalid interface rates in backup.')}
      }
    }
    return rows[0].revision
  } finally {db.close()}
}
export function backupDatabase(path,destination) {
  const release=lock(path)
  try {
    mustNotExist(destination)
    validateDatabase(path)
    const db=new DatabaseSync(path)
    try { db.prepare('VACUUM INTO ?').run(destination) } finally {db.close()}
    validateDatabase(destination)
  } finally {release()}
}
export function restoreDatabase(path,source) {
  const release=lock(path)
  const temporary=`${path}.restoring`
  let ownsTemporary=false
  try {
    const incoming=validateDatabase(source)
    const current=existsSync(path)?validateDatabase(path):-1
    mustNotExist(temporary)
    copyFileSync(source,temporary)
    ownsTemporary=true
    const db=new DatabaseSync(temporary)
    try {db.prepare('UPDATE inventory SET revision=?,updated_at=?').run(Math.max(current,incoming)+1,new Date().toISOString());if(db.prepare('PRAGMA user_version').get().user_version>=4)db.exec('DELETE FROM snmp_targets');db.exec('PRAGMA wal_checkpoint(TRUNCATE)')} finally {db.close()}
    validateDatabase(temporary)
    // Host is stopped and lock held. SQLite checkpoint before replacing the main file.
    if(existsSync(path)) {
      const existing=new DatabaseSync(path)
      try {existing.exec('PRAGMA wal_checkpoint(TRUNCATE)')} finally {existing.close()}
    }
    renameSync(temporary,path)
  } finally {if(ownsTemporary)rmSync(temporary,{force:true});release()}
}
if(process.argv[1] && resolve(process.argv[1])===resolve(import.meta.filename)) {
  const [command,file,confirm]=process.argv.slice(2)
  if(!file || !['backup','restore'].includes(command) || (command==='restore'&&confirm!=='--confirm')) throw new Error('Usage: npm run db -- backup <new-file> | restore <backup-file> --confirm (host must be stopped)')
  const path=resolve(process.env.NETWATCH_DB||'data/netwatch.sqlite')
  if(command==='backup') backupDatabase(path,resolve(file));else restoreDatabase(path,resolve(file))
  console.log(`${command} complete.`)
}
