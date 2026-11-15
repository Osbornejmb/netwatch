import assert from 'node:assert/strict'
import test from 'node:test'
import { createAudit } from '../host/audit.js'
import { readAudit } from '../host/routes/audit.js'
import { openStore } from '../host/store.js'

test('audit keeps the newest 5000 rows, pages exclusively, and expires entries after 30 days', (t) => {
  const store = openStore(':memory:')
  t.after(() => store.close())
  let now = 1
  const audit = createAudit(store.db, () => now)
  for (let i = 0; i < 5001; i++) audit.record('topology_applied')
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count, MIN(id) AS first FROM audit_log').get().count, 5000)
  assert.equal(store.db.prepare('SELECT MIN(id) AS first FROM audit_log').get().first, 2)
  const page = audit.read({ limit: 2 })
  assert.deepEqual(page.entries.map((entry) => entry.id), [5001, 5000])
  assert.equal(audit.read({ before: page.nextBefore, limit: 2 }).entries[0].id, 4999)
  now += 30 * 86400000 + 1
  audit.purge()
  assert.deepEqual(audit.read(), { entries: [], nextBefore: null })
  for (const query of ['limit=0', 'limit=201', 'before=0', 'before=nope']) {
    assert.throws(() => readAudit({ store, audit, url: new URL('http://localhost/?' + query) }), { status: 400 })
  }
})

test('audit export limits fields and excludes old or unrecognized events', (t) => {
  const store = openStore(':memory:')
  t.after(() => store.close())
  let time = 1
  const audit = createAudit(store.db, () => time)
  audit.record('login_failure', { source: 'remote', ip: '192.0.2.1', detail: 'private data' })
  time += 31 * 86400000
  assert.deepEqual(audit.export().entries, [])
  audit.record('operator_write_blocked', { source: 'remote', role: 'operator', ip: '192.0.2.1', detail: 'private data' })
  audit.record('unrecognized record')
  assert.deepEqual(audit.export().entries.map((entry) => ({ ...entry })), [
    { at: time, source: 'remote', role: 'operator', action: 'operator_write_blocked' },
  ])
})
