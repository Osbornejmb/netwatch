import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createHost } from '../host/server.js'
import { openStore } from '../host/store.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const store = openStore(':memory:')
const node = (id, type, ip) => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, ip } })
store.write(
  {
    source: 'inventory',
    topology: {
      schemaVersion: 1,
      nodes: [
        node('Router A', 'router', '192.0.2.1'),
        node('Router B', 'router', '192.0.2.2'),
        node('Switch', 'switch', '192.0.2.3'),
      ],
      edges: [
        { id: 'a', source: 'Router A', target: 'Switch', label: 'LLDP · Existing link' },
        { id: 'b', source: 'Router B', target: 'Switch' },
      ],
    },
  },
  0,
)
const server = createHost(store, {
  port: 0,
  interfaces: { snapshot: () => ({ state: 'running', freshness: { staleAfterMs: 180000 } }) },
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.setDefaultTimeout(12000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.getByRole('link', { name: 'Edit map', exact: true }).click()
  await page.getByRole('button', { name: 'Load saved map', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm replacement' }).click()
  await page.getByText('Uplinks & redundancy', { exact: true }).click()
  const editor = page.getByRole('region', { name: 'Uplinks and redundancy' })
  for (const [id, label] of [
    ['a', 'Primary'],
    ['b', 'Backup'],
  ]) {
    await editor.getByLabel('Connection', { exact: true }).selectOption(id)
    await editor.getByLabel('Uplink label').fill(label)
    const indexes = editor.getByLabel('Interface index')
    await indexes.nth(0).fill('1')
    await indexes.nth(1).fill(id === 'a' ? '1' : '2')
    await editor.getByRole('button', { name: 'Save uplink' }).click()
  }
  await editor.getByLabel('Group name').fill('WAN uplinks')
  await editor.getByLabel('Connections').selectOption(['a', 'b'])
  await editor.getByRole('button', { name: 'Save group' }).click()
  await editor.getByRole('status').getByText('Group saved to draft.').waitFor()
  await page.getByRole('button', { name: 'Use this map', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm replacement' }).click()
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  const { revision, topology } = store.read()
  assert.equal(topology.edges[0].label, 'LLDP · Existing link')
  assert.equal(topology.edges[1].uplink.target.index, 2)
  assert.equal(topology.groups[0].name, 'WAN uplinks')
  await page.getByRole('link', { name: 'Network dashboard' }).click()
  await page.getByText('Redundancy groups (1)', { exact: true }).click()
  await page.getByText('WAN uplinks · Unknown').waitFor()
  const time = Date.now() - 1000
  const port = (index, oper) => ({
    index,
    name: '',
    description: '',
    admin: 1,
    oper,
    speedBps: null,
    discontinuity: null,
    counterBits: null,
    inOctets: null,
    outOctets: null,
  })
  const authorizations = new Map()
  for (const device of topology.nodes) {
    const key = randomUUID()
    store.authorizeInterfaces(device.id, key, revision)
    authorizations.set(device.id, key)
  }
  const sample = (id, offset, ports) =>
    store.appendInterfaces(
      id,
      {
        checkedAt: new Date(time + offset).toISOString(),
        uptime: 100,
        interfaces: ports,
      },
      { revision, authorization: authorizations.get(id) },
    )
  sample('Router A', 0, [port(1, 1)])
  sample('Router B', 0, [port(1, 1)])
  sample('Switch', 0, [port(1, 1), port(2, 2)])
  await page.getByText('WAN uplinks · Degraded').waitFor()
  sample('Switch', 1, [port(1, 1), port(2, 1)])
  await page.getByText('WAN uplinks · Available').waitFor()
  mkdirSync('.tools/evidence/screenshots', { recursive: true })
  await page.screenshot({ path: '.tools/evidence/screenshots/uplinks-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.react-flow__controls-fitview').click()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: '.tools/evidence/screenshots/uplinks-narrow.png' })
  await page.getByRole('link', { name: 'Edit map', exact: true }).click()
  if (!(await editor.isVisible())) await page.getByText('Uplinks & redundancy', { exact: true }).click()
  await editor.getByLabel('Connection', { exact: true }).selectOption('a')
  await editor.getByLabel('Uplink label').fill('Parallel')
  await editor.getByLabel('Interface index').nth(0).fill('3')
  await editor.getByLabel('Interface index').nth(1).fill('3')
  await editor.getByLabel('Link role').selectOption('uplink')
  await editor.getByRole('button', { name: 'Add parallel link' }).click()
  const parallel = await editor.getByLabel('Connection', { exact: true }).inputValue()
  assert.notEqual(parallel, 'a')
  await editor.getByLabel('Root routers').selectOption(['Router A', 'Router B'])
  await editor.getByRole('button', { name: 'Save roots' }).click()
  await editor.getByLabel('Group', { exact: true }).selectOption('')
  await editor.getByLabel('Group name').fill('Reviewed baseline')
  await editor.getByLabel('Protected device').selectOption('Switch')
  await editor.getByLabel('Connections').selectOption(['a', parallel])
  await editor.getByRole('button', { name: 'Save group' }).click()
  await page.getByRole('button', { name: 'Use this map', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm replacement' }).click()
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  const updated = store.read().topology
  assert.equal(updated.schemaVersion, 2)
  assert.deepEqual(updated.roots, ['Router A', 'Router B'])
  assert.equal(updated.edges.find(({ id }) => id === parallel)?.role, 'uplink')
  assert.deepEqual(new Set(updated.groups.find(({ name }) => name === 'Reviewed baseline')?.links), new Set(['a', parallel]))
  assert.equal(updated.groups.find(({ name }) => name === 'WAN uplinks')?.protectedDevice, undefined)
  await page.reload()
  await page.getByText('Uplinks & redundancy', { exact: true }).click()
  await editor.getByLabel('Group', { exact: true }).getByRole('option', { name: 'Reviewed baseline' }).waitFor({ state: 'attached' })
  assert.deepEqual(errors, [])
  console.log('Uplink and redundancy browser checks passed with fixture-only port evidence.')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
  store.close()
}
