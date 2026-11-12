let sequence = 0

// Inventory identifiers only; never use these as authentication tokens.
export function createId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi?.getRandomValues === 'function') {
    return Array.from(cryptoApi.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('')
  }
  return `${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}`
}
