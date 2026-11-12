import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow, Controls, Handle, Position } from '@xyflow/react'
import { ArrowDownCircle, ArrowUpRight, CheckCircle2, CircleHelp, Clock3, Network, Router, Search } from 'lucide-react'
import { HEALTH, createSampleNetwork, deviceHealth, summarizeHealth, connectionHealth } from './health'
import DeviceDetails from './DeviceDetails'

import './dashboard.css'

const healthIcons = { up: CheckCircle2, down: ArrowDownCircle, stale: Clock3, unknown: CircleHelp }

function Status({ status }) {
  const Icon = healthIcons[status]
  return <span className={`health-status health-${status}`}><Icon size={13} aria-hidden="true"/>{HEALTH[status].label}</span>
}

function HealthNode({ data, selected }) {
  const Icon = data.kind === 'router' ? Router : Network
  return <div className={`health-node health-node-${data.status}${selected ? ' is-selected' : ''}`}>
    <Handle type="target" position={Position.Top}/><Handle type="target" position={Position.Top} id="uplink-a" style={{ left: '30%' }}/><Handle type="target" position={Position.Top} id="uplink-b" style={{ left: '70%' }}/>
    <div className="health-node-top"><span className="health-device-icon"><Icon size={18} aria-hidden="true"/></span><Status status={data.status}/></div>
    <strong>{data.label}</strong><span className="health-address">{data.ip || 'No management address'}</span>
    <Handle type="source" position={Position.Bottom}/><Handle type="source" position={Position.Left} id="fan-out"/><Handle type="target" position={Position.Left} id="fan-in"/>
  </div>
}

const nodeTypes = { health: HealthNode }
const NO_CHECKS = {}

export default function Dashboard({ nodes: inventory, edges: inventoryEdges, showInventory = false, onEdit }) {
  const [sampleMode, setSampleMode] = useState(false)
  const [sampleRouterDown, setSampleRouterDown] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [nodeSizes, setNodeSizes] = useState({})
  // Preserve React Flow's measured health-card dimensions across clock/filter
  // renders. Replacing controlled nodes without them resets initialization.
  const onNodesChange = useCallback(changes => {
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
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (sampleMode) return
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
  }, [sampleMode])
  const sampleTime = useMemo(() => Date.now(), [])
  const sample = useMemo(() => createSampleNetwork(sampleTime), [sampleTime])
  const { nodes, edges, checks } = sampleMode ? { ...sample, checks: { ...sample.checks, 'core-a': { ...sample.checks['core-a'], status: sampleRouterDown ? 'down' : 'up' } } } : { nodes: inventory, edges: inventoryEdges, checks: NO_CHECKS }
  const counts = summarizeHealth(nodes, checks, sampleMode ? sampleTime : now)
  const devices = nodes.map(node => ({ ...node, health: deviceHealth(checks[node.id], sampleMode ? sampleTime : now) }))

  const visible = devices.filter(node => (statusFilter === 'all' || node.health === statusFilter) && `${node.data.label} ${node.data.ip}`.toLowerCase().includes(query.trim().toLowerCase()))
  const visibleIds = new Set(visible.map(node => node.id))
  const selected = devices.find(node => node.id === selectedId)
  const devicesById = new Map(devices.map(node => [node.id, node]))
  const mapEdges = edges.map(edge => {
    const source = devicesById.get(edge.source), target = devicesById.get(edge.target)
    const status = connectionHealth(source?.health, target?.health)
    const label = { up: 'Both endpoints up', down: 'Endpoint down', stale: 'Stale endpoint data', unknown: 'Endpoint reachability unknown' }[status]
    return { id: edge.id, source: edge.source, target: edge.target,
      sourceHandle: sampleMode ? edge.sourceHandle : null, targetHandle: sampleMode ? edge.targetHandle : null,
      hidden: !visibleIds.has(edge.source) || !visibleIds.has(edge.target),
      type: sampleMode && edge.source.startsWith('core-') ? 'straight' : 'smoothstep',
      ariaLabel: `${source?.data.label} to ${target?.data.label}: ${label}`,
      className: `health-path-${status}`,
      style: { stroke: HEALTH[status].color, strokeWidth: 3, strokeDasharray: status === 'down' ? '7 5' : status === 'up' ? undefined : '3 5' },
    }
  })
  const connections = selected ? edges.filter(edge => edge.source === selected.id || edge.target === selected.id).map(edge => {
    const device = devicesById.get(edge.source === selected.id ? edge.target : edge.source)
    return { id: edge.id, device, health: connectionHealth(selected.health, device?.health) }
  }).filter(item => item.device) : []

  const selectDevice = node => setSelectedId(node.id)

  const switchSample = () => {
    setSampleMode(value => !value); setSampleRouterDown(true); setSelectedId(null); setStatusFilter('all'); setQuery('')
  }

  return <section className={`health-dashboard${showInventory ? ' is-inventory' : ''}`} id={showInventory ? 'inventory-page' : 'dashboard'} aria-label="Network health dashboard">
    <header className="health-page-titlebar">
      <div><h1>{showInventory ? 'Devices' : 'Network dashboard'}</h1><p role="status">{sampleMode ? 'Sample preview · Not live' : 'Monitoring not connected'}</p></div>
      <div className="health-map-tools">
        {sampleMode && <button className="health-button" onClick={() => setSampleRouterDown(value => !value)}>{sampleRouterDown ? 'Restore primary router' : 'Fail primary router'}</button>}
        <button className="health-button" aria-label={sampleMode ? 'Return to my network' : 'Preview sample statuses'} aria-pressed={sampleMode} onClick={switchSample}>{sampleMode ? 'My network' : 'Sample preview'}</button>
        <details className="health-view-options"><summary>View options{statusFilter !== 'all' || query ? ' · Filtered' : ''}</summary><div>
          <label className="health-search"><Search size={15} aria-hidden="true"/><input aria-label="Search dashboard devices" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or IP"/></label>
          <label className="health-filter">Status <select aria-label="Device status filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All devices ({counts.all})</option>{Object.entries(HEALTH).map(([key, value]) => <option key={key} value={key}>{value.label} ({counts[key]})</option>)}</select></label>
          <p className="health-map-count">{visible.length} of {nodes.length} devices</p><p className="health-map-count">Fit view shows the whole map. Zoom in or open Devices to read labels.</p><p className="health-map-count">Path colors summarize device reachability, not verified interface state.</p>
        </div></details>
      </div>
    </header>
    {showInventory ? (
    <section className="health-inventory health-panel" id="inventory"><div className="health-panel-title"><h2>Device inventory <span className="health-inventory-count">{visible.length}</span></h2><span>{sampleMode ? 'Sample network' : 'Your configured network'}</span></div>
      <div className="health-table-wrap"><table><thead><tr><th scope="col">Device</th><th scope="col">Management IP</th><th scope="col">Status</th><th scope="col">Last check</th><th scope="col">Details</th></tr></thead><tbody>{visible.map(node => <tr key={node.id} className={selectedId === node.id ? 'is-selected' : ''}><th scope="row"><span className="health-table-device">{node.type === 'router' ? <Router size={16} aria-hidden="true"/> : <Network size={16} aria-hidden="true"/>}{node.data.label}</span></th><td className="health-address">{node.data.ip || 'Not configured'}</td><td><Status status={node.health}/></td><td>{checks[node.id] ? new Date(checks[node.id].checkedAt).toLocaleTimeString() : 'Never checked'}</td><td><button className="health-row-button" aria-haspopup="dialog" aria-label={`View details for ${node.data.label}`} onClick={() => selectDevice(node)}>Inspect <ArrowUpRight size={14} aria-hidden="true"/></button></td></tr>)}</tbody></table>{!visible.length && <p className="health-table-empty">No devices match this view.</p>}</div>
    </section>
    ) : (
        <div className="health-map">
          <ReactFlow key={sampleMode ? 'sample' : 'inventory'} onNodesChange={onNodesChange}
            nodes={devices.map(node => ({ ...node, measured: nodeSizes[node.id], type: 'health', ariaRole: 'button', domAttributes: { 'aria-haspopup': 'dialog', onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setSelectedId(node.id) } } }, hidden: !visibleIds.has(node.id), selected: selectedId === node.id, ariaLabel: `${node.data.label}, ${HEALTH[node.health].label}. Open device details`, data: { ...node.data, kind: node.type, status: node.health } }))}
            edges={mapEdges}
            nodeTypes={nodeTypes} onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)}
            nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null}
            fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.05} maxZoom={1.6} proOptions={{ hideAttribution: true }}>
            <Controls showInteractive={false}/>
          </ReactFlow>
          {!visible.length && <div className="health-empty-map"><Search size={25} aria-hidden="true"/><strong>{nodes.length ? 'No matching devices' : 'Your network map starts here'}</strong><p>{nodes.length ? 'Try another name or status filter.' : 'Add your first router or switch in the topology editor.'}</p><button className="health-button" onClick={nodes.length ? () => { setQuery(''); setStatusFilter('all') } : onEdit}>{nodes.length ? 'Clear filters' : 'Open topology editor'}</button></div>}
          {sampleMode && <span className="health-sample-watermark">SAMPLE DATA</span>}
        </div>
    )}
    {selected && <DeviceDetails device={selected} check={checks[selected.id]} connections={connections} sampleMode={sampleMode} onClose={() => setSelectedId(null)}/>}
  </section>
}
