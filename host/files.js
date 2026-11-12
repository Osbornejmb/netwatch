import { mkdirSync, rmdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
export function lock(path) {
  mkdirSync(dirname(path),{recursive:true})
  const lockPath=`${path}.lock`
  try {mkdirSync(lockPath)} catch {throw new Error(`Database in use or unclean shutdown: ${lockPath}. Stop the host before maintenance. Remove this lock directory only after confirming no host or maintenance process is running.`)}
  let released=false
  return ()=>{if(!released){rmdirSync(lockPath);released=true}}
}
export function mustNotExist(path) {if(existsSync(path)) throw new Error('Destination already exists; choose a new backup file.')}
