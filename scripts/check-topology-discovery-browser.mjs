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
const infrastructureOnly = process.env.NETWATCH_TEST_INFRASTRUCTURE_ONLY === '1'
const cdpOnly = process.env.NETWATCH_TEST_CDP_ONLY === '1'
const inventoryNodes = infrastructureOnly ? [...nodes, node('Office printer', 'printer', 3)] : nodes
store.write({ source: 'inventory', topology: { nodes: inventoryNodes, edges: [] } }, 0)
for (const { id } of nodes) store.authorizeInterfaces(id, '00000000-0000-0000-0000-000000000001', 1)
const discovery = createTopologyDiscovery(store, {
  allowed: discoveryScope({ interfaces: {}, additional: '192.168.9.0/24' }),
  limits: { ...crawlLimits, spacingMs: 0 },
  async read(id) {
    const router = id === 'Router'
    if (cdpOnly)
      return {
        checkedAt: new Date().toISOString(),
        state: 'identity_unavailable',
        neighbors: [],
        cdp: [
          {
            index: router ? 1 : 2,
            address: '192.168.9.' + (router ? 2 : 1),
            device: 'Switch',
            localPort: { index: router ? 1 : 2, label: router ? 'port 1' : 'port 2' },
            peerPort: router ? 'port 2' : 'port 1',
          },
          ...(router
            ? [
                {
                  index: 3,
                  address: '192.168.9.4',
                  device: 'Unenrolled switch',
                  capabilities: '00000008',
                  localPort: { index: 3, label: 'Fa1/0/11' },
                  peerPort: 'Fa1/0/12',
                },
              ]
            : []),
        ],
      }
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
const server = createHost(store, { port: 0, topologyDiscovery: discovery, infrastructureOnly })
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(12000)
  await page.goto('http://127.0.0.1:' + server.address().port)
  if (infrastructureOnly) {
    await page.locator('.react-flow__node[data-id="Router"]').waitFor()
    assert.equal(await page.locator('.react-flow__node[data-id="Office printer"]').count(), 0)
    if (process.env.NETWATCH_TEST_SCREENSHOTS === '1')
      await page.screenshot({ path: 'docs/screenshots/router-switch-dashboard.png' })
    await page.getByRole('link', { name: 'Devices', exact: true }).click()
    await page.getByText('Access switch', { exact: true }).first().waitFor()
    assert.equal(await page.getByText('Office printer', { exact: true }).count(), 0)
  }
  await page.getByRole('link', { name: 'Discovered', exact: true }).click()
  if (infrastructureOnly) {
    await page.getByText(/Router and switch mode is on/).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Scan now' }).count(), 0)
  }
  assert.equal(await page.getByLabel('Start device').count(), 0)
  await page.locator('.topology-proposals > summary').click()
  await page.getByText('Scheduled discovery · Off', { exact: true }).click()
  await page.locator('select[name="discoverySeed"]').selectOption('Router')
  await page.locator('input[name="interval"]').fill('60')
  await page.getByRole('button', { name: 'Save schedule' }).click()
  await page.getByText('Scheduled discovery · On', { exact: true }).waitFor()
  assert.deepEqual(store.dynamics.schedule(), { seedId: 'Router', intervalMinutes: 60 })
  await page.getByText('Scheduled discovery · On', { exact: true }).click()
  await page.getByLabel('Start device').selectOption('Router')
  await page.getByRole('button', { name: 'Find connections' }).click()
  await page
    .getByRole('status')
    .getByText(
      cdpOnly ? /Discovery complete · 2 connections to review/ : /Discovery complete · 1 connections to review/,
    )
    .waitFor()
  if (cdpOnly) await page.getByText(/Unenrolled switch \(Fa1\/0\/12\).*One-sided.*CDP/).waitFor()
  if (cdpOnly && process.env.NETWATCH_TEST_SCREENSHOTS === '1')
    await page.screenshot({ path: 'docs/screenshots/cdp-topology-discovery.png' })
  assert.equal(store.revision(), 1)
  const proposals = page.getByRole('region', { name: 'Topology proposals' })
  await proposals.getByRole('button', { name: 'Review all verified' }).click()
  const preview = page.getByRole('dialog', { name: 'Add to draft map?' })
  await preview
    .getByText(/Router \(port 1\).*Access switch \(port 2\)|Access switch \(port 2\).*Router \(port 1\)/)
    .waitFor()
  await preview.getByRole('button', { name: 'Add to draft', exact: true }).click()
  await proposals.getByText('Added to the draft map. Review it in Edit map.').waitFor()
  assert.equal(store.revision(), 1)
  assert.equal(store.read().topology.edges.length, 0)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  if (infrastructureOnly && !cdpOnly && process.env.NETWATCH_TEST_SCREENSHOTS === '1')
    await page.screenshot({ path: 'docs/screenshots/router-switch-discovery.png' })
  await page.getByRole('link', { name: 'Edit map', exact: true }).click()
  await page.getByRole('button', { name: 'Use this map', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm replacement' }).click()
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  const saved = store.read()
  assert.equal(saved.revision, 2)
  assert.equal(saved.topology.edges.length, 1)
  if (cdpOnly) {
    assert.equal(saved.topology.edges[0].label, 'CDP')
    assert.ok(saved.topology.nodes.every((node) => !node.chassisKey))
  }
  assert.equal(saved.topology.nodes.length, inventoryNodes.length)
  assert.deepEqual(
    Object.values(saved.monitoring),
    inventoryNodes.map(() => false),
  )
  assert.deepEqual(errors, [])
  console.log('Topology discovery browser walkthrough passed with synthetic SNMP evidence.')
} finally {
  await browser.close()
  await discovery.stop()
  await new Promise((resolve) => server.close(resolve))
  store.close()
}
