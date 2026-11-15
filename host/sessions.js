import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { hashPassword, needsRehash, readAuthConfig, remoteEnabled, validPassword, verifyPassword } from './auth.js'
import { invalid } from './store.js'

const minute = 60000
const hour = 60 * minute
const limits = { viewer: [8 * hour, 168 * hour, 20], admin: [30 * minute, 12 * hour, 5] }
const tokenPattern = /^[a-f0-9]{64}$/
const digest = (token) => createHash('sha256').update(token).digest('hex')
const dummy = ['scrypt', 32768, 8, 1, randomBytes(16).toString('hex'), randomBytes(64).toString('hex')].join('$')
const cookie = (token, seconds) =>
  'netwatch_session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + seconds

export function createSessions(db, { lan, now = Date.now, audit } = {}) {
  const csrfKey = randomBytes(32)
  const csrf = (token) => createHmac('sha256', csrfKey).update(token).digest('hex')
  const select = db.prepare('SELECT * FROM sessions WHERE id_hash=?')
  const remove = db.prepare('DELETE FROM sessions WHERE id_hash=?')
  let config
  let readAt = -Infinity
  let busy = false
  let generation = 0
  const empty = { count: 0, last: -Infinity, next: -Infinity, attempts: [] }
  let global = empty
  const failures = new Map()
  const configAt = (fresh = false) => {
    const at = now()
    if (fresh || at - readAt >= 30000) {
      config = readAuthConfig(db)
      readAt = at
    }
    return config
  }
  function purge(at = now()) {
    db.prepare("DELETE FROM sessions WHERE expires_at<=? OR last_seen_at<=? OR (role='admin' AND last_seen_at<=?)").run(
      at,
      at - limits.viewer[0],
      at - limits.admin[0],
    )
    for (const [ip, entry] of failures) if (at - entry.last >= 10 * minute) failures.delete(ip)
  }
  function inspect(req) {
    const token = req.headers.cookie
      ?.split(';')
      .map((pair) => pair.trim())
      .find((pair) => pair.startsWith('netwatch_session='))
      ?.slice(17)
    if (!tokenPattern.test(token ?? '')) return
    const session = select.get(digest(token))
    if (!session) return
    const at = now()
    if (session.expires_at <= at || session.last_seen_at <= at - limits[session.role][0]) {
      remove.run(session.id_hash)
      return
    }
    if (
      session.role === 'viewer' &&
      (config.viewer_mode === 'disabled' || (config.viewer_mode === 'password' && !config.viewer_hash))
    )
      return
    if (at - session.last_seen_at >= minute)
      db.prepare('UPDATE sessions SET last_seen_at=? WHERE id_hash=?').run(at, session.id_hash)
    return { ...session, token }
  }
  function issue(role, ip, res, previous) {
    const token = randomBytes(32).toString('hex')
    const csrfToken = csrf(token)
    const at = now()
    const [, absolute, count] = limits[role]
    const expiresAt = at + absolute
    db.exec('BEGIN IMMEDIATE')
    try {
      purge(at)
      audit?.record(previous?.role === 'viewer' && role === 'admin' ? 'session_upgrade' : 'login_success', {
        source: 'remote',
        ip,
        role,
      })
      if (previous) remove.run(previous.id_hash)
      db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run(
        digest(token),
        role,
        digest(csrfToken),
        at,
        at,
        expiresAt,
        ip,
      )
      db.prepare(
        'DELETE FROM sessions WHERE role=? AND id_hash IN (SELECT id_hash FROM sessions WHERE role=? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ?)',
      ).run(role, role, count)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    res.setHeader('Set-Cookie', cookie(token, absolute / 1000))
    return { role, csrfToken, expiresAt }
  }
  function current({ session, ip, res, source }) {
    const settings = configAt()
    const base = {
      source,
      viewerMode: settings?.viewer_mode ?? 'disabled',
      remoteEnabled: remoteEnabled(lan, settings),
    }
    if (source === 'local') return { ...base, authenticated: true, role: 'admin' }
    if (!session && base.viewerMode === 'open') return { ...base, authenticated: true, ...issue('viewer', ip, res) }
    if (!session) return { ...base, authenticated: false, role: null }
    const csrfToken = csrf(session.token)
    const csrfHash = digest(csrfToken)
    if (csrfHash !== session.csrf_hash)
      db.prepare('UPDATE sessions SET csrf_hash=? WHERE id_hash=?').run(csrfHash, session.id_hash)
    return { ...base, authenticated: true, role: session.role, csrfToken, expiresAt: session.expires_at }
  }
  function failure(previous, at) {
    const count = at - previous.last >= 10 * minute ? 1 : previous.count + 1
    return { count, last: at, next: at + Math.min(1000 * 2 ** (count - 1), 5 * minute) }
  }
  function record(ip, entry, at) {
    entry.attempts = [...entry.attempts.filter((time) => at - time < 10 * minute), at].slice(-10)
    failures.delete(ip)
    failures.set(ip, entry)
    if (failures.size > 2048) failures.delete(failures.keys().next().value)
    return entry.attempts.length === 10
  }
  async function login({ body, ip, res, session, source }) {
    if (source === 'local') return { role: 'admin' }
    const settings = configAt(true)
    if (!remoteEnabled(lan, settings)) throw invalid('Remote access is unavailable.', 403)
    const generationAtLogin = generation
    const role = body?.role
    const password = body?.password
    const open = role === 'viewer' && settings.viewer_mode === 'open'
    const at = now()
    const previous = failures.get(ip) ?? empty
    const retry = Math.max(
      previous.next,
      global.next,
      previous.attempts.length >= 10 ? previous.attempts[0] + 10 * minute : -Infinity,
    )
    function limited(seconds) {
      res.setHeader('Retry-After', String(seconds))
      return invalid('Invalid credentials', 429)
    }
    if (retry > at) {
      if (previous.attempts.length < 10 && record(ip, { ...previous, last: at }, at)) {
        audit?.record('rate_limit_lockout', { source, ip, role: null })
        throw limited(600)
      }
      throw limited(Math.max(1, Math.ceil((retry - at) / 1000)))
    }
    if (busy) throw limited(1)
    const column = role === 'admin' ? 'admin_hash' : 'viewer_hash'
    const hash =
      role === 'admin' || (role === 'viewer' && settings.viewer_mode === 'password') ? settings[column] : null
    busy = true
    try {
      const matched = await verifyPassword(
        validPassword(password) ? password : 'netwatch-invalid-password',
        hash ?? dummy,
      )
      if (!open && !(hash && validPassword(password) && matched)) {
        const end = now()
        const entry = failure(previous, end)
        global = failure(global, end)
        audit?.record('login_failure', { source, ip, role: role === 'admin' || role === 'viewer' ? role : null })
        if (record(ip, { ...entry, attempts: previous.attempts }, end)) {
          audit?.record('rate_limit_lockout', { source, ip, role: null })
          throw limited(600)
        }
        throw invalid('Invalid credentials', 401)
      }
      if (generationAtLogin !== generation) throw invalid('Invalid credentials', 401)
      if (hash && needsRehash(hash)) {
        const upgraded = await hashPassword(password)
        if (generationAtLogin !== generation) throw invalid('Invalid credentials', 401)
        db.prepare('UPDATE auth_config SET ' + column + '=?, updated_at=? WHERE singleton=1 AND ' + column + '=?').run(
          upgraded,
          new Date(now()).toISOString(),
          hash,
        )
      }
      failures.delete(ip)
      global = empty
      return issue(role, ip, res, session)
    } finally {
      busy = false
    }
  }
  return {
    invalidate() {
      generation++
      readAt = -Infinity
    },
    enabled: () => remoteEnabled(lan, configAt()),
    inspect,
    current,
    login,
    purge,
    logout({ session, res, source, ip }) {
      if (source === 'remote') {
        if (session) {
          remove.run(session.id_hash)
          audit?.record('logout', { source, ip, role: session.role })
        }
        res.setHeader('Set-Cookie', cookie('', 0))
      }
      return { authenticated: false }
    },
    validWrite(session, token) {
      return Boolean(
        session &&
        tokenPattern.test(token ?? '') &&
        tokenPattern.test(session.csrf_hash) &&
        timingSafeEqual(Buffer.from(digest(token), 'hex'), Buffer.from(session.csrf_hash, 'hex')),
      )
    },
  }
}
