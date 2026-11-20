import DynamicsPanel from './DynamicsPanel.jsx'
import { baselineLabels, formatSpeed, linkLabels, roleLabels, scopeLabels } from './refocus.js'
import { formatCheckTime } from './monitoring.js'
import useModal from './useModal'

const title = (link, names) =>
  [link.edge.source, link.edge.target].map((id) => names.get(id)?.data.label ?? id).join(' ↔ ')

export function LinkOverview({ summary, nodes, tiers, failurePoints, selectDevice, selectLink, topology, dynamics }) {
  const names = new Map(nodes.map((node) => [node.id, node]))
  const ranks = new Map(tiers.map(({ deviceId, tier }) => [deviceId, tier]))
  const tierGroups = new Map()
  for (const { node, state } of summary.devices) {
    const tier = ranks.get(node.id) ?? Infinity
    if (!tierGroups.has(tier)) tierGroups.set(tier, { healthy: 0, degraded: 0, isolated: 0, unknown: 0, none: 0 })
    tierGroups.get(tier)[state]++
  }
  const openIncidents = dynamics?.incidents.filter(
    ({ deviceId, resolvedAt }) => resolvedAt === null && names.has(deviceId),
  )
  const attention = openIncidents?.length
    ? openIncidents.map(({ deviceId, state, affected }) => ({ node: names.get(deviceId), state, affected }))
    : summary.devices.filter(({ state }) => ['isolated', 'degraded'].includes(state))
  const entries = attention.map(({ node, state, affected }) => ({
    rank: state === 'isolated' ? 0 : 1,
    id: node.id,
    label: node.data.label + ' · ' + baselineLabels[state] + (affected ? ' · ' + affected + ' downstream' : ''),
    action: () => selectDevice(node),
  }))
  for (const link of summary.links) {
    const speedMismatch =
      link.source.fresh &&
      link.target.fresh &&
      link.source.speedBps &&
      link.target.speedBps &&
      link.source.speedBps !== link.target.speedBps
    const rank =
      link.state === 'down'
        ? 2
        : speedMismatch
          ? 4
          : ['oneSided', 'mismatch', 'degraded'].includes(link.state)
            ? 3
            : link.count < 2
              ? 5
              : link.state === 'portsUp'
                ? 7
                : null
    if (rank === null) continue
    const detail = speedMismatch
      ? 'Speed mismatch'
      : link.count === 0 && link.stale
        ? 'Port readings overdue'
        : link.count === 0
          ? 'Ports not monitored'
          : link.state === 'degraded'
            ? 'Degraded link · Sustained errors or discards'
            : linkLabels[link.state]
    entries.push({
      rank,
      id: link.edge.id,
      label: title(link, names) + ' · ' + detail,
      action: () => selectLink(link.edge.id),
    })
  }
  if (failurePoints) {
    for (const id of failurePoints.devices) {
      const node = names.get(id)
      if (node)
        entries.push({
          rank: 6,
          id,
          label: node.data.label + ' · Single point of failure',
          action: () => selectDevice(node),
        })
    }
    const byId = new Map(summary.links.map((link) => [link.edge.id, link]))
    for (const id of failurePoints.links) {
      const link = byId.get(id)
      if (link)
        entries.push({
          rank: 6,
          id,
          label: title(link, names) + ' · Single point of failure',
          action: () => selectLink(id),
        })
    }
  }
  entries.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
  const byId = new Map(summary.links.map((link) => [link.edge.id, link]))
  const grouped = new Set(summary.bundles.flatMap((bundle) => bundle.members))
  const connectionCount = summary.links.length - grouped.size + summary.bundles.length
  const connectionButton = (link) => (
    <button className="health-button" onClick={() => selectLink(link.edge.id)}>
      {title(link, names)} · {linkLabels[link.state]}
    </button>
  )
  return (
    <section className="link-overview" aria-label="Link and redundancy status">
      <p role="status">
        <strong>{summary.headline}</strong>
        {!!summary.links.length && (
          <span>
            {' '}
            · {summary.monitored} of {summary.links.length} links monitored at both ends
          </span>
        )}
      </p>
      <div className="link-overview-actions">
        {!!summary.links.length && (
          <>
            {!!entries.length && (
              <details>
                <summary>Link attention ({entries.length})</summary>
                <ul>
                  {entries.map(({ id, rank, label, action }) => (
                    <li key={rank + ':' + id}>
                      <button className="health-button" onClick={action}>
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <details>
              <summary>Connections ({connectionCount})</summary>
              <ul>
                {summary.bundles.map((bundle) => {
                  const members = bundle.members.map((id) => byId.get(id)).filter(Boolean)
                  return (
                    members.length > 0 && (
                      <li key={bundle.id}>
                        <details>
                          <summary>
                            Bundle · {title(members[0], names)} · {bundle.up} of {bundle.total} members up
                          </summary>
                          <ul>
                            {members.map((link) => (
                              <li key={link.edge.id}>{connectionButton(link)}</li>
                            ))}
                          </ul>
                        </details>
                      </li>
                    )
                  )
                })}
                {summary.links
                  .filter((link) => !grouped.has(link.edge.id))
                  .map((link) => (
                    <li key={link.edge.id}>{connectionButton(link)}</li>
                  ))}
              </ul>
            </details>
            {!!summary.devices.length && (
              <details>
                <summary>Redundancy by tier</summary>
                <ul>
                  {[...tierGroups]
                    .sort(([a], [b]) => a - b)
                    .map(([tier, counts]) => (
                      <li key={tier}>
                        <strong>{Number.isFinite(tier) ? 'Tier ' + tier : 'No tier assigned'}</strong>
                        <span>
                          {' '}
                          · {counts.healthy} healthy · {counts.degraded} degraded · {counts.isolated} isolated ·{' '}
                          {counts.unknown} unknown · {counts.none} without a baseline
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </>
        )}
        {dynamics && topology && !!nodes.length && (
          <DynamicsPanel
            topology={topology}
            dynamics={dynamics}
            bundles={summary.bundles}
            selectDevice={selectDevice}
          />
        )}
      </div>
    </section>
  )
}

export function LinkDetails({ link, nodes, now, onClose }) {
  const modal = useModal(onClose)
  const names = new Map(nodes.map((node) => [node.id, node]))
  return (
    <dialog {...modal} className="modal device-dialog" aria-labelledby="link-detail-title">
      <h2 id="link-detail-title">{title(link, names)}</h2>
      <p>
        <strong>{linkLabels[link.state]}</strong> · {scopeLabels[link.scope]}
      </p>
      {link.role && link.role !== 'unknown' && (
        <p>
          {roleLabels[link.role]} from {names.get(link.edge.source)?.data.label}
        </p>
      )}
      {link.bundle && (
        <p>
          Bundle · {link.bundle.up} of {link.bundle.total} members up · {link.bundle.state}
        </p>
      )}
      <ul>
        {['source', 'target'].map((side) => {
          const end = link[side]
          const elapsed = Math.max(0, Math.floor((now - Date.parse(end.checkedAt)) / 60000))
          const age =
            elapsed < 1 ? 'less than a minute ago' : elapsed + (elapsed === 1 ? ' minute ago' : ' minutes ago')
          return (
            <li key={side}>
              {names.get(link.edge[side])?.data.label} ·{' '}
              {end.portLabel || link.edge.uplink?.[side].label || 'Port unknown'}
              {end.fresh && end.speedBps ? ' · ' + formatSpeed(end.speedBps) : ''}
              {end.fresh && end.stp && ' · Spanning tree ' + end.stp}
              {end.fresh && Number.isFinite(end.errorsPerSec) && ' · ' + end.errorsPerSec.toFixed(2) + ' errors/sec'}
              {end.fresh &&
                Number.isFinite(end.discardsPerSec) &&
                ' · ' + end.discardsPerSec.toFixed(2) + ' discards/sec'}
              {' · '}
              {end.checkedAt
                ? (end.fresh ? 'Checked ' : 'Last checked ') + age + ' (' + formatCheckTime(end.checkedAt) + ')'
                : 'No port reading'}
            </li>
          )
        })}
      </ul>
      <p>
        {link.state === 'portsUp'
          ? 'Both ports report up. Forwarding still needs verification.'
          : link.scope === 'reachabilityOnly'
            ? 'Current port evidence is missing. Map line colors reflect device reachability.'
            : 'The state reflects the available reports from the listed ports.'}
      </p>
      <button className="button secondary" data-initial-focus onClick={onClose}>
        Close link details
      </button>
    </dialog>
  )
}
