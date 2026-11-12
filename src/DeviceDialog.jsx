import { useState } from 'react'
import useModal from './useModal'
import { deviceFields } from './inventory'

export default function DeviceDialog({ device, nodes, onSave, onClose }) {
  const modal = useModal(onClose)
  const dialog = modal.ref
  const [kind, setKind] = useState(device?.type || 'switch')
  const [label, setLabel] = useState(device?.data.label || '')
  const [ip, setIp] = useState(device?.data.ip || '')
  const [description, setDescription] = useState(device?.data.description || '')
  const [errors, setErrors] = useState({})
  const submit = event => {
    event.preventDefault()
    const nextErrors = {}
    if (!label.trim()) nextErrors.label = 'Enter a device name.'
    try { deviceFields({ label: label.trim() || 'Device', ip, description }, nodes, device?.id) }
    catch (error) { nextErrors.ip = error.message }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      dialog.current.querySelector(nextErrors.label ? '#device-name' : '#device-ip').focus()
      return
    }
    onSave({ kind, ...deviceFields({ label, ip, description }, nodes, device?.id) })
  }
  return <dialog {...modal} className="modal device-dialog" aria-labelledby="device-dialog-title">
    <form onSubmit={submit} noValidate>
      <div className="modal-head"><h2 id="device-dialog-title">{device ? 'Edit network device' : 'Add network device'}</h2><button type="button" className="icon-button" aria-label="Close device dialog" onClick={onClose}>×</button></div>
      {!device && <><label className="field-label" htmlFor="device-kind">Device type</label><select id="device-kind" value={kind} onChange={event => setKind(event.target.value)}><option value="switch">Switch</option><option value="router">Router</option></select></>}
      <label className="field-label" htmlFor="device-name">Device name (required)</label>
      <input data-initial-focus id="device-name" required maxLength={100} value={label} onChange={event => setLabel(event.target.value)} aria-invalid={Boolean(errors.label)} aria-describedby={errors.label ? 'name-error' : undefined}/>
      {errors.label && <p id="name-error" className="field-error" role="alert">{errors.label}</p>}
      <label className="field-label" htmlFor="device-ip">Management IP address</label>
      <input id="device-ip" maxLength={253} value={ip} onChange={event => setIp(event.target.value)} aria-invalid={Boolean(errors.ip)} aria-describedby={errors.ip ? 'ip-error ip-help' : 'ip-help'}/>
      <p id="ip-help">IPv4 or IPv6 literal. Leave empty for an unmonitored entry.</p>
      {errors.ip && <p id="ip-error" className="field-error" role="alert">{errors.ip}</p>}
      <label className="field-label" htmlFor="device-desc">Description (optional)</label>
      <input id="device-desc" maxLength={500} value={description} onChange={event => setDescription(event.target.value)}/>
      <p>Inventory changes do not enable monitoring.</p>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" type="submit">{device ? 'Save changes' : 'Add device'}</button></div>
    </form>
  </dialog>
}
