import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
const current = { N: 32768, r: 8, p: 1 }
export const viewerModes = ['open', 'password', 'disabled']

export function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128
}

function parseHash(value) {
  if (typeof value !== 'string') return
  const fields = /^scrypt\$(16384|32768|65536)\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(value)
  if (!fields) return
  return { N: Number(fields[1]), r: 8, p: 1, salt: Buffer.from(fields[2], 'hex'), key: Buffer.from(fields[3], 'hex') }
}

export async function hashPassword(password, { N, r, p } = current) {
  if (!validPassword(password)) throw new Error('Use a password between 12 and 128 characters.')
  const salt = randomBytes(16)
  const key = await derive(password, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 })
  return ['scrypt', N, r, p, salt.toString('hex'), key.toString('hex')].join('$')
}

export async function verifyPassword(password, value) {
  const record = parseHash(value)
  if (!record || !validPassword(password)) return false
  const { N, r, p, salt, key } = record
  return timingSafeEqual(key, await derive(password, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 }))
}

export function needsRehash(value) {
  const record = parseHash(value)
  return Boolean(record && Object.keys(current).some((name) => record[name] !== current[name]))
}

export function readAuthConfig(db) {
  return db.prepare('SELECT viewer_mode, viewer_hash, admin_hash FROM auth_config WHERE singleton=1').get()
}

export function remoteEnabled(lan, config) {
  return Boolean(
    lan &&
    viewerModes.includes(config?.viewer_mode) &&
    parseHash(config.admin_hash) &&
    (config.viewer_hash === null || parseHash(config.viewer_hash)),
  )
}
