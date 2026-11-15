const maxAge = 30 * 24 * 60 * 60 * 1000

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
  }
}
