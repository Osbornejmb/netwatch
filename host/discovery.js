import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { normalizeAddress } from '../src/inventory.js'

const execute = promisify(execFile)
export const DISCOVERY_POLICY = Object.freeze({ intervalMs:300000, deadlineMs:140000, maxHosts:1022, concurrency:8 })
const ipv4 = value => { const a=normalizeAddress(value);if(!/^\d+\.\d+\.\d+\.\d+$/.test(a))throw Error();return a.split('.').reduce((n,x)=>n*256+Number(x),0) }
const dotted = n => [24,16,8,0].map(s=>(n>>>s)&255).join('.')
export function localSubnets(interfaces=os.networkInterfaces(),maxPrefix=24) {
  const result=[]
  for(const rows of Object.values(interfaces)) for(const row of rows||[]) {
      if(row.family!=='IPv4'||row.internal||!row.address||!row.netmask||!(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(row.address)))continue
    try { const ip=ipv4(row.address),mask=ipv4(row.netmask),prefix=mask.toString(2).replace(/0/g,'').length
      if(prefix>32||prefix<32&&mask!==((0xffffffff << (32-prefix))>>>0)||prefix===32)continue
      const network=(ip&mask)>>>0
      if(['127.','169.254.'].some(p=>row.address.startsWith(p)))continue
      if(prefix<22||prefix<maxPrefix)throw Error('subnet_too_large')
      const first=prefix===31?network:network+1,last=prefix===31?network+1:((network|(~mask>>>0))>>>0)-1
      if(last<first)continue
      result.push({cidr:`${dotted(network)}/${prefix}`,addresses:Array.from({length:last-first+1},(_,i)=>dotted(first+i))})
    } catch(e) {if(e.message==='subnet_too_large')throw e}
  }
  return result
}
export function parseNeighbors(output, now=Date.now()) {
  if(typeof output!=='string'||Buffer.byteLength(output)>65536)throw Error('invalid_output')
  const found=[]
  for(const line of output.split(/\r?\n/)) {
    const m=line.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([\da-f]{2}(?:-[\da-f]{2}){5})\s+(?:dynamic|static)\s*$/i)
    if(!m)continue
    try {found.push({ip:normalizeAddress(m[1]),mac:m[2].toLowerCase().replaceAll('-',':'),source:'neighbor',seenAt:now})}catch{}
  }
  return found
}
export function createDiscovery(store,{enabled=false,active=false,platform=process.platform,interfaces=os.networkInterfaces,runner=async({signal}={})=>{const r=await execute('arp.exe',['-a'],{shell:false,windowsHide:true,timeout:5000,maxBuffer:65536,signal});return r.stdout},pingRunner=async()=>({outcome:'error',code:'unsupported_platform'}),probeGate=async task=>task(),now=()=>Date.now(),policy=DISCOVERY_POLICY,maxPrefix=24}={}) {
  let activeRun=null,timer,stopped=false,lastRunAt=null,durationMs=0,diagnostics=[],controller
  const snapshot=()=>({state:!enabled?'disabled':platform!=='win32'?'unsupported':activeRun?'running':'idle',lastRunAt,durationMs,counts:store.discoveryCounts(),diagnostics:[...diagnostics]})
  async function runOnce(){if(!enabled||platform!=='win32'||stopped)return;if(activeRun)return activeRun
    controller=new AbortController();activeRun=(async()=>{const start=now();diagnostics=[];let deadline;try{const subnets=localSubnets(interfaces(),maxPrefix);if(!subnets.length)throw Error('no_interface');const addresses=[...new Set(subnets.flatMap(s=>s.addresses))];if(addresses.length>policy.maxHosts)throw Error('sweep_cap');const allowed=new Set(addresses);const output=await Promise.race([runner({signal:controller.signal}),new Promise((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(Error('timeout'))},policy.deadlineMs)})]);const byIp=new Map(parseNeighbors(output,now()).filter(r=>allowed.has(r.ip)).map(r=>[r.ip,r]));if(active){let next=0;const workers=Array.from({length:Math.min(policy.concurrency,addresses.length)},async()=>{while(!controller.signal.aborted){const ip=addresses[next++];if(!ip)return;const result=await probeGate(()=>pingRunner(ip,{signal:controller.signal}),controller.signal);if(result?.outcome==='reachable'&&!byIp.has(ip))byIp.set(ip,{ip,mac:null,source:'icmp',seenAt:now()})}});await Promise.all(workers)}store.recordDiscovery([...byIp.values()]);lastRunAt=new Date(now()).toISOString()}catch(e){diagnostics=[e.message==='subnet_too_large'?'subnet_too_large':e.message==='sweep_cap'?'sweep_cap':e.message==='timeout'?'timeout':controller.signal.aborted?'cancelled':'discovery_error']}finally{clearTimeout(deadline);durationMs=Math.max(0,now()-start);activeRun=null;controller=null}})();return activeRun
  }
  return {snapshot,runOnce,start(){if(enabled&&platform==='win32'&&!timer&&!stopped){void runOnce();timer=setInterval(()=>void runOnce(),policy.intervalMs)}},async stop(){stopped=true;clearInterval(timer);controller?.abort();await activeRun}}
}
