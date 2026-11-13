import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir, release } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { openStore } from '../host/store.js'
import { createHost } from '../host/server.js'
import { createCollector } from '../host/collector.js'
import { createWindowsProbe } from '../host/windows-probe.js'
import { prepareWindowsHelper } from '../host/windows-helper.js'
import { normalizeAddress } from '../src/inventory.js'
import { backupDatabase, restoreDatabase } from '../host/maintenance.js'

// Interactive owner-controlled hardware acceptance. No device configuration changes or discovery.
if(process.platform!=='win32' || process.argv[2]!=='--approved-target') throw new Error('Windows only. Pass --approved-target <literal address> only after the owner approves that device and manually controls its Wi-Fi.')
const target=normalizeAddress(process.argv[3]);if(!target)throw new Error('An approved literal address is required.')
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const directory=mkdtempSync(join(tmpdir(),'netwatch-release-device-')), path=join(directory,'db')
let store=openStore(path), collector, browser, server
const report={scope:'One explicitly approved device; owner manually controls Wi-Fi; target and private paths omitted',node:process.version,windows:release(),checks:[],probes:'Only the explicitly supplied target',physicalCtrlC:false}
const output=process.env.NETWATCH_RELEASE_OUTPUT || '.tools/release-device-results.json'
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const stamp=()=>new Date().toISOString()
const create=()=>createCollector(store,{enabled:true,runner:createWindowsProbe({prepare:()=>prepareWindowsHelper({directory:join(directory,'helper')})})})
const deadline=async(fn,timeout,label)=>{const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;await delay(100)}throw new Error(label+' timed out')}
const topology={schemaVersion:1,nodes:[{id:'approved-device',type:'switch',position:{x:0,y:0},data:{label:'APPROVED TEST DEVICE',ip:target}}],edges:[]}
const screenshot=async(page,name)=>{await page.screenshot({path:`.tools/release-screenshots/${name}.png`,mask:[page.locator('.health-address'),page.locator('.health-device-details dl>div').filter({has:page.getByText('Management IP',{exact:true})})]})}
const renderState=async(page,state)=>{await page.locator(`.health-node-${state}`).waitFor({timeout:45000})}
try {
  mkdirSync('.tools/release-screenshots',{recursive:true})
  store.write({source:'inventory',topology,monitoring:{'approved-device':true}},0)
  collector=create();collector.start()
  server=createHost(store,{port:0,collector:{snapshot:()=>collector.snapshot()}});server.listen(0,'127.0.0.1');await once(server,'listening')
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']})
  const context=await browser.newContext({viewport:{width:1440,height:900}}), page=await context.newPage()
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await renderState(page,'up');report.policy=collector.snapshot().policy
  assert.equal(report.policy.intervalMs,10000);assert.equal(report.policy.failuresForDown,2)
  report.initialUp=store.snapshot().observations[0];delete report.initialUp.deviceId
  await screenshot(page,'up')
  console.log('READY_FOR_WIFI_OFF: reachable on real dashboard; turn OFF Wi-Fi on the approved device now.')
  const observation=await deadline(()=>store.snapshot().observations.find(o=>o.status==='down'),240000,'Waiting for two valid failures (restore Wi-Fi if abandoning the test)')
  await renderState(page,'down')
  report.down={checkedAt:observation.checkedAt,dashboardSeenAt:stamp(),dashboardLagMs:Date.now()-Date.parse(observation.checkedAt)}
  const first=store.incidents('approved-device').incidents;assert.equal(first.length,1);assert.equal(first[0].resolvedAt,null)
  report.incidentOpenedAt=first[0].openedAt
  await page.locator('.react-flow__node').focus();await page.keyboard.press('Enter');await page.getByText('Incidents',{exact:true}).click();await page.getByText('Open outage',{exact:true}).waitFor()
  await screenshot(page,'down-incident');await page.keyboard.press('Escape')
  const checks=store.history('approved-device').checks;const downIndex=checks.findLastIndex(o=>o.status==='down')
  assert.equal(checks[downIndex].outcome,'unreachable');assert.equal(checks[downIndex+1].outcome,'unreachable');assert.equal(checks[downIndex+1].status,'up')
  report.failureTail=checks.slice(0,Math.min(checks.length,5)).reverse().map(({status,outcome,checkedAt})=>({status,outcome,checkedAt}))
  console.log('READY_FOR_WIFI_ON: Down and one open incident verified; turn Wi-Fi back ON now.')
  const recovered=await deadline(()=>store.snapshot().observations.find(o=>o.status==='up' && Date.parse(o.checkedAt)>Date.parse(observation.checkedAt)),180000,'Waiting for Wi-Fi recovery')
  await renderState(page,'up');report.recovery={checkedAt:recovered.checkedAt,dashboardSeenAt:stamp(),dashboardLagMs:Date.now()-Date.parse(recovered.checkedAt)}
  const incidents=store.incidents('approved-device').incidents;assert.equal(incidents.length,1);assert.ok(incidents[0].resolvedAt);assert.equal(incidents[0].id,first[0].id)
  report.incidentResolvedAt=incidents[0].resolvedAt
  await page.setViewportSize({width:390,height:844});await screenshot(page,'recovered-narrow');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  report.errorsAtRecovery=collector.snapshot().errors
  const baseline=store.snapshot().observations;await collector.stop()
  await context.route('**/api/v1/snapshot',route=>route.abort())
  await page.getByText('Host disconnected',{exact:false}).first().waitFor({timeout:15000})
  await renderState(page,'stale');report.staleSeenAt=stamp();await screenshot(page,'stale')
  assert.deepEqual(store.snapshot().observations,baseline);assert.equal(store.snapshot().activeIncidents.length,0)
  await context.unroute('**/api/v1/snapshot');collector=create();collector.start();await renderState(page,'up');report.reconnectedAt=stamp()
  await collector.stop();const persisted=store.incidents('approved-device').incidents, saved=store.snapshot();store.close()
  backupDatabase(path,join(directory,'backup'));restoreDatabase(path,join(directory,'backup'));store=openStore(path)
  assert.deepEqual(store.incidents('approved-device').incidents,persisted)
  assert.deepEqual(store.snapshot().observations,saved.observations)
  assert.deepEqual(store.read().topology,saved.inventory.topology)
  report.checks=['real reachable → second-failure down → first-reply up','one incident and one recovery','dashboard observation lag','390px overflow','API disconnection → real freshness stale → reconnect','offline backup/restore preserves incidents and inventory']
  assert.deepEqual(errors,[]);report.browserErrors=errors;report.collectorErrors=collector.snapshot().errors
  report.completedAt=stamp();writeFileSync(output,JSON.stringify(report,null,2)+'\n')
  console.log('PASS: Wi-Fi recovery verified; temporary test host stopped; report saved with target omitted.')
} catch(error) { console.error('Release check failed: '+error.message+'. Ensure device Wi-Fi is restored.');process.exitCode=1 }
finally {await collector?.stop();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));try{store.close()}catch{}rmSync(directory,{recursive:true,force:true})}
