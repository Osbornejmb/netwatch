import { invalid } from '../store.js'
import { queryNumber } from './query.js'
import { createAudit } from '../audit.js'

export function readAudit({ store, url, audit = createAudit(store.db) }) {
  const limit = queryNumber(url, 'limit', 50)
  const before = queryNumber(url, 'before')
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    (before !== undefined && (!Number.isSafeInteger(before) || before < 1))
  )
    throw invalid('Invalid audit page.')
  return audit.read({ limit, before })
}

export function exportAudit({ store, response, audit = createAudit(store.db) }) {
  response.headers = { 'Content-Disposition': 'attachment; filename="netwatch-access-log.json"' }
  return audit.export()
}
