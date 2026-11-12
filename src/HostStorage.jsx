import { useState, useEffect, useRef } from 'react'
import useModal from './useModal'
import { validateTopology } from './topology'

async function request(method='GET', body) {
  const response=await fetch('/api/v1/topology',{method,headers:body?{'Content-Type':'application/json','X-NetWatch-Write':'1'}:{},body:body?JSON.stringify(body):undefined})
  const result=await response.json()
  if(!response.ok) throw new Error(result.error?.message || 'Host request failed.')
  return result
}
function Preview({ action,onClose,onConfirm,busy }) {
  const modal=useModal(onClose)
  return <dialog {...modal} className="modal device-dialog" aria-labelledby="host-preview-title">
    <h2 id="host-preview-title">{action.kind==='load'?'Load host inventory?':'Save inventory to host?'}</h2>
    <p>{action.kind==='load'?'Replace the visible browser map':'Replace the host inventory'} with {action.topology.nodes.length} devices and {action.topology.edges.length} links. IDs and connections are preserved. This is a replacement, not an append.</p>
    <p>Host revision: {action.revision}. Export the current map before replacing it. Browser backups remain v1 JSON. New, imported or address-changed devices have monitoring disabled. Checks run only when explicitly enabled on the Windows host. This dashboard does not display live checks yet.</p>
    <details><summary>Review devices and authorization</summary><ul className="host-preview-list">{action.topology.nodes.map(n=><li key={n.id}>{n.data.label} · {n.id} · {n.data.ip||'no address'} · monitoring {action.monitoring[n.id]?'enabled':'disabled'}</li>)}</ul></details>
    <details><summary>Review connections</summary><ul className="host-preview-list">{action.topology.edges.map(e=><li key={e.id}>{e.id}: {e.source} → {e.target}</li>)}</ul></details>
    <div className="modal-actions"><button data-initial-focus className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy} onClick={onConfirm}>{busy?'Saving…':'Confirm replacement'}</button></div>
  </dialog>
}
export default function HostStorage({nodes,edges,onLoad,paused,importGeneration}) {
  const [host,setHost]=useState(null)
  const [action,setAction]=useState(null)
  const [message,setMessage]=useState('Browser mode. Host inventory is separate until you explicitly load or save it.')
  const [busy,setBusy]=useState(false)
  const [monitoring,setMonitoring]=useState({})
  const [monitorId,setMonitorId]=useState('')
  const imported=useRef(false)
  useEffect(()=>{if(importGeneration>0){imported.current=true;setMonitoring({});setAction(null)}},[importGeneration])
  const check=async()=>{
    setBusy(true)
    try {const value=await request();validateTopology(value.topology);setHost(value);setMonitoring(imported.current?{}:value.monitoring);setMessage(`Host ready · revision ${value.revision} · ${value.topology.nodes.length} devices. Monitoring runs on the Windows host when explicitly enabled; live dashboard integration is separate.`)}
    catch {setHost(null);setMessage('Host unavailable. Browser inventory is unchanged. Build and run npm start, then open http://127.0.0.1:4317. A disconnected host does not mean devices are down.')}
    finally {setBusy(false)}
  }
  const preview=kind=>{
    try {
      const topology=validateTopology(kind==='load'?host.topology:{nodes,edges})
      const unchanged=new Map(host.topology.nodes.map(n=>[n.id,n]))
      const settings=Object.fromEntries(topology.nodes.map(n=>[n.id,unchanged.get(n.id)?.data.ip===n.data.ip && unchanged.get(n.id)?.type===n.type && monitoring[n.id]===true]))
      setAction({kind,topology,monitoring:kind==='load'?host.monitoring:settings,revision:host.revision})
    } catch(e) {setMessage(e.message)}
  }
  const confirm=async()=>{
    setBusy(true)
    try {
      if(action.kind==='load') {imported.current=false;setMonitoring(host.monitoring);onLoad(action.topology);setMessage('Host inventory loaded into the browser. Changes remain local until Save to host is confirmed.')}
      else {const value=await request('PUT',{source:'inventory',baseRevision:action.revision,topology:action.topology,monitoring:action.monitoring});imported.current=false;setHost(value);setMonitoring(value.monitoring);setMessage(`Saved host revision ${value.revision}. Monitoring authorization is stored. Checks require the enabled Windows collector.`)}
      setAction(null)
    } catch(e) {setMessage(`${e.message} No automatic retry. Check host again and review before saving.`);setAction(null);setHost(null)}
    finally {setBusy(false)}
  }
  const current=host?.topology.nodes.find(n=>n.id===monitorId)
  return <section aria-label="Host inventory storage" className="host-storage">
    <h3>Local host storage</h3><p role="status">{message}</p>
    <div className="backup-actions"><button className="button secondary" disabled={busy} onClick={check}>Check host</button><button className="button secondary" disabled={!host||busy||paused} onClick={()=>preview('load')}>Load host…</button><button className="button secondary" disabled={!host||busy||paused} onClick={()=>preview('save')}>Save to host…</button></div>
    {paused&&<p>Recover browser storage before replacing or migrating inventory.</p>}
    {host&&<><label>Host device monitoring<select aria-label="Host device monitoring" value={monitorId} onChange={e=>setMonitorId(e.target.value)}><option value="">Choose an existing host device</option>{host.topology.nodes.map(n=><option key={n.id} value={n.id}>{n.data.label}</option>)}</select></label>{current&&<label><input type="checkbox" disabled={!current.data.ip} checked={monitoring[monitorId]===true} onChange={e=>setMonitoring({...monitoring,[monitorId]:e.target.checked})}/> Authorize ICMP checks for {current.data.label} ({current.data.ip||'no address'}). Save to host to apply.</label>}</>}
    {action&&<Preview action={action} busy={busy} onClose={()=>!busy&&setAction(null)} onConfirm={confirm}/>}
  </section>
}
