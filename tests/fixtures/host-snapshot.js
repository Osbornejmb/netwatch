import { validateTopology } from '../../src/topology.js'

// Browser QA only. These observations never reach the collector or saved inventory.
export function hostSnapshot(network, checks = {}, revision = 1) {
  const topology = validateTopology(network)
  return {
    generatedAt: new Date().toISOString(), collector: { state: 'disabled' }, freshness: { staleAfterMs: 90000 },
    inventory: { revision, topology, monitoring: Object.fromEntries(topology.nodes.map(node => [node.id, Boolean(node.data.ip)])) },
    observations: Object.entries(checks).map(([deviceId, check]) => ({ deviceId, ...check })),
  }
}
