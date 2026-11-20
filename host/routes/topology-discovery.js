import { createHash } from 'node:crypto'
import { invalid } from '../store.js'
import { connectionKey } from '../../src/connections.js'

const deviceId = (key) => 'lldp-' + createHash('sha256').update(key).digest('hex')
const actualType = (type) => ['switch', 'router'].includes(type)
const draftPort = ({ label, index }) => ({ label, index })

export function discoveryRoutes(discovery) {
  const service = () => {
    if (!discovery) throw invalid('Topology discovery is unavailable.', 503)
    return discovery
  }
  const view = (store, run) => {
    if (!run) return null
    const saved = store.read().topology.nodes
    return {
      ...run,
      devices: run.devices.map((device) => {
        if (device.enrolledId || saved.some((node) => node.chassisKey === device.chassisKey)) return device
        const matches = saved
          .filter((node) => !node.chassisKey && node.data.ip && device.addresses.includes(node.data.ip))
          .map(({ id, data }) => ({ id, label: data.label }))
        return { ...device, matches }
      }),
    }
  }
  const read = ({ store }) => {
    const ids = new Set(service().seeds())
    const topology = store.read().topology
    const byId = new Map(topology.nodes.map((node) => [node.id, node.data.label]))
    const pairs = new Set(topology.edges.map(connectionKey))
    const links = new Map(topology.edges.map((edge) => [edge.id, edge]))
    return {
      seeds: topology.nodes.filter((node) => ids.has(node.id)).map(({ id, data }) => ({ id, label: data.label })),
      run: view(store, service().latest()),
      schedule: store.dynamics.schedule(),
      hints: store
        .topologyHints()
        .filter(
          (edge) =>
            byId.has(edge.source) &&
            byId.has(edge.target) &&
            (edge.replaces
              ? JSON.stringify(links.get(edge.replaces.id)) === JSON.stringify(edge.replaces)
              : !pairs.has(connectionKey(edge))),
        )
        .map((edge) => ({ ...edge, sourceLabel: byId.get(edge.source), targetLabel: byId.get(edge.target) })),
    }
  }
  const start = ({ body, response }) => {
    if (typeof body?.seedId !== 'string') throw invalid('Choose an enrolled device.')
    response.status = 202
    return service().start(body.seedId)
  }
  const schedule = ({ store, body }) => {
    const intervalMinutes = body?.intervalMinutes
    if (
      !Number.isInteger(intervalMinutes) ||
      (intervalMinutes !== 0 && (intervalMinutes < 15 || intervalMinutes > 1440))
    )
      throw invalid('Choose an interval from 15 to 1,440 minutes, or turn it off.')
    if (intervalMinutes && !service().seeds().includes(body.seedId))
      throw invalid('Choose an enrolled device in scope.')
    return store.dynamics.setSchedule({ seedId: intervalMinutes ? body.seedId : '', intervalMinutes })
  }
  const cancel = ({ id }) => service().cancel(id)
  const get = ({ id, store }) => view(store, service().get(id))
  const review =
    (status) =>
    ({ store, id, body, audit, source, ip, role }) => {
      const run = service().get(id)
      if (body?.baseRevision !== store.revision()) throw invalid('The saved map changed.', 409)
      const proposalIds = body?.ids
      if (
        !Array.isArray(proposalIds) ||
        !proposalIds.length ||
        proposalIds.length > 2000 ||
        proposalIds.some((value) => typeof value !== 'string' || !/^[a-f\d]{64}$/.test(value))
      )
        throw invalid('Choose discovery proposals.')
      if (status === 'rejected') return { reviewed: service().review(id, proposalIds, status).length }
      const chosen = new Set(proposalIds)
      const selected = run.links.filter((link) => chosen.has(link.id) && link.status === 'proposed')
      const selectedDevices = run.devices.filter((device) => chosen.has(device.id) && device.status === 'proposed')
      const topology = store.read().topology
      const byKey = new Map(run.devices.map((device) => [device.chassisKey, device]))
      const byId = new Map()
      const matches = body.matches ?? {}
      const resolve = (key) => {
        const device = byKey.get(key)
        if (!device || !actualType(device.type)) throw invalid('Choose a router or switch proposal.')
        const saved = topology.nodes.find((node) => node.chassisKey === key)
        const enrolled = topology.nodes.find((node) => node.id === device.enrolledId)
        if (enrolled?.chassisKey && enrolled.chassisKey !== key)
          throw invalid('The reported chassis conflicts with the saved device.', 409)
        if (saved && enrolled && saved.id !== enrolled.id)
          throw invalid('The chassis is already assigned to a different saved device.', 409)
        const suggestion = topology.nodes.filter((node) => node.data.ip && device.addresses.includes(node.data.ip))
        const selectedMatch = Object.hasOwn(matches, device.id) ? matches[device.id] : null
        const confirmed = selectedMatch && suggestion.find((node) => node.id === selectedMatch && !node.chassisKey)
        if (!saved && !enrolled && suggestion.length && !confirmed)
          throw invalid('Confirm the address match before saving this proposal.', 409)
        const existing = saved ?? enrolled ?? confirmed
        if (!existing && device.status === 'rejected') throw invalid('This device proposal was rejected.', 409)
        const newNode = {
          id: deviceId(key),
          type: device.type,
          position: { x: 0, y: 0 },
          data: {
            label: device.label || (device.type === 'router' ? 'Discovered router' : 'Discovered switch'),
            ip: '',
            description: '',
          },
        }
        const node = { ...(existing ?? newNode), chassisKey: key }
        const previous = byId.get(node.id)
        if (previous?.chassisKey && previous.chassisKey !== key)
          throw invalid('Two chassis claim the same saved device.', 409)
        byId.set(node.id, node)
        return node.id
      }
      for (const device of selectedDevices) resolve(device.chassisKey)
      const edges = selected.map((link) => {
        if (link.confidence === 'conflict')
          throw invalid('Resolve the reported conflict before adding this connection.')
        const source = resolve(link.source)
        const target = resolve(link.target)
        if (source === target) throw invalid('The proposal resolves to a single saved device.', 409)
        return {
          id: 'lldp-' + link.id,
          source,
          target,
          label: link.sourceProtocol === 'both' ? 'LLDP + CDP' : 'LLDP',
          uplink: { label: '', source: draftPort(link.sourcePort), target: draftPort(link.targetPort) },
        }
      })
      if (selected.length + selectedDevices.length !== chosen.size)
        throw invalid('Some proposals have already changed.', 409)
      const draft = { nodes: [...byId.values()], edges }
      if (body.preview === true) return { draft }
      service().review(id, proposalIds, status)
      audit?.record('topology_proposal_accepted', { source, ip, role })
      return { draft }
    }
  const hint = ({ store, id, body }) => {
    const current = store.read()
    if (body?.baseRevision !== current.revision) throw invalid('The saved map changed.', 409)
    const edge = store.topologyHints().find((row) => row.id === id)
    if (!edge) throw invalid('This connection proposal has expired.', 404)
    const nodes = current.topology.nodes.filter((node) => [edge.source, edge.target].includes(node.id))
    if (nodes.length !== 2) throw invalid('A device in this proposal changed.', 409)
    const { replaces, ...link } = edge
    if (!replaces) return { draft: { nodes, edges: [link] } }
    if (JSON.stringify(current.topology.edges.find(({ id }) => id === replaces.id)) !== JSON.stringify(replaces))
      throw invalid('This connection changed. Review the latest port hint.', 409)
    return { draft: { nodes, edges: [{ ...link, id: replaces.id }], replaceEdges: [replaces] } }
  }
  return { read, start, get, cancel, schedule, accept: review('accepted'), reject: review('rejected'), hint }
}
