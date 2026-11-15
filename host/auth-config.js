import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword, readAuthConfig, validPassword, verifyPassword, viewerModes } from './auth.js'
import { createAudit } from './audit.js'
import { lock } from './files.js'
import { secret } from './secret-prompt.js'
import { openStore } from './store.js'

export async function manageAuth(
  db,
  [command, mode, ...extra],
  { prompt = (question) => secret(question, /^[^\p{C}]+$/u), print = console.log } = {},
) {
  const passwordCommand = command === 'set-admin-password' || command === 'set-viewer-password'
  if (
    extra.length ||
    (command === 'viewer-mode' ? !viewerModes.includes(mode) : mode !== undefined) ||
    (!passwordCommand && !['viewer-mode', 'status', 'revoke-sessions'].includes(command))
  )
    throw new Error(
      'Usage: npm run auth -- set-admin-password | set-viewer-password | viewer-mode <open|password|disabled> | status | revoke-sessions.',
    )
  if (command === 'status') {
    print(JSON.stringify(accessStatus(db)))
    return
  }
  let value = mode
  let column = 'viewer_mode'
  if (passwordCommand) {
    const admin = command === 'set-admin-password'
    const password = await prompt('New password: ')
    if (!validPassword(password)) throw new Error('Use a password between 12 and 128 characters.')
    if (password !== (await prompt('Confirm password: '))) throw new Error('Passwords do not match.')
    const config = readAuthConfig(db)
    if (await verifyPassword(password, admin ? config.viewer_hash : config.admin_hash))
      throw new Error('Use different viewer and admin passwords.')
    value = await hashPassword(password)
    column = admin ? 'admin_hash' : 'viewer_hash'
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    if (command !== 'revoke-sessions')
      db.prepare('UPDATE auth_config SET ' + column + '=?, updated_at=? WHERE singleton=1').run(
        value,
        new Date().toISOString(),
      )
    createAudit(db).record('access_settings_changed', {
      detail: command === 'viewer-mode' ? command + ':' + mode : command,
    })
    db.exec('DELETE FROM sessions; COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  print(
    command === 'revoke-sessions' ? 'Remote sessions revoked.' : 'Access settings updated. Remote sessions revoked.',
  )
}

export function accessStatus(db) {
  const config = readAuthConfig(db)
  return {
    viewerMode: config.viewer_mode,
    viewerConfigured: Boolean(config.viewer_hash),
    adminConfigured: Boolean(config.admin_hash),
  }
}

export async function manageLauncherAccess(db, request) {
  const allowed = [
    'lan-preference',
    'status',
    'set-admin-password',
    'set-viewer-password',
    'viewer-mode',
    'revoke-sessions',
  ]
  if (!allowed.includes(request?.command)) throw new Error('Invalid access command.')
  if (request.command === 'lan-preference') {
    if (!['enabled', 'disabled'].includes(request.mode)) throw new Error('Invalid LAN preference.')
    createAudit(db).record('access_settings_changed', { detail: 'lan:' + request.mode })
  } else if (request.command !== 'status') {
    const answers = [request.password, request.confirm]
    await manageAuth(db, [request.command, request.mode], { prompt: () => answers.shift(), print() {} })
  }
  const audit = createAudit(db)
  audit.purge()
  return { ...accessStatus(db), audit: audit.read().entries }
}

async function main() {
  const path = resolve(process.env.NETWATCH_DB || 'data/netwatch.sqlite')
  mkdirSync(dirname(path), { recursive: true })
  const release = lock(path)
  let store
  try {
    store = openStore(path)
    if (process.argv.length === 3 && process.argv[2] === '--launcher') {
      let data = ''
      process.stdin.setEncoding('utf8')
      for await (const chunk of process.stdin) {
        data += chunk
        if (data.length > 4096) throw new Error('Invalid access command.')
      }
      console.log(JSON.stringify(await manageLauncherAccess(store.db, JSON.parse(data))))
    } else await manageAuth(store.db, process.argv.slice(2))
  } finally {
    store?.close()
    release()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(process.argv[2] === '--launcher' ? 'Unable to update access settings.' : error.message)
    process.exitCode = 1
  })
}
