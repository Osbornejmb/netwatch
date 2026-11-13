import { useEffect, useState } from 'react'
import { hostRequest, formatCheckTime, validateIncidents } from './monitoring'

export default function DeviceIncidents({ deviceId, revision, checkedAt, onViewChecks }) {
  const [page, setPage] = useState({ items: [], next: null, loading: true, error: '' })
  const [cursor, setCursor] = useState(null)
  const [reload, setReload] = useState(0)
  useEffect(() => { setCursor(null) }, [deviceId, revision, checkedAt])
  useEffect(() => {
    const controller = new AbortController()
    setPage(previous => ({ ...previous, loading: true, error: '' }))
    hostRequest(`devices/${encodeURIComponent(deviceId)}/incidents?limit=25${cursor ? `&before=${cursor}` : ''}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) }).then(value => {
      if (value.revision !== revision) throw new Error('Changed inventory')
      validateIncidents(value.incidents, new Set([deviceId]))
      if ((cursor && value.incidents.some(item => item.id >= cursor)) || (value.nextBefore !== null && (!value.incidents.length || value.nextBefore !== value.incidents.at(-1).id))) throw new Error('Invalid page')
      if (!controller.signal.aborted) setPage(previous => ({ items: cursor ? [...previous.items, ...value.incidents] : value.incidents, next: value.nextBefore, loading: false, error: '' }))
    }).catch(() => { if (!controller.signal.aborted) setPage(previous => ({ ...previous, loading: false, error: 'Incidents are unavailable. Try Refresh incidents.' })) })
    return () => controller.abort()
  }, [deviceId, revision, checkedAt, cursor, reload])
  return <section className="health-incidents" aria-label="Device incidents" aria-busy={page.loading}>
    <h3>Outages and recovery</h3>
    <p>Two failed checks open an outage; a reply confirms recovery. Paused or interrupted checks leave outages open.</p>
    {page.loading && <p role="status">Loading incidents…</p>}
    {page.error && <p role="alert">{page.error}</p>}
    {!page.loading && !page.error && !page.items.length && <p>No recorded incidents.</p>}
    <ol>{page.items.map(item => <li key={item.id}><strong>{item.resolvedAt ? 'Recovered' : 'Open outage'}</strong><span>Opened: <time dateTime={item.openedAt}>{formatCheckTime(item.openedAt)}</time></span>{item.resolvedAt && <span>Recovered: <time dateTime={item.resolvedAt}>{formatCheckTime(item.resolvedAt)}</time></span>}</li>)}</ol>
    <button className="health-button" onClick={onViewChecks}>View checks</button>
    <p>Compare these times with Recent history below. Resolved incidents are kept for up to 30 days; busy networks may retain less.</p>
    <button className="health-button" disabled={page.loading} onClick={() => { setCursor(null); setReload(value => value + 1) }}>Refresh incidents</button>
    {page.next && page.items.length < 200 && <button className="health-button" disabled={page.loading} onClick={() => setCursor(page.next)}>Load older incidents</button>}
  </section>
}
