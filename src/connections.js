export const connectionKey = ({ source, target }) => JSON.stringify(source < target ? [source, target] : [target, source])

// Keep one stable representative without rewriting IDs or discarding imported records.
export function uniqueConnections(edges) {
  const pairs = new Map()
  for (const edge of edges) {
    const key = connectionKey(edge)
    if (!pairs.has(key) || edge.id < pairs.get(key).id) pairs.set(key, edge)
  }
  return [...pairs.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
