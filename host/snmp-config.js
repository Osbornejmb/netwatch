import {mkdirSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
import {createInterface,emitKeypressEvents} from 'node:readline'
import {openStore} from './store.js'
import {lock} from './files.js'
import {createCredentialVault,credentialDirectory} from './snmp-secrets.js'

async function visible(question) {
  const rl=createInterface({input:process.stdin,output:process.stdout})
  try{return await new Promise(resolve=>rl.question(question,resolve))}finally{rl.close()}
}
async function secret(question) {
  if(!process.stdin.isTTY)throw new Error('Use an interactive terminal for password entry.')
  process.stdout.write(question);emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume()
  return new Promise((resolve,reject)=>{
    let value=''
    const finish=(error)=>{process.stdin.removeListener('keypress',key);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');if(error)reject(error);else resolve(value)}
    const key=(str,k)=>{if(k?.ctrl&&k.name==='c')return finish(new Error('Cancelled'));if(k?.name==='return')return finish();if(k?.name==='backspace')value=value.slice(0,-1);else if(str&&/^[\x20-\x7e]+$/.test(str)&&value.length+str.length<=128)value+=str}
    process.stdin.on('keypress',key)
  })
}
async function main() {
  if(process.platform!=='win32')throw new Error('SNMP credential setup requires Windows.')
  const [command,id]=process.argv.slice(2)
  if(!['set','remove','list'].includes(command)||(command!=='list'&&!id)||process.argv.length>(command==='list'?3:4))throw new Error('Usage: npm run snmp -- set <saved-device-id> | remove <id> | list. Stop the host first; set requires an interactive terminal.')
  const path=resolve(process.env.NETWATCH_DB||'data/netwatch.sqlite');mkdirSync(dirname(path),{recursive:true})
  const release=lock(path);let store
  try {
    store=openStore(path);const vault=createCredentialVault(credentialDirectory(path))
    if(command==='list'){const configured=new Set(store.interfaceTargets().map(t=>t.deviceId));for(const node of store.read().topology.nodes)console.log(JSON.stringify({id:node.id,label:node.data.label,configured:configured.has(node.id)}));return}
    const state=store.read(),node=state.topology.nodes.find(n=>n.id===id)
    if(command==='remove'){if(node?.data.ip)store.authorizeInterfaces(id,null,state.revision);vault.remove(id);console.log('Interface monitoring removed.');return}
    if(!node?.data.ip)throw new Error('Choose a saved device with a management address.')
    console.log('This authorizes read-only SNMPv3 checks of this saved device/address. No device configuration is changed. Passwords are hidden and protected for this Windows account.')
    console.log(JSON.stringify({deviceId:id,address:node.data.ip,type:node.type}))
    const authProtocol=(await visible('Authentication (sha256 or sha for older IOS): ')).trim(),name=await secret('SNMP username (hidden): ')
    const authKey=await secret('Authentication password: '),privKey=await secret('AES-128 privacy password: ')
    const authorization=randomUUID()
    await vault.save({version:1,deviceId:id,address:node.data.ip,type:node.type,authorization,user:{name,authProtocol,authKey,privProtocol:'aes',privKey}})
    store.authorizeInterfaces(id,authorization,state.revision)
    console.log('Credentials protected and device authorized. Start the host with NETWATCH_SNMP=1 to collect interfaces; ICMP authorization is separate.')
  }finally{store?.close();release()}
}
main().catch(()=>{console.error('SNMP setup did not complete. Check the command, stopped host, saved device and Windows credential access. Existing data was preserved; retry setup if needed.');process.exitCode=1})
