import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdirSync, readFileSync } from 'node:fs'
import { createAudit } from '../host/audit.js'
import { hashPassword } from '../host/auth.js'
import { createHost } from '../host/server.js'
import { createSessions } from '../host/sessions.js'
import { openStore } from '../host/store.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const store = openStore(':memory:')
const password = 'admin fixture password'
store.db.prepare("UPDATE auth_config SET viewer_mode='open', admin_hash=?").run(await hashPassword(password))
store.recordDiscovery([{ ip: '192.0.2.12', hostname: 'fixture-device' }])
const audit = createAudit(store.db)
let source = '192.168.1.12'
const calls = []
const server = createHost(store, {
  port: 0, audit, auth: createSessions(store.db, { lan: true, audit }), remoteAddress: () => source,
  discovery: { runOnce: async (options) => calls.push(options), snapshot: () => ({ state: 'idle' }) },
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
try {
  const base = `http://127.0.0.1:${server.address().port}`
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(base)
  await page.getByText('Viewing remotely').waitFor()
  assert.equal(await page.getByRole('link', { name: 'Discovered' }).count(), 0)
  await page.getByRole('button', { name: 'Admin sign in' }).click()
  await page.getByLabel('Admin password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByText('Admin (remote)').waitFor()
  await page.getByRole('link', { name: 'Discovered' }).click()
  await page.getByText('fixture-device').waitFor()
  await page.getByRole('button', { name: 'Scan now' }).click()
  await page.getByText('Scan complete.').waitFor()
  assert.deepEqual(calls, [undefined])
  assert.equal(store.revision(), 0)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  mkdirSync('.tools/evidence/screenshots', { recursive: true })
  await page.screenshot({ path: '.tools/evidence/screenshots/admin-discovery-narrow.png' })
  await page.close()
  source = '127.0.0.1'
  const local = await browser.newPage({ acceptDownloads: true })
  await local.goto(base)
  await local.getByRole('button', { name: 'Access log' }).click()
  const downloadEvent = local.waitForEvent('download')
  await local.getByRole('link', { name: 'Download redacted log' }).click()
  const download = await downloadEvent
  const content = readFileSync(await download.path(), 'utf8')
  assert.equal(download.suggestedFilename(), 'netwatch-access-log.json')
  assert.ok(JSON.parse(content).entries.some((entry) => entry.role === 'admin' && entry.action === 'discovery_scan'))
  assert.doesNotMatch(content, /192\.168\.1\.12|fixture password|csrf/)
  console.log('Admin discovery and redacted audit export browser checks passed over isolated loopback.')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
  store.close()
}
