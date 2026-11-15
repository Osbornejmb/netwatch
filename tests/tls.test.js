import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { hashPassword } from '../host/auth.js'
import { createHost } from '../host/server.js'
import { createSessions } from '../host/sessions.js'
import { openStore } from '../host/store.js'
import { readTlsOptions } from '../host/tls.js'
import { writeTokenFixture } from './fixtures/write-token.js'

test('TLS requires a valid pair, rejects HTTP origins, and uses HTTPS-only session cookies and HSTS', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'netwatch-tls-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const cert = join(dir, 'cert.pem'), key = join(dir, 'key.pem')
  const gitOpenssl = join(process.env.ProgramFiles ?? '', 'Git', 'usr', 'bin', 'openssl.exe')
  execFileSync(existsSync(gitOpenssl) ? gitOpenssl : 'openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert,
  ], { stdio: 'ignore', windowsHide: true })
  assert.throws(() => readTlsOptions(cert, ''), /Set both/)
  const bad = join(dir, 'bad.pem')
  writeFileSync(bad, 'invalid')
  assert.throws(() => readTlsOptions(cert, bad), /Unable to load/)
  const tls = readTlsOptions(cert, key)
  assert.equal(tls.minVersion, 'TLSv1.2')

  const store = openStore(':memory:')
  store.db.prepare("UPDATE auth_config SET viewer_mode='open', admin_hash=?").run(await hashPassword('test admin password'))
  writeTokenFixture(dir)
  const auth = createSessions(store.db, { lan: true })
  const server = createHost(store, { port: 0, tls, auth, dist: dir, remoteAddress: () => '192.168.1.12' })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    store.close()
  })
  const authority = '127.0.0.1:' + server.address().port
  const get = (path, options = {}) => new Promise((resolve, reject) => {
    const request = https.request('https://' + authority + path, { ca: tls.cert, ...options }, (response) => {
      response.resume()
      response.on('end', () => resolve(response))
    })
    request.on('error', reject)
    request.end()
  })
  const unauthorized = await get('/api/v1/health', { headers: { 'X-Forwarded-Proto': 'https' } })
  assert.equal(unauthorized.statusCode, 401)
  const rejected = await get('/api/v1/auth/session', { headers: { Origin: 'http://' + authority } })
  assert.equal(rejected.statusCode, 403)
  const login = await get('/api/v1/auth/session', { headers: { Origin: 'https://' + authority } })
  assert.equal(login.statusCode, 200)
  assert.equal(login.headers['strict-transport-security'], 'max-age=31536000')
  const cookie = login.headers['set-cookie'][0]
  assert.match(cookie, /^__Host-netwatch_session=[a-f0-9]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=604800; Secure$/)
  const credentials = cookie.split(';')[0]
  assert.equal((await get('/api/v1/health', { headers: { Cookie: credentials } })).statusCode, 200)
  assert.equal((await get('/api/v1/health', { headers: { Cookie: credentials.slice('__Host-'.length) } })).statusCode, 401)
  const logout = await get('/api/v1/auth/logout', { method: 'POST', headers: { Cookie: credentials } })
  assert.match(logout.headers['set-cookie'][0], /^__Host-netwatch_session=; .*Max-Age=0; Secure$/)
})
