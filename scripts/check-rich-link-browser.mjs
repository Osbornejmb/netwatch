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
const started = Date.now() - 5000
for (const { id } of nodes) {
  const authorization = '00000000-0000-0000-0000-000000000001'
  store.authorizeInterfaces(id, authorization, 1)
  for (let i = 0; i <= 3; i++) {
    store.appendInterfaces(
      id,
      {
        checkedAt: new Date(started + i * 1000).toISOString(),
        uptime: 1000 + i,
        interfaces: ports.map((index) => ({
          index,
          name: 'Gi1/' + index,
          description: '',
          admin: 1,
          oper: 1,
          speedBps: 1e9,
          discontinuity: 0,
          counterBits: null,
          inOctets: null,
          outOctets: null,
        })),
        linkEvidence: ports.map((index) => ({
          index,
          stp: 'forwarding',
          aggregateId: 100,
          inErrors: index === 1 ? i : 0,
          outErrors: 0,
          inDiscards: index === 1 ? 10 * i : 0,
          outDiscards: 0,
        })),
      },
      { revision: 1, authorization },
    )
  }
}
const server = createHost(store, {
  port: 0,
  interfaces: { snapshot: () => ({ state: 'running', freshness: { staleAfterMs: 180000 } }) },
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.address().port)
  const overview = page.getByRole('region', { name: 'Link and redundancy status' })
  await overview.locator('.link-overview-panel > summary').click()
  await overview.getByText('Connections (1)', { exact: true }).click()
  await overview.getByText('Bundle · Core router ↔ Access switch · 2 of 2 members up', { exact: true }).click()
  await overview.getByRole('button', { name: /Core router.*Degraded link/ }).press('Enter')
  const details = page.getByRole('dialog', { name: 'Core router ↔ Access switch' })
  await details.getByText('1.00 errors/sec', { exact: false }).first().waitFor()
  await details.getByText('10.00 discards/sec', { exact: false }).first().waitFor()
  await details.getByText('Spanning tree forwarding', { exact: false }).first().waitFor()
  mkdirSync('.tools/evidence/screenshots', { recursive: true })
  await page.screenshot({ path: '.tools/evidence/screenshots/rich-link-desktop.png', animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await details.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1))
  await page.screenshot({ path: '.tools/evidence/screenshots/rich-link-narrow.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await overview.getByText('Device redundancy alerts', { exact: true }).click()
  await overview.getByRole('button', { name: /Access switch.*Running without redundancy/ }).click()
  await page
    .getByRole('dialog', { name: 'Access switch' })
    .getByText('Includes spanning tree and bundle membership', { exact: false })
    .waitFor()
  assert.deepEqual(errors, [])
  console.log('Richer link evidence browser checks passed with synthetic SNMP samples.')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
  store.close()
}
