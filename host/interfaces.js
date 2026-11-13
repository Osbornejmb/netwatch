export const INTERFACE_POLICY = Object.freeze({intervalMs:60000,timeoutMs:1500,deadlineMs:20000,concurrency:2,maxInterfaces:512,maxRequests:64,repetitions:10,staleAfterMs:180000})
const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max
const uint=(n,bits)=>typeof n==='string'&&/^(0|[1-9]\d{0,19})$/.test(n)&&BigInt(n)<(1n<<BigInt(bits))
const text=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s)
export function validateInterfaces(value) {
  if(!value || typeof value.checkedAt!=='string' || !Number.isFinite(Date.parse(value.checkedAt)) || new Date(value.checkedAt).toISOString()!==value.checkedAt || !integer(value.uptime,4294967295) || !Array.isArray(value.interfaces) || value.interfaces.length>INTERFACE_POLICY.maxInterfaces) throw new Error('Invalid interface sample')
  const ids=new Set()
  const interfaces=value.interfaces.map(row=>{
    if(!row || !integer(row.index,2147483647) || !row.index || ids.has(row.index) || !text(row.name,128) || !text(row.description,128) || ![null,1,2,3].includes(row.admin) || ![null,1,2,3,4,5,6,7].includes(row.oper) || !(row.speedBps===null || (integer(row.speedBps,1e15)&&row.speedBps>0)) || !(row.discontinuity===null || integer(row.discontinuity,4294967295)) || ![null,32,64].includes(row.counterBits)) throw new Error('Invalid interface row')
    if(row.counterBits===null ? row.inOctets!==null||row.outOctets!==null : !uint(row.inOctets,row.counterBits)||!uint(row.outOctets,row.counterBits))throw new Error('Invalid interface counters')
    ids.add(row.index)
    return {index:row.index,name:row.name,description:row.description,admin:row.admin,oper:row.oper,speedBps:row.speedBps,discontinuity:row.discontinuity,counterBits:row.counterBits,inOctets:row.inOctets,outOctets:row.outOctets}
  }).sort((a,b)=>a.index-b.index)
  return {checkedAt:value.checkedAt,uptime:value.uptime,interfaces}
}
export function interfaceRates(previous,next) {
  const old=new Map(previous?.interfaces.map(r=>[r.index,r])||[]), elapsed=Date.parse(next.checkedAt)-Date.parse(previous?.checkedAt)
  return next.interfaces.map(row=>{
    const before=old.get(row.index)
    let inBps=null,outBps=null
    if(before && (row.name||row.description) && elapsed>=1000 && elapsed<=180000 && next.uptime>previous.uptime && row.discontinuity!==null && row.discontinuity===before.discontinuity && row.counterBits!==null && row.counterBits===before.counterBits && row.name===before.name && row.description===before.description && row.speedBps>0 && row.speedBps===before.speedBps && row.oper===1 && before.oper===1) {
      const maximum=row.speedBps*elapsed/8000*1.1
      // A falling counter could mean wrap or reset; ambiguous/multiple 32-bit wraps are never guessed.
      if(row.counterBits===64 || maximum<2**32) {
        const rate=key=>{const delta=BigInt(row[key])-BigInt(before[key]);const result=Number(delta)*8000/elapsed;return delta>=0n&&delta<=BigInt(Math.ceil(maximum))&&result<=1e15?result:null}
        inBps=rate('inOctets');outBps=rate('outOctets')
      }
    }
    return {...row,inBps,outBps}
  })
}
