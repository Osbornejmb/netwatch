import {INTERFACE_POLICY} from './interfaces.js'
import {createSnmpProbe} from './snmp-probe.js'

export function createInterfaceCollector(store,{enabled=false,platform=process.platform,vault,runner=createSnmpProbe(),now=()=>Date.now(),policy=INTERFACE_POLICY}={}) {
  let timer,active,controller,stopped=false
  const devices=new Map(),info={state:!enabled?'disabled':platform!=='win32'?'unsupported':'starting',lastSeenAt:null,errors:0,enabledDevices:0,policy}
  const stamp=()=>new Date(now()).toISOString()
  const freshness=()=>Math.max(policy.staleAfterMs,2*Math.ceil(info.enabledDevices/policy.concurrency)*(policy.deadlineMs+(policy.credentialBudgetMs??5000))+10000)
  async function cycle() {
    const revision=store.revision(),targets=store.interfaceTargets()
    info.enabledDevices=targets.length;info.errors=0
    const ids=new Set(targets.map(t=>t.deviceId));for(const id of devices.keys())if(!ids.has(id))devices.delete(id)
    if(!targets.length){info.state='idle';info.lastSeenAt=stamp();return}
    info.state='running';let next=0
    const signal=controller.signal
    const revisionWatch=setInterval(()=>{if(store.revision()!==revision)controller.abort()},100)
    async function worker() {
      while(!signal.aborted&&next<targets.length) {
        const target=targets[next++],targetController=new AbortController();let timeout,abort
        devices.set(target.deviceId,{state:'checking',lastAttemptAt:stamp()})
        try {
          const interrupted=new Promise(resolve=>{
            abort=()=>{targetController.abort();resolve({error:'cancelled'})};signal.addEventListener('abort',abort,{once:true})
            timeout=setTimeout(()=>{targetController.abort();resolve({error:'snmp_timeout'})},policy.deadlineMs+(policy.credentialBudgetMs??5000))
          })
          const operation=(async()=>{
            let user
            try {user=await vault.load(target,{signal:targetController.signal})}catch{return {error:'credentials_unavailable'}}
            if(targetController.signal.aborted||store.revision()!==revision)return {error:'cancelled'}
            return runner(target.address,user,{signal:targetController.signal})
          })()
          const value=await Promise.race([operation,interrupted])
          if(signal.aborted||store.revision()!==revision)break
          if(value.error)throw new Error(['credentials_unavailable','snmp_timeout','snmp_limit','snmp_changed'].includes(value.error)?value.error:'snmp_failed')
          store.appendInterfaces(target.deviceId,value,{revision,authorization:target.authorization})
          devices.set(target.deviceId,{state:'ok',lastAttemptAt:stamp()})
        }catch(error){info.errors++;devices.set(target.deviceId,{state:['credentials_unavailable','snmp_timeout','snmp_limit','snmp_changed','snmp_failed'].includes(error.message)?error.message:'collection_unavailable',lastAttemptAt:stamp()})}
        finally{clearTimeout(timeout);if(abort)signal.removeEventListener('abort',abort)}
      }
    }
    try {
      const results=await Promise.allSettled(Array.from({length:Math.min(policy.concurrency,targets.length)},()=>worker().catch(error=>{controller.abort();throw error})))
      const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason
    }
    finally{clearInterval(revisionWatch)}
    info.state=signal.aborted?'starting':info.errors?'degraded':'running';info.lastSeenAt=stamp()
  }
  function runOnce() {
    if(stopped||!enabled||platform!=='win32')return Promise.resolve()
    if(active)return active
    controller=new AbortController()
    active=cycle().catch(()=>{controller.abort();info.state='degraded';info.errors++}).finally(()=>{active=null})
    return active
  }
  async function poll(){const start=now();await runOnce();if(!stopped)timer=setTimeout(poll,Math.max(1000,policy.intervalMs-(now()-start)))}
  return {
    runOnce,
    snapshot:()=>({...info,freshness:{staleAfterMs:freshness()}}),
    device:id=>({...devices.get(id),collectorState:info.state,staleAfterMs:freshness()}),
    start(){if(!stopped&&enabled&&platform==='win32'&&!timer&&!active)void poll()},
    async stop(){stopped=true;clearTimeout(timer);controller?.abort();await active;await vault?.stop?.();info.state='stopped'},
  }
}
