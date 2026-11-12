import { execFile } from 'node:child_process'
import { normalizeAddress } from '../src/inventory.js'
import { ICMP_POLICY } from './icmp-policy.js'
import { prepareWindowsHelper } from './windows-helper.js'

export function validateProbeResult(value) {
  if (value?.outcome === 'error' && ['icmp_local_error', 'icmp_exception'].includes(value.code)) return { outcome: 'error', code: value.code }
  const unreachable = ['TimedOut', 'DestinationNetworkUnreachable', 'DestinationHostUnreachable', 'DestinationProtocolUnreachable', 'DestinationPortUnreachable', 'DestinationUnreachable', 'TtlExpired', 'TimeExceeded', 'TtlReassemblyTimeExceeded', 'PacketTooBig']
  if (value?.outcome === 'reachable' && value.reason === 'success' && Number.isFinite(value.latencyMs) && value.latencyMs >= 0 && value.latencyMs <= ICMP_POLICY.timeoutMs) return { outcome: 'reachable', reason: 'success', latencyMs: value.latencyMs }
  if (value?.outcome === 'unreachable' && unreachable.includes(value.reason) && value.latencyMs === null) return { outcome: 'unreachable', reason: value.reason, latencyMs: null }
  return { outcome: 'error', code: 'invalid_runner_output' }
}
export function createWindowsProbe({ platform = process.platform, execute = execFile, prepare = prepareWindowsHelper } = {}) {
  let preparation, retryAfter = 0
  return async (target, { signal } = {}) => {
    if (platform !== 'win32') return { outcome: 'error', code: 'unsupported_platform' }
    let address
    try { address = normalizeAddress(target); if (!address) throw new Error() } catch { return { outcome: 'error', code: 'invalid_target' } }
    if (signal?.aborted) return { outcome: 'error', code: 'cancelled' }
    let executable
    if (!preparation || Date.now() >= retryAfter) {
      retryAfter=Infinity
      preparation=Promise.resolve().then(()=>prepare()).catch(error=>{retryAfter=Date.now()+ICMP_POLICY.intervalMs;throw error})
    }
    try {executable = await preparation} catch {return {outcome:'error',code:'helper_unavailable'}}
    if (signal?.aborted) return { outcome:'error',code:'cancelled' }
    return new Promise(resolve => {
      execute(executable, [address, String(ICMP_POLICY.timeoutMs)], {
        shell: false, windowsHide: true, timeout: ICMP_POLICY.processTimeoutMs,
        maxBuffer: 4096, signal,
      }, (error, stdout) => {
        if (error) return resolve({ outcome: 'error', code: signal?.aborted ? 'cancelled' : error.killed ? 'runner_timeout' : 'runner_process_error' })
        try { resolve(validateProbeResult(JSON.parse(stdout.trim()))) } catch { resolve({ outcome: 'error', code: 'invalid_runner_output' }) }
      })
    })
  }
}
