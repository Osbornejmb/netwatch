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
let scanning=false
const discovery={async runOnce(){scanning=true;await new Promise(resolve=>setTimeout(resolve,900));scanning=false},snapshot(){return {state:scanning?'running':'idle',phase:scanning?'neighbors':'idle',processed:0,total:254}}}
const server=createHost(store,{port:0,discovery,dist:process.env.NETWATCH_TEST_DIST});server.listen(0,'127.0.0.1');await once(server,'listening')
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']})
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(`http://127.0.0.1:${server.address().port}/`)
 await page.getByRole('link',{name:'Discovered'}).click();await page.getByText('192.168.1.9').waitFor()
 await page.getByRole('button',{name:'Information for 192.168.1.9'}).focus();await page.getByRole('tooltip').getByText(/Type guess.*Router/).waitFor();await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'Scan now'}).click();await page.getByText('Reading the Windows neighbor list…').waitFor();await page.getByRole('status').getByText('Scan complete.').waitFor()
 await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body))
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 const first=page.getByRole('listitem').filter({hasText:'192.168.1.9'});await first.getByRole('button',{name:'Add to map'}).click();await page.getByRole('status').getByText('Added to the map.').waitFor()
 assert.equal(Object.values(store.read().monitoring)[0],true)
 await page.getByRole('listitem').filter({hasText:'192.168.1.9'}).getByRole('button',{name:'Remove'}).click();await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click();await page.getByText('Removed from discovered devices.').waitFor();assert.equal(store.read().topology.nodes.length,1)
 const second=page.getByRole('listitem').filter({hasText:'192.168.1.10'});await second.getByRole('button',{name:'Remove'}).click();await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click();await page.getByText('No discovered devices yet.').waitFor();assert.equal(store.discovered().devices.some(d=>d.ip==='192.168.1.10'),false)
 store.recordDiscovery([{ip:'192.168.1.11',mac:null,source:'neighbor'}]);await page.reload();await page.getByRole('button',{name:'Clear all'}).click();const clear=page.getByRole('dialog',{name:'Clear discovery list?'});assert.ok(await clear.getByRole('button',{name:'Cancel'}).evaluate(el=>el===document.activeElement));await page.keyboard.press('Escape');assert.equal(store.discovered().devices.length,1);await page.getByRole('button',{name:'Clear all'}).click();await clear.getByRole('button',{name:'Clear all'}).click();await page.getByRole('status').getByText('Discovery list cleared.').waitFor();assert.equal(store.discovered().devices.length,0);assert.equal(store.read().topology.nodes.length,1)
 console.log('Discovery browser check passed: list, type hint, add with monitoring enabled, remove, keyboard focus, desktop and 390px layout.')
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true})}
