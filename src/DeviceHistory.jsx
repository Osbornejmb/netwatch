import { useEffect, useRef, useState } from 'react'
import { hostRequest, formatCheckTime } from './monitoring'
import { HEALTH } from './health'

export default function DeviceHistory({ deviceId, revision, checkedAt }) {
  const [page, setPage] = useState({ checks: [], nextBefore: null, loading: true, error: '' })
  const [reload, setReload] = useState(0)
  const active = useRef(null)
  const load = async (before, signal) => {
    setPage(previous => ({ ...previous, loading: true, error: '' }))
    try {
      const value = await hostRequest(`devices/${encodeURIComponent(deviceId)}/checks?limit=25${before ? `&before=${before}` : ''}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) })
      if (value.revision !== revision) throw new Error('Saved devices changed. Refresh before reading history.')
      if (!Array.isArray(value.checks) || value.checks.length > 25 ||
          value.checks.some((check, index) => check.deviceId !== deviceId || !Number.isSafeInteger(check.id) || check.id < 1 ||
            (index > 0 && check.id >= value.checks[index - 1].id) || (before && check.id >= before) ||
            !['up', 'down', 'unknown'].includes(check.status) || !Number.isFinite(Date.parse(check.checkedAt))) ||
          (value.nextBefore !== null && (value.checks.length === 0 || value.nextBefore !== value.checks.at(-1).id))) throw new Error('Invalid history response.')
      if (!signal.aborted) setPage(previous => ({ checks: before ? [...previous.checks, ...value.checks] : value.checks, nextBefore: value.nextBefore, loading: false, error: '' }))
    } catch (error) {
      if (!signal.aborted) setPage(previous => ({ ...previous, loading: false, error: error.message.startsWith('Saved devices changed') ? error.message : 'History is unavailable. Try Refresh history.' }))
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    active.current = controller
    setPage({ checks: [], nextBefore: null, loading: true, error: '' })
    load(null, controller.signal)
    return () => { controller.abort() }
  }, [deviceId, revision, checkedAt, reload])
  return <section className="health-history" aria-label="Recent device history" aria-busy={page.loading}>
    <h3>Recent checks and transitions</h3>
    <p>Latest first in local time, up to 200 checks; changes compare consecutive saved checks and do not prove uninterrupted uptime.</p>
    {page.loading && <p role="status">Loading history…</p>}
    {page.error && <p role="alert">{page.error}</p>}
    {!page.loading && !page.error && !page.checks.length && <p>No recorded checks.</p>}
    <ol>{page.checks.map((check, index) => <li key={check.id}><time dateTime={check.checkedAt}>{formatCheckTime(check.checkedAt)}</time><strong>{check.status === 'unknown' ? 'Confirming result' : HEALTH[check.status].label}{page.checks[index + 1] && page.checks[index + 1].status !== check.status ? ` · ${page.checks[index + 1].status} → ${check.status}` : ''}</strong><span>{check.outcome === 'reachable' ? 'Replied' : 'No reply'}{Number.isFinite(check.latencyMs) ? ` · ${check.latencyMs} ms` : ''}</span></li>)}</ol>
    <button className="health-button" disabled={page.loading} onClick={() => setReload(value => value + 1)}>Refresh history</button>
    {page.nextBefore && page.checks.length < 200 && <button className="health-button" disabled={page.loading} onClick={() => load(page.nextBefore, active.current.signal)}>Load older checks</button>}
    {page.checks.length >= 200 && <p>Display limit reached. Refresh history to return to the newest checks.</p>}
  </section>
}
