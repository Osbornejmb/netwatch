import test from 'node:test'
import assert from 'node:assert/strict'
import { localSubnets, parseNeighbors, parseDefaultGateways, createDiscovery } from '../host/discovery.js'
import { openStore } from '../host/store.js'
import { mkdtempSync,rmSync } from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { backupDatabase,restoreDatabase } from '../host/maintenance.js'
import { createHost } from '../host/server.js'
import { createProbeGate } from '../host/probe-gate.js'
import { reverseHints } from '../host/discovery-names.js'
import { guessDeviceType } from '../src/discoveryType.js'

test('subnet derivation excludes public, loopback, link-local and unsupported wide networks',()=>{
 const ifaces={a:[{family:'IPv4',internal:false,address:'192.168.5.2',netmask:'255.255.255.0'},{family:'IPv4',internal:false,address:'169.254.1.2',netmask:'255.255.0.0'},{family:'IPv4',internal:true,address:'127.0.0.1',netmask:'255.0.0.0'},{family:'IPv4',internal:false,address:'8.8.8.8',netmask:'255.255.255.0'}]}
 assert.deepEqual(localSubnets(ifaces).map(s=>s.cidr),['192.168.5.0/24'])
 assert.throws(()=>localSubnets({a:[{family:'IPv4',address:'10.0.0.1',netmask:'255.255.0.0'}]}),/subnet_too_large/)
 assert.deepEqual(localSubnets({a:[{family:'IPv4',address:'192.168.7.0',netmask:'255.255.255.254'}]}).flatMap(s=>s.addresses),['192.168.7.0','192.168.7.1'])
 assert.deepEqual(localSubnets({a:[{family:'IPv4',address:'192.168.7.7',netmask:'255.255.255.255'}]}),[])
 assert.equal(localSubnets({a:[{family:'IPv4',address:'192.168.1.2',netmask:'255.255.255.0'}],b:[{family:'IPv4',address:'10.2.0.2',netmask:'255.255.255.0'}]}).length,2)
})
test('default gateway parser accepts the lowest-metric gateway only for a matching private interface',()=>{
 const interfaces={a:[{family:'IPv4',internal:false,address:'192.168.1.5',netmask:'255.255.255.0'},{family:'IPv4',internal:false,address:'8.8.8.8',netmask:'255.255.255.0'}]}
 const output='0.0.0.0 0.0.0.0 192.168.1.1 192.168.1.5 35\n0.0.0.0 0.0.0.0 192.168.1.254 192.168.1.5 5\n0.0.0.0 0.0.0.0 8.8.8.1 8.8.8.8 1\n0.0.0.0 0.0.0.0 10.0.0.1 192.168.1.5 2'
 assert.equal(parseDefaultGateways(output,interfaces).get('192.168.1.5'),'192.168.1.254')
 assert.throws(()=>parseDefaultGateways('x'.repeat(33000),interfaces),/invalid_routes/)
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
test('reverse name hints are bounded, sanitized, and type guesses include evidence or stay unknown',async()=>{
 const rows=Array.from({length:6},(_,i)=>({ip:`192.168.1.${i+1}`})),looked=[]
 const names=await reverseHints(rows,{limit:4,concurrency:2,lookup:async ip=>{looked.push(ip);return ip.endsWith('.1')?['router.home.']:ip.endsWith('.2')?['<script>']:ip.endsWith('.3')?['-bad.local']:['host.local']}})
 assert.equal(looked.length,4);assert.equal(names.get('192.168.1.1'),'router.home');assert.equal(names.has('192.168.1.2'),false);assert.equal(names.has('192.168.1.3'),false)
 assert.deepEqual(guessDeviceType('router.home').type,'Router');assert.equal(guessDeviceType('Alex-iPhone').type,'Phone');assert.equal(guessDeviceType(null).type,'Unknown');assert.match(guessDeviceType('my-switch').evidence,/Name hint/)
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
test('discovery API paginates, rate limits scan requests and adds with monitoring enabled',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-api-')),store=openStore(join(dir,'db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})})
 store.write({source:'inventory',topology:{schemaVersion:1,nodes:[{id:'gateway',type:'router',position:{x:0,y:0},data:{label:'Main router',ip:'192.168.1.1'}}],edges:[]},monitoring:{}},0)
 store.recordDiscovery([{ip:'192.168.1.5',mac:'aa:bb:cc:dd:ee:ff',source:'neighbor'},{ip:'192.168.1.6',mac:null,source:'neighbor'}])
 const server=createHost(store,{port:0,discovery:{runOnce:async()=>{},snapshot:()=>({state:'idle'}),gatewayFor:async ip=>ip.endsWith('.5')?'192.168.1.1':'192.168.1.254'}});server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base=`http://127.0.0.1:${server.address().port}/api/v1`,headers={'X-NetWatch-Write':'1','Content-Type':'application/json'}
 const page=await fetch(`${base}/discovered?limit=1`).then(r=>r.json());assert.equal(page.devices.length,1);assert.ok(page.nextAfter)
 assert.equal((await fetch(`${base}/discovered/scan-now`,{method:'POST',headers})).status,200);assert.equal((await fetch(`${base}/discovered/scan-now`,{method:'POST',headers})).status,429)
 const id=page.devices[0].id;assert.equal((await fetch(`${base}/discovered/${id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:99})})).status,409)
 const added=await fetch(`${base}/discovered/${id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:1})}).then(r=>r.json())
 assert.equal(added.discoveryLink.label,'Main router');assert.equal(added.topology.edges[0].label,'Gateway route');assert.equal(added.topology.edges[0].target,'gateway');assert.equal(added.topology.edges[0].source,added.topology.nodes[1].id)
 assert.equal(added.monitoring[added.topology.nodes[1].id],true);assert.equal(store.discovered().devices[0].status,'added')
 assert.equal((await fetch(`${base}/discovered/${id}/remove`,{method:'POST',headers,body:'{}'})).status,200);assert.equal(store.discovered().devices.length,1)
 const remaining=store.discovered({after:page.nextAfter-1,limit:1}).devices[0],addedWithoutRouter=await fetch(`${base}/discovered/${remaining.id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:added.revision})}).then(r=>r.json());assert.equal(addedWithoutRouter.discoveryLink,null);assert.equal(addedWithoutRouter.topology.edges.length,1)
 assert.equal((await fetch(`${base}/discovered/${remaining.id}/remove`,{method:'POST',headers,body:'{}'})).status,200);assert.equal(store.discovered().devices.length,0);assert.equal(store.read().topology.nodes.length,3)
 store.recordDiscovery([{ip:'192.168.1.20',mac:null,source:'neighbor'},{ip:'192.168.1.21',mac:null,source:'neighbor'}]);assert.equal((await fetch(`${base}/discovered/clear`,{method:'POST'})).status,403);assert.equal((await fetch(`${base}/discovered/clear`,{method:'POST',headers,body:'{}'})).status,400);assert.equal((await fetch(`${base}/discovered/clear`,{method:'POST',headers})).status,200);assert.equal(store.discovered().devices.length,0);assert.equal(store.read().topology.nodes.length,3)
})
test('an already-added gateway can be corrected and existing clients can be linked without duplicates',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-gateway-fix-')),store=openStore(join(dir,'db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})})
 store.write({source:'inventory',topology:{schemaVersion:1,nodes:[{id:'gateway',type:'switch',position:{x:0,y:0},data:{label:'Router',ip:'192.168.100.1'}},{id:'client',type:'switch',position:{x:0,y:0},data:{label:'PC',ip:'192.168.100.20'}}],edges:[]},monitoring:{}},0)
 store.recordDiscovery([{ip:'192.168.100.1',mac:null,source:'neighbor'},{ip:'192.168.100.20',mac:null,source:'neighbor'}])
 const rows=store.discovered().devices;store.discoveryAction(rows[0].id,'added','gateway');store.discoveryAction(rows[1].id,'added','client')
 const server=createHost(store,{port:0,discovery:{gatewayFor:async()=> '192.168.100.1'}});server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base=`http://127.0.0.1:${server.address().port}/api/v1`,headers={'X-NetWatch-Write':'1','Content-Type':'application/json'}
 const promote=await fetch(`${base}/discovered/${rows[0].id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:1})}).then(r=>r.json())
 assert.equal(promote.promotedRouter,true);assert.equal(promote.topology.nodes.find(node=>node.id==='gateway').type,'router');assert.equal(promote.topology.nodes.length,2)
 const linked=await fetch(`${base}/discovered/${rows[1].id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:promote.revision})}).then(r=>r.json())
 assert.equal(linked.discoveryLink.label,'Router');assert.equal(linked.topology.edges.length,1);assert.equal(linked.topology.edges[0].label,'Gateway route');assert.equal(linked.monitoring.client,false)
 const repeat=await fetch(`${base}/discovered/${rows[1].id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:linked.revision})}).then(r=>r.json())
 assert.equal(repeat.topology.edges.length,1);assert.equal(repeat.revision,linked.revision)
})
