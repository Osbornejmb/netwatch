export const linkLabels = {
  portsUp: 'Ports up · Forwarding unverified',
  forwarding: 'Forwarding',
  standby: 'Standby',
  down: 'Link down',
  degraded: 'Degraded link',
  mismatch: 'Mismatch',
  oneSided: 'One-sided evidence',
  unknown: 'Link state unknown',
}
export const scopeLabels = {
  reachabilityOnly: 'Reachability only',
  snmpOneEnd: 'SNMP one end',
  snmpBothEnds: 'SNMP both ends',
  neighborVerified: 'Neighbor verified',
}
export const baselineLabels = {
  healthy: 'Healthy redundancy',
  degraded: 'Running without redundancy',
  isolated: 'Isolated',
  unknown: 'Redundancy unknown',
  none: 'No baseline set',
}

export function layoutTiers(topology) {
  const neighbors = new Map(topology.nodes.map(({ id }) => [id, []]))
  for (const { source, target } of topology.edges) {
    neighbors.get(source).push(target)
    neighbors.get(target).push(source)
  }
  const queue = [...(topology.roots ?? [])]
  const tiers = new Map(queue.map((id) => [id, 0]))
  for (let i = 0; i < queue.length; i++) {
    for (const id of neighbors.get(queue[i])) {
      if (tiers.has(id)) continue
      tiers.set(id, tiers.get(queue[i]) + 1)
      queue.push(id)
    }
  }
  return [...tiers].map(([deviceId, tier]) => ({ deviceId, tier }))
}

export function hierarchyLayout(nodes, tiers, sizes) {
  const groups = new Map()
  const known = new Map(tiers.map(({ deviceId, tier }) => [deviceId, tier]))
  const last = Math.max(-1, ...known.values()) + 1
  for (const node of nodes) {
    const tier = known.get(node.id) ?? last
    if (!groups.has(tier)) groups.set(tier, [])
    groups.get(tier).push(node)
  }
  let y = 0
  return [...groups]
    .sort(([a], [b]) => a - b)
    .flatMap(([, group]) => {
      const width = group.map(({ id }) => Math.max(215, sizes[id]?.width ?? 0) + 75)
      let x = -width.reduce((sum, value) => sum + value, 0) / 2
      const rows = group.map((node, i) => {
        const positioned = { ...node, position: { x, y } }
        x += width[i]
        return positioned
      })
      y += Math.max(85, ...group.map(({ id }) => sizes[id]?.height ?? 0)) + 120
      return rows
    })
}

export function refocusSummary(nodes, edges, evidence, now, freshness, connected) {
  const reports = new Map((evidence?.links ?? []).map((link) => [link.id, link]))
  const active = (end) =>
    connected &&
    end?.fresh !== false &&
    Number.isFinite(Date.parse(end?.checkedAt)) &&
    now - Date.parse(end.checkedAt) >= 0 &&
    now - Date.parse(end.checkedAt) <= freshness
  const links = edges.map((edge) => {
    const report = reports.get(edge.id)
    const source = { ...report?.source, fresh: active(report?.source) }
    const target = { ...report?.target, fresh: active(report?.target) }
    const count = Number(source.fresh) + Number(target.fresh)
    const outdated =
      report &&
      ((report.source.fresh !== false && report.source.checkedAt && !source.fresh) ||
        (report.target.fresh !== false && report.target.checkedAt && !target.fresh))
    return {
      edge,
      source,
      target,
      count,
      expired: !!outdated,
      stale: !!(source.checkedAt || target.checkedAt) && (!!outdated || count < 2),
      state: outdated ? (count === 1 ? 'oneSided' : 'unknown') : (report?.state ?? 'unknown'),
      scope:
        count === 2 && report?.scope === 'neighborVerified'
          ? 'neighborVerified'
          : ['reachabilityOnly', 'snmpOneEnd', 'snmpBothEnds'][count],
    }
  })
  const partial = links.some((link) => link.expired)
  const groups = new Map()
  const rank = { isolated: 0, degraded: 1, unknown: 2, healthy: 3 }
  for (const group of evidence?.redundancy ?? []) {
    const state = connected && !partial ? group.state : 'unknown'
    if (!groups.has(group.deviceId) || rank[state] < rank[groups.get(group.deviceId)]) groups.set(group.deviceId, state)
  }
  const devices = nodes
    .filter((node) => node.type === 'switch' || groups.has(node.id))
    .map((node) => ({ node, state: groups.get(node.id) ?? 'none' }))
  const monitored = links.filter(({ count }) => count === 2).length
  const affected = (state) => devices.filter((device) => device.state === state).length
  const isolated = affected('isolated'),
    degraded = affected('degraded')
  let headline = 'Link health needs verification'
  if (!edges.length) headline = 'Add connections to see link health'
  else if (isolated || degraded)
    headline = [
      isolated && isolated + (isolated === 1 ? ' device is isolated' : ' devices are isolated'),
      degraded &&
        degraded +
          (degraded === 1 ? ' device is running without redundancy' : ' devices are running without redundancy'),
    ]
      .filter(Boolean)
      .join(' · ')
  else if (
    monitored === links.length &&
    devices.length &&
    devices.every(({ state }) => state === 'healthy') &&
    links.every(({ state }) => ['portsUp', 'forwarding', 'standby'].includes(state))
  )
    headline = 'Reviewed redundancy is available · Based on link status only'
  return { links, devices, headline, monitored }
}

export function formatSpeed(speedBps) {
  if (!speedBps) return ''
  return speedBps >= 1e9 ? speedBps / 1e9 + ' Gbps' : speedBps >= 1e6 ? speedBps / 1e6 + ' Mbps' : speedBps + ' bps'
}
