import { normalizeAddress } from './inventory.js'
import { connectionKey } from './connections.js'

export const STORAGE_KEY = 'netwatch-topology-v1'

export function validateTopology(value) {
  if (value?.schemaVersion !== undefined && value.schemaVersion !== 1)
    throw new Error('Unsupported topology schema version.')
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error('A topology must contain nodes and edges arrays.')
  }
  if (value.nodes.length > 2000 || value.edges.length > 10000) {
    throw new Error('This editor supports up to 2,000 devices and 10,000 links.')
  }
  const ids = new Set()
  const addresses = new Set()
  const nodes = value.nodes.map((node) => {
    if (
      !node ||
      typeof node.id !== 'string' ||
      !node.id ||
      ids.has(node.id) ||
      !['router', 'switch'].includes(node.type) ||
      !Number.isFinite(node.position?.x) ||
      !Number.isFinite(node.position?.y) ||
      typeof node.data?.label !== 'string' ||
      !node.data.label.trim() ||
      node.data.label.length > 100 ||
      (node.data.ip !== undefined && (typeof node.data.ip !== 'string' || node.data.ip.length > 253)) ||
      (node.data.description !== undefined &&
        (typeof node.data.description !== 'string' || node.data.description.length > 500))
    ) {
      throw new Error('Invalid device: check unique IDs, type, position, and text fields.')
    }
    const ip = normalizeAddress(node.data.ip || '')
    if (ip && addresses.has(ip)) throw new Error('Duplicate management address in topology.')
    if (ip) addresses.add(ip)
    ids.add(node.id)
    return {
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: { label: node.data.label.trim(), ip, description: node.data.description || '' },
    }
  })
  const edgeIds = new Set()
  const routerIds = new Set(nodes.filter((node) => node.type === 'router').map((node) => node.id))
  const routerLinks = new Map()
  const edges = value.edges.map((edge) => {
    if (
      !edge ||
      typeof edge.id !== 'string' ||
      !edge.id ||
      edgeIds.has(edge.id) ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      edge.source === edge.target ||
      (edge.label !== undefined && (typeof edge.label !== 'string' || edge.label.length > 100)) ||
      ['sourceHandle', 'targetHandle'].some(
        (key) => edge[key] != null && (typeof edge[key] !== 'string' || edge[key].length > 100),
      )
    ) {
      throw new Error('Invalid link: check unique IDs and existing, distinct endpoints.')
    }
    edgeIds.add(edge.id)
    if (routerIds.has(edge.source) || routerIds.has(edge.target)) routerLinks.set(edge.id, edge)
    const uplink = edge.uplink === undefined ? undefined : validateUplink(edge.uplink)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label || 'Link',
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      ...(uplink && { uplink }),
    }
  })
  const groups = value.groups === undefined ? [] : value.groups
  if (!Array.isArray(groups) || groups.length > 100) throw new Error('Invalid redundancy groups.')
  const groupIds = new Set()
  const cleanGroups = groups.map((group) => {
    if (
      !group ||
      typeof group.id !== 'string' ||
      !group.id ||
      group.id.length > 100 ||
      groupIds.has(group.id) ||
      typeof group.name !== 'string' ||
      !group.name.trim() ||
      group.name.length > 80 ||
      !Array.isArray(group.links) ||
      group.links.length < 2 ||
      group.links.length > 16 ||
      new Set(group.links).size !== group.links.length ||
      group.links.some((id) => !routerLinks.has(id))
    )
      throw new Error('Each redundancy group needs a name and 2–16 distinct router links.')
    const links = group.links.map((id) => routerLinks.get(id))
    const routers = new Set(links.flatMap(({ source, target }) => [source, target]).filter((id) => routerIds.has(id)))
    if (routers.size < 2 || new Set(links.map(connectionKey)).size !== links.length)
      throw new Error('Choose different connections that include at least two routers.')
    groupIds.add(group.id)
    return { id: group.id, name: group.name.trim(), links: [...group.links] }
  })
  return { schemaVersion: 1, nodes, edges, ...(cleanGroups.length && { groups: cleanGroups }) }
}

export function validateUplink(value) {
  const text = (input) => {
    if (typeof input !== 'string' || input.length > 80 || /[\p{Cc}\p{Cf}]/u.test(input))
      throw new Error('Use labels of up to 80 characters.')
    return input.trim()
  }
  const port = (input) => {
    if (
      !input ||
      (input.index !== null && (!Number.isInteger(input.index) || input.index < 1 || input.index > 2147483647))
    )
      throw new Error('Use a valid interface index.')
    return { label: text(input.label), index: input.index }
  }
  const uplink = { label: text(value?.label), source: port(value.source), target: port(value.target) }
  return uplink.label || uplink.source.label || uplink.target.label || uplink.source.index || uplink.target.index
    ? uplink
    : undefined
}

export function readTopology(storage, fallback) {
  let raw
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return {
      topology: fallback,
      recovery: { raw: null },
      error:
        'Browser storage could not be read. Autosave is paused. Export the visible map before reloading; allow storage access and reload to recover the original saved content.',
    }
  }
  try {
    return { topology: raw === null ? fallback : validateTopology(JSON.parse(raw)), recovery: null, error: '' }
  } catch {
    return {
      topology: fallback,
      recovery: { raw },
      error:
        'Saved map could not be loaded. Autosave is paused to preserve it. A fallback map was loaded instead of the saved original. Download the original saved content before replacing it.',
    }
  }
}

export function writeTopology(storage, topology) {
  storage.setItem(STORAGE_KEY, JSON.stringify(validateTopology(topology)))
}
