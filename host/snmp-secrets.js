import {execFile} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync,renameSync,rmSync,statSync} from 'node:fs'
import {join,resolve,dirname} from 'node:path'
import {prepareWindowsHelper} from './windows-helper.js'
import {validateSnmpUser} from './snmp-probe.js'

export function credentialDirectory(database) {
  const path=resolve(database),key=createHash('sha256').update(process.platform==='win32'?path.toLowerCase():path).digest('hex').slice(0,24)
  return join(dirname(path),'snmp-credentials',key)
}

export function createCredentialVault(directory,{platform=process.platform,execute=execFile,prepare=()=>prepareWindowsHelper({directory:join(directory,'helper'),kind:'secrets'})}={}) {
  let preparation
  const pending=new Set()
  const tracked=promise=>{pending.add(promise);void promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise}
  const file=id=>join(directory,createHash('sha256').update(id).digest('hex')+'.dpapi')
  async function crypt(mode,value,signal) {
    if(platform!=='win32')throw new Error('Windows credential storage required')
    if(value.length>16000)throw new Error('Credential limit exceeded')
    const executable=await (preparation??=prepare().catch(()=>{preparation=null;throw new Error('Credential helper unavailable')}))
    return new Promise((resolve,reject)=>{
      const child=execute(executable,[mode],{shell:false,windowsHide:true,timeout:4000,maxBuffer:32768,signal},(error,out)=>{
        if(error||!/^[A-Za-z0-9+/=]+\s*$/.test(out))return reject(new Error('Credential operation failed'))
        resolve(Buffer.from(out.trim(),'base64'))
      })
      child.stdin.on('error',()=>{});child.stdin.end(value.toString('base64')+'\n')
    })
  }
  const valid=value=>{
    if(!value||value.version!==1||typeof value.authorization!=='string'||!/^[a-f0-9-]{36}$/.test(value.authorization)||typeof value.deviceId!=='string'||value.deviceId.length>100||!['router','switch'].includes(value.type)||typeof value.address!=='string')throw new Error('Invalid credential profile')
    return {...value,user:validateSnmpUser(value.user)}
  }
  return {
    async save(value) {
      const clean=valid(value),encoded=Buffer.from(JSON.stringify(clean))
      let protectedData
      try {protectedData=await crypt('protect',encoded)} finally {encoded.fill(0)}
      mkdirSync(directory,{recursive:true});const temporary=file(clean.deviceId)+'.writing'
      let owns=false
      try {writeFileSync(temporary,protectedData,{flag:'wx',mode:0o600});owns=true;renameSync(temporary,file(clean.deviceId))}finally{if(owns)rmSync(temporary,{force:true})}
    },
    load(target,{signal}={}) {return tracked((async()=>{
      let bytes
      try {if(statSync(file(target.deviceId)).size>16000)throw new Error();bytes=await crypt('unprotect',readFileSync(file(target.deviceId)),signal);const value=valid(JSON.parse(bytes.toString('utf8')));if(value.deviceId!==target.deviceId||value.authorization!==target.authorization||value.address!==target.address||value.type!==target.type)throw new Error();return value.user}
      catch {throw new Error('Credentials unavailable')}
      finally {bytes?.fill(0)}
    })())},
    async stop(){await Promise.allSettled([...pending])},
    remove(id){rmSync(file(id),{force:true})},
  }
}
