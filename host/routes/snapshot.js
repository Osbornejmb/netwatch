import { createHash } from 'node:crypto'

export function createSnapshotRoute(instance) {
  let cached
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
    const snapshotKey = JSON.stringify([store.snapshotVersion(), portFreshness])
    if (cached?.store !== store || cached.key !== snapshotKey || store.snapshotNow() >= cached.expiresAt) {
      const snapshot = store.snapshot({ uplinkPorts: portFreshness > 0, portFreshness, linkHealth: true })
      const { linkHealthExpiresAt, ...result } = snapshot
      cached = {
        store,
        key: snapshotKey,
        expiresAt: linkHealthExpiresAt ?? Infinity,
        healthKey: createHash('sha256')
          .update(JSON.stringify(result.linkHealth ?? null))
          .digest('base64url'),
        result,
      }
    }
    const result = { ...cached.result, generatedAt: new Date(store.snapshotNow()).toISOString() }
    const version = createHash('sha256')
      .update(JSON.stringify([snapshotKey, visibleStatus, discoveryStatus, viewer, cached.healthKey]))
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
    const portEvidence = result.uplinkPorts && { uplinkPorts: result.uplinkPorts, uplinkStaleAfterMs: portFreshness }
    if (status) {
      result.collector = status
      result.freshness = status.freshness
    }
    if (viewer) {
      const { topology, ...inventory } = result.inventory
      const { schemaVersion, nodes, edges, groups } = topology
      const visibleTopology = {
        schemaVersion,
        nodes,
        edges: edges.map(({ role, ...edge }) => edge),
        ...(groups && { groups: groups.filter((group) => !group.protectedDevice) }),
      }
      const linkHealth = result.linkHealth && {
        links: result.linkHealth.links.map(({ flapping, ...link }) => link),
        redundancy: result.linkHealth.redundancy,
      }
      return {
        generatedAt: result.generatedAt,
        collector: { state: result.collector.state, freshness: { staleAfterMs: result.freshness.staleAfterMs } },
        freshness: { staleAfterMs: result.freshness.staleAfterMs },
        observations: result.observations,
        inventory: { ...inventory, topology: visibleTopology },
        ...(linkHealth && { linkHealth }),
        activeIncidents: result.activeIncidents,
        ...portEvidence,
      }
    }
    result.discovery = discoveryStatus
    return { ...result, ...portEvidence }
  }
}
