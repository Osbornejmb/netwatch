import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from '../host/store.js'
import { createCollector } from '../host/collector.js'
if(process.platform!=='win32' || process.argv[2]!=='--loopback') throw new Error('Windows only. Pass --loopback to authorize checks of 127.0.0.1 and ::1 on this machine only.')
const dir=mkdtempSync(join(tmpdir(),'netwatch-loopback-'))
const store=openStore(join(dir,'db'))
const nodes=['127.0.0.1','::1'].map((ip,i)=>({id:`loopback-${i}`,type:'router',position:{x:0,y:0},data:{label:`Local loopback ${i}`,ip}}))
const collector=createCollector(store,{enabled:true})
try {
 store.write({source:'inventory',topology:{schemaVersion:1,nodes,edges:[]},monitoring:Object.fromEntries(nodes.map(n=>[n.id,true]))},0)
 const start=Date.now();await collector.runOnce()
 const checks=store.snapshot().observations
 assert.equal(collector.snapshot().errors,0,JSON.stringify(collector.snapshot().diagnostics))
 assert.equal(checks.length,2);for(const check of checks){assert.equal(check.status,'up');assert.equal(check.outcome,'reachable');assert.ok(Number.isFinite(check.latencyMs))}
 console.log(JSON.stringify({scope:'Windows loopback only; not hardware/network validation',cycleMs:Date.now()-start,checks,collector:collector.snapshot()},null,2))
} finally {await collector.stop();store.close();rmSync(dir,{recursive:true,force:true})}
