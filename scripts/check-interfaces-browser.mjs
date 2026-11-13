import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {openStore} from '../host/store.js'
import {createHost} from '../host/server.js'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
// Controlled database fixtures only. No SNMP/ICMP collector or credential vault is created.
const dir=mkdtempSync(join(tmpdir(),'netwatch-interface-ui-')),store=openStore(join(dir,'db')),authorization=randomUUID()
store.write({source:'inventory',topology:{schemaVersion:1,nodes:[{id:'a',type:'router',position:{x:0,y:0},data:{label:'TEST ROUTER',ip:'192.0.2.1'}}],edges:[]},monitoring:{a:true}},0)
store.authorizeInterfaces('a',authorization,1)
const time=Date.now()
const rows=Array.from({length:55},(_,i)=>({index:i+1,name:i===0?'FastEthernet0/0':`Gi1/0/${i+1}`,description:'Fixture interface',admin:1,oper:i===0?2:i===2?null:1,speedBps:1000000000,discontinuity:0,counterBits:64,inOctets:'100000',outOctets:'200000'}))
store.appendInterfaces('a',{checkedAt:new Date(time-61000).toISOString(),uptime:10000,interfaces:rows},{revision:1,authorization})
store.appendInterfaces('a',{checkedAt:new Date(time-1000).toISOString(),uptime:16000,interfaces:rows.map(r=>({...r,inOctets:'160000',outOctets:'260000'}))},{revision:1,authorization})
store.append([{deviceId:'a',status:'up',checkedAt:new Date(time-1000).toISOString()}])
let staleAfterMs=180000
const server=createHost(store,{port:0,collector:{snapshot:()=>({state:'running',freshness:{staleAfterMs:90000}})},interfaces:{device:()=>({state:'ok',collectorState:'running',staleAfterMs})}})
server.listen(0,'127.0.0.1');await once(server,'listening')
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000)
const errors=[];page.on('pageerror',error=>errors.push(error.message))
mkdirSync('.tools/interface-screenshots',{recursive:true})
try {
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.health-node-up').waitFor()
 await page.locator('.react-flow__node').focus();await page.keyboard.press('Enter');await page.getByText('Ports',{exact:true}).click()
 const region=page.getByRole('region',{name:'Device ports'})
 await region.getByText('FastEthernet0/0',{exact:true}).waitFor();assert.equal(await region.locator('li').count(),50)
 assert.match(await region.locator('li').nth(0).innerText(),/Down · Enabled/);assert.match(await region.locator('li').nth(1).innerText(),/8.0 kbps/);assert.match(await region.locator('li').nth(2).innerText(),/Unknown/)
 assert.equal(await page.getByRole('dialog').locator('.health-status.health-up').count(),1,'A down interface must not turn the replying device down')
 await region.getByRole('button',{name:'Next page'}).click();await region.getByText('Gi1/0/55',{exact:true}).waitFor();assert.equal(await region.locator('li').count(),5)
 await region.getByRole('button',{name:'First page'}).click();await region.getByText('FastEthernet0/0',{exact:true}).waitFor()
 await region.getByRole('button',{name:'Refresh ports'}).scrollIntoViewIfNeeded();await page.screenshot({path:'.tools/interface-screenshots/desktop.png'})
 await page.setViewportSize({width:390,height:844});await region.getByRole('button',{name:'Refresh ports'}).scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.tools/interface-screenshots/narrow.png'})
 staleAfterMs=1;await region.getByRole('button',{name:'Refresh ports'}).click();await region.getByText(/Waiting for new port results/).waitFor();assert.match(await region.locator('li').nth(0).innerText(),/Last known/)
 await page.route('**/api/v1/devices/a/interfaces*',route=>route.abort());await region.getByRole('button',{name:'Refresh ports'}).click();await region.getByRole('alert').waitFor()
 await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('dialog')))
 await page.unroute('**/api/v1/devices/a/interfaces*');store.authorizeInterfaces('a',null,1);await region.getByRole('button',{name:'Refresh ports'}).click();await region.getByText(/not set up/).waitFor();await region.getByText('No recorded ports.').waitFor()
 assert.deepEqual(errors,[])
 writeFileSync('docs/snmp-browser-results.json',JSON.stringify({scope:'Controlled 55-interface fixture; no real probes or credentials',browser:await browser.version(),checks:['device Up independently of interface Down','unknown/partial interface state','counter-derived rates','pagination','desktop/390px','stale and request failure','keyboard dialog','authorization removal/empty state'],errors},null,2)+'\n')
 console.log('Interface browser checks passed; no devices probed.')
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true})}
