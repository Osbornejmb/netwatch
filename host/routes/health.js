export function health({ store, collector, interfaces, discovery }) {
  store.read()
  return {
    apiVersion: 1,
    ready: true,
    collector: collector?.snapshot() ?? { state: 'not-implemented' },
    interfaces: interfaces?.snapshot() ?? { state: 'disabled' },
    discovery: discovery?.snapshot() ?? { state: 'disabled' },
  }
}
