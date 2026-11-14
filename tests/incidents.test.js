import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openStore } from '../host/store.js'
import { createCollector } from '../host/collector.js'
import { createHost } from '../host/server.js'
import { backupDatabase, restoreDatabase } from '../host/maintenance.js'
import { validateSnapshot, validateIncidents } from '../src/monitoring.js'

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'netwatch-incidents-')), path=join(dir,'db')
  let time=Date.now()-100000
  const now=()=>time
  const store=openStore(path,{now})
  const input={source:'inventory',topology:{schemaVersion:1,nodes:[{id:'a',type:'switch',position:{x:0,y:0},data:{label:'Test',ip:'192.0.2.1'}}],edges:[]},monitoring:{a:true}}
  store.write(input,0)
  const append=(status,options={})=>{time+=1000;store.append([{deviceId:'a',status,checkedAt:new Date(time).toISOString(),...options}])}
  t.after(()=>{try{store.close()}catch{}rmSync(dir,{recursive:true,force:true})})
  return {store,path,dir,input,append,now,advance:ms=>time+=ms}
}
test('thresholds debounce loss, deduplicate outages, ignore collector errors and resolve once',async t=>{
  const {store,now}=fixture(t)
  const up={outcome:'reachable',reason:'success',latencyMs:1}, down={outcome:'unreachable',reason:'TimedOut',latencyMs:null}
  const results=[up,down,up,down,down,down,{outcome:'error',code:'icmp_exception'},up,up,down,up]
  const collector=createCollector(store,{enabled:true,platform:'win32',now,runner:async()=>results.shift()})
  for(let i=0;i<4;i++) await collector.runOnce()
  assert.equal(store.incidents('a').incidents.length,0)
  await collector.runOnce();const opened=store.incidents('a').incidents[0]
  assert.equal(opened.resolvedAt,null)
  await collector.runOnce();await collector.runOnce()
  assert.deepEqual(store.incidents('a').incidents,[opened])
  await collector.runOnce();const resolved=store.incidents('a').incidents[0]
  assert.ok(resolved.resolvedAt);assert.equal(resolved.id,opened.id)
  for(let i=0;i<3;i++) await collector.runOnce()
  assert.deepEqual(store.incidents('a').incidents,[resolved]);await collector.stop()
})
test('incidents survive restart and paused monitoring; pending and out-of-order evidence never resolve',t=>{
  const f=fixture(t);f.append('down');const incident=f.store.snapshot().activeIncidents[0]
  f.append('unknown',{outcome:'unreachable'});f.append('up',{outcome:'unreachable'})
  f.store.append([{deviceId:'a',status:'up',checkedAt:new Date(Date.parse(incident.openedAt)-1).toISOString()}])
  assert.deepEqual(f.store.snapshot().activeIncidents,[incident])
  f.store.write({...f.input,monitoring:{a:false}},1);assert.equal(f.store.snapshot().activeIncidents.length,1)
  f.store.close();const reopened=openStore(f.path,{now:f.now})
  assert.deepEqual(reopened.snapshot().activeIncidents,[incident])
  reopened.write(f.input,2);f.advance(1000);reopened.append([{deviceId:'a',status:'up',checkedAt:new Date(f.now()).toISOString()}])
  assert.equal(reopened.snapshot().activeIncidents.length,0);assert.ok(reopened.incidents('a').incidents[0].resolvedAt);reopened.close()
})
test('invalid batches rollback incident changes and identity edits remove old evidence',t=>{
  const {store,input,append,now}=fixture(t)
  assert.throws(()=>store.append([{deviceId:'a',status:'down',checkedAt:new Date(now()).toISOString()},null]))
  assert.equal(store.incidents('a').incidents.length,0)
  append('down');input.topology.nodes[0].data.ip='192.0.2.2';store.write(input,1)
  assert.equal(store.incidents('a').incidents.length,0)
})
test('incident pagination, resolved retention and caps preserve open outages',t=>{
  const f=fixture(t)
  for(let i=0;i<4;i++){f.append('down');f.append('up')}
  const first=f.store.incidents('a',{limit:2}),second=f.store.incidents('a',{limit:2,before:first.nextBefore})
  assert.equal(second.incidents.length,2);assert.ok(second.incidents.every(item=>item.id<first.nextBefore))
  assert.throws(()=>f.store.incidents('a',{limit:201}));assert.throws(()=>f.store.incidents('a',{before:0}));assert.throws(()=>f.store.incidents('missing'))
  f.store.db.exec('BEGIN');const insert=f.store.db.prepare('INSERT INTO incidents(device_id,opened_at,resolved_at) VALUES(?,?,?)')
  for(let i=0;i<10001;i++)insert.run('a',f.now(),f.now())
  f.store.db.exec('COMMIT');f.append('down')
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM incidents').get().n,10001)
  f.advance(31*86400000);assert.equal(f.store.snapshot().activeIncidents.length,1)
  assert.equal(f.store.incidents('a').incidents.length,1)
})
test('v2 upgrade rolls back safely and backup/restore preserves active and recovered incidents',t=>{
  const f=fixture(t);f.append('down');f.append('up');f.append('down')
  const expected=f.store.incidents('a').incidents;f.store.close()
  const backup=join(f.dir,'backup');backupDatabase(f.path,backup);restoreDatabase(f.path,backup)
  const restored=openStore(f.path,{now:f.now});assert.deepEqual(restored.incidents('a').incidents,expected);restored.close()
  const db=new DatabaseSync(f.path);db.exec('DROP TABLE discovered_devices;DROP TABLE interface_samples;DROP TABLE snmp_targets;DROP TABLE incidents;PRAGMA user_version=2');db.close()
  assert.throws(()=>openStore(f.path,{migrateV3:()=>{throw new Error('interrupted')}}),/interrupted/)
  const check=new DatabaseSync(f.path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,2);check.close()
  const migrated=openStore(f.path);assert.equal(migrated.history('a').checks.length,3);assert.deepEqual(migrated.incidents('a').incidents,[]);migrated.close()
})
test('incident API is read-only and shares host/origin boundaries; snapshots validate incident data',async t=>{
  const {store,append}=fixture(t);append('down')
  const server=createHost(store,{port:0});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(()=>new Promise(resolve=>server.close(resolve)))
  const url=`http://127.0.0.1:${server.address().port}/api/v1/devices/a/incidents`
  const result=await (await fetch(url)).json();assert.equal(result.incidents.length,1)
  assert.equal((await fetch(url+'?limit=201')).status,400)
  assert.equal((await fetch(url,{headers:{Origin:'http://evil.test'}})).status,403)
  assert.equal((await fetch(url,{method:'PUT'})).status,404)
  const snapshot=store.snapshot();assert.equal(validateSnapshot(snapshot).activeIncidents.length,1)
  assert.throws(()=>validateSnapshot({...snapshot,activeIncidents:[...snapshot.activeIncidents,...snapshot.activeIncidents]}))
  assert.throws(()=>validateIncidents([{...result.incidents[0],deviceId:'missing'}],new Set(['a'])))
  assert.throws(()=>validateIncidents([{...result.incidents[0],resolvedAt:'invalid'}],new Set(['a'])))
})
