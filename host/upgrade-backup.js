import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'

function databaseDigest(db) {
  const hash = createHash('sha256')
  const version = db.prepare('PRAGMA user_version').get().user_version
  hash.update(JSON.stringify(version))
  const tables = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' ORDER BY name").all()
  for (const table of tables) {
    hash.update(JSON.stringify(table))
    const identifier = '"' + table.name.replaceAll('"', '""') + '"'
    const columns = db.prepare('PRAGMA table_info(' + identifier + ')').all()
    const order = columns.map(({ cid }) => cid + 1).join(',')
    for (const row of db.prepare('SELECT * FROM ' + identifier + ' ORDER BY ' + order).iterate()) {
      hash.update(JSON.stringify(row))
    }
  }
  return hash.digest('hex')
}

export function verifyUpgradeBackup(db, path, version = 11) {
  const backupPath = path + '.pre-v' + version + '.bak'
  let backup
  try {
    const source = statSync(path)
    const copy = statSync(backupPath)
    if (!copy.isFile() || (copy.dev === source.dev && copy.ino === source.ino)) throw new Error()
    backup = new DatabaseSync(backupPath, { readOnly: true })
    backup.exec('BEGIN')
    if (
      backup.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
      databaseDigest(db) !== databaseDigest(backup)
    )
      throw new Error()
  } catch {
    throw new Error(
      'A verified database backup is required. With NetWatch stopped, run npm run db -- backup "' +
        backupPath +
        '" and retry. Preserve older backups at a separate path.',
    )
  } finally {
    backup?.close()
  }
}
