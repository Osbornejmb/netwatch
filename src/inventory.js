// Literal addresses only. WHATWG URL supplies IPv6 validation and RFC 5952-style
// compression; IPv4 is checked first to reject legacy short/octal/hex forms.
export function normalizeAddress(value) {
  const address = value.trim()
  if (!address) return ''
  if (!address.includes(':')) {
    const parts = address.split('.')
    if (parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)) return address
  } else if (/^[\da-f:.]+$/i.test(address)) {
    try {
      const host = new URL(`http://[${address}]/`).hostname
      if (host.startsWith('[') && host.endsWith(']')) return host.slice(1, -1)
    } catch { /* report the same field error for all invalid literals */ }
  }
  throw new Error('Enter an IPv4 or IPv6 address, or leave it empty for an unmonitored device.')
}

export function deviceFields(fields, nodes, currentId) {
  const label = fields.label.trim()
  if (!label || label.length > 100) throw new Error('Enter a device name of 1–100 characters.')
  const ip = normalizeAddress(fields.ip)
  if (ip && nodes.some(node => node.id !== currentId && normalizeAddress(node.data.ip || '') === ip)) {
    throw new Error('This management address is already assigned to another device.')
  }
  const description = fields.description.trim()
  if (description.length > 500) throw new Error('Keep the description within 500 characters.')
  return { label, ip, description }
}
