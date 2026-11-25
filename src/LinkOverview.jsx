import { useState } from 'react'
import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from 'lucide-react'
import DynamicsPanel from './DynamicsPanel.jsx'
import { baselineLabels, formatSpeed, linkLabels, roleLabels, scopeLabels } from './refocus.js'
import { formatCheckTime } from './monitoring.js'
import useModal from './useModal'

const title = (link, names) =>
  [link.edge.source, link.edge.target].map((id) => names.get(id)?.data.label ?? id).join(' ↔ ')

function connectionStatus(link) {
  const speedMismatch =
    link.source.fresh &&
    link.target.fresh &&
    link.source.speedBps &&
    link.target.speedBps &&
    link.source.speedBps !== link.target.speedBps
  if (link.state === 'down') return { rank: 0, Icon: CircleX, tone: 'down', label: linkLabels.down }
  if (['oneSided', 'mismatch', 'degraded'].includes(link.state) || speedMismatch) {
    return {
      rank: 1,
      Icon: TriangleAlert,
      tone: 'warning',
      label: speedMismatch && link.state === 'portsUp' ? 'Speed mismatch' : linkLabels[link.state],
      speedMismatch: speedMismatch && link.state !== 'portsUp',
    }
  }
  if (link.count === 0 && link.stale) {
    return { rank: 2, Icon: TriangleAlert, tone: 'warning', label: 'Port readings overdue' }
  }
  if (link.count === 0 || link.state === 'unknown') {
    return {
      rank: 2,
      Icon: CircleHelp,
      tone: 'unknown',
      unverified: true,
      label: link.count === 0 ? 'Ports not monitored' : linkLabels.unknown,
    }
  }
  if (link.state === 'forwarding') return { rank: 4, Icon: CircleCheck, tone: 'up', label: linkLabels.forwarding }
  return { rank: 3, Icon: CircleHelp, tone: 'unknown', label: linkLabels[link.state] }
}

export function LinkOverview(props) {
  const [expanded, setExpanded] = useState(false)
  const { links, headline, monitored } = props.summary
  return (
    <section className="link-overview" aria-label="Link and redundancy status">
      <details className="link-overview-panel" onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
          <span role="status">
            <strong>{headline}</strong>
            {!!links.length && (
              <span>
                {' '}
                · {monitored} of {links.length} links monitored at both ends
              </span>
            )}
          </span>
        </summary>
        {expanded && <LinkOverviewDetails {...props} />}
      </details>
    </section>
  )
}

function LinkOverviewDetails({ summary, nodes, tiers, failurePoints, selectDevice, selectLink, topology, dynamics }) {
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
  const failureDevices = new Set(failurePoints?.devices)
  const failureLinks = new Set(failurePoints?.links)
  const byId = new Map(summary.links.map((link) => [link.edge.id, link]))
  const grouped = new Set(summary.bundles.flatMap((bundle) => bundle.members))
  const connectionCount = summary.links.length - grouped.size + summary.bundles.length
  const statusById = new Map(summary.links.map((link) => [link.edge.id, connectionStatus(link)]))
  const ordered = (links) => links.toSorted((a, b) => statusById.get(a.edge.id).rank - statusById.get(b.edge.id).rank)
  const connectionButton = (link) => {
    const { Icon, tone, label, unverified, speedMismatch } = statusById.get(link.edge.id)
    return (
      <button className="health-button connection-row" onClick={() => selectLink(link.edge.id)}>
        <span>{title(link, names)}</span>
        <span className={`connection-status is-${tone}`}>
          <Icon size={16} aria-hidden="true" />
          <span className={unverified ? 'sr-only' : undefined}>
            {label}
            {speedMismatch ? ' · Speed mismatch' : ''}
          </span>
        </span>
        {failureLinks.has(link.edge.id) && <span className="connection-risk">Single point of failure</span>}
      </button>
    )
  }
  return (
    <div className="link-overview-actions">
      {!!summary.links.length && (
        <>
          <details>
            <summary>Connections ({connectionCount})</summary>
            {[...statusById.values()].some(({ unverified }) => unverified) && (
              <p className="connection-legend">
                <CircleHelp size={16} aria-hidden="true" />A question mark means port readings are unavailable or the
                link state is unknown.
              </p>
            )}
            <ul className="connection-list">
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
                          {ordered(members).map((link) => (
                            <li key={link.edge.id}>{connectionButton(link)}</li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  )
                )
              })}
              {ordered(summary.links.filter((link) => !grouped.has(link.edge.id))).map((link) => (
                <li key={link.edge.id}>{connectionButton(link)}</li>
              ))}
            </ul>
          </details>
          {(attention.length > 0 || failureDevices.size > 0) && (
            <details>
              <summary>Device redundancy alerts</summary>
              <ul>
                {attention.map(({ node, state, affected }) => (
                  <li key={node.id}>
                    <button className="health-button" onClick={() => selectDevice(node)}>
                      {node.data.label} · {baselineLabels[state]}
                      {affected ? ' · ' + affected + ' downstream' : ''}
                      {failureDevices.has(node.id) && ' · Single point of failure'}
                    </button>
                  </li>
                ))}
                {[...failureDevices]
                  .filter((id) => names.has(id) && !attention.some(({ node }) => node.id === id))
                  .map((id) => (
                    <li key={id}>
                      <button className="health-button" onClick={() => selectDevice(names.get(id))}>
                        {names.get(id).data.label} · Single point of failure
                      </button>
                    </li>
                  ))}
              </ul>
            </details>
          )}
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
        <DynamicsPanel topology={topology} dynamics={dynamics} bundles={summary.bundles} selectDevice={selectDevice} />
      )}
    </div>
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
