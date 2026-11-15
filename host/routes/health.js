export function health({ store, collector, interfaces, discovery, role }) {
  store.read()
  const status = collector?.snapshot() ?? { state: 'not-implemented' }
  if (role === 'viewer') return { apiVersion: 1, ready: true, collector: { state: status.state } }
  return {
    apiVersion: 1,
    ready: true,
    collector: status,
    interfaces: interfaces?.snapshot() ?? { state: 'disabled' },
    discovery: discovery?.snapshot() ?? { state: 'disabled' },
  }
}
