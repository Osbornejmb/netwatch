import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { openStore } from './store.js'
import { createHost } from './server.js'
import { lock } from './files.js'
import { createCollector } from './collector.js'
import { createWindowsProbe } from './windows-probe.js'
import { prepareWindowsHelper } from './windows-helper.js'
const path=resolve(process.env.NETWATCH_DB || 'data/netwatch.sqlite')
mkdirSync(dirname(path),{recursive:true})
const release=lock(path)
let store
try {store=openStore(path)} catch(e) {release();throw e}
const runner=createWindowsProbe({prepare:()=>prepareWindowsHelper({directory:resolve(dirname(path),'collector')})})
const collector=createCollector(store,{enabled:process.env.NETWATCH_ICMP==='1',runner})
const server=createHost(store,{collector})
server.listen(4317,'127.0.0.1',()=>{collector.start();console.log('NetWatch: http://127.0.0.1:4317 (loopback only). Collector: '+collector.snapshot().state);if(process.connected)process.send({type:'ready',collector:collector.snapshot().state})})
let stopping=false
async function shutdown(code=0) {
  if(stopping)return
  stopping=true
  const closed=new Promise(resolve=>server.close(resolve))
  server.closeAllConnections()
  await collector.stop();await closed;store.close();release();process.exitCode=code
  if(process.connected)process.disconnect()
}
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>void shutdown())
if(process.send) {
  process.on('message',message=>{if(message?.type==='shutdown')void shutdown()})
  process.on('disconnect',()=>void shutdown())
}
server.on('error',e=>{console.error(e.message);void shutdown(1)})
