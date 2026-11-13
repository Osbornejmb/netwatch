import { validateTopology } from './topology.js'

export async function hostRequest(path, { signal, body } = {}) {
  const response = await fetch(`/api/v1/${path}`, {
    signal, cache: 'no-store', method: body ? 'PUT' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', 'X-NetWatch-Write': '1' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const value = await response.json()
  if (!response.ok) throw new Error(response.status === 409 ? 'Saved devices changed. Refresh and review before trying again.' : response.status === 400 ? 'Check the device address and try again.' : 'Unable to reach the monitoring service. Try again.')
  return value
}

export function validateSnapshot(value) {
  const inventory = value?.inventory
  if (!Number.isSafeInteger(inventory?.revision) || inventory.revision < 0 ||
      !inventory.monitoring || typeof inventory.monitoring !== 'object' ||
      !Number.isFinite(Date.parse(value.generatedAt)) ||
      !Number.isFinite(value.freshness?.staleAfterMs) || value.freshness.staleAfterMs <= 0 ||
      typeof value.collector?.state !== 'string' || !Array.isArray(value.observations) || value.observations.length > 2000) throw new Error('Invalid host snapshot.')
  const topology = validateTopology(inventory.topology)
  const ids = new Set(topology.nodes.map(node => node.id))
  for (const [id, enabled] of Object.entries(inventory.monitoring)) {
    if (!ids.has(id) || typeof enabled !== 'boolean') throw new Error('Invalid host monitoring settings.')
  }
  const checks = Object.create(null)
  for (const check of value.observations) {
    if (!ids.has(check?.deviceId) || !['up', 'down', 'unknown'].includes(check.status) ||
        typeof check.checkedAt !== 'string' || !Number.isFinite(Date.parse(check.checkedAt)) ||
        (check.latencyMs != null && (!Number.isFinite(check.latencyMs) || check.latencyMs < 0 || check.latencyMs > 1500))) throw new Error('Invalid host observation.')
    if (inventory.monitoring[check.deviceId] === true) checks[check.deviceId] = check
  }
  const activeIncidents = value.activeIncidents ?? []
  validateIncidents(activeIncidents, ids, 2000)
  if (activeIncidents.some(item => item.resolvedAt !== null) || new Set(activeIncidents.map(item => item.deviceId)).size !== activeIncidents.length) throw new Error('Invalid active incidents.')
  return { ...value, activeIncidents, inventory: { ...inventory, topology }, checks }
}

export function validateIncidents(items, ids, maximum = 25) {
  if (!Array.isArray(items) || items.length > maximum || items.some((item, index) =>
    !ids.has(item?.deviceId) || !Number.isSafeInteger(item.id) || item.id < 1 ||
    (index > 0 && item.id >= items[index - 1].id) || typeof item.openedAt !== 'string' || !Number.isFinite(Date.parse(item.openedAt)) ||
    (item.resolvedAt !== null && (typeof item.resolvedAt !== 'string' || !Number.isFinite(Date.parse(item.resolvedAt)) || Date.parse(item.resolvedAt) < Date.parse(item.openedAt))))) throw new Error('Invalid incidents.')
}

// Serial, deadline-bounded polling. Cleanup also rejects late responses from transports that ignore abort.
export function pollSnapshot(onState, { request = hostRequest, intervalMs = 1000, timeoutMs = 10000 } = {}) {
  let stopped = false, timer, controller
  const poll = async () => {
    controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const snapshot = validateSnapshot(await request('snapshot', { signal: controller.signal }))
      if (!stopped && !controller.signal.aborted) onState({ snapshot, state: 'connected', error: '' })
      else if (!stopped) onState({ state: 'disconnected', error: 'Host request timed out.' })
    } catch (error) {
      if (!stopped) onState({ state: 'disconnected', error: controller.signal.aborted ? 'Host request timed out.' : error.message })
    } finally {
      clearTimeout(deadline)
      if (!stopped) timer = setTimeout(poll, intervalMs)
    }
  }
  poll()
  return () => { stopped = true; clearTimeout(timer); controller.abort() }
}

export function formatCheckTime(time) {
  return Number.isFinite(Date.parse(time)) ? new Date(time).toLocaleString() : 'Never checked'
}

export function collectorLabel(state) {
  return ({ running: 'Checking devices', idle: 'No devices enabled', disabled: 'Checks paused', unsupported: 'Windows required', starting: 'Starting checks', stopping: 'Stopping checks', stopped: 'Checks stopped', degraded: 'Checks interrupted' })[state] || 'Checks unavailable'
}
