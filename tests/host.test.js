import test from 'node:test'
import http from 'node:http'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openStore, MAX_BODY } from '../host/store.js'
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
 const changed=input({s1:true});changed.topology.nodes[0].data.ip='2001:db8::2';store.write(changed,1);assert.equal(store.history('r1').checks.length,0);assert.equal(store.history('s1').checks.length,1)
 assert.throws(()=>store.append([{deviceId:'r1',status:'up',checkedAt:new Date(now).toISOString()}]))
 assert.throws(()=>store.append([{deviceId:'toString',status:'up',checkedAt:new Date(now).toISOString()}]))
 assert.throws(()=>store.append([null]))
})
test('history pagination has stable cursors, bounds and retention; restart removes old rows',t=>{
 let now=Date.now();const {store,path}=fixture(t,{now:()=>now});store.write(input({r1:true}),0)
 store.append(Array.from({length:5},(_,i)=>({deviceId:'r1',status:'up',checkedAt:new Date(now-i*1000).toISOString()})))
 const first=store.history('r1',{limit:2});const second=store.history('r1',{limit:2,before:first.nextBefore});assert.equal(first.checks.length,2);assert.ok(second.checks.every(c=>c.id<first.nextBefore))
 assert.throws(()=>store.history('r1',{limit:201}));assert.throws(()=>store.history('r1',{before:0}));assert.throws(()=>store.history('missing'),e=>e.status===404)
 now+=31*86400000;store.close();const reopened=openStore(path,{now:()=>now});assert.equal(reopened.history('r1').checks.length,0);reopened.close()
})
test('history total cap bounds growth',t=>{
 const {store}=fixture(t);store.write(input({r1:true}),0)
 store.db.exec('BEGIN');const insert=store.db.prepare('INSERT INTO checks(device_id,status,checked_at) VALUES(?,?,?)');for(let i=0;i<100005;i++)insert.run('r1','up',Date.now());store.db.exec('COMMIT')
 store.snapshot();assert.equal(store.db.prepare('SELECT COUNT(*) n FROM checks').get().n,100000)
})
test('failed initial migration rolls back schema; future schemas are rejected without modification',t=>{
 const dir=mkdtempSync(join(tmpdir(),'netwatch-migration-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db')
 assert.throws(()=>openStore(path,{migrate:()=>{throw new Error('migration interrupted')}}),/interrupted/)
 const db=new DatabaseSync(path);assert.equal(db.prepare('PRAGMA user_version').get().user_version,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='inventory'").get().n,0);db.exec('PRAGMA user_version=2');db.close()
 assert.throws(()=>openStore(path),/newer/);const check=new DatabaseSync(path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,2);check.close()
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
 const {store}=fixture(t);const server=createHost(store,{port:0});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port
 // Production authority is fixed; use a configurable test port once allocated.
 await new Promise(r=>server.close(r));const api=createHost(store,{port});await new Promise(r=>api.listen(port,'127.0.0.1',r));t.after(()=>new Promise(r=>api.close(r)));const base=`http://127.0.0.1:${port}`
 assert.equal((await fetch(base+'/api/v1/health')).status,200)
 assert.equal((await fetch(base+'/api/v1/topology',{headers:{Origin:'http://evil.test'}})).status,403)
 assert.equal((await fetch(base+'/api/v1/topology',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403)
 assert.equal(await new Promise((resolve,reject)=>{http.get(base+'/api/v1/topology',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)}),403)
 const put=(body,headers={})=>fetch(base+'/api/v1/topology',{method:'PUT',headers:{'Content-Type':'application/json','X-NetWatch-Write':'1',...headers},body})
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
 const chunked=await new Promise((resolve,reject)=>{const req=http.request(base+'/api/v1/topology',{method:'PUT',headers:{'Content-Type':'application/json','X-NetWatch-Write':'1','Transfer-Encoding':'chunked'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end(' '.repeat(MAX_BODY+1))});assert.equal(chunked,413)
 assert.equal((await fetch(base+'/api/v1/checks',{method:'POST'})).status,404)
})
