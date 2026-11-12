import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'

function setup(t) {
 const directory=mkdtempSync(join(tmpdir(),'netwatch-desktop-test-'))
 t.after(()=>rmSync(directory,{recursive:true,force:true}))
 return directory
}
function launch(t,path) {
 const child=spawn(process.execPath,[fileURLToPath(new URL('../host/desktop.js',import.meta.url))],{env:{...process.env,NETWATCH_DB:path,NETWATCH_ICMP:'0'},stdio:['pipe','pipe','pipe']})
 const events=[];const lines=createInterface({input:child.stdout});lines.on('line',line=>events.push(JSON.parse(line)))
 const closed=once(child,'close');let finished=false;void closed.then(()=>{finished=true})
 t.after(async()=>{if(!finished){child.stdin.end();await closed}})
 return {child,events,closed}
}
async function running(instance) {
 const deadline=Date.now()+10000
 while(!instance.events.some(e=>e.state==='running')) {
  assert.ok(!instance.events.some(e=>e.state==='error'),JSON.stringify(instance.events))
  assert.ok(Date.now()<deadline,'Host did not become ready');await delay(25)
 }
}
test('desktop-owned host starts, stops, restarts and closes cleanly when controller input closes',async t=>{
 const path=join(setup(t),'db')
 for(const command of ['stop','eof']) {
  const instance=launch(t,path);await running(instance);assert.equal(existsSync(path+'.lock'),true)
  const health=await (await fetch('http://127.0.0.1:4317/api/v1/health')).json();assert.equal(health.ready,true);assert.equal(health.collector.state,'disabled')
  if(command==='stop')instance.child.stdin.write('stop\n');else instance.child.stdin.end()
  assert.equal((await instance.closed)[0],0);assert.equal(existsSync(path+'.lock'),false)
  const db=new DatabaseSync(path,{readOnly:true});assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close()
 }
 const cancelled=launch(t,path);cancelled.child.stdin.end()
 assert.equal((await cancelled.closed)[0],0);assert.equal(existsSync(path+'.lock'),false)
})
test('desktop start reports an occupied port without stopping the existing host',async t=>{
 const directory=setup(t);const owner=launch(t,join(directory,'owner'));await running(owner)
 const refused=launch(t,join(directory,'refused'));assert.equal((await refused.closed)[0],1)
 assert.ok(refused.events.some(e=>e.state==='error'&&e.message.includes('EADDRINUSE')))
 assert.equal(existsSync(join(directory,'refused.lock')),false)
 assert.equal((await (await fetch('http://127.0.0.1:4317/api/v1/health')).json()).ready,true)
 owner.child.stdin.write('stop\n');assert.equal((await owner.closed)[0],0)
})
test('desktop start preserves an existing lock; controller death leaves no running orphan and reports an unclean lock',async t=>{
 const directory=setup(t);const locked=join(directory,'locked');mkdirSync(locked+'.lock')
 const refused=launch(t,locked);assert.equal((await refused.closed)[0],1)
 assert.equal(existsSync(locked+'.lock'),true);assert.ok(refused.events.some(e=>e.state==='error'))
 const path=join(directory,'owned');const owner=launch(t,path);await running(owner)
 owner.child.kill('SIGKILL');await owner.closed
 const deadline=Date.now()+10000
 let listening=true
 while(listening&&Date.now()<deadline) {
  try {await fetch('http://127.0.0.1:4317/api/v1/health',{signal:AbortSignal.timeout(500)});await delay(25)} catch {listening=false}
 }
 assert.equal(listening,false,'Controller death left a running orphan host')
 // Windows force-termination may kill the whole process tree; retain its lock for explicit recovery.
 if(existsSync(path+'.lock')) {
  const restart=launch(t,path);assert.equal((await restart.closed)[0],1)
  assert.ok(restart.events.some(e=>e.state==='error'&&e.message.includes('unclean shutdown')))
 }
})
