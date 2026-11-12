import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { openStore } from './store.js'
import { createHost } from './server.js'
import { lock } from './files.js'
const path=resolve(process.env.NETWATCH_DB || 'data/netwatch.sqlite')
mkdirSync(dirname(path),{recursive:true})
const release=lock(path)
let store
try {store=openStore(path)} catch(e) {release();throw e}
const server=createHost(store)
server.listen(4317,'127.0.0.1',()=>console.log('NetWatch: http://127.0.0.1:4317 (loopback only; no probes)'))
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{store.close();release();process.exit(0)}))
server.on('error',e=>{console.error(e.message);store.close();release();process.exitCode=1})
