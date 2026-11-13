import { useState } from 'react'

export default function InventoryControls({ nodes, edges, selectedId, onSelect, onEdit, onRemove, onMove, onConnect, onRemoveLink }) {
  const selected = nodes.find(node => node.id === selectedId)
  const [linkError, setLinkError] = useState('')
  const [notice, setNotice] = useState('')
  const move = event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const position = { x: Number(data.get('x')), y: Number(data.get('y')) }
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return
    onMove(selected.id, position)
    setNotice('Device position updated.')
  }
  const connect = event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const source = data.get('source'), target = data.get('target')
    if (!nodes.some(node => node.id === source) || !nodes.some(node => node.id === target)) { setLinkError('Choose both devices.'); return }
    if (source === target) { setLinkError('Choose two different devices.'); return }
    if (edges.length >= 10000) { setLinkError('This map supports up to 10,000 links.'); return }
    if (edges.some(edge => edge.source === source && edge.target === target && !edge.sourceHandle && !edge.targetHandle)) { setLinkError('This link already exists.'); return }
    onConnect({ source, target })
    setLinkError(''); setNotice('Link added.')
  }
  return <section className="inventory-controls" aria-labelledby="inventory-controls-title">
    <h2 id="inventory-controls-title">Devices & connections</h2><p>Choose a device to edit, or connect two devices below.</p>
    <label htmlFor="editor-device">Selected device</label>
    <select id="editor-device" value={selected?.id || ''} onChange={event => { onSelect(event.target.value); setNotice('') }}><option value="">Choose a device</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select>
    {selected && <div className="inventory-device-actions">
      <button className="button secondary" onClick={onEdit}>Edit device</button><button className="button danger" onClick={onRemove}>Delete device</button>
      <form key={`${selected.id}-${selected.position.x}-${selected.position.y}`} onSubmit={move} className="position-form">
        <label>X position<input name="x" type="number" step="any" required defaultValue={selected.position.x}/></label><label>Y position<input name="y" type="number" step="any" required defaultValue={selected.position.y}/></label><button className="button secondary" type="submit">Apply position</button>
      </form>
    </div>}
    <form onSubmit={connect} className="link-form">
      <div className="link-endpoint"><label htmlFor="link-source">From device</label><select id="link-source" name="source" required defaultValue=""><option value="" disabled>Choose a device</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></div>
      <div className="link-endpoint"><label htmlFor="link-target">To device</label><select id="link-target" name="target" required defaultValue=""><option value="" disabled>Choose a device</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></div>
      <button className="button secondary" type="submit" disabled={nodes.length < 2}>Add connection</button>
    </form>
    {linkError && <p className="field-error" role="alert">{linkError}</p>}
    <p role="status">{notice}</p>
    <ul className="editable-links">{edges.map(edge => <li key={edge.id}><span>{nodes.find(node => node.id === edge.source)?.data.label} → {nodes.find(node => node.id === edge.target)?.data.label}</span><button className="button secondary" aria-label={`Remove link ${nodes.find(node => node.id === edge.source)?.data.label} to ${nodes.find(node => node.id === edge.target)?.data.label}`} onClick={() => { onRemoveLink(edge.id); setNotice('Link removed.') }}>Remove link</button></li>)}</ul>
    {!edges.length && <p>No connections added.</p>}
  </section>
}
