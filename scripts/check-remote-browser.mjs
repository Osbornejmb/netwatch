import assert from 'node:assert/strict'

const { NETWATCH_URL, NETWATCH_VIEWER_PASSWORD, NETWATCH_ADMIN_PASSWORD } = process.env
if (!NETWATCH_URL || !NETWATCH_ADMIN_PASSWORD)
  throw new Error('Set NETWATCH_URL to a test LAN host and NETWATCH_ADMIN_PASSWORD. Set NETWATCH_VIEWER_PASSWORD for password mode.')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } })
  const page = await context.newPage()
  await page.goto(NETWATCH_URL)
  if (NETWATCH_VIEWER_PASSWORD) {
    await page.getByLabel('Viewer password').fill(NETWATCH_VIEWER_PASSWORD)
    await page.getByRole('button', { name: 'View dashboard' }).click()
  }
  await page.getByText('Viewing remotely', { exact: true }).waitFor()
  for (const hash of ['topology', 'inventory', 'discovered']) {
    await page.evaluate((value) => { location.hash = value }, hash)
    await page.waitForURL('**/#dashboard')
  }
  for (const name of ['Edit map', 'Devices', 'Discovered']) assert.equal(await page.getByRole('link', { name, exact: true }).count(), 0)
  const api = new URL('/api/v1/', NETWATCH_URL)
  const url = (name) => new URL(name, api).href
  assert.equal((await context.request.put(url('topology'), { data: {} })).status(), 403)
  assert.equal((await context.request.post(url('discovered/clear'))).status(), 403)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  await page.setViewportSize({ width: 1200, height: 800 })

  await page.getByRole('button', { name: 'Admin sign in' }).click()
  await page.getByLabel('Admin password').fill(NETWATCH_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByText('Admin (remote)', { exact: true }).waitFor()
  await page.getByRole('link', { name: 'Edit map', exact: true }).click()
  await page.getByRole('heading', { name: 'Edit your map' }).waitFor()
  const inventory = await context.request.get(url('topology')).then((response) => response.json())
  const session = await context.request.get(url('auth/session')).then((response) => response.json())
  const applied = await context.request.put(url('topology'), {
    headers: { 'X-NetWatch-Write': session.csrfToken },
    data: { source: 'inventory', baseRevision: inventory.revision, topology: inventory.topology, monitoring: inventory.monitoring },
  })
  assert.equal(applied.status(), 200)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('button', { name: 'View dashboard', exact: true }).waitFor()
  assert.equal((await context.request.get(url('topology'))).status(), 401)
  console.log('Remote browser checks passed for viewer navigation, write protection, admin access and logout.')
} finally {
  await browser.close()
}
