import { inferredRoles, linkBundles } from './rich-link.js'
import { physicalConnectionKey } from './connections.js'

const failed = (port) => port.admin === 2 || [2, 6, 7].includes(port.oper)
const up = (port) => port.admin === 1 && port.oper === 1

function portState(samples, now, staleAfterMs) {
  const fresh = (samples ?? []).filter((port) => {
    const age = now - Date.parse(port.checkedAt)
    return age >= 0 && age <= staleAfterMs
  })
  const [latest, previous] = fresh
  if (!latest) return { state: 'unknown', checkedAt: samples?.[0]?.checkedAt }
  let state = 'unknown'
  if (up(latest)) state = 'up'
  if (failed(latest) && previous && failed(previous) && latest.checkedAt !== previous.checkedAt) state = 'down'
  return {
    state,
    checkedAt: latest.checkedAt,
    fresh: true,
    reportedDown: failed(latest),
    stp: latest.stp,
    aggregateId: latest.aggregateId,
    errorsPerSec: latest.errorsPerSec,
    discardsPerSec: latest.discardsPerSec,
    forwarding: latest.stp === 'blocking' ? 'standby' : latest.stp === 'forwarding' ? 'forwarding' : latest.forwarding,
    speed: latest.speed,
    degraded: latest.degraded,
    flapping:
      fresh.length >= 3 &&
      fresh.every(
        (port, i) =>
          !i ||
          (port.checkedAt !== fresh[i - 1].checkedAt &&
            ((up(port) && failed(fresh[i - 1])) || (failed(port) && up(fresh[i - 1])))),
      ),
  }
}

function linkEvidence(edge, readings, now, staleAfterMs, conflictingPorts, metadata) {
  const source = portState(readings?.source, now, staleAfterMs)
  const target = portState(readings?.target, now, staleAfterMs)
  metadata.set(edge.id, { source, target })
  const count = Number(!!source.fresh) + Number(!!target.fresh)
  const scope =
    readings?.neighborVerified && count === 2
      ? 'neighborVerified'
      : ['reachabilityOnly', 'snmpOneEnd', 'snmpBothEnds'][count]
  let state = 'unknown'
  if (
    (source.state === 'up' && target.reportedDown) ||
    (target.state === 'up' && source.reportedDown) ||
    (count > 0 &&
      ['source', 'target'].some((side) =>
        conflictingPorts.has(JSON.stringify([edge[side], edge.uplink?.[side].index])),
      ))
  ) {
    state = 'mismatch'
  } else if (source.state === 'down' || target.state === 'down') {
    state = 'down'
  } else if (source.state === 'up' && target.state === 'up') {
    if (source.speed > 0 && target.speed > 0 && source.speed !== target.speed) state = 'mismatch'
    else if (source.forwarding === 'standby' || target.forwarding === 'standby') state = 'standby'
    else if ([source.stp, target.stp].some((status) => status && status !== 'forwarding')) state = 'unknown'
    else if (source.degraded || target.degraded) state = 'degraded'
    else if (source.forwarding === 'forwarding' && target.forwarding === 'forwarding') state = 'forwarding'
    else state = 'portsUp'
  } else if (count === 1) {
    state = 'oneSided'
  }
  const details = (port) => ({
    ...(port.fresh && port.stp && { stp: port.stp }),
    ...(port.fresh && Number.isFinite(port.errorsPerSec) && { errorsPerSec: port.errorsPerSec }),
    ...(port.fresh && Number.isFinite(port.discardsPerSec) && { discardsPerSec: port.discardsPerSec }),
  })
  return {
    id: edge.id,
    source: {
      ...details(source),
      deviceId: edge.source,
      portLabel: edge.uplink?.source.label ?? '',
      checkedAt: source.checkedAt ?? null,
      fresh: !!source.fresh,
      ...(source.fresh && source.speed > 0 && { speedBps: source.speed }),
    },
    target: {
      ...details(target),
      deviceId: edge.target,
      portLabel: edge.uplink?.target.label ?? '',
      checkedAt: target.checkedAt ?? null,
      fresh: !!target.fresh,
      ...(target.fresh && target.speed > 0 && { speedBps: target.speed }),
    },
    state,
    scope,
    flapping: !!(source.flapping || target.flapping),
  }
}

function graph(topology, links, bundles) {
  const adjacency = new Map(topology.nodes.map(({ id }) => [id, []]))
  const root = Symbol('root')
  adjacency.set(root, [])
  const add = (id, a, b) => {
    adjacency.get(a).push([id, b])
    adjacency.get(b).push([id, a])
  }
  const keys = new Set()
  for (const edge of links) {
    const bundle = bundles.get(edge.id)
    const key = bundle ?? physicalConnectionKey(edge)
    if (keys.has(key)) continue
    keys.add(key)
    add(bundle?.id ?? edge.id, edge.source, edge.target)
  }
  for (const id of topology.roots ?? []) add(Symbol('root link'), root, id)
  return { adjacency, root }
}

function reachable({ adjacency, root }, excluded) {
  const seen = new Set([root])
  const pending = [root]
  while (pending.length) {
    for (const [, next] of adjacency.get(pending.pop())) {
      if (next === excluded || seen.has(next)) continue
      seen.add(next)
      pending.push(next)
    }
  }
  return seen
}

function failurePoints({ adjacency, root }) {
  const visited = new Map()
  const devices = new Set()
  const links = new Set()
  function visit(node, incoming) {
    const start = visited.size
    visited.set(node, start)
    let low = start
    for (const [edge, peer] of adjacency.get(node)) {
      if (edge === incoming) continue
      if (visited.has(peer)) low = Math.min(low, visited.get(peer))
      else {
        const downstream = visit(peer, edge)
        low = Math.min(low, downstream)
        if (downstream >= start && node !== root) devices.add(node)
        if (downstream > start && typeof edge === 'string') links.add(edge)
      }
    }
    return low
  }
  visit(root)
  return { devices: [...devices].sort(), links: [...links].sort() }
}

function conflictingPortKeys(edges) {
  const peers = new Map()
  const conflicts = new Set()
  for (const edge of edges) {
    if (!edge.uplink?.source.index || !edge.uplink?.target.index) continue
    const source = JSON.stringify([edge.source, edge.uplink.source.index])
    const target = JSON.stringify([edge.target, edge.uplink.target.index])
    for (const [local, peer] of [
      [source, target],
      [target, source],
    ]) {
      if (peers.has(local) && peers.get(local) !== peer) conflicts.add(local)
      peers.set(local, peer)
    }
  }
  return conflicts
}

export function evaluateLinks(topology, evidence, now, staleAfterMs) {
  const samples = new Map(evidence.map((row) => [row.id, row]))
  const conflicts = conflictingPortKeys(topology.edges)
  const metadata = new Map()
  const roles = inferredRoles(topology)
  const links = topology.edges.map((edge) => ({
    ...linkEvidence(edge, samples.get(edge.id), now, staleAfterMs, conflicts, metadata),
    role: roles.get(edge.id),
  }))
  const { bundles, byLink } = linkBundles(topology, links, metadata)
  const states = new Map(links.map((link) => [link.id, link.state]))
  const usable = new Set(['portsUp', 'forwarding', 'standby', 'degraded'])
  const unknown = new Set(['unknown', 'oneSided'])
  const confirmed = topology.edges.filter(
    (edge) => usable.has(states.get(edge.id)) && states.get(edge.id) !== 'standby',
  )
  const possible = topology.edges.filter((edge) => usable.has(states.get(edge.id)) || unknown.has(states.get(edge.id)))
  const connected = graph(topology, confirmed, byLink)
  const reached = reachable(connected)
  const potential = graph(topology, possible, byLink)
  const potentiallyReached = reachable(potential)
  const byId = new Map(topology.edges.map((edge) => [edge.id, edge]))
  const redundancy = (topology.groups ?? [])
    .filter((group) => group.protectedDevice)
    .map((group) => {
      const { protectedDevice } = group
      let state = 'unknown'
      const uniquePaths = new Set(group.links.map((id) => byLink.get(id) ?? id))
      const stp = group.links.every((id) =>
        ['source', 'target'].every((side) => {
          const status = metadata.get(id)?.[side]?.stp
          return ['forwarding', 'blocking'].includes(status)
        }),
      )
      const lacp = group.links.some((id) => byLink.has(id))
      if (topology.roots?.length && reached.has(protectedDevice)) {
        const upstream = reachable(connected, protectedDevice)
        const possibleUpstream = reachable(potential, protectedDevice)
        const members = group.links.map((id) => {
          const edge = byId.get(id)
          const peer = edge.source === protectedDevice ? edge.target : edge.source
          return { state: states.get(id), reachesRoot: upstream.has(peer), canReachRoot: possibleUpstream.has(peer) }
        })
        if (
          members.every(
            ({ state, reachesRoot }) =>
              reachesRoot && (state === 'portsUp' || state === 'forwarding' || state === 'standby'),
          )
        ) {
          state = uniquePaths.size < group.links.length ? 'degraded' : 'healthy'
        } else if (
          members.some(
            ({ state, canReachRoot }) =>
              !canReachRoot || state === 'degraded' || (!usable.has(state) && !unknown.has(state)),
          )
        ) {
          state = 'degraded'
        }
      } else if (topology.roots?.length && !potentiallyReached.has(protectedDevice)) {
        state = 'isolated'
      }
      return {
        id: group.id,
        deviceId: protectedDevice,
        state,
        basis: stp && lacp ? 'stpAndLacp' : stp ? 'stp' : lacp ? 'lacp' : 'linkStatusOnly',
      }
    })
  return {
    links,
    redundancy,
    ...(bundles.length && { bundles }),
    failurePoints: failurePoints(graph(topology, topology.edges, byLink)),
  }
}
