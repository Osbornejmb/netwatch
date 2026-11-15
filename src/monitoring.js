import { csrf, hostFetch } from './auth.js'
import { validateTopology } from './topology.js'

export function writeHeaders() {
  const token = csrf() ?? globalThis.document?.querySelector('meta[name="netwatch-write-token"]')?.content
  return token ? { 'X-NetWatch-Write': token } : {}
}

export async function hostRequest(path, { signal, body } = {}) {
  const response = await hostFetch(`/api/v1/${path}`, {
    signal,
    cache: 'no-store',
    method: body ? 'PUT' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', ...writeHeaders() } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const value = await response.json()
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? 'Saved devices changed. Refresh and review before trying again.'
        : response.status === 400
          ? 'Check the device address and try again.'
          : 'Unable to reach the monitoring service. Try again.',
    )
  return value
}

export function validateSnapshot(value, previousInventory) {
  let inventory = value?.inventory
  if (
    !Number.isSafeInteger(inventory?.revision) ||
    inventory.revision < 0 ||
    !inventory.monitoring ||
    typeof inventory.monitoring !== 'object' ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !Number.isFinite(value.freshness?.staleAfterMs) ||
    value.freshness.staleAfterMs <= 0 ||
    typeof value.collector?.state !== 'string' ||
    !Array.isArray(value.observations) ||
    value.observations.length > 2000
  )
    throw new Error('Invalid host snapshot.')
  const unchanged = inventory.revision === previousInventory?.revision
  inventory = unchanged ? previousInventory : { ...inventory, topology: validateTopology(inventory.topology) }
  const ids = new Set(inventory.topology.nodes.map((node) => node.id))
  if (!unchanged) {
    for (const [id, enabled] of Object.entries(inventory.monitoring))
      if (!ids.has(id) || typeof enabled !== 'boolean') throw new Error('Invalid host monitoring settings.')
  }
  const checks = Object.create(null)
  for (const check of value.observations) {
    if (
      !ids.has(check?.deviceId) ||
      !['up', 'down', 'unknown'].includes(check.status) ||
      typeof check.checkedAt !== 'string' ||
      !Number.isFinite(Date.parse(check.checkedAt)) ||
      (check.latencyMs != null && (!Number.isFinite(check.latencyMs) || check.latencyMs < 0 || check.latencyMs > 1500))
    )
      throw new Error('Invalid host observation.')
    if (inventory.monitoring[check.deviceId] === true) checks[check.deviceId] = check
  }
  const activeIncidents = value.activeIncidents ?? []
  validateIncidents(activeIncidents, ids, 2000)
  if (
    activeIncidents.some((item) => item.resolvedAt !== null) ||
    new Set(activeIncidents.map((item) => item.deviceId)).size !== activeIncidents.length
  )
    throw new Error('Invalid active incidents.')
  const uplinkPorts = new Map()
  if (value.uplinkPorts !== undefined) {
    const links = new Map(inventory.topology.edges.map((edge) => [edge.id, edge]))
    if (
      !Array.isArray(value.uplinkPorts) ||
      value.uplinkPorts.length > links.size ||
      !Number.isFinite(value.uplinkStaleAfterMs) ||
      value.uplinkStaleAfterMs <= 0
    )
      throw Error('Invalid uplink observations.')
    for (const observation of value.uplinkPorts) {
      const edge = links.get(observation?.id)
      if (!edge?.uplink || uplinkPorts.has(edge.id) || (!observation.source && !observation.target))
        throw Error('Invalid uplink observation.')
      for (const side of ['source', 'target']) {
        const port = observation[side]
        if (
          port !== undefined &&
          (!edge.uplink[side].index ||
            !Number.isFinite(Date.parse(port?.checkedAt)) ||
            ![null, 1, 2, 3].includes(port.admin) ||
            ![null, 1, 2, 3, 4, 5, 6, 7].includes(port.oper))
        )
          throw Error('Invalid uplink port observation.')
      }
      uplinkPorts.set(edge.id, observation)
    }
  }
  return { ...value, activeIncidents, inventory, checks, uplinkPorts }
}

export function validateIncidents(items, ids, maximum = 25) {
  if (
    !Array.isArray(items) ||
    items.length > maximum ||
    items.some(
      (item, index) =>
        !ids.has(item?.deviceId) ||
        !Number.isSafeInteger(item.id) ||
        item.id < 1 ||
        (index > 0 && item.id >= items[index - 1].id) ||
        typeof item.openedAt !== 'string' ||
        !Number.isFinite(Date.parse(item.openedAt)) ||
        (item.resolvedAt !== null &&
          (typeof item.resolvedAt !== 'string' ||
            !Number.isFinite(Date.parse(item.resolvedAt)) ||
            Date.parse(item.resolvedAt) < Date.parse(item.openedAt))),
    )
  )
    throw new Error('Invalid incidents.')
}

async function requestSnapshot(path, { signal, etag }) {
  const response = await hostFetch('/api/v1/' + path, {
    signal,
    cache: 'no-store',
    headers: etag ? { 'If-None-Match': etag } : {},
  })
  if (response.status === 304) return { unchanged: true }
  if (!response.ok) throw new Error('Unable to reach the monitoring service. Try again.')
  return { value: await response.json(), etag: response.headers.get('ETag') }
}

// Serial, deadline-bounded polling. Cleanup also rejects late responses from transports that ignore abort.
export function pollSnapshot(
  onState,
  { request = requestSnapshot, intervalMs = 1000, timeoutMs = 10000, now = Date.now, cache = {} } = {},
) {
  let stopped = false,
    timer,
    controller
  const poll = async () => {
    controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const reply = await request('snapshot', { signal: controller.signal, etag: cache.etag })
      if (stopped) return
      if (controller.signal.aborted) throw new Error('Host request timed out.')
      const connection = { state: 'connected', error: '', receivedAt: new Date(now()).toISOString() }
      if (reply.unchanged) {
        if (!cache.etag || !cache.inventory) throw new Error('No previous host snapshot.')
        onState(connection)
      } else {
        // A different host instance can start at the same revision with a different database.
        const instance = (value) => value?.split('.')[0]
        const snapshot = validateSnapshot(
          reply.value,
          instance(cache.etag) === instance(reply.etag) ? cache.inventory : undefined,
        )
        cache.etag = reply.etag
        cache.inventory = snapshot.inventory
        onState({ ...connection, snapshot })
      }
    } catch (error) {
      if (!stopped)
        onState({ state: 'disconnected', error: controller.signal.aborted ? 'Host request timed out.' : error.message })
    } finally {
      clearTimeout(deadline)
      if (!stopped) timer = setTimeout(poll, intervalMs)
    }
  }
  poll()
  return () => {
    stopped = true
    clearTimeout(timer)
    controller.abort()
  }
}

export function formatCheckTime(time) {
  return Number.isFinite(Date.parse(time)) ? new Date(time).toLocaleString() : 'Never checked'
}

export function collectorLabel(state) {
  return (
    {
      running: 'Checking devices',
      idle: 'No devices enabled',
      disabled: 'Checks paused',
      unsupported: 'Windows required',
      starting: 'Starting checks',
      stopping: 'Stopping checks',
      stopped: 'Checks stopped',
      degraded: 'Checks interrupted',
    }[state] || 'Checks unavailable'
  )
}
