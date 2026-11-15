export function uplinkState(edge, evidence, now, staleAfterMs) {
  if (!edge.uplink || !evidence) return 'unknown'
  const state = (side) => {
    const sample = evidence?.[side]
    const time = Date.parse(sample?.checkedAt)
    if (
      !edge.uplink?.[side]?.index ||
      !Number.isFinite(staleAfterMs) ||
      staleAfterMs <= 0 ||
      !Number.isFinite(time) ||
      time > now ||
      now - time > staleAfterMs
    )
      return 'unknown'
    if (sample.admin === 2 || [2, 6, 7].includes(sample.oper)) return 'down'
    return sample.admin === 1 && sample.oper === 1 ? 'up' : 'unknown'
  }
  const ends = [state('source'), state('target')]
  return ends.includes('down') ? 'down' : ends.every((end) => end === 'up') ? 'up' : 'unknown'
}

export function redundancyState(members) {
  if (members.length < 2 || members.includes('unknown')) return 'Unknown'
  if (members.every((state) => state === 'up')) return 'Available'
  if (members.every((state) => state === 'down')) return 'Unavailable'
  return 'Degraded'
}

export const uplinkLabels = { up: 'Ports up', down: 'Port down', unknown: 'Port state unknown' }
