import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
import dgram from 'node:dgram'
import {once} from 'node:events'
import {DatabaseSync} from 'node:sqlite'
import snmp from 'net-snmp'
import {openStore} from '../host/store.js'
import {createHost} from '../host/server.js'
import {backupDatabase,restoreDatabase} from '../host/maintenance.js'
import {validateInterfaces,interfaceRates} from '../host/interfaces.js'
import {createSnmpProbe,INTERFACE_OIDS,validateSnmpUser} from '../host/snmp-probe.js'
import {createInterfaceCollector} from '../host/snmp-collector.js'
import {createCredentialVault,credentialDirectory} from '../host/snmp-secrets.js'

const user={name:'fixture-user',authProtocol:'sha',authKey:'fixture-auth-only',privProtocol:'aes',privKey:'fixture-privacy-only'}
const sample=(time=Date.now(),counter='1000',overrides={})=>({checkedAt:new Date(time).toISOString(),uptime:10000,interfaces:[{index:1,name:'Gi1/0/1',description:'Fixture port',admin:1,oper:1,speedBps:1000000000,discontinuity:0,counterBits:64,inOctets:counter,outOctets:counter,...overrides}]})
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'netwatch-snmp-')),path=join(dir,'db'),store=openStore(path);const input={source:'inventory',topology:{schemaVersion:1,nodes:[{id:'a',type:'switch',position:{x:0,y:0},data:{label:'Fixture',ip:'192.0.2.1'}}],edges:[]},monitoring:{a:true}};store.write(input,0);const authorization=randomUUID();store.authorizeInterfaces('a',authorization,1);t.after(()=>{try{store.close()}catch{}rmSync(dir,{recursive:true,force:true})});return {dir,path,store,input,authorization}}
const numeric=(type,value)=>({type,value})
function fakeSession({malformed=false,stall=false,missing=false,endless=false}={}) {
 const session=new EventEmitter();session.closed=false;session.calls=[]
 session.close=()=>{session.closed=true}
 session.get=(oids,callback)=>{session.calls.push(['get',oids]);if(!stall)queueMicrotask(()=>callback(null,[{oid:oids[0],type:snmp.ObjectType.TimeTicks,value:10000}]))}
 session.getBulk=(oids,nonRepeaters,repetitions,callback)=>{
  session.calls.push(['getBulk',oids]);if(stall)return
  const result=oids.map(oid=>{
   const entry=Object.entries(INTERFACE_OIDS).find(([,root])=>oid===root||oid.startsWith(root+'.')),field=entry[0],root=entry[1]
   if(!endless&&oid!==root||missing&&['in64','out64','discontinuity'].includes(field))return [{oid,type:snmp.ObjectType.EndOfMibView}]
   let data=['description','name'].includes(field)?numeric(snmp.ObjectType.OctetString,Buffer.from(field==='name'?'Gi1/0/1':'Fixture')):field.endsWith('64')?numeric(snmp.ObjectType.Counter64,Buffer.from('0020000000000001','hex')):field.endsWith('32')?numeric(snmp.ObjectType.Counter,100):field==='discontinuity'?numeric(snmp.ObjectType.TimeTicks,0):['admin','oper'].includes(field)?numeric(snmp.ObjectType.Integer,1):numeric(snmp.ObjectType.Gauge,field==='highSpeed'?1000:1000000000)
   return [{oid:malformed?root+'.0':root+'.'+(endless?(Number(oid.slice(root.length+1))||0)+1:1),...data}]
  });queueMicrotask(()=>callback(null,result))
 }
 return session
}
test('SNMPv3 reader is read-only, bounded and literal-targeted; counters retain 64-bit precision',async()=>{
 const session=fakeSession();let args
 const probe=createSnmpProbe({createSession:(...a)=>{args=a;return session}})
 const result=await probe('192.0.2.1',user)
 assert.equal(result.interfaces[0].inOctets,'9007199254740993');assert.equal(result.interfaces[0].name,'Gi1/0/1')
 assert.equal(args[0],'192.0.2.1');assert.equal(args[1].level,snmp.SecurityLevel.authPriv);assert.equal(args[1].privProtocol,snmp.PrivProtocols.aes);assert.equal(args[2].retries,0);assert.equal(args[2].port,161)
 assert.ok(session.calls.every(c=>['get','getBulk'].includes(c[0])));assert.ok(session.closed)
 await probe('2001:db8::1',user);assert.equal(args[2].transport,'udp6')
 const invalid=await probe('example.invalid',user);assert.ok(invalid.error)
 assert.throws(()=>validateSnmpUser({...user,privProtocol:'des'}));assert.throws(()=>validateSnmpUser({...user,authKey:'short'}))
})
test('partial tables stay unknown; malformed replies, deadlines, cancellation and library secrets are redacted',async()=>{
 const partial=await createSnmpProbe({createSession:()=>fakeSession({missing:true})})('192.0.2.1',user)
 assert.equal(partial.interfaces[0].counterBits,32);assert.equal(partial.interfaces[0].discontinuity,null)
 assert.equal((await createSnmpProbe({createSession:()=>fakeSession({malformed:true})})('192.0.2.1',user)).error,'snmp_failed')
 const session=fakeSession({stall:true});const result=await createSnmpProbe({createSession:()=>session,policy:{deadlineMs:20,maxRequests:2}})('192.0.2.1',user)
 assert.equal(result.error,'snmp_timeout');assert.ok(session.closed)
 const abort=new AbortController(),another=fakeSession({stall:true});const pending=createSnmpProbe({createSession:()=>another})('192.0.2.1',user,{signal:abort.signal});abort.abort();assert.equal((await pending).error,'cancelled');assert.ok(another.closed)
 const failed=await createSnmpProbe({createSession:()=>{throw new Error(user.authKey)}})('192.0.2.1',user);assert.ok(!JSON.stringify(failed).includes(user.authKey))
 const capped=await createSnmpProbe({createSession:()=>fakeSession({endless:true}),policy:{deadlineMs:1000,maxRequests:10,maxInterfaces:2,repetitions:1}})('192.0.2.1',user);assert.equal(capped.error,'snmp_limit')
})
test('interface rates suppress restarts, discontinuities, wraps, missing evidence, implausible deltas and long gaps',()=>{
 const time=Date.now(),previous=sample(time-60000,'9007199254740993'),next={...sample(time,'9007199254741993'),uptime:16000}
 assert.equal(interfaceRates(previous,next)[0].inBps,1000*8/60)
 for(const changed of [{...next,uptime:1},{...next,checkedAt:new Date(time+180000).toISOString()},sample(time,'1'),sample(time,'9007199254741993',{discontinuity:1}),sample(time,'9007199254741993',{discontinuity:null}),sample(time,'18446744073709551615')])assert.equal(interfaceRates(previous,changed)[0].inBps,null)
 const narrow=sample(time-60000,'100',{counterBits:32}),narrowNext={...sample(time,'200',{counterBits:32}),uptime:16000}
 assert.equal(interfaceRates(narrow,narrowNext)[0].inBps,null,'Gigabit 32-bit counters could wrap multiple times')
 narrow.interfaces[0].speedBps=100000000;narrowNext.interfaces[0].speedBps=100000000;assert.equal(interfaceRates(narrow,narrowNext)[0].inBps,100*8/60)
 assert.throws(()=>validateInterfaces(sample(time,'18446744073709551616')))
 assert.throws(()=>validateInterfaces({...next,interfaces:[...next.interfaces,...next.interfaces]}))
})
test('SNMP samples/authorization persist separately; identity edits revoke them; backup restores observations but revokes polling',t=>{
 const f=fixture(t),value=sample(Date.now()-1000)
 f.store.appendInterfaces('a',value,{revision:1,authorization:f.authorization});assert.equal(f.store.interfaces('a').total,1)
 assert.equal(f.store.snapshot().observations.length,0,'SNMP must not assert device reachability')
 assert.throws(()=>f.store.appendInterfaces('a',sample(),{revision:1,authorization:randomUUID()}))
 assert.throws(()=>f.store.interfaces('a',{limit:201}));assert.throws(()=>f.store.interfaces('missing'))
 const changed=structuredClone(f.input);changed.topology.nodes[0].data.label='New label';f.store.write(changed,1);assert.equal(f.store.interfaceTargets().length,1)
 f.store.close();const restarted=openStore(f.path);assert.equal(restarted.interfaces('a').total,1);restarted.close()
 backupDatabase(f.path,join(f.dir,'backup'));restoreDatabase(f.path,join(f.dir,'backup'))
 const restored=openStore(f.path);assert.equal(restored.interfaces('a').total,1);assert.equal(restored.interfaces('a').configured,false);restored.close()
 const active=openStore(f.path);active.authorizeInterfaces('a',randomUUID(),3);changed.topology.nodes[0].data.ip='192.0.2.2';active.write(changed,3);assert.equal(active.interfaceTargets().length,0);assert.equal(active.interfaces('a').total,0);active.close()
})
test('v3→v4 migration preserves old data and rolls back on interruption',t=>{
 const f=fixture(t);f.store.close();const db=new DatabaseSync(f.path);db.exec('DROP TABLE discovered_devices;DROP TABLE interface_samples;DROP TABLE snmp_targets;PRAGMA user_version=3');db.close()
 assert.throws(()=>openStore(f.path,{migrateV4:()=>{throw Error('interrupted')}}),/interrupted/)
 const check=new DatabaseSync(f.path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,3);check.close()
 const migrated=openStore(f.path);assert.equal(migrated.read().topology.nodes.length,1);assert.equal(migrated.interfaces('a').configured,false);migrated.close()
})
test('latest-interface storage rejects growth past the global cap without discarding prior devices',t=>{
 const f=fixture(t)
 for(let i=1;i<=40;i++)f.input.topology.nodes.push({id:'d'+i,type:'switch',position:{x:i,y:0},data:{label:'Fixture',ip:'192.0.2.'+(i+1)}})
 f.store.write(f.input,1)
 for(let i=1;i<=40;i++) {
   const authorization=randomUUID();f.store.authorizeInterfaces('d'+i,authorization,2)
   const value=sample(Date.now()-1);value.interfaces=Array.from({length:500},(_,index)=>({...value.interfaces[0],index:index+1}))
   f.store.appendInterfaces('d'+i,value,{revision:2,authorization})
 }
 assert.throws(()=>f.store.appendInterfaces('a',sample(Date.now()-1),{revision:2,authorization:f.authorization}),/limit/)
 assert.equal(f.store.interfaces('a').total,0);assert.equal(f.store.interfaces('d40').total,500)
 assert.equal(f.store.interfaces('d40',{limit:50}).nextAfter,50)
 assert.equal(f.store.interfaces('d40',{limit:50,after:450}).nextAfter,null)
})
test('collector ignores disabled targets, prevents overlap, cancels stale inventory and preserves prior evidence on errors',async t=>{
 const f=fixture(t);let calls=0,result=sample(Date.now()-1000)
 const vault={load:async()=>({...user})},collector=createInterfaceCollector(f.store,{enabled:true,platform:'win32',vault,runner:async()=>{calls++;return result}})
 const first=collector.runOnce();assert.equal(collector.runOnce(),first);await first;assert.equal(calls,1);assert.equal(f.store.interfaces('a').total,1)
 result={error:'not secret '+user.privKey};await collector.runOnce();assert.equal(f.store.interfaces('a').total,1);assert.ok(!JSON.stringify(collector.device('a')).includes(user.privKey));await collector.stop()
 const disabled=createInterfaceCollector(f.store,{vault,runner:()=>{throw Error('must not run')}});await disabled.runOnce();assert.equal(disabled.snapshot().state,'disabled')
 let ready,closed=false;const started=new Promise(r=>{ready=r})
 const pending=createInterfaceCollector(f.store,{enabled:true,platform:'win32',vault,runner:async(_a,_u,{signal})=>{ready();return new Promise(resolve=>signal.addEventListener('abort',()=>{closed=true;resolve(sample())},{once:true}))}})
 const savedTime=f.store.interfaces('a').checkedAt
 const running=pending.runOnce();await started;f.store.write(f.input,1);await running;assert.ok(closed);assert.equal(f.store.interfaces('a').checkedAt,savedTime);await pending.stop()
})
test('interface API is read-only, paginated, origin protected, and never returns profile credentials or authorization',async t=>{
 const f=fixture(t);f.store.appendInterfaces('a',sample(Date.now()-1000),{revision:1,authorization:f.authorization})
 const server=createHost(f.store,{port:0});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
 const url=`http://127.0.0.1:${server.address().port}/api/v1/devices/a/interfaces`,value=await(await fetch(url)).json()
 assert.equal(value.interfaces[0].oper,1);assert.ok(!JSON.stringify(value).includes(f.authorization));assert.ok(!JSON.stringify(value).includes(user.authKey))
 assert.equal((await fetch(url+'?limit=999')).status,400);assert.equal((await fetch(url,{headers:{Origin:'http://evil.invalid'}})).status,403);assert.equal((await fetch(url,{method:'PUT'})).status,404)
})
test('collector limits workers, handles a stalled runner deadline and drains shutdown cancellation',async t=>{
 const f=fixture(t);for(let i=1;i<5;i++)f.input.topology.nodes.push({id:'d'+i,type:'switch',position:{x:i,y:0},data:{label:'Fixture',ip:'192.0.2.'+(i+1)}})
 f.store.write(f.input,1);for(const node of f.input.topology.nodes)f.store.authorizeInterfaces(node.id,randomUUID(),2)
 let count=0,peak=0,calls=0
 const collector=createInterfaceCollector(f.store,{enabled:true,platform:'win32',vault:{load:async()=>user},runner:async()=>{count++;calls++;peak=Math.max(peak,count);await new Promise(r=>setImmediate(r));count--;return sample(Date.now()-1)}})
 await collector.runOnce();assert.equal(calls,5);assert.equal(peak,2);await collector.stop()
 const stalled=createInterfaceCollector(f.store,{enabled:true,platform:'win32',policy:{intervalMs:60000,deadlineMs:10,credentialBudgetMs:0,concurrency:2,staleAfterMs:180000},vault:{load:async()=>user},runner:()=>new Promise(()=>{})})
 await stalled.runOnce();assert.equal(stalled.snapshot().errors,5);await stalled.stop()
})
test('Windows DPAPI round-trip protects secrets and binds credentials to explicit device authorization',{skip:process.platform!=='win32'},async t=>{
 const f=fixture(t),directory=credentialDirectory(f.path),vault=createCredentialVault(directory),target=f.store.interfaceTargets()[0]
 assert.notEqual(directory,credentialDirectory(join(f.dir,'another-db')))
 await vault.save({version:1,...target,user});assert.deepEqual(await vault.load(target),user)
 const encrypted=readdirSync(directory).filter(f=>f.endsWith('.dpapi')).map(f=>readFileSync(join(directory,f)))
 assert.equal(encrypted.length,1);assert.ok(encrypted.every(buffer=>!buffer.includes(user.authKey)&&!buffer.includes(user.privKey)))
 await assert.rejects(vault.load({...target,authorization:randomUUID()}),/Credentials unavailable/)
 await vault.stop();vault.remove('a');await assert.rejects(vault.load(target),/Credentials unavailable/)
})

test('encrypted SNMPv3 authPriv exchanges work over isolated loopback UDP and wrong credentials fail closed',async t=>{
 let socket
 const agent=snmp.createAgent({address:'127.0.0.1',accessControlModelType:snmp.AccessControlModelType.Simple,dgramModule:{createSocket:()=>{socket=dgram.createSocket('udp4');const bind=socket.bind.bind(socket);socket.bind=()=>bind(0,'127.0.0.1');return socket}}},()=>{})
 t.after(()=>new Promise(resolve=>agent.close(resolve)))
 await once(socket,'listening')
 agent.getAuthorizer().addUser({...user,level:snmp.SecurityLevel.authPriv,authProtocol:snmp.AuthProtocols.sha,privProtocol:snmp.PrivProtocols.aes})
 agent.getAuthorizer().getAccessControlModel().setUserAccess(user.name,snmp.AccessLevel.ReadOnly)
 const mib=agent.getMib()
 mib.registerProvider({name:'fixtureUptime',type:snmp.MibProviderType.Scalar,oid:'1.3.6.1.2.1.1.3',scalarType:snmp.ObjectType.TimeTicks,maxAccess:snmp.MaxAccess['read-only']});mib.setScalarValue('fixtureUptime',10000)
 const columns=[[1,'ifIndex',snmp.ObjectType.Integer],[2,'ifDescr',snmp.ObjectType.OctetString],[5,'ifSpeed',snmp.ObjectType.Gauge],[7,'ifAdminStatus',snmp.ObjectType.Integer],[8,'ifOperStatus',snmp.ObjectType.Integer],[10,'ifInOctets',snmp.ObjectType.Counter],[16,'ifOutOctets',snmp.ObjectType.Counter]]
 mib.registerProvider({name:'fixtureIfTable',type:snmp.MibProviderType.Table,oid:'1.3.6.1.2.1.2.2.1',maxAccess:snmp.MaxAccess['not-accessible'],tableColumns:columns.map(([number,name,type])=>({number,name,type,maxAccess:snmp.MaxAccess['read-only']})),tableIndex:[{columnName:'ifIndex'}]})
 mib.addTableRow('fixtureIfTable',[1,'FastEthernet0/0',100000000,1,1,1234,5678])
 const probe=createSnmpProbe({createSession:(address,credentials,options)=>snmp.createV3Session(address,credentials,{...options,port:socket.address().port})})
 const value=await probe('127.0.0.1',user)
 assert.equal(value.interfaces?.[0].name,'FastEthernet0/0',JSON.stringify(value));assert.equal(value.interfaces[0].inOctets,'1234');assert.equal(value.interfaces[0].counterBits,32)
 const sha256={...user,name:'fixture-sha256',authProtocol:'sha256'}
 agent.getAuthorizer().addUser({...sha256,level:snmp.SecurityLevel.authPriv,authProtocol:snmp.AuthProtocols.sha256,privProtocol:snmp.PrivProtocols.aes});agent.getAuthorizer().getAccessControlModel().setUserAccess(sha256.name,snmp.AccessLevel.ReadOnly)
 assert.equal((await probe('127.0.0.1',sha256)).interfaces?.[0].name,'FastEthernet0/0')
 const rejected=await probe('127.0.0.1',{...user,authKey:'incorrect-fixture-password'})
 assert.equal(rejected.error,'snmp_failed');assert.ok(!JSON.stringify(rejected).includes('password'))
})
