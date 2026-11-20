import assert from 'node:assert/strict'
import { once } from 'node:events'
import { get } from 'node:http'
import test from 'node:test'
import { createHost, createRoutes } from '../host/server.js'
import { openStore } from '../host/store.js'

test('SSE coalesces writes, resumes with a full snapshot, and releases its connection slots', async (t) => {
  const store = openStore(':memory:')
  const routes = createRoutes(undefined, { intervalMs: 40, heartbeatMs: 120, maxClients: 2, maxPerIp: 1 })
  let ip = '127.0.0.1'
  const server = createHost(store, { port: 0, routes, remoteAddress: () => ip })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    store.close()
  })
  const events = (headers) => fetch(`http://127.0.0.1:${server.address().port}/api/v1/events`, {
    headers, signal: AbortSignal.timeout(3000),
  })
  for (const headers of [{ Host: 'example.test' }, { Origin: 'https://example.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await new Promise((resolve, reject) => {
      get(`http://127.0.0.1:${server.address().port}/api/v1/events`, { headers }, resolve).on('error', reject)
    })
    response.resume()
    assert.equal(response.statusCode, 403)
  }
  const response = await events()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.equal(response.headers.get('x-accel-buffering'), 'no')
  assert.match(response.headers.get('content-type'), /^text\/event-stream/)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const first = decoder.decode((await reader.read()).value)
  assert.match(first, /event: snapshot/)
  assert.equal((await events()).status, 429)
  ip = '127.0.0.2'
  const other = await events()
  assert.equal(other.status, 200)
  ip = '127.0.0.3'
  assert.equal((await events()).status, 429)
  await other.body.cancel()
  ip = '127.0.0.1'
  const inventory = { source: 'inventory', topology: { nodes: [], edges: [] } }
  store.write(inventory, 0)
  store.write(inventory, 1)
  let changes = ''
  while (!changes.includes('"revision":2')) changes += decoder.decode((await reader.read()).value)
  assert.equal((changes.match(/event: snapshot/g) ?? []).length, 1)
  let quiet = ''
  while (!quiet.includes(': heartbeat')) quiet += decoder.decode((await reader.read()).value)
  assert.doesNotMatch(quiet, /event: snapshot/)
  const id = changes.match(/^id: (.+)$/m)[1]
  await reader.cancel()
  for (const lastId of [id, 'unknown']) {
    let resumed = await events({ 'Last-Event-ID': lastId })
    for (let attempt = 0; resumed.status === 429 && attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 15))
      resumed = await events({ 'Last-Event-ID': lastId })
    }
    assert.equal(resumed.status, 200)
    const stream = resumed.body.getReader()
    const initial = decoder.decode((await stream.read()).value)
    assert.equal(initial.includes(': resumed'), lastId === id)
    assert.match(initial, /"revision":2/)
    await stream.cancel()
  }
})
