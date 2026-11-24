import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createHost } from '../host/server.js'
import { openStore } from '../host/store.js'
import { crawlLimits, createTopologyDiscovery, discoveryScope } from '../host/topology-discovery.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const store = openStore(':memory:')
const key = (i) => 'mac:02:00:00:00:00:0' + i
const node = (id, type, last) => ({
  id,
  type,
  position: { x: last * 20, y: 0 },
  data: { label: id, ip: '192.168.9.' + last },
})
const nodes = [node('Router', 'router', 1), node('Access switch', 'switch', 2)]
store.write({ source: 'inventory', topology: { nodes, edges: [] } }, 0)
for (const { id } of nodes) store.authorizeInterfaces(id, '00000000-0000-0000-0000-000000000001', 1)
const discovery = createTopologyDiscovery(store, {
  allowed: discoveryScope({ interfaces: {}, additional: '192.168.9.0/24' }),
  limits: { ...crawlLimits, spacingMs: 0 },
  async read(id) {
    const router = id === 'Router'
    return {
      checkedAt: new Date().toISOString(),
      chassisKey: key(router ? 1 : 2),
      name: id,
      state: 'current',
      neighbors: [
        {
          chassisKey: key(router ? 2 : 1),
          name: router ? 'Access switch' : 'Router',
          type: router ? 'switch' : 'router',
          addresses: ['192.168.9.' + (router ? 2 : 1)],
          localPort: { index: router ? 1 : 2, label: router ? 'port 1' : 'port 2' },
          peerPort: { index: null, label: router ? 'port 2' : 'port 1' },
        },
      ],
    }
  },
})
const server = createHost(store, { port: 0, topologyDiscovery: discovery })
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(12000)
  await page.goto('http://127.0.0.1:' + server.address().port)
  await page.getByRole('link', { name: 'Discovered', exact: true }).click()
  assert.equal(await page.getByLabel('Manual start device').count(), 0)
  assert.equal(await page.locator('.topology-proposals').evaluate((panel) => panel.open), false)
  const scheduleToggle = page.getByRole('checkbox', { name: 'Run automatically' })
  await scheduleToggle.check()
  await page.locator('select[name="discoverySeed"]').selectOption('Router')
  await page.locator('input[name="interval"]').fill('60')
  await page.getByRole('button', { name: 'Save schedule' }).click()
  await page.getByRole('status').getByText('Discovery schedule saved.').waitFor()
  assert.deepEqual(store.dynamics.schedule(), { seedId: 'Router', intervalMinutes: 60 })
  await page.locator('.topology-proposals > summary').click()
  await page.route('**/api/v1/discovery/runs', (route) => route.abort(), { times: 1 })
  await page.getByText('Could not refresh topology discovery. Showing the last results.').waitFor()
  await discovery.start('Router')
  await page.getByRole('status').getByText(/Discovery complete · 1 connections to review/).waitFor()
  await page.locator('.topology-proposals > summary').click()
  await scheduleToggle.uncheck()
  await page.getByRole('button', { name: 'Save schedule' }).click()
  await page.waitForFunction(() => document.querySelector('button[type="submit"]').disabled === false)
  assert.equal(store.dynamics.schedule().intervalMinutes, 0)
  await page.locator('.topology-proposals > summary').click()
  await page.getByLabel('Manual start device').selectOption('Router')
  await page.getByRole('button', { name: 'Find connections' }).click()
  await page
    .getByRole('status')
    .getByText(/Discovery complete · 1 connections to review/)
    .waitFor()
  assert.equal(store.revision(), 1)
  const proposals = page.getByRole('region', { name: 'Topology proposals' })
  await proposals.getByRole('button', { name: 'Review all verified' }).click()
  const preview = page.getByRole('dialog', { name: 'Add to draft map?' })
  await preview
    .getByText(/Router \(port 1\).*Access switch \(port 2\)|Access switch \(port 2\).*Router \(port 1\)/)
    .waitFor()
  const writeDraft = await page.evaluateHandle(() => Storage.prototype.setItem)
  await page.evaluate(() => {
    const write = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'netwatch-topology-v1' && JSON.parse(value).edges.length)
        throw new DOMException('Fixture quota failure', 'QuotaExceededError')
      return write.call(this, key, value)
    }
  })
  await preview.getByRole('button', { name: 'Add to draft', exact: true }).click()
  await preview.getByRole('alert').getByText('Could not save the draft map. Check browser storage and try again.').waitFor({ timeout: 3000 })
  assert.equal(discovery.latest().links[0].status, 'proposed')
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('netwatch-topology-v1')).edges.length), 0)
  await page.evaluate((write) => { Storage.prototype.setItem = write }, writeDraft)
  await writeDraft.dispose()
  await page.route('**/api/v1/discovery/runs/*/accept', async (route) => {
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('netwatch-topology-v1')))
    assert.equal(draft.edges.length, 1, 'Draft must be durable before the host records acceptance')
    const response = await route.fetch()
    assert.ok(response.ok())
    await route.abort()
  }, { times: 1 })
  await preview.getByRole('button', { name: 'Add to draft', exact: true }).click()
  await proposals.getByText('The draft map was saved. Could not confirm the proposal with the host.').waitFor()
  assert.equal(discovery.latest().links[0].status, 'accepted')
  assert.equal(store.revision(), 1)
  assert.equal(store.read().topology.edges.length, 0)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.reload()
  await page.getByRole('link', { name: 'Edit map', exact: true }).click()
  await page.getByText(/2 devices · 1 connection/).waitFor()
  await page.getByRole('button', { name: 'Use this map', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm replacement' }).click()
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  const saved = store.read()
  assert.equal(saved.revision, 2)
  assert.equal(saved.topology.edges.length, 1)
  assert.deepEqual(Object.values(saved.monitoring), [false, false])
  assert.deepEqual(errors, [])
  console.log('Topology discovery browser walkthrough passed with synthetic SNMP evidence.')
} finally {
  await browser.close()
  await discovery.stop()
  await new Promise((resolve) => server.close(resolve))
  store.close()
}
