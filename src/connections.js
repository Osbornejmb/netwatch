export const connectionKey = ({ source, target }) =>
  JSON.stringify(source < target ? [source, target] : [target, source])

export function physicalConnectionKey(edge) {
  const source = edge.uplink?.source.index
  const target = edge.uplink?.target.index
  if (!source || !target) return connectionKey(edge)
  const ends = [
    [edge.source, source],
    [edge.target, target],
  ]
  if (edge.source > edge.target) ends.reverse()
  return JSON.stringify(ends)
}

// Keep one stable representative without rewriting IDs or discarding imported records.
export function uniqueConnections(edges) {
  const pairs = new Map()
  for (const edge of edges) {
    const key = physicalConnectionKey(edge)
    if (!pairs.has(key) || edge.id < pairs.get(key).id) pairs.set(key, edge)
  }
  return [...pairs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
