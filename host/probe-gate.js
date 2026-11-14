// One host-wide permit keeps ICMP monitoring and discovery inside the same worker cap.
export function createProbeGate(limit=8) {
  let active=0,queue=[]
  return async function run(task,signal) {
    if(signal?.aborted)throw Error('cancelled')
    if(active>=limit)await new Promise((resolve,reject)=>{const item={resolve,reject};queue.push(item);const cancel=()=>{queue=queue.filter(x=>x!==item);reject(Error('cancelled'))};signal?.addEventListener('abort',cancel,{once:true});item.resolve=()=>{signal?.removeEventListener('abort',cancel);resolve()}})
    if(signal?.aborted)throw Error('cancelled')
    active++
    try{return await task()}finally{active--;queue.shift()?.resolve()}
  }
}
