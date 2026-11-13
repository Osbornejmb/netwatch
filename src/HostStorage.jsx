import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
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
    <h2 id="host-preview-title">{action.kind==='load'?'Replace your draft?':'Use this map?'}</h2>
    <p>{action.kind==='load'?'Replace your draft':'Replace the monitored network'} with {action.topology.nodes.length} {action.topology.nodes.length===1?'device':'devices'} and {action.topology.edges.length} {action.topology.edges.length===1?'connection':'connections'}.</p>
    <p>Download a copy first; this replaces the whole map rather than adding to it.</p>
    <p>New devices and changed addresses start with checks off.</p>
    <details><summary>Review devices</summary><ul className="host-preview-list">{action.topology.nodes.map(n=><li key={n.id}>{n.data.label} · {n.data.ip||'no address'} · checks {action.monitoring[n.id]?'on':'off'}</li>)}</ul></details>
    <details><summary>Review connections</summary><ul className="host-preview-list">{action.topology.edges.map(e=><li key={e.id}>{action.topology.nodes.find(n=>n.id===e.source)?.data.label} → {action.topology.nodes.find(n=>n.id===e.target)?.data.label}</li>)}</ul></details>
    <div className="modal-actions"><button data-initial-focus className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy} onClick={onConfirm}>{busy?'Saving…':'Confirm replacement'}</button></div>
  </dialog>
}
export default forwardRef(function HostStorage({nodes,edges,onLoad,paused,importGeneration},ref) {
  const [host,setHost]=useState(null)
  const [action,setAction]=useState(null)
  const [message,setMessage]=useState('Your draft is separate from the network being monitored.')
  const [busy,setBusy]=useState(false)
  const [monitoring,setMonitoring]=useState({})
  const [monitorId,setMonitorId]=useState('')
  const imported=useRef(false)
  const settings=useRef(null)
  useEffect(()=>{if(importGeneration>0){imported.current=true;setMonitoring({});setAction(null)}},[importGeneration])
  const check=async()=>{
    setBusy(true)
    try {const value=await request();validateTopology(value.topology);setHost(value);setMonitoring(imported.current?{}:value.monitoring);setMessage(`Connected · ${value.topology.nodes.length} saved devices.`);return value}
    catch {setHost(null);setMessage('Start NetWatch in the Windows app, then try connecting again.');settings.current.open=true;settings.current.scrollIntoView({block:'nearest'})}
    finally {setBusy(false)}
  }
  const preview=(kind,saved=host,settingsOverride=monitoring)=>{
    try {
      const topology=validateTopology(kind==='load'?saved.topology:{nodes,edges})
      const unchanged=new Map(saved.topology.nodes.map(n=>[n.id,n]))
      const settings=Object.fromEntries(topology.nodes.map(n=>[n.id,unchanged.get(n.id)?.data.ip===n.data.ip && unchanged.get(n.id)?.type===n.type && settingsOverride[n.id]===true]))
      setAction({kind,topology,monitoring:kind==='load'?saved.monitoring:settings,revision:saved.revision})
    } catch {setMessage('This map could not be prepared; check its devices and connections.')}
  }
  useImperativeHandle(ref,()=>({reviewSave:async()=>{if(paused||busy)return;const saved=await check();if(saved)preview('save',saved,imported.current?{}:saved.monitoring)},reviewLoad:async()=>{if(paused||busy)return;const saved=await check();if(saved)preview('load',saved)}}))
  const confirm=async()=>{
    setBusy(true)
    try {
      if(action.kind==='load') {imported.current=false;setMonitoring(host.monitoring);onLoad(action.topology);setMessage('Saved network copied to your draft; edits apply only after you choose Use this map.')}
      else {const value=await request('PUT',{source:'inventory',baseRevision:action.revision,topology:action.topology,monitoring:action.monitoring});imported.current=false;setHost(value);setMonitoring(value.monitoring);setMessage('Network saved; start checks in the Windows app to monitor enabled devices.')}
      setAction(null)
    } catch {setMessage('Unable to save; reconnect and review the latest saved network before trying again.');setAction(null);setHost(null)}
    finally {setBusy(false)}
  }
  const current=host?.topology.nodes.find(n=>n.id===monitorId)
  return <section aria-label="Saved network settings" className="host-storage">
    <details ref={settings}><summary>Monitoring settings</summary>
    <h3>Monitored network</h3><p role="status">{message}</p>
    <div className="backup-actions"><button className="button secondary" disabled={busy} onClick={check}>{busy?'Connecting…':'Connect'}</button><button className="button secondary" disabled={!host||busy||paused} onClick={()=>preview('load')}>Copy to draft</button><button className="button primary" disabled={!host||busy||paused} onClick={()=>preview('save')}>Use this map</button></div>
    {paused&&<p>Restore draft saving before replacing a map.</p>}
    {host&&<details><summary>Device checks</summary><label>Choose a saved device<select aria-label="Host device monitoring" value={monitorId} onChange={e=>setMonitorId(e.target.value)}><option value="">Choose a device</option>{host.topology.nodes.map(n=><option key={n.id} value={n.id}>{n.data.label}</option>)}</select></label>{current&&<label><input type="checkbox" disabled={!current.data.ip} checked={monitoring[monitorId]===true} onChange={e=>setMonitoring({...monitoring,[monitorId]:e.target.checked})}/> Check {current.data.label} ({current.data.ip||'no address'}); choose Use this map to apply.</label>}</details>}
    </details>{action&&<Preview action={action} busy={busy} onClose={()=>!busy&&setAction(null)} onConfirm={confirm}/>}
  </section>
})
