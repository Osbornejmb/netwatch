export function readTopology({ store }) {
  return store.read()
}

export function writeTopology({ store, body }) {
  return store.write(body, body?.baseRevision)
}
