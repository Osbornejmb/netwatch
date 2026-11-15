import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createAudit } from '../host/audit.js'
import { hashPassword, needsRehash } from '../host/auth.js'
import { createHost, createRoutes } from '../host/server.js'
import { createSessions } from '../host/sessions.js'
import { openStore } from '../host/store.js'
import { writeTokenFixture } from './fixtures/write-token.js'

const password = 'test admin password'
const idPath = '/api/v1/devices/missing/'
const discoveryPath = '/api/v1/discovered/'
const api = '/api/v1/'
const hashToken = (token) => createHash('sha256').update(token).digest('hex')

async function fixture(t, options = {}) {
  let time = 0
  let ip = '192.168.1.12'
  const store = openStore(':memory:')
  const dist = mkdtempSync(join(tmpdir(), 'netwatch-session-test-'))
  writeTokenFixture(dist)
  store.db.prepare('UPDATE auth_config SET viewer_mode=?, admin_hash=?, viewer_hash=?').run(
    options.viewerMode ?? 'open', await hashPassword(password, options.parameters), await hashPassword('test viewer password'))
  const audit = createAudit(store.db, () => time)
  const auth = createSessions(store.db, { lan: true, now: () => time, audit })
  const server = createHost(store, { auth, audit, dist, port: 0, remoteAddress: () => ip })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    store.close()
    rmSync(dist, { recursive: true, force: true })
  })
  const base = 'http://127.0.0.1:' + server.address().port
  const fetchAt = (path, opts) => fetch(base + path, opts)
  const login = (body, cookie) => fetchAt(api + 'auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
  return { fetchAt, login, store, audit, clock: (delta) => { time += delta }, source: (address) => { ip = address } }
}

const asCookie = (response) => response.headers.get('set-cookie')?.split(';')[0]

test('sessions hash credentials, upgrade atomically, and require an admin CSRF token', async (t) => {
  const { fetchAt, login, store, audit } = await fixture(t, { parameters: { N: 16384, r: 8, p: 1 } })
  const endpoint = api + 'auth/session'
  const initial = await fetchAt(endpoint)
  const viewer = asCookie(initial)
  const viewerSession = await initial.json()
  assert.equal(viewerSession.role, 'viewer')
  assert.match(initial.headers.get('set-cookie'), /^netwatch_session=[a-f0-9]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=604800$/)
  assert.equal(initial.headers.get('cache-control'), 'no-store')
  assert.equal(initial.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(initial.headers.get('x-frame-options'), 'DENY')
  assert.equal(initial.headers.get('cross-origin-resource-policy'), 'same-origin')
  const adminResponse = await login({ role: 'admin', password }, viewer)
  assert.equal(adminResponse.status, 200)
  const admin = asCookie(adminResponse)
  assert.notEqual(admin, viewer)
  const { csrfToken } = await adminResponse.json()
  assert.equal((await fetchAt(api + 'health', { headers: { cookie: viewer } })).status, 401)
  const stored = store.db.prepare('SELECT * FROM sessions').all()
  assert.equal(stored.length, 1)
  assert.equal(stored[0].id_hash, hashToken(admin.slice('netwatch_session='.length)))
  assert.equal(stored[0].csrf_hash, hashToken(csrfToken))
  assert.ok(!JSON.stringify(stored).includes(csrfToken))
  assert.equal(needsRehash(store.db.prepare('SELECT admin_hash FROM auth_config').get().admin_hash), false)
  const write = (token) => fetchAt(api + 'topology', {
    method: 'PUT',
    headers: { cookie: admin, 'Content-Type': 'application/json', ...(token ? { 'X-NetWatch-Write': token } : {}) },
    body: JSON.stringify({ source: 'inventory', baseRevision: 0, topology: { schemaVersion: 1, nodes: [], edges: [] } }),
  })
  assert.equal((await write()).status, 403)
  assert.equal((await write(viewerSession.csrfToken)).status, 403)
  assert.equal((await write(csrfToken)).status, 200)
  const out = await fetchAt(api + 'auth/logout', { method: 'POST', headers: { cookie: admin } })
  assert.match(out.headers.get('set-cookie'), /Max-Age=0$/)
  assert.equal((await fetchAt(api + 'health', { headers: { cookie: admin } })).status, 401)
  assert.doesNotMatch(await (await fetchAt('/')).text(), /netwatch-write-token/)
  const log = audit.read().entries
  for (const action of ['login_success', 'session_upgrade', 'topology_applied', 'logout']) assert.ok(log.some((entry) => entry.action === action))
  assert.ok(!JSON.stringify(log).includes(csrfToken))
  assert.ok(!JSON.stringify(log).includes(password))
})

test('route table enforces local, unauthenticated, viewer, and admin access', async (t) => {
  const { fetchAt, login, source, audit } = await fixture(t)
  const session = await fetchAt(api + 'auth/session')
  const viewer = asCookie(session)
  const admin = asCookie(await login({ role: 'admin', password }))
  const cases = [
    ['GET', api + 'audit', 200], ['GET', api + 'auth/session', 200], ['POST', api + 'auth/login', 415], ['POST', api + 'auth/logout', 200],
    ['GET', api + 'health', 200], ['GET', api + 'topology', 200], ['PUT', api + 'topology', 403],
    ['GET', api + 'snapshot', 200], ['GET', discoveryPath.slice(0, -1), 200], ['POST', discoveryPath + 'scan-now', 403],
    ['POST', discoveryPath + 'clear', 403], ['POST', discoveryPath + 'missing/add-to-map', 403],
    ['POST', discoveryPath + 'missing/remove', 403], ['GET', idPath + 'checks', 404],
    ['GET', idPath + 'incidents', 404], ['GET', idPath + 'interfaces', 404], ['GET', '/', 200],
  ]
  assert.equal(cases.length, createRoutes().length)
  for (const [method, path, status] of cases) {
    const route = createRoutes().find((candidate) => candidate.method === method && candidate.pattern.test(path))
    for (const [kind, cookie] of [['local'], ['unauthenticated'], ['viewer', viewer], ['admin', admin]]) {
      source(kind === 'local' ? '127.0.0.1' : '192.168.1.12')
      const expected = route.access === 'local' && kind !== 'local' ? 403 : route.access !== 'public' && kind === 'unauthenticated' ? 401 :
        route.access === 'admin' && kind === 'viewer' ? 403 : status
      const headers = cookie && !path.endsWith('/logout') ? { cookie } : {}
      assert.equal((await fetchAt(path, { method, headers })).status, expected, kind + ' ' + method + ' ' + path)
    }
  }
  assert.equal(audit.read().entries.filter((entry) => entry.action === 'viewer_write_blocked').length, 5)
})

test('sessions expire by idle and absolute limits and evict the oldest session at each cap', async (t) => {
  const { fetchAt, login, clock, store } = await fixture(t)
  const health = (cookie) => fetchAt(api + 'health', { headers: { cookie } })
  const endpoint = api + 'auth/session'
  const oldestViewer = asCookie(await fetchAt(endpoint))
  for (let i = 0; i < 20; i++) await fetchAt(endpoint)
  assert.equal((await health(oldestViewer)).status, 401)
  assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE role='viewer'").get().count, 20)
  const logInAdmin = async () => asCookie(await login({ role: 'admin', password }))
  const oldestAdmin = await logInAdmin()
  let admin
  for (let i = 0; i < 5; i++) admin = await logInAdmin()
  assert.equal((await health(oldestAdmin)).status, 401)
  assert.equal((await health(admin)).status, 200)
  clock(30 * 60000)
  assert.equal((await health(admin)).status, 401)
  const viewer = asCookie(await fetchAt(endpoint))
  for (let i = 0; i < 23; i++) {
    clock(7 * 3600000)
    assert.equal((await health(viewer)).status, 200)
  }
  clock(7 * 3600000)
  assert.equal((await health(viewer)).status, 401)
})

test('password mode, disabled viewers and global and per-address backoff', async (t) => {
  const { fetchAt, login, source, clock, store, audit } = await fixture(t, { viewerMode: 'password' })
  const endpoint = api + 'auth/session'
  assert.equal((await (await fetchAt(endpoint)).json()).authenticated, false)
  assert.equal((await login({ role: 'viewer', password: 'test viewer password' })).status, 200)
  const bad = { role: 'admin', password: 'invalid password' }
  assert.equal((await login(bad)).status, 401)
  source('192.168.1.13')
  assert.equal((await login(bad)).headers.get('retry-after'), '1')
  source('192.168.1.12')
  for (let i = 0; i < 9; i++) assert.equal((await login(bad)).status, 429)
  assert.ok(Number((await login(bad)).headers.get('retry-after')) >= 599)
  clock(10 * 60000)
  assert.equal((await login({ role: 'admin', password })).status, 200)
  store.db.exec("UPDATE auth_config SET viewer_mode='disabled'")
  clock(30000)
  assert.equal((await (await fetchAt(endpoint)).json()).viewerMode, 'disabled')
  assert.equal((await login({ role: 'viewer', password: 'test viewer password' })).status, 401)
  for (const action of ['login_failure', 'rate_limit_lockout']) assert.ok(audit.read().entries.some((entry) => entry.action === action))
})

test('discovery adds with checks enabled only from loopback', async (t) => {
  const { fetchAt, login, source, store, audit } = await fixture(t)
  const remote = await login({ role: 'admin', password })
  const { csrfToken } = await remote.json()
  const adminCookie = asCookie(remote)
  const remoteId = '00000000-0000-0000-0000-000000000002'
  for (const [kind, id, ip, address, enabled] of [
    ['local', '00000000-0000-0000-0000-000000000001', '127.0.0.1', '192.168.1.40', true],
    ['remote-admin', remoteId, '192.168.1.12', '192.168.1.41', false],
  ]) {
    source(ip)
    store.db.prepare("INSERT INTO discovered_devices VALUES(?,?,NULL,NULL,'neighbor',?,?,'new',NULL,0)").run(id, address, Date.now(), Date.now())
    const localShell = ip === '127.0.0.1' ? await (await fetchAt('/')).text() : ''
    const token = enabled ? /name="netwatch-write-token" content="([a-f0-9]+)"/.exec(localShell)[1] : csrfToken
    const result = await fetchAt(discoveryPath + id + '/add-to-map', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NetWatch-Write': token, cookie: adminCookie },
      body: JSON.stringify({ baseRevision: store.read().revision }),
    })
    assert.equal(result.status, 200)
    const saved = await result.json()
    const device = saved.topology.nodes.find((node) => node.data.ip === address)
    assert.equal(saved.monitoring[device.id], enabled, kind)
  }
  for (const [path, body] of [[remoteId + '/remove', {}], ['clear'], ['scan-now']]) {
    const response = await fetchAt(discoveryPath + path, { method: 'POST',
      headers: { 'X-NetWatch-Write': csrfToken, cookie: adminCookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    assert.equal(response.status, 200, path)
  }
  for (const action of ['discovery_add', 'discovery_remove', 'discovery_clear', 'discovery_scan'])
    assert.ok(audit.read().entries.some((entry) => entry.action === action && entry.source === 'remote'))
})
