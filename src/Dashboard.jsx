import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow } from '@xyflow/react'
import MapControls from './MapControls'
import { ArrowDownCircle, ArrowUpRight, CheckCircle2, CircleHelp, Clock3, Network, Router, Search } from 'lucide-react'
import { HEALTH, deviceHealth, summarizeHealth, connectionHealth, nextEvidenceChange } from './health'
import DeviceDetails from './DeviceDetails'
import useMonitoring from './useMonitoring'
import useLayoutDrag from './useLayoutDrag'
import { uniqueConnections } from './connections'
import { formatCheckTime, collectorLabel } from './monitoring'
import { tidyLayout, radialLayout, connectedDevices } from './radial'
import { redundancyState, uplinkLabels, uplinkState } from './uplinks'

import { nodeDimensions } from './nodes/dimensions'
import { NodeHandles } from './nodes/DeviceNode'
import { mapCard, mapEdgeTypes } from './nodes/MapEdge'
import InfoTooltip from './InfoTooltip'
import './dashboard.css'

const healthIcons = { up: CheckCircle2, down: ArrowDownCircle, stale: Clock3, unknown: CircleHelp }

function Status({ status }) {
  const Icon = healthIcons[status]
  return (
    <span className={`health-status health-${status}`}>
      <Icon size={13} aria-hidden="true" />
      {HEALTH[status].label}
    </span>
  )
}

function HealthNode({ data, selected }) {
  const StatusIcon = healthIcons[data.status]
  return (
    <div
      style={nodeDimensions}
      className={`health-node ${data.kind}-node health-node-${data.status}${selected ? ' is-selected' : ''}${data.connectionRole ? ` health-node-${data.connectionRole}` : ''}`}
    >
      <NodeHandles />
      <StatusIcon size={16} role="img" aria-label={HEALTH[data.status].label} className="node-status" />
      <div className="device-copy">
        <strong className={data.ip && data.label === data.ip ? 'device-ip-label' : undefined}>{data.label}</strong>
      </div>
      <InfoTooltip label={`Information for ${data.label}`}>
        <strong>{data.label}</strong>
        <span>
          {data.kind === 'router' ? 'Router' : 'Switch'} · {data.ip || 'No address'}
        </span>
        <span>
          {HEALTH[data.status].label} · Last check {formatCheckTime(data.checkedAt)}
        </span>
      </InfoTooltip>
    </div>
  )
}

const nodeTypes = {
  health: memo(HealthNode, (previous, next) => {
    const a = previous.data,
      b = next.data
    return (
      previous.selected === next.selected &&
      a.label === b.label &&
      a.ip === b.ip &&
      a.kind === b.kind &&
      a.status === b.status &&
      a.checkedAt === b.checkedAt &&
      a.connectionRole === b.connectionRole
    )
  }),
}
const NO_CHECKS = {}
const NO_OBSTACLES = []

export default function Dashboard({
  nodes: inventory,
  edges: inventoryEdges,
  groups: draftGroups = [],
  showInventory = false,
  onEdit,
  viewer = false,
  remote = false,
  viewOptions,
  setViewOptions,
}) {
  const { source, layout: mapLayout, centerId } = viewOptions
  const setSource = (source) => setViewOptions((previous) => ({ ...previous, source }))
  const setMapLayout = (layout) => setViewOptions((previous) => ({ ...previous, layout }))
  const setCenterId = (centerId) => setViewOptions((previous) => ({ ...previous, centerId }))
  const host = useMonitoring(source === 'host')
  const live = source === 'host' && host.snapshot
  const staleAfterMs = live ? live.freshness.staleAfterMs : 90_000
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [highlightedId, setHighlightedId] = useState(null)
  const [showPortLabels, setShowPortLabels] = useState(true)
  const [showAllLinks, setShowAllLinks] = useState(false)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!dragging) return
    const stop = () => setDragging(false)
    window.addEventListener('blur', stop)
    return () => window.removeEventListener('blur', stop)
  }, [dragging])
  const [nodeSizes, setNodeSizes] = useState({})
  const [localNow, setNow] = useState(() => Date.now())
  const now = Math.max(localNow, Date.parse(host.receivedAt) || 0) + (host.clockOffset ?? 0)
  const {
    nodes,
    edges: sourceEdges,
    checks,
  } = live
    ? { nodes: live.inventory.topology.nodes, edges: live.inventory.topology.edges, checks: live.checks }
    : { nodes: inventory, edges: inventoryEdges, checks: NO_CHECKS }
  const portEvidence = live?.uplinkPorts
  const portFreshness = live?.uplinkStaleAfterMs
  const deadline = useMemo(
    () => nextEvidenceChange(checks, staleAfterMs, portEvidence, portFreshness, now),
    [checks, staleAfterMs, portEvidence, portFreshness, now],
  )
  const clockOffset = host.clockOffset ?? 0
  useEffect(() => {
    const update = () => setNow(Date.now())
    const timer = Number.isFinite(deadline)
      ? window.setTimeout(update, Math.min(2147483647, Math.max(1, deadline - (Date.now() + clockOffset))))
      : undefined
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [deadline, clockOffset, localNow])
  const edges = useMemo(() => uniqueConnections(sourceEdges), [sourceEdges])
  const dense = edges.length >= 30
  const groups = live ? (live.inventory.topology.groups ?? []) : draftGroups
  const paths = useMemo(
    () =>
      new Map(
        sourceEdges.map((edge) => [
          edge.id,
          {
            edge,
            state: uplinkState(edge, portEvidence?.get(edge.id), now, portFreshness),
          },
        ]),
      ),
    [sourceEdges, portEvidence, now, portFreshness],
  )
  const effectiveCenterId = nodes.some((node) => node.id === centerId) ? centerId : ''
  const layoutNodes = useMemo(() => {
    const layout =
      mapLayout === 'radial'
        ? radialLayout(nodes, edges, effectiveCenterId, nodeSizes)
        : tidyLayout(nodes, edges, nodeSizes)
    return dense
      ? layout.map((node) => ({ ...node, position: { x: node.position.x * 1.25, y: node.position.y * 1.25 } }))
      : layout
  }, [nodes, edges, mapLayout, effectiveCenterId, nodeSizes, dense])
  const layoutKey = `${live ? 'host' : 'draft'}-${mapLayout}`
  const {
    positions: positionOverrides,
    onPositionChanges,
    moveByKey,
    finish: finishDrag,
  } = useLayoutDrag(layoutNodes, edges, `${layoutKey}-${effectiveCenterId}-${showInventory}`, nodeSizes)
  // Preserve React Flow's measured health-card dimensions across clock/filter
  // renders. Replacing controlled nodes without them resets initialization.
  const onDimensionsChange = useCallback((changes) => {
    const measured = changes.filter((change) => change.type === 'dimensions' && change.dimensions)
    if (!measured.length) return
    setNodeSizes((previous) => {
      let next = previous
      for (const change of measured) {
        const size = change.dimensions
        if (previous[change.id]?.width !== size.width || previous[change.id]?.height !== size.height) {
          if (next === previous) next = { ...previous }
          next[change.id] = size
        }
      }
      return next
    })
  }, [])
  const openIncidents = new Set((live?.activeIncidents || []).map((item) => item.deviceId))
  const needsAttention = (node) => ['down', 'stale'].includes(node.health) || openIncidents.has(node.id)
  const counts = useMemo(() => summarizeHealth(nodes, checks, now, staleAfterMs), [nodes, checks, now, staleAfterMs])
  const positioned = useMemo(
    () =>
      layoutNodes.map((node) => ({
        ...node,
        position: Object.hasOwn(positionOverrides, node.id) ? positionOverrides[node.id] : node.position,
      })),
    [layoutNodes, positionOverrides],
  )
  const devices = useMemo(
    () =>
      layoutNodes.map((node) => ({
        ...node,
        health: deviceHealth(checks[node.id], now, staleAfterMs),
      })),
    [layoutNodes, checks, now, staleAfterMs],
  )

  const attention = devices.filter(needsAttention)
  const visible = useMemo(
    () =>
      devices.filter(
        (node) =>
          (statusFilter === 'all' || node.health === statusFilter) &&
          `${node.data.label} ${node.data.ip}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [devices, statusFilter, query],
  )
  const visibleIds = useMemo(() => new Set(visible.map((node) => node.id)), [visible])
  const cardsById = useMemo(
    () => new Map(positioned.map((node) => [node.id, mapCard({ ...node, measured: nodeSizes[node.id] })])),
    [positioned, nodeSizes],
  )
  const cards = useMemo(() => [...cardsById.values()], [cardsById])
  const routeCards =
    dense && (showAllLinks || dragging)
      ? NO_OBSTACLES
      : visibleIds.size === positioned.length
        ? cards
        : visible.map(({ id }) => cardsById.get(id))
  const selected = devices.find((node) => node.id === selectedId)
  const devicesById = new Map(devices.map((node) => [node.id, node]))
  const highlightedDevice = devicesById.get(highlightedId)
  const connectedIds = useMemo(() => connectedDevices(highlightedId, nodes, edges), [highlightedId, nodes, edges])
  const mapEdges = edges
    .filter(
      (edge) =>
        visibleIds.has(edge.source) &&
        visibleIds.has(edge.target) &&
        (!dense || showAllLinks || edge.source === highlightedId || edge.target === highlightedId),
    )
    .map((edge) => {
      const source = devicesById.get(edge.source),
        target = devicesById.get(edge.target)
      const status = connectionHealth(source?.health, target?.health)
      const label = {
        up: 'Both endpoints up',
        down: 'Endpoint down',
        stale: 'Stale endpoint data',
        unknown: 'Endpoint reachability unknown',
      }[status]
      const portLabel = /^(?:Last seen on |LLDP · )/.test(edge.label)
        ? edge.label.replace(/^(?:Last seen on |LLDP · )/, '')
        : undefined
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: 'radial-source-right',
        targetHandle: 'radial-target-left',
        data: {
          source: cardsById.get(edge.source),
          target: cardsById.get(edge.target),
          cards: routeCards,
          maxBlockers: dense ? 8 : undefined,
          layered: mapLayout === 'tidy',
        },
        type: 'mapLink',
        label: showPortLabels && !(dense && (showAllLinks || dragging)) ? portLabel : undefined,
        labelStyle: { fill: 'var(--text)', fontSize: 14, fontWeight: 650 },
        ariaLabel: `${source?.data.label} and ${target?.data.label}: ${label}${portLabel ? `, ${edge.label}` : ''}`,
        className: `health-path-${status}${highlightedDevice && (edge.source === highlightedId || edge.target === highlightedId) ? ' health-path-highlighted' : ''}`,
        style: {
          stroke: HEALTH[status].color,
          strokeWidth:
            highlightedDevice && (edge.source === highlightedId || edge.target === highlightedId) ? 3.5 : 1.75,
          opacity: highlightedDevice && edge.source !== highlightedId && edge.target !== highlightedId ? 0.18 : 1,
          strokeDasharray: status === 'down' ? '7 5' : status === 'unknown' ? '3 5' : undefined,
        },
      }
    })
  const connections = selected
    ? edges
        .filter((edge) => edge.source === selected.id || edge.target === selected.id)
        .map((edge) => {
          const device = devicesById.get(edge.source === selected.id ? edge.target : edge.source)
          return {
            id: edge.id,
            device,
            label: edge.label,
            health: connectionHealth(selected.health, device?.health),
            uplink: edge.uplink,
            portStatus: uplinkLabels[paths.get(edge.id)?.state],
            localPort: edge.uplink?.[edge.source === selected.id ? 'source' : 'target'],
            peerPort: edge.uplink?.[edge.source === selected.id ? 'target' : 'source'],
          }
        })
        .filter((item) => item.device)
    : []

  const selectDevice = useCallback((node) => {
    setHighlightedId(node.id)
    setSelectedId(node.id)
  }, [])
  const keyboard = useCallback(
    (node) => ({
      onKeyUp: (event) => {
        if (event.key.startsWith('Arrow')) finishDrag()
      },
      onKeyDown: (event) => {
        if (event.target !== event.currentTarget || moveByKey(event, node)) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          selectDevice(node)
        }
      },
    }),
    [finishDrag, moveByKey, selectDevice],
  )
  const baseMapNodes = useMemo(
    () =>
      showInventory
        ? []
        : devices.map((node) => ({
            ...node,
            measured: nodeSizes[node.id],
            type: 'health',
            ariaRole: 'group',
            domAttributes: keyboard(node),
            hidden: !visibleIds.has(node.id),
            selected: selectedId === node.id,
            ariaLabel: `${node.data.label}, ${node.type === 'router' ? 'Router' : 'Switch'}, ${HEALTH[node.health].label}.${highlightedDevice ? (node.id === highlightedId ? ' Connection focus.' : connectedIds.has(node.id) ? ` Directly connected to ${highlightedDevice.data.label}.` : '') : ''} Open device details`,
            data: {
              ...node.data,
              kind: node.type,
              status: node.health,
              checkedAt: checks[node.id]?.checkedAt,
              connectionRole: highlightedDevice
                ? node.id === highlightedId
                  ? 'focus'
                  : connectedIds.has(node.id)
                    ? 'connected'
                    : 'muted'
                : '',
            },
          })),
    [
      showInventory,
      devices,
      nodeSizes,
      keyboard,
      visibleIds,
      selectedId,
      highlightedDevice,
      highlightedId,
      connectedIds,
      checks,
    ],
  )
  const mapNodes = useMemo(
    () =>
      baseMapNodes.map((node) => {
        if (!Object.hasOwn(positionOverrides, node.id)) return node
        const moved = { ...node, position: positionOverrides[node.id] }
        return { ...moved, domAttributes: keyboard(moved) }
      }),
    [baseMapNodes, positionOverrides, keyboard],
  )

  return (
    <section
      className={`health-dashboard${showInventory ? ' is-inventory' : ''}`}
      id={showInventory ? 'inventory-page' : 'dashboard'}
      aria-label="Network health dashboard"
    >
      <header className="health-page-titlebar">
        <div className="health-title">
          <h1>{showInventory ? 'Devices' : 'Your network'}</h1>
          <p
            className={source === 'host' && host.state !== 'connected' && host.hasConnected ? 'connection-lost' : ''}
            role="status"
          >
            {source === 'browser'
              ? 'Draft map · No live checks'
              : `${host.state === 'connected' ? (host.transport === 'sse' ? 'Live' : 'Connected · Checking periodically') : host.state === 'reconnecting' ? 'Reconnecting…' : host.state === 'disconnected' ? 'Disconnected' : 'Waiting for host'}${live ? '' : ' · Showing draft'}`}
          </p>
          {live && (
            <InfoTooltip label="Monitoring information">
              <span>{collectorLabel(live.collector.state)}</span>
              <span>Updated {formatCheckTime(host.receivedAt ?? live.generatedAt)}</span>
            </InfoTooltip>
          )}
          {showInventory && highlightedDevice && (
            <p className="health-highlight-status" role="status">
              {highlightedDevice.data.label} · {connectedIds.size} connected{' '}
              {connectedIds.size === 1 ? 'device' : 'devices'}
            </p>
          )}
        </div>
        <div className="health-map-tools">
          <label className="health-filter">
            Status{' '}
            <select
              aria-label="Device status filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All devices ({counts.all})</option>
              {Object.entries(HEALTH).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label} ({counts[key]})
                </option>
              ))}
            </select>
          </label>
          <label className="health-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search dashboard devices"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a device"
            />
          </label>
          {!showInventory && dense && (
            <button
              className="health-button"
              aria-pressed={showAllLinks}
              onClick={() => setShowAllLinks((shown) => !shown)}
            >
              Show all links
            </button>
          )}
          {showInventory && highlightedDevice && (
            <button
              className="health-button"
              aria-label="Clear connection highlight"
              onClick={() => {
                setHighlightedId(null)
                setSelectedId(null)
              }}
            >
              Clear highlight
            </button>
          )}
          <details className="health-view-options">
            <summary>View options{statusFilter !== 'all' || query ? ' · Filtered' : ''}</summary>
            <div>
              {!showInventory && (
                <button
                  className="health-button"
                  aria-pressed={showPortLabels}
                  onClick={() => setShowPortLabels((shown) => !shown)}
                >
                  Port labels
                </button>
              )}
              {!viewer && (
                <label className="health-filter">
                  Show{' '}
                  <select
                    aria-label="Network source"
                    value={source}
                    onChange={(event) => {
                      setSource(event.target.value)
                      setSelectedId(null)
                      setHighlightedId(null)
                      finishDrag()
                    }}
                  >
                    <option value="host">Monitored network</option>
                    <option value="browser">Draft map</option>
                  </select>
                </label>
              )}
              {source === 'host' && (
                <button className="health-button" onClick={host.refresh}>
                  Refresh now
                </button>
              )}
              <label className="health-filter">
                Map layout{' '}
                <select
                  aria-label="Map layout"
                  value={mapLayout}
                  onChange={(event) => {
                    finishDrag()
                    setMapLayout(event.target.value)
                  }}
                >
                  <option value="radial">Circle</option>
                  <option value="tidy">Tidy layout</option>
                </select>
              </label>
              {mapLayout === 'radial' && (
                <>
                  <label className="health-filter">
                    Center{' '}
                    <select
                      aria-label="Radial center"
                      value={effectiveCenterId}
                      onChange={(event) => {
                        finishDrag()
                        setCenterId(event.target.value)
                      }}
                    >
                      <option value="">Automatic</option>
                      {nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.data.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <div className="health-view-note">
                <span>
                  {visible.length} of {nodes.length} devices
                </span>
                <InfoTooltip label="About this map">
                  <span>Moves reset when you leave the map, switch browser tabs, or reload.</span>
                  <span>Line colors show device reachability. Open a device for its port status.</span>
                </InfoTooltip>
              </div>
            </div>
          </details>
        </div>
      </header>
      <div className="health-overview">
        <div className="health-summary" aria-label="Device health summary">
          {Object.entries({ up: 'up', down: 'down', stale: 'overdue', unknown: 'not monitored' }).map(
            ([key, label], index) => (
              <span key={key}>
                {index > 0 && ' · '}
                <button
                  className={`summary-${key}`}
                  aria-pressed={statusFilter === key}
                  onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
                >
                  {counts[key]} {label}
                </button>
              </span>
            ),
          )}
        </div>
        {attention.length > 0 && (
          <details className="health-attention">
            <summary>Needs attention ({attention.length})</summary>
            <div>
              {attention.map((node) => (
                <button className="health-button" key={node.id} onClick={() => selectDevice(node)}>
                  {node.data.label} · {HEALTH[node.health].label}
                  {openIncidents.has(node.id) ? ' · Open outage' : ''}
                </button>
              ))}
            </div>
          </details>
        )}
        {groups.length > 0 && (
          <details className="health-attention redundancy-details">
            <summary>Redundancy groups ({groups.length})</summary>
            <div className="redundancy-summary">
              <p>Group status uses observed port states. Failover requires a separate check.</p>
              {groups.map((group) => {
                const members = group.links.map((id) => paths.get(id))
                return (
                  <div key={group.id}>
                    <strong>
                      {group.name} · {redundancyState(members.map((member) => member?.state ?? 'unknown'))}
                    </strong>
                    <ul>
                      {members.map((member, index) => (
                        <li key={group.links[index]}>
                          {member?.edge.uplink?.label ||
                            `${devicesById.get(member?.edge.source)?.data.label ?? 'Unknown device'} ↔ ${devicesById.get(member?.edge.target)?.data.label ?? 'Unknown device'}`}
                          {' · '}
                          {uplinkLabels[member?.state ?? 'unknown']}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </details>
        )}
      </div>
      {source === 'host' && host.hasConnected && host.error && (
        <p className="health-connection-note" role="status">
          Open the NetWatch Windows app and choose Start to resume updates.
        </p>
      )}
      {showInventory ? (
        <section className="health-inventory health-panel" id="inventory">
          <div className="health-panel-title">
            <h2>
              All devices <span className="health-inventory-count">{visible.length}</span>
            </h2>
            <span>{live ? 'Monitored network' : 'Draft map'}</span>
          </div>
          <div className="health-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">IP address</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last check</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((node) => (
                  <tr
                    key={node.id}
                    className={
                      highlightedDevice && (node.id === highlightedId || connectedIds.has(node.id))
                        ? 'is-connected'
                        : selectedId === node.id
                          ? 'is-selected'
                          : ''
                    }
                  >
                    <th scope="row">
                      <span className="health-table-device">
                        {node.type === 'router' ? (
                          <Router size={16} aria-hidden="true" />
                        ) : (
                          <Network size={16} aria-hidden="true" />
                        )}
                        {node.data.label}
                      </span>
                    </th>
                    <td className="health-address">{node.data.ip || 'Not configured'}</td>
                    <td>
                      <Status status={node.health} />
                    </td>
                    <td>{formatCheckTime(checks[node.id]?.checkedAt)}</td>
                    <td>
                      <button
                        className="health-row-button"
                        aria-haspopup="dialog"
                        aria-label={`View details for ${node.data.label}`}
                        onClick={() => selectDevice(node)}
                      >
                        Details <ArrowUpRight size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="health-device-cards">
              {visible.map((node) => (
                <article key={node.id} className="health-device-card">
                  <strong>{node.data.label}</strong>
                  <Status status={node.health} />
                  <InfoTooltip label={`Information for ${node.data.label}`}>
                    <span>{node.data.ip || 'No address'}</span>
                    <span>Last check {formatCheckTime(checks[node.id]?.checkedAt)}</span>
                  </InfoTooltip>
                  <button
                    className="health-row-button"
                    aria-haspopup="dialog"
                    aria-label={`View details for ${node.data.label}`}
                    onClick={() => selectDevice(node)}
                  >
                    Details <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
            {!visible.length && <p className="health-table-empty">No devices match this view.</p>}
          </div>
        </section>
      ) : (
        <div className={`health-map${dense || nodes.length >= 120 ? ' health-map-large' : ''}`}>
          <ReactFlow
            key={`${layoutKey}-${effectiveCenterId}`}
            onNodesChange={(changes) => {
              onDimensionsChange(changes)
              onPositionChanges(changes)
            }}
            nodes={mapNodes}
            edges={mapEdges}
            nodeTypes={nodeTypes}
            edgeTypes={mapEdgeTypes}
            onMoveStart={() => document.dispatchEvent(new Event('mapviewportchange'))}
            onNodeClick={(_, node) => selectDevice(node)}
            onPaneClick={() => {
              setSelectedId(null)
              setHighlightedId(null)
            }}
            nodesDraggable={!viewer}
            onlyRenderVisibleElements={nodes.length >= 120}
            nodesConnectable={false}
            multiSelectionKeyCode={null}
            nodeDragThreshold={3}
            nodeClickDistance={3}
            onNodeDragStart={(_, node) => {
              if (dense) setDragging(true)
              setHighlightedId(node.id)
              setSelectedId(null)
            }}
            onNodeDragStop={() => {
              setDragging(false)
              finishDrag()
            }}
            edgesFocusable={false}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: '16px' }}
            minZoom={mapLayout === 'radial' ? 0.0001 : 0.05}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
          >
            <MapControls showInteractive={false} />
          </ReactFlow>
          {!visible.length && (
            <div className="health-empty-map">
              <Network size={25} aria-hidden="true" />
              <strong>{nodes.length ? 'No matching devices' : 'Your network starts here'}</strong>
              <p>
                {nodes.length
                  ? 'Try another name or status filter.'
                  : viewer
                    ? 'There are no devices on the monitored map yet.'
                    : 'Create a map, then choose which devices to monitor.'}
              </p>
              {(!viewer || nodes.length > 0) && (
                <button
                  className="health-button"
                  onClick={
                    nodes.length
                      ? () => {
                          setQuery('')
                          setStatusFilter('all')
                        }
                      : onEdit
                  }
                >
                  {nodes.length ? 'Clear filters' : 'Create your map'}
                </button>
              )}
            </div>
          )}
          {highlightedDevice && (
            <div className="health-map-focus-controls nodrag nopan">
              <p className="health-highlight-status" role="status">
                {highlightedDevice.data.label} · {connectedIds.size} connected{' '}
                {connectedIds.size === 1 ? 'device' : 'devices'}
              </p>
              <button
                className="health-button"
                aria-label="Clear connection highlight"
                onClick={() => {
                  setHighlightedId(null)
                  setSelectedId(null)
                }}
              >
                Clear highlight
              </button>
            </div>
          )}
          {dense && !showAllLinks && !highlightedDevice && visible.length > 0 && (
            <div className="health-map-focus-controls">
              <p className="health-highlight-status">Select a device to trace its links.</p>
            </div>
          )}
        </div>
      )}
      {selected && (
        <DeviceDetails
          key={`${source}-${selected.id}`}
          host={live ? host : null}
          viewer={viewer}
          remote={remote}
          device={selected}
          check={checks[selected.id]}
          connections={connections}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  )
}
