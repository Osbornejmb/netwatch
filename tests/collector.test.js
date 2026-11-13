import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openStore } from '../host/store.js'
import { backupDatabase, restoreDatabase } from '../host/maintenance.js'
import { createCollector } from '../host/collector.js'
import { createHost } from '../host/server.js'
import { createWindowsProbe } from '../host/windows-probe.js'
import { ICMP_POLICY, cycleBudget, freshnessPolicy } from '../host/icmp-policy.js'

const up = {outcome:'reachable',reason:'success',latencyMs:2}
const down = {outcome:'unreachable',reason:'TimedOut',latencyMs:null}
function setup(t, count=1) {
 const dir=mkdtempSync(join(tmpdir(),'netwatch-collector-'));const path=join(dir,'db');const store=openStore(path)
 const topology={schemaVersion:1,nodes:Array.from({length:count},(_,i)=>({id:`d${i}`,type:'switch',position:{x:i*200,y:0},data:{label:`Device ${i}`,ip:`192.0.2.${i+1}`}})),edges:[]}
 const input={source:'inventory',topology,monitoring:Object.fromEntries(topology.nodes.map(n=>[n.id,true]))};store.write(input,0)
 t.after(()=>{try{store.close()}catch{}rmSync(dir,{recursive:true,force:true})})
 return {store,input,path,dir}
}
const collector=(store,runner,options={})=>createCollector(store,{enabled:true,platform:'win32',runner,...options})
const tick=()=>new Promise(resolve=>setImmediate(resolve))

test('shutdown waits for helper preparation and aborted child close before releasing workers',async t=>{
 const {store}=setup(t);let prepared
 const preparing=new Promise(resolve=>{prepared=resolve})
 const child=new EventEmitter();let started
 const launched=new Promise(resolve=>{started=resolve})
 const runner=createWindowsProbe({platform:'win32',prepare:()=>preparing,execute:(_,args,{signal},callback)=>{
  signal.addEventListener('abort',()=>callback(new Error('aborted')),{once:true});started();return child
 }})
 const c=collector(store,runner);c.runOnce();await tick()
 let stopped=false;const stopping=c.stop().then(()=>{stopped=true});await tick()
 assert.equal(stopped,false);prepared('test.exe');await stopping
 assert.equal(store.history('d0').checks.length,0)

 const next=collector(store,runner);next.runOnce();await launched
 stopped=false;const closing=next.stop().then(()=>{stopped=true});await tick()
 assert.equal(stopped,false);child.emit('close');await closing
 assert.equal(stopped,true);assert.equal(store.history('d0').checks.length,0)
})

test('healthy, transient loss, sustained failure and recovery persist raw outcomes separately from policy status',async t=>{
 const {store}=setup(t);const results=[up,down,up,down,down,down,up];const c=collector(store,async()=>results.shift())
 const statuses=[]
 for(let i=0;i<7;i++){await c.runOnce();statuses.push(store.history('d0').checks[0].status)}
 assert.deepEqual(statuses,['up','up','up','up','down','down','up'])
 const checks=store.history('d0').checks;assert.equal(checks[0].latencyMs,2);assert.equal(checks[1].latencyMs,null);assert.equal(checks[2].outcome,'unreachable');assert.equal(checks[2].status,'down')
 assert.ok(c.snapshot().lastSuccessfulCycleAt);assert.equal(c.snapshot().errors,0);await c.stop()
})
test('initial packet loss stays unknown until threshold; process/permission errors do not become device down',async t=>{
 const {store}=setup(t);const results=[down,{outcome:'error',code:'icmp_exception'},down,down]
 const c=collector(store,async()=>results.shift());await c.runOnce();assert.equal(store.snapshot().observations[0].status,'unknown')
 await c.runOnce();assert.equal(c.snapshot().state,'degraded');assert.equal(c.snapshot().ready,false);assert.equal(store.history('d0').checks.length,1)
 await c.runOnce();assert.equal(store.history('d0').checks[0].status,'unknown');await c.runOnce();assert.equal(store.history('d0').checks[0].status,'down');await c.stop()
})
test('only opted-in inventory is visited; unsupported and disabled collectors never invoke a runner',async t=>{
 const {store,input}=setup(t,3);input.monitoring.d1=false;input.monitoring.d2=false;store.write(input,1)
 const targets=[];const runner=async address=>{targets.push(address);return up};const c=collector(store,runner);await c.runOnce();assert.deepEqual(targets,['192.0.2.1']);await c.stop()
 const disabled=createCollector(store,{runner});await disabled.runOnce();assert.equal(disabled.snapshot().state,'disabled')
 const unsupported=createCollector(store,{enabled:true,platform:'linux',runner});await unsupported.runOnce();assert.equal(unsupported.snapshot().state,'unsupported');assert.equal(targets.length,1)
})
test('worker cap and single active cycle prevent overlapping polling',async t=>{
 const {store}=setup(t,20);let current=0,peak=0,calls=0
 const c=collector(store,async()=>{calls++;current++;peak=Math.max(peak,current);await tick();current--;return up})
 const first=c.runOnce();const second=c.runOnce();assert.equal(first,second);await first
 assert.equal(calls,20);assert.equal(peak,ICMP_POLICY.concurrency);assert.equal(c.snapshot().completedChecks,20);await c.stop()
})
test('inventory revisions cancel in-flight authorization and discard obsolete results',async t=>{
 const {store,input}=setup(t);let release,started
 const waiting=new Promise(resolve=>{started=resolve});const c=collector(store,async()=>{started();return new Promise(resolve=>{release=resolve})})
 const running=c.runOnce();await waiting;input.topology.nodes[0].data.ip='192.0.2.99';store.write(input,1);release(up);await running
 assert.equal(store.history('d0').checks.length,0);assert.equal(c.snapshot().state,'starting');assert.equal(c.snapshot().diagnostics[0].code,'inventory_changed');await c.stop()
})
test('hard runner timeout is a collector error; shutdown cancels active workers and queued probes',async t=>{
 const {store}=setup(t,20);let calls=0,aborted=0
 const runner=async(_, {signal})=>{calls++;signal.addEventListener('abort',()=>aborted++,{once:true});return new Promise(()=>{})}
 const timeout=collector(store,runner,{policy:{...ICMP_POLICY,processTimeoutMs:15}});await timeout.runOnce();assert.equal(timeout.snapshot().errors,20);assert.equal(timeout.snapshot().diagnostics[0].code,'runner_timeout');assert.equal(store.history('d0').checks.length,0);await timeout.stop()
 calls=0;const c=collector(store,runner);const running=c.runOnce();await tick();await c.stop();await running
 assert.equal(calls,8);assert.ok(aborted>=8);assert.equal(c.snapshot().state,'stopped');await c.runOnce();assert.equal(calls,8)
})
test('scheduler respects cadence and does not retry errors in a tight loop',async t=>{
 const {store}=setup(t);const starts=[]
 const c=collector(store,async()=>{starts.push(Date.now());return {outcome:'error',code:'runner_process_error'}},{policy:{...ICMP_POLICY,intervalMs:60}})
 c.start();while(starts.length<2)await new Promise(resolve=>setTimeout(resolve,20));await c.stop()
 // Scheduler has a one-second minimum delay even for a short injected interval.
 assert.ok(starts[1]-starts[0]>=900);assert.equal(store.history('d0').checks.length,0)
})
test('Windows adapter validates targets and uses fixed argv, bounded output/time and no shell interpolation',async()=>{
 const calls=[]
 const probe=createWindowsProbe({platform:'win32',prepare:async()=> 'C:\\test\\ping.exe',execute:(exe,args,options,cb)=>{calls.push({exe,args,options});cb(null,JSON.stringify(up))}})
 assert.equal((await probe('example.com & whoami')).code,'invalid_target');assert.equal((await probe('')).code,'invalid_target');assert.equal(calls.length,0)
 assert.deepEqual(await probe('2001:0db8::1'),up);assert.deepEqual(calls[0].args,['2001:db8::1','1500']);assert.equal(calls[0].options.shell,false);assert.equal(calls[0].options.timeout,4000);assert.equal(calls[0].options.maxBuffer,4096)
 assert.ok(calls[0].exe.endsWith('ping.exe'));assert.equal(calls[0].args.length,2)
 let preparations=0;const unavailable=createWindowsProbe({platform:'win32',prepare:async()=>{preparations++;throw new Error('blocked')}});assert.equal((await unavailable('192.0.2.1')).code,'helper_unavailable');assert.equal((await unavailable('192.0.2.1')).code,'helper_unavailable');assert.equal(preparations,1)
 const invalid=createWindowsProbe({platform:'win32',prepare:async()=> 'C:\\test\\ping.exe',execute:(_,a,o,cb)=>cb(null,'not json')});assert.equal((await invalid('192.0.2.1')).code,'invalid_runner_output')
 const failed=createWindowsProbe({platform:'win32',prepare:async()=> 'C:\\test\\ping.exe',execute:(_,a,o,cb)=>cb(new Error('permission denied'))});assert.equal((await failed('192.0.2.1')).code,'runner_process_error')
 const localError=createWindowsProbe({platform:'win32',prepare:async()=> 'C:\\test\\ping.exe',execute:(_,a,o,cb)=>cb(null,'{"outcome":"error","code":"icmp_local_error"}')});assert.equal((await localError('192.0.2.1')).outcome,'error')
 const badLatency=createWindowsProbe({platform:'win32',prepare:async()=> 'C:\\test\\ping.exe',execute:(_,a,o,cb)=>cb(null,'{"outcome":"reachable","reason":"success","latencyMs":-1}')});assert.equal((await badLatency('192.0.2.1')).code,'invalid_runner_output')
})
test('v1 schema migration preserves inventory/history; interrupted v2 migration rolls back; backups restore latency data',t=>{
 const {store,path,dir}=setup(t);store.close();const old=new DatabaseSync(path)
 old.exec(`DROP TABLE interface_samples;DROP TABLE snmp_targets;DROP TABLE incidents;DROP TABLE checks;CREATE TABLE checks(seq INTEGER PRIMARY KEY AUTOINCREMENT,device_id TEXT NOT NULL,status TEXT NOT NULL,checked_at INTEGER NOT NULL);CREATE INDEX checks_device_time ON checks(device_id,seq);CREATE INDEX checks_time ON checks(checked_at);PRAGMA user_version=1;`)
 old.prepare('INSERT INTO checks VALUES(1,?,?,?)').run('d0','up',Date.now());old.close()
 const legacy=join(dir,'legacy-backup');backupDatabase(path,legacy)
 assert.throws(()=>openStore(path,{migrateV2:()=>{throw new Error('interrupted')}}),/interrupted/)
 const check=new DatabaseSync(path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,1);assert.equal(check.prepare('SELECT status FROM checks').get().status,'up');check.close()
 const migrated=openStore(path);assert.equal(migrated.read().revision,1);assert.equal(migrated.history('d0').checks[0].reason,'legacy')
 migrated.append([{deviceId:'d0',status:'up',...up,checkedAt:new Date().toISOString()}],{revision:1});assert.throws(()=>migrated.append([],{revision:0}),e=>e.status===409);migrated.close()
 const backup=join(dir,'backup');backupDatabase(path,backup);restoreDatabase(path,backup);const restored=openStore(path);assert.equal(restored.history('d0').checks[0].latencyMs,2);restored.close()
 restoreDatabase(path,legacy);const legacyRestored=openStore(path);assert.equal(legacyRestored.history('d0').checks[0].reason,'legacy');assert.equal(legacyRestored.history('d0').checks[0].id,1);legacyRestored.close()
})
test('v1 migration never reuses history IDs after the newest rows were deleted',t=>{
 const {store,path}=setup(t);store.close()
 const old=new DatabaseSync(path)
 old.exec(`DROP TABLE interface_samples;DROP TABLE snmp_targets;DROP TABLE incidents;DROP TABLE checks;CREATE TABLE checks(seq INTEGER PRIMARY KEY AUTOINCREMENT,device_id TEXT NOT NULL,status TEXT NOT NULL,checked_at INTEGER NOT NULL);PRAGMA user_version=1;`)
 old.prepare('INSERT INTO checks VALUES(500,?,?,?)').run('d0','up',Date.now())
 old.exec('DELETE FROM checks');old.close()
 const migrated=openStore(path)
 try {
  migrated.append([{deviceId:'d0',status:'up',...up,checkedAt:new Date().toISOString()}])
  assert.equal(migrated.history('d0').checks[0].id,501)
 } finally {migrated.close()}
})

test('cycle/freshness budget scales with worker capacity and collector errors never refresh old observations',async t=>{
 assert.equal(cycleBudget(1),10000);assert.equal(freshnessPolicy(1).staleAfterMs,30000);assert.equal(cycleBudget(100),52000);assert.equal(cycleBudget(2000),1000000);assert.equal(freshnessPolicy(100).staleAfterMs,114000)
 const {store}=setup(t);let result=up;const c=collector(store,async()=>result);await c.runOnce();const previous=store.history('d0').checks[0];const successful=c.snapshot().lastSuccessfulCycleAt
 result={outcome:'error',code:'runner_process_error'};await c.runOnce();assert.deepEqual(store.history('d0').checks[0],previous);assert.equal(c.snapshot().lastSuccessfulCycleAt,successful);await c.stop()
})


test('host API separates database readiness, collector readiness, raw outcomes and measured latency',async t=>{
 const {store}=setup(t);let result=up;const c=collector(store,async()=>result)
 const server=createHost(store,{port:0,collector:c});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`
 try {
  await c.runOnce();const first=await (await fetch(base+'/api/v1/snapshot')).json();assert.equal(first.observations[0].latencyMs,2);assert.equal(first.collector.ready,true);assert.equal(first.freshness.staleAfterMs,30000)
  result={outcome:'error',code:'runner_process_error'};await c.runOnce()
  const health=await (await fetch(base+'/api/v1/health')).json();assert.equal(health.ready,true);assert.equal(health.collector.ready,false);assert.equal(health.collector.diagnostics[0].code,'runner_process_error')
  const snapshot=await (await fetch(base+'/api/v1/snapshot')).json();assert.deepEqual(snapshot.observations,first.observations)
  const history=await (await fetch(base+'/api/v1/devices/d0/checks')).json();assert.equal(history.checks[0].outcome,'reachable');assert.equal(history.checks[0].latencyMs,2)
 } finally {await c.stop();await new Promise(resolve=>server.close(resolve))}
})
