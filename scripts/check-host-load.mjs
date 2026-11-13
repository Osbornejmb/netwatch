import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, release } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { openStore } from '../host/store.js'
import { createHost } from '../host/server.js'
import { createScaleNetwork } from '../tests/fixtures/scale-network.js'

// Synthetic storage/API test only. No collector is created and no fixture address is probed.
if(process.argv[2]!=='--fixtures') throw new Error('Pass --fixtures to run an isolated synthetic storage/API check. No real devices are tested.')
const directory=mkdtempSync(join(tmpdir(),'netwatch-host-load-')),store=openStore(join(directory,'db'))
const fixture=createScaleNetwork(Date.now()), topology={schemaVersion:1,nodes:fixture.nodes,edges:fixture.edges}
const report={scope:'100 synthetic devices, 100,000 checks, 10,000 resolved incidents; two simulated clients reading once per second; no collectors or real browsers',node:process.version,windowsBuild:process.platform==='win32'?release():null,probes:0,clients:2,rounds:12,appendCycleMs:[],responseBytes:[]}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]
let server
try {
  store.write({source:'inventory',topology,monitoring:Object.fromEntries(topology.nodes.map(n=>[n.id,true]))},0)
  const started=performance.now(), now=Date.now()
  // Fill fixture history directly to exercise the retained-data boundary without spending probe cycles.
  store.db.exec('BEGIN')
  const insert=store.db.prepare("INSERT INTO checks(device_id,status,checked_at,outcome,reason,latency_ms) VALUES(?,'up',?,'reachable','fixture',1)")
  for(let i=0;i<100000;i++)insert.run(topology.nodes[i%100].id,now-1000000+i*10)
  const incident=store.db.prepare('INSERT INTO incidents(device_id,opened_at,resolved_at) VALUES(?,?,?)')
  for(let i=0;i<10000;i++)incident.run(topology.nodes[i%100].id,now-200000+i,now-100000+i)
  store.db.exec('COMMIT');report.seedMs=Math.round(performance.now()-started)
  if(process.argv.includes('--profile')) {
    const queries={latest:"SELECT c.* FROM checks c JOIN (SELECT device_id,MAX(checked_at) time FROM checks GROUP BY device_id) latest ON c.device_id=latest.device_id AND c.checked_at=latest.time ORDER BY c.seq",retention:"SELECT id FROM incidents WHERE resolved_at IS NOT NULL ORDER BY id DESC LIMIT -1 OFFSET 10000"}
    for(const [name,sql] of Object.entries(queries)){const start=performance.now();const rows=store.db.prepare(sql).all();console.log(JSON.stringify({name,ms:Math.round(performance.now()-start),rows:rows.length,plan:store.db.prepare('EXPLAIN QUERY PLAN '+sql).all()}))}
  }
  server=createHost(store,{port:0});server.listen(0,'127.0.0.1');await once(server,'listening')
  const url=`http://127.0.0.1:${server.address().port}/api/v1/snapshot`, samples=[]
  const wallStart=performance.now(),cpuStart=process.cpuUsage()
  for(let round=0;round<report.rounds;round++) {
    const roundStart=performance.now()
    if(round===0 || round===10) {
      const appendStart=performance.now()
      // The real collector appends individual results; preserve that transaction/cleanup pattern.
      for(const node of topology.nodes)store.append([{deviceId:node.id,status:'up',checkedAt:new Date().toISOString(),outcome:'reachable',reason:'fixture',latencyMs:1}],{revision:1})
      report.appendCycleMs.push(Math.round(performance.now()-appendStart))
    }
    await Promise.all(Array.from({length:report.clients},async()=>{
      const before=performance.now(),response=await fetch(url,{signal:AbortSignal.timeout(10000)}),text=await response.text()
      assert.equal(response.status,200);const value=JSON.parse(text)
      assert.equal(value.inventory.topology.nodes.length,100);assert.equal(value.observations.length,100);assert.equal(value.inventory.revision,1)
      samples.push(performance.now()-before);report.responseBytes.push(Buffer.byteLength(text))
    }))
    if(round<report.rounds-1)await new Promise(resolve=>setTimeout(resolve,Math.max(0,1000-(performance.now()-roundStart))))
  }
  const cpu=process.cpuUsage(cpuStart),wallMs=performance.now()-wallStart
  report.snapshotMs={p50:Math.round(percentile(samples,.5)),p95:Math.round(percentile(samples,.95)),max:Math.round(Math.max(...samples))}
  report.averageSnapshotBytes=Math.round(report.responseBytes.reduce((a,b)=>a+b,0)/report.responseBytes.length);delete report.responseBytes
  report.measuredWallMs=Math.round(wallMs);report.combinedHostAndClientCpuMs=Math.round((cpu.user+cpu.system)/1000)
  report.combinedHostAndClientCpuPercentOfOneCore=Number((report.combinedHostAndClientCpuMs/wallMs*100).toFixed(1))
  report.processRssMiB=Math.round(process.memoryUsage().rss/1024**2)
  report.retainedChecks=store.db.prepare('SELECT COUNT(*) n FROM checks').get().n
  report.retainedResolvedIncidents=store.db.prepare('SELECT COUNT(*) n FROM incidents').get().n
  assert.equal(report.retainedChecks,100000);assert.equal(report.retainedResolvedIncidents,10000)
  report.limitations=['No Windows ping helper processes or network timeouts measured','No actual browser rendering in this process','One machine and short run; not a sustained deployment SLA','CPU/RSS include the synthetic HTTP clients and fixture setup process']
  writeFileSync('docs/host-load-results.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
} finally {if(server)await new Promise(resolve=>server.close(resolve));store.close();rmSync(directory,{recursive:true,force:true})}
