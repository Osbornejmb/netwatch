import assert from 'node:assert/strict'
import { execFileSync, fork } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { X509Certificate } from 'node:crypto'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { hashPassword } from '../host/auth.js'
import { createHost } from '../host/server.js'
import { createSessions } from '../host/sessions.js'
import { openStore } from '../host/store.js'
import { readTlsOptions } from '../host/tls.js'
import { writeTokenFixture } from './fixtures/write-token.js'

test(
  'Windows sharing setup creates a reusable server certificate and repairs a damaged key',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'netwatch-sharing-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const publicFile = join(dir, 'NetWatch-connection.cer')
    const key = join(dir, 'netwatch.pfx')
    const setup = () =>
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          fileURLToPath(new URL('../host/windows-sharing.ps1', import.meta.url)),
          '-Directory',
          dir,
        ],
        { windowsHide: true, timeout: 90000 },
      )
    setup()
    const original = new X509Certificate(readFileSync(publicFile))
    assert.equal(original.ca, false)
    assert.equal(original.checkIP('127.0.0.1'), '127.0.0.1')
    setup()
    assert.equal(new X509Certificate(readFileSync(publicFile)).fingerprint256, original.fingerprint256)
    writeFileSync(key, 'damaged')
    setup()
    const publicCert = new X509Certificate(readFileSync(publicFile))
    assert.notEqual(publicCert.fingerprint256, original.fingerprint256)
    assert.throws(() => readTlsOptions(undefined, undefined, dir, key), /outside the static build directory/)
    const tls = readTlsOptions(undefined, undefined, join(dir, 'dist'), key)
    const server = https.createServer(tls, (_, response) => response.end('ready'))
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => new Promise((resolve) => server.close(resolve)))
    const response = await new Promise((resolve, reject) => {
      https
        .get(`https://127.0.0.1:${server.address().port}`, { ca: publicCert.toString() }, resolve)
        .on('error', reject)
    })
    response.resume()
    assert.equal(response.statusCode, 200)

    const port = server.address().port
    await new Promise((resolve) => server.close(resolve))
    const noLanInterfaces =
      'data:text/javascript,' +
      encodeURIComponent(
        `import os from 'node:os'; import { syncBuiltinESMExports } from 'node:module';
    os.networkInterfaces = () => ({}); syncBuiltinESMExports();`,
      )
    const { NETWATCH_TLS_CERT, NETWATCH_TLS_KEY, ...env } = process.env
    const child = fork(fileURLToPath(new URL('../host/main.js', import.meta.url)), [], {
      execArgv: ['--import', noLanInterfaces],
      env: {
        ...env,
        NETWATCH_TLS_PFX: key,
        NETWATCH_LAN: '1',
        NETWATCH_PORT: String(port),
        NETWATCH_DB: join(dir, 'db'),
        NETWATCH_ICMP: '0',
        NETWATCH_SNMP: '0',
        NETWATCH_DISCOVERY: '0',
      },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    })
    const closed = once(child, 'close')
    try {
      const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(6000) })
      assert.equal(ready.dashboardUrl, `http://127.0.0.1:${port}`)
      assert.deepEqual(ready.urls, [])
      const health = await fetch(ready.dashboardUrl + '/api/v1/health', { signal: AbortSignal.timeout(3000) })
      assert.equal(health.status, 200)
      await health.body.cancel()
    } finally {
      if (child.connected) child.send({ type: 'shutdown' })
      await closed
    }
  },
)

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
  assert.throws(() => readTlsOptions(cert, key, dir), /outside the static build directory/)
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
  const stream = await new Promise((resolve, reject) => {
    https.get('https://' + authority + '/api/v1/events', {
      ca: tls.cert, headers: { Cookie: credentials }, signal: AbortSignal.timeout(5000),
    }, resolve).on('error', reject)
  })
  assert.equal(stream.httpVersion, '1.1')
  const [chunk] = await once(stream, 'data')
  assert.match(chunk.toString(), /event: snapshot/)
  assert.doesNotMatch(chunk.toString(), /"discovery"/)
  const ended = once(stream, 'end')
  const logout = await get('/api/v1/auth/logout', { method: 'POST', headers: { Cookie: credentials } })
  await ended
  assert.match(logout.headers['set-cookie'][0], /^__Host-netwatch_session=; .*Max-Age=0; Secure$/)
})
