import useModal from './useModal'
import { X } from 'lucide-react'
import { HEALTH } from './health'
import { useState } from 'react'
import { hostRequest, formatCheckTime, collectorLabel } from './monitoring'
import DeviceHistory from './DeviceHistory'

export default function DeviceDetails({ device, check, connections, sampleMode, host, onClose }) {
  const modal = useModal(onClose)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const enabled = host?.snapshot.inventory.monitoring[device.id] === true
  const changeMonitoring = async () => {
    setSaving(true); setError('')
    const inventory = host.snapshot.inventory
    try {
      await hostRequest('topology', { signal: AbortSignal.timeout(10000), body: { source: 'inventory', baseRevision: inventory.revision, topology: inventory.topology, monitoring: { ...inventory.monitoring, [device.id]: !enabled } } })
      host.refresh()
    } catch (error) { setError(error.name === 'TimeoutError' || error instanceof TypeError ? 'Unable to save monitoring. Refresh and try again.' : error.message) }
    finally { setSaving(false) }
  }
  return <dialog {...modal} className="health-device-dialog" aria-labelledby="device-popup-title">
    <div className="health-dialog-body">
      <div className="health-dialog-heading"><div><span className="health-eyebrow">{sampleMode ? 'SAMPLE DEVICE' : 'NETWORK DEVICE'}</span><h2 id="device-popup-title">{device.data.label}</h2></div><button data-initial-focus className="health-close" aria-label="Close device details" onClick={onClose}><X size={18}/></button></div>
      <div className="health-device-details"><span className={`health-status health-${device.health}`}>{HEALTH[device.health].label}</span><p>{device.data.description || 'No description added.'}</p><dl>
        <div><dt>Type</dt><dd>{device.type === 'router' ? 'Router' : 'Switch'}</dd></div>
        <div><dt>Management IP</dt><dd>{device.data.ip || 'Not configured'}</dd></div>
        <div><dt>Last check</dt><dd>{formatCheckTime(check?.checkedAt)}</dd></div>
        <div><dt>Response time at check</dt><dd>{Number.isFinite(check?.latencyMs) ? `${check.latencyMs} ms` : 'Unavailable'}</dd></div>
        <div><dt>Data source</dt><dd>{sampleMode ? 'Sample preview' : host ? 'Device reachability checks' : 'Browser map only'}</dd></div>
        {host && <><div><dt>Monitoring</dt><dd>{!device.data.ip ? 'No device address' : enabled ? check ? check.status === 'unknown' ? 'Enabled · Confirming result' : 'Enabled' : 'Enabled · Awaiting first check' : 'Disabled'}</dd></div><div><dt>Monitoring service</dt><dd>{host.state === 'connected' ? 'Connected' : 'Disconnected'} · {collectorLabel(host.snapshot.collector.state)}</dd></div></>}
      </dl>
      {host && <><p>Enable checks only for devices you manage, with monitoring started in the Windows app.</p><button className="health-button" disabled={saving || host.state !== 'connected' || !device.data.ip} onClick={changeMonitoring}>{saving ? 'Saving…' : enabled ? 'Disable monitoring' : 'Enable monitoring'}</button>{error && <p role="alert">{error}</p>}<details className="health-history-options"><summary>Recent history</summary><DeviceHistory deviceId={device.id} revision={host.snapshot.inventory.revision} checkedAt={check?.checkedAt}/></details></>}
      <h3>Connected devices</h3>
      {connections.length ? <ul className="health-neighbors">{connections.map(item => <li key={item.id}><div><strong>{item.device.data.label}</strong><span className={`health-status health-${item.device.health}`}>{HEALTH[item.device.health].label}</span></div><small>{item.health === 'down' ? 'Red path · a connected device is down' : item.health === 'up' ? 'Green path · both devices are up' : item.health === 'stale' ? 'Amber path · a check is overdue' : 'Gray path · reachability unknown'}</small></li>)}</ul> : <p>No configured connections.</p>}
      <p className="health-dialog-note">Device health is checked independently. Line colors summarize endpoint reachability; they do not verify interface or routing-session state.</p>
      </div>
    </div>
  </dialog>
}
