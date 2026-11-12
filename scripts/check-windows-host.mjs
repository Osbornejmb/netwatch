import assert from 'node:assert/strict'
import { fork, execFile } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStore } from '../host/store.js'
import { lock } from '../host/files.js'
import { backupDatabase } from '../host/maintenance.js'
import { createCollector } from '../host/collector.js'
import { createWindowsProbe } from '../host/windows-probe.js'
import { prepareWindowsHelper } from '../host/windows-helper.js'

if (process.argv[2] === '--child') {
  // Windows child.kill('SIGINT') force-terminates; invoke the installed handler via IPC.
  await import('../host/main.js')
  process.on('message', () => { process.emit('SIGINT'); process.disconnect() })
} else {
  if (process.platform !== 'win32' || process.argv[2] !== '--loopback') throw new Error('Windows only; pass --loopback to authorize only 127.0.0.1 and ::1.')
  const dir = mkdtempSync(join(tmpdir(), 'netwatch-host-'))
  const path = join(dir, 'db')
  const base = 'http://127.0.0.1:4317'
  const nodes = ['127.0.0.1', '::1'].map((ip, i) => ({id:`loopback-${i}`,type:'router',position:{x:0,y:0},data:{label:`Loopback ${i}`,ip}}))
  const evidence = {scope:'Windows loopback only; IPC invokes SIGINT handler, not a physical Ctrl+C',node:process.version,windows: (await import('node:os')).release()}
  let child, exit, output = ''
  async function read(route) {
    const response = await fetch(base + '/api/v1/' + route, {signal:AbortSignal.timeout(2000)})
    assert.equal(response.status, 200)
    return response.json()
  }
  async function start(enabled) {
    output = ''
    child = fork(fileURLToPath(import.meta.url), ['--child'], {env:{...process.env,NETWATCH_DB:path,NETWATCH_ICMP:enabled?'1':'0'},silent:true})
    exit = once(child, 'exit', {signal:AbortSignal.timeout(10000)})
    child.stdout.on('data', data => {output += data})
    child.stderr.on('data', data => {output += data})
    const deadline = Date.now() + 10000
    while (!output.includes('NetWatch:')) {
      assert.equal(child.exitCode, null, output)
      assert.ok(Date.now() < deadline, output)
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  async function stop() {
    const started = Date.now()
    child.send('stop')
    const [code] = await exit
    assert.equal(code, 0, output)
    child = null
    assert.equal(existsSync(path + '.lock'), false)
    lock(path)()
    return Date.now() - started
  }
  try {
    const store = openStore(path)
    store.write({source:'inventory',topology:{schemaVersion:1,nodes,edges:[]},monitoring:Object.fromEntries(nodes.map(n => [n.id,true]))},0)
    store.close()
    await start(true)
    const deadline = Date.now() + 10000
    let snapshot
    do {
      snapshot = await read('snapshot')
      assert.ok(Date.now() < deadline, JSON.stringify(snapshot))
      if (snapshot.observations.length < 2) await new Promise(resolve => setTimeout(resolve, 25))
    } while (snapshot.observations.length < 2)
    evidence.health = await read('health')
    assert.equal(evidence.health.ready, true)
    assert.equal(evidence.health.collector.errors, 0)
    assert.equal(evidence.health.collector.ready, true)
    for (const observation of snapshot.observations) {
      assert.equal(observation.status, 'up'); assert.equal(observation.outcome, 'reachable')
      assert.ok(Number.isFinite(observation.latencyMs))
      const history = await read(`devices/${observation.deviceId}/checks`)
      assert.equal(history.checks[0].latencyMs, observation.latencyMs)
    }
    evidence.snapshot = snapshot
    assert.equal((await fetch(base)).status, 200)
    evidence.shutdownMs = await stop()
    backupDatabase(path, join(dir, 'backup'))
    await start(false)
    assert.equal((await read('health')).collector.state, 'disabled')
    assert.deepEqual((await read('snapshot')).observations, snapshot.observations)
    evidence.restartShutdownMs = await stop()
    evidence.restartHistoryAndOfflineBackup = 'passed; lock reacquired after each stop'

    const activeStore = openStore(path)
    let launched, closed = false
    const started = new Promise(resolve => {launched = resolve})
    const runner = createWindowsProbe({prepare:()=>prepareWindowsHelper({directory:join(dir,'collector')}),execute:(...args)=>{
      const process = execFile(...args)
      process.once('spawn', launched); process.once('close', () => {closed = true})
      return process
    }})
    const collector = createCollector(activeStore,{enabled:true,runner,policy:{...(await import('../host/icmp-policy.js')).ICMP_POLICY,concurrency:1}})
    try {
      const cycle = collector.runOnce()
      await Promise.race([started, cycle.then(() => {throw new Error('Helper did not launch')})])
      await collector.stop()
      assert.equal(closed, true)
      assert.equal(collector.snapshot().completedChecks, 0)
      assert.deepEqual(activeStore.snapshot().observations, snapshot.observations)
      evidence.activeHelperCancellation = 'child close observed before stop returned; no new observations'
    } finally {await collector.stop();activeStore.close()}
    const errorStore = openStore(path)
    const broken = createCollector(errorStore,{enabled:true,runner:createWindowsProbe({prepare:async()=>join(dir,'missing-helper.exe')})})
    try {
      for (let i=0;i<3;i++) await broken.runOnce()
      assert.equal(broken.snapshot().state,'degraded')
      assert.equal(broken.snapshot().errors,2)
      assert.ok(broken.snapshot().diagnostics.every(item=>item.code==='runner_process_error'))
      assert.deepEqual(errorStore.snapshot().observations,snapshot.observations)
      for (const node of nodes) assert.equal(errorStore.history(node.id).checks.length,1)
      evidence.realProcessFailure = 'three cycles with missing executable; diagnostics only, history/timestamps unchanged'
    } finally {await broken.stop();errorStore.close()}
    console.log(JSON.stringify(evidence,null,2))
  } finally {
    if (child?.connected) await stop()
    rmSync(dir,{recursive:true,force:true})
  }
}
