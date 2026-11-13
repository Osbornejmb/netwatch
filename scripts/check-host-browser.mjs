import { createEditorNetwork } from '../tests/fixtures/editor-network.js'
import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const base=process.env.NETWATCH_HOST_URL||'http://127.0.0.1:4317'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']})
const context=await browser.newContext({viewport:{width:1440,height:900}})
await context.addInitScript(network => { if (!localStorage.getItem('netwatch-topology-v1')) localStorage.setItem('netwatch-topology-v1', JSON.stringify(network)) }, createEditorNetwork())
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
const read=()=>context.request.get(base+'/api/v1/topology').then(r=>r.json())
const host=page.getByRole('region',{name:'Saved network settings'})
const preview=page.getByRole('dialog')
const open=async()=>{await page.getByRole('link',{name:'Edit network map'}).click();await host.getByText('Monitoring settings',{exact:true}).click();await host.getByRole('button',{name:'Connect',exact:true}).click();await host.getByText(/Connected ·/).waitFor()}
const save=async()=>{await host.getByRole('button',{name:'Use this map',exact:true}).click();await preview.getByRole('button',{name:'Confirm replacement'}).click();await host.getByText(/Network saved/).waitFor()}
try {
 await page.goto(base);await open();const initial=await read()
 await host.getByRole('button',{name:'Use this map',exact:true}).click();await page.keyboard.press('Shift+Tab');assert.equal(await preview.locator('summary').nth(1).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Shift+Tab');assert.equal(await preview.locator('summary').nth(0).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');await preview.getByText('CORE-ROUTER-01 ·',{exact:false}).waitFor();await preview.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await read()).revision,initial.revision)
 await save();const migrated=await read();assert.equal(migrated.topology.nodes.length,5);assert.equal(migrated.topology.edges.length,4);assert.ok(Object.values(migrated.monitoring).every(v=>v===false))
 await host.getByText('Device checks',{exact:true}).click();await host.getByLabel('Host device monitoring').selectOption('r1');await host.getByRole('checkbox').check();await save();assert.equal((await read()).monitoring.r1,true)
 // Reimporting the same v1 map must still revoke implicit authorization.
 await page.locator('input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(migrated.topology))});await preview.getByRole('button',{name:'Import map',exact:true}).click();await save();assert.equal((await read()).monitoring.r1,false)
 // A concurrent client wins; stale browser writes require a fresh preview.
 const current=await read();await context.request.put(base+'/api/v1/topology',{headers:{'X-NetWatch-Write':'1'},data:{source:'inventory',baseRevision:current.revision,topology:current.topology}})
 await host.getByRole('button',{name:'Use this map',exact:true}).click();await preview.getByRole('button',{name:'Confirm replacement'}).click();await host.getByText(/Unable to save/).waitFor();assert.equal((await read()).revision,current.revision+1)
 await host.getByRole('button',{name:'Connect',exact:true}).click();await host.getByText(/Connected ·/).waitFor()
 await host.getByRole('button',{name:'Copy to draft',exact:true}).click();await preview.getByRole('button',{name:'Confirm replacement'}).click();await host.getByText(/Saved network copied/).waitFor()
 await page.screenshot({path:'docs/host-storage-desktop.jpg',fullPage:true})
 await page.setViewportSize({width:390,height:844});await host.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
 await host.getByRole('button',{name:'Use this map',exact:true}).click();await preview.getByRole('button',{name:'Cancel',exact:true}).click();await page.screenshot({path:'docs/host-storage-narrow.jpg',fullPage:true})
 const final=await read();await context.request.put(base+'/api/v1/topology',{headers:{'X-NetWatch-Write':'1'},data:{source:'inventory',baseRevision:final.revision,topology:{schemaVersion:1,nodes:[],edges:[]}}});await host.getByRole('button',{name:'Connect',exact:true}).click();await host.getByText(/Connected ·/).waitFor();await host.getByRole('button',{name:'Copy to draft',exact:true}).click();await preview.getByRole('button',{name:'Confirm replacement'}).click();await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===0)
 await page.route('**/api/v1/topology',route=>route.abort());await host.getByRole('button',{name:'Connect',exact:true}).click();await host.getByText(/Start NetWatch/).waitFor();assert.equal(await host.getByRole('button',{name:'Use this map',exact:true}).isDisabled(),true)
 assert.deepEqual(errors,[])
 console.log('Host browser checks passed: preview/cancel, migration, opt-in, import reset, stale conflict, load, desktop/narrow.')
} finally {await browser.close()}
