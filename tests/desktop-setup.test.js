import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('rerunning Windows launcher setup preserves saved SNMP port contexts', { skip: process.platform !== 'win32' }, t => {
  const appData = mkdtempSync(join(tmpdir(), 'netwatch-setup-test-'))
  t.after(() => rmSync(appData, { recursive: true, force: true }))
  const launcher = join(appData, 'NetWatch')
  const configuration = join(launcher, 'desktop.json')
  const source = join(appData, 'source')
  const setup = join(source, 'scripts', 'setup-desktop.mjs')
  for (const folder of ['scripts', 'desktop', 'dist']) mkdirSync(join(source, folder), { recursive: true })
  copyFileSync(fileURLToPath(new URL('../scripts/setup-desktop.mjs', import.meta.url)), setup)
  copyFileSync(fileURLToPath(new URL('../desktop/NetWatch.cs', import.meta.url)), join(source, 'desktop', 'NetWatch.cs'))
  writeFileSync(join(source, 'dist', 'index.html'), '')
  const database = join(launcher, 'data', 'netwatch.sqlite')
  const snmpPortContexts = { '192.0.2.12': 'vlan-100' }

  mkdirSync(launcher)
  writeFileSync(configuration, JSON.stringify({ database, icmp: false, snmp: true, snmpPortContexts }))
  execFileSync(process.execPath, [setup], { env: { ...process.env, LOCALAPPDATA: appData }, timeout: 45000 })

  const saved = JSON.parse(readFileSync(configuration, 'utf8'))
  assert.deepEqual(saved.snmpPortContexts, snmpPortContexts)
  assert.equal(saved.database, database)
  assert.equal(saved.snmp, true)
})
