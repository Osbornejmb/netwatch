import assert from 'node:assert/strict'
import test from 'node:test'
import { createAudit } from '../host/audit.js'
import { manageAuth } from '../host/auth-config.js'
import { hashPassword, needsRehash, readAuthConfig, remoteEnabled, verifyPassword } from '../host/auth.js'
import { openStore } from '../host/store.js'

test('scrypt uses distinct salts and recognizes supported older work factors', async () => {
  const password = 'test password 0123'
  const first = await hashPassword(password)
  assert.notEqual(await hashPassword(password), first)
  assert.equal(await verifyPassword(password, first), true)
  assert.equal(await verifyPassword('wrong password!', first), false)
  assert.equal(await verifyPassword(password, first.replace('32768', '99999')), false)
  assert.equal(needsRehash(first), false)
  const old = await hashPassword(password, { N: 16384, r: 8, p: 1 })
  assert.equal(await verifyPassword(password, old), true)
  assert.equal(needsRehash(old), true)
  for (const value of ['short', 'a'.repeat(129)]) await assert.rejects(hashPassword(value), /12 and 128/)
})

test('local configuration starts closed, takes passwords from prompts and revokes sessions', async (t) => {
  const store = openStore(':memory:')
  t.after(() => store.close())
  const { db } = store
  const config = () => readAuthConfig(db)
  assert.deepEqual({ ...config() }, { viewer_mode: 'password', viewer_hash: null, admin_hash: null })
  assert.equal(remoteEnabled(true, config()), false)
  const messages = []
  const run = (args, ...answers) => manageAuth(db, args, { prompt: () => answers.shift(), print: (value) => messages.push(value) })
  const password = 'test password 0123'
  await assert.rejects(run(['set-admin-password', password]), /Usage/)
  await assert.rejects(run(['set-admin-password'], 'short'), /12 and 128/)
  await assert.rejects(run(['set-admin-password'], password, 'different password'), /do not match/)
  await run(['set-admin-password'], password, password)
  assert.equal(remoteEnabled(true, config()), true)
  assert.equal(remoteEnabled(false, config()), false)
  assert.equal(remoteEnabled(true, { ...config(), viewer_hash: 'malformed' }), false)
  await assert.rejects(run(['set-viewer-password'], password, password), /different viewer and admin/)
  await run(['status'])
  assert.deepEqual(JSON.parse(messages.at(-1)), { viewerMode: 'password', viewerConfigured: false, adminConfigured: true })
  db.exec("INSERT INTO sessions VALUES('session-hash','admin','csrf-hash',1,1,2,'192.168.1.2')")
  await run(['viewer-mode', 'open'])
  assert.equal(config().viewer_mode, 'open')
  assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get().count, 0)
  db.exec("INSERT INTO sessions VALUES('session-hash','admin','csrf-hash',1,1,2,'192.168.1.2')")
  await run(['revoke-sessions'])
  assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get().count, 0)
  assert.deepEqual(createAudit(db).read().entries.map((entry) => entry.detail), ['revoke-sessions', 'viewer-mode:open', 'set-admin-password'])
  assert.ok(messages.every((message) => !message.includes(password) && !message.includes('scrypt$')))
})
