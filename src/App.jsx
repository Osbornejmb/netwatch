import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, useEdgesState,
  useNodesState, MarkerType, Panel,
} from '@xyflow/react'
import { Activity, Cable, Check, Command, Database, Download, GitBranch, Plus, Radio, Router, Search, Trash2, X, Network, Zap } from 'lucide-react'
import RouterNode from './nodes/RouterNode'
import SwitchNode from './nodes/SwitchNode'
import Dashboard from './Dashboard'
import DeviceDialog from './DeviceDialog'
import RecoveryDialog from './RecoveryDialog'
import InventoryControls from './InventoryControls'
import { createId } from './id'

import { readTopology, writeTopology, validateTopology } from './topology'

const nodeTypes = { router: RouterNode, switch: SwitchNode }
const initialNodes = [
  { id: 'r1', type: 'router', position: { x: 360, y: 70 }, data: { label: 'CORE-ROUTER-01', ip: '192.168.1.1' } },
  { id: 'r2', type: 'router', position: { x: 690, y: 70 }, data: { label: 'CORE-ROUTER-02', ip: '192.168.1.2' } },
  { id: 's1', type: 'switch', position: { x: 525, y: 270 }, data: { label: 'CORE-SWITCH-01', ip: '192.168.1.10' } },
  { id: 's2', type: 'switch', position: { x: 270, y: 470 }, data: { label: 'ACCESS-SWITCH-01', ip: '192.168.1.11' } },
  { id: 's3', type: 'switch', position: { x: 780, y: 470 }, data: { label: 'ACCESS-SWITCH-02', ip: '192.168.1.12' } },
]
const initialEdges = [
  { id: 'e-r1-s1', source: 'r1', target: 's1', label: 'Uplink', animated: false, style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#94a3b8', fontSize: 10 } },
  { id: 'e-r2-s1', source: 'r2', target: 's1', label: 'Uplink', style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#94a3b8', fontSize: 10 } },
  { id: 'e-s1-s2', source: 's1', target: 's2', label: 'Downlink', style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#94a3b8', fontSize: 10 } },
  { id: 'e-s1-s3', source: 's1', target: 's3', label: 'Downlink', style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#94a3b8', fontSize: 10 } },
]

export default function App() {
  const saved = useMemo(() => readTopology({ getItem: key => localStorage.getItem(key) }, { nodes: initialNodes, edges: initialEdges }), [])
  const [nodes, setNodes, onNodesChange] = useNodesState(saved.topology.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(saved.topology.edges)
  const [view, setView] = useState('dashboard')
  const [showModal, setShowModal] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const selectedNode = nodes.find(node => node.id === selectedId)
  const setSelectedNode = node => setSelectedId(node?.id || null)
  const [query, setQuery] = useState('')
  const [savedNotice, setSavedNotice] = useState(false)

  const [storageError, setStorageError] = useState(saved.error)
  const [autosavePaused, setAutosavePaused] = useState(Boolean(saved.error))
  const [recovery, setRecovery] = useState(saved.recovery)
  const [pendingAction, setPendingAction] = useState(null)
  const [importError, setImportError] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [backupNotice, setBackupNotice] = useState('')
  const importInput = useRef(null)

  useEffect(() => {
    if (autosavePaused) return
    try {
      writeTopology(localStorage, { nodes, edges })
      setStorageError('')
    } catch {
      setBackupNotice('')
      setStorageError('Map could not be saved. Autosave is paused. Export the current map to keep a backup, then retry saving.')
      setAutosavePaused(true)
    }
  }, [nodes, edges, autosavePaused])


  const importTopology = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportBusy(true); setImportError(''); setBackupNotice('')
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 5 MB.')
      const topology = validateTopology(JSON.parse(await file.text()))
      setPendingAction({ kind: 'import', topology })
    } catch (error) {
      setImportError(`Import failed: ${error.message}`)
    } finally {
      setImportBusy(false)
    }
  }

  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({
      ...params, id: `edge-${createId()}`, label: 'Link',
      style: { stroke: '#64748b', strokeWidth: 2 },
      labelStyle: { fill: '#94a3b8', fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    }, eds))
  }, [setEdges])

  const saveDevice = ({ kind, label, ip, description }) => {
    if (showModal === 'edit' && selectedNode) {
      setNodes(ns => ns.map(node => node.id === selectedNode.id ? { ...node, data: { ...node.data, label, ip, description } } : node))
      setShowModal(false)
      return
    }
    if (nodes.length >= 2000) { window.alert('This map supports up to 2,000 devices.'); return }
    const id = `${kind}-${createId()}`
    setNodes(ns => [...ns, {
      id, type: kind, position: { x: 430 + Math.random() * 220, y: 180 + Math.random() * 180 },
      data: { label, ip, description },
    }])
    setShowModal(false)
  }

  const removeSelected = () => {
    if (!selectedNode) return
    setNodes(ns => ns.filter(n => n.id !== selectedNode.id))
    setEdges(es => es.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  const filteredNodes = nodes.filter(n => `${n.data.label} ${n.data.ip}`.toLowerCase().includes(query.toLowerCase()))
  const routerCount = nodes.filter(n => n.type === 'router').length
  const switchCount = nodes.filter(n => n.type === 'switch').length

  const download = (content, filename, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const link = document.createElement('a')
    link.href = url; link.download = filename; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const exportTopology = () => {
    download(JSON.stringify({ exportedAt: new Date().toISOString(), ...validateTopology({ nodes, edges }) }, null, 2), 'netwatch-topology.json', 'application/json')
  }
  const downloadOriginal = () => {
    if (typeof recovery?.raw === 'string') download(recovery.raw, 'netwatch-original-saved-content.txt', 'text/plain;charset=utf-8')
  }

  const persistCurrent = () => {
    try {
      writeTopology(localStorage, { nodes, edges })
      setStorageError(''); setAutosavePaused(false); setRecovery(null)
      setBackupNotice('Map saved. Autosave is active.')
      setSavedNotice(true); setTimeout(() => setSavedNotice(false), 1800)
    } catch {
      setStorageError('Map could not be saved. Autosave is paused. Export the current map to keep a backup.')
      setAutosavePaused(true)
    }
  }
  const saveNow = () => {
    setBackupNotice('')
    if (autosavePaused) setPendingAction({ kind: 'save' })
    else persistCurrent()
  }
  const confirmRecovery = () => {
    if (pendingAction.kind === 'import') {
      setNodes(pendingAction.topology.nodes); setEdges(pendingAction.topology.edges); setSelectedNode(null); setQuery('')
      setBackupNotice(autosavePaused ? 'Map imported into this view. Autosave remains paused; replace the saved map explicitly to save it.' : 'Map imported. Autosave is active.')
    } else persistCurrent()
    setPendingAction(null)
  }

  return (
    <div className={`app-shell simple-shell${view !== 'editor' ? ' dashboard-shell' : ''}`}>
      <main className="main-area">
        <header className="topbar">
          <a className="top-brand" href="#dashboard" onClick={() => setView('dashboard')}><Activity size={19} aria-hidden="true"/> NETWATCH</a>
          <nav className="top-menu" aria-label="Main navigation">
            <a href="#dashboard" aria-label="Network dashboard" aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => setView('dashboard')}>Dashboard</a>
            <a href="#topology" aria-label="Topology builder" aria-current={view === 'editor' ? 'page' : undefined} onClick={() => setView('editor')}>Topology editor</a>
            <a href="#inventory" aria-label="Device inventory" aria-current={view === 'inventory' ? 'page' : undefined} onClick={() => setView('inventory')}>Devices</a>
          </nav>
        <section className="backup-recovery" aria-label="Map backup and recovery">
          <details open={storageError || importError ? true : undefined}>
            <summary aria-label="Map backup and recovery">Backup{storageError ? ' · Autosave paused' : importError ? ' · Import failed' : ''}</summary>
            {storageError && <p className="notice storage-warning" role="alert">{storageError}</p>}
            {importError && <p className="notice storage-warning" role="alert">{importError} Your current map and saved data have not been replaced.</p>}
            <p>Export current map downloads the visible inventory, never sample data. Import validates a JSON backup before asking to replace the visible map. Keep a backup before replacing any saved content.</p>
            {recovery && <p>{typeof recovery.raw === 'string' ? 'Download original saved content preserves the unreadable saved text exactly. It is separate from the current visible map.' : 'The original saved content is unavailable because storage access was denied. Export the visible map, allow browser storage, then reload to access the original before replacing it.'}</p>}
            <div className="backup-actions"><button className="button secondary" onClick={exportTopology}>Export current map</button><button className="button secondary" disabled={importBusy} onClick={() => importInput.current.click()}>{importBusy ? 'Reading backup…' : 'Import backup'}</button><button className="button secondary" disabled={importBusy} onClick={saveNow}>{autosavePaused ? 'Replace saved map…' : 'Save current map'}</button>{typeof recovery?.raw === 'string' && <button className="button secondary" onClick={downloadOriginal}>Download original saved content</button>}</div>
          <p className="backup-status" role="status">{importBusy ? 'Validating backup…' : backupNotice}</p>
          </details>
          <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={importTopology}/>
        </section>
        </header>

        {view !== 'editor' ? <Dashboard nodes={nodes} edges={edges} showInventory={view === 'inventory'} onEdit={() => setView('editor')}/> : <section className="page-content" id="topology">
          <div className="page-heading">
            <div><div className="eyebrow">NETWORK MANAGEMENT / PHASE 01</div><h1>Topology builder</h1><p>Map your infrastructure first. Monitoring will be connected in the next phase.</p></div>
            <div className="heading-actions"><button className="button secondary" disabled={importBusy} onClick={() => importInput.current.click()}>Import JSON</button><button className="button secondary" onClick={exportTopology}><Download size={16}/> Export JSON</button><button className="button primary" onClick={() => setShowModal('add')}><Plus size={17}/> Add device</button></div>
          </div>

          <div className="stats-grid" id="overview">
            <div className="stat-card"><div className="stat-icon blue"><Router size={18}/></div><div><span>ROUTERS</span><strong>{routerCount}</strong><small>Configured devices</small></div></div>
            <div className="stat-card"><div className="stat-icon green"><Network size={18}/></div><div><span>SWITCHES</span><strong>{switchCount}</strong><small>Configured devices</small></div></div>
            <div className="stat-card"><div className="stat-icon violet"><Cable size={18}/></div><div><span>CONNECTIONS</span><strong>{edges.length}</strong><small>Defined topology links</small></div></div>
            <div className="stat-card"><div className="stat-icon amber"><Radio size={18}/></div><div><span>MONITORING</span><strong className="pending">NOT ACTIVE</strong><small>Available in Phase 2</small></div></div>
          </div>

          <div className="canvas-toolbar">
            <div className="canvas-title"><GitBranch size={18}/><div><strong>Network map</strong><span>Drag nodes · Connect handles · Select to inspect</span></div></div>
            <div className="canvas-actions"><div className="search-box"><Search size={15}/><input aria-label="Find a device" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a device..." /></div><button className="button secondary small" onClick={saveNow}><Check size={15}/>{savedNotice ? 'Saved' : 'Save map'}</button></div>
          </div>

          <div className="canvas-wrap">
            <ReactFlow
              nodes={nodes.map(n => ({ ...n, hidden: !filteredNodes.some(f => f.id === n.id) }))}
              edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={onConnect} isValidConnection={connection => connection.source !== connection.target && edges.length < 10000} nodeTypes={nodeTypes}
              onNodeClick={(_, node) => setSelectedNode(node)}
              onPaneClick={() => setSelectedNode(null)}
              fitView fitViewOptions={{ padding: 0.2 }}
              deleteKeyCode={['Backspace', 'Delete']}
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' }, type: 'smoothstep', style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#94a3b8', fontSize: 10 } }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#263449" gap={22} size={1}/>
              <Controls />
              <MiniMap nodeColor={n => n.type === 'router' ? '#3b82f6' : '#16a34a'} maskColor="rgba(7, 13, 24, 0.75)" />
              <Panel position="top-left"><div className="canvas-legend"><span><i className="legend-square"/> Router</span><span><i className="legend-circle"/> Switch</span><span><i className="legend-line"/> Defined link</span></div></Panel>
              <Panel position="bottom-left"><div className="canvas-hint"><Command size={13}/> Drag from a node handle to another node to create a link</div></Panel>
            </ReactFlow>
            {selectedNode && <div className="device-inspector">
              <div className="inspector-head"><div><span className="eyebrow">SELECTED DEVICE</span><h3>{selectedNode.data.label}</h3></div><button className="icon-button" aria-label="Close device details" onClick={() => setSelectedNode(null)}><X size={17}/></button></div>
              <div className="inspector-type"><span className={selectedNode.type === 'router' ? 'type-square' : 'type-circle'}/>{selectedNode.type.toUpperCase()}</div>
              <div className="detail-row"><span>Management IP</span><strong>{selectedNode.data.ip || 'Not set'}</strong></div>
              <div className="detail-row"><span>Monitoring</span><strong className="pending">Not monitored</strong></div>
              <div className="detail-row"><span>Description</span><strong>{selectedNode.data.description || '—'}</strong></div>
              <button className="button secondary full" onClick={() => setShowModal('edit')}>Edit device</button>
              <button className="button danger full" onClick={removeSelected}><Trash2 size={15}/> Remove device</button>
            </div>}
          </div>

          <InventoryControls nodes={nodes} edges={edges} selectedId={selectedId} onSelect={setSelectedId} onEdit={() => setShowModal('edit')} onRemove={removeSelected} onMove={(id, position) => setNodes(ns => ns.map(node => node.id === id ? { ...node, position } : node))} onConnect={onConnect} onRemoveLink={id => setEdges(es => es.filter(edge => edge.id !== id))}/>
          <div className="bottom-grid">
            <div className="info-card"><div className="info-icon"><Zap size={17}/></div><div><strong>Automatic discovery comes next</strong><p>Phase 2 will add network scanning and ICMP checks. SNMP/LLDP will be used later to verify interface state and discover neighboring devices.</p></div></div>
            <div className="info-card"><div className="info-icon"><Database size={17}/></div><div><strong>Saved locally</strong><p>Your current map is stored in this browser. Export JSON to back it up or import it on another workstation.</p></div></div>
          </div>
          <footer>NETWATCH <span>•</span> PHASE 1 FOUNDATION <span>•</span> NO LIVE NETWORK PROBES YET</footer>
        </section>}
      </main>
      {pendingAction && <RecoveryDialog action={pendingAction} paused={autosavePaused} unavailable={recovery?.raw === null} hasOriginal={typeof recovery?.raw === 'string'} onDownloadOriginal={downloadOriginal} onClose={() => setPendingAction(null)} onConfirm={confirmRecovery}/>}
      {showModal && <DeviceDialog device={showModal === 'edit' ? selectedNode : null} nodes={nodes} onClose={() => setShowModal(false)} onSave={saveDevice}/>}
    </div>
  )
}
