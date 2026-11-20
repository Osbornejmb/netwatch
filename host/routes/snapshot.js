import { createHash } from 'node:crypto'

export function createSnapshotRoute(instance) {
  return ({ store, collector, interfaces, discovery, requestHeaders, response, role }) => {
    const status = collector?.snapshot()
    const viewer = role === 'viewer'
    const discoveryStatus = viewer ? undefined : (discovery?.snapshot() ?? { state: 'disabled' })
    const portCollector = interfaces?.snapshot?.()
    const portFreshness = ['running', 'degraded'].includes(portCollector?.state)
      ? portCollector.freshness?.staleAfterMs
      : undefined
    const visibleStatus =
      viewer && status ? { state: status.state, freshness: { staleAfterMs: status.freshness.staleAfterMs } } : status
    const version = createHash('sha256')
      .update(JSON.stringify([store.snapshotVersion(), visibleStatus, discoveryStatus, viewer, portFreshness]))
      .digest('base64url')
    // The wall-clock generatedAt field can advance while the represented state is unchanged.
    const tag = '"' + instance + '.' + version + '"'
    response.headers = { ETag: 'W/' + tag }
    if (
      requestHeaders['if-none-match']?.split(',').some((value) => {
        const token = value.trim()
        return token === '*' || token === tag || token === 'W/' + tag
      })
    ) {
      response.status = 304
      return
    }
    const result = store.snapshot({ uplinkPorts: portFreshness > 0 })
    const portEvidence = result.uplinkPorts && { uplinkPorts: result.uplinkPorts, uplinkStaleAfterMs: portFreshness }
    if (status) {
      result.collector = status
      result.freshness = status.freshness
    }
    if (viewer) {
      return {
        generatedAt: result.generatedAt,
        collector: { state: result.collector.state, freshness: { staleAfterMs: result.freshness.staleAfterMs } },
        freshness: { staleAfterMs: result.freshness.staleAfterMs },
        observations: result.observations,
        inventory: result.inventory,
        activeIncidents: result.activeIncidents,
        ...portEvidence,
      }
    }
    result.discovery = discoveryStatus
    return { ...result, ...portEvidence }
  }
}
