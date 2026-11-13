import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, addEdge, useEdgesState,
  useNodesState, MarkerType, Panel,
} from '@xyflow/react'
import { Activity, Check, GitBranch, Plus, Search, Trash2, X } from 'lucide-react'
import RouterNode from './nodes/RouterNode'
import SwitchNode from './nodes/SwitchNode'
import Dashboard from './Dashboard'
import HostStorage from './HostStorage'
import DeviceDialog from './DeviceDialog'
import RecoveryDialog from './RecoveryDialog'
import InventoryControls from './InventoryControls'
import { createId } from './id'

import { readTopology, writeTopology, validateTopology } from './topology'

const nodeTypes = { router: RouterNode, switch: SwitchNode }

export default function App() {
  const saved = useMemo(() => readTopology({ getItem: key => localStorage.getItem(key) }, { nodes: [], edges: [] }), [])
  const [nodes, setNodes, onNodesChange] = useNodesState(saved.topology.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(saved.topology.edges)
  const [view, setView] = useState('dashboard')
  const [showModal, setShowModal] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const selectedNode = nodes.find(node => node.id === selectedId)
  const setSelectedNode = node => setSelectedId(node?.id || null)
  const [query, setQuery] = useState('')

  const [storageError, setStorageError] = useState(saved.error)
  const [autosavePaused, setAutosavePaused] = useState(Boolean(saved.error))
  const [recovery, setRecovery] = useState(saved.recovery)
  const [pendingAction, setPendingAction] = useState(null)
  const [importError, setImportError] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [backupNotice, setBackupNotice] = useState('')
  const importInput = useRef(null)
  const hostStorage = useRef(null)
  const [importGeneration,setImportGeneration] = useState(0)

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
      setImportError('Import failed: choose a valid NetWatch map file smaller than 5 MB.')
    } finally {
      setImportBusy(false)
    }
  }

  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({
      ...params, id: `edge-${createId()}`, label: 'Link',
      style: { stroke: '#64748b', strokeWidth: 2 },
      labelStyle: { fill: '#5b6963', fontSize: 12 },
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
      setImportGeneration(value=>value+1)
      setNodes(pendingAction.topology.nodes); setEdges(pendingAction.topology.edges); setSelectedNode(null); setQuery('')
      setBackupNotice(autosavePaused ? 'Map imported into this view. Autosave remains paused; replace the saved map explicitly to save it.' : 'Map imported. Autosave is active.')
    } else persistCurrent()
    setPendingAction(null)
  }

  return (
    <div className={`app-shell simple-shell${view !== 'editor' ? ' dashboard-shell' : ''}`}>
      <main className="main-area">
        <header className="topbar">
          <a className="top-brand" href="#dashboard" onClick={() => setView('dashboard')}><span className="brand-symbol"><Activity size={20} aria-hidden="true"/></span> NetWatch</a>
          <nav className="top-menu" aria-label="Main navigation">
            <a href="#dashboard" aria-label="Network dashboard" aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => setView('dashboard')}>Dashboard</a>
            <a href="#topology" aria-label="Edit network map" aria-current={view === 'editor' ? 'page' : undefined} onClick={() => setView('editor')}>Edit map</a>
            <a href="#inventory" aria-label="Devices" aria-current={view === 'inventory' ? 'page' : undefined} onClick={() => setView('inventory')}>Devices</a>
          </nav>
        <section className="backup-recovery" aria-label="Map backup and recovery">
          <details open={storageError || importError ? true : undefined}>
            <summary aria-label="Map backup and recovery">Backups{storageError ? ' · Needs attention' : importError ? ' · Import failed' : ''}</summary>
            {storageError && <p className="notice storage-warning" role="alert">{storageError}</p>}
            {importError && <p className="notice storage-warning" role="alert">{importError} Your current map and saved data have not been replaced.</p>}
            <h2>Map backups</h2><p>Download your draft or restore a previously saved copy.</p>
            {recovery && <p>{typeof recovery.raw === 'string' ? 'Download original saved content preserves the unreadable saved text exactly. It is separate from the current visible map.' : 'The original saved content is unavailable because storage access was denied. Export the visible map, allow browser storage, then reload to access the original before replacing it.'}</p>}
            <div className="backup-actions"><button className="button secondary" onClick={exportTopology}>Download map</button><button className="button secondary" disabled={importBusy} onClick={() => importInput.current.click()}>{importBusy ? 'Reading backup…' : 'Restore map'}</button>{autosavePaused&&<button className="button secondary" disabled={importBusy} onClick={saveNow}>Replace saved map…</button>}{typeof recovery?.raw === 'string' && <button className="button secondary" onClick={downloadOriginal}>Download original</button>}</div>
          <p className="backup-status" role="status">{importBusy ? 'Validating backup…' : backupNotice}</p>
          </details>
          <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={importTopology}/>
        </section>
        </header>

        {view !== 'editor' ? <Dashboard nodes={nodes} edges={edges} showInventory={view === 'inventory'} onMoveDevice={(id, position) => setNodes(current => current.map(node => node.id === id ? { ...node, position } : node))} onEdit={() => setView('editor')}/> : <section className="page-content" id="topology">
          <div className="page-heading">
            <div><h1>Edit your map</h1><p>Changes save as a draft until you choose Use this map.</p></div>
            <div className="heading-actions"><button className="button secondary" disabled={autosavePaused||importBusy} onClick={()=>void hostStorage.current.reviewLoad()}>Load saved map</button><button className="button primary" onClick={() => setShowModal('add')}><Plus size={17}/> Add device</button></div>
          </div>

          <div className="canvas-toolbar">
            <div className="canvas-title"><GitBranch size={18}/><div><strong>Draft map</strong><span>{nodes.length} {nodes.length===1?'device':'devices'} · {edges.length} {edges.length===1?'connection':'connections'}</span></div></div>
            <div className="canvas-actions"><div className="search-box"><Search size={15}/><input aria-label="Find a device" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a device" /></div><button className="button primary" disabled={autosavePaused||importBusy} onClick={()=>void hostStorage.current.reviewSave()}><Check size={15}/>Use this map</button></div>
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
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' }, type: 'smoothstep', style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#5b6963', fontSize: 12 } }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#d6d9d1" gap={24} size={1}/>
              <Controls />
              {!nodes.length && <Panel position="top-center"><div className="editor-empty"><GitBranch size={28}/><h2>Build your network</h2><p>Add a device, then connect it to another.</p><button className="button primary" onClick={() => setShowModal('add')}>Add first device</button></div></Panel>}
            </ReactFlow>
            {selectedNode && <div className="device-inspector">
              <div className="inspector-head"><div><h3>{selectedNode.data.label}</h3></div><button className="icon-button" aria-label="Close device details" onClick={() => setSelectedNode(null)}><X size={17}/></button></div>
              <div className="inspector-type"><span className={selectedNode.type === 'router' ? 'type-square' : 'type-circle'}/>{selectedNode.type.toUpperCase()}</div>
              <div className="detail-row"><span>IP address</span><strong>{selectedNode.data.ip || 'Not set'}</strong></div>
              <div className="detail-row"><span>Monitoring</span><strong className="pending">Not monitored</strong></div>
              <div className="detail-row"><span>Description</span><strong>{selectedNode.data.description || '—'}</strong></div>
              <button className="button secondary full" onClick={() => setShowModal('edit')}>Edit device</button>
              <button className="button danger full" onClick={removeSelected}><Trash2 size={15}/> Remove device</button>
            </div>}
          </div>

          <details className="editor-tools"><summary>Devices & connections</summary><InventoryControls nodes={nodes} edges={edges} selectedId={selectedId} onSelect={setSelectedId} onEdit={() => setShowModal('edit')} onRemove={removeSelected} onMove={(id, position) => setNodes(ns => ns.map(node => node.id === id ? { ...node, position } : node))} onConnect={onConnect} onRemoveLink={id => setEdges(es => es.filter(edge => edge.id !== id))}/></details>
        </section>}
        <div hidden={view!=='editor'} className="editor-network-settings"><HostStorage ref={hostStorage} importGeneration={importGeneration} nodes={nodes} edges={edges} paused={autosavePaused} onLoad={topology=>{setNodes(topology.nodes);setEdges(topology.edges);setSelectedNode(null)}}/></div>
      </main>
      {pendingAction && <RecoveryDialog action={pendingAction} paused={autosavePaused} unavailable={recovery?.raw === null} hasOriginal={typeof recovery?.raw === 'string'} onDownloadOriginal={downloadOriginal} onClose={() => setPendingAction(null)} onConfirm={confirmRecovery}/>}
      {showModal && <DeviceDialog device={showModal === 'edit' ? selectedNode : null} nodes={nodes} onClose={() => setShowModal(false)} onSave={saveDevice}/>}
    </div>
  )
}
