import { useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position } from '@xyflow/react'
import { Activity, ArrowDownCircle, ArrowUpCircle, ArrowUpRight, CheckCircle2, CircleHelp, Clock3, GitBranch, Network, Router, Search, SlidersHorizontal, X } from 'lucide-react'
import { HEALTH, createSampleNetwork, deviceHealth, summarizeHealth } from './health'
import './dashboard.css'

const healthIcons = { up: CheckCircle2, down: ArrowDownCircle, stale: Clock3, unknown: CircleHelp }

function Status({ status }) {
  const Icon = healthIcons[status]
  return <span className={`health-status health-${status}`}><Icon size={13} aria-hidden="true"/>{HEALTH[status].label}</span>
}

function HealthNode({ data, selected }) {
  const Icon = data.kind === 'router' ? Router : Network
  return <div className={`health-node health-node-${data.status}${selected ? ' is-selected' : ''}`}>
    <Handle type="target" position={Position.Top}/>
    <div className="health-node-top"><span className="health-device-icon"><Icon size={18} aria-hidden="true"/></span><Status status={data.status}/></div>
    <strong>{data.label}</strong><span className="health-address">{data.ip || 'No management address'}</span>
    <Handle type="source" position={Position.Bottom}/><Handle type="source" position={Position.Left} id="fan-out"/><Handle type="target" position={Position.Left} id="fan-in"/>
  </div>
}

const nodeTypes = { health: HealthNode }
const NO_CHECKS = {}

export default function Dashboard({ nodes: inventory, edges: inventoryEdges, onEdit }) {
  const [sampleMode, setSampleMode] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [flow, setFlow] = useState(null)
  const sampleTime = useMemo(() => Date.now(), [])
  const sample = useMemo(() => createSampleNetwork(sampleTime), [sampleTime])
  const { nodes, edges, checks } = sampleMode ? sample : { nodes: inventory, edges: inventoryEdges, checks: NO_CHECKS }
  const counts = summarizeHealth(nodes, checks, sampleTime)
  const devices = nodes.map(node => ({ ...node, health: deviceHealth(checks[node.id], sampleTime) }))
  const visible = devices.filter(node => (statusFilter === 'all' || node.health === statusFilter) && `${node.data.label} ${node.data.ip}`.toLowerCase().includes(query.trim().toLowerCase()))
  const visibleIds = new Set(visible.map(node => node.id))
  const attention = devices.filter(node => ['down', 'stale'].includes(node.health)).sort((a, b) => (a.health === 'down' ? 0 : 1) - (b.health === 'down' ? 0 : 1))
  const selected = devices.find(node => node.id === selectedId)
  const selectedCheck = selected && checks[selected.id]

  const selectDevice = node => {
    setSelectedId(node.id)
    const mapNode = flow?.getNode(node.id)
    if (mapNode) flow.setCenter(node.position.x + 100, node.position.y + 55, { zoom: 1 })
  }

  const switchSample = () => {
    setSampleMode(value => !value); setSelectedId(null); setStatusFilter('all'); setQuery('')
  }

  return <section className="health-dashboard" id="dashboard" aria-label="Network health dashboard">
    <div className="health-heading"><div><span className="health-eyebrow">NETWORK OPERATIONS</span><h1>Network overview<span className="health-title-dot"/></h1><p>See the network. Find what needs your attention.</p></div>
      <button className="health-button" onClick={onEdit}><SlidersHorizontal size={16} aria-hidden="true"/> Edit topology <ArrowUpRight size={15} aria-hidden="true"/></button>
    </div>

    <div className={`health-source ${sampleMode ? 'is-sample' : ''}`} role="status">
      <div><Activity size={17} aria-hidden="true"/><span><strong>{sampleMode ? 'Sample preview' : 'Monitoring not connected'}</strong><span>{sampleMode ? 'Illustrative devices and fixed example checks. Nothing here is live or saved to your map.' : 'Your configured devices are shown below. Live up/down checks have not been connected yet.'}</span></span></div>
      <button className="health-button" aria-pressed={sampleMode} onClick={switchSample}>{sampleMode ? 'Return to my network' : 'Preview sample statuses'}</button>
    </div>

    <div className="health-stats" aria-label="Filter network by status">
      {[['all', 'Total devices', GitBranch], ['up', 'Up', ArrowUpCircle], ['down', 'Down', ArrowDownCircle], ['stale', 'Stale', Clock3], ['unknown', 'Not monitored', CircleHelp]].map(([key, label, Icon]) =>
        <button key={key} className={`health-stat health-${key}${statusFilter === key ? ' is-active' : ''}`} aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key)}>
          <span className="health-stat-label"><Icon size={16} aria-hidden="true"/>{label}</span><strong>{counts[key]}</strong><small>{key === 'all' ? 'Configured in this view' : HEALTH[key].note}</small>
        </button>)}
    </div>

    <div className="health-workspace">
      <section className="health-map-card" aria-label="Read-only network map">
        <header className="health-map-heading"><div><h2><GitBranch size={17} aria-hidden="true"/> Network topology</h2><p>Configured connections · Device reachability</p></div><span className="health-map-count">{visible.length} of {nodes.length} devices</span></header>
        <div className="health-map-toolbar"><label className="health-search"><Search size={16} aria-hidden="true"/><input aria-label="Search dashboard devices" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or IP address"/></label>
          <label className="health-filter">Show <select aria-label="Device status filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All devices</option>{Object.entries(HEALTH).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        </div>
        <div className="health-map">
          <ReactFlow key={sampleMode ? 'sample' : 'inventory'} onInit={setFlow}
            nodes={devices.map(node => ({ ...node, type: 'health', hidden: !visibleIds.has(node.id), selected: selectedId === node.id, ariaLabel: `${node.data.label}, ${HEALTH[node.health].label}`, data: { ...node.data, kind: node.type, status: node.health } }))}
            edges={edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: sampleMode ? edge.sourceHandle : null, targetHandle: sampleMode ? edge.targetHandle : null, hidden: !visibleIds.has(edge.source) || !visibleIds.has(edge.target), type: 'smoothstep', style: { stroke: '#a8b6c7', strokeWidth: 1.3 } }))}
            nodeTypes={nodeTypes} onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)}
            nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null}
            fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.15} maxZoom={1.6} proOptions={{ hideAttribution: true }}>
            <Background color="#dce4ed" gap={24} size={1}/><Controls showInteractive={false}/>
          </ReactFlow>
          {!visible.length && <div className="health-empty-map"><Search size={25} aria-hidden="true"/><strong>{nodes.length ? 'No matching devices' : 'Your network map starts here'}</strong><p>{nodes.length ? 'Try another name or status filter.' : 'Add your first router or switch in the topology editor.'}</p><button className="health-button" onClick={nodes.length ? () => { setQuery(''); setStatusFilter('all') } : onEdit}>{nodes.length ? 'Clear filters' : 'Open topology editor'}</button></div>}
          {sampleMode && <span className="health-sample-watermark">SAMPLE DATA</span>}
        </div>
        <footer className="health-map-legend">{Object.keys(HEALTH).map(key => <Status key={key} status={key}/>)}<span className="health-link-note">Lines show configured links, not measured link health.</span></footer>
      </section>

      <aside className="health-side" aria-label="Network attention and device details">
        <section className="health-panel"><div className="health-panel-title"><h2>Needs attention</h2><span>{attention.length}</span></div>
          {attention.length ? <div className="health-attention-list">{attention.map(node => <button key={node.id} onClick={() => { setStatusFilter('all'); setQuery(''); selectDevice(node) }}><Status status={node.health}/><strong>{node.data.label}</strong><span>{node.health === 'down' ? 'Latest example check received no response.' : 'Previous result is too old to trust.'}</span><ArrowUpRight size={15} aria-hidden="true"/></button>)}</div> : <div className="health-panel-empty"><CircleHelp size={24} aria-hidden="true"/><strong>No verified incidents yet</strong><p>Without monitoring data, an empty list does not mean your network is healthy.</p></div>}
          {sampleMode && <p className="health-panel-footnote">Example conditions only. Check times are frozen for this preview.</p>}
        </section>
        <section className="health-panel" aria-label="Selected dashboard device"><div className="health-panel-title"><h2>Device details</h2>{selected && <button className="health-close" aria-label="Clear selected device" onClick={() => setSelectedId(null)}><X size={16}/></button>}</div>
          {selected ? <div className="health-device-details"><Status status={selected.health}/><h3>{selected.data.label}</h3><p>{selected.data.description || 'No description added.'}</p><dl><div><dt>Type</dt><dd>{selected.type === 'router' ? 'Router' : 'Switch'}</dd></div><div><dt>Management IP</dt><dd>{selected.data.ip || 'Not configured'}</dd></div><div><dt>Last check</dt><dd>{selectedCheck ? new Date(selectedCheck.checkedAt).toLocaleString() : 'Never checked'}</dd></div><div><dt>Response time</dt><dd>{selected.health === 'up' && Number.isFinite(selectedCheck?.latencyMs) ? `${selectedCheck.latencyMs} ms` : 'Unavailable'}</dd></div><div><dt>Data source</dt><dd>{sampleMode ? 'Sample preview' : 'Inventory only'}</dd></div></dl></div> : <div className="health-panel-empty"><Network size={24} aria-hidden="true"/><strong>Select a device</strong><p>Choose a node on the map or a device in the list to see its status and last check.</p></div>}
        </section>
      </aside>
    </div>

    <section className="health-inventory health-panel" id="inventory"><div className="health-panel-title"><h2>Device inventory <span className="health-inventory-count">{visible.length}</span></h2><span>{sampleMode ? 'Sample network' : 'Your configured network'}</span></div>
      <div className="health-table-wrap"><table><thead><tr><th scope="col">Device</th><th scope="col">Management IP</th><th scope="col">Status</th><th scope="col">Last check</th><th scope="col">Details</th></tr></thead><tbody>{visible.map(node => <tr key={node.id} className={selectedId === node.id ? 'is-selected' : ''}><th scope="row"><span className="health-table-device">{node.type === 'router' ? <Router size={16} aria-hidden="true"/> : <Network size={16} aria-hidden="true"/>}{node.data.label}</span></th><td className="health-address">{node.data.ip || 'Not configured'}</td><td><Status status={node.health}/></td><td>{checks[node.id] ? new Date(checks[node.id].checkedAt).toLocaleTimeString() : 'Never checked'}</td><td><button className="health-row-button" aria-label={`View details for ${node.data.label}`} onClick={() => selectDevice(node)}>Inspect <ArrowUpRight size={14} aria-hidden="true"/></button></td></tr>)}</tbody></table>{!visible.length && <p className="health-table-empty">No devices match this view.</p>}</div>
    </section>
    <p className="health-bottom-note">{sampleMode ? 'Sample preview · No live network activity' : 'Local workspace · Waiting for the Windows monitoring service'}<span>NETWATCH / NETWORK OPERATIONS</span></p>
  </section>
}
