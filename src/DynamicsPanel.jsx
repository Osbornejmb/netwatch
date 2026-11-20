import { useState } from 'react'
import { estimateFailure } from './failure-impact.js'
import { formatSpeed } from './refocus.js'

const changes = {
  deviceAdded: 'Device discovered',
  linkAdded: 'Link discovered',
  linkMoved: 'Port changed',
  linkMissing: 'Link missing from discovery',
  speedChanged: 'Link speed changed',
}

export default function DynamicsPanel({ topology, bundles, dynamics, selectDevice }) {
  const [selection, setSelection] = useState('')
  const [kind, setKind] = useState('device')
  const names = new Map(topology.nodes.map((node) => [node.id, node.data.label]))
  const result =
    selection && estimateFailure(topology, kind === 'device' ? { deviceId: selection } : { linkId: selection }, bundles)
  const ids = (list) => list.map((id) => names.get(id) ?? id).join(', ')
  const display = (value) => (typeof value === 'number' ? formatSpeed(value) : value)
  return (
    <details className="map-tools">
      <summary>Map tools</summary>
      <div className="map-tools-content">
        <details>
          <summary>Recent changes ({dynamics.changes.length})</summary>
          {dynamics.changes.length ? (
            <ul>
              {dynamics.changes.map((event) => (
                <li key={event.id}>
                  <strong>{changes[event.kind]}</strong> · {event.label}
                  {event.before !== undefined && ' · ' + display(event.before) + ' → ' + display(event.after)}
                  {' · '}
                  {new Date(event.at).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No changes recorded yet.</p>
          )}
        </details>
        <details>
          <summary>
            Redundancy incidents ({dynamics.incidents.filter((incident) => !incident.resolvedAt).length} open)
          </summary>
          {dynamics.incidents.length ? (
            <ul>
              {dynamics.incidents.map((incident) => {
                const device = topology.nodes.find((node) => node.id === incident.deviceId)
                const label =
                  (device?.data.label ?? 'Removed device') +
                  ' · ' +
                  (incident.state === 'isolated' ? 'Isolated' : 'Running without redundancy') +
                  (incident.affected ? ' · ' + incident.affected + ' downstream' : '') +
                  (incident.resolvedAt ? ' · Resolved' : '')
                return (
                  <li key={incident.id}>
                    {device ? (
                      <button className="health-button" onClick={() => selectDevice(device)}>
                        {label}
                      </button>
                    ) : (
                      label
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p>No redundancy incidents recorded yet.</p>
          )}
        </details>
        <details>
          <summary>Estimate a failure</summary>
          <p>Topology-based estimate from your saved map.</p>
          {topology.roots?.length ? (
            <>
              <label>
                Failure type
                <select
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value)
                    setSelection('')
                  }}
                >
                  <option value="device">Device</option>
                  <option value="link">Link</option>
                </select>
              </label>
              <label>
                {kind === 'device' ? 'Device to fail' : 'Link to fail'}
                <select value={selection} onChange={(event) => setSelection(event.target.value)}>
                  <option value="">Choose an item</option>
                  {kind === 'device'
                    ? topology.nodes.map(({ id, data }) => (
                        <option key={id} value={id}>
                          {data.label}
                        </option>
                      ))
                    : topology.edges.map((edge) => (
                        <option key={edge.id} value={edge.id}>
                          {names.get(edge.source)} ↔ {names.get(edge.target)}
                          {edge.uplink?.label && ' · ' + edge.uplink.label}
                        </option>
                      ))}
                </select>
              </label>
              {result && (
                <p role="status">
                  {result.isolated.length
                    ? 'Estimated isolated: ' + ids(result.isolated)
                    : 'No additional devices isolated'}
                  {' · '}
                  {result.degraded.length
                    ? 'Estimated reduced redundancy: ' + ids(result.degraded)
                    : 'No additional baseline paths lost'}
                </p>
              )}
            </>
          ) : (
            <p>Set root routers in Edit map to estimate failure impact.</p>
          )}
        </details>
      </div>
    </details>
  )
}
