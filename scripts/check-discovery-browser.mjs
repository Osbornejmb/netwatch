import assert from 'node:assert/strict'
import { mkdtempSync,rmSync } from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {once} from 'node:events'
import {openStore} from '../host/store.js'
import {createHost} from '../host/server.js'

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const dir=mkdtempSync(join(tmpdir(),'netwatch-discovery-browser-')),store=openStore(join(dir,'db'))
store.recordDiscovery([{ip:'192.168.1.9',mac:'aa:bb:cc:dd:ee:ff',source:'neighbor'},{ip:'192.168.1.10',mac:null,source:'neighbor'}])
const server=createHost(store);server.listen(0,'127.0.0.1');await once(server,'listening')
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']})
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(`http://127.0.0.1:${server.address().port}/`)
 await page.getByRole('link',{name:'Discovered'}).click();await page.getByText('192.168.1.9').waitFor()
 assert.equal(await page.locator('.health-inventory table').isVisible(),true)
 await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body))
 const first=page.getByRole('row').filter({hasText:'192.168.1.9'});await first.getByRole('button',{name:'Add to map'}).click();await page.getByRole('status').getByText('Added to the map. Monitoring remains off.').waitFor()
 assert.equal(Object.values(store.read().monitoring)[0],false)
 const second=page.getByRole('row').filter({hasText:'192.168.1.10'});await second.getByRole('button',{name:'Ignore'}).click();assert.equal(store.discovered().devices.find(d=>d.ip==='192.168.1.10').status,'ignored')
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.equal(await page.locator('.health-inventory table').isVisible(),false);assert.equal(await page.locator('.health-device-cards').isVisible(),true)
 console.log('Discovery browser check passed: list, add with monitoring off, ignore, keyboard focus, desktop and 390px layout.')
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true})}
