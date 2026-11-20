import { applyDiscoveryPatch } from './fixtures/discovery-draft.js'
import { fetchWriteToken, writeTokenFixture } from './fixtures/write-token.js'
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
 const db=new DatabaseSync(path);db.exec('DROP TABLE topology_runs;DROP TABLE topology_hints;DROP TABLE audit_log;DROP TABLE sessions;DROP TABLE auth_config;DROP TABLE latest_check;DROP TABLE discovered_devices;PRAGMA user_version=4');db.close()
 backupDatabase(path,path+'.pre-v11.bak')
 assert.throws(()=>openStore(path,{migrateV5:()=>{throw Error('rollback')}}),/rollback/)
 const check=new DatabaseSync(path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,4);check.close()
 store=openStore(path);store.recordDiscovery([{ip:'192.168.1.5',mac:'aa:bb:cc:dd:ee:ff',source:'neighbor'}]);store.close()
 const backup=join(dir,'backup');backupDatabase(path,backup);restoreDatabase(path,backup);store=openStore(path);assert.equal(store.discovered().devices[0].ip,'192.168.1.5');store.close()
})
test('discovery API paginates, rate limits scan requests and previews a draft without enabling monitoring',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-api-')),store=openStore(join(dir,'db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})})
 store.write({source:'inventory',topology:{schemaVersion:1,nodes:[{id:'gateway',type:'router',position:{x:0,y:0},data:{label:'Main router',ip:'192.168.1.1'}}],edges:[]},monitoring:{}},0)
 store.recordDiscovery([{ip:'192.168.1.5',mac:'aa:bb:cc:dd:ee:ff',source:'neighbor'},{ip:'192.168.1.6',mac:null,source:'neighbor'}])
 const server=createHost(store,{port:0,dist:writeTokenFixture(dir),discovery:{runOnce:async()=>{},snapshot:()=>({state:'idle'}),gatewayFor:async ip=>ip.endsWith('.5')?'192.168.1.1':'192.168.1.254'}});server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base=`http://127.0.0.1:${server.address().port}/api/v1`,headers={'X-NetWatch-Write':await fetchWriteToken(base),'Content-Type':'application/json'}
 const page=await fetch(`${base}/discovered?limit=1`).then(r=>r.json());assert.equal(page.devices.length,1);assert.ok(page.nextAfter)
 assert.equal((await fetch(`${base}/discovered/scan-now`,{method:'POST',headers})).status,200);assert.equal((await fetch(`${base}/discovered/scan-now`,{method:'POST',headers})).status,429)
 const id=page.devices[0].id;assert.equal((await fetch(`${base}/discovered/${id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:99})})).status,409)
 const added=await fetch(`${base}/discovered/${id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:1})}).then(r=>r.json())
 assert.equal(added.draft.edges[0].label,'Gateway route');assert.equal(added.draft.edges[0].target,'gateway')
 assert.equal(store.revision(),1);assert.equal(store.discovered().devices[0].status,'new')
 const saved=applyDiscoveryPatch(store,added.draft)
 assert.equal(saved.monitoring[added.draft.edges[0].source],false);assert.equal(store.discovered().devices[0].status,'added')
 assert.equal((await fetch(`${base}/discovered/${id}/remove`,{method:'POST',headers,body:'{}'})).status,200);assert.equal(store.discovered().devices.length,1)
 const remaining=store.discovered({after:page.nextAfter-1,limit:1}).devices[0],addedWithoutRouter=await fetch(`${base}/discovered/${remaining.id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:saved.revision})}).then(r=>r.json());assert.equal(addedWithoutRouter.draft.edges.length,0);applyDiscoveryPatch(store,addedWithoutRouter.draft)
 assert.equal((await fetch(`${base}/discovered/${remaining.id}/remove`,{method:'POST',headers,body:'{}'})).status,200);assert.equal(store.discovered().devices.length,0);assert.equal(store.read().topology.nodes.length,3)
 store.recordDiscovery([{ip:'192.168.1.20',mac:null,source:'neighbor'},{ip:'192.168.1.21',mac:null,source:'neighbor'}]);assert.equal((await fetch(`${base}/discovered/clear`,{method:'POST'})).status,403);assert.equal((await fetch(`${base}/discovered/clear`,{method:'POST',headers,body:'{}'})).status,400);assert.equal((await fetch(`${base}/discovered/clear`,{method:'POST',headers})).status,200);assert.equal(store.discovered().devices.length,0);assert.equal(store.read().topology.nodes.length,3)
})
test('drafting an already-saved gateway preserves its manually chosen type',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-gateway-fix-')),store=openStore(join(dir,'db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})})
 store.write({source:'inventory',topology:{schemaVersion:1,nodes:[{id:'gateway',type:'switch',position:{x:0,y:0},data:{label:'Router',ip:'192.168.100.1'}},{id:'client',type:'switch',position:{x:0,y:0},data:{label:'PC',ip:'192.168.100.20'}}],edges:[]},monitoring:{}},0)
 store.recordDiscovery([{ip:'192.168.100.1',mac:null,source:'neighbor'},{ip:'192.168.100.20',mac:null,source:'neighbor'}])
 const rows=store.discovered().devices;store.discoveryAction(rows[0].id,'added','gateway');store.discoveryAction(rows[1].id,'added','client')
 const server=createHost(store,{port:0,dist:writeTokenFixture(dir),discovery:{gatewayFor:async()=> '192.168.100.1'}});server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base=`http://127.0.0.1:${server.address().port}/api/v1`,headers={'X-NetWatch-Write':await fetchWriteToken(base),'Content-Type':'application/json'}
 const promote=await fetch(`${base}/discovered/${rows[0].id}/add-to-map`,{method:'POST',headers,body:JSON.stringify({baseRevision:1})}).then(r=>r.json())
 assert.equal(promote.draft.nodes.find(node=>node.id==='gateway').type,'switch')
 assert.equal(store.revision(),1)
 const linked=await fetch(base+'/discovered/'+rows[1].id+'/add-to-map',{method:'POST',headers,body:JSON.stringify({baseRevision:1})}).then(r=>r.json())
 assert.equal(linked.draft.edges.length,0)
 assert.equal(store.read().topology.nodes.length,2)
})

test('discovery actions find later pages and leave the map intact if a record is removed during lookup',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-actions-')),store=openStore(join(dir,'db'))
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})})
 store.recordDiscovery(Array.from({length:202},(_,i)=>({ip:`192.168.1.${i+1}`,source:'neighbor'})))
 const {nextAfter}=store.discovered({limit:200}),[later,removed]=store.discovered({after:nextAfter}).devices
 const server=createHost(store,{port:0,dist:writeTokenFixture(dir),discovery:{gatewayFor:async ip=>{
  if(ip===removed.ip)store.removeDiscovery(removed.id)
  return null
 }}})
 server.listen(0,'127.0.0.1')
 await new Promise(resolve=>server.once('listening',resolve))
 t.after(()=>new Promise(resolve=>server.close(resolve)))
 const token=await fetchWriteToken('http://127.0.0.1:'+server.address().port)
 const add=(id,baseRevision)=>fetch(`http://127.0.0.1:${server.address().port}/api/v1/discovered/${id}/add-to-map`,{
  method:'POST',headers:{'X-NetWatch-Write':token,'Content-Type':'application/json'},body:JSON.stringify({baseRevision})
 })
 const drafted=await add(later.id,0);assert.equal(drafted.status,200)
 assert.equal(store.revision(),0);applyDiscoveryPatch(store,(await drafted.json()).draft)
 assert.equal(store.discovered({after:nextAfter}).devices[0].status,'added')
 assert.equal((await add(later.id,1)).status,200)
 assert.equal((await add(removed.id,1)).status,404)
 assert.equal(store.read().revision,1)
 assert.deepEqual(store.read().topology.nodes.map(node=>node.data.ip),[later.ip])
})
test('Windows ARP parsing accepts German, French, Spanish and mixed type labels',()=>{
 const locales=[
  ['Schnittstelle: 192.0.2.1 --- 0x3\n  Internetadresse       Physische Adresse     Typ','dynamisch','statisch','ungültig'],
  ['Interface : 192.0.2.1 --- 0x3\n  Adresse Internet      Adresse physique     Type','dynamique','statique','incomplète'],
  ['Interfaz: 192.0.2.1 --- 0x3\n  Dirección de Internet Dirección física     Tipo','dinámico','estático','no válido'],
 ]
 const fixtures=locales.map(([heading,dynamic,stat,invalid],index)=>[
  heading,
  '  192.0.2.'+(2*index+2)+'    AA-BB-CC-DD-EE-FF     '+dynamic,
  '  192.0.2.'+(2*index+3)+'    aa:bb:cc:dd:ee:fd     '+stat,
  '  192.0.2.50    aa:bb:cc:dd:ee:fc     '+invalid,
  '  192.0.2.51    aa:bb:cc:dd:ee:fb',
  '  192.0.2.52    ff-ff-ff-ff-ff-ff     '+stat,
  '  192.0.2.53    01-00-5e-00-00-01     '+stat,
 ].join('\r\n'))
 for (const [index,fixture] of fixtures.entries())
  assert.deepEqual(parseNeighbors(fixture,1).map(({ip,mac})=>[ip,mac]),[
   ['192.0.2.'+(2*index+2),'aa:bb:cc:dd:ee:ff'],['192.0.2.'+(2*index+3),'aa:bb:cc:dd:ee:fd'],
  ])
 assert.equal(parseNeighbors(fixtures.join('\n')+'\n192.0.2.60 aa-bb-cc-dd-ee-fb invalid').length,6)
})

test('localized route headings leave numeric default gateway selection unchanged',()=>{
 const interfaces={local:[{family:'IPv4',address:'192.168.4.5',netmask:'255.255.255.0'}]}
 const routes=[
  'Tabla de enrutamiento IPv4', 'Rutas activas:',
  'Destino de red   Máscara de red   Puerta de enlace   Interfaz   Métrica',
  '0.0.0.0  0.0.0.0  192.168.4.1   192.168.4.5  25',
  '0.0.0.0  0.0.0.0  192.168.4.2   192.168.4.5  5',
  '192.168.4.0 255.255.255.0 En vínculo 192.168.4.5 281',
 ].join('\r\n')
 assert.deepEqual([...parseDefaultGateways(routes,interfaces)],[['192.168.4.5','192.168.4.2']])
})

test('discovery reports a default gateway even when the neighbor table is empty',async t=>{
 const store=openStore(':memory:')
 t.after(()=>store.close())
 const discovery=createDiscovery(store,{
  enabled:true,platform:'win32',
  interfaces:()=>({wifi:[{family:'IPv4',address:'192.168.0.116',netmask:'255.255.255.0'}]}),
  runner:async()=>'',gatewayRunner:async()=> '0.0.0.0 0.0.0.0 192.168.0.1 192.168.0.116 25',
  nameLookup:async()=>[],
 })
 await discovery.runOnce()
 assert.deepEqual(store.discovered().devices.map(({ip,source})=>[ip,source]),[['192.168.0.1','gateway']])
})

test('a previously scanned gateway is recognized at another local address by its MAC',async t=>{
 const store=openStore(':memory:')
 t.after(()=>store.close())
 let localIp='192.168.0.116', gateway='192.168.0.1'
 let neighbors='192.168.0.1 02-00-00-00-00-01 dynamic'
 const discovery=createDiscovery(store,{
  enabled:true,platform:'win32',
  interfaces:()=>({wifi:[{family:'IPv4',address:localIp,netmask:'255.255.255.0'}]}),
  runner:async()=>neighbors,gatewayRunner:async()=>`0.0.0.0 0.0.0.0 ${gateway} ${localIp} 25`,
  nameLookup:async()=>[],
 })
 await discovery.runOnce()
 neighbors=''
 await discovery.runOnce()
 localIp='192.168.100.2';gateway='192.168.100.1'
 neighbors='192.168.100.4 02-00-00-00-00-01 dynamic\n192.168.100.5 02-00-00-00-00-02 dynamic'
 await discovery.runOnce()
 const sources=new Map(store.discovered().devices.map(({ip,source})=>[ip,source]))
 assert.equal(sources.get('192.168.100.1'),'gateway')
 assert.equal(sources.get('192.168.100.4'),'gateway-mac')
 assert.equal(sources.get('192.168.100.5'),'neighbor')
 const alias=store.discovered().devices.find(device=>device.ip==='192.168.100.4')
 const {addDiscoveredToMap}=await import('../host/routes/discovered.js')
 const saved=await addDiscoveredToMap({store,discovery,id:alias.id,body:{baseRevision:0}})
 assert.equal(saved.draft.nodes[0].type,'router')
})

test('active discovery proposes a two-hop route between saved routers only with both replies',async t=>{
 const store=openStore(':memory:')
 t.after(()=>store.close())
 const routers=[['tenda','192.168.0.1'],['main','192.168.100.1'],['public','8.8.8.8']]
 const nodes=routers.map(([id,ip])=>({id,type:'router',position:{x:0,y:0},data:{label:id,ip}}))
 store.write({source:'inventory',topology:{schemaVersion:1,nodes,edges:[]},monitoring:{main:true}},0)
 const calls=[]
 let firstHop='1   *  *  *  Request timed out.'
 const discovery=createDiscovery(store,{
  enabled:true,active:true,platform:'win32',
  interfaces:()=>({wifi:[{family:'IPv4',address:'192.168.0.2',netmask:'255.255.255.252'}]}),
  runner:async()=>'',gatewayRunner:async()=> '0.0.0.0 0.0.0.0 192.168.0.1 192.168.0.2 25',
  nameLookup:async()=>[],
  traceRunner:async ip=>{calls.push(ip);return `${firstHop}\r\n   2  2 ms  3 ms  2 ms  ${ip}\r\n`},
 })
 await discovery.runOnce()
 assert.equal(store.read().revision,1)
 firstHop='1   <1 ms   *   1 ms   192.168.0.1'
 await discovery.runOnce()
 const {revision,monitoring,topology}=store.read()
 assert.equal(revision,1)
 assert.deepEqual(monitoring,{tenda:false,main:true,public:false})
 assert.equal(topology.edges.length,0)
 assert.deepEqual(store.topologyHints().map(({source,target,label})=>[source,target,label]),[
  ['tenda','main','Observed upstream route'],
 ])
 assert.equal(discovery.snapshot().upstreamLinks,1)
 await discovery.runOnce()
 assert.equal(store.read().revision,1)
 assert.equal(store.topologyHints().length,1)
 assert.deepEqual(calls,['192.168.100.1','192.168.100.1','192.168.100.1'])
})

test('bulk discovery adds every current page once, reuses map entries and links clients to the router',async t=>{
 const store=openStore(':memory:')
 t.after(()=>store.close())
 store.write({source:'inventory',topology:{schemaVersion:1,nodes:[
  {id:'existing',type:'switch',position:{x:0,y:0},data:{label:'Existing',ip:'192.168.0.2'}},
 ],edges:[]},monitoring:{}},0)
 const rows=Array.from({length:202},(_,i)=>({ip:`192.168.0.${i+2}`,source:'neighbor'}))
 store.recordDiscovery([{ip:'192.168.0.250'},...rows])
 store.recordDiscovery([...rows,{ip:'192.168.0.1',source:'gateway'}])
 const dir=mkdtempSync(join(tmpdir(),'nw-discovery-bulk-'))
 t.after(()=>rmSync(dir,{recursive:true,force:true}))
 const server=createHost(store,{port:0,dist:writeTokenFixture(dir),discovery:{gatewayLookup:async()=>()=> '192.168.0.1'}})
 server.listen(0,'127.0.0.1')
 await new Promise(resolve=>server.once('listening',resolve))
 t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base=`http://127.0.0.1:${server.address().port}/api/v1`
 const token=await fetchWriteToken(base)
 const add=(baseRevision,pendingVersion)=>fetch(`${base}/discovered/add-to-map`,{
  method:'POST',headers:{'X-NetWatch-Write':token,'Content-Type':'application/json'},
  body:JSON.stringify({baseRevision,pendingVersion}),
 })
 const result=await fetch(`${base}/discovered?limit=1`).then(r=>r.json())
 assert.equal(result.pendingCount,203)
 store.recordDiscovery([...rows,{ip:'192.168.0.253'}])
 const pending=await fetch(`${base}/discovered?limit=1`).then(r=>r.json())
 assert.equal(pending.pendingCount,203)
 assert.equal((await add(1,result.pendingVersion)).status,409)
 assert.equal(store.revision(),1)
 store.recordDiscovery([...rows,{ip:'192.168.0.1',source:'gateway'}])
 const changed=[{...rows[0],mac:'02:00:00:00:00:03'},...rows.slice(1)]
 store.recordDiscovery([...changed,{ip:'192.168.0.1',source:'gateway'}])
 assert.equal((await add(1,result.pendingVersion)).status,409)
 const reviewed=await fetch(`${base}/discovered?limit=1`).then(r=>r.json())
 const proposed=await (await add(1,reviewed.pendingVersion)).json()
 assert.equal(proposed.addedCount,202);assert.equal(proposed.existingCount,1);assert.equal(store.revision(),1)
 applyDiscoveryPatch(store,proposed.draft)
 const {revision,topology,monitoring}=store.read()
 assert.equal(revision,2)
 assert.equal(topology.nodes.length,203)
 assert.equal(topology.nodes.find(node=>node.data.ip==='192.168.0.1').type,'router')
 assert.equal(topology.edges.length,202)
 assert.equal(monitoring.existing,false)
 assert.equal((await add(1,result.pendingVersion)).status,409)
 const empty=await fetch(`${base}/discovered?limit=1`).then(r=>r.json())
 assert.deepEqual(await (await add(2,empty.pendingVersion)).json(),{addedCount:0,existingCount:0,revision:2,draft:{nodes:[],edges:[]}})
 assert.equal(store.revision(),2)
})
