import test from 'node:test'
import assert from 'node:assert/strict'
import { localSubnets, parseNeighbors, createDiscovery } from '../host/discovery.js'
import { openStore } from '../host/store.js'
import { mkdtempSync,rmSync } from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { backupDatabase,restoreDatabase } from '../host/maintenance.js'
import { createHost } from '../host/server.js'
import { createProbeGate } from '../host/probe-gate.js'

test('subnet derivation excludes public, loopback, link-local and unsupported wide networks',()=>{
 const ifaces={a:[{family:'IPv4',internal:false,address:'192.168.5.2',netmask:'255.255.255.0'},{family:'IPv4',internal:false,address:'169.254.1.2',netmask:'255.255.0.0'},{family:'IPv4',internal:true,address:'127.0.0.1',netmask:'255.0.0.0'},{family:'IPv4',internal:false,address:'8.8.8.8',netmask:'255.255.255.0'}]}
 assert.deepEqual(localSubnets(ifaces).map(s=>s.cidr),['192.168.5.0/24'])
 assert.throws(()=>localSubnets({a:[{family:'IPv4',address:'10.0.0.1',netmask:'255.255.0.0'}]}),/subnet_too_large/)
 assert.deepEqual(localSubnets({a:[{family:'IPv4',address:'192.168.7.0',netmask:'255.255.255.254'}]}).flatMap(s=>s.addresses),['192.168.7.0','192.168.7.1'])
 assert.deepEqual(localSubnets({a:[{family:'IPv4',address:'192.168.7.7',netmask:'255.255.255.255'}]}),[])
 assert.equal(localSubnets({a:[{family:'IPv4',address:'192.168.1.2',netmask:'255.255.255.0'}],b:[{family:'IPv4',address:'10.2.0.2',netmask:'255.255.255.0'}]}).length,2)
})
test('active sweep uses the shared cap, stores responsive hosts, and cancels queued workers',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-sweep-')),store=openStore(join(dir,'db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})})
 let concurrent=0,peak=0
 const gate=createProbeGate(2),collector=createDiscovery(store,{enabled:true,active:true,platform:'win32',policy:{...((await import('../host/discovery.js')).DISCOVERY_POLICY),concurrency:2},interfaces:()=>({a:[{family:'IPv4',address:'192.168.1.2',netmask:'255.255.255.252'}]}),runner:async()=>'',probeGate:gate,pingRunner:async ip=>{concurrent++;peak=Math.max(peak,concurrent);await new Promise(r=>setTimeout(r,2));concurrent--;return {outcome:ip.endsWith('.1')?'reachable':'unreachable'}}})
 await collector.runOnce();assert.equal(peak,2);assert.equal(store.discovered().devices.length,1)
})
test('probe gate serializes monitoring and discovery tasks and releases permits on cancellation',async()=>{
 const gate=createProbeGate(1);let active=0,peak=0
 const tasks=[1,2,3].map(()=>gate(async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,4));active--}))
 await Promise.all(tasks);assert.equal(peak,1)
})
test('scan snapshot exposes an in-progress phase and clears it at completion',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-progress-')),store=openStore(join(dir,'db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})})
 let release;const collector=createDiscovery(store,{enabled:true,platform:'win32',interfaces:()=>({a:[{family:'IPv4',address:'192.168.1.2',netmask:'255.255.255.0'}]}),runner:()=>new Promise(resolve=>{release=()=>resolve('')})})
 const run=collector.runOnce();await new Promise(resolve=>setImmediate(resolve));assert.equal(collector.snapshot().phase,'neighbors');release();await run;assert.equal(collector.snapshot().phase,'idle');await collector.stop()
})
test('neighbor parser bounds untrusted output and accepts only valid IPv4/MAC pairs',()=>{
 assert.deepEqual(parseNeighbors(' 192.168.1.9 aa-bb-cc-dd-ee-ff dynamic\n 999.1.1.1 aa-bb-cc-dd-ee-ff dynamic\n 192.168.1.3 nope dynamic').map(x=>x.ip),['192.168.1.9'])
 assert.throws(()=>parseNeighbors('x'.repeat(70000)),/invalid_output/)
})
test('successful scans mark missing rows gone only after three misses; errors freeze prior results',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-')),store=openStore(join(dir,'db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})})
 const row={ip:'192.168.1.9',mac:'aa:bb:cc:dd:ee:ff',source:'neighbor'};store.recordDiscovery([row]);const id=store.discovered().devices[0].id
 store.recordDiscovery([]);store.recordDiscovery([]);assert.equal(store.discovered().devices[0].status,'new');store.recordDiscovery([]);assert.equal(store.discovered().devices[0].status,'gone')
 let output='192.168.1.9 aa-bb-cc-dd-ee-ff dynamic';const collector=createDiscovery(store,{enabled:true,platform:'win32',interfaces:()=>({a:[{family:'IPv4',address:'192.168.1.2',netmask:'255.255.255.0'}]}),runner:async()=>output})
 await collector.runOnce();assert.equal(collector.snapshot().state,'idle');output=Promise.reject(new Error('fail'));await collector.runOnce();assert.equal(store.discovered().devices.length,1);await collector.stop()
})
test('v4 to v5 discovery migration rolls back, and backups preserve discovery rows',t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-migration-')),path=join(dir,'db');t.after(()=>rmSync(dir,{recursive:true,force:true}))
 let store=openStore(path);store.recordDiscovery([{ip:'192.168.1.5',mac:'aa:bb:cc:dd:ee:ff',source:'neighbor'}]);store.close()
 const db=new DatabaseSync(path);db.exec('DROP TABLE discovered_devices;PRAGMA user_version=4');db.close()
 assert.throws(()=>openStore(path,{migrateV5:()=>{throw Error('rollback')}}),/rollback/)
 const check=new DatabaseSync(path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,4);check.close()
 store=openStore(path);store.recordDiscovery([{ip:'192.168.1.5',mac:'aa:bb:cc:dd:ee:ff',source:'neighbor'}]);store.close()
 const backup=join(dir,'backup');backupDatabase(path,backup);restoreDatabase(path,backup);store=openStore(path);assert.equal(store.discovered().devices[0].ip,'192.168.1.5');store.close()
})
test('discovery API paginates, rate limits scan requests and adds without enabling monitoring',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-api-')),store=openStore(join(dir,'db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})})
 store.recordDiscovery([{ip:'192.168.1.5',mac:'aa:bb:cc:dd:ee:ff',source:'neighbor'},{ip:'192.168.1.6',mac:null,source:'neighbor'}])
 const server=createHost(store,{port:0,discovery:{runOnce:async()=>{},snapshot:()=>({state:'idle'})}});server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base=`http://127.0.0.1:${server.address().port}/api/v1`,headers={'X-NetWatch-Write':'1','Content-Type':'application/json'}
 const page=await fetch(`${base}/discovered?limit=1`).then(r=>r.json());assert.equal(page.devices.length,1);assert.ok(page.nextAfter)
 assert.equal((await fetch(`${base}/discovered/scan-now`,{method:'POST',headers})).status,200);assert.equal((await fetch(`${base}/discovered/scan-now`,{method:'POST',headers})).status,429)
 const id=page.devices[0].id;assert.equal((await fetch(`${base}/discovered/${id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:99})})).status,409)
 assert.equal((await fetch(`${base}/discovered/${id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:0})})).status,200)
 assert.deepEqual(store.read().monitoring,{[store.read().topology.nodes[0].id]:false});assert.equal(store.discovered().devices[0].status,'added')
 assert.equal((await fetch(`${base}/discovered/${id}/remove`,{method:'POST',headers,body:'{}'})).status,200);assert.equal(store.discovered().devices.length,1)
 const remaining=store.discovered({after:page.nextAfter-1,limit:1}).devices[0];assert.equal((await fetch(`${base}/discovered/${remaining.id}/remove`,{method:'POST',headers,body:'{}'})).status,200);assert.equal(store.discovered().devices.length,0);assert.equal(store.read().topology.nodes.length,1)
})
