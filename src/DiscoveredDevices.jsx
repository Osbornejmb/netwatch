import ConfirmDialog from './ConfirmDialog'
import { useEffect, useState } from 'react'
import InfoTooltip from './InfoTooltip'
import { guessDeviceType } from './discoveryType.js'

const statusLabel={new:'New',changed:'Changed',added:'Added',gone:'Not seen'}
const seenAt=value=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
export default function DiscoveredDevices() {
  const [confirm, setConfirm] = useState(null)
  const [devices,setDevices]=useState([]),[busy,setBusy]=useState(false),[scanning,setScanning]=useState(false),[progress,setProgress]=useState(null),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[after,setAfter]=useState(0),[pages,setPages]=useState([]),[nextAfter,setNextAfter]=useState(null)
  const refresh=async(cursor=after)=>{const r=await fetch(`/api/v1/discovered?after=${cursor}&limit=200`);if(!r.ok)throw Error();const value=await r.json();setDevices(value.devices);setNextAfter(value.nextAfter);setAfter(cursor)}
  useEffect(()=>{void refresh(0).catch(()=>setMessage('Connect to the NetWatch host to review discovered devices.'))},[])
  useEffect(()=>{if(!scanning)return;let stopped=false,timer;const poll=async()=>{try{const r=await fetch('/api/v1/health');if(r.ok&&!stopped){const health=await r.json();setProgress(health.discovery)}}catch{}if(!stopped)timer=setTimeout(poll,500)};void poll();return()=>{stopped=true;clearTimeout(timer)}},[scanning])
  const action=async(device,kind)=>{setBusy(true);setMessage('');try{let body={};if(kind==='add-to-map'){const inventory=await fetch('/api/v1/topology').then(r=>r.json());body={baseRevision:inventory.revision}}const r=await fetch(`/api/v1/discovered/${encodeURIComponent(device.id)}/${kind}`,{method:'POST',headers:{'Content-Type':'application/json','X-NetWatch-Write':'1'},body:JSON.stringify(body)});if(!r.ok)throw Error();const result=await r.json();await refresh();setMessage(result.promotedRouter?'Updated device to Router.':result.discoveryLink?`Linked to ${result.discoveryLink.label}`:kind==='remove'?'Removed from discovered devices.':device.status==='added'?'No gateway change was needed.':'Added to the map.')}catch{setMessage('Could not update this device. Refresh and try again.')}finally{setBusy(false)}}
  const clear=async()=>{setBusy(true);setMessage('');try{const r=await fetch('/api/v1/discovered/clear',{method:'POST',headers:{'X-NetWatch-Write':'1'}});if(!r.ok)throw Error();setPages([]);await refresh(0);setMessage('Discovery list cleared.')}catch{setMessage('Could not clear discovered devices. Refresh and try again.')}finally{setBusy(false)}}
  const scan=async()=>{setBusy(true);setScanning(true);setMessage('');try{const r=await fetch('/api/v1/discovered/scan-now',{method:'POST',headers:{'X-NetWatch-Write':'1'}});if(!r.ok)throw Error();const result=await r.json();if(result.state==='disabled'||result.state==='unsupported')throw Error();setPages([]);await refresh(0);setMessage('Scan complete.')}catch{setMessage('Scan could not run. Check that discovery is enabled in the launcher.')}finally{setScanning(false);setProgress(null);setBusy(false)}}
  const visible=devices.filter(d=>(filter==='all'||d.status===filter)&&`${d.ip} ${d.mac||''} ${d.hostname||''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const phase=progress?.phase==='icmp'?`Checking ${progress.processed} of ${progress.total} local addresses for ping replies…`:progress?.phase==='neighbors'?'Reading the Windows neighbor list…':progress?.phase==='names'?`Looking up names for ${progress.processed} of ${progress.total} devices…`:progress?.phase==='saving'?'Saving scan results…':'Starting scan…'
  return <section className="page-content discovery-page" aria-labelledby="discovery-title">
    <header className="page-heading">
      <h1 id="discovery-title">Discovered devices</h1>
      <div className="discovery-heading-actions">
        <button className="button secondary" disabled={busy || !devices.length} onClick={() => setConfirm({
          title: 'Clear discovery list?', message: 'Devices already added to the map will stay there.',
          label: 'Clear all', onConfirm: clear,
        })}>Clear all</button>
        <button className="button primary" disabled={busy} onClick={scan}>{scanning ? 'Scanning…' : 'Scan now'}</button>
      </div>
    </header>
    {scanning && <div className="discovery-progress" role="progressbar" aria-label="Network scan progress"
      aria-valuemax={progress?.total || 100} aria-valuenow={['icmp', 'names'].includes(progress?.phase) ? progress.processed : undefined}>
      <span className="discovery-spinner" aria-hidden="true"/><span>{phase}</span>
    </div>}
    <p className="discovery-message" role="status">{message}</p>
    {devices.length > 0 && <div className="discovery-toolbar">
      <input aria-label="Search this page" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a device"/>
      <select aria-label="Device status" value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="all">All statuses</option>
        {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>}
    {visible.length ? <ul className="discovery-list" aria-label="Discovery results">
      {visible.map(device => {
        const guess = guessDeviceType(device.hostname)
        return <li key={device.id} className="discovery-row">
          <div className="discovery-identity">
            <strong>{device.hostname || device.ip}</strong>
            {device.hostname && <span>{device.ip}</span>}
            <span>{statusLabel[device.status] || 'New'}</span>
          </div>
          <div className="discovery-actions">
            <button className="button secondary" disabled={busy} onClick={() => action(device, 'add-to-map')}>
              {device.status === 'added' ? 'Update gateway link' : 'Add to map'}
            </button>
            <button className="button secondary" disabled={busy} onClick={() => setConfirm({
              title: 'Remove discovered device?', message: 'Remove ' + device.ip + ' from discovery? It can reappear after a scan. Your map stays as it is.',
              label: 'Remove', onConfirm: () => action(device, 'remove'),
            })}>Remove</button>
            <InfoTooltip label={'Information for ' + device.ip}>
              <span>Hardware address · {device.mac || 'Unavailable'}</span>
              <span>Type guess · {guess.type} ({guess.confidence.toLowerCase()} confidence)</span>
              <span>{guess.evidence}</span>
              <span>First seen · {seenAt(device.firstSeen)}</span>
              <span>Last seen · {seenAt(device.lastSeen)}</span>
            </InfoTooltip>
          </div>
        </li>
      })}
    </ul> : <p className="discovery-empty">{devices.length ? 'No devices match these filters.' : 'No discovered devices yet.'}</p>}
    {(pages.length > 0 || nextAfter !== null) && <nav className="discovery-pagination" aria-label="Discovered device pages">
      <button className="button secondary" disabled={busy || !pages.length} onClick={() => {
        const previous = pages.at(-1) ?? 0
        void refresh(previous).then(() => setPages(pages.slice(0, -1))).catch(() => setMessage('Could not load the previous page.'))
      }}>Previous</button>
      <span>Page {pages.length + 1}</span>
      <button className="button secondary" disabled={busy || nextAfter === null} onClick={() => {
        void refresh(nextAfter).then(() => setPages([...pages, after])).catch(() => setMessage('Could not load the next page.'))
      }}>Next</button>
    </nav>}
    {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
  </section>
}
