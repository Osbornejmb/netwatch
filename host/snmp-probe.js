import snmp from 'net-snmp'
import { normalizeAddress } from '../src/inventory.js'
import { INTERFACE_POLICY as POLICY, validateInterfaces } from './interfaces.js'

export const INTERFACE_OIDS = Object.freeze({description:'1.3.6.1.2.1.2.2.1.2',speed:'1.3.6.1.2.1.2.2.1.5',admin:'1.3.6.1.2.1.2.2.1.7',oper:'1.3.6.1.2.1.2.2.1.8',in32:'1.3.6.1.2.1.2.2.1.10',out32:'1.3.6.1.2.1.2.2.1.16',name:'1.3.6.1.2.1.31.1.1.1.1',in64:'1.3.6.1.2.1.31.1.1.1.6',out64:'1.3.6.1.2.1.31.1.1.1.10',highSpeed:'1.3.6.1.2.1.31.1.1.1.15',discontinuity:'1.3.6.1.2.1.31.1.1.1.19'})
const UPTIME='1.3.6.1.2.1.1.3.0'
export function validateSnmpUser(user) {
  if(!user || typeof user.name!=='string'||!/^[\x21-\x7e]{1,32}$/.test(user.name) || !['sha','sha256'].includes(user.authProtocol) || user.privProtocol!=='aes' || ![user.authKey,user.privKey].every(v=>typeof v==='string'&&v.length>=8&&v.length<=128&&!/[\u0000-\u001f\u007f]/.test(v)))throw new Error('Invalid SNMP credentials')
  return {name:user.name,authProtocol:user.authProtocol,authKey:user.authKey,privProtocol:'aes',privKey:user.privKey}
}
const cleanText=value=>Buffer.isBuffer(value)&&value.length<=512?value.toString('utf8').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,128):null
const number=(v,max=4294967295)=>Number.isSafeInteger(v)&&v>=0&&v<=max?v:null
function decode(field,v) {
  if(['name','description'].includes(field)) {if(v.type!==snmp.ObjectType.OctetString)throw new Error();return cleanText(v.value)}
  if(field.endsWith('64')) {if(v.type!==snmp.ObjectType.Counter64||!Buffer.isBuffer(v.value)||v.value.length<1||v.value.length>8)throw new Error();return BigInt('0x'+v.value.toString('hex')).toString()}
  const type=['admin','oper'].includes(field)?snmp.ObjectType.Integer:field==='discontinuity'?snmp.ObjectType.TimeTicks:field.endsWith('32')?snmp.ObjectType.Counter:snmp.ObjectType.Gauge
  if(v.type!==type||number(v.value)===null)throw new Error()
  return field.endsWith('32')?String(v.value):v.value
}
export function createSnmpProbe({createSession=snmp.createV3Session,now=()=>Date.now(),policy=POLICY}={}) {
  return async(address,credentials,{signal}={})=>{
    let session,timer,onAbort,rejectActive
    try {
      const target=normalizeAddress(address);if(!target)throw new Error()
      const user=validateSnmpUser(credentials)
      if(signal?.aborted)return {error:'cancelled'}
      session=createSession(target,{...user,level:snmp.SecurityLevel.authPriv,authProtocol:snmp.AuthProtocols[user.authProtocol],privProtocol:snmp.PrivProtocols.aes},{port:161,retries:0,timeout:policy.timeoutMs,transport:target.includes(':')?'udp6':'udp4',backwardsGetNexts:false,reportOidMismatchErrors:true,strictIntRangeChecks:true})
      const failure=new Promise((_,reject)=>{rejectActive=reject})
      // Raw library errors can contain authentication material; expose only fixed diagnostic codes.
      onAbort=()=>rejectActive(new Error('cancelled'))
      signal?.addEventListener('abort',onAbort,{once:true})
      session.on('error',()=>rejectActive(new Error('snmp_failed')))
      timer=setTimeout(()=>rejectActive(new Error('snmp_timeout')),policy.deadlineMs)
      let requests=0
      const request=(method,...args)=>{
        if(++requests>policy.maxRequests)throw new Error('snmp_limit')
        return Promise.race([failure,new Promise((resolve,reject)=>session[method](...args,(error,result)=>error?reject(new Error('snmp_failed')):resolve(result)))])
      }
      const uptime=async()=>{const rows=await request('get',[UPTIME]);if(rows?.length!==1||rows[0].oid!==UPTIME||rows[0].type!==snmp.ObjectType.TimeTicks||number(rows[0].value)===null)throw new Error('snmp_invalid');return rows[0].value}
      const startUptime=await uptime(), rows=new Map()
      let columns=Object.entries(INTERFACE_OIDS).map(([field,root])=>({field,root,cursor:root}))
      while(columns.length) {
        const result=await request('getBulk',columns.map(c=>c.cursor),0,policy.repetitions)
        if(!Array.isArray(result)||!result.length||result.length>columns.length)throw new Error('snmp_invalid')
        const next=[]
        for(let i=0;i<columns.length;i++) {
          const column=columns[i], values=result[i]
          // Agents may truncate a GETBULK response before the final requested columns.
          if(i>=result.length){next.push(column);continue}
          if(!Array.isArray(values)||!values.length||values.length>policy.repetitions)throw new Error('snmp_invalid')
          let ended=false,last=Number(column.cursor.slice(column.root.length+1))||0
          for(const v of values) {
            if(ended)continue
            if(snmp.isVarbindError(v)||!v.oid?.startsWith(column.root+'.')) {ended=true;continue}
            const suffix=v.oid.slice(column.root.length+1)
            if(!/^[1-9]\d{0,9}$/.test(suffix))throw new Error('snmp_invalid')
            const index=Number(suffix);if(index<=last||index>2147483647)throw new Error('snmp_invalid')
            last=index;column.cursor=v.oid
            if(!rows.has(index)) {if(rows.size>=policy.maxInterfaces)throw new Error('snmp_limit');rows.set(index,{index})}
            rows.get(index)[column.field]=decode(column.field,v)
          }
          if(!ended)next.push(column)
        }
        columns=next
      }
      const endUptime=await uptime();if(endUptime<startUptime)throw new Error('snmp_changed')
      return validateInterfaces({checkedAt:new Date(now()).toISOString(),uptime:endUptime,interfaces:[...rows.values()].map(r=>{
        const hc=r.in64!==undefined&&r.out64!==undefined,legacy=r.in32!==undefined&&r.out32!==undefined
        return {index:r.index,name:r.name??r.description??'',description:r.description??'',admin:r.admin??null,oper:r.oper??null,speedBps:r.highSpeed>0?r.highSpeed*1000000:r.speed>0&&r.speed<4294967295?r.speed:null,discontinuity:r.discontinuity??null,counterBits:hc?64:legacy?32:null,inOctets:hc?r.in64:legacy?r.in32:null,outOctets:hc?r.out64:legacy?r.out32:null}
      })})
    } catch(error) {return {error:['cancelled','snmp_limit','snmp_timeout','snmp_changed'].includes(error.message)?error.message:'snmp_failed'}}
    finally {clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);try{session?.close()}catch{} }
  }
}
