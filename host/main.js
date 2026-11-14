import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { openStore } from './store.js'
import { createHost } from './server.js'
import { lock } from './files.js'
import { createCollector } from './collector.js'
import { createWindowsProbe } from './windows-probe.js'
import { prepareWindowsHelper } from './windows-helper.js'
import {createCredentialVault,credentialDirectory} from './snmp-secrets.js'
import {createInterfaceCollector} from './snmp-collector.js'
import {createDiscovery} from './discovery.js'
import {createProbeGate} from './probe-gate.js'
const path=resolve(process.env.NETWATCH_DB || 'data/netwatch.sqlite')
mkdirSync(dirname(path),{recursive:true})
const release=lock(path)
let store
try {store=openStore(path)} catch(e) {release();throw e}
const runner=createWindowsProbe({prepare:()=>prepareWindowsHelper({directory:resolve(dirname(path),'collector')})})
const probeGate=createProbeGate(8)
const collector=createCollector(store,{enabled:process.env.NETWATCH_ICMP==='1',runner,probeGate})
const interfaces=createInterfaceCollector(store,{enabled:process.env.NETWATCH_SNMP==='1',vault:createCredentialVault(credentialDirectory(path))})
const discoveryPrefix=process.env.NETWATCH_DISCOVERY_MAX_PREFIX===undefined?24:Number(process.env.NETWATCH_DISCOVERY_MAX_PREFIX)
if(!Number.isInteger(discoveryPrefix)||discoveryPrefix<16||discoveryPrefix>30)throw new Error('NETWATCH_DISCOVERY_MAX_PREFIX must be a prefix length from 16 through 30.')
const discovery=createDiscovery(store,{enabled:process.env.NETWATCH_DISCOVERY==='1',active:process.env.NETWATCH_DISCOVERY_ICMP==='1',pingRunner:(ip,{signal})=>runner(ip,{signal}),probeGate,maxPrefix:discoveryPrefix})
const server=createHost(store,{collector,interfaces,discovery})
server.listen(4317,'127.0.0.1',()=>{if(stopping){server.close();return}collector.start();interfaces.start();discovery.start();console.log('NetWatch: http://127.0.0.1:4317 (loopback only). Collector: '+collector.snapshot().state);if(process.connected)process.send({type:'ready',collector:collector.snapshot().state})})
let stopping=false
async function shutdown(code=0) {
  if(stopping)return
  stopping=true
  const closed=new Promise(resolve=>server.close(resolve))
  server.closeAllConnections()
  await Promise.all([collector.stop(),interfaces.stop(),discovery.stop()]);await closed;store.close();release();process.exitCode=code
  if(process.connected)process.disconnect()
}
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>void shutdown())
if(process.send) {
  process.on('message',message=>{if(message?.type==='shutdown')void shutdown()})
  process.on('disconnect',()=>void shutdown())
}
server.on('error',e=>{console.error(e.message);void shutdown(1)})
