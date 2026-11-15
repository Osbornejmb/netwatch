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
