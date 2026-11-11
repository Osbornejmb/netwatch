import { useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position } from '@xyflow/react'
import { Activity, ArrowDownCircle, ArrowUpCircle, ArrowUpRight, CheckCircle2, CircleHelp, Clock3, GitBranch, Network, Router, Search, SlidersHorizontal } from 'lucide-react'
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

export default function Dashboard({ nodes: inventory, edges: inventoryEdges, onEdit }) {
  const [sampleMode, setSampleMode] = useState(false)
  const [sampleRouterDown, setSampleRouterDown] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [flow, setFlow] = useState(null)
  const sampleTime = useMemo(() => Date.now(), [])
  const sample = useMemo(() => createSampleNetwork(sampleTime), [sampleTime])
  const { nodes, edges, checks } = sampleMode ? { ...sample, checks: { ...sample.checks, 'core-a': { ...sample.checks['core-a'], status: sampleRouterDown ? 'down' : 'up' } } } : { nodes: inventory, edges: inventoryEdges, checks: NO_CHECKS }
  const counts = summarizeHealth(nodes, checks, sampleTime)
  const devices = nodes.map(node => ({ ...node, health: deviceHealth(checks[node.id], sampleTime) }))
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

  const selectDevice = node => {
    setSelectedId(node.id)
    const mapNode = flow?.getNode(node.id)
    if (mapNode) flow.setCenter(node.position.x + 100, node.position.y + 55, { zoom: 1 })
  }

  const switchSample = () => {
    setSampleMode(value => !value); setSampleRouterDown(true); setSelectedId(null); setStatusFilter('all'); setQuery('')
  }

  return <section className="health-dashboard" id="dashboard" aria-label="Network health dashboard">
    <div className="health-heading"><div><span className="health-eyebrow">NETWORK OPERATIONS</span><h1>Network topology<span className="health-title-dot"/></h1><p>Device and path status, directly on your network map.</p></div>
      <button className="health-button" onClick={onEdit}><SlidersHorizontal size={16} aria-hidden="true"/> Edit topology <ArrowUpRight size={15} aria-hidden="true"/></button>
    </div>

    <div className={`health-source ${sampleMode ? 'is-sample' : ''}`} role="status">
      <div><Activity size={17} aria-hidden="true"/><span><strong>{sampleMode ? 'Sample preview' : 'Monitoring not connected'}</strong><span>{sampleMode ? 'Illustrative devices and fixed example checks. Nothing here is live or saved to your map.' : 'Your configured devices are shown below. Live up/down checks have not been connected yet.'}</span></span></div>
      <div className="health-preview-actions">{sampleMode && <button className="health-button" onClick={() => setSampleRouterDown(value => !value)}>{sampleRouterDown ? 'Restore primary router' : 'Fail primary router'}</button>}<button className="health-button" aria-pressed={sampleMode} onClick={switchSample}>{sampleMode ? 'Return to my network' : 'Preview sample statuses'}</button></div>
    </div>

    <div className="health-stats" aria-label="Filter network by status">
      {[['all', 'Total devices', GitBranch], ['up', 'Up', ArrowUpCircle], ['down', 'Down', ArrowDownCircle], ['stale', 'Stale', Clock3], ['unknown', 'Not monitored', CircleHelp]].map(([key, label, Icon]) =>
        <button key={key} className={`health-stat health-${key}${statusFilter === key ? ' is-active' : ''}`} aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key)}>
          <span className="health-stat-label"><Icon size={16} aria-hidden="true"/>{label}</span><strong>{counts[key]}</strong><small>{key === 'all' ? 'Configured in this view' : HEALTH[key].note}</small>
        </button>)}
    </div>

    <div className="health-workspace">
      <section className="health-map-card" aria-label="Read-only network map">
        <header className="health-map-heading"><div><h2><GitBranch size={17} aria-hidden="true"/> Network topology</h2><p>Click a device for details · Colors reflect endpoint reachability</p></div><span className="health-map-count">{visible.length} of {nodes.length} devices</span></header>
        <div className="health-map-toolbar"><label className="health-search"><Search size={16} aria-hidden="true"/><input aria-label="Search dashboard devices" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or IP address"/></label>
          <label className="health-filter">Show <select aria-label="Device status filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All devices</option>{Object.entries(HEALTH).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        </div>
        <div className="health-map">
          <ReactFlow key={sampleMode ? 'sample' : 'inventory'} onInit={setFlow}
            nodes={devices.map(node => ({ ...node, type: 'health', hidden: !visibleIds.has(node.id), selected: selectedId === node.id, ariaLabel: `${node.data.label}, ${HEALTH[node.health].label}. Open device details`, data: { ...node.data, kind: node.type, status: node.health } }))}
            edges={mapEdges}
            nodeTypes={nodeTypes} onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)}
            nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null}
            fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.15} maxZoom={1.6} proOptions={{ hideAttribution: true }}>
            <Background color="#dce4ed" gap={24} size={1}/><Controls showInteractive={false}/>
          </ReactFlow>
          {!visible.length && <div className="health-empty-map"><Search size={25} aria-hidden="true"/><strong>{nodes.length ? 'No matching devices' : 'Your network map starts here'}</strong><p>{nodes.length ? 'Try another name or status filter.' : 'Add your first router or switch in the topology editor.'}</p><button className="health-button" onClick={nodes.length ? () => { setQuery(''); setStatusFilter('all') } : onEdit}>{nodes.length ? 'Clear filters' : 'Open topology editor'}</button></div>}
          {sampleMode && <span className="health-sample-watermark">SAMPLE DATA</span>}
        </div>
        <footer className="health-map-legend">{Object.keys(HEALTH).map(key => <Status key={key} status={key}/>)}<span className="health-link-note">Lines: green = both endpoints up; red dashed = endpoint down. Interface health is not verified.</span></footer>
      </section>


    </div>

    {selected && <DeviceDetails device={selected} check={checks[selected.id]} connections={connections} sampleMode={sampleMode} onClose={() => setSelectedId(null)}/>}

    <section className="health-inventory health-panel" id="inventory"><div className="health-panel-title"><h2>Device inventory <span className="health-inventory-count">{visible.length}</span></h2><span>{sampleMode ? 'Sample network' : 'Your configured network'}</span></div>
      <div className="health-table-wrap"><table><thead><tr><th scope="col">Device</th><th scope="col">Management IP</th><th scope="col">Status</th><th scope="col">Last check</th><th scope="col">Details</th></tr></thead><tbody>{visible.map(node => <tr key={node.id} className={selectedId === node.id ? 'is-selected' : ''}><th scope="row"><span className="health-table-device">{node.type === 'router' ? <Router size={16} aria-hidden="true"/> : <Network size={16} aria-hidden="true"/>}{node.data.label}</span></th><td className="health-address">{node.data.ip || 'Not configured'}</td><td><Status status={node.health}/></td><td>{checks[node.id] ? new Date(checks[node.id].checkedAt).toLocaleTimeString() : 'Never checked'}</td><td><button className="health-row-button" aria-haspopup="dialog" aria-label={`View details for ${node.data.label}`} onClick={() => selectDevice(node)}>Inspect <ArrowUpRight size={14} aria-hidden="true"/></button></td></tr>)}</tbody></table>{!visible.length && <p className="health-table-empty">No devices match this view.</p>}</div>
    </section>
    <p className="health-bottom-note">{sampleMode ? 'Sample preview · No live network activity' : 'Local workspace · Waiting for the Windows monitoring service'}<span>NETWATCH / NETWORK OPERATIONS</span></p>
  </section>
}
