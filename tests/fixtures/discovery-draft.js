import { mergeDiscoveryDraft } from '../../src/discovery-draft.js'

export function applyDiscoveryPatch(store, patch) {
  const current = store.read()
  return store.write({
    source: 'inventory',
    topology: mergeDiscoveryDraft(current.topology, patch),
    monitoring: current.monitoring,
  }, current.revision)
}
