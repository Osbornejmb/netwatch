import { refreshNetwork } from './browser-controls.mjs'
import assert from 'node:assert/strict'
import { createHealthNetwork } from '../tests/fixtures/health-network.js'
import { hostSnapshot } from '../tests/fixtures/host-snapshot.js'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const network = createHealthNetwork(Date.now())
  let connected = true
  await page.addInitScript(network => localStorage.setItem('netwatch-topology-v1', JSON.stringify(network)), network)
  await page.route('**/api/v1/snapshot', route => connected ? route.fulfill({ json: hostSnapshot(network, network.checks) }) : route.abort())
  const base = process.env.NETWATCH_URL || 'http://127.0.0.1:5173'
  await page.goto(base)
  await page.locator('.health-node-up').first().waitFor()
  assert.match(await page.locator('.health-summary').innerText(), /11 up.*1 down.*1 overdue.*1 not monitored/s)
  assert.ok(await page.locator('.health-attention').isVisible())
  for (const [key, count] of [['up', 11], ['down', 1], ['stale', 1], ['unknown', 1]]) {
    await page.locator(`.summary-${key}`).click()
    await page.waitForFunction(count => document.querySelectorAll('.react-flow__node:Not([hidden]) .health-node').length === count, count)
    assert.equal(await page.locator('.health-node:visible').count(), count)
    await page.locator(`.summary-${key}`).click()
  }
  const sizes = await page.locator('.health-node.switch-node').evaluateAll(nodes => nodes.map(node => [node.offsetWidth, node.offsetHeight]))
  assert.ok(sizes.every(([width, height]) => width === 160 && height === 56))
  const checkOblongs = async selector => {
    const cards = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
      const style = getComputedStyle(node)
      const children = [...node.children].filter(child => !child.classList.contains('react-flow__handle'))
      const content = children.reduce((sum, child) => sum + parseFloat(getComputedStyle(child).width), 0)
      const used = content + (children.length - 1) * parseFloat(style.gap) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
      return { width: node.offsetWidth, used, radius: style.borderRadius, height: node.offsetHeight }
    }))
    assert.ok(cards.length > 0)
    for (const card of cards) {
      assert.equal(card.radius, '999px')
      assert.ok(card.width <= 281)
      assert.ok(Math.abs(card.width - card.used) < 2, 'router has unused horizontal space')
      assert.ok(card.height <= 56)
    }
  }
  await checkOblongs('.health-node.router-node')
  assert.ok(await page.locator('.health-node strong[title]').count() > 0)
  assert.equal(await page.locator('.health-node .node-status[aria-label]').count(), 14)
  assert.equal(await page.locator('.health-path-stale path').first().evaluate(node => node.style.strokeDasharray), '')
  await page.screenshot({ path: 'docs/screenshots/desktop-after.png', fullPage: true })
  await page.locator('.health-node').first().evaluate(node => node.closest('.react-flow__node').focus())
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  connected = false
  await refreshNetwork(page)
  await page.getByText('Connection lost, reconnecting', { exact: false }).waitFor()
  assert.ok(await page.locator('.connection-lost').isVisible())
  connected = true
  await refreshNetwork(page)
  await page.locator('.health-page-titlebar > div > p[role=status]').first().filter({ hasText: /^Connected/ }).waitFor()
  await page.getByRole('link', { name: 'Devices', exact: true }).click()
  for (const width of [1280, 1920, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.equal(await page.locator('.health-inventory table').isVisible(), width >= 720)
    if (width < 720) assert.equal(await page.locator('.health-device-card:visible').count(), 14)
    await page.locator('.backup-recovery summary').click()
    const panel = await page.locator('.backup-panel').boundingBox()
    const nav = await page.locator('.top-menu').boundingBox()
    assert.ok(panel.y >= nav.y + nav.height, `backup covers nav at ${width}`)
    if (width === 390) await page.screenshot({ path: 'docs/screenshots/devices-narrow-after.png', fullPage: true })
    await page.locator('.backup-recovery summary').click()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(base + '/#topology')
  await page.locator('.device-node.router-node').first().waitFor()
  await checkOblongs('.device-node.router-node')
  const beforeTidy = await page.evaluate(() => localStorage.getItem('netwatch-topology-v1'))
  await page.getByRole('button', { name: 'Save layout', exact: true }).click()
  await page.waitForFunction(before => localStorage.getItem('netwatch-topology-v1') !== before, beforeTidy)
  const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('netwatch-topology-v1')))
  const tidy = await snapshot()
  assert.equal(new Set(tidy.nodes.map(node => JSON.stringify(node.position))).size, 14)
  await page.getByRole('button', { name: 'Add device', exact: true }).click()
  await page.getByLabel('Device name (required)', { exact: true }).fill('Added device')
  await page.getByRole('dialog').getByRole('button', { name: 'Add device', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('netwatch-topology-v1')).nodes.length === 15)
  assert.equal(new Set((await snapshot()).nodes.map(node => JSON.stringify(node.position))).size, 15)
  await page.locator('.editor-tools > summary').click()
  await page.getByLabel('Selected device', { exact: true }).selectOption('core-a')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete device', exact: true }).click()
  assert.equal((await snapshot()).nodes.length, 15)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete device', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('netwatch-topology-v1')).nodes.length === 14)
  assert.ok((await snapshot()).edges.every(edge => edge.source !== 'core-a' && edge.target !== 'core-a'))
  await page.screenshot({ path: 'docs/screenshots/editor-after.png', fullPage: true })
  await page.evaluate(() => { location.hash = 'inventory' })
  await page.getByRole('heading', { name: 'Devices', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Devices', exact: true }).waitFor()
  await page.goBack()
  await page.getByRole('heading', { name: 'Edit your map', exact: true }).waitFor()
  const offline = await browser.newPage()
  await offline.route('**/api/v1/snapshot', route => route.abort())
  await offline.goto(base)
  await offline.getByText('Waiting for host', { exact: false }).waitFor()
  assert.equal(await offline.locator('.connection-lost').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: summary filters, card dimensions/status labels, solid stale paths, keyboard details, connection lifecycle, hash navigation/reload/back, tidy/add, cancel/confirm removal, desktop/narrow table/cards and backup placement')
} finally {
  await browser.close()
}
