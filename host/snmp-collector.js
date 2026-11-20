import { INTERFACE_POLICY } from './interfaces.js'
import { createSnmpProbe } from './snmp-probe.js'

export function createInterfaceCollector(
  store,
  {
    enabled = false,
    platform = process.platform,
    vault,
    runner = createSnmpProbe(),
    now = () => Date.now(),
    policy = INTERFACE_POLICY,
    onSwitchPorts,
  } = {},
) {
  let timer,
    active,
    controller,
    discoveryController,
    stopped = false
  const devices = new Map(),
    neighbors = new Map(),
    switchPorts = new Map(),
    info = {
      state: !enabled ? 'disabled' : platform !== 'win32' ? 'unsupported' : 'starting',
      lastSeenAt: null,
      errors: 0,
      enabledDevices: 0,
      policy,
    }
  const stamp = () => new Date(now()).toISOString()
  const freshness = () =>
    Math.max(
      policy.staleAfterMs,
      2 *
        Math.ceil(info.enabledDevices / policy.concurrency) *
        (policy.deadlineMs + (policy.credentialBudgetMs ?? 5000)) +
        10000,
    )
  async function cycle() {
    const revision = store.revision(),
      targets = store.interfaceTargets()
    info.enabledDevices = targets.length
    info.errors = 0
    const ids = new Set(targets.map((t) => t.deviceId))
    for (const id of devices.keys()) if (!ids.has(id)) devices.delete(id)
    for (const id of neighbors.keys()) if (!ids.has(id)) neighbors.delete(id)
    for (const id of switchPorts.keys()) if (!ids.has(id)) switchPorts.delete(id)
    if (!targets.length) {
      info.state = 'idle'
      info.lastSeenAt = stamp()
      return
    }
    info.state = 'running'
    let next = 0
    const signal = controller.signal
    const revisionWatch = setInterval(() => {
      if (store.revision() !== revision) controller.abort()
    }, 100)
    async function worker() {
      while (!signal.aborted && next < targets.length) {
        const target = targets[next++],
          targetController = new AbortController()
        let timeout, abort
        devices.set(target.deviceId, { state: 'checking', lastAttemptAt: stamp() })
        try {
          const interrupted = new Promise((resolve) => {
            abort = () => {
              targetController.abort()
              resolve({ error: 'cancelled' })
            }
            signal.addEventListener('abort', abort, { once: true })
            timeout = setTimeout(
              () => {
                targetController.abort()
                resolve({ error: 'snmp_timeout' })
              },
              policy.deadlineMs + (policy.credentialBudgetMs ?? 5000),
            )
          })
          const operation = (async () => {
            let user
            try {
              user = await vault.load(target, { signal: targetController.signal })
            } catch {
              return { error: 'credentials_unavailable' }
            }
            if (targetController.signal.aborted || store.revision() !== revision) return { error: 'cancelled' }
            return runner(target.address, user, {
              signal: targetController.signal,
              collectSwitchPorts: target.type === 'switch',
            })
          })()
          const value = await Promise.race([operation, interrupted])
          if (signal.aborted || store.revision() !== revision) break
          if (value.error)
            throw new Error(
              ['credentials_unavailable', 'snmp_timeout', 'snmp_limit', 'snmp_changed'].includes(value.error)
                ? value.error
                : 'snmp_failed',
            )
          store.appendInterfaces(target.deviceId, value, { revision, authorization: target.authorization })
          if (value.switchPorts)
            switchPorts.set(target.deviceId, { ...target, checkedAt: value.checkedAt, ports: value.switchPorts })
          else switchPorts.delete(target.deviceId)
          const prior = neighbors.get(target.deviceId)
          if (value.lldp?.checkedAt)
            neighbors.set(target.deviceId, { ...value.lldp, authorization: target.authorization })
          else if (prior?.authorization === target.authorization)
            neighbors.set(target.deviceId, { ...prior, state: 'stale' })
          else neighbors.delete(target.deviceId)
          devices.set(target.deviceId, { state: 'ok', lastAttemptAt: stamp() })
        } catch (error) {
          switchPorts.delete(target.deviceId)
          const prior = neighbors.get(target.deviceId)
          if (prior?.authorization === target.authorization)
            neighbors.set(target.deviceId, { ...prior, state: 'stale' })
          info.errors++
          devices.set(target.deviceId, {
            state: ['credentials_unavailable', 'snmp_timeout', 'snmp_limit', 'snmp_changed', 'snmp_failed'].includes(
              error.message,
            )
              ? error.message
              : 'collection_unavailable',
            lastAttemptAt: stamp(),
          })
        } finally {
          clearTimeout(timeout)
          if (abort) signal.removeEventListener('abort', abort)
        }
      }
    }
    try {
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(policy.concurrency, targets.length) }, () =>
          worker().catch((error) => {
            controller.abort()
            throw error
          }),
        ),
      )
      const failed = results.find((r) => r.status === 'rejected')
      if (failed) throw failed.reason
    } finally {
      clearInterval(revisionWatch)
    }
    info.state = signal.aborted ? 'starting' : info.errors ? 'degraded' : 'running'
    info.lastSeenAt = stamp()
    if (!signal.aborted && store.revision() === revision) onSwitchPorts?.(readSwitchPorts())
  }
  function runOnce() {
    if (stopped || !enabled || platform !== 'win32') return Promise.resolve()
    if (active) return active
    discoveryController?.abort('monitoring_busy')
    controller = new AbortController()
    active = cycle()
      .catch(() => {
        controller.abort()
        info.state = 'degraded'
        info.errors++
      })
      .finally(() => {
        active = null
      })
    return active
  }
  async function poll() {
    const start = now()
    await runOnce()
    if (!stopped) timer = setTimeout(poll, Math.max(1000, policy.intervalMs - (now() - start)))
  }
  function readSwitchPorts() {
    const matches = new Map()
    if (stopped || !enabled || platform !== 'win32') return matches
    for (const target of store.interfaceTargets()) {
      const sample = switchPorts.get(target.deviceId)
      if (
        target.type !== 'switch' ||
        sample?.address !== target.address ||
        sample.authorization !== target.authorization
      )
        continue
      const age = now() - Date.parse(sample.checkedAt)
      if (!Number.isFinite(age) || age < 0 || age > freshness()) continue
      for (const { mac, ...port } of sample.ports) {
        if (!matches.has(mac)) matches.set(mac, [])
        matches.get(mac).push({ ...port, switchId: target.deviceId })
      }
    }
    return matches
  }
  return {
    runOnce,
    async topologySample(id, signal, expected) {
      if (!enabled || platform !== 'win32' || stopped) return { error: 'collection_unavailable' }
      if (active || discoveryController) return { error: 'monitoring_busy' }
      const revision = store.revision()
      const target = store.interfaceTargets().find(({ deviceId }) => deviceId === id)
      if (
        !target ||
        signal.aborted ||
        (expected && (target.address !== expected.address || target.authorization !== expected.authorization))
      )
        return { error: 'cancelled' }
      const work = new AbortController()
      discoveryController = work
      const timeLimit = AbortSignal.timeout(policy.deadlineMs + (policy.credentialBudgetMs ?? 5000))
      const requestSignal = AbortSignal.any([signal, work.signal, timeLimit])
      const guard = setInterval(() => {
        if (store.revision() !== revision) work.abort()
      }, 100)
      try {
        const user = await vault.load(target, { signal: requestSignal })
        const current = store.interfaceTargets().find(({ deviceId }) => deviceId === id)
        if (requestSignal.aborted || store.revision() !== revision || current?.authorization !== target.authorization)
          return {
            error:
              work.signal.reason === 'monitoring_busy'
                ? 'monitoring_busy'
                : timeLimit.aborted
                  ? 'snmp_timeout'
                  : 'cancelled',
          }
        const value = await runner(target.address, user, { signal: requestSignal, discovery: true })
        const latest = store.interfaceTargets().find(({ deviceId }) => deviceId === id)
        if (work.signal.aborted)
          return { error: work.signal.reason === 'monitoring_busy' ? 'monitoring_busy' : 'cancelled' }
        if (timeLimit.aborted) return { error: 'snmp_timeout' }
        if (
          requestSignal.aborted ||
          latest?.authorization !== target.authorization ||
          latest?.address !== target.address
        )
          return { error: 'cancelled' }
        return value
      } catch {
        return {
          error:
            work.signal.reason === 'monitoring_busy'
              ? 'monitoring_busy'
              : timeLimit.aborted
                ? 'snmp_timeout'
                : requestSignal.aborted
                  ? 'cancelled'
                  : 'credentials_unavailable',
        }
      } finally {
        clearInterval(guard)
        if (discoveryController === work) discoveryController = undefined
      }
    },
    snapshot: () => ({ ...info, freshness: { staleAfterMs: freshness() } }),
    device: (id) => ({ ...devices.get(id), collectorState: info.state, staleAfterMs: freshness() }),
    switchPorts: readSwitchPorts,
    neighbors(id) {
      const target = store.interfaceTargets().find((row) => row.deviceId === id)
      if (!target) return { state: 'unconfigured', neighbors: [] }
      const sample = neighbors.get(id)
      if (!sample || sample.authorization !== target.authorization) return { state: 'unavailable', neighbors: [] }
      const age = now() - Date.parse(sample.checkedAt)
      return {
        checkedAt: sample.checkedAt,
        state: stopped || !Number.isFinite(age) || age < 0 || age > freshness() ? 'stale' : sample.state,
        neighbors: sample.neighbors,
      }
    },
    start() {
      if (!stopped && enabled && platform === 'win32' && !timer && !active) void poll()
    },
    async stop() {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      discoveryController?.abort()
      await active
      await vault?.stop?.()
      info.state = 'stopped'
    },
  }
}
