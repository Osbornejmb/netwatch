import assert from 'node:assert/strict'
import { mkdtempSync,rmSync } from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {once} from 'node:events'
import {openStore} from '../host/store.js'
import {createHost} from '../host/server.js'

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const dir=mkdtempSync(join(tmpdir(),'netwatch-discovery-browser-')),store=openStore(join(dir,'db'))
store.recordDiscovery([{ip:'192.168.1.9',mac:'aa:bb:cc:dd:ee:ff',source:'neighbor',hostname:'router.home'},{ip:'192.168.1.10',mac:null,source:'neighbor'}])
let phase='idle'
let scans=0
const discovery={async runOnce(){scans++;phase='neighbors';await new Promise(resolve=>setTimeout(resolve,900));phase='routes';await new Promise(resolve=>setTimeout(resolve,900));phase='idle'},snapshot(){return {state:phase==='idle'?'idle':'running',phase,processed:0,total:phase==='routes'?1:254,upstreamLinks:phase==='idle'?1:0}}}
const server=createHost(store,{port:0,discovery,dist:process.env.NETWATCH_TEST_DIST});server.listen(0,'127.0.0.1');await once(server,'listening')
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']})
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 const base='http://127.0.0.1:'+server.address().port
 const staleSnapshot=await (await fetch(base+'/api/v1/snapshot')).json()
 await page.addInitScript((snapshot)=>{
  window.EventSource=class extends EventTarget{
   constructor(){super();setTimeout(()=>this.dispatchEvent(new MessageEvent('snapshot',{data:JSON.stringify(snapshot),lastEventId:'fixture.old'})),0)}
   close(){}
  }
 },staleSnapshot)
 await page.goto(base)
 await page.getByRole('link',{name:'Discovered'}).click();await page.getByText('192.168.1.9').waitFor()
 await page.getByRole('button',{name:'Information for 192.168.1.9'}).focus();await page.getByRole('tooltip').getByText(/Type guess.*Router/).waitFor();await page.keyboard.press('Escape')
 await page.locator('meta[name="netwatch-write-token"]').evaluate(meta=>{meta.content='0'.repeat(64)})
 await page.getByRole('button',{name:'Scan now'}).click();await page.getByText('Reading the Windows neighbor list…').waitFor();await page.getByText('Checking routes to saved routers (0 of 1)…').waitFor();await page.getByRole('status').getByText('Scan complete. Proposed 1 router link.').waitFor()
 assert.equal(scans,1)
 await page.getByRole('button',{name:'Scan now'}).click();await page.getByRole('status').getByText(/Wait 30 seconds between scan requests/).waitFor()
 assert.equal(scans,1)
 await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body))
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 const first=page.getByRole('listitem').filter({hasText:'192.168.1.9'});await first.getByRole('button',{name:'Add to draft'}).click();await page.getByRole('status').getByText('Added to the draft map.').waitFor()
 assert.equal(store.read().topology.nodes.length,0)
 await page.getByRole('link',{name:'Edit map',exact:true}).click()
 await page.locator('.device-node.endpoint-node').getByText('router.home',{exact:true}).waitFor()
 await page.locator('summary').filter({ hasText: /^Devices & connections$/ }).click()
 await page.getByLabel('Selected device',{exact:true}).selectOption(store.discovered().devices.find(d=>d.ip==='192.168.1.9').id)
 await page.locator('.inventory-controls').getByRole('button',{name:'Edit device',exact:true}).click()
 await page.getByLabel('Device type',{exact:true}).selectOption('computer')
 await page.getByRole('dialog').getByRole('button',{name:'Save changes'}).click()
 await page.locator('.device-node.computer-node').waitFor()
 async function applyDraft() {
  await page.getByRole('link',{name:'Edit map',exact:true}).click()
  await page.getByRole('button',{name:'Use this map',exact:true}).click()
  await page.getByRole('button',{name:'Confirm replacement'}).click()
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'))
  await page.getByRole('link',{name:'Discovered'}).click()
 }
 await applyDraft()
 assert.equal(Object.values(store.read().monitoring)[0],false)
 assert.equal(store.read().topology.nodes[0].type,'computer')
 await page.getByRole('link',{name:'Network dashboard',exact:true}).click()
 await page.locator('.health-node.computer-node.endpoint-card').getByText('router.home',{exact:true}).waitFor()
 await page.getByRole('link',{name:'Discovered'}).click()
 await page.getByRole('listitem').filter({hasText:'192.168.1.9'}).getByRole('button',{name:'Remove'}).click();await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click();await page.getByText('Removed from discovered devices.').waitFor();assert.equal(store.read().topology.nodes.length,1)
 const second=page.getByRole('listitem').filter({hasText:'192.168.1.10'});await second.getByRole('button',{name:'Remove'}).click();await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click();await page.getByText('No discovered devices yet.').waitFor();assert.equal(store.discovered().devices.some(d=>d.ip==='192.168.1.10'),false)
 store.recordDiscovery([{ip:'192.168.1.11',mac:null,source:'neighbor'}]);await page.reload();await page.getByRole('button',{name:'Clear all'}).click();const clear=page.getByRole('dialog',{name:'Clear discovery list?'});assert.ok(await clear.getByRole('button',{name:'Cancel'}).evaluate(el=>el===document.activeElement));await page.keyboard.press('Escape');assert.equal(store.discovered().devices.length,1);await page.getByRole('button',{name:'Clear all'}).click();await clear.getByRole('button',{name:'Clear all'}).click();await page.getByRole('status').getByText('Discovery list cleared.').waitFor();assert.equal(store.discovered().devices.length,0);assert.equal(store.read().topology.nodes.length,1)
 store.recordDiscovery([{ip:'192.168.1.1',source:'gateway'},{ip:'192.168.1.11',source:'gateway-mac'}])
 await page.reload()
 await page.getByText('Router · Default gateway').waitFor()
 await page.getByText('Likely router · Matches known gateway').waitFor()
 await page.getByRole('button',{name:'Add all to draft'}).click()
 const bulk=page.getByRole('dialog',{name:'Add all to draft?'})
 assert.ok(await bulk.getByRole('button',{name:'Cancel'}).evaluate(el=>el===document.activeElement))
 await page.keyboard.press('Escape')
 assert.equal(store.read().topology.nodes.length,1)
 await page.getByRole('button',{name:'Add all to draft'}).click()
 await bulk.getByRole('button',{name:'Add all',exact:true}).click()
 await page.getByRole('status').getByText('Added 2 to the draft map.').waitFor()
 assert.equal(store.read().topology.nodes.length,1)
 await applyDraft()
 assert.equal(store.read().topology.nodes.length,3)
 await page.getByRole('button',{name:'Add all to draft',disabled:true}).waitFor()
 const savedBeforeClear=store.read()
 await page.getByRole('link',{name:'Edit map',exact:true}).click()
 await page.locator('summary').filter({hasText:/^Devices & connections$/}).click()
 await page.locator('.inventory-controls').getByRole('button',{name:'Clear draft map',exact:true}).click()
 await page.getByRole('dialog',{name:'Clear draft map?'}).getByRole('button',{name:'Clear draft map',exact:true}).click()
 await page.getByText('Build your network',{exact:true}).waitFor()
 assert.deepEqual(store.read(),savedBeforeClear)
 console.log('Discovery browser check passed: gateway label, individual and bulk add, remove, keyboard focus, desktop and 390px layout.')
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true})}
