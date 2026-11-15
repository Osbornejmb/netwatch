import { createHash } from 'node:crypto'

export function createSnapshotRoute(instance) {
  return ({ store, collector, discovery, requestHeaders, response }) => {
    const status = collector?.snapshot()
    const discoveryStatus = discovery?.snapshot() ?? { state: 'disabled' }
    const version = createHash('sha256')
      .update(JSON.stringify([store.snapshotVersion(), status, discoveryStatus]))
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
    result.discovery = discoveryStatus
    return result
  }
}
