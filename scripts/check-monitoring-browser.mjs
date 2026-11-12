import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { openStore } from '../host/store.js'
import { createHost } from '../host/server.js'

// Controlled database observations only. No collector, real targets, or existing databases.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const dir = mkdtempSync(join(tmpdir(), 'netwatch-dashboard-'))
const store = openStore(join(dir, 'test.sqlite'))
const topology = { schemaVersion: 1, nodes: [
  { id: 'r', type: 'router', position: { x: 0, y: 0 }, data: { label: 'TEST-ROUTER', ip: '192.0.2.1' } },
  { id: 's', type: 'switch', position: { x: 0, y: 240 }, data: { label: 'TEST-SWITCH', ip: '192.0.2.2' } },
  { id: 'empty', type: 'switch', position: { x: 350, y: 240 }, data: { label: 'NO-ADDRESS', ip: '' } },
], edges: [{ id: 'rs', source: 'r', target: 's' }] }
store.write({ source: 'inventory', topology, monitoring: { r: true, s: true } }, 0)
const append = (id, status, time = Date.now()) => store.append([{ deviceId: id, status, checkedAt: new Date(time).toISOString(), outcome: status === 'up' ? 'reachable' : 'unreachable', reason: 'controlled-test', latencyMs: status === 'up' ? 4 : null }])
for (let i = 30; i > 0; i--) append('r', i % 2 ? 'up' : 'down', Date.now() - i * 1000)
append('r', 'up'); append('s', 'up')
let staleAfterMs = 90000
const server = createHost(store, { port: 0, collector: { snapshot: () => ({ state: 'disabled', freshness: { staleAfterMs } }) } })
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(12000)
const errors = []; page.on('pageerror', error => errors.push(error.message))
const base = `http://127.0.0.1:${server.address().port}`
const node = id => page.locator(`.react-flow__node[data-id="${id}"]`)
const refresh = () => page.getByRole('button', { name: 'Refresh host', exact: true }).click()
const status = async (id, value) => { await node(id).locator(`.health-node-${value}`).waitFor() }
const inspect = async id => { await node(id).focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor() }
const close = () => page.keyboard.press('Escape')
mkdirSync('docs/screenshots', { recursive: true })
try {
  await page.goto(base)
  await status('r', 'up'); await status('s', 'up')
  assert.equal(await page.locator('.react-flow__node').count(), 3)
  await page.getByText('View options', { exact: true }).click()
  await page.getByLabel('Device status filter').selectOption('down')
  assert.equal(await node('r').isVisible(), false)
  await page.getByLabel('Device status filter').selectOption('all')
  await page.getByText('View options', { exact: true }).click()
  await inspect('r')
  await page.getByText('Recent history', { exact: true }).click()
  await page.getByRole('region', { name: 'Recent device history' }).locator('li').nth(24).waitFor()
  await page.getByRole('button', { name: 'Load older checks' }).click()
  await page.getByRole('region', { name: 'Recent device history' }).locator('li').nth(30).waitFor()
  assert.match(await page.locator('.health-history').innerText(), /up → down|down → up/)
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.getByRole('button', { name: 'Refresh history' }).evaluate(el => el === document.activeElement), true)
  await close()
  append('r', 'down'); await refresh(); await status('r', 'down'); await status('s', 'up')
  assert.equal(await page.locator('.react-flow__edge.health-path-down').count(), 1)
  await page.screenshot({ path: 'docs/screenshots/monitoring-desktop.png' })
  // Preserve observations and let the UI clock age them without a successful response.
  staleAfterMs = 1000; await refresh()
  await page.getByText(/Last update:/).first().waitFor()
  await page.route('**/api/v1/snapshot', route => route.abort())
  await refresh(); await page.getByText(/Host disconnected/).first().waitFor()
  await status('r', 'stale'); await status('s', 'stale')
  await page.screenshot({ path: 'docs/screenshots/monitoring-disconnected.png' })
  await page.unroute('**/api/v1/snapshot'); staleAfterMs = 90000
  append('r', 'up'); append('s', 'up'); await refresh(); await status('r', 'up')
  await inspect('r'); await page.getByRole('button', { name: 'Disable monitoring', exact: true }).click()
  await page.getByRole('button', { name: 'Enable monitoring', exact: true }).waitFor()
  assert.equal(store.read().monitoring.r, false)
  await page.getByRole('button', { name: 'Enable monitoring', exact: true }).click()
  await page.getByRole('button', { name: 'Disable monitoring', exact: true }).waitFor()
  assert.equal(store.read().monitoring.r, true)
  // Concurrent writes surface validation/conflict feedback and preserve the winner.
  store.write({ source: 'inventory', ...store.read() }, store.read().revision)
  await page.getByRole('button', { name: 'Disable monitoring', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Saved devices changed' }).waitFor()
  assert.equal(store.read().monitoring.r, true)
  await close(); await refresh()
  await inspect('empty'); assert.equal(await page.getByRole('button', { name: 'Enable monitoring', exact: true }).isDisabled(), true); await close()
  const revision = store.read().revision
  await page.getByRole('button', { name: 'Preview sample statuses' }).click()
  assert.equal(await page.getByRole('button', { name: /monitoring$/ }).count(), 0)
  assert.equal(store.read().revision, revision)
  await page.getByRole('button', { name: 'Return to my network' }).click(); await status('r', 'up')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  await inspect('r'); await page.screenshot({ path: 'docs/screenshots/monitoring-narrow.png' }); await close()
  store.write({ source: 'inventory', topology: { ...topology, nodes: topology.nodes.filter(n => n.id !== 'r'), edges: [] }, monitoring: { s: true } }, store.read().revision)
  await refresh(); await node('r').waitFor({ state: 'detached' })
  store.write({ source: 'inventory', topology: { schemaVersion: 1, nodes: [], edges: [] } }, store.read().revision)
  await refresh(); await page.getByText('Your network map starts here').waitFor()
  assert.deepEqual(errors, [])
  writeFileSync('docs/monitoring-results.json', JSON.stringify({ verifiedAt: new Date().toISOString(), platform: process.platform, controlledObservations: true, probes: 0, checks: ['host inventory source', 'filter counts', 'keyboard details and focus trap', 'history pagination and transitions', 'independent failure and recovery', 'disconnect, clock-driven stale, reconnect', 'explicit monitoring disable/enable', 'revision conflict', 'missing address', 'sample isolation', '390px overflow and details', 'deleted device and empty host'], screenshots: ['monitoring-desktop.png', 'monitoring-disconnected.png', 'monitoring-narrow.png'], pageErrors: errors }, null, 2) + '\n')
  console.log('Controlled monitoring browser checks passed; no probes or existing data used.')
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true })
}
