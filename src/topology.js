import { normalizeAddress } from './inventory.js'

export const STORAGE_KEY = 'netwatch-topology-v1'

export function validateTopology(value) {
  if (value?.schemaVersion !== undefined && value.schemaVersion !== 1) throw new Error('Unsupported topology schema version.')
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error('A topology must contain nodes and edges arrays.')
  }
  if (value.nodes.length > 2000 || value.edges.length > 10000) {
    throw new Error('This editor supports up to 2,000 devices and 10,000 links.')
  }
  const ids = new Set()
  const addresses = new Set()
  const nodes = value.nodes.map(node => {
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id) ||
      !['router', 'switch'].includes(node.type) ||
      !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y) ||
      typeof node.data?.label !== 'string' || !node.data.label.trim() ||
      node.data.label.length > 100 ||
      (node.data.ip !== undefined && (typeof node.data.ip !== 'string' || node.data.ip.length > 253)) ||
      (node.data.description !== undefined && (typeof node.data.description !== 'string' || node.data.description.length > 500))) {
      throw new Error('Invalid device: check unique IDs, type, position, and text fields.')
    }
    const ip = normalizeAddress(node.data.ip || '')
    if (ip && addresses.has(ip)) throw new Error('Duplicate management address in topology.')
    if (ip) addresses.add(ip)
    ids.add(node.id)
    return { id: node.id, type: node.type, position: { x: node.position.x, y: node.position.y },
      data: { label: node.data.label.trim(), ip, description: node.data.description || '' } }
  })
  const edgeIds = new Set()
  const edges = value.edges.map(edge => {
    if (!edge || typeof edge.id !== 'string' || !edge.id || edgeIds.has(edge.id) ||
      !ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target ||
      (edge.label !== undefined && (typeof edge.label !== 'string' || edge.label.length > 100)) ||
      ['sourceHandle', 'targetHandle'].some(key => edge[key] != null && (typeof edge[key] !== 'string' || edge[key].length > 100))) {
      throw new Error('Invalid link: check unique IDs and existing, distinct endpoints.')
    }
    edgeIds.add(edge.id)
    return { id: edge.id, source: edge.source, target: edge.target, label: edge.label || 'Link',
      sourceHandle: edge.sourceHandle ?? null, targetHandle: edge.targetHandle ?? null }
  })
  return { schemaVersion: 1, nodes, edges }
}

export function readTopology(storage, fallback) {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return { topology: raw === null ? fallback : validateTopology(JSON.parse(raw)), error: '' }
  } catch {
    return { topology: fallback, error: 'Saved map could not be loaded. Autosave is paused to preserve it. Export your map before replacing the saved data.' }
  }
}

export function writeTopology(storage, topology) {
  storage.setItem(STORAGE_KEY, JSON.stringify(validateTopology(topology)))
}
