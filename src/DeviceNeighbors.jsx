import { useEffect, useState } from 'react'
import { formatCheckTime, hostRequest } from './monitoring'

export default function DeviceNeighbors({ deviceId, refreshMap }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)
  const [dismissed, setDismissed] = useState([])
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const path = `devices/${encodeURIComponent(deviceId)}/neighbors`
  useEffect(() => {
    const controller = new AbortController()
    hostRequest(path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value)
          setError('')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load neighbor observations.')
      })
    return () => controller.abort()
  }, [path, version])

  const reload = () => {
    setEditing(null)
    setError('')
    setData(null)
    setVersion((value) => value + 1)
  }
  const apply = async (event, neighbor) => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const peer = fields.get('peer')
    setBusy(true)
    setMessage('')
    try {
      const result = await hostRequest(path, {
        signal: AbortSignal.timeout(10000),
        body: {
          baseRevision: data.revision,
          checkedAt: data.checkedAt,
          neighborId: neighbor.id,
          peerId: peer === 'new' ? null : peer.slice(3),
          label: fields.get('label'),
          type: fields.get('type'),
        },
      })
      setDismissed((ids) => [...ids, neighbor.id])
      setMessage(result.added ? 'Neighbor link saved.' : 'These devices are already connected.')
      reload()
      refreshMap()
    } catch {
      reload()
      setMessage('Could not save the link. Review the refreshed results and try again.')
    } finally {
      setBusy(false)
    }
  }
  const rows = data?.neighbors.filter((row) => !dismissed.includes(row.id)) ?? []
  const reviewable = ['current', 'partial'].includes(data?.state)
  return (
    <section className="health-history" aria-label="LLDP neighbor review">
      <button type="button" className="button secondary" onClick={reload} disabled={busy || (!data && !error)}>
        Refresh neighbors
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading neighbors…</p>}
      {data && (
        <>
          {data.state === 'unconfigured' && <p>Set up SNMP port checks on the NetWatch PC to collect neighbors.</p>}
          {data.state === 'unavailable' && (
            <p>Neighbor information is unavailable. The device may lack LLDP support.</p>
          )}
          {data.state === 'stale' && <p>These observations are out of date. Refresh once a new check is available.</p>}
          {data.state === 'partial' && <p>The device supplied incomplete neighbor information.</p>}
          {data.checkedAt && <p>Observed {formatCheckTime(data.checkedAt)}</p>}
          {data.state === 'empty' && <p>No neighbors were reported. The device may lack LLDP support.</p>}
          {data.neighbors.length > 0 && !rows.length && <p>All shown proposals have been reviewed.</p>}
          <ul className="health-neighbors">
            {rows.map((neighbor) => (
              <li key={neighbor.id}>
                <div>
                  <strong>{neighbor.name || neighbor.chassis}</strong>
                </div>
                <small>
                  Local port {neighbor.localPort} · Peer port {neighbor.remotePort} · Chassis {neighbor.chassis}
                </small>
                {reviewable && editing?.id !== neighbor.id && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setEditing({ id: neighbor.id, peer: '' })}
                  >
                    Review link
                  </button>
                )}
                {reviewable && editing?.id === neighbor.id && (
                  <form className="neighbor-review-form" onSubmit={(event) => void apply(event, neighbor)}>
                    <label>
                      Peer device
                      <select
                        name="peer"
                        required
                        value={editing.peer}
                        onChange={(event) => setEditing({ ...editing, peer: event.target.value })}
                      >
                        <option value="">Choose a device</option>
                        <option value="new">Create an unmonitored device</option>
                        {data.peers.map(({ id, label, ip }) => (
                          <option key={id} value={`id:${id}`}>
                            {label}
                            {ip ? ` (${ip})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    {editing.peer === 'new' && (
                      <>
                        <label>
                          Device name{' '}
                          <input
                            name="label"
                            maxLength={100}
                            required
                            defaultValue={neighbor.name || neighbor.chassis}
                          />
                        </label>
                        <label>
                          Device type{' '}
                          <select name="type" required defaultValue="">
                            <option value="">Choose a type</option>
                            <option value="switch">Switch</option>
                            <option value="router">Router</option>
                          </select>
                        </label>
                      </>
                    )}
                    <button type="submit" className="button primary" disabled={!editing.peer || busy}>
                      Save link
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditing(null)
                        setDismissed((ids) => [...ids, neighbor.id])
                      }}
                    >
                      Dismiss
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
