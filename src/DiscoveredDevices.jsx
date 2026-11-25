import { hostFetch } from './auth.js'
import ConfirmDialog from './ConfirmDialog'
import TopologyDiscovery from './TopologyDiscovery.jsx'
import { useCallback, useEffect, useState } from 'react'
import useMonitoring from './useMonitoring.js'
import InfoTooltip from './InfoTooltip'
import { guessDeviceType } from './discoveryType.js'
import { refreshLocalWriteToken, writeHeaders } from './monitoring.js'

const statusLabel = { new: 'New', changed: 'Changed', added: 'Added', gone: 'Not seen' }
const seenAt = (value) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
export default function DiscoveredDevices({ remote, stageDiscovery }) {
  const { snapshot, state } = useMonitoring(true)
  if (!snapshot && state === 'loading')
    return (
      <section className="page-content discovery-page" aria-label="Discovered devices">
        <h1>Discovered devices</h1>
        <p role="status">Loading discovery settings…</p>
      </section>
    )
  if (snapshot?.infrastructureOnly)
    return (
      <section className="page-content discovery-page" aria-labelledby="discovery-title">
        <header className="page-heading">
          <h1 id="discovery-title">Discovered devices</h1>
          <p>Router and switch mode is on. Use Topology proposals to find connections.</p>
        </header>
        <TopologyDiscovery stageDiscovery={stageDiscovery} infrastructureOnly />
      </section>
    )
  return <LocalDiscovery remote={remote} stageDiscovery={stageDiscovery} />
}

function LocalDiscovery({ remote, stageDiscovery }) {
  const [confirm, setConfirm] = useState(null)
  const [devices, setDevices] = useState([]),
    [pending, setPending] = useState({ count: 0 }),
    [busy, setBusy] = useState(false),
    [scanning, setScanning] = useState(false),
    [progress, setProgress] = useState(null),
    [message, setMessage] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [after, setAfter] = useState(0),
    [pages, setPages] = useState([]),
    [nextAfter, setNextAfter] = useState(null)
  const refresh = useCallback(async (cursor) => {
    const r = await hostFetch(`/api/v1/discovered?after=${cursor}&limit=200`)
    if (!r.ok) throw Error()
    const value = await r.json()
    setDevices(value.devices)
    setPending({ count: value.pendingCount ?? 0, version: value.pendingVersion })
    setNextAfter(value.nextAfter)
    setAfter(cursor)
  }, [])
  useEffect(() => {
    void refresh(0).catch(() => setMessage('Connect to the NetWatch host to review discovered devices.'))
  }, [refresh])
  useEffect(() => {
    if (!scanning) return
    let stopped = false,
      timer
    const poll = async () => {
      try {
        const r = await hostFetch('/api/v1/health')
        if (r.ok && !stopped) {
          const health = await r.json()
          setProgress(health.discovery)
        }
      } catch {}
      if (!stopped) timer = setTimeout(poll, 500)
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [scanning])
  const action = async (device, kind) => {
    setBusy(true)
    setMessage('')
    try {
      let body = {}
      if (kind === 'add-to-map') {
        const inventory = await hostFetch('/api/v1/topology').then((r) => r.json())
        body = { baseRevision: inventory.revision }
      }
      const r = await hostFetch(`/api/v1/discovered/${encodeURIComponent(device.id)}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...writeHeaders() },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw Error()
      const result = await r.json()
      if (result.draft) await stageDiscovery(result.draft)
      await refresh(after)
      setMessage(result.draft ? 'Added to the draft map.' : 'Removed from discovered devices.')
    } catch {
      setMessage('Could not update this device. Refresh and try again.')
    } finally {
      setBusy(false)
    }
  }
  const clear = async () => {
    setBusy(true)
    setMessage('')
    try {
      const r = await hostFetch('/api/v1/discovered/clear', { method: 'POST', headers: writeHeaders() })
      if (!r.ok) throw Error()
      setPages([])
      await refresh(0)
      setMessage('Discovery list cleared.')
    } catch {
      setMessage('Could not clear discovered devices. Refresh and try again.')
    } finally {
      setBusy(false)
    }
  }
  const addAll = async () => {
    setBusy(true)
    setMessage('')
    try {
      const inventory = await hostFetch('/api/v1/topology')
      if (!inventory.ok) throw Error()
      const { revision: baseRevision } = await inventory.json()
      const response = await hostFetch('/api/v1/discovered/add-to-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...writeHeaders() },
        body: JSON.stringify({ baseRevision, pendingVersion: pending.version }),
      })
      if (response.status === 409) {
        await refresh(after)
        setMessage('The map or scan results changed. Review the results and try again.')
        return
      }
      if (!response.ok) throw Error()
      const { addedCount, existingCount, draft } = await response.json()
      await stageDiscovery(draft)
      setMessage(
        `Added ${addedCount} to the draft map.${existingCount ? ` Already on the map: ${existingCount}.` : ''}`,
      )
      await refresh(after).catch(() => {})
    } catch {
      setMessage('Could not add the scanned devices.')
    } finally {
      setBusy(false)
    }
  }
  const scan = async () => {
    setBusy(true)
    setScanning(true)
    setMessage('')
    try {
      const request = () => hostFetch('/api/v1/discovered/scan-now', { method: 'POST', headers: writeHeaders() })
      let r = await request()
      if (!remote && r.status === 403) {
        const error = await r.json().catch(() => null)
        // The host rejected this request before it could start a scan.
        if (
          error?.error?.message === 'Valid write token required. Reload NetWatch and try again.' &&
          (await refreshLocalWriteToken().catch(() => false))
        )
          r = await request()
      }
      if (r.status === 429) {
        setMessage('Wait 30 seconds between scan requests. Local and remote admins share this limit.')
        return
      }
      if (r.status === 403) {
        setMessage(
          remote
            ? 'Scan permission was denied. Sign in again as an admin.'
            : 'Reload this dashboard and try the scan again.',
        )
        return
      }
      if (!r.ok) throw Error()
      const result = await r.json()
      if (result.state === 'disabled' || result.state === 'unsupported') {
        setMessage(
          result.state === 'disabled'
            ? 'Discovery is off. Enable it in the NetWatch launcher and restart the host.'
            : 'Discovery requires a Windows host.',
        )
        return
      }
      setPages([])
      if (
        !(await refresh(0).then(
          () => true,
          () => false,
        ))
      ) {
        setMessage('The scan ended. Reload this page to see the results.')
        return
      }
      setMessage(
        result.diagnostics?.length
          ? 'Scan could not finish. Showing previous results.'
          : result.upstreamLinks
            ? `Scan complete. Proposed ${result.upstreamLinks} router ${result.upstreamLinks === 1 ? 'link' : 'links'}.`
            : 'Scan complete.',
      )
    } catch {
      setMessage('Could not finish the scan request. Check that NetWatch is running and try again.')
    } finally {
      setScanning(false)
      setProgress(null)
      setBusy(false)
    }
  }
  const visible = devices.filter(
    (d) =>
      (filter === 'all' || d.status === filter) &&
      `${d.ip} ${d.mac || ''} ${d.hostname || ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const phase =
    progress?.phase === 'icmp'
      ? `Checking ${progress.processed} of ${progress.total} local addresses for ping replies…`
      : progress?.phase === 'neighbors'
        ? 'Reading the Windows neighbor list…'
        : progress?.phase === 'names'
          ? `Looking up names for ${progress.processed} of ${progress.total} devices…`
          : progress?.phase === 'routes'
            ? `Checking routes to saved routers (${progress.processed} of ${progress.total})…`
            : progress?.phase === 'saving'
              ? 'Saving scan results…'
              : 'Starting scan…'
  return (
    <section className="page-content discovery-page" aria-labelledby="discovery-title">
      <header className="page-heading">
        <h1 id="discovery-title">Discovered devices</h1>
        <div className="discovery-heading-actions">
          <button
            className="button secondary"
            disabled={busy || !pending.count}
            onClick={() =>
              setConfirm({
                title: 'Add all to draft?',
                message: `Add ${pending.count} results from the latest scan across all pages. New devices start with checks off.`,
                label: 'Add all',
                onConfirm: addAll,
              })
            }
          >
            Add all to draft
          </button>
          <button
            className="button secondary"
            disabled={busy || !devices.length}
            onClick={() =>
              setConfirm({
                title: 'Clear discovery list?',
                message: 'Devices already added to the map will stay there.',
                label: 'Clear all',
                onConfirm: clear,
              })
            }
          >
            Clear all
          </button>
          <button className="button primary" disabled={busy} onClick={scan}>
            {scanning ? 'Scanning…' : 'Scan now'}
          </button>
        </div>
      </header>
      <TopologyDiscovery stageDiscovery={stageDiscovery} />
      {scanning && (
        <div
          className="discovery-progress"
          role="progressbar"
          aria-label="Network scan progress"
          aria-valuemax={progress?.total || 100}
          aria-valuenow={['icmp', 'names', 'routes'].includes(progress?.phase) ? progress.processed : undefined}
        >
          <span className="discovery-spinner" aria-hidden="true" />
          <span>{phase}</span>
        </div>
      )}
      <p className="discovery-message" role="status">
        {message}
      </p>
      {devices.length > 0 && (
        <div className="discovery-toolbar">
          <input
            aria-label="Search this page"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a device"
          />
          <select aria-label="Device status" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      {visible.length ? (
        <ul className="discovery-list" aria-label="Discovery results">
          {visible.map((device) => {
            const guess = guessDeviceType(device.hostname)
            return (
              <li key={device.id} className="discovery-row">
                <div className="discovery-identity">
                  <strong>{device.hostname || device.ip}</strong>
                  {device.hostname && <span>{device.ip}</span>}
                  <span>{statusLabel[device.status] || 'New'}</span>
                  {device.source === 'gateway' && device.status !== 'gone' && <span>Router · Default gateway</span>}
                  {device.source === 'gateway-mac' && device.status !== 'gone' && (
                    <span>Likely router · Matches known gateway</span>
                  )}
                  {device.switchPort && (
                    <span>
                      Seen on {device.switchPort.switch} · {device.switchPort.name}
                    </span>
                  )}
                </div>
                <div className="discovery-actions">
                  <button className="button secondary" disabled={busy} onClick={() => action(device, 'add-to-map')}>
                    {device.status === 'added'
                      ? device.switchPort
                        ? 'Review port hint'
                        : 'Review gateway hint'
                      : 'Add to draft'}
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: 'Remove discovered device?',
                        message:
                          'Remove ' +
                          device.ip +
                          ' from discovery? It can reappear after a scan. Your map stays as it is.',
                        label: 'Remove',
                        onConfirm: () => action(device, 'remove'),
                      })
                    }
                  >
                    Remove
                  </button>
                  <InfoTooltip label={'Information for ' + device.ip}>
                    <span>Hardware address · {device.mac || 'Unavailable'}</span>
                    {device.source === 'gateway' ? (
                      <span>Windows reported this address as a default gateway.</span>
                    ) : device.source === 'gateway-mac' ? (
                      <span>Same hardware address as a previously observed default gateway.</span>
                    ) : (
                      <>
                        <span>
                          Type guess · {guess.type} ({guess.confidence.toLowerCase()} confidence)
                        </span>
                        <span>{guess.evidence}</span>
                      </>
                    )}
                    <span>First seen · {seenAt(device.firstSeen)}</span>
                    <span>Last seen · {seenAt(device.lastSeen)}</span>
                  </InfoTooltip>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="discovery-empty">
          {devices.length ? 'No devices match these filters.' : 'No discovered devices yet.'}
        </p>
      )}
      {(pages.length > 0 || nextAfter !== null) && (
        <nav className="discovery-pagination" aria-label="Discovered device pages">
          <button
            className="button secondary"
            disabled={busy || !pages.length}
            onClick={() => {
              const previous = pages.at(-1) ?? 0
              void refresh(previous)
                .then(() => setPages(pages.slice(0, -1)))
                .catch(() => setMessage('Could not load the previous page.'))
            }}
          >
            Previous
          </button>
          <span>Page {pages.length + 1}</span>
          <button
            className="button secondary"
            disabled={busy || nextAfter === null}
            onClick={() => {
              void refresh(nextAfter)
                .then(() => setPages([...pages, after]))
                .catch(() => setMessage('Could not load the next page.'))
            }}
          >
            Next
          </button>
        </nav>
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </section>
  )
}
