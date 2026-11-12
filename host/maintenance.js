import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { copyFileSync, renameSync, rmSync, existsSync } from 'node:fs'
import { lock, mustNotExist } from './files.js'
import { inventory } from './store.js'

export function validateDatabase(path) {
  const db=new DatabaseSync(path,{readOnly:true})
  try {
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok' || db.prepare('PRAGMA user_version').get().user_version!==1) throw new Error('Invalid or unsupported backup database.')
    const rows=db.prepare('SELECT * FROM inventory').all()
    if(rows.length!==1 || rows[0].singleton!==1 || !Number.isSafeInteger(rows[0].revision) || rows[0].revision<0 || !Number.isFinite(Date.parse(rows[0].updated_at))) throw new Error('Invalid inventory metadata.')
    const state=inventory({source:'inventory',...JSON.parse(rows[0].payload)})
    const ids=new Set(state.topology.nodes.map(n=>n.id))
    let count=0
    for(const row of db.prepare('SELECT * FROM checks').iterate()) {
      if(++count>100000 || !ids.has(row.device_id) || !['up','down'].includes(row.status) || !Number.isSafeInteger(row.checked_at) || row.checked_at>Date.now() || !Number.isSafeInteger(row.seq) || row.seq<1) throw new Error('Invalid history in backup.')
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
    try {db.prepare('UPDATE inventory SET revision=?,updated_at=?').run(Math.max(current,incoming)+1,new Date().toISOString());db.exec('PRAGMA wal_checkpoint(TRUNCATE)')} finally {db.close()}
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
