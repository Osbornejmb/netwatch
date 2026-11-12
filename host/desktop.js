import { fork } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

// Private parent/child IPC only: no HTTP process-control endpoint.
const report = (state, message) => process.stdout.write(JSON.stringify({state,message})+'\n')
let errorText='', ready=false, stopping=false, timedOut=false, healthTimer
report('starting','Starting NetWatch…')
const child=fork(fileURLToPath(new URL('./main.js',import.meta.url)),[],{
  windowsHide:true,stdio:['ignore','ignore','pipe','ipc'],
})
child.stderr.on('data',data=>{errorText=(errorText+data).slice(-2000)})
const commands=createInterface({input:process.stdin})
function stop() {
  if(stopping)return
  stopping=true;clearTimeout(startup);clearInterval(healthTimer)
  report('stopping','Waiting for checks and database to close…')
  if(child.connected)child.send({type:'shutdown'})
}
const startup=setTimeout(()=>{timedOut=true;errorText='Startup timed out. Check the data folder and available port.';stop()},15000)
commands.on('line',line=>{if(line==='stop')stop()})
commands.on('close',stop)
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop)
child.on('message',message=>{
  if(message?.type==='ready') {
    ready=true;clearTimeout(startup)
    if(!stopping) {
      report('running',`Host running · ICMP ${process.env.NETWATCH_ICMP==='1'?'enabled':'disabled'}`)
      healthTimer=setInterval(async()=>{
        try {
          const response=await fetch('http://127.0.0.1:4317/api/v1/health',{signal:AbortSignal.timeout(2000)})
          const health=await response.json()
          if(!stopping&&child.exitCode===null)report('running',response.ok&&health.ready?`Host running · collector ${health.collector.state}`:'Host running · health unavailable')
        } catch {if(!stopping&&child.exitCode===null)report('running','Host running · health unavailable')}
      },5000)
    }
  }
})
child.on('error',()=>{
  errorText='Unable to start the Node host.'
  if(!child.pid) {
    clearTimeout(startup);clearInterval(healthTimer);report('error',errorText)
    commands.removeAllListeners('close');commands.close();process.stdin.destroy();process.exitCode=1
  }
})
child.on('exit',code=>{
  clearTimeout(startup);clearInterval(healthTimer)
  const failed=timedOut||code!==0||(!ready&&!stopping)
  report(failed?'error':'stopped',failed?(errorText.trim()||'Host exited unexpectedly.'):'NetWatch stopped. Database closed.')
  commands.removeAllListeners('close');commands.close();process.stdin.destroy()
  process.exitCode=failed?1:0
})
