import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdirSync } from 'node:fs'
import { createHost } from '../host/server.js'
import { openStore } from '../host/store.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const store = openStore(':memory:')
const nodes = [
  ['r', 'Core router', 'router'],
  ['a', 'Access switch', 'switch'],
  ['b', 'Office switch', 'switch'],
].map(([id, label, type], i) => ({ id, type, position: { x: 0, y: 0 }, data: { label, ip: '192.0.2.' + (i + 1) } }))
const port = (name, index) => ({ label: name, index })
const edge = (id, source, target, index, name) => ({
  id,
  source,
  target,
  uplink: {
    label: name,
    source: port('Gi0/' + index, index),
    target: port('Gi1/' + index, index),
  },
})
const edges = [edge('a1', 'r', 'a', 1, 'Primary'), edge('a2', 'r', 'a', 2, 'Backup'), edge('b3', 'a', 'b', 3, 'Office')]
store.write(
  {
    source: 'inventory',
    topology: {
      nodes,
      edges,
      roots: ['r'],
      groups: [{ id: 'g', name: 'Access uplinks', protectedDevice: 'a', links: ['a1', 'a2'] }],
    },
  },
  0,
)
for (const { id } of nodes) {
  const authorization = '00000000-0000-0000-0000-000000000001'
  store.authorizeInterfaces(id, authorization, 1)
  store.appendInterfaces(
    id,
    {
      checkedAt: new Date().toISOString(),
      uptime: 1000,
      interfaces: [1, 2, 3].map((index) => ({
        index,
        name: 'Port ' + index,
        description: '',
        admin: 1,
        oper: id === 'a' && index === 2 ? 2 : 1,
        speedBps: 1000000000,
        discontinuity: null,
        counterBits: null,
        inOctets: null,
        outOctets: null,
      })),
    },
    { revision: 1, authorization },
  )
}
const server = createHost(store, {
  port: 0,
  interfaces: { snapshot: () => ({ state: 'running', freshness: { staleAfterMs: 180000 } }) },
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } })
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.address().port)
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    const map = await page.locator('.health-map').boundingBox()
    assert.ok(map.y <= viewport.height * 0.25, 'The map starts in the first quarter of the viewport')
    assert.ok(map.height >= viewport.height * 0.55, 'The map has a usable height')
  }
  const overview = page.getByRole('region', { name: 'Link and redundancy status' })
  await overview.locator('.link-overview-panel > summary').click()
  await overview.getByText('1 device is running without redundancy', { exact: true }).waitFor()
  await overview.getByText(/3 of 3 links monitored at both ends/).waitFor()
  await page.getByText('View options', { exact: true }).click()
  assert.equal(await page.getByLabel('Map layout', { exact: true }).inputValue(), 'hierarchy')
  await page.getByText('View options', { exact: true }).click()
  const initialMapHeight = (await page.locator('.health-map').boundingBox()).height
  await overview.getByText('Connections (3)', { exact: true }).click()
  assert.equal((await page.locator('.health-map').boundingBox()).height, initialMapHeight)
  assert.equal(await overview.locator('.connection-row').count(), edges.length)
  const mismatch = overview.getByRole('button', { name: /Core router.*Mismatch/ })
  await mismatch.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  assert.ok(
    await mismatch.evaluate(
      (button) => button.matches(':focus-visible') && getComputedStyle(button).outlineStyle !== 'none',
    ),
  )
  await mismatch.press('Enter')
  const detail = page.getByRole('dialog', { name: 'Core router ↔ Access switch' })
  await detail.getByText('1 Gbps', { exact: false }).first().waitFor()
  await page.keyboard.press('Escape')
  await overview.getByText('Connections (3)', { exact: true }).click()
  mkdirSync('.tools/evidence/screenshots', { recursive: true })
  await page.screenshot({ path: '.tools/evidence/screenshots/links-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => scrollTo(0, 0))
  await page.locator('.react-flow__controls-fitview').click()
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.health-node')].some((node) => {
      const box = node.getBoundingClientRect()
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
    }),
  )
  const pane = await page.locator('.health-map .react-flow__pane').boundingBox()
  const viewport = page.locator('.react-flow__viewport')
  const scale = () => viewport.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)
  const beforeWheel = await scale()
  await page.mouse.move(pane.x + pane.width / 2, pane.y + 30)
  await page.mouse.wheel(0, 320)
  await page.waitForFunction(() => scrollY > 0, null, { timeout: 2000 })
  assert.equal(await scale(), beforeWheel)
  await page.evaluate(() => scrollTo(0, 0))
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({ path: '.tools/evidence/screenshots/links-narrow.png' })
  await page.getByRole('link', { name: 'Devices', exact: true }).click()
  await page.reload()
  await page.getByRole('heading', { name: 'Devices', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Details', exact: false }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.goBack()
  await overview.getByText(/running without redundancy/).waitFor()
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 2000 })
  await page.goForward()
  await page.getByRole('heading', { name: 'Devices', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Links-first dashboard browser check passed.')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
  store.close()
}
