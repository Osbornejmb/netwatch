import { Resolver } from 'node:dns/promises'

export async function reverseHints(rows,{signal,lookup,limit=128,timeoutMs=600,concurrency=4,onProgress=()=>{}}={}) {
  const results=new Map(),targets=rows.slice(0,limit).filter(row=>row.ip);let processed=0
  let next=0
  async function worker(){while(!signal?.aborted){const row=targets[next++];if(!row)return
    let resolve=lookup, resolver
    if(!resolve){resolver=new Resolver();resolve=ip=>resolver.reverse(ip)}
    let timer,abort
    try {
      const names=await Promise.race([resolve(row.ip),new Promise((_,reject)=>{timer=setTimeout(()=>{resolver?.cancel();reject(Error('timeout'))},timeoutMs);abort=()=>{resolver?.cancel();reject(Error('cancelled'))};signal?.addEventListener('abort',abort,{once:true})})])
      const name=Array.isArray(names)?names.map(value=>typeof value==='string'?value.replace(/\.$/,''):value).find(value=>typeof value==='string'&&value.length<=253&&/^[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)*$/i.test(value)):null
      if(name)results.set(row.ip,name.toLowerCase())
    }catch{}finally{onProgress(++processed);clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort)}
  }}
  await Promise.all(Array.from({length:Math.min(concurrency,targets.length)},worker))
  return results
}
