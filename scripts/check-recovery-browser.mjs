import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(10000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => { errors.push(`Unexpected native dialog: ${dialog.message()}`); dialog.dismiss() })
const url = process.env.NETWATCH_URL || 'http://127.0.0.1:4173'
const key = 'netwatch-topology-v1'
const raw = ' { broken original\n  "keep this": true '
const replacement = { schemaVersion: 1, nodes: [{ id: 'restored', type: 'router', position: { x: 30, y: 40 }, data: { label: 'RESTORED', ip: '2001:db8::1' } }], edges: [] }
const stored = () => page.evaluate(key => localStorage.getItem(key), key)
const count = () => page.locator('.health-stat.health-all strong').innerText()
const file = body => ({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(body) })
const upload = body => page.locator('input[type=file]').setInputFiles(file(body))
async function download(button) {
  const pending = page.waitForEvent('download')
  await button.click()
  return readFile(await (await pending).path(), 'utf8')
}
await page.goto(url)
await page.evaluate(({key,raw}) => localStorage.setItem(key,raw), { key, raw })
await page.reload()
assert.match(await page.getByRole('alert').innerText(), /fallback/)
assert.equal(await stored(), raw)
const originalDownload = page.getByRole('button', {name: 'Download original saved content', exact: true})
assert.equal(await download(originalDownload), raw)
const exported = await download(page.getByRole('button', {name: 'Export current map',exact:true}))
assert.equal(JSON.parse(exported).nodes.length, 5)
assert.notEqual(exported, raw)
// All invalid input variants preserve the visible fallback and saved original.
for (const invalid of ['{', JSON.stringify({schemaVersion:99,nodes:[],edges:[]}), JSON.stringify({nodes:{},edges:[]}), ' '.repeat(5*1024*1024+1)]) {
  await upload(invalid)
  await page.getByRole('alert').filter({hasText:'Import failed'}).waitFor()
  assert.equal(await count(), '5')
  assert.equal(await stored(), raw)
}
await upload(JSON.stringify(replacement))
let dialog = page.getByRole('dialog',{name:'Import this map?'})
await dialog.waitFor()
assert.equal(await dialog.getByRole('button',{name:'Cancel',exact:true}).evaluate(e=>e===document.activeElement),true)
await page.keyboard.press('Escape')
assert.equal(await count(),'5'); assert.equal(await stored(),raw)
await upload(JSON.stringify(replacement))
await dialog.getByRole('button',{name:'Import map',exact:true}).click()
assert.equal(await count(),'1')
await page.waitForTimeout(1100)
assert.equal(await stored(),raw)
assert.equal(await download(originalDownload),raw)
assert.match(await page.locator('.backup-status').innerText(),/paused/)
const replace = page.getByRole('button',{name:'Replace saved map…',exact:true})
await replace.click()
dialog=page.getByRole('dialog',{name:'Replace saved map?'})
assert.equal(await download(dialog.getByRole('button',{name:'Download original saved content',exact:true})),raw)
for(let i=0;i<8;i++) { await page.keyboard.press('Tab'); assert.ok(await dialog.evaluate(d=>d.contains(document.activeElement))) }
await page.keyboard.press('Escape')
assert.equal(await replace.evaluate(e=>e===document.activeElement),true)
assert.equal(await stored(),raw)
await page.evaluate(() => {
  window.__denyOriginalWrite = true
  const write = Storage.prototype.setItem
  Storage.prototype.setItem = function(...args) { if (window.__denyOriginalWrite) throw new DOMException('quota', 'QuotaExceededError'); return write.apply(this, args) }
})
await replace.click()
await dialog.getByRole('button',{name:'Replace saved map',exact:true}).click()
assert.equal(await stored(), raw)
assert.equal(await download(originalDownload), raw)
assert.match(await page.getByRole('alert').innerText(), /could not be saved/)
await page.evaluate(() => window.__denyOriginalWrite = false)
await replace.click()
await dialog.getByRole('button',{name:'Replace saved map',exact:true}).click()
await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).nodes.length===1,key)
assert.equal(await originalDownload.count(),0)
await page.reload()
assert.equal(await count(),'1')
// Normal restore, empty inventory, no-match states and sample-safe export.
await upload(JSON.stringify({nodes:[],edges:[]}))
await page.getByRole('dialog').getByRole('button',{name:'Import map',exact:true}).click()
assert.equal(await count(),'0')
assert.match(await page.locator('.health-table-empty').innerText(),/No devices/)
await upload(exported)
await page.getByRole('dialog').getByRole('button',{name:'Import map',exact:true}).click()
assert.equal(await count(),'5')
await page.getByLabel('Search dashboard devices').fill('no matches')
assert.match(await page.locator('.health-table-empty').innerText(),/No devices/)
await page.getByLabel('Search dashboard devices').fill('')
await page.getByRole('button',{name:'Preview sample statuses'}).click()
await page.getByText('Map backup and recovery',{exact:true}).click()
assert.equal(JSON.parse(await download(page.getByRole('button',{name:'Export current map',exact:true}))).nodes.length,5)
await page.getByRole('button',{name:'Return to my network'}).click()
await page.getByRole('button',{name:'Edit topology',exact:true}).click()
await page.getByRole('link',{name:'Device inventory',exact:true}).click()
assert.ok(await page.locator('#inventory').isVisible())
// Failed writes preserve memory and saved data, with warnings in both views and a retry path.
await page.evaluate(() => {
  window.__denyWrites=true
  const write=Storage.prototype.setItem
  Storage.prototype.setItem=function(...args) { if(window.__denyWrites) throw new DOMException('quota','QuotaExceededError'); return write.apply(this,args) }
})
const previous = await stored()
await upload(JSON.stringify(replacement))
await page.getByRole('dialog').getByRole('button',{name:'Import map',exact:true}).click()
await page.getByRole('alert').filter({hasText:'could not be saved'}).waitFor()
assert.equal(await count(),'1'); assert.equal(await stored(),previous)
assert.ok(!(await page.locator('.backup-status').innerText()).includes('Autosave is active'))
assert.equal(JSON.parse(await download(page.getByRole('button',{name:'Export current map',exact:true}))).nodes.length,1)
await page.getByRole('button',{name:'Edit topology',exact:true}).click()
assert.match(await page.getByRole('alert').innerText(),/paused/)
await page.getByRole('button',{name:'Replace saved map…',exact:true}).click()
await page.getByRole('dialog').getByRole('button',{name:'Replace saved map',exact:true}).click()
assert.equal(await stored(),previous)
await page.evaluate(()=>window.__denyWrites=false)
await page.getByRole('button',{name:'Replace saved map…',exact:true}).click()
await page.getByRole('dialog').getByRole('button',{name:'Replace saved map',exact:true}).click()
await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).nodes.length===1,key)
// Denied reads never attempt autosave or claim that original content is downloadable.
const deniedContext=await browser.newContext()
await deniedContext.addInitScript(()=>{
  window.__writes=0
  Storage.prototype.getItem=()=>{throw new DOMException('denied','SecurityError')}
  Storage.prototype.setItem=()=>{window.__writes++;throw new DOMException('denied','SecurityError')}
})
const denied=await deniedContext.newPage()
await denied.goto(url)
assert.match(await denied.getByRole('alert').innerText(),/storage.*read/)
assert.equal(await denied.getByRole('button',{name:'Download original saved content',exact:true}).count(),0)
assert.equal(await denied.evaluate(()=>window.__writes),0)
await denied.getByRole('button',{name:'Edit topology',exact:true}).click()
assert.ok(await denied.getByRole('alert').isVisible())
await deniedContext.close()
// Screenshot recovery in both layouts using a fresh corrupt saved value.
await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw})
await page.bringToFront()
await page.reload()
await page.locator('.health-map').scrollIntoViewIfNeeded()
await page.waitForFunction(() => {
  const nodes = [...document.querySelectorAll('.react-flow__node')]
  return nodes.length === 5 && nodes.every(node => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
})
await page.evaluate(() => window.scrollTo(0, 0))
await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/recovery-desktop.jpg',import.meta.url)),fullPage:true})
await page.setViewportSize({width:390,height:844})
await page.getByRole('button',{name:'Replace saved map…',exact:true}).click()
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/recovery-narrow.jpg',import.meta.url)),fullPage:true})
await page.keyboard.press('Escape')
assert.equal(await stored(),raw)
assert.deepEqual(errors,[])
console.log('PASS: exact original download, separate visible backup, invalid/oversize/cancelled imports, paused import and explicit replacement, restore/empty/search/navigation/sample isolation, quota/retry and denied storage, modal focus/cancel, desktop/narrow')
await browser.close()
