import { randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'

function pidRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    if (error.code === 'EPERM') return true
    throw error
  }
}

function readOwner(path) {
  try {
    const info = lstatSync(path)
    if (!info.isFile() || info.size > 4096) return null
    const owner = JSON.parse(readFileSync(path, 'utf8'))
    if (
      Number.isSafeInteger(owner?.pid) &&
      owner.pid > 0 &&
      owner.pid <= 0x7fffffff &&
      typeof owner.host === 'string' &&
      typeof owner.startedAt === 'string' &&
      Number.isFinite(Date.parse(owner.startedAt))
    )
      return owner
  } catch {}
  return null
}

const sameDirectory = (a, b) => a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs

export function lock(path, { isPidRunning = pidRunning, now = Date.now, warn = console.warn } = {}) {
  mkdirSync(dirname(path), { recursive: true })
  const lockPath = `${path}.lock`
  const ownerPath = join(lockPath, 'owner.json')
  const host = hostname()
  const refusal = () =>
    new Error(
      `Database in use or unclean shutdown: ${lockPath}. Stop the host before maintenance. Remove this lock directory only after confirming no host or maintenance process is running.`,
    )
  try {
    mkdirSync(lockPath)
  } catch (error) {
    if (error.code !== 'EEXIST') throw refusal()
    let original
    const stale = () => {
      const owner = readOwner(ownerPath)
      return owner ? owner.host === host && !isPidRunning(owner.pid) : now() - original.mtimeMs > 60_000
    }
    try {
      original = lstatSync(lockPath)
      if (!original.isDirectory() || !stale()) throw refusal()
      // Only one contender may recheck and move the stale directory out of the way.
      const claim = join(lockPath, '.reclaim')
      writeFileSync(claim, '', { flag: 'wx' })
      const quarantine = lockPath + '.stale-' + randomUUID()
      let moved = false
      try {
        const current = lstatSync(lockPath)
        if (
          !sameDirectory(original, current) ||
          !stale() ||
          readdirSync(lockPath).some((name) => name !== 'owner.json' && name !== '.reclaim')
        )
          throw refusal()
        renameSync(lockPath, quarantine)
        moved = true
      } finally {
        rmSync(moved ? join(quarantine, '.reclaim') : claim, { force: true })
      }
      // shortcut: interrupted reclamation can require manual cleanup, use an OS lock if automatic crash recovery is needed here.
      rmSync(join(quarantine, 'owner.json'), { force: true })
      rmdirSync(quarantine)
      warn('NetWatch replaced a stale database lock: ' + lockPath)
      mkdirSync(lockPath)
    } catch {
      throw refusal()
    }
  }
  const ownedDirectory = lstatSync(lockPath)
  const owner = JSON.stringify({ pid: process.pid, startedAt: new Date(now()).toISOString(), host })
  try {
    writeFileSync(ownerPath, owner, { flag: 'wx' })
  } catch (error) {
    try {
      rmdirSync(lockPath)
    } catch {}
    throw error
  }
  let released = false
  return () => {
    if (released) return
    try {
      if (sameDirectory(ownedDirectory, lstatSync(lockPath))) {
        rmSync(ownerPath, { force: true })
        rmdirSync(lockPath)
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    released = true
  }
}
export function mustNotExist(path) {
  if (existsSync(path)) throw new Error('Destination already exists; choose a new backup file.')
}
