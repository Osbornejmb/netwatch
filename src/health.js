export const HEALTH = {
  up: { label: 'Up', note: 'Responding to checks', color: '#15803d' },
  down: { label: 'Down', note: 'Not responding', color: '#b91c1c' },
  stale: { label: 'Overdue', note: 'Check is overdue', color: '#a16207' },
  unknown: { label: 'Not monitored', note: 'No verified check', color: '#64748b' },
}

export function deviceHealth(check, now = Date.now(), staleAfterMs = 90_000) {
  if (!check || !['up', 'down'].includes(check.status) || typeof check.checkedAt !== 'string') return 'unknown'
  const checkedAt = Date.parse(check.checkedAt)
  if (!Number.isFinite(checkedAt) || checkedAt > now) return 'unknown'
  if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) return 'unknown'
  return now - checkedAt > staleAfterMs ? 'stale' : check.status
}

export function summarizeHealth(nodes, checks, now, staleAfterMs) {
  const counts = { all: nodes.length, up: 0, down: 0, stale: 0, unknown: 0 }
  for (const node of nodes) counts[deviceHealth(checks[node.id], now, staleAfterMs)]++
  return counts
}

export function connectionHealth(source, target) {
  if (source === 'down' || target === 'down') return 'down'
  if (![source, target].every((status) => ['up', 'stale'].includes(status))) return 'unknown'
  return source === 'stale' || target === 'stale' ? 'stale' : 'up'
}

export function nextEvidenceChange(checks, staleAfterMs, ports, portStaleAfterMs, now) {
  let next = Infinity
  const consider = (sample, freshness) => {
    if (!(Number.isFinite(freshness) && freshness > 0)) return
    const time = Date.parse(sample?.checkedAt)
    if (!Number.isFinite(time)) return
    const deadline = time > now ? time : Math.floor(time + freshness) + 1
    if (deadline > now && deadline < next) next = deadline
  }
  for (const check of Object.values(checks)) {
    if (check.status === 'up' || check.status === 'down') consider(check, staleAfterMs)
  }
  for (const evidence of ports?.values() ?? []) {
    consider(evidence.source, portStaleAfterMs)
    consider(evidence.target, portStaleAfterMs)
  }
  return next
}
