import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, relative, isAbsolute } from 'node:path'
import { invalid, MAX_BODY } from './store.js'
import { loopbackUrl, readPort } from './port.js'
import { health } from './routes/health.js'
import { readTopology, writeTopology } from './routes/topology.js'
import { snapshot } from './routes/snapshot.js'
import { listDiscovered, scanNow, clearDiscovered, addDiscoveredToMap, removeDiscovered } from './routes/discovered.js'
import { deviceChecks, deviceIncidents, deviceInterfaces } from './routes/devices.js'

function decodePath(path) {
  try {
    return decodeURIComponent(path)
  } catch {
    throw invalid('Malformed URL.')
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    req.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY) {
        req.pause()
        chunks.length = 0
        reject(invalid('Payload exceeds 5 MB.', 413))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => reject(invalid('Request interrupted.')))
  })
}

function requireJson(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw invalid('Use application/json.', 415)
}

async function parseBody(req, bodyType) {
  if (!bodyType) return
  if (bodyType !== 'json') {
    if ((Number(req.headers['content-length']) || 0) > 0 || req.headers['transfer-encoding'])
      throw invalid(bodyType + ' requests do not accept a body.')
    return
  }
  const raw = await readBody(req)
  try {
    return JSON.parse(raw)
  } catch {
    throw invalid('Invalid JSON.')
  }
}

export function createHost(
  store,
  { port = readPort(), dist = resolve('dist'), collector, interfaces, discovery } = {},
) {
  const routes = [
    { method: 'GET', pattern: /^\/api\/v1\/health$/, handler: health },
    { method: 'GET', pattern: /^\/api\/v1\/topology$/, handler: readTopology },
    { method: 'PUT', pattern: /^\/api\/v1\/topology$/, handler: writeTopology, requiresWrite: true, bodyType: 'json' },
    { method: 'GET', pattern: /^\/api\/v1\/snapshot$/, handler: snapshot },
    { method: 'GET', pattern: /^\/api\/v1\/discovered$/, handler: listDiscovered },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/discovered\/scan-now$/,
      handler: scanNow(discovery),
      requiresWrite: true,
      bodyType: 'Scan',
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/discovered\/clear$/,
      handler: clearDiscovered,
      requiresWrite: true,
      bodyType: 'Clear',
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/discovered\/([^/]+)\/add-to-map$/,
      handler: addDiscoveredToMap,
      requiresWrite: true,
      bodyType: 'json',
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/discovered\/([^/]+)\/remove$/,
      handler: removeDiscovered,
      requiresWrite: true,
      bodyType: 'json',
    },
    { method: 'GET', pattern: /^\/api\/v1\/devices\/([^/]+)\/checks$/, handler: deviceChecks },
    { method: 'GET', pattern: /^\/api\/v1\/devices\/([^/]+)\/incidents$/, handler: deviceIncidents },
    { method: 'GET', pattern: /^\/api\/v1\/devices\/([^/]+)\/interfaces$/, handler: deviceInterfaces },
  ]
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(JSON.stringify(body))
    }
    try {
      const origin = loopbackUrl(port === 0 ? server.address().port : port)
      if (req.headers.host !== origin.slice('http://'.length)) {
        if (/^(?:localhost|\[::1\])(?::\d+)?$/i.test(req.headers.host ?? '')) throw invalid('Use ' + origin + '.', 403)
        throw invalid('Unexpected host.', 403)
      }
      if (req.headers.origin && req.headers.origin !== origin) throw invalid('Unexpected origin.', 403)
      if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))
        throw invalid('Cross-site requests are disabled.', 403)
      let url
      try {
        url = new URL(req.url, origin)
      } catch {
        throw invalid('Malformed URL.')
      }
      for (const { method, pattern, handler, requiresWrite, bodyType } of routes) {
        if (req.method !== method) continue
        const match = pattern.exec(url.pathname)
        if (!match) continue
        // PUT topology has historically checked its media type before the write header.
        if (method === 'PUT') requireJson(req)
        if (requiresWrite && req.headers['x-netwatch-write'] !== '1')
          throw invalid('Explicit write header required.', 403)
        if (method !== 'PUT' && bodyType === 'json') requireJson(req)
        const body = await parseBody(req, bodyType)
        const id = match[1] === undefined ? undefined : decodePath(match[1])
        return send(200, await handler({ store, collector, interfaces, discovery, url, id, body }))
      }
      if (url.pathname.startsWith('/api/') || req.method !== 'GET') throw invalid('Route not found.', 404)
      const file = resolve(dist, `.${decodePath(url.pathname === '/' ? '/index.html' : url.pathname)}`)
      if (relative(dist, file).startsWith('..') || isAbsolute(relative(dist, file)))
        throw invalid('Route not found.', 404)
      let data
      try {
        data = await readFile(file)
      } catch {
        throw invalid('Build not found. Run npm run build.', 404)
      }
      const staticPath = relative(dist, file).replaceAll('\\', '/')
      res.writeHead(200, {
        ...(staticPath === 'index.html' ? { 'Cache-Control': 'no-cache' } : {}),
        ...(/^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(staticPath)
          ? { 'Cache-Control': 'public, max-age=31536000, immutable' }
          : {}),
        'Content-Type':
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.ico': 'image/x-icon',
            '.woff2': 'font/woff2',
            '.json': 'application/json',
            '.map': 'application/json',
          }[extname(file)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      })
      res.end(data)
    } catch (e) {
      if (e.status === 413) {
        res.setHeader('Connection', 'close')
        res.once('finish', () => req.socket.destroySoon())
      }
      send(e.status ?? 500, {
        error: {
          code: e.status === 409 ? 'revision_conflict' : !e.status ? 'internal_error' : 'request_rejected',
          message: !e.status ? 'Host request failed.' : e.message,
        },
      })
    }
  })
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.maxHeadersCount = 50
  return server
}
