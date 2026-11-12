export const ICMP_POLICY = Object.freeze({
  intervalMs: 30000,
  timeoutMs: 1500,
  processTimeoutMs: 4000,
  concurrency: 8,
  failuresForDown: 3,
  successesForRecovery: 1,
  minimumStaleAfterMs: 90000,
})

export function cycleBudget(deviceCount, policy = ICMP_POLICY) {
  // Worst case includes helper startup; the next cycle never overlaps this one.
  return Math.max(policy.intervalMs, Math.ceil(deviceCount / policy.concurrency) * policy.processTimeoutMs)
}
export function freshnessPolicy(deviceCount, policy = ICMP_POLICY) {
  return { staleAfterMs: Math.max(policy.minimumStaleAfterMs, 2 * cycleBudget(deviceCount, policy) + 10000) }
}
export function transition(previous, result, policy = ICMP_POLICY) {
  const state = previous ?? { status: 'unknown', failures: 0, successes: 0 }
  if (result.outcome === 'reachable') {
    const successes = state.successes + 1
    return { status: successes >= policy.successesForRecovery ? 'up' : state.status, successes, failures: 0 }
  }
  const failures = state.failures + 1
  return { status: failures >= policy.failuresForDown ? 'down' : state.status, failures, successes: 0 }
}
