import { validateTopology } from '../src/topology.js'
import { createScaleNetwork } from '../tests/fixtures/scale-network.js'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })
// Mixed observations are injected only into Vite's served sample generator.
// Production App and storage still have no observation source. Measure this
// as a development-server QA run, not as a production capacity benchmark.
const url = process.env.NETWATCH_SCALE_URL || 'http://127.0.0.1:5173'
const initial = createScaleNetwork(Date.now())
const topology = validateTopology(initial)
const serialized = JSON.stringify(topology)
const errors = []
const cgroup = async name => { try { return (await readFile(`/sys/fs/cgroup/${name}`, 'utf8')).trim() } catch { return 'unavailable' } }
const report = { observedAt: new Date().toISOString(), mode: 'Vite development-server QA (not production capacity)', fixture: { nodes: 100, edges: 180, mixedCounts: { all:100, up:70, down:10, stale:10, unknown:10 } }, browser: await browser.version(), machine: { platform: os.platform(), arch: os.arch(), cpuModel: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGiB: Math.round(os.totalmem()/1024**3), runnerNode: process.version, cpuMax: await cgroup('cpu.max'), memoryMaxBytes: await cgroup('memory.max'), scope: 'Shared managed cloud executor; host resources are not dedicated allocations' }, runs: [] }
for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  const context = await browser.newContext({ viewport })
  await context.addInitScript(value => localStorage.setItem('netwatch-topology-v1', value), serialized)
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  let injected = false
  await page.route('**/src/health.js*', async route => {
    const response = await route.fetch()
    const source = await response.text()
    const body = source.replace('export function createSampleNetwork(now) {', `export function createSampleNetwork(now) { return (${createScaleNetwork.toString()})(now);`)
    assert.notEqual(body, source, 'Sample generator interception must match the current source')
    injected = true
    await route.fulfill({ response, body })
  })
  const started = performance.now()
  await page.goto(url)
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 100 && [...document.querySelectorAll('.react-flow__node')].every(node => getComputedStyle(node).visibility === 'visible'))
  const run = {viewport, initialUnknownRenderMs: Math.round(performance.now()-started), filters:[]}
  report.runs.push(run)
  assert.ok(injected)
  assert.equal(await page.locator('table,.sidebar,.health-stats').count(),0)
  const initialBounds = await page.evaluate(() => {
    const map = document.querySelector('.health-map').getBoundingClientRect()
    const nodes = [...document.querySelectorAll('.react-flow__node')].map(node=>node.getBoundingClientRect())
    return { outside: nodes.filter(node=>node.left<map.left-1||node.right>map.right+1||node.top<map.top-1||node.bottom>map.bottom+1).length, map:{width:map.width,height:map.height}, minLabelPx: Math.min(...[...document.querySelectorAll('.health-node>strong')].map(node=>parseFloat(getComputedStyle(node).fontSize)*node.getBoundingClientRect().width/node.offsetWidth)) }
  })
  run.initialBounds=initialBounds
  console.log(JSON.stringify({viewport,initialBounds,initialUnknownRenderMs:run.initialUnknownRenderMs}))
  assert.equal(initialBounds.outside,0,'Default full map must fit all 100 devices')
  const stored=()=>page.evaluate(()=>localStorage.getItem('netwatch-topology-v1'))
  assert.equal(await stored(),serialized)
  const view=page.locator('.health-view-options summary')
  await view.click()
  assert.match(await page.locator('option[value=unknown]').textContent(),/100/)
  await view.click()
  const sampleStarted=performance.now()
  await page.getByRole('button',{name:'Preview sample statuses'}).click()
  await page.locator('.health-node-down').first().waitFor()
  run.mixedSampleRenderMs=Math.round(performance.now()-sampleStarted)
  assert.equal(await page.locator('.health-node-down').count(),10)
  assert.equal(await page.locator('.health-node-stale').count(),10)
  await view.click()
  const counts=async()=>page.locator('.health-filter option').allTextContents()
  const baseline=await counts()
  assert.deepEqual(baseline.map(text=>Number(text.match(/\((\d+)\)/)[1])),[100,70,10,10,10])
  for(const [status,expected] of [['down',10],['stale',10],['unknown',10],['up',70],['all',100]]) {
    const start=performance.now()
    await page.getByLabel('Device status filter').selectOption(status)
    await page.waitForFunction(count=>document.querySelectorAll('.react-flow__node').length===count,expected)
    const expectedIds=new Set(initial.nodes.filter((node,index)=>status==='all'||(['down','stale','unknown'][index%10]||'up')===status).map(node=>node.id))
    const expectedEdges=initial.edges.filter(edge=>expectedIds.has(edge.source)&&expectedIds.has(edge.target)).map(edge=>edge.id).sort()
    await page.waitForFunction(count=>document.querySelectorAll('.react-flow__edge').length===count,expectedEdges.length)
    run.filters.push({status,ms:Math.round(performance.now()-start)})
    assert.deepEqual((await page.locator('.react-flow__edge').evaluateAll(edges=>edges.map(edge=>edge.dataset.id))).sort(),expectedEdges)
    assert.deepEqual(await counts(),baseline)
    const valid=await page.evaluate(edges=>{
      const definitions=new Map(edges.map(edge=>[edge.id,edge]))
      const visible=new Set([...document.querySelectorAll('.react-flow__node')].map(node=>node.dataset.id))
      return [...document.querySelectorAll('.react-flow__edge')].every(edge=>{
        const definition=definitions.get(edge.dataset.id)
        return definition && visible.has(definition.source) && visible.has(definition.target)
      })
    },initial.edges)
    assert.ok(valid,'Every filtered edge must retain both visible endpoints')
  }
  const searchStart=performance.now()
  await page.getByLabel('Search dashboard devices').fill('QA-SWITCH-055')
  await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===1)
  run.searchMs=Math.round(performance.now()-searchStart)
  assert.deepEqual(await counts(),baseline)
  await view.click()
  await page.locator('.react-flow__controls-fitview').click()
  await page.waitForFunction(()=>{
    const node=document.querySelector('.health-node>strong')
    return node && parseFloat(getComputedStyle(node).fontSize)*node.getBoundingClientRect().width/node.offsetWidth>=12
  })
  const readablePx=await page.locator('.health-node>strong').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)*node.getBoundingClientRect().width/node.offsetWidth)
  assert.ok(readablePx>=12,'Focused label must be readable at fit zoom')
  run.focusedLabelPx=Math.round(readablePx*10)/10
  await page.screenshot({path:fileURLToPath(new URL(`../docs/screenshots/scale-${viewport.width}-readable.jpg`,import.meta.url))})
  await view.click()
  await page.getByLabel('Search dashboard devices').fill('no-such-device')
  assert.ok(await page.getByText('No matching devices',{exact:true}).isVisible())
  await page.getByRole('button',{name:'Clear filters'}).click()
  await page.getByLabel('Device status filter').selectOption('down')
  await view.click()
  await page.locator('.react-flow__controls-fitview').click()
  const failed=page.locator('.react-flow__node[data-id="core-a"]')
  await failed.focus(); await page.keyboard.press('Enter')
  const popup=page.getByRole('dialog',{name:'QA-ROUTER-001',exact:true})
  await popup.waitFor()
  assert.match(await popup.innerText(),/Down/)
  await page.screenshot({path:fileURLToPath(new URL(`../docs/screenshots/scale-${viewport.width}-inspection.jpg`,import.meta.url))})
  await page.keyboard.press('Escape')
  await view.click()
  await page.getByLabel('Device status filter').selectOption('all')
  await view.click()
  await page.locator('.react-flow__controls-fitview').click()
  const before=await page.locator('.react-flow__viewport').getAttribute('style')
  await page.locator('.react-flow__controls-zoomin').click()
  await page.waitForFunction(style=>document.querySelector('.react-flow__viewport').getAttribute('style')!==style,before)
  const panPoint=await page.evaluate(()=>{
    const box=document.querySelector('.health-map').getBoundingClientRect()
    for(let y=box.top+25;y<box.bottom-80;y+=37) for(let x=box.left+25;x<box.right-80;x+=37) {
      if(document.elementFromPoint(x,y)?.classList.contains('react-flow__pane')) return {x,y}
    }
    throw Error('No clear canvas point for pan test')
  })
  const beforePan=await page.locator('.react-flow__viewport').getAttribute('style')
  await page.mouse.move(panPoint.x,panPoint.y);await page.mouse.down();await page.mouse.move(panPoint.x+55,panPoint.y+45,{steps:8});await page.mouse.up()
  await page.waitForFunction(style=>document.querySelector('.react-flow__viewport').getAttribute('style')!==style,beforePan)
  await page.locator('.react-flow__controls-fitview').click()
  await page.screenshot({path:fileURLToPath(new URL(`../docs/screenshots/scale-${viewport.width}-overview.jpg`,import.meta.url))})
  await page.getByRole('link',{name:'Device inventory',exact:true}).click()
  await view.click()
  await page.getByLabel('Device status filter').selectOption('stale')
  assert.equal(await page.locator('tbody tr').count(),10)
  await view.click()
  const inspect=page.getByRole('button',{name:'View details for QA-SWITCH-002',exact:true})
  await inspect.focus();await page.keyboard.press('Enter')
  await page.getByRole('dialog',{name:'QA-SWITCH-002',exact:true}).waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await inspect.evaluate(e=>e===document.activeElement),true)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  assert.equal(await stored(),serialized,'Synthetic checks and map positions must never be saved')
  await context.close()
}
// Separate empty inventory context, without changing any real browser workspace.
const empty=await browser.newContext()
await empty.addInitScript(()=>localStorage.setItem('netwatch-topology-v1',JSON.stringify({nodes:[],edges:[]})))
const page=await empty.newPage();await page.goto(url)
assert.ok(await page.getByText('Your network map starts here',{exact:true}).isVisible())
await empty.close()
assert.deepEqual(errors,[])
await writeFile(fileURLToPath(new URL('../docs/scale-results.json',import.meta.url)),JSON.stringify(report,null,2)+'\n')
console.log('PASS: 100 devices/180 links, full-view default, unknown/multiple-down/stale/empty states, stable counts, filtered-edge endpoints, search, pan/zoom/fit, keyboard inspection, viewport bounds and sample/storage isolation')
await browser.close()
