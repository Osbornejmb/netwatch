import { uniqueConnections } from './connections.js'
import { layoutTiers } from './refocus.js'

export function inferredRoles(topology) {
  const tiers = new Map(layoutTiers(topology).map(({ deviceId, tier }) => [deviceId, tier]))
  return new Map(
    topology.edges.map((edge) => {
      if (edge.role && edge.role !== 'unknown') return [edge.id, edge.role]
      const from = tiers.get(edge.source),
        to = tiers.get(edge.target)
      return [
        edge.id,
        from === undefined || to === undefined ? 'unknown' : from === to ? 'peer' : from > to ? 'uplink' : 'downlink',
      ]
    }),
  )
}

export function linkBundles(topology, links, metadata) {
  const edges = new Map(topology.edges.map((edge) => [edge.id, edge]))
  const accepted = new Set(uniqueConnections(topology.edges).map(({ id }) => id))
  const groups = new Map()
  const localPeers = new Map()
  for (const link of links) {
    if (!accepted.has(link.id)) continue
    const { source, target } = edges.get(link.id)
    const ends = [
      [source, metadata.get(link.id).source.aggregateId],
      [target, metadata.get(link.id).target.aggregateId],
    ].sort(([a], [b]) => a.localeCompare(b))
    if (ends.some(([, id]) => !id)) continue
    const key = JSON.stringify(ends)
    for (const end of ends) {
      const local = JSON.stringify(end)
      if (!localPeers.has(local)) localPeers.set(local, new Set())
      localPeers.get(local).add(key)
    }
    if (!groups.has(key)) groups.set(key, { ends, links: [] })
    groups.get(key).links.push(link)
  }
  const byLink = new Map()
  const bundles = []
  for (const { ends, links } of groups.values()) {
    if (links.length < 2 || ends.some((end) => localPeers.get(JSON.stringify(end)).size > 1)) continue
    links.sort((a, b) => a.id.localeCompare(b.id))
    const total = links.length
    const up = links.filter(({ state }) => ['portsUp', 'forwarding', 'degraded'].includes(state)).length
    const unknown = links.filter(({ state }) => ['unknown', 'oneSided'].includes(state)).length
    const state = unknown
      ? 'unknown'
      : up === total && links.every((link) => link.state !== 'degraded')
        ? 'up'
        : up
          ? 'degraded'
          : links.every((link) => link.state === 'standby')
            ? 'standby'
            : 'down'
    const members = links.map(({ id }) => id)
    const counts = { total, up, state }
    const bundle = { id: members[0], members, ...counts }
    bundles.push(bundle)
    for (const link of links) {
      byLink.set(link.id, bundle)
      link.bundle = counts
    }
  }
  return { bundles, byLink }
}
