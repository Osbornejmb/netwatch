import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow, Controls } from '@xyflow/react'
import { ArrowDownCircle, ArrowUpRight, CheckCircle2, CircleHelp, Clock3, Network, Router, Search } from 'lucide-react'
import { HEALTH, deviceHealth, summarizeHealth, connectionHealth } from './health'
import DeviceDetails from './DeviceDetails'
import useMonitoring from './useMonitoring'
import { formatCheckTime, collectorLabel } from './monitoring'
import { radialLayout, radialHandles, connectedDevices } from './radial'

import { nodeDimensions } from './nodes/dimensions'
import { NodeHandles } from './nodes/DeviceNode'
import './dashboard.css'

const healthIcons = { up: CheckCircle2, down: ArrowDownCircle, stale: Clock3, unknown: CircleHelp }

function Status({ status }) {
  const Icon = healthIcons[status]
  return <span className={`health-status health-${status}`}><Icon size={13} aria-hidden="true"/>{HEALTH[status].label}</span>
}

function HealthNode({ data, selected }) {
  const Icon = data.kind === 'router' ? Router : Network
  const StatusIcon = healthIcons[data.status]
  return <div style={nodeDimensions} className={`health-node ${data.kind}-node health-node-${data.status}${selected ? ' is-selected' : ''}${data.connectionRole ? ` health-node-${data.connectionRole}` : ''}`}>
    <NodeHandles/>
    <span className="health-device-icon"><Icon size={18} aria-hidden="true"/></span>
    <div className="device-copy"><strong title={data.label}>{data.label}</strong><span className="health-address" title={data.ip}>{data.ip || 'No address'}</span></div>
    <StatusIcon size={14} role="img" aria-label={HEALTH[data.status].label} className="node-status"/>
  </div>

}

const nodeTypes = { health: HealthNode }
const NO_CHECKS = {}

export default function Dashboard({ nodes: inventory, edges: inventoryEdges, showInventory = false, onEdit, onMoveDevice }) {
  const [source, setSource] = useState('host')
  const host = useMonitoring(source === 'host')
  const live = source === 'host' && host.snapshot
  const staleAfterMs = live ? live.freshness.staleAfterMs : 90_000
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [mapLayout, setMapLayout] = useState('manual')
  const [centerId, setCenterId] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [highlightedId, setHighlightedId] = useState(null)
  const [nodeSizes, setNodeSizes] = useState({})
  const [dragState, setDragState] = useState({ source: null, key: '', positions: {} })
  const [resetKey, setResetKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const timer = window.setInterval(update, 1000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  const { nodes, edges, checks } = live ? { nodes: live.inventory.topology.nodes, edges: live.inventory.topology.edges, checks: live.checks } : { nodes: inventory, edges: inventoryEdges, checks: NO_CHECKS }
  const effectiveCenterId = nodes.some(node => node.id === centerId) ? centerId : ''
  const layoutNodes = useMemo(() => mapLayout === 'radial' ? radialLayout(nodes, edges, effectiveCenterId) : nodes, [nodes, edges, mapLayout, effectiveCenterId])
  const layoutKey = `${live ? 'host' : 'inventory'}-${mapLayout}-${effectiveCenterId}`
  const positionOverrides = dragState.source === nodes && dragState.key === layoutKey ? dragState.positions : {}
  const hasViewPositions = (live || mapLayout === 'radial') && Object.keys(positionOverrides).length > 0
  // Preserve React Flow's measured health-card dimensions across clock/filter
  // renders. Replacing controlled nodes without them resets initialization.
  const onNodesChange = useCallback(changes => {
    const measured = changes.filter(change => change.type === 'dimensions' && change.dimensions)
    const moved = changes.filter(change => change.type === 'position' && change.position && Number.isFinite(change.position.x) && Number.isFinite(change.position.y))
    if (moved.length) setDragState(previous => {
      const positions = previous.source === nodes && previous.key === layoutKey ? previous.positions : {}
      return { source: nodes, key: layoutKey, positions: { ...positions, ...Object.fromEntries(moved.map(change => [change.id, change.position])) } }
    })
    if (!measured.length) return
    setNodeSizes(previous => {
      let next = previous
      for (const change of measured) {
        const size = change.dimensions
        if (previous[change.id]?.width !== size.width || previous[change.id]?.height !== size.height) {
          next = { ...next, [change.id]: size }
        }
      }
      return next
    })
  }, [nodes, layoutKey])
  const openIncidents = new Set((live?.activeIncidents || []).map(item => item.deviceId))
  const needsAttention = node => ['down', 'stale'].includes(node.health) || openIncidents.has(node.id)
  const counts = summarizeHealth(nodes, checks, now, staleAfterMs)
  const devices = layoutNodes.map(node => ({ ...node, position: positionOverrides[node.id] || node.position, health: deviceHealth(checks[node.id], now, staleAfterMs) }))

  const visible = devices.filter(node => (statusFilter === 'all' || node.health === statusFilter) && `${node.data.label} ${node.data.ip}`.toLowerCase().includes(query.trim().toLowerCase()))
  const visibleIds = new Set(visible.map(node => node.id))
  const selected = devices.find(node => node.id === selectedId)
  const devicesById = new Map(devices.map(node => [node.id, node]))
  const highlightedDevice = devicesById.get(highlightedId)
  const connectedIds = useMemo(() => connectedDevices(highlightedId, nodes, edges), [highlightedId, nodes, edges])
  const mapEdges = edges.map(edge => {
    const source = devicesById.get(edge.source), target = devicesById.get(edge.target)
    const status = connectionHealth(source?.health, target?.health)
    const label = { up: 'Both endpoints up', down: 'Endpoint down', stale: 'Stale endpoint data', unknown: 'Endpoint reachability unknown' }[status]
    return { id: edge.id, source: edge.source, target: edge.target,
      ...radialHandles(source.position, target.position),
      hidden: !visibleIds.has(edge.source) || !visibleIds.has(edge.target),
      type: 'straight',
      ariaLabel: `${source?.data.label} to ${target?.data.label}: ${label}`,
      className: `health-path-${status}${highlightedDevice && (edge.source === highlightedId || edge.target === highlightedId) ? ' health-path-highlighted' : ''}`,
      style: { stroke: HEALTH[status].color, strokeWidth: highlightedDevice && (edge.source === highlightedId || edge.target === highlightedId) ? 5 : 3, opacity: highlightedDevice && edge.source !== highlightedId && edge.target !== highlightedId ? 0.18 : 1, strokeDasharray: status === 'down' ? '7 5' : status === 'unknown' ? '3 5' : undefined },
    }
  })
  const connections = selected ? edges.filter(edge => edge.source === selected.id || edge.target === selected.id).map(edge => {
    const device = devicesById.get(edge.source === selected.id ? edge.target : edge.source)
    return { id: edge.id, device, health: connectionHealth(selected.health, device?.health) }
  }).filter(item => item.device) : []

  const selectDevice = node => { setHighlightedId(node.id); setSelectedId(node.id) }

  const finishDrag = (_, node) => {
    if (!live && mapLayout === 'manual' && onMoveDevice && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)) onMoveDevice(node.id, node.position)
  }
  const resetViewPositions = () => {
    setDragState({ source: null, key: '', positions: {} })
    setResetKey(value => value + 1)
  }

  return <section className={`health-dashboard${showInventory ? ' is-inventory' : ''}`} id={showInventory ? 'inventory-page' : 'dashboard'} aria-label="Network health dashboard">
    <header className="health-page-titlebar">
      <div><h1>{showInventory ? 'Devices' : 'Your network'}</h1><p className={source === 'host' && host.state !== 'connected' && host.hasConnected ? 'connection-lost' : ''} role="status">{source === 'browser' ? 'Draft map · No live checks' : `${host.state === 'connected' ? 'Connected' : host.hasConnected ? 'Connection lost, reconnecting' : 'Waiting for host'}${live ? ` · ${collectorLabel(live.collector.state)} · Updated ${formatCheckTime(live.generatedAt)}` : ' · Draft shown without live checks'}`}</p>{showInventory && highlightedDevice && <p className="health-highlight-status" role="status">{highlightedDevice.data.label} · {connectedIds.size} connected {connectedIds.size === 1 ? 'device' : 'devices'}</p>}</div>
      <div className="health-map-tools">
          <label className="health-filter">Status <select aria-label="Device status filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All devices ({counts.all})</option>{Object.entries(HEALTH).map(([key, value]) => <option key={key} value={key}>{value.label} ({counts[key]})</option>)}</select></label>
        <label className="health-search"><Search size={16} aria-hidden="true"/><input aria-label="Search dashboard devices" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a device"/></label>
        {showInventory && highlightedDevice && <button className="health-button" aria-label="Clear connection highlight" onClick={() => { setHighlightedId(null); setSelectedId(null) }}>Clear highlight</button>}
        <details className="health-view-options"><summary>View options{statusFilter !== 'all' || query ? ' · Filtered' : ''}</summary><div>
          <label className="health-filter">Show <select aria-label="Network source" value={source} onChange={event => { setSource(event.target.value); setSelectedId(null); setHighlightedId(null); setDragState({ source: null, key: '', positions: {} }) }}><option value="host">Monitored network</option><option value="browser">Draft map</option></select></label>
          {source === 'host' && <button className="health-button" onClick={host.refresh}>Refresh now</button>}
          <label className="health-filter">Map layout <select aria-label="Map layout" value={mapLayout} onChange={event => { setDragState({ source: null, key: '', positions: {} }); setMapLayout(event.target.value) }}><option value="manual">Saved positions</option><option value="radial">Circle</option></select></label>
          {mapLayout === 'radial' && <><label className="health-filter">Center <select aria-label="Radial center" value={effectiveCenterId} onChange={event => { setDragState({ source: null, key: '', positions: {} }); setCenterId(event.target.value) }}><option value="">Automatic</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></label><p className="health-map-count">This arranges devices in rings without changing your saved map.</p></>}
          <p className="health-map-count">{visible.length} of {nodes.length} devices</p><details className="view-help"><summary>About this map</summary><p className="health-map-count">Click a device for details; drag it to rearrange the map.</p><p className="health-map-count">Only draft-map moves in Saved positions are saved.</p><p className="health-map-count">Line colors follow device checks; they do not confirm a cable or port is working.</p></details>
        </div></details>
      </div>
    </header>
    <div className="health-summary" aria-label="Device health summary">{Object.entries({ up: 'up', down: 'down', stale: 'overdue', unknown: 'not monitored' }).map(([key, label], index) => <span key={key}>{index > 0 && ' · '}<button className={`summary-${key}`} aria-pressed={statusFilter === key} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}>{counts[key]} {label}</button></span>)}</div>
    {devices.some(needsAttention) && <div className="health-attention"><p>Needs attention ({devices.filter(needsAttention).length})</p>{devices.filter(needsAttention).map(node => <button className="health-button" key={node.id} onClick={() => selectDevice(node)}>{node.data.label} · {HEALTH[node.health].label}{openIncidents.has(node.id) ? ' · Open outage' : ''}</button>)}</div>}
    {source === 'host' && host.hasConnected && host.error && <p className="health-connection-note" role="status">Open the NetWatch Windows app and choose Start to resume updates.</p>}
    {showInventory ? (
    <section className="health-inventory health-panel" id="inventory"><div className="health-panel-title"><h2>All devices <span className="health-inventory-count">{visible.length}</span></h2><span>{live ? 'Monitored network' : 'Draft map'}</span></div>
      <div className="health-table-wrap"><table><thead><tr><th scope="col">Device</th><th scope="col">IP address</th><th scope="col">Status</th><th scope="col">Last check</th><th scope="col">Details</th></tr></thead><tbody>{visible.map(node => <tr key={node.id} className={highlightedDevice && (node.id === highlightedId || connectedIds.has(node.id)) ? 'is-connected' : selectedId === node.id ? 'is-selected' : ''}><th scope="row"><span className="health-table-device">{node.type === 'router' ? <Router size={16} aria-hidden="true"/> : <Network size={16} aria-hidden="true"/>}{node.data.label}</span></th><td className="health-address">{node.data.ip || 'Not configured'}</td><td><Status status={node.health}/></td><td>{formatCheckTime(checks[node.id]?.checkedAt)}</td><td><button className="health-row-button" aria-haspopup="dialog" aria-label={`View details for ${node.data.label}`} onClick={() => selectDevice(node)}>Details <ArrowUpRight size={14} aria-hidden="true"/></button></td></tr>)}</tbody></table><div className="health-device-cards">{visible.map(node => <article key={node.id} className="health-device-card"><strong>{node.data.label}</strong><span className="health-address">{node.data.ip || 'Not configured'}</span><Status status={node.health}/><span>Last check: {formatCheckTime(checks[node.id]?.checkedAt)}</span><button className="health-row-button" aria-haspopup="dialog" aria-label={`View details for ${node.data.label}`} onClick={() => selectDevice(node)}>Details <ArrowUpRight size={14} aria-hidden="true"/></button></article>)}</div>{!visible.length && <p className="health-table-empty">No devices match this view.</p>}</div>
    </section>
    ) : (
        <div className="health-map">
          <ReactFlow key={`${layoutKey}-${resetKey}`} onNodesChange={onNodesChange}
            nodes={devices.map(node => ({ ...node, measured: nodeSizes[node.id], type: 'health', ariaRole: 'button', domAttributes: { 'aria-haspopup': 'dialog', onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectDevice(node) } } }, hidden: !visibleIds.has(node.id), selected: selectedId === node.id, ariaLabel: `${node.data.label}, ${node.type === "router" ? "Router" : "Switch"}, ${HEALTH[node.health].label}.${highlightedDevice ? node.id === highlightedId ? ' Connection focus.' : connectedIds.has(node.id) ? ` Directly connected to ${highlightedDevice.data.label}.` : '' : ''} Open device details`, data: { ...node.data, kind: node.type, status: node.health, radial: mapLayout === 'radial', connectionRole: highlightedDevice ? node.id === highlightedId ? 'focus' : connectedIds.has(node.id) ? 'connected' : 'muted' : '' } }))}
            edges={mapEdges}
            nodeTypes={nodeTypes} onNodeClick={(_, node) => selectDevice(node)} onPaneClick={() => { setSelectedId(null); setHighlightedId(null) }}
            nodesDraggable nodesConnectable={false} multiSelectionKeyCode={null} nodeDragThreshold={3} nodeClickDistance={5}
            onNodeDragStart={(_, node) => { setHighlightedId(node.id); setSelectedId(null) }} onNodeDragStop={finishDrag} edgesFocusable={false} deleteKeyCode={null}
            fitView fitViewOptions={{ padding: 0.12 }} minZoom={mapLayout === 'radial' ? 0.0001 : 0.05} maxZoom={1.6} proOptions={{ hideAttribution: true }}>
            <Controls showInteractive={false}/>
          </ReactFlow>
          {!visible.length && <div className="health-empty-map"><Network size={25} aria-hidden="true"/><strong>{nodes.length ? 'No matching devices' : 'Your network starts here'}</strong><p>{nodes.length ? 'Try another name or status filter.' : 'Create a map, then choose which devices to monitor.'}</p><button className="health-button" onClick={nodes.length ? () => { setQuery(''); setStatusFilter('all') } : onEdit}>{nodes.length ? 'Clear filters' : 'Create your map'}</button></div>}
          {(highlightedDevice || hasViewPositions) && <div className="health-map-focus-controls nodrag nopan">
            {highlightedDevice && <p className="health-highlight-status" role="status">{highlightedDevice.data.label} · {connectedIds.size} connected {connectedIds.size === 1 ? 'device' : 'devices'}</p>}
            {highlightedDevice && <button className="health-button" aria-label="Clear connection highlight" onClick={() => { setHighlightedId(null); setSelectedId(null) }}>Clear highlight</button>}
            {hasViewPositions && <button className="health-button" aria-label="Reset positions" onClick={resetViewPositions}>{mapLayout === 'radial' ? 'Reset layout' : 'Reset positions'}</button>}
          </div>}
        </div>
    )}
    {selected && <DeviceDetails key={`${source}-${selected.id}-${live ? live.inventory.revision : "local"}`} host={live ? host : null} device={selected} check={checks[selected.id]} connections={connections} onClose={() => setSelectedId(null)}/>}
  </section>
}
