import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { lock } from '../host/files.js'

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'netwatch-lock-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'db')
  return { path, directory: path + '.lock', ownerPath: join(path + '.lock', 'owner.json') }
}

test('lock records its owner, refuses a live owner and releases idempotently', (t) => {
  const { path, directory, ownerPath } = fixture(t)
  const now = Date.now()
  const release = lock(path, { now: () => now })
  assert.deepEqual(JSON.parse(readFileSync(ownerPath, 'utf8')), {
    pid: process.pid, startedAt: new Date(now).toISOString(), host: hostname(),
  })
  assert.throws(() => lock(path), /Database in use or unclean shutdown/)
  release()
  const next = lock(path)
  release()
  assert.equal(existsSync(ownerPath), true)
  next()
  assert.equal(existsSync(directory), false)
})

test('dead local owners are replaced but other hosts and fresh unreadable owners are preserved', (t) => {
  const { path, directory, ownerPath } = fixture(t)
  const now = Date.now()
  const warnings = []
  const calls = []
  const options = { isPidRunning: (pid) => { calls.push(pid); return false }, warn: (message) => warnings.push(message) }
  mkdirSync(directory)
  writeFileSync(ownerPath, '{invalid record')
  assert.throws(() => lock(path, options), /Database in use/)
  writeFileSync(ownerPath, JSON.stringify({ pid: 123, startedAt: new Date(now).toISOString(), host: hostname() + '-remote' }))
  assert.throws(() => lock(path, options), /Database in use/)
  assert.deepEqual(calls, [])
  writeFileSync(ownerPath, JSON.stringify({ pid: 123, startedAt: new Date(now).toISOString(), host: hostname() }))
  const release = lock(path, options)
  assert.ok(calls.length && calls.every(pid => pid === 123))
  assert.equal(warnings.length, 1)
  assert.equal(JSON.parse(readFileSync(ownerPath, 'utf8')).pid, process.pid)
  release()
})

test('only an old unreadable lock is reclaimed and recovery preserves unexpected files', (t) => {
  const { path, directory, ownerPath } = fixture(t)
  mkdirSync(directory)
  const old = new Date(Date.now() - 61_000)
  const extra = join(directory, 'keep.txt')
  writeFileSync(ownerPath, 'bad record')
  writeFileSync(extra, 'keep')
  utimesSync(directory, old, old)
  assert.throws(() => lock(path), /Database in use/)
  assert.equal(readFileSync(extra, 'utf8'), 'keep')
  rmSync(extra)
  utimesSync(directory, old, old)
  let warning
  const release = lock(path, { warn: (message) => { warning = message } })
  assert.match(warning, /replaced a stale database lock/)
  release()
})
