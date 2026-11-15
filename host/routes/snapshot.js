export function snapshot({ store, collector, discovery }) {
  const result = store.snapshot()
  const status = collector?.snapshot()
  if (status) {
    result.collector = status
    result.freshness = status.freshness
  }
  result.discovery = discovery?.snapshot() ?? { state: 'disabled' }
  return result
}
