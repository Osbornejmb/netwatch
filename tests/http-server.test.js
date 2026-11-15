import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loopbackUrl, readPort } from '../host/port.js'
import { createHost } from '../host/server.js'
import { MAX_BODY, openStore } from '../host/store.js'

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'netwatch-http-'))
  const store = openStore(join(dir, 'db'))
  const dist = join(dir, 'dist')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html></html>')
  writeFileSync(join(dist, 'assets', 'index-aBCdef_1.js'), '')
  writeFileSync(join(dist, 'assets', 'config.json'), '{}')
  writeFileSync(join(dist, 'font.woff2'), '')
  writeFileSync(join(dist, 'index.js.map'), '{}')
  const server = createHost(store, { dist, port: 0 })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })
  return loopbackUrl(server.address().port)
}

test('NETWATCH_PORT accepts only integer ports in the supported range', () => {
  assert.equal(readPort('1024'), 1024)
  assert.equal(readPort('65535'), 65535)
  for (const value of ['', '1023', '65536', '22.5', '0x1234', ' 4317', 'invalid']) {
    assert.throws(() => readPort(value), /NETWATCH_PORT must be an integer/)
  }
})

test('malformed IDs and static paths return 400 and loopback aliases get a 403 with the canonical URL', async (t) => {
  const base = await fixture(t)
  for (const path of ['/api/v1/devices/%ZZ/checks', '/bad%ZZ']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 400)
    assert.deepEqual((await response.json()).error, { code: 'request_rejected', message: 'Malformed URL.' })
  }
  for (const host of ['localhost:' + new URL(base).port, '[::1]']) {
    const request = http.get(base, { headers: { Host: host } })
    const [response] = await once(request, 'response')
    assert.equal(response.statusCode, 403)
    const chunks = []
    for await (const chunk of response) chunks.push(chunk)
    const { error } = JSON.parse(Buffer.concat(chunks))
    assert.equal(error.message, 'Use ' + base + '.')
  }
})

test('index and fingerprinted assets use their respective cache policies and safe MIME types', async (t) => {
  const base = await fixture(t)
  for (const [path, cache, type] of [
    ['/', 'no-cache', 'text/html'],
    ['/index.html', 'no-cache', 'text/html'],
    ['/assets/index-aBCdef_1.js', 'public, max-age=31536000, immutable', 'text/javascript'],
    ['/assets/config.json', null, 'application/json'],
    ['/font.woff2', null, 'font/woff2'],
    ['/index.js.map', null, 'application/json'],
  ]) {
    const response = await fetch(base + path)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), cache)
    assert.equal(response.headers.get('Content-Type'), type)
    await response.arrayBuffer()
  }
})

test('an oversized streaming body gets a 413 and a closed connection before the client ends the body', async (t) => {
  const base = await fixture(t)
  const req = http.request(base + '/api/v1/topology', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-NetWatch-Write': '1' },
  })
  t.after(() => req.destroy())
  const responseReady = once(req, 'response', { signal: AbortSignal.timeout(5000) })
  req.write(Buffer.alloc(MAX_BODY + 1, 0x20))
  const [response] = await responseReady
  assert.equal(req.writableEnded, false)
  assert.equal(response.statusCode, 413)
  assert.equal(response.headers.connection, 'close')
  response.resume()
  await once(req, 'close', { signal: AbortSignal.timeout(5000) })
})
