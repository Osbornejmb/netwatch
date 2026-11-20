import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdirSync } from 'node:fs'
import { createHost } from '../host/server.js'
import { openStore } from '../host/store.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const store = openStore(':memory:')
const nodes = ['Core router', 'Access switch'].map((label, i) => ({
  id: String(i),
  type: i ? 'switch' : 'router',
  position: { x: 0, y: 0 },
  data: { label, ip: '192.0.2.' + (i + 1) },
}))
const ports = [1, 2]
const edges = ports.map((index) => ({
  id: 'member-' + index,
  source: '0',
  target: '1',
  uplink: {
    label: 'Access uplink ' + index,
    source: { label: 'Gi0/' + index, index },
    target: { label: 'Gi1/' + index, index },
  },
}))
store.write(
  {
    source: 'inventory',
    topology: {
      nodes,
      edges,
      roots: ['0'],
      groups: [{ id: 'access', name: 'Access uplinks', protectedDevice: '1', links: edges.map(({ id }) => id) }],
    },
  },
  0,
)
const topology = store.read().topology
store.dynamics.observe(topology, {
  links: [],
  redundancy: [{ deviceId: '1', state: 'isolated' }],
})
const server = createHost(store, { port: 0 })
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.address().port)
  const overview = page.getByRole('region', { name: 'Link and redundancy status' })
  await overview.locator(".link-overview-panel > summary").click()
  await overview.getByText('Map tools', { exact: true }).waitFor()
  assert.equal(await overview.getByText('Redundancy incidents (1 open)', { exact: true }).isVisible(), false)
  await overview.getByText('Map tools', { exact: true }).click()
  await overview.getByText('Redundancy incidents (1 open)', { exact: true }).click()
  await overview.getByRole('button', { name: 'Access switch · Isolated', exact: true }).waitFor()
  await overview.getByText('Estimate a failure', { exact: true }).click()
  await overview.getByLabel('Device to fail').selectOption('0')
  await overview.getByText(/Estimated isolated: Access switch/).waitFor()
  await overview.getByLabel('Failure type').selectOption('link')
  await overview.getByLabel('Link to fail').selectOption('member-1')
  await overview.getByText(/No additional devices isolated/).waitFor()
  mkdirSync('.tools/evidence/screenshots', { recursive: true })
  await page.screenshot({ path: '.tools/evidence/screenshots/dynamics-desktop.png', animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await overview.evaluate((entry) => entry.scrollWidth <= entry.clientWidth + 1))
  await page.screenshot({ path: '.tools/evidence/screenshots/dynamics-narrow.png', animations: 'disabled' })
  assert.deepEqual(errors, [])
  console.log('Topology dynamics browser checks passed with synthetic evidence.')
} finally {
  await browser.close()
  server.close()
  store.close()
}
