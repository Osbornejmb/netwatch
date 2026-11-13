import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { openStore } from '../host/store.js'
import { createHost } from '../host/server.js'

// Isolated documentation-address inventory; no collector, probes or user database.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const dir=mkdtempSync(join(tmpdir(),'netwatch-incident-ui-'))
const store=openStore(join(dir,'db'))
store.write({source:'inventory',topology:{schemaVersion:1,nodes:[{id:'a',type:'switch',position:{x:0,y:0},data:{label:'TEST-SWITCH',ip:'192.0.2.1'}}],edges:[]},monitoring:{a:true}},0)
const append=status=>store.append([{deviceId:'a',status,checkedAt:new Date().toISOString()}])
const server=createHost(store,{port:0,collector:{snapshot:()=>({state:'disabled',freshness:{staleAfterMs:90000}})}})
server.listen(0,'127.0.0.1');await once(server,'listening')
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const errors=[];page.on('pageerror',error=>errors.push(error.message))
page.setDefaultTimeout(12000)
const base=`http://127.0.0.1:${server.address().port}`
const refresh=()=>page.getByRole('button',{name:'Refresh host',exact:true}).click()
const inspect=async()=>{const node=page.locator('.react-flow__node[data-id="a"]');await node.waitFor({state:'visible'});await node.press('Enter');await page.getByRole('dialog').waitFor();await page.getByText('Incidents',{exact:true}).click()}
const region=()=>page.getByRole('region',{name:'Device incidents',exact:true})
mkdirSync('docs/screenshots',{recursive:true})
try {
  await page.goto(base);await inspect();await region().getByText('No recorded incidents.').waitFor()
  await page.keyboard.press('Escape')
  append('down');append('down');await refresh()
  await page.locator('.health-node-down').waitFor()
  await page.getByText('View options',{exact:true}).click();await page.getByRole('button',{name:/TEST-SWITCH.*Open outage/}).waitFor();await page.getByText('View options',{exact:true}).click()
  await inspect();await region().getByText('Open outage',{exact:true}).waitFor();assert.equal(await region().locator('li').count(),1)
  await region().getByRole('button',{name:'View checks'}).scrollIntoViewIfNeeded()
  await page.screenshot({path:'docs/screenshots/incidents-desktop.png'})
  await region().getByRole('button',{name:'View checks',exact:true}).click()
  await page.getByRole('region',{name:'Recent device history'}).getByText('Recent checks and transitions').waitFor()
  await page.keyboard.press('Escape')
  append('up');await refresh();await page.locator('.health-node-up').waitFor();await inspect();await region().getByText('Recovered',{exact:true}).waitFor();assert.equal(await region().locator('li').count(),1)
  await page.setViewportSize({width:390,height:844});await region().getByRole('button',{name:'View checks'}).scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/incidents-narrow.png'})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')),true)
  await page.route('**/api/v1/devices/*/incidents*',route=>route.abort())
  await region().getByRole('button',{name:'Refresh incidents'}).click();await region().getByRole('alert').waitFor()
  await page.screenshot({path:'docs/screenshots/incidents-error.png'})
  assert.deepEqual(errors,[])
  writeFileSync('docs/incidents-results.json',JSON.stringify({observedAt:new Date().toISOString(),browser:await browser.version(),mode:'Controlled isolated database; no real probes',checks:['empty','down deduplication','attention entry','device history navigation','recovery','390px overflow','keyboard dialog','request failure'],errors},null,2)+'\n')
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true})}
