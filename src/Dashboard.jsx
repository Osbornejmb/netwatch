import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow } from '@xyflow/react'
import MapControls from './MapControls'
import { ArrowDownCircle, ArrowUpRight, CheckCircle2, CircleHelp, Clock3, Network, Router, Search } from 'lucide-react'
import { HEALTH, deviceHealth, summarizeHealth, connectionHealth } from './health'
import DeviceDetails from './DeviceDetails'
import useMonitoring from './useMonitoring'
import useLayoutDrag from './useLayoutDrag'
import { uniqueConnections } from './connections'
import { formatCheckTime, collectorLabel } from './monitoring'
import { tidyLayout, radialLayout, connectedDevices } from './radial'

import { nodeDimensions } from './nodes/dimensions'
import { NodeHandles } from './nodes/DeviceNode'
import { mapCard, mapEdgeTypes } from './nodes/MapEdge'
import InfoTooltip from './InfoTooltip'
import './dashboard.css'

const healthIcons = { up: CheckCircle2, down: ArrowDownCircle, stale: Clock3, unknown: CircleHelp }

function Status({ status }) {
  const Icon = healthIcons[status]
  return <span className={`health-status health-${status}`}><Icon size={13} aria-hidden="true"/>{HEALTH[status].label}</span>
}

function HealthNode({ data, selected }) {
  const StatusIcon = healthIcons[data.status]
  return <div style={nodeDimensions} className={`health-node ${data.kind}-node health-node-${data.status}${selected ? ' is-selected' : ''}${data.connectionRole ? ` health-node-${data.connectionRole}` : ''}`}>
    <NodeHandles/>
    <StatusIcon size={16} role="img" aria-label={HEALTH[data.status].label} className="node-status"/>
    <div className="device-copy"><strong className={data.ip && data.label === data.ip ? 'device-ip-label' : undefined}>{data.label}</strong></div>
    <InfoTooltip label={`Information for ${data.label}`}><strong>{data.label}</strong><span>{data.kind === 'router' ? 'Router' : 'Switch'} · {data.ip || 'No address'}</span><span>{HEALTH[data.status].label} · Last check {formatCheckTime(data.checkedAt)}</span></InfoTooltip>
  </div>

}

const nodeTypes = { health: HealthNode }
const NO_CHECKS = {}

export default function Dashboard({ nodes: inventory, edges: inventoryEdges, showInventory = false, onEdit, viewOptions, setViewOptions }) {
  const { source, layout: mapLayout, centerId } = viewOptions
  const setSource = source => setViewOptions(previous => ({ ...previous, source }))
  const setMapLayout = layout => setViewOptions(previous => ({ ...previous, layout }))
  const setCenterId = centerId => setViewOptions(previous => ({ ...previous, centerId }))
  const host = useMonitoring(source === 'host')
  const live = source === 'host' && host.snapshot
  const staleAfterMs = live ? live.freshness.staleAfterMs : 90_000
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [highlightedId, setHighlightedId] = useState(null)
  const [nodeSizes, setNodeSizes] = useState({})
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
  const { nodes, edges: sourceEdges, checks } = live ? { nodes: live.inventory.topology.nodes, edges: live.inventory.topology.edges, checks: live.checks } : { nodes: inventory, edges: inventoryEdges, checks: NO_CHECKS }
  const edges = useMemo(() => uniqueConnections(sourceEdges), [sourceEdges])
  const effectiveCenterId = nodes.some(node => node.id === centerId) ? centerId : ''
  const layoutNodes = useMemo(() => mapLayout === 'radial' ? radialLayout(nodes, edges, effectiveCenterId) : tidyLayout(nodes, edges), [nodes, edges, mapLayout, effectiveCenterId])
  const layoutKey = `${live ? 'host' : 'draft'}-${mapLayout}`
  const { positions: positionOverrides, onPositionChanges, moveByKey, finish: finishDrag } = useLayoutDrag(layoutNodes, edges, `${layoutKey}-${effectiveCenterId}-${showInventory}`, nodeSizes)
  // Preserve React Flow's measured health-card dimensions across clock/filter
  // renders. Replacing controlled nodes without them resets initialization.
  const onDimensionsChange = useCallback(changes => {
    const measured = changes.filter(change => change.type === 'dimensions' && change.dimensions)
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
  }, [])
  const openIncidents = new Set((live?.activeIncidents || []).map(item => item.deviceId))
  const needsAttention = node => ['down', 'stale'].includes(node.health) || openIncidents.has(node.id)
  const counts = summarizeHealth(nodes, checks, now, staleAfterMs)
  const devices = layoutNodes.map(node => ({ ...node, position: Object.hasOwn(positionOverrides, node.id) ? positionOverrides[node.id] : node.position, health: deviceHealth(checks[node.id], now, staleAfterMs) }))

  const attention = devices.filter(needsAttention)
  const visible = devices.filter(node => (statusFilter === 'all' || node.health === statusFilter) && `${node.data.label} ${node.data.ip}`.toLowerCase().includes(query.trim().toLowerCase()))
  const visibleIds = new Set(visible.map(node => node.id))
  const cardsById = new Map(visible.map(node => [node.id, mapCard({ ...node, measured: nodeSizes[node.id] })]))
  const cards = [...cardsById.values()]
  const selected = devices.find(node => node.id === selectedId)
  const devicesById = new Map(devices.map(node => [node.id, node]))
  const highlightedDevice = devicesById.get(highlightedId)
  const connectedIds = useMemo(() => connectedDevices(highlightedId, nodes, edges), [highlightedId, nodes, edges])
  const mapEdges = edges.map(edge => {
    const source = devicesById.get(edge.source), target = devicesById.get(edge.target)
    const status = connectionHealth(source?.health, target?.health)
    const label = { up: 'Both endpoints up', down: 'Endpoint down', stale: 'Stale endpoint data', unknown: 'Endpoint reachability unknown' }[status]
    return { id: edge.id, source: edge.source, target: edge.target,
      sourceHandle: 'radial-source-right', targetHandle: 'radial-target-left',
      data: { source: cardsById.get(edge.source), target: cardsById.get(edge.target), cards },
      hidden: !visibleIds.has(edge.source) || !visibleIds.has(edge.target),
      type: 'mapLink',
      ariaLabel: `${source?.data.label} and ${target?.data.label}: ${label}`,
      className: `health-path-${status}${highlightedDevice && (edge.source === highlightedId || edge.target === highlightedId) ? ' health-path-highlighted' : ''}`,
      style: { stroke: HEALTH[status].color, strokeWidth: highlightedDevice && (edge.source === highlightedId || edge.target === highlightedId) ? 3.5 : 1.75, opacity: highlightedDevice && edge.source !== highlightedId && edge.target !== highlightedId ? 0.18 : 1, strokeDasharray: status === 'down' ? '7 5' : status === 'unknown' ? '3 5' : undefined },
    }
  })
  const connections = selected ? edges.filter(edge => edge.source === selected.id || edge.target === selected.id).map(edge => {
    const device = devicesById.get(edge.source === selected.id ? edge.target : edge.source)
    return { id: edge.id, device, health: connectionHealth(selected.health, device?.health) }
  }).filter(item => item.device) : []

  const selectDevice = node => { setHighlightedId(node.id); setSelectedId(node.id) }

  return <section className={`health-dashboard${showInventory ? ' is-inventory' : ''}`} id={showInventory ? 'inventory-page' : 'dashboard'} aria-label="Network health dashboard">
    <header className="health-page-titlebar">
      <div className="health-title"><h1>{showInventory ? 'Devices' : 'Your network'}</h1><p className={source === 'host' && host.state !== 'connected' && host.hasConnected ? 'connection-lost' : ''} role="status">{source === 'browser' ? 'Draft map · No live checks' : `${host.state === 'connected' ? 'Connected' : host.hasConnected ? 'Connection lost, reconnecting' : 'Waiting for host'}${live ? '' : ' · Showing draft'}`}</p>{live && <InfoTooltip label="Monitoring information"><span>{collectorLabel(live.collector.state)}</span><span>Updated {formatCheckTime(live.generatedAt)}</span></InfoTooltip>}{showInventory && highlightedDevice && <p className="health-highlight-status" role="status">{highlightedDevice.data.label} · {connectedIds.size} connected {connectedIds.size === 1 ? 'device' : 'devices'}</p>}</div>
      <div className="health-map-tools">
          <label className="health-filter">Status <select aria-label="Device status filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All devices ({counts.all})</option>{Object.entries(HEALTH).map(([key, value]) => <option key={key} value={key}>{value.label} ({counts[key]})</option>)}</select></label>
        <label className="health-search"><Search size={16} aria-hidden="true"/><input aria-label="Search dashboard devices" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a device"/></label>
        {showInventory && highlightedDevice && <button className="health-button" aria-label="Clear connection highlight" onClick={() => { setHighlightedId(null); setSelectedId(null) }}>Clear highlight</button>}
        <details className="health-view-options"><summary>View options{statusFilter !== 'all' || query ? ' · Filtered' : ''}</summary><div>
          <label className="health-filter">Show <select aria-label="Network source" value={source} onChange={event => { setSource(event.target.value); setSelectedId(null); setHighlightedId(null); finishDrag() }}><option value="host">Monitored network</option><option value="browser">Draft map</option></select></label>
          {source === 'host' && <button className="health-button" onClick={host.refresh}>Refresh now</button>}
          <label className="health-filter">Map layout <select aria-label="Map layout" value={mapLayout} onChange={event => { finishDrag(); setMapLayout(event.target.value) }}><option value="radial">Circle</option><option value="tidy">Tidy layout</option></select></label>
          {mapLayout === 'radial' && <><label className="health-filter">Center <select aria-label="Radial center" value={effectiveCenterId} onChange={event => { finishDrag(); setCenterId(event.target.value) }}><option value="">Automatic</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></label></>}
          <div className="health-view-note"><span>{visible.length} of {nodes.length} devices</span><InfoTooltip label="About this map"><span>Moves reset when you leave the map, switch browser tabs, or reload.</span><span>Line colors show device reachability. Open a device for its port status.</span></InfoTooltip></div>
        </div></details>
      </div>
    </header>
    <div className="health-overview">
    <div className="health-summary" aria-label="Device health summary">{Object.entries({ up: 'up', down: 'down', stale: 'overdue', unknown: 'not monitored' }).map(([key, label], index) => <span key={key}>{index > 0 && ' · '}<button className={`summary-${key}`} aria-pressed={statusFilter === key} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}>{counts[key]} {label}</button></span>)}</div>
    {attention.length > 0 && <details className="health-attention"><summary>Needs attention ({attention.length})</summary><div>{attention.map(node => <button className="health-button" key={node.id} onClick={() => selectDevice(node)}>{node.data.label} · {HEALTH[node.health].label}{openIncidents.has(node.id) ? ' · Open outage' : ''}</button>)}</div></details>}
    </div>
    {source === 'host' && host.hasConnected && host.error && <p className="health-connection-note" role="status">Open the NetWatch Windows app and choose Start to resume updates.</p>}
    {showInventory ? (
    <section className="health-inventory health-panel" id="inventory"><div className="health-panel-title"><h2>All devices <span className="health-inventory-count">{visible.length}</span></h2><span>{live ? 'Monitored network' : 'Draft map'}</span></div>
      <div className="health-table-wrap"><table><thead><tr><th scope="col">Device</th><th scope="col">IP address</th><th scope="col">Status</th><th scope="col">Last check</th><th scope="col">Details</th></tr></thead><tbody>{visible.map(node => <tr key={node.id} className={highlightedDevice && (node.id === highlightedId || connectedIds.has(node.id)) ? 'is-connected' : selectedId === node.id ? 'is-selected' : ''}><th scope="row"><span className="health-table-device">{node.type === 'router' ? <Router size={16} aria-hidden="true"/> : <Network size={16} aria-hidden="true"/>}{node.data.label}</span></th><td className="health-address">{node.data.ip || 'Not configured'}</td><td><Status status={node.health}/></td><td>{formatCheckTime(checks[node.id]?.checkedAt)}</td><td><button className="health-row-button" aria-haspopup="dialog" aria-label={`View details for ${node.data.label}`} onClick={() => selectDevice(node)}>Details <ArrowUpRight size={14} aria-hidden="true"/></button></td></tr>)}</tbody></table><div className="health-device-cards">{visible.map(node => <article key={node.id} className="health-device-card"><strong>{node.data.label}</strong><Status status={node.health}/><InfoTooltip label={`Information for ${node.data.label}`}><span>{node.data.ip || 'No address'}</span><span>Last check {formatCheckTime(checks[node.id]?.checkedAt)}</span></InfoTooltip><button className="health-row-button" aria-haspopup="dialog" aria-label={`View details for ${node.data.label}`} onClick={() => selectDevice(node)}>Details <ArrowUpRight size={14} aria-hidden="true"/></button></article>)}</div>{!visible.length && <p className="health-table-empty">No devices match this view.</p>}</div>
    </section>
    ) : (
        <div className="health-map">
          <ReactFlow key={`${layoutKey}-${effectiveCenterId}`} onNodesChange={changes => { onDimensionsChange(changes); onPositionChanges(changes) }}
            nodes={devices.map(node => ({ ...node, measured: nodeSizes[node.id], type: 'health', ariaRole: 'group', domAttributes: { onKeyUp: event => { if (event.key.startsWith('Arrow')) finishDrag() }, onKeyDown: event => { if (event.target !== event.currentTarget || moveByKey(event, node)) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectDevice(node) } } }, hidden: !visibleIds.has(node.id), selected: selectedId === node.id, ariaLabel: `${node.data.label}, ${node.type === "router" ? "Router" : "Switch"}, ${HEALTH[node.health].label}.${highlightedDevice ? node.id === highlightedId ? ' Connection focus.' : connectedIds.has(node.id) ? ` Directly connected to ${highlightedDevice.data.label}.` : '' : ''} Open device details`, data: { ...node.data, kind: node.type, status: node.health, checkedAt: checks[node.id]?.checkedAt, connectionRole: highlightedDevice ? node.id === highlightedId ? 'focus' : connectedIds.has(node.id) ? 'connected' : 'muted' : '' } }))}
            edges={mapEdges}
            nodeTypes={nodeTypes} edgeTypes={mapEdgeTypes} onMoveStart={() => document.dispatchEvent(new Event('mapviewportchange'))} onNodeClick={(_, node) => selectDevice(node)} onPaneClick={() => { setSelectedId(null); setHighlightedId(null) }}
            nodesDraggable nodesConnectable={false} multiSelectionKeyCode={null} nodeDragThreshold={3} nodeClickDistance={5}
            onNodeDragStart={(_, node) => { setHighlightedId(node.id); setSelectedId(null) }} onNodeDragStop={finishDrag} edgesFocusable={false} deleteKeyCode={null}
            fitView fitViewOptions={{ padding: '16px' }} minZoom={mapLayout === 'radial' ? 0.0001 : 0.05} maxZoom={1.6} proOptions={{ hideAttribution: true }}>
            <MapControls showInteractive={false}/>
          </ReactFlow>
          {!visible.length && <div className="health-empty-map"><Network size={25} aria-hidden="true"/><strong>{nodes.length ? 'No matching devices' : 'Your network starts here'}</strong><p>{nodes.length ? 'Try another name or status filter.' : 'Create a map, then choose which devices to monitor.'}</p><button className="health-button" onClick={nodes.length ? () => { setQuery(''); setStatusFilter('all') } : onEdit}>{nodes.length ? 'Clear filters' : 'Create your map'}</button></div>}
          {highlightedDevice && <div className="health-map-focus-controls nodrag nopan">
            <p className="health-highlight-status" role="status">{highlightedDevice.data.label} · {connectedIds.size} connected {connectedIds.size === 1 ? 'device' : 'devices'}</p>
            <button className="health-button" aria-label="Clear connection highlight" onClick={() => { setHighlightedId(null); setSelectedId(null) }}>Clear highlight</button>
          </div>}
        </div>
    )}
    {selected && <DeviceDetails key={`${source}-${selected.id}-${live ? live.inventory.revision : "local"}`} host={live ? host : null} device={selected} check={checks[selected.id]} connections={connections} onClose={() => setSelectedId(null)}/>}
  </section>
}
