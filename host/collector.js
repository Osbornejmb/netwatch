import { ICMP_POLICY, cycleBudget, freshnessPolicy, transition } from './icmp-policy.js'
import { createWindowsProbe, validateProbeResult } from './windows-probe.js'

export function createCollector(store, { enabled = false, platform = process.platform, runner = createWindowsProbe(), now = () => Date.now(), policy = ICMP_POLICY } = {}) {
  let timer, active, controller, stopped = false
  let states = new Map()
  let revision = null
  let cursor = 0
  const info = { state: !enabled ? 'disabled' : platform !== 'win32' ? 'unsupported' : 'starting', ready: false, lastSeenAt: null, lastSuccessfulCycleAt: null, lastCycleCompletedAt: null, enabledDevices: 0, completedChecks: 0, errors: 0, diagnostics: [], policy }
  const stamp = () => new Date(now()).toISOString()
  const authorized = (inventory, node) => inventory.monitoring[node.id] === true && !!node.data.ip
  function snapshot() {
    return { ...info, diagnostics: [...info.diagnostics], freshness: freshnessPolicy(info.enabledDevices, policy), expectedCycleBudgetMs: cycleBudget(info.enabledDevices, policy) }
  }
  function boundedProbe(address, signal) {
    const abort = new AbortController()
    return new Promise(resolve => {
      let settled = false
      const finish = value => {
        if (settled) return
        settled = true; clearTimeout(deadline); signal.removeEventListener('abort', cancel); resolve(value)
      }
      const cancel = () => { abort.abort(); finish({outcome:'error',code:'cancelled'}) }
      const deadline = setTimeout(() => { abort.abort(); finish({outcome:'error',code:'runner_timeout'}) }, policy.processTimeoutMs)
      signal.addEventListener('abort', cancel, {once:true})
      if (signal.aborted) return cancel()
      Promise.resolve().then(() => runner(address, { signal: abort.signal })).then(value => {
        if (value?.outcome === 'error') finish({outcome:'error',code:['helper_unavailable','cancelled','runner_timeout','runner_process_error','invalid_target','unsupported_platform','invalid_runner_output','icmp_local_error','icmp_exception'].includes(value.code)?value.code:'runner_process_error'})
        else finish(validateProbeResult(value))
      }, () => finish({outcome:'error',code:'runner_process_error'}))
    })
  }
  async function cycle() {
    const started = now()
    const inventory = store.read()
    // Reset streaks on any inventory revision: re-authorization/address changes
    // cannot inherit evidence from an earlier authorization, even off -> on.
    if (revision !== inventory.revision) { states = new Map(); revision = inventory.revision }
    const nodes = inventory.topology.nodes.filter(node => authorized(inventory,node))
    info.enabledDevices = nodes.length; info.completedChecks = 0; info.errors = 0; info.diagnostics = []
    if (!nodes.length) { info.state = 'idle'; info.ready = true; info.lastSeenAt = stamp(); return }
    const ordered = [...nodes.slice(cursor % nodes.length),...nodes.slice(0,cursor % nodes.length)]
    cursor = (cursor + policy.concurrency) % nodes.length
    info.state = 'running'; info.ready = true
    let next = 0
    const signal = controller.signal
    async function worker() {
      while (!signal.aborted && next < ordered.length) {
        const node = ordered[next++]
        if (store.revision() !== revision) { controller.abort(); break }
        const result = await boundedProbe(node.data.ip,signal)
        if (signal.aborted || store.revision() !== revision) { controller.abort(); break }
        if (result.outcome === 'error') {
          info.errors++
          // Errors break a consecutive run, retain last confirmed stable state.
          const previous = states.get(node.id)
          if (previous) states.set(node.id,{...previous,failures:0,successes:0})
          if (info.diagnostics.length < 50) info.diagnostics.push({deviceId:node.id,code:result.code,at:stamp()})
          continue
        }
        const state = transition(states.get(node.id),result,policy)
        store.append([{ deviceId:node.id, status:state.status, outcome:result.outcome, reason:result.reason, latencyMs:result.latencyMs, checkedAt:stamp() }], { revision })
        states.set(node.id,state); info.completedChecks++
      }
    }
    const workers=await Promise.allSettled(Array.from({length:Math.min(policy.concurrency,nodes.length)},()=>worker().catch(error=>{controller.abort();throw error})))
    const failed=workers.find(result=>result.status==='rejected')
    if(failed)throw failed.reason
    if (signal.aborted) {
      if (!stopped) {states = new Map();info.state = 'starting';info.ready = false;info.diagnostics = [{code:'inventory_changed',at:stamp()}]}
      return
    }
    info.lastSeenAt = stamp(); info.lastCycleCompletedAt = stamp(); info.cycleDurationMs = Math.max(0,now()-started)
    info.state = info.errors ? 'degraded' : 'running'; info.ready = !info.errors
    if (!info.errors && info.completedChecks) info.lastSuccessfulCycleAt = stamp()
  }
  function runOnce() {
    if (stopped || !enabled || platform !== 'win32') return Promise.resolve()
    if (active) return active
    controller = new AbortController()
    active = cycle().catch(() => {
      controller.abort();info.state = 'degraded';info.ready = false;info.errors++;info.diagnostics = [{code:'collector_cycle_error',at:stamp()}]
    }).finally(() => {active = null})
    return active
  }
  async function poll() {
    const started = now()
    await runOnce()
    if (!stopped) timer = setTimeout(poll,Math.max(1000,policy.intervalMs - Math.max(0,now()-started)))
  }
  return {
    snapshot, runOnce,
    start() { if (!enabled || platform !== 'win32' || stopped || timer || active) return; void poll() },
    async stop() {stopped = true;clearTimeout(timer);info.state = 'stopping';controller?.abort();await active;await runner.stop?.();info.state = 'stopped';info.ready = false},
  }
}
