import { physicalConnectionKey } from './connections.js'

function reachable(topology, edges, removedDevice) {
  const graph = new Map(topology.nodes.map(({ id }) => [id, []]))
  for (const { source, target } of edges) {
    if (source === removedDevice || target === removedDevice) continue
    graph.get(source).push(target)
    graph.get(target).push(source)
  }
  const queue = (topology.roots ?? []).filter((id) => id !== removedDevice)
  const seen = new Set(queue)
  for (let i = 0; i < queue.length; i++) {
    for (const id of graph.get(queue[i]))
      if (!seen.has(id)) {
        seen.add(id)
        queue.push(id)
      }
  }
  return seen
}

export function estimateFailure(topology, { deviceId, linkId }, bundles = []) {
  if (!topology.roots?.length) return null
  const edges = topology.edges
  const selected = edges.find((edge) => edge.id === linkId)
  if ((!deviceId && !selected) || (deviceId && !topology.nodes.some(({ id }) => id === deviceId))) return null
  const key = selected && physicalConnectionKey(selected)
  const remaining = edges.filter((edge) => !key || physicalConnectionKey(edge) !== key)
  const before = reachable(topology, edges)
  const after = reachable(topology, remaining, deviceId)
  const isolated = [...before].filter((id) => id !== deviceId && !after.has(id))
  const byId = new Map(edges.map((edge) => [edge.id, edge]))
  const bundleIds = new Map(bundles.flatMap((bundle) => bundle.members.map((id) => [id, bundle.id])))
  const remainingIds = new Set(remaining.map(({ id }) => id))
  const degraded = new Set()
  for (const group of topology.groups ?? []) {
    const protectedDevice = group.protectedDevice
    if (!protectedDevice || !after.has(protectedDevice)) continue
    const paths = (graph, reachableIds, surviving) => {
      const upstream = reachable(topology, graph, protectedDevice)
      return new Set(
        group.links
          .filter((id) => {
            const edge = byId.get(id)
            const peer = edge?.source === protectedDevice ? edge?.target : edge?.source
            return edge && peer !== deviceId && upstream.has(peer) && reachableIds.has(peer) && surviving(id)
          })
          .map((id) => bundleIds.get(id) ?? physicalConnectionKey(byId.get(id))),
      )
    }
    const oldUpstream = reachable(topology, edges, protectedDevice)
    const old = new Set(
      group.links
        .filter((id) => {
          const edge = byId.get(id)
          return edge && oldUpstream.has(edge.source === protectedDevice ? edge.target : edge.source)
        })
        .map((id) => bundleIds.get(id) ?? physicalConnectionKey(byId.get(id))),
    )
    const current = paths(
      remaining.filter((edge) => edge.source !== deviceId && edge.target !== deviceId),
      after,
      (id) => remainingIds.has(id),
    )
    if (current.size < old.size) degraded.add(protectedDevice)
  }
  return { isolated: isolated.sort(), degraded: [...degraded].sort() }
}

export function incidentAnchors(topology, redundancy) {
  const current = new Map()
  const priority = { isolated: 3, degraded: 2, unknown: 1, healthy: 0 }
  for (const { deviceId, state } of redundancy) {
    if (!current.has(deviceId) || priority[state] > priority[current.get(deviceId)]) current.set(deviceId, state)
  }
  const isolated = new Set([...current].filter(([, state]) => state === 'isolated').map(([id]) => id))
  const baseline = reachable(topology, topology.edges)
  const reachableWithout = new Map([...isolated].map((id) => [id, reachable(topology, topology.edges, id)]))
  const impact = new Map(
    [...isolated].map((id) => [
      id,
      new Set([...baseline].filter((peer) => peer !== id && !reachableWithout.get(id).has(peer))),
    ]),
  )
  return [...current]
    .filter(
      ([id, state]) =>
        state === 'degraded' ||
        (state === 'isolated' && ![...impact].some(([parent, children]) => parent !== id && children.has(id))),
    )
    .map(([deviceId, state]) => ({
      deviceId,
      state,
      affected: state === 'isolated' ? [...impact.get(deviceId)].filter((id) => isolated.has(id)).length : 0,
    }))
}
