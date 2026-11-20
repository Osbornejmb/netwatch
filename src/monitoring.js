import { basisLabels, linkLabels, roleLabels, scopeLabels } from './refocus.js'
import { csrf, hostFetch } from './auth.js'
import { validateTopology } from './topology.js'

const writeTokenSelector = 'meta[name="netwatch-write-token"]'

export function writeHeaders() {
  const token = csrf() ?? globalThis.document?.querySelector(writeTokenSelector)?.content
  return token ? { 'X-NetWatch-Write': token } : {}
}

export async function refreshLocalWriteToken() {
  const response = await hostFetch('/', { cache: 'no-store' })
  if (!response.ok) return false
  const html = new DOMParser().parseFromString(await response.text(), 'text/html')
  const fresh = html.querySelector(writeTokenSelector)?.content
  const current = document.querySelector(writeTokenSelector)
  if (!current || !/^[0-9a-f]{64}$/.test(fresh ?? '') || current.content === fresh) return false
  current.content = fresh
  return true
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

function validBundle(row) {
  return (
    !!row &&
    Number.isInteger(row.total) &&
    row.total >= 2 &&
    row.total <= 10000 &&
    Number.isInteger(row.up) &&
    row.up >= 0 &&
    row.up <= row.total &&
    ['up', 'down', 'degraded', 'standby', 'unknown'].includes(row.state)
  )
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
  const links = new Map(inventory.topology.edges.map((edge) => [edge.id, edge]))
  const tiers = value.tiers ?? []
  if (
    !Array.isArray(tiers) ||
    tiers.length > ids.size ||
    new Set(tiers.map((row) => row?.deviceId)).size !== tiers.length ||
    tiers.some((row) => !ids.has(row?.deviceId) || !Number.isInteger(row.tier) || row.tier < 0 || row.tier >= ids.size)
  )
    throw Error('Invalid layout tiers.')
  const linkHealth = value.linkHealth
  if (linkHealth !== undefined) {
    if (
      !Array.isArray(linkHealth?.links) ||
      linkHealth.links.length > links.size ||
      !Array.isArray(linkHealth.redundancy) ||
      linkHealth.redundancy.length > 100 ||
      new Set(linkHealth.links.map((row) => row?.id)).size !== linkHealth.links.length
    )
      throw Error('Invalid link evidence.')
    for (const row of linkHealth.links) {
      const edge = links.get(row?.id)
      if (!edge || !Object.hasOwn(linkLabels, row.state) || !Object.hasOwn(scopeLabels, row.scope))
        throw Error('Invalid link state.')
      if (row.role !== undefined && !Object.hasOwn(roleLabels, row.role)) throw Error('Invalid link role.')
      if (row.bundle !== undefined && !validBundle(row.bundle)) throw Error('Invalid link bundle.')
      for (const side of ['source', 'target']) {
        const end = row[side]
        if (
          !end ||
          end.deviceId !== edge[side] ||
          typeof end.portLabel !== 'string' ||
          end.portLabel.length > 80 ||
          (end.checkedAt !== null && !Number.isFinite(Date.parse(end.checkedAt))) ||
          (end.fresh !== undefined && typeof end.fresh !== 'boolean') ||
          (end.speedBps !== undefined &&
            (!Number.isSafeInteger(end.speedBps) || end.speedBps < 1 || end.speedBps > 1e15))
        )
          throw Error('Invalid link port evidence.')
        if (
          (end.stp !== undefined &&
            !['blocking', 'forwarding', 'listening', 'learning', 'disabled', 'broken'].includes(end.stp)) ||
          ['errorsPerSec', 'discardsPerSec'].some(
            (key) => end[key] !== undefined && (!Number.isFinite(end[key]) || end[key] < 0 || end[key] > 1e10),
          )
        )
          throw Error('Invalid rich port evidence.')
      }
    }
    if (
      linkHealth.redundancy.some(
        (row) =>
          !ids.has(row?.deviceId) ||
          !['healthy', 'degraded', 'isolated', 'unknown'].includes(row.state) ||
          !Object.hasOwn(basisLabels, row.basis),
      )
    )
      throw Error('Invalid redundancy evidence.')
    if (
      linkHealth.bundles !== undefined &&
      (!Array.isArray(linkHealth.bundles) ||
        linkHealth.bundles.length > links.size ||
        linkHealth.bundles.some(
          (bundle) =>
            !validBundle(bundle) ||
            !links.has(bundle.id) ||
            !Array.isArray(bundle.members) ||
            bundle.members.length !== bundle.total ||
            new Set(bundle.members).size !== bundle.members.length ||
            bundle.members.some((id) => !links.has(id)),
        ))
    )
      throw Error('Invalid bundles.')
    if (linkHealth.failurePoints !== undefined) {
      const points = linkHealth.failurePoints
      if (
        !Array.isArray(points?.devices) ||
        points.devices.length > ids.size ||
        points.devices.some((id) => !ids.has(id)) ||
        !Array.isArray(points.links) ||
        points.links.length > links.size ||
        points.links.some((id) => !links.has(id))
      )
        throw Error('Invalid failure points.')
    }
  }
  const dynamics = value.dynamics
  if (dynamics !== undefined) {
    const validId = (row) => Number.isSafeInteger(row?.id) && row.id > 0
    const validTime = (time) => typeof time === 'string' && Number.isFinite(Date.parse(time))
    const validDetail = (detail) =>
      (typeof detail === 'string' && detail.length <= 500) || (Number.isFinite(detail) && detail > 0)
    if (
      !Array.isArray(dynamics?.changes) ||
      dynamics.changes.length > 50 ||
      dynamics.changes.some(
        (row) =>
          !validId(row) ||
          !validTime(row.at) ||
          typeof row.label !== 'string' ||
          row.label.length > 500 ||
          !['deviceAdded', 'linkAdded', 'linkMoved', 'linkMissing', 'speedChanged'].includes(row.kind) ||
          ((row.before !== undefined || row.after !== undefined) &&
            (!validDetail(row.before) || !validDetail(row.after))),
      ) ||
      !Array.isArray(dynamics.incidents) ||
      dynamics.incidents.length > 100 ||
      dynamics.incidents.some(
        (row) =>
          !validId(row) ||
          typeof row.deviceId !== 'string' ||
          !['isolated', 'degraded'].includes(row.state) ||
          !Number.isInteger(row.affected) ||
          row.affected < 0 ||
          row.affected > 2000 ||
          !validTime(row.openedAt) ||
          (row.resolvedAt !== null && !validTime(row.resolvedAt)),
      )
    )
      throw Error('Invalid topology changes or redundancy incidents.')
  }
  return { ...value, activeIncidents, inventory, checks, uplinkPorts, tiers, linkHealth }
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
        onState({ ...connection, snapshot, clockOffset: Date.parse(snapshot.generatedAt) - now() })
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

export function subscribeSnapshots(
  onState,
  {
    EventSource = globalThis.EventSource,
    document = globalThis.document,
    poll = pollSnapshot,
    now = Date.now,
    retryMs = 10000,
    minimumRevision,
    cache = {},
  } = {},
) {
  let source,
    timeout,
    retry,
    stopPolling,
    previousId,
    inventory,
    stopped = false,
    failures = 0
  const stop = () => {
    source?.close()
    source = undefined
    clearTimeout(timeout)
    clearTimeout(retry)
    stopPolling?.()
    stopPolling = undefined
    failures = 0
  }
  // Request the saved revision even when an established event stream is still serving an older map.
  let expected = minimumRevision
  const syncUntil = now() + 30000
  const awaitingSave = (snapshot) =>
    Number.isSafeInteger(expected) && now() < syncUntil && snapshot.inventory.revision < expected
  const startPolling = () => {
    if (stopPolling) return
    stopPolling = poll(
      (state) => {
        if (!state.snapshot || !awaitingSave(state.snapshot)) onState({ ...state, transport: 'poll' })
      },
      { intervalMs: Number.isSafeInteger(expected) ? 1000 : 8000, cache },
    )
  }
  const fail = () => {
    source?.close()
    source = undefined
    clearTimeout(timeout)
    if (EventSource && ++failures === 1) {
      onState({ state: 'reconnecting', transport: undefined })
      retry = setTimeout(connect, Math.min(300, retryMs))
      return
    }
    if (!stopPolling) {
      onState({ state: 'reconnecting', transport: undefined })
      startPolling()
    }
    if (EventSource) retry = setTimeout(connect, retryMs)
  }
  function connect() {
    if (stopped || document?.hidden) return
    if (!EventSource) return fail()
    let active
    try {
      active = source = new EventSource('/api/v1/events')
    } catch {
      return fail()
    }
    const resetTimeout = (deadline) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (source === active) fail()
      }, deadline)
    }
    resetTimeout(10000)
    active.onerror = () => {
      if (source === active) fail()
    }
    active.addEventListener('snapshot', (event) => {
      if (source !== active) return
      try {
        const instance = (id) => id?.split('.')[0]
        const snapshot = validateSnapshot(
          JSON.parse(event.data),
          instance(previousId) === instance(event.lastEventId) ? inventory : undefined,
        )
        if (awaitingSave(snapshot)) {
          startPolling()
          return
        }
        expected = undefined
        previousId = event.lastEventId
        inventory = snapshot.inventory
        failures = 0
        stopPolling?.()
        stopPolling = undefined
        resetTimeout(45000)
        const received = now()
        onState({
          state: 'connected',
          transport: 'sse',
          error: '',
          snapshot,
          receivedAt: new Date(received).toISOString(),
          clockOffset: Date.parse(snapshot.generatedAt) - received,
        })
      } catch {
        fail()
      }
    })
    active.addEventListener('clock', (event) => {
      const serverTime = Number(event.data)
      if (source !== active || !Number.isFinite(serverTime) || serverTime <= 0) return
      resetTimeout(45000)
      onState({ clockOffset: serverTime - now() })
    })
  }
  const visibility = () => {
    if (document.hidden) stop()
    else if (!source && !stopPolling) connect()
  }
  document?.addEventListener('visibilitychange', visibility)
  if (Number.isSafeInteger(expected) && !document?.hidden && EventSource) startPolling()
  connect()
  return () => {
    stopped = true
    document?.removeEventListener('visibilitychange', visibility)
    stop()
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
