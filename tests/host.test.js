import { fetchWriteToken, writeTokenFixture } from './fixtures/write-token.js'
import test from 'node:test'
import http from 'node:http'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openStore, MAX_BODY, HISTORY_SAMPLE_MS, HISTORY_MAX_PER_DEVICE, HISTORY_MAX_ROWS } from '../host/store.js'
import { createHost } from '../host/server.js'
import { backupDatabase, restoreDatabase, validateDatabase } from '../host/maintenance.js'
import { lock } from '../host/files.js'

const topology={schemaVersion:1,nodes:[{id:'r1',type:'router',position:{x:0,y:0},data:{label:'Router',ip:'2001:0db8::1'}},{id:'s1',type:'switch',position:{x:0,y:200},data:{label:'Switch',ip:'192.0.2.1'}}],edges:[{id:'e1',source:'r1',target:'s1'}]}
const input=(monitoring={})=>({source:'inventory',topology:structuredClone(topology),monitoring})
function fixture(t,options) {const dir=mkdtempSync(join(tmpdir(),'netwatch-host-'));const path=join(dir,'host.sqlite');const store=openStore(path,options);t.after(()=>{try{store.close()}catch{}rmSync(dir,{recursive:true,force:true})});return {dir,path,store}}

test('inventory persists across restart with stable IDs, normalized targets and monitoring disabled',t=>{
 const {path,store}=fixture(t);assert.equal(store.read().revision,0)
 const saved=store.write(input(),0);assert.equal(saved.revision,1);assert.equal(saved.topology.nodes[0].data.ip,'2001:db8::1');assert.deepEqual(saved.monitoring,{r1:false,s1:false})
 store.close();const reopened=openStore(path);assert.deepEqual(reopened.read(),saved);reopened.close()
})
test('separate connections reject stale/concurrent edits and rollback interrupted inventory transactions',t=>{
 const {path,store}=fixture(t);const other=openStore(path);try {
 store.write(input(),0);assert.throws(()=>other.write(input(),0),e=>e.status===409)
 assert.throws(()=>store.write(input({r1:true}),1,()=>{throw new Error('interrupted')}),/interrupted/)
 assert.equal(other.read().revision,1);assert.equal(other.read().monitoring.r1,false)
 } finally {other.close()}
})
test('host rejects bad graph, target, IDs, monitoring and sample source without altering inventory',t=>{
 const {store}=fixture(t)
 const variants=[v=>v.source='sample',v=>v.topology.nodes[0].data.ip='127.1',v=>v.topology.nodes[0].type='server',v=>v.topology.nodes[0].id='a'.repeat(101),v=>v.topology.edges[0].target='missing',v=>v.topology.nodes[0].position.x=1e20,v=>v.monitoring={unknown:true},v=>v.monitoring={r1:'true'},v=>{v.topology.nodes[0].data.ip='';v.monitoring={r1:true}}]
 for(const mutate of variants){const value=input();mutate(value);assert.throws(()=>store.write(value,0));assert.equal(store.read().revision,0)}
 const special=input();special.topology.nodes[0].id='toString';special.topology.nodes[0].data.ip='';special.topology.edges[0].source='toString';assert.equal(store.write(special,0).monitoring.toString,false)
})
test('observations require opt-in; bad batches rollback; snapshots retain timestamped independent evidence',t=>{
 const now=Date.now();const {store}=fixture(t,{now:()=>now});store.write(input({r1:true,s1:true}),0)
 store.append([{deviceId:'r1',status:'down',checkedAt:new Date(now-2000).toISOString()},{deviceId:'s1',status:'up',checkedAt:new Date(now-1000).toISOString()}])
 assert.throws(()=>store.append([{deviceId:'r1',status:'up',checkedAt:new Date(now).toISOString()},{deviceId:'missing',status:'up',checkedAt:new Date(now).toISOString()}]))
 assert.equal(store.history('r1').checks.length,1)
 assert.equal(store.snapshot().collector.state,'not-implemented');assert.equal(store.snapshot().observations.length,2)
 assert.deepEqual(store.snapshot().inventory,store.read());assert.equal(store.history('r1').revision,store.read().revision)
 const changed=input({s1:true});changed.topology.nodes[0].data.ip='2001:db8::2';store.write(changed,1);assert.equal(store.history('r1').checks.length,0);assert.equal(store.history('s1').checks.length,1)
 assert.throws(()=>store.append([{deviceId:'r1',status:'up',checkedAt:new Date(now).toISOString()}]))
 assert.throws(()=>store.append([{deviceId:'toString',status:'up',checkedAt:new Date(now).toISOString()}]))
 assert.throws(()=>store.append([null]))
})
test('snapshot chooses newest timestamp then sequence, including after rebuilding the index on open',t=>{
 const now=Date.now();const {store,path}=fixture(t,{now:()=>now});store.write(input({r1:true,s1:true}),0)
 store.append([{deviceId:'r1',status:'up',checkedAt:new Date(now-1000).toISOString()},{deviceId:'r1',status:'down',checkedAt:new Date(now-2000).toISOString()}])
 assert.equal(store.snapshot().observations.find(o=>o.deviceId==='r1').status,'up')
 store.append([{deviceId:'r1',status:'down',checkedAt:new Date(now-1000).toISOString()}])
 assert.equal(store.snapshot().observations.length,1);assert.equal(store.snapshot().observations[0].status,'down')
 const saved=store.read(),history=store.history('r1');store.db.exec('DROP INDEX checks_device_latest');store.close()
 const reopened=openStore(path,{now:()=>now});try {
 assert.equal(reopened.db.prepare('PRAGMA user_version').get().user_version,6)
 assert.deepEqual(reopened.read(),saved);assert.deepEqual(reopened.history('r1'),history)
 assert.equal(reopened.snapshot().observations[0].status,'down')
 assert.ok(reopened.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='checks_device_latest'").get())
 } finally {reopened.close()}
})

test('history pagination has stable cursors, bounds and retention; restart removes old rows',t=>{
 let now=Date.now();const {store,path}=fixture(t,{now:()=>now});store.write(input({r1:true}),0)
 store.append(Array.from({length:5},(_,i)=>({deviceId:'r1',status:'up',reason:'fixture-'+i,checkedAt:new Date(now-i*1000).toISOString()})))
 const first=store.history('r1',{limit:2});const second=store.history('r1',{limit:2,before:first.nextBefore});assert.equal(first.checks.length,2);assert.ok(second.checks.every(c=>c.id<first.nextBefore))
 assert.throws(()=>store.history('r1',{limit:201}));assert.throws(()=>store.history('r1',{before:0}));assert.throws(()=>store.history('missing'),e=>e.status===404)
 now+=31*86400000;store.close();const reopened=openStore(path,{now:()=>now});assert.equal(reopened.history('r1').checks.length,0);reopened.close()
})
test('cleanup trims devices first, then evicts the network-wide oldest rows', t=>{
 const now=Date.now(), {store}=fixture(t,{now:()=>now})
 const extra=Array.from({length:199},(_,i)=>({...topology.nodes[1],id:'bulk'+i,data:{...topology.nodes[1].data,ip:''}}))
 store.write({source:'inventory',topology:{...topology,nodes:[...topology.nodes,...extra]}},0)
 store.db.prepare(`WITH RECURSIVE samples(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM samples WHERE i<?),
   devices(id) AS (SELECT 'r1' UNION ALL SELECT 'bulk'||(i-1) FROM samples WHERE i<=199)
   INSERT INTO checks(device_id,status,checked_at,outcome,reason)
   SELECT id,'up',?+i,'reachable','fixture' FROM devices CROSS JOIN samples`).run(HISTORY_MAX_PER_DEVICE,now-10000)
 const oldest=store.db.prepare("INSERT INTO checks(device_id,status,checked_at,outcome,reason) VALUES(?,'up',?,'reachable','extra')")
 oldest.run('r1',now-11000);oldest.run('s1',now-12000);oldest.run('s1',now-11500)
 store.cleanup()
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM checks').get().n,HISTORY_MAX_ROWS)
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM checks WHERE device_id='r1'").get().n,HISTORY_MAX_PER_DEVICE)
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM checks WHERE reason='extra'").get().n,0)
})
test('failed initial migration rolls back schema; future schemas are rejected without modification',t=>{
 const dir=mkdtempSync(join(tmpdir(),'netwatch-migration-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db')
 assert.throws(()=>openStore(path,{migrate:()=>{throw new Error('migration interrupted')}}),/interrupted/)
 const db=new DatabaseSync(path);assert.equal(db.prepare('PRAGMA user_version').get().user_version,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='inventory'").get().n,0);db.exec('PRAGMA user_version=7');db.close()
 assert.throws(()=>openStore(path),/newer/);const check=new DatabaseSync(path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,7);check.close()
})
test('offline backup/restore validates data, advances revision and rejects corrupt backups and active locks',t=>{
 const {dir,path,store}=fixture(t);store.write(input({r1:true}),0);store.append([{deviceId:'r1',status:'up',checkedAt:new Date().toISOString()}]);store.close()
 const backup=join(dir,'backup.sqlite');backupDatabase(path,backup);assert.equal(validateDatabase(backup),1)
 const running=openStore(path);running.write(input(),1);running.close();restoreDatabase(path,backup)
 const restored=openStore(path);assert.equal(restored.read().revision,3);assert.equal(restored.history('r1').checks.length,1);restored.close()
 const interrupted=`${path}.restoring`;writeFileSync(interrupted,'preserved recovery bytes');assert.throws(()=>restoreDatabase(path,backup),/already exists/);assert.equal(readFileSync(interrupted,'utf8'),'preserved recovery bytes');assert.equal(validateDatabase(path),3);rmSync(interrupted)
 const bad=join(dir,'bad');writeFileSync(bad,'not sqlite');assert.throws(()=>restoreDatabase(path,bad));assert.equal(validateDatabase(path),3)
 const release=lock(path);assert.throws(()=>backupDatabase(path,join(dir,'other')),/in use/);release();assert.throws(()=>backupDatabase(path,backup),/already exists/)
})
test('loopback API enforces origin, host, write intent, payload bounds, error shapes and pagination',async t=>{
 const {store,dir}=fixture(t);const dist=writeTokenFixture(dir);const server=createHost(store,{port:0});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port
 // Production authority is fixed; use a configurable test port once allocated.
 await new Promise(r=>server.close(r));const api=createHost(store,{port,dist});await new Promise(r=>api.listen(port,'127.0.0.1',r));t.after(()=>new Promise(r=>api.close(r)));const base=`http://127.0.0.1:${port}`
 assert.equal((await fetch(base+'/api/v1/health')).status,200)
 assert.equal((await fetch(base+'/api/v1/topology',{headers:{Origin:'http://evil.test'}})).status,403)
 assert.equal((await fetch(base+'/api/v1/topology',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403)
 assert.equal(await new Promise((resolve,reject)=>{http.get(base+'/api/v1/topology',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)}),403)
 const token=await fetchWriteToken(base)
 const put=(body,headers={})=>fetch(base+'/api/v1/topology',{method:'PUT',headers:{'Content-Type':'application/json','X-NetWatch-Write':token,...headers},body})
 assert.equal((await put(JSON.stringify({...input(),baseRevision:0}),{'X-NetWatch-Write':''})).status,403)
 assert.equal((await put('{')).status,400)
 assert.equal((await put('null')).status,400)
 assert.equal((await put(JSON.stringify({...input(),baseRevision:0}))).status,200)
 const stale=await put(JSON.stringify({...input(),baseRevision:0}));assert.equal(stale.status,409);assert.equal((await stale.json()).error.code,'revision_conflict')
 assert.equal((await put(JSON.stringify({...input(),baseRevision:1,topology:{nodes:[],edges:[{}]}}))).status,400)
 assert.equal((await fetch(base+'/api/v1/devices/r1/checks?limit=999')).status,400)
 assert.equal((await fetch(base+'/api/v1/devices/r1/checks')).status,200)
 assert.equal((await fetch(base+'/api/v1/snapshot')).status,200)
 const large=await put(' '.repeat(MAX_BODY+1));assert.equal(large.status,413)
 const chunked=await new Promise((resolve,reject)=>{const req=http.request(base+'/api/v1/topology',{method:'PUT',headers:{'Content-Type':'application/json','X-NetWatch-Write':token,'Transfer-Encoding':'chunked'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end(' '.repeat(MAX_BODY+1))});assert.equal(chunked,413)
 assert.equal((await fetch(base+'/api/v1/checks',{method:'POST'})).status,404)
})
test('ordered migrations upgrade v1 through v5 and preserve existing data', async t => {
 const time=Date.now()
 for(let version=1;version<=5;version++){
  await t.test('version '+version, sub=>{
   const dir=mkdtempSync(join(tmpdir(),'netwatch-migration-')),path=join(dir,'db')
   sub.after(()=>rmSync(dir,{recursive:true,force:true}))
   {
    const stop=Error('fixture version reached')
    assert.throws(()=>openStore(path,{['migrateV'+(version+1)]:()=>{throw stop}}),{message:stop.message})
   }
   const db=new DatabaseSync(path)
   try{
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,version)
    db.prepare('UPDATE inventory SET revision=3,payload=?').run(JSON.stringify({topology,monitoring:{r1:true,s1:false}}))
    if(version===1)db.prepare("INSERT INTO checks VALUES(31,'r1','up',?)").run(time)
    else db.prepare("INSERT INTO checks VALUES(31,'r1','up',?,'reachable','fixture',4)").run(time)
    if(version>=3)db.prepare("INSERT INTO incidents VALUES(2,'r1',?,?)").run(time-100,time)
    if(version>=4)db.exec("INSERT INTO snmp_targets VALUES('r1','00000000-0000-0000-0000-000000000001')")
    if(version>=5)db.prepare("INSERT INTO discovered_devices VALUES('00000000-0000-0000-0000-000000000002','192.0.2.2',NULL,NULL,'neighbor',?,?,'new',NULL,0)").run(time,time)
   }finally{db.close()}
   const restored=join(dir,'restored')
   assert.equal(validateDatabase(path),3)
   restoreDatabase(restored,path)
   const migrated=openStore(restored)
   try{
    assert.equal(migrated.db.prepare('PRAGMA user_version').get().user_version,6)
    assert.equal(migrated.revision(),4)
    assert.deepEqual(migrated.read().topology,topology)
    const [row]=migrated.history('r1').checks
    assert.equal(row.id,31)
    assert.equal(migrated.snapshot().observations[0].status,'up')
    assert.equal(row.reason,version===1?'legacy':'fixture')
    if(version>=3)assert.equal(migrated.incidents('r1').incidents[0].id,2)
    if(version>=4)assert.equal(migrated.interfaces('r1').configured,false)
    if(version>=5)assert.equal(migrated.discovered().devices[0].id,'00000000-0000-0000-0000-000000000002')
    assert.ok(migrated.db.prepare("SELECT name FROM sqlite_master WHERE name='checks_device_latest'").get())
   }finally{migrated.close()}
  })
 }
})
test('stable observations are sampled while live timestamps, latency, and incident transitions stay current',t=>{
 let now=Date.now()-600000
 const {store,path}=fixture(t,{now:()=>now})
 store.write(input({r1:true}),0)
 const append=(status='up',outcome='reachable',reason='reply',latencyMs=1,time=now)=>
  store.append([{deviceId:'r1',checkedAt:new Date(time).toISOString(),status,outcome,reason,latencyMs}])
 append()
 const start=now
 for(let i=1;i<=18;i++){now+=10000;append('up','reachable','reply',i)}
 const stable=store.history('r1').checks
 assert.deepEqual(stable.map(row=>Date.parse(row.checkedAt)),[start+3*HISTORY_SAMPLE_MS,start+2*HISTORY_SAMPLE_MS,start+HISTORY_SAMPLE_MS,start])
 now+=10000;append('up','reachable','reply',9)
 assert.equal(store.history('r1').checks.length,4)
 assert.equal(store.snapshot().observations[0].latencyMs,9)
 assert.equal(Date.parse(store.snapshot().observations[0].checkedAt),now)
 now+=10000;append('up','unreachable','loss',null)
 now+=10000;append('down','unreachable','loss',null)
 assert.equal(store.snapshot().activeIncidents.length,1)
 now+=10000;append('down','unreachable','no_route',null)
 now+=10000;append('up','reachable','reply',2,now-15000)
 assert.equal(store.snapshot().activeIncidents.length,1)
 assert.equal(store.snapshot().observations[0].status,'down')
 now+=10000;append()
 assert.equal(store.snapshot().activeIncidents.length,0)
 assert.equal(store.incidents('r1').incidents.length,1)
 assert.equal(store.history('r1').checks.length,9)
 now+=10000;append('up','reachable','reply',14)
 store.close()
 const reopened=openStore(path,{now:()=>now})
 try {
  assert.equal(reopened.snapshot().observations[0].latencyMs,14)
  assert.equal(reopened.history('r1').checks.length,9)
  const next=input({r1:true});next.topology.nodes[0].data.ip='192.0.2.2'
  reopened.write(next,1)
  assert.equal(reopened.snapshot().observations.length,0)
  assert.equal(reopened.history('r1').checks.length,0)
 } finally {reopened.close()}
})

test('v6 backfill takes newest timestamp then sequence and validates the latest rows in backups',t=>{
 const now=Date.now(),{store,path}=fixture(t,{now:()=>now})
 store.write(input({r1:true}),0);store.close()
 const legacy=new DatabaseSync(path)
 try {
  legacy.exec('DROP TABLE latest_check; PRAGMA user_version=5')
  const insert=legacy.prepare("INSERT INTO checks(device_id,status,checked_at,outcome,reason) VALUES('r1',?,?,'unreachable',?)")
  insert.run('up',now-100,'tied older');insert.run('unknown',now-1000,'old timestamp');insert.run('down',now-100,'tied newer');insert.run('up',now-1100,'late insert')
 }finally{legacy.close()}
 const migrated=openStore(path,{now:()=>now})
 try{
  assert.equal(migrated.snapshot().observations[0].reason,'tied newer')
  assert.equal(migrated.history('r1').checks.length,4)
  assert.equal(validateDatabase(path),1)
  migrated.db.exec("UPDATE latest_check SET device_id='unknown_device'")
  assert.throws(()=>validateDatabase(path),/Invalid latest observation/)
  migrated.db.prepare("UPDATE latest_check SET device_id='r1', checked_at=?").run(now+86400000)
  assert.throws(()=>validateDatabase(path),/Invalid latest observation/)
 }finally{migrated.close()}
})

test('WAL reads succeed while a separate writer holds the write lock',t=>{
 const {store,path}=fixture(t)
 store.write(input({r1:true}),0)
 store.append([{deviceId:'r1',status:'up',checkedAt:new Date().toISOString()}])
 const writer=new DatabaseSync(path)
 try {
  writer.exec('BEGIN IMMEDIATE; UPDATE inventory SET revision=revision+1')
  assert.equal(store.snapshot().inventory.revision,1)
  assert.equal(store.history('r1').checks.length,1)
  assert.equal(store.incidents('r1').incidents.length,0)
  writer.exec('COMMIT')
  assert.equal(store.revision(),2)
  assert.equal(store.snapshot().inventory.revision,2)
 } finally {writer.close()}
})
