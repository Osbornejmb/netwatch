import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { validateSnapshot, pollSnapshot } from '../src/monitoring.js'
import { deviceHealth } from '../src/health.js'

const now = Date.now()
const snapshot = () => ({
  generatedAt: new Date(now).toISOString(), collector: { state: 'running' }, freshness: { staleAfterMs: 240000 },
  inventory: { revision: 1, monitoring: { a: true, b: false }, topology: { schemaVersion: 1, nodes: [
    { id: 'a', type: 'router', position: { x: 0, y: 0 }, data: { label: 'A', ip: '192.0.2.1' } },
    { id: 'b', type: 'switch', position: { x: 0, y: 200 }, data: { label: 'B', ip: '192.0.2.2' } },
  ], edges: [] } },
  observations: ['a', 'b'].map(deviceId => ({ deviceId, status: 'up', checkedAt: new Date(now - 100000).toISOString(), latencyMs: 3 })),
})

test('host snapshots validate inventory and evidence; disabled devices cannot inherit live status', () => {
  const value = validateSnapshot(snapshot())
  assert.equal(deviceHealth(value.checks.a, now, value.freshness.staleAfterMs), 'up')
  assert.equal(deviceHealth(value.checks.a, now + 140001, value.freshness.staleAfterMs), 'stale')
  assert.equal(deviceHealth(value.checks.b, now), 'unknown')
  for (const mutate of [v => v.inventory.revision = -1, v => v.inventory.monitoring.a = 'yes', v => v.freshness.staleAfterMs = 0, v => v.observations[0].latencyMs = -1, v => v.observations[0].deviceId = 'deleted', v => v.inventory.topology.nodes[0].data.ip = 'bad']) {
    const invalid = snapshot(); mutate(invalid); assert.throws(() => validateSnapshot(invalid))
  }
})

test('serial polling preserves last-known snapshot across disconnect and reconnect, and stops cleanly', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0, pending
  const states = []
  const stop = pollSnapshot(value => states.push(value), { intervalMs: 5, request: async () => {
    calls++
    if (calls === 2) throw new Error('offline')
    if (calls === 4) return new Promise(resolve => { pending = resolve })
    const value = snapshot(); value.observations[0].status = calls === 3 ? 'down' : 'up'; return { value }
  } })
  await setImmediate()
  assert.equal(states[0].snapshot.checks.a.status, 'up')
  t.mock.timers.tick(5); await setImmediate()
  assert.deepEqual(states[1], { state: 'disconnected', error: 'offline' })
  t.mock.timers.tick(5); await setImmediate()
  assert.equal(states[2].snapshot.checks.a.status, 'down')
  t.mock.timers.tick(5); await setImmediate()
  t.mock.timers.tick(20); await setImmediate(); assert.equal(calls, 4)
  stop(); pending({ value:snapshot() }); await setImmediate()
  assert.equal(states.length, 3)
  t.mock.timers.tick(100000); await setImmediate(); assert.equal(calls, 4)
})

test('poll deadline aborts a stalled fetch and a replaced poll cannot publish obsolete results', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const states = []
  const stop = pollSnapshot(value => states.push(value), { timeoutMs: 10, request: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) })
  t.mock.timers.tick(10); await setImmediate()
  assert.equal(states[0].state, 'disconnected'); assert.match(states[0].error, /timed out/)
  stop()
  let resolveOld
  const old = pollSnapshot(value => states.push(value), { request: () => new Promise(resolve => { resolveOld = resolve }) })
  old()
  const current = pollSnapshot(value => states.push(value), { request: async () => ({ value:snapshot() }) })
  await setImmediate(); resolveOld({ value:snapshot() }); await setImmediate()
  assert.equal(states.length, 2); assert.equal(states[1].state, 'connected'); current()
})

test('conditional polling confirms connectivity on 304, preserves evidence, and still detects timeout',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 let clock=now, calls=0
 const validator='W/"launch.state"'
 t.mock.method(globalThis,'fetch',async (path,{headers,signal})=>{
  assert.equal(path,'/api/v1/snapshot')
  calls++
  assert.equal(headers['If-None-Match'],calls===1?undefined:validator)
  if(calls===1)return Response.json(snapshot(),{headers:{ETag:validator}})
  if(calls===3)throw Error('offline')
  if(calls===5)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))
  return new Response(null,{status:304,headers:{ETag:validator}})
 })
 const states=[]
 const stop=pollSnapshot(value=>states.push(value),{intervalMs:5,timeoutMs:10,now:()=>clock})
 t.after(stop)
 await setImmediate()
 const previous=states[0].snapshot
 for(let i=1;i<=4;i++){clock+=5;t.mock.timers.tick(5);await setImmediate()}
 assert.deepEqual(states[1],{state:'connected',error:'',receivedAt:new Date(now+5).toISOString()})
 assert.equal(states[2].state,'disconnected')
 assert.deepEqual(states[3],{state:'connected',error:'',receivedAt:new Date(now+15).toISOString()})
 assert.equal(previous.checks.a.checkedAt,snapshot().observations[0].checkedAt)
 t.mock.timers.tick(10);await setImmediate()
 assert.match(states[4].error,/timed out/)
})

test('snapshot validation reuses unchanged inventory and still checks observations and incidents',()=>{
 const previous=validateSnapshot(snapshot()).inventory
 const next=snapshot()
 next.inventory.topology=null
 next.observations[0].status='down'
 const result=validateSnapshot(next,previous)
 assert.equal(result.inventory,previous)
 assert.equal(result.checks.a.status,'down')
 next.observations[0].deviceId='missing'
 assert.throws(()=>validateSnapshot(next,previous),/Invalid host observation/)
 next.observations=snapshot().observations
 next.activeIncidents=[{id:1,deviceId:'unknown'}]
 assert.throws(()=>validateSnapshot(next,previous),/Invalid incidents/)
 next.inventory.revision++
 assert.throws(()=>validateSnapshot(next,previous))
})

test('a restarted poll can reuse its cache, but a new host at the same revision revalidates inventory',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const cache={}, states=[]
 const initial=pollSnapshot(state=>states.push(state),{
  cache,
  request:async()=>({value:snapshot(),etag:'W/"one.state"'}),
 })
 await setImmediate();initial()
 const next=snapshot();next.inventory.topology.nodes[0].data.label='New database'
 const refreshed=pollSnapshot(state=>states.push(state),{
  cache,
  request:async(_, {etag})=>{
   assert.equal(etag,'W/"one.state"')
   return {value:next,etag:'W/"two.state"'}
  },
 })
 await setImmediate();refreshed()
 assert.equal(states[1].snapshot.inventory.topology.nodes[0].data.label,'New database')
})
