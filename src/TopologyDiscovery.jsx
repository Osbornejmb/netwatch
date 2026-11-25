import { useEffect, useState } from 'react'
import { hostFetch } from './auth.js'
import { writeHeaders } from './monitoring.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import { isInfrastructure } from './device-types.js'

const root = '/api/v1/discovery/'
const labels = {
  verified: 'Verified',
  single_sided: 'One-sided',
  unresolved_port: 'Port unclear',
  conflict: 'Needs review',
  not_enrolled: 'No port checks set up',
  outside_scope: 'Outside the discovery range',
  no_management_address: 'No management address',
  identity_conflict: 'Device identity conflicts',
  empty_lldp: 'No neighbors reported',
  cancelled: 'Cancelled',
  time_limit: 'Time limit reached',
  neighbor_limit: 'Some neighbor data was incomplete',
  device_limit: 'Device limit reached',
  depth_limit: 'Search depth reached',
  proposal_limit: 'Proposal limit reached',
  credentials_unavailable: 'Credentials unavailable',
  credentials_rejected: 'The device rejected its credentials',
  collection_unavailable: 'Port checks are unavailable on this host',
  snmp_timeout: 'Device did not respond',
  snmp_failed: 'Could not read device',
  identity_unavailable: 'Device identity unavailable',
  monitoring_busy: 'Monitoring is busy',
  interrupted: 'The host restarted during discovery',
  snmp_limit: 'Device read limit reached',
}
const explain = (code) => labels[code] ?? 'Device details unavailable'

async function request(path, body, signal) {
  const response = await hostFetch(
    root + path,
    body === undefined
      ? { signal, cache: 'no-store' }
      : {
          method: 'POST',
          signal,
          headers: { ...writeHeaders(), ...(body !== null && { 'Content-Type': 'application/json' }) },
          ...(body !== null && { body: JSON.stringify(body) }),
        },
  )
  const value = await response.json()
  if (!response.ok) throw Error(value.error?.message || 'Could not complete the request.')
  return value
}

function DiscoveryTree({ devices }) {
  const branches = new Map()
  for (const device of devices) {
    if (!branches.has(device.via)) branches.set(device.via, [])
    branches.get(device.via).push(device)
  }
  const render = (branch) => (
    <ul>
      {branch.map((device) => (
        <li key={device.id}>
          {device.label || 'Unnamed device'}
          {branches.has(device.chassisKey) && render(branches.get(device.chassisKey))}
        </li>
      ))}
    </ul>
  )
  return render(branches.get(undefined) ?? [])
}

export default function TopologyDiscovery({ stageDiscovery, infrastructureOnly = false }) {
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState(null)
  const [seed, setSeed] = useState('')
  const [interval, setInterval] = useState(null)
  const [scheduleEnabled, setScheduleEnabled] = useState(null)
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [matches, setMatches] = useState({})
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState('')
  const [refreshError, setRefreshError] = useState(false)
  const run = data?.run
  const runId = run?.id
  const running = run?.status === 'running'
  const refresh = async () => setData(await request('runs'))

  useEffect(() => {
    if (busy) return
    const controller = new AbortController()
    const { signal } = controller
    let timer
    let inFlight = false
    let retryLatest = false
    async function poll() {
      if (document.hidden || inFlight) return
      inFlight = true
      try {
        const fetchRunOnly = running && !retryLatest
        const current = await request(
          fetchRunOnly ? 'runs/' + encodeURIComponent(runId) : 'runs',
          undefined,
          AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        )
        if (!signal.aborted) {
          setData((previous) => (fetchRunOnly ? { ...previous, run: current } : current))
          retryLatest = false
          setRefreshError(false)
        }
      } catch {
        retryLatest = true
        if (!signal.aborted) setRefreshError(true)
      } finally {
        inFlight = false
        if (!signal.aborted && !document.hidden) timer = setTimeout(poll, running && !retryLatest ? 1000 : 5000)
      }
    }
    function visibilityChanged() {
      clearTimeout(timer)
      if (!document.hidden) void poll()
    }
    void poll()
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [busy, running, runId])

  const act = async (fn) => {
    setBusy(true)
    setMessage('')
    try {
      await fn()
    } catch (error) {
      setMessage(error.message || 'Could not complete the request.')
    } finally {
      setBusy(false)
    }
  }
  const revision = async () => {
    const response = await hostFetch('/api/v1/topology')
    if (!response.ok) throw Error('Could not check the saved map.')
    return (await response.json()).revision
  }
  const runPath = 'runs/' + encodeURIComponent(runId ?? '')
  const plan = (ids) =>
    act(async () => {
      const body = { ids, baseRevision: await revision(), matches }
      const { draft } = await request(runPath + '/accept', { ...body, preview: true })
      await stageDiscovery(draft, true)
      setPreview({ draft, body, path: runPath + '/accept', acknowledge: true })
    })
  const apply = () =>
    act(async () => {
      const { draft } = preview.acknowledge
        ? preview
        : await request(preview.path, preview.body, AbortSignal.timeout(8000))
      await stageDiscovery(draft)
      setPreview(null)
      if (preview.acknowledge) {
        try {
          await request(preview.path, preview.body, AbortSignal.timeout(8000))
        } catch {
          setMessage('The draft map was saved. Could not confirm the proposal with the host.')
          return
        }
      }
      setMessage('Added to the draft map. Review it in Edit map.')
      await refresh().catch(() => {})
    })
  const visibleDevices = (run?.devices ?? []).filter((device) => !infrastructureOnly || isInfrastructure(device.type))
  const devices = new Map(visibleDevices.map((device) => [device.chassisKey, device]))
  const hints = infrastructureOnly ? [] : (data?.hints ?? [])
  const linkDevices = (link) => [devices.get(link.source), devices.get(link.target)]
  const canAccept = (link) =>
    link.confidence !== 'conflict' &&
    linkDevices(link).every((device) => device?.type !== 'other' && !device?.observedOnly)
  const proposed = (run?.links ?? []).filter(
    (link) => link.status === 'proposed' && (!infrastructureOnly || linkDevices(link).every(Boolean)),
  )
  const verified = proposed.filter((link) => link.confidence === 'verified' && canAccept(link))
  const displayed =
    proposed.length <= 1
      ? proposed
      : proposed.filter(
          (link) =>
            filter === 'all' ||
            (filter === 'verified' && link.confidence === 'verified') ||
            (filter === 'attention' && link.confidence !== 'verified') ||
            (filter === 'unmanaged' && linkDevices(link).some((device) => device?.state === 'unmanaged')),
        )
  const proposalCount = proposed.length + hints.length
  const scheduled = scheduleEnabled ?? Boolean(data?.schedule?.intervalMinutes)
  return (
    <section className="discovery-topology" aria-label="Topology proposals">
      {data?.schedule && (
        <form
          className="discovery-schedule"
          aria-labelledby="discovery-schedule-title"
          onSubmit={(event) => {
            event.preventDefault()
            const fields = new FormData(event.currentTarget)
            void act(async () => {
              const schedule = await request('schedule', {
                seedId: fields.get('discoverySeed'),
                intervalMinutes: scheduled ? Number(fields.get('interval')) : 0,
              })
              setData((previous) => ({ ...previous, schedule }))
              setScheduleEnabled(null)
              setInterval(null)
              setMessage('Discovery schedule saved.')
            })
          }}
        >
          <h2 id="discovery-schedule-title">Scheduled discovery</h2>
          <div className="discovery-schedule-fields">
            <label className="discovery-schedule-toggle">
              <input
                type="checkbox"
                checked={scheduled}
                onChange={(event) => setScheduleEnabled(event.target.checked)}
              />
              Run automatically
            </label>
            <label>
              Interval (minutes)
              <input
                name="interval"
                type="number"
                min="15"
                max="1440"
                step="1"
                required={scheduled}
                disabled={!scheduled}
                placeholder="15–1440"
                value={interval ?? (data.schedule.intervalMinutes || '')}
                onChange={(event) => setInterval(event.target.value)}
              />
            </label>
            <label>
              Scheduled start device
              <select name="discoverySeed" key={data.schedule.seedId} defaultValue={data.schedule.seedId || seed}>
                <option value="">Choose an enrolled device</option>
                {data.seeds.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="button secondary" disabled={busy}>
              Save schedule
            </button>
          </div>
        </form>
      )}
      {refreshError && (
        <p className="discovery-message" role="status">
          {data
            ? 'Could not refresh topology discovery. Showing the last results.'
            : 'Could not load topology discovery.'}
        </p>
      )}
      {message && !preview && (
        <p className="discovery-message" role="status">
          {message}
        </p>
      )}
      <details className="topology-proposals" onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
          Topology proposals
          <span className="topology-proposal-count">
            {running
              ? ' · Checking connections…'
              : proposalCount
                ? ' · ' + proposalCount + ' to review'
                : data
                  ? ' · Nothing to review'
                  : ''}
          </span>
        </summary>
        {expanded && (
          <div className="topology-proposal-controls">
            <div className="discovery-manual">
              <label>
                Manual start device
                <select
                  id="discovery-seed"
                  value={seed}
                  disabled={running || busy}
                  onChange={(event) => setSeed(event.target.value)}
                >
                  <option value="">Choose an enrolled device</option>
                  {(data?.seeds ?? []).map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button secondary"
                disabled={running || busy || !seed}
                onClick={() =>
                  act(async () => {
                    const run = await request('runs', { seedId: seed })
                    setMatches({})
                    setData((previous) => ({ ...previous, run }))
                  })
                }
              >
                Find connections
              </button>
            </div>
            {running && (
              <>
                <p role="status">Checking connections · {run.progress?.queried ?? 0} devices checked</p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => act(() => request(runPath + '/cancel', null))}
                >
                  Cancel discovery
                </button>
              </>
            )}
            {run && !running && (
              <>
                <p role="status">
                  {run.status === 'partial' ? 'Partial results' : 'Discovery complete'} · {proposed.length} connections
                  to review
                </p>
                {!infrastructureOnly && !!run.cdpReports?.length && (
                  <details>
                    <summary>CDP reports ({run.cdpReports.length})</summary>
                    <ul>
                      {run.cdpReports.map((report, i) => (
                        <li key={i}>
                          {report.device} · {report.peerPort}
                          {report.platform && ' · ' + report.platform}
                          {report.address && ' · ' + report.address}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {!!run.diagnostics.length && (
                  <ul>
                    {run.diagnostics.map((code) => (
                      <li key={code}>{explain(code)}</li>
                    ))}
                  </ul>
                )}
                {!!visibleDevices.length && (
                  <details>
                    <summary>Discovery tree</summary>
                    <DiscoveryTree devices={visibleDevices} />
                  </details>
                )}
                {!!visibleDevices.length && (
                  <details>
                    <summary>Devices found ({visibleDevices.length})</summary>
                    <ul>
                      {[...visibleDevices]
                        .sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99))
                        .map((device) => (
                          <li key={device.id}>
                            {device.label || 'Unnamed device'} · {device.type}
                            {device.depth !== undefined && ' · Hop ' + device.depth}
                            {device.addresses.length > 0 && ' · ' + device.addresses.join(', ')}
                            {device.reason && ' · ' + explain(device.reason)}
                            {device.status === 'proposed' && (
                              <>
                                {device.type !== 'other' && !device.observedOnly && (
                                  <button
                                    className="button secondary"
                                    disabled={busy}
                                    onClick={() => plan([device.id])}
                                  >
                                    Review device
                                  </button>
                                )}
                                <button
                                  className="button secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    act(async () => {
                                      await request(runPath + '/reject', {
                                        ids: [device.id],
                                        baseRevision: await revision(),
                                      })
                                      await refresh()
                                    })
                                  }
                                >
                                  Reject device
                                </button>
                              </>
                            )}
                            {device.matches?.length > 0 && (
                              <label>
                                Confirm saved device
                                <select
                                  value={matches[device.id] ?? ''}
                                  onChange={(event) => setMatches({ ...matches, [device.id]: event.target.value })}
                                >
                                  <option value="">Choose a match</option>
                                  {device.matches.map(({ id, label }) => (
                                    <option key={id} value={id}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
                {proposed.length > 1 && (
                  <div className="topology-proposal-filter">
                    <label htmlFor="topology-proposal-filter">Show connections</label>
                    <select
                      id="topology-proposal-filter"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    >
                      <option value="all">All proposals</option>
                      <option value="verified">Verified</option>
                      <option value="attention">Needs attention</option>
                      <option value="unmanaged">Unmanaged devices</option>
                    </select>
                  </div>
                )}
                {!!verified.length && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => plan(verified.map(({ id }) => id))}
                  >
                    Review all verified
                  </button>
                )}
                <ul>
                  {displayed.map((link) => (
                    <li key={link.id}>
                      <p>
                        {linkDevices(link)[0]?.label || 'Unnamed device'} ({link.sourcePort.label || 'port unknown'}) ↔{' '}
                        {linkDevices(link)[1]?.label || 'Unnamed device'} ({link.targetPort.label || 'port unknown'}) ·{' '}
                        {explain(link.confidence)}
                        {link.sourceProtocol === 'both' && ' · LLDP and CDP'}
                        {link.sourceProtocol === 'cdp' && ' · CDP'}
                        {linkDevices(link).some((device) => device?.observedOnly) &&
                          ' · Neighbor has no port checks set up'}
                      </p>
                      <details>
                        <summary>Evidence</summary>
                        <ul>
                          {link.evidence.map((row, index) => (
                            <li key={index}>
                              {devices.get(row.source)?.label || 'Unnamed device'} reported{' '}
                              {row.local.label || 'an unknown port'} ↔ {row.remote.label || 'an unknown port'}
                            </li>
                          ))}
                        </ul>
                      </details>
                      <button
                        className="button secondary"
                        disabled={busy || !canAccept(link)}
                        onClick={() => plan([link.id])}
                      >
                        Review
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await request(runPath + '/reject', { ids: [link.id], baseRevision: await revision() })
                            await refresh()
                          })
                        }
                      >
                        Reject
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!!hints.length && (
              <details>
                <summary>Local connection hints</summary>
                <ul>
                  {hints.map((hint) => (
                    <li key={hint.id}>
                      {hint.sourceLabel} ↔ {hint.targetLabel} · {hint.label}
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            const path = 'hints/' + encodeURIComponent(hint.id) + '/accept'
                            const body = { baseRevision: await revision(), preview: true }
                            const { draft } = await request(path, body)
                            await stageDiscovery(draft, true)
                            setPreview({ draft, body: { ...body, preview: false }, path })
                          })
                        }
                      >
                        Review hint
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview && (
              <ConfirmDialog
                title="Add to draft map?"
                label="Add to draft"
                message="Review these connections before adding them."
                dismissOnConfirm={false}
                busy={busy}
                onClose={() => setPreview(null)}
                onConfirm={apply}
              >
                {message && <p role="alert">{message}</p>}
                <p>These connections will be available in Edit map. Use this map to review and apply your draft.</p>
                {!!preview.draft.nodes.length && (
                  <ul>
                    {preview.draft.nodes.map((node) => (
                      <li key={node.id}>
                        {node.data.label || 'Unnamed device'} · {node.type}
                      </li>
                    ))}
                  </ul>
                )}
                <ul>
                  {preview.draft.edges.map((edge) => (
                    <li key={edge.id}>
                      {preview.draft.nodes.find(({ id }) => id === edge.source)?.data.label} (
                      {edge.uplink?.source.label || 'port unknown'}) ↔{' '}
                      {preview.draft.nodes.find(({ id }) => id === edge.target)?.data.label} (
                      {edge.uplink?.target.label || 'port unknown'})
                    </li>
                  ))}
                </ul>
              </ConfirmDialog>
            )}
          </div>
        )}
      </details>
    </section>
  )
}
