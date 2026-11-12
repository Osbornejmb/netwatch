import useModal from './useModal'
import { X } from 'lucide-react'
import { HEALTH } from './health'

export default function DeviceDetails({ device, check, connections, sampleMode, onClose }) {
  const modal = useModal(onClose)
  return <dialog {...modal} className="health-device-dialog" aria-labelledby="device-popup-title">
    <div className="health-dialog-body">
      <div className="health-dialog-heading"><div><span className="health-eyebrow">{sampleMode ? 'SAMPLE DEVICE' : 'NETWORK DEVICE'}</span><h2 id="device-popup-title">{device.data.label}</h2></div><button data-initial-focus className="health-close" aria-label="Close device details" onClick={onClose}><X size={18}/></button></div>
      <div className="health-device-details"><span className={`health-status health-${device.health}`}>{HEALTH[device.health].label}</span><p>{device.data.description || 'No description added.'}</p><dl>
        <div><dt>Type</dt><dd>{device.type === 'router' ? 'Router' : 'Switch'}</dd></div>
        <div><dt>Management IP</dt><dd>{device.data.ip || 'Not configured'}</dd></div>
        <div><dt>Last check</dt><dd>{check ? new Date(check.checkedAt).toLocaleString() : 'Never checked'}</dd></div>
        <div><dt>Response time</dt><dd>{device.health === 'up' && Number.isFinite(check?.latencyMs) ? `${check.latencyMs} ms` : 'Unavailable'}</dd></div>
        <div><dt>Data source</dt><dd>{sampleMode ? 'Sample preview' : 'Inventory only'}</dd></div>
      </dl>
      <h3>Connected devices</h3>
      {connections.length ? <ul className="health-neighbors">{connections.map(item => <li key={item.id}><div><strong>{item.device.data.label}</strong><span className={`health-status health-${item.device.health}`}>{HEALTH[item.device.health].label}</span></div><small>{item.health === 'down' ? 'Red path · a connected device is down' : item.health === 'up' ? 'Green path · both devices are up' : item.health === 'stale' ? 'Amber path · a check is overdue' : 'Gray path · reachability unknown'}</small></li>)}</ul> : <p>No configured connections.</p>}
      <p className="health-dialog-note">Device health is checked independently. Line colors summarize endpoint reachability; they do not verify interface or routing-session state.</p>
      </div>
    </div>
  </dialog>
}
