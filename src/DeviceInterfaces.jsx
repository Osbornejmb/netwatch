import {useEffect,useState} from 'react'
import {hostRequest,formatCheckTime} from './monitoring'

const OPER={1:'Up',2:'Down',3:'Testing',4:'Unknown',5:'Dormant',6:'Not present',7:'Lower layer down'}
const ADMIN={1:'Enabled',2:'Disabled',3:'Testing'}
function validate(value,revision) {
  if(value?.revision!==revision||typeof value.configured!=='boolean'||!Number.isFinite(value.monitoring?.staleAfterMs)||value.monitoring.staleAfterMs<1||typeof value.monitoring.collectorState!=='string'||!(value.checkedAt===null||typeof value.checkedAt==='string'&&Number.isFinite(Date.parse(value.checkedAt)))||!Array.isArray(value.interfaces)||value.interfaces.length>50||!Number.isSafeInteger(value.total)||value.total<0||value.total>512)throw Error('Invalid interfaces')
  if(value.interfaces.some((r,i)=>!Number.isSafeInteger(r.index)||r.index<1||(i&&r.index<=value.interfaces[i-1].index)||typeof r.name!=='string'||r.name.length>128||typeof r.description!=='string'||r.description.length>128||![null,1,2,3].includes(r.admin)||![null,1,2,3,4,5,6,7].includes(r.oper)||['inBps','outBps'].some(k=>r[k]!==null&&(!Number.isFinite(r[k])||r[k]<0||r[k]>1e15))))throw Error('Invalid interface row')
  if(value.nextAfter!==null&&(!value.interfaces.length||value.nextAfter!==value.interfaces.at(-1).index))throw Error('Invalid interface page')
  return value
}
const rate=value=>value===null?'Unavailable':value>=1000000?`${(value/1000000).toFixed(2)} Mbps`:`${(value/1000).toFixed(1)} kbps`
export default function DeviceInterfaces({deviceId,revision}) {
  const [page,setPage]=useState(null),[error,setError]=useState(''),[after,setAfter]=useState(0),[reload,setReload]=useState(0),[now,setNow]=useState(Date.now)
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
  useEffect(()=>{
    let stopped=false,timer,controller
    const poll=async()=>{
      controller=new AbortController()
      try {
        const value=validate(await hostRequest(`devices/${encodeURIComponent(deviceId)}/interfaces?limit=50&after=${after}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])}),revision)
        if(!stopped){setPage(value);setError('')}
      }catch {if(!stopped)setError('Port checks are unavailable; saved results may be out of date.')}
      finally{if(!stopped)timer=setTimeout(poll,5000)}
    }
    setPage(null);setError('');poll()
    return()=>{stopped=true;clearTimeout(timer);controller?.abort()}
  },[deviceId,revision,after,reload])
  const checked=Date.parse(page?.checkedAt),current=page?.configured&&['running','degraded'].includes(page.monitoring.collectorState)&&Number.isFinite(checked)&&checked<=now&&now-checked<=page.monitoring.staleAfterMs&&!error
  return <section className="health-interfaces health-history" aria-label="Device ports">
    <h3>Port checks</h3><p>Port checks are separate from device checks; missing results do not mean a port is down.</p>
    {error&&<p role="alert">{error}</p>}
    {!page&&!error&&<p role="status">Loading ports…</p>}
    {page&&<><p>{!page.configured?'Port checks are not set up on this PC.':page.monitoring.collectorState==='disabled'?'Port checks are paused.':!current?'Waiting for new port results.':page.monitoring.state==='checking'?'Checking ports; showing recent results.':page.monitoring.state&&page.monitoring.state!=='ok'?'Checks interrupted; showing recent results.':'Recent port results.'}</p>
    <p>Last port check: {formatCheckTime(page.checkedAt)} · {page.total} ports</p>
    {!page.interfaces.length&&<p>No recorded ports.</p>}
    <ol>{page.interfaces.map(row=><li key={row.index}><strong>{row.name||row.description||`Interface ${row.index}`}</strong><span>{current?'':'Last known · '}{OPER[row.oper]||'Unknown'} · {ADMIN[row.admin]||'Setting unknown'}</span><span>Receive: {current?rate(row.inBps):'Unavailable'} · Send: {current?rate(row.outBps):'Unavailable'}</span></li>)}</ol>
    <p>Traffic rates appear after two suitable checks; gaps or device restarts can leave them unavailable.</p>
    {after>0&&<button className="health-button" onClick={()=>setAfter(0)}>First page</button>}
    {page.nextAfter&&<button className="health-button" onClick={()=>setAfter(page.nextAfter)}>Next page</button>}</>}
    <button className="health-button" onClick={()=>setReload(v=>v+1)}>Refresh ports</button>
  </section>
}
