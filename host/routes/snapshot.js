import { createHash } from 'node:crypto'

export function createSnapshotRoute(instance) {
  return ({ store, collector, discovery, requestHeaders, response, role }) => {
    const status = collector?.snapshot()
    const viewer = role === 'viewer'
    const discoveryStatus = viewer ? undefined : (discovery?.snapshot() ?? { state: 'disabled' })
    const version = createHash('sha256')
      .update(JSON.stringify([store.snapshotVersion(), status, discoveryStatus, viewer]))
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
    const result = store.snapshot()
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
      }
    }
    result.discovery = discoveryStatus
    return result
  }
}
