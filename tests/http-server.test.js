import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loopbackUrl, readPort } from '../host/port.js'
import { createSnapshotRoute } from '../host/routes/snapshot.js'
import { createHost, createRoutes } from '../host/server.js'
import { MAX_BODY, openStore } from '../host/store.js'
import { fetchWriteToken, writeTokenFixture } from './fixtures/write-token.js'

async function fixture(t, { collector, expose, remoteAddress } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'netwatch-http-'))
  const store = openStore(join(dir, 'db'))
  const dist = join(dir, 'dist')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeTokenFixture(dist)
  writeFileSync(join(dist, 'assets', 'index-aBCdef_1.js'), '')
  writeFileSync(join(dist, 'assets', 'config.json'), '{}')
  writeFileSync(join(dist, 'font.woff2'), '')
  writeFileSync(join(dist, 'index.js.map'), '{}')
  const server = createHost(store, { dist, port: 0, collector, remoteAddress })
  expose?.(store)
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
    ['/', 'no-store', 'text/html'],
    ['/index.html', 'no-store', 'text/html'],
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
    headers: { 'Content-Type': 'application/json', 'X-NetWatch-Write': await fetchWriteToken(base) },
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

test('the write token is injected per launch and is accepted only by its own host', async (t) => {
  const first = await fixture(t)
  const second = await fixture(t)
  const old = await fetchWriteToken(first)
  const token = await fetchWriteToken(second)
  assert.ok(old !== token)
  for (const headers of [{ Origin: 'http://example.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await fetch(second, { headers })
    assert.equal(response.status, 403)
    assert.equal((await response.text()).includes(token), false)
  }
  const legacyWrite = await fetch(second + '/api/v1/topology', { method: 'PUT', headers: { 'X-NetWatch-Write': '1' } })
  assert.equal(legacyWrite.status, 403)
  const wrongMime = await fetch(second + '/api/v1/topology', { method: 'PUT', headers: { 'X-NetWatch-Write': token } })
  assert.equal(wrongMime.status, 415)
  for (const wrong of ['', '1', old, token + '0']) {
    const response = await fetch(second + '/api/v1/discovered/clear', {
      method: 'POST', headers: { 'X-NetWatch-Write': wrong },
    })
    assert.equal(response.status, 403)
  }
  const response = await fetch(second + '/api/v1/discovered/clear', {
    method: 'POST', headers: { 'X-NetWatch-Write': token },
  })
  assert.equal(response.status, 200)
})

test('snapshot ETags skip the snapshot read and change with inventory, current results, and collector state', async (t) => {
  let store, reads=0, state='idle'
  const base = await fixture(t, {
    collector: { snapshot:()=>({state,freshness:{staleAfterMs:30000}}) },
    expose(value) {
      store=value
      const snapshot=store.snapshot
      store.snapshot=()=>{reads++;return snapshot()}
    },
  })
  const request=(etag)=>fetch(base+'/api/v1/snapshot',{headers:etag?{'If-None-Match':etag}:{}})
  const initial=await request()
  const first=initial.headers.get('ETag')
  assert.match(first,/^W\/"[^"]+"$/)
  assert.equal(initial.status,200)
  await initial.json()
  const unchanged=await request('"other", '+first.slice(2))
  assert.equal(unchanged.status,304)
  assert.equal(unchanged.headers.get('ETag'),first)
  assert.equal(await unchanged.text(),'')
  assert.equal(reads,1)
  store.write({
    source:'inventory',monitoring:{r:true},topology:{
      schemaVersion:1,nodes:[{id:'r',type:'router',position:{x:0,y:0},data:{label:'Router',ip:'192.0.2.1'}}],edges:[],
    },
  },0)
  const inventory=await request(first)
  assert.equal(inventory.status,200)
  const second=inventory.headers.get('ETag')
  assert.notEqual(second,first)
  assert.equal((await inventory.json()).inventory.revision,1)
  store.append([{deviceId:'r',status:'down',checkedAt:new Date().toISOString()}])
  const observed=await request(second)
  assert.equal(observed.status,200)
  const third=observed.headers.get('ETag')
  assert.notEqual(third,second)
  assert.equal((await observed.json()).activeIncidents.length,1)
  state='running'
  const collecting=await request(third)
  assert.equal(collecting.status,200)
  assert.notEqual(collecting.headers.get('ETag'),third)
  assert.equal((await collecting.json()).collector.state,'running')
})

test('every host route declares access and unknown API paths stay outside the static fallback', async (t) => {
  for (const route of createRoutes()) assert.ok(['public', 'viewer', 'admin', 'local'].includes(route.access))
  const base = await fixture(t)
  assert.equal((await fetch(base + '/api/v1/unknown')).status, 404)
  assert.equal((await fetch(base + '/font.woff2', { method: 'POST' })).status, 404)
})

test('viewer snapshot projects dashboard data and omits administrative metadata', () => {
  const inventory = { revision: 1, topology: { schemaVersion: 1, nodes: [], edges: [] }, monitoring: {} }
  const result = createSnapshotRoute('test')({
    role: 'viewer', requestHeaders: {}, response: {},
    store: {
      snapshotVersion: () => 1,
      snapshotNow: () => 0,
      snapshot: () => ({ inventory, snmpEnrollment: true, databasePath: '/db', observations: [] }),
    },
    collector: { snapshot: () => ({ state: 'running', path: '/helper', freshness: { staleAfterMs: 90000 } }) },
    discovery: { snapshot: () => ({ state: 'running' }) },
  })
  assert.deepEqual(result.inventory, inventory)
  for (const key of ['discovery', 'snmpEnrollment', 'databasePath']) assert.equal(Object.hasOwn(result, key), false)
  assert.deepEqual(result.collector, { state: 'running', freshness: { staleAfterMs: 90000 } })
})

test('private remote clients cannot reach public or protected routes before auth is configured', async (t) => {
  const base = await fixture(t, { remoteAddress: () => '192.168.1.2' })
  for (const path of ['/', '/api/v1/health']) {
    const response = await fetch(base + path, { headers: { 'X-Forwarded-For': '127.0.0.1' } })
    assert.equal(response.status, 403)
    assert.equal((await response.json()).error.message, 'Remote access is unavailable.')
  }
})
