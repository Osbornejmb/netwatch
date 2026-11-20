const maxAge = 30 * 24 * 60 * 60 * 1000
const exportActions = new Set([
  'login_success',
  'login_failure',
  'logout',
  'session_upgrade',
  'topology_applied',
  'discovery_scan',
  'discovery_clear',
  'discovery_add',
  'discovery_remove',
  'topology_discovery_started',
  'topology_discovery_cancelled',
  'topology_discovery_completed',
  'topology_proposal_accepted',
  'topology_proposal_rejected',
  'viewer_write_blocked',
  'operator_write_blocked',
  'write_token_rejected',
  'rate_limit_lockout',
  'access_settings_changed',
])

export function createAudit(db, now = Date.now) {
  const insert = db.prepare('INSERT INTO audit_log(at, source, ip, role, action, detail) VALUES(?,?,?,?,?,?)')
  const purge = db.prepare('DELETE FROM audit_log WHERE at<?')
  const page = db.prepare('SELECT * FROM audit_log WHERE id<? ORDER BY id DESC LIMIT ?')
  return {
    record(action, { source = 'local', ip = null, role = 'admin', detail = null } = {}) {
      const at = now()
      insert.run(at, source, ip, role, action, detail)
      purge.run(at - maxAge)
    },
    purge() {
      purge.run(now() - maxAge)
    },
    read({ before = Number.MAX_SAFE_INTEGER, limit = 50 } = {}) {
      const rows = page.all(before, limit + 1)
      const entries = rows.slice(0, limit)
      return { entries, nextBefore: rows.length > limit ? entries.at(-1).id : null }
    },
    export() {
      const at = now()
      const entries = db
        .prepare('SELECT at, source, role, action FROM audit_log WHERE at>=? ORDER BY id DESC LIMIT 5000')
        .all(at - maxAge)
        .filter(
          (row) =>
            exportActions.has(row.action) &&
            ['remote', 'local'].includes(row.source) &&
            [null, 'viewer', 'operator', 'admin'].includes(row.role) &&
            Number.isSafeInteger(row.at) &&
            row.at >= 0 &&
            row.at <= at,
        )
      return { exportedAt: new Date(at).toISOString(), entries }
    },
  }
}
