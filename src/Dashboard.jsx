import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow, Controls, Handle, Position } from '@xyflow/react'
import { ArrowDownCircle, ArrowUpRight, CheckCircle2, CircleHelp, Clock3, Network, Router, Search } from 'lucide-react'
import { HEALTH, deviceHealth, summarizeHealth, connectionHealth } from './health'
import DeviceDetails from './DeviceDetails'
import useMonitoring from './useMonitoring'
import { formatCheckTime, collectorLabel } from './monitoring'
import { radialLayout, radialHandles, connectedDevices } from './radial'

import './dashboard.css'

const healthIcons = { up: CheckCircle2, down: ArrowDownCircle, stale: Clock3, unknown: CircleHelp }

function Status({ status }) {
  const Icon = healthIcons[status]
  return <span className={`health-status health-${status}`}><Icon size={13} aria-hidden="true"/>{HEALTH[status].label}</span>
}

function HealthNode({ data, selected }) {
  const Icon = data.kind === 'router' ? Router : Network
  return <div className={`health-node health-node-${data.status}${selected ? ' is-selected' : ''}${data.connectionRole ? ` health-node-${data.connectionRole}` : ''}`}>
    {data.radial && Object.entries({ top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }).map(([side, position]) => <Fragment key={side}><Handle type="source" position={position} id={`radial-source-${side}`}/><Handle type="target" position={position} id={`radial-target-${side}`}/></Fragment>)}
    <Handle type="target" position={Position.Top}/>
    <div className="health-node-top"><span className="health-device-icon"><Icon size={18} aria-hidden="true"/></span><Status status={data.status}/></div>
    <strong>{data.label}</strong><span className="health-address">{data.ip || 'No management address'}</span>
    <Handle type="source" position={Position.Bottom}/>
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
      ...(mapLayout === 'radial' ? radialHandles(source.position, target.position) : { sourceHandle: null, targetHandle: null }),
      hidden: !visibleIds.has(edge.source) || !visibleIds.has(edge.target),
      type: mapLayout === 'radial' ? 'straight' : 'smoothstep',
      ariaLabel: `${source?.data.label} to ${target?.data.label}: ${label}`,
      className: `health-path-${status}${highlightedDevice && (edge.source === highlightedId || edge.target === highlightedId) ? ' health-path-highlighted' : ''}`,
      style: { stroke: HEALTH[status].color, strokeWidth: highlightedDevice && (edge.source === highlightedId || edge.target === highlightedId) ? 5 : 3, opacity: highlightedDevice && edge.source !== highlightedId && edge.target !== highlightedId ? 0.18 : 1, strokeDasharray: status === 'down' ? '7 5' : status === 'up' ? undefined : '3 5' },
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
      <div><h1>{showInventory ? 'Devices' : 'Network dashboard'}</h1><p role="status">{source === 'browser' ? 'Browser map · Checks unavailable' : `${host.state === 'loading' ? 'Loading device checks…' : host.state === 'disconnected' ? 'Host disconnected · Reconnecting' : 'Host connected'}${live ? ` · ${collectorLabel(live.collector.state)} · Last update: ${formatCheckTime(live.generatedAt)}` : ' · Showing browser map without checks'}`}</p>{showInventory && highlightedDevice && <p className="health-highlight-status" role="status">Connections: {highlightedDevice.data.label} · {connectedIds.size} direct {connectedIds.size === 1 ? 'peer' : 'peers'}</p>}</div>
      <div className="health-map-tools">
        <><label className="health-filter">Network <select aria-label="Network source" value={source} onChange={event => { setSource(event.target.value); setSelectedId(null); setHighlightedId(null); setDragState({ source: null, key: '', positions: {} }) }}><option value="host">Saved host network</option><option value="browser">Browser working copy</option></select></label>{source === 'host' && <button className="health-button" onClick={host.refresh}>Refresh host</button>}</>
        {showInventory && highlightedDevice && <button className="health-button" aria-label="Clear connection highlight" onClick={() => { setHighlightedId(null); setSelectedId(null) }}>Clear highlight</button>}
        <details className="health-view-options"><summary>View options{statusFilter !== 'all' || query ? ' · Filtered' : ''}</summary><div>
          <label className="health-filter">Map layout <select aria-label="Map layout" value={mapLayout} onChange={event => { setDragState({ source: null, key: '', positions: {} }); setMapLayout(event.target.value) }}><option value="manual">Saved positions</option><option value="radial">Radial</option></select></label>
          {mapLayout === 'radial' && <><label className="health-filter">Center <select aria-label="Radial center" value={effectiveCenterId} onChange={event => { setDragState({ source: null, key: '', positions: {} }); setCenterId(event.target.value) }}><option value="">Automatic</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></label><p className="health-map-count">Display only: saved positions and connections stay unchanged. Automatic centers prefer a connected router; rings follow configured links.</p></>}
          <label className="health-search"><Search size={15} aria-hidden="true"/><input aria-label="Search dashboard devices" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or IP"/></label>
          <label className="health-filter">Status <select aria-label="Device status filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All devices ({counts.all})</option>{Object.entries(HEALTH).map(([key, value]) => <option key={key} value={key}>{value.label} ({counts[key]})</option>)}</select></label>
          <div className="health-attention"><p>Needs attention ({devices.filter(node => ['down', 'stale'].includes(node.health)).length})</p>{devices.filter(node => ['down', 'stale'].includes(node.health)).map(node => <button className="health-button" key={node.id} onClick={() => selectDevice(node)}>{node.data.label} · {HEALTH[node.health].label}</button>)}</div>
          <p className="health-map-count">{visible.length} of {nodes.length} devices</p><p className="health-map-count">Drag a device to move it and highlight its direct connections. Browser saved-layout drags autosave; host and radial adjustments stay in this view. Click or press Enter for details.</p><p className="health-map-count">Path colors summarize device reachability, not verified interface state.</p>
        </div></details>
      </div>
    </header>
    {source === 'host' && host.error && <p className="health-connection-note" role="status">Unable to update checks; start monitoring in the Windows app or choose Refresh host to retry while saved results continue aging.</p>}
    {showInventory ? (
    <section className="health-inventory health-panel" id="inventory"><div className="health-panel-title"><h2>Device inventory <span className="health-inventory-count">{visible.length}</span></h2><span>{live ? 'Saved host network' : 'Browser working copy'}</span></div>
      <div className="health-table-wrap"><table><thead><tr><th scope="col">Device</th><th scope="col">Management IP</th><th scope="col">Status</th><th scope="col">Last check</th><th scope="col">Details</th></tr></thead><tbody>{visible.map(node => <tr key={node.id} className={highlightedDevice && (node.id === highlightedId || connectedIds.has(node.id)) ? 'is-connected' : selectedId === node.id ? 'is-selected' : ''}><th scope="row"><span className="health-table-device">{node.type === 'router' ? <Router size={16} aria-hidden="true"/> : <Network size={16} aria-hidden="true"/>}{node.data.label}</span></th><td className="health-address">{node.data.ip || 'Not configured'}</td><td><Status status={node.health}/></td><td>{formatCheckTime(checks[node.id]?.checkedAt)}</td><td><button className="health-row-button" aria-haspopup="dialog" aria-label={`View details for ${node.data.label}`} onClick={() => selectDevice(node)}>Inspect <ArrowUpRight size={14} aria-hidden="true"/></button></td></tr>)}</tbody></table>{!visible.length && <p className="health-table-empty">No devices match this view.</p>}</div>
    </section>
    ) : (
        <div className="health-map">
          <ReactFlow key={`${layoutKey}-${resetKey}`} onNodesChange={onNodesChange}
            nodes={devices.map(node => ({ ...node, measured: nodeSizes[node.id], type: 'health', ariaRole: 'button', domAttributes: { 'aria-haspopup': 'dialog', onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectDevice(node) } } }, hidden: !visibleIds.has(node.id), selected: selectedId === node.id, ariaLabel: `${node.data.label}, ${HEALTH[node.health].label}.${highlightedDevice ? node.id === highlightedId ? ' Connection focus.' : connectedIds.has(node.id) ? ` Directly connected to ${highlightedDevice.data.label}.` : '' : ''} Open device details`, data: { ...node.data, kind: node.type, status: node.health, radial: mapLayout === 'radial', connectionRole: highlightedDevice ? node.id === highlightedId ? 'focus' : connectedIds.has(node.id) ? 'connected' : 'muted' : '' } }))}
            edges={mapEdges}
            nodeTypes={nodeTypes} onNodeClick={(_, node) => selectDevice(node)} onPaneClick={() => { setSelectedId(null); setHighlightedId(null) }}
            nodesDraggable nodesConnectable={false} multiSelectionKeyCode={null} nodeDragThreshold={3} nodeClickDistance={5}
            onNodeDragStart={(_, node) => { setHighlightedId(node.id); setSelectedId(null) }} onNodeDragStop={finishDrag} edgesFocusable={false} deleteKeyCode={null}
            fitView fitViewOptions={{ padding: 0.12 }} minZoom={mapLayout === 'radial' ? 0.0001 : 0.05} maxZoom={1.6} proOptions={{ hideAttribution: true }}>
            <Controls showInteractive={false}/>
          </ReactFlow>
          {!visible.length && <div className="health-empty-map"><Search size={25} aria-hidden="true"/><strong>{nodes.length ? 'No matching devices' : 'Your network map starts here'}</strong><p>{nodes.length ? 'Try another name or status filter.' : 'Add your first router or switch in the topology editor.'}</p><button className="health-button" onClick={nodes.length ? () => { setQuery(''); setStatusFilter('all') } : onEdit}>{nodes.length ? 'Clear filters' : 'Open topology editor'}</button></div>}
          {(highlightedDevice || hasViewPositions) && <div className="health-map-focus-controls nodrag nopan">
            {highlightedDevice && <p className="health-highlight-status" role="status">Connections: {highlightedDevice.data.label} · {connectedIds.size} direct {connectedIds.size === 1 ? 'peer' : 'peers'}</p>}
            {highlightedDevice && <button className="health-button" aria-label="Clear connection highlight" onClick={() => { setHighlightedId(null); setSelectedId(null) }}>Clear highlight</button>}
            {hasViewPositions && <button className="health-button" aria-label="Reset view positions" onClick={resetViewPositions}>{mapLayout === 'radial' ? 'Reset radial positions' : 'Reset view positions'}</button>}
          </div>}
        </div>
    )}
    {selected && <DeviceDetails key={`${source}-${selected.id}-${live ? live.inventory.revision : "local"}`} host={live ? host : null} device={selected} check={checks[selected.id]} connections={connections} onClose={() => setSelectedId(null)}/>}
  </section>
}
