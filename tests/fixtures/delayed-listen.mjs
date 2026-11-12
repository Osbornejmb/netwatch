import { Server } from 'node:net'

// Force the scheduler window where shutdown arrives before native listen completes.
const listen=Server.prototype.listen
Server.prototype.listen=function(...args) {
  setTimeout(()=>listen.apply(this,args),150)
  return this
}
// A broken host must fail this test instead of holding CI open indefinitely.
setTimeout(()=>process.exit(77),5000).unref()
