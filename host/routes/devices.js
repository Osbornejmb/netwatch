import { queryNumber } from './query.js'

export function deviceChecks({ store, id, url }) {
  return store.history(id, { limit: queryNumber(url, 'limit', 50), before: queryNumber(url, 'before') })
}

export function deviceIncidents({ store, id, url }) {
  return store.incidents(id, { limit: queryNumber(url, 'limit', 25), before: queryNumber(url, 'before') })
}

export function deviceInterfaces({ store, id, url, interfaces }) {
  return {
    ...store.interfaces(id, { after: queryNumber(url, 'after', 0), limit: queryNumber(url, 'limit', 50) }),
    monitoring: interfaces?.device(id) ?? { collectorState: 'disabled', staleAfterMs: 180000 },
  }
}
