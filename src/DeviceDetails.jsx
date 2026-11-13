import useModal from './useModal'
import { X } from 'lucide-react'
import { HEALTH } from './health'
import { useRef, useState } from 'react'
import { hostRequest, formatCheckTime, collectorLabel } from './monitoring'
import DeviceHistory from './DeviceHistory'
import DeviceIncidents from './DeviceIncidents'
import DeviceInterfaces from './DeviceInterfaces'

export default function DeviceDetails({ device, check, connections, host, onClose }) {
  const modal = useModal(onClose)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [interfacesOpen,setInterfacesOpen]=useState(false)
  const history = useRef(null)
  const viewChecks = () => { history.current.open = true; history.current.querySelector('summary').focus(); history.current.scrollIntoView({ block: 'nearest' }) }
  const enabled = host?.snapshot.inventory.monitoring[device.id] === true
  const changeMonitoring = async () => {
    setSaving(true); setError('')
    const inventory = host.snapshot.inventory
    try {
      await hostRequest('topology', { signal: AbortSignal.timeout(10000), body: { source: 'inventory', baseRevision: inventory.revision, topology: inventory.topology, monitoring: { ...inventory.monitoring, [device.id]: !enabled } } })
      host.refresh()
    } catch (error) { setError(error.name === 'TimeoutError' || error instanceof TypeError ? 'Unable to save monitoring. Refresh and try again.' : 'Unable to save checks; refresh and try again.') }
    finally { setSaving(false) }
  }
  return <dialog {...modal} className="health-device-dialog" aria-labelledby="device-popup-title">
    <div className="health-dialog-body">
      <div className="health-dialog-heading"><div><span className="health-eyebrow">NETWORK DEVICE</span><h2 id="device-popup-title">{device.data.label}</h2></div><button data-initial-focus className="health-close" aria-label="Close device details" onClick={onClose}><X size={18}/></button></div>
      <div className="health-device-details"><span className={`health-status health-${device.health}`}>{HEALTH[device.health].label}</span>{device.data.description&&<p>{device.data.description}</p>}<dl>
        <div><dt>IP address</dt><dd>{device.data.ip || 'Not configured'}</dd></div>
        <div><dt>Last check</dt><dd>{formatCheckTime(check?.checkedAt)}</dd></div>
        <div><dt>Response time</dt><dd>{Number.isFinite(check?.latencyMs) ? `${check.latencyMs} ms` : 'Unavailable'}</dd></div>
        {host && <div><dt>Device checks</dt><dd>{!device.data.ip ? 'Needs an IP address' : enabled ? check ? check.status === 'unknown' ? 'Confirming result' : 'On' : 'Waiting for first check' : 'Off'}</dd></div>}
      </dl>
      {host && <><p>Turn on checks only for devices you manage.</p><button className="health-button" disabled={saving || host.state !== 'connected' || !device.data.ip} onClick={changeMonitoring}>{saving ? 'Saving…' : enabled ? 'Turn checks off' : 'Turn checks on'}</button>{error && <p role="alert">{error}</p>}<details className="health-history-options"><summary>Outages</summary><DeviceIncidents onViewChecks={viewChecks} deviceId={device.id} revision={host.snapshot.inventory.revision} checkedAt={check?.checkedAt}/></details><details ref={history} className="health-history-options"><summary>Check history</summary><DeviceHistory deviceId={device.id} revision={host.snapshot.inventory.revision} checkedAt={check?.checkedAt}/></details></>}
      {host&&<details className="health-history-options" onToggle={event=>setInterfacesOpen(event.currentTarget.open)}><summary>Ports</summary>{interfacesOpen&&<DeviceInterfaces deviceId={device.id} revision={host.snapshot.inventory.revision}/>}</details>}
      <details className="health-history-options"><summary>Connections ({connections.length})</summary>
      {connections.length ? <ul className="health-neighbors">{connections.map(item => <li key={item.id}><div><strong>{item.device.data.label}</strong><span className={`health-status health-${item.device.health}`}>{HEALTH[item.device.health].label}</span></div><small>{item.health === 'down' ? 'Red path · a connected device is down' : item.health === 'up' ? 'Green path · both devices are up' : item.health === 'stale' ? 'Amber path · a check is overdue' : 'Gray line · no current result'}</small></li>)}</ul> : <p>No connections added.</p>}
      <p className="health-dialog-note">Each device is checked separately; line colors do not confirm a cable or port is working.</p></details>
      <details className="health-history-options"><summary>About this device</summary><dl><div><dt>Type</dt><dd>{device.type==='router'?'Router':'Switch'}</dd></div><div><dt>Showing</dt><dd>{host?'Live device checks':'Draft map'}</dd></div>{host&&<div><dt>NetWatch connection</dt><dd>{host.state==='connected'?'Connected':'Disconnected'} · {collectorLabel(host.snapshot.collector.state)}</dd></div>}</dl></details>
      </div>
    </div>
  </dialog>
}
