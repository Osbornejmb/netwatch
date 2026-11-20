export function createSnapshotEvents(
  snapshot,
  { intervalMs = 200, heartbeatMs = 20000, maxClients = 32, maxPerIp = 4 } = {},
) {
  const clients = new Set()
  let timer
  let heartbeatAt

  function update() {
    const heartbeat = Date.now() >= heartbeatAt
    if (heartbeat) heartbeatAt = Date.now() + heartbeatMs
    const frames = new Map()
    for (const client of clients) {
      const { context } = client
      try {
        if (!context.streamAuthorized()) {
          if (context.res.writableNeedDrain) context.res.destroy()
          else context.res.end()
          client.remove()
          continue
        }
        if (context.res.writableNeedDrain) {
          client.blockedAt ??= Date.now()
          if (Date.now() - client.blockedAt >= heartbeatMs) context.res.destroy()
          continue
        }
        client.blockedAt = undefined
        const key = JSON.stringify([context.role, client.tag])
        if (!frames.has(key)) frames.set(key, frame(context, client.tag))
        const next = frames.get(key)
        if (next.data) {
          context.res.write(next.data)
          client.tag = next.tag
        }
        if (heartbeat && !context.res.writableNeedDrain)
          context.res.write(`: heartbeat\nevent: clock\ndata: ${Date.now()}\n\n`)
      } catch {
        context.res.destroy()
      }
    }
  }

  function frame(context, tag) {
    const response = {}
    const value = snapshot({ ...context, response, requestHeaders: { 'if-none-match': tag } })
    const next = response.headers.ETag
    const id = next.slice(3, -1)
    return { tag: next, data: value && `id: ${id}\nevent: snapshot\ndata: ${JSON.stringify(value)}\n\n` }
  }

  return (context) => {
    const { res, ip, requestHeaders, response } = context
    if (clients.size >= maxClients || [...clients].filter((client) => client.context.ip === ip).length >= maxPerIp) {
      response.status = 429
      response.headers = { 'Retry-After': '10' }
      return { error: { code: 'stream_limit', message: 'Live connections are busy. Try again shortly.' } }
    }
    const initial = frame(context)
    const resumed = requestHeaders['last-event-id'] === initial.tag.slice(3, -1)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    })
    const client = {
      context,
      tag: initial.tag,
      remove() {
        clients.delete(client)
        if (!clients.size) {
          clearInterval(timer)
          timer = undefined
        }
      },
    }
    clients.add(client)
    res.once('close', client.remove)
    if (!timer) {
      heartbeatAt = Date.now() + heartbeatMs
      timer = setInterval(update, intervalMs)
      timer.unref()
    }
    res.write((resumed ? ': resumed\n\n' : '') + initial.data)
  }
}
