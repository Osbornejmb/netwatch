import http from 'node:http'
import https from 'node:https'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import { invalid, MAX_BODY } from './store.js'
import { loopbackUrl, readPort } from './port.js'
import { decodePath, serveStatic } from './routes/static.js'
import { admitRequest } from './lan.js'
import { exportAudit, readAudit } from './routes/audit.js'
import { authLogin, authLogout, authSession } from './routes/auth.js'
import { health } from './routes/health.js'
import { readTopology, writeTopology } from './routes/topology.js'
import { createSnapshotRoute } from './routes/snapshot.js'
import { createSnapshotEvents } from './routes/events.js'
import { listDiscovered, scanNow, clearDiscovered, addDiscoveredToMap, removeDiscovered } from './routes/discovered.js'
import { deviceChecks, deviceIncidents, deviceInterfaces } from './routes/devices.js'
import { applyNeighbor, readNeighbors } from './routes/neighbors.js'
import { discoveryRoutes } from './routes/topology-discovery.js'

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

export function createRoutes(discovery, eventOptions, topologyDiscovery) {
  const snapshot = createSnapshotRoute(randomUUID())
  const topology = discoveryRoutes(topologyDiscovery)
  return [
    { method: 'GET', pattern: /^\/api\/v1\/audit$/, handler: readAudit, access: 'local' },
    { method: 'GET', pattern: /^\/api\/v1\/audit\/export$/, handler: exportAudit, access: 'local' },
    { method: 'GET', pattern: /^\/api\/v1\/auth\/session$/, handler: authSession, access: 'public' },
    { method: 'POST', pattern: /^\/api\/v1\/auth\/login$/, handler: authLogin, access: 'public', bodyType: 'json' },
    { method: 'POST', pattern: /^\/api\/v1\/auth\/logout$/, handler: authLogout, access: 'public', bodyType: 'Logout' },
    { method: 'GET', pattern: /^\/api\/v1\/health$/, handler: health, access: 'viewer' },
    { method: 'GET', pattern: /^\/api\/v1\/topology$/, handler: readTopology, access: 'admin' },
    {
      method: 'PUT',
      pattern: /^\/api\/v1\/topology$/,
      handler: writeTopology,
      auditAction: 'topology_applied',
      access: 'admin',
      requiresWrite: true,
      bodyType: 'json',
    },
    { method: 'GET', pattern: /^\/api\/v1\/snapshot$/, handler: snapshot, access: 'viewer' },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/events$/,
      handler: createSnapshotEvents(snapshot, eventOptions),
      access: 'viewer',
    },
    { method: 'GET', pattern: /^\/api\/v1\/discovered$/, handler: listDiscovered, access: 'admin' },
    { method: 'GET', pattern: /^\/api\/v1\/discovery\/runs$/, handler: topology.read, access: 'admin' },
    { method: 'GET', pattern: /^\/api\/v1\/discovery\/runs\/([^/]+)$/, handler: topology.get, access: 'admin' },
    ...[
      ['runs', topology.start, 'topology_discovery_started', 'json'],
      ['schedule', topology.schedule, 'topology_discovery_schedule', 'json'],
      ['runs/([^/]+)/cancel', topology.cancel, 'topology_discovery_cancelled'],
      ['runs/([^/]+)/accept', topology.accept, null, 'json'],
      ['runs/([^/]+)/reject', topology.reject, 'topology_proposal_rejected', 'json'],
      ['hints/([^/]+)/accept', topology.hint, null, 'json'],
    ].map(([path, handler, auditAction, bodyType]) => ({
      method: 'POST',
      pattern: new RegExp('^/api/v1/discovery/' + path + '$'),
      handler,
      auditAction,
      bodyType,
      access: 'admin',
      requiresWrite: true,
    })),
    {
      method: 'POST',
      pattern: /^\/api\/v1\/discovered\/scan-now$/,
      handler: scanNow(discovery),
      auditAction: 'discovery_scan',
      access: 'admin',
      requiresWrite: true,
      bodyType: 'Scan',
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/discovered\/clear$/,
      handler: clearDiscovered,
      auditAction: 'discovery_clear',
      access: 'admin',
      requiresWrite: true,
      bodyType: 'Clear',
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/discovered(?:\/([^/]+))?\/add-to-map$/,
      handler: addDiscoveredToMap,
      auditAction: 'discovery_add',
      access: 'admin',
      requiresWrite: true,
      bodyType: 'json',
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/discovered\/([^/]+)\/remove$/,
      handler: removeDiscovered,
      auditAction: 'discovery_remove',
      access: 'admin',
      requiresWrite: true,
      bodyType: 'json',
    },
    { method: 'GET', pattern: /^\/api\/v1\/devices\/([^/]+)\/checks$/, handler: deviceChecks, access: 'viewer' },
    { method: 'GET', pattern: /^\/api\/v1\/devices\/([^/]+)\/incidents$/, handler: deviceIncidents, access: 'viewer' },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/devices\/([^/]+)\/interfaces$/,
      handler: deviceInterfaces,
      access: 'viewer',
    },
    { method: 'GET', pattern: /^\/api\/v1\/devices\/([^/]+)\/neighbors$/, handler: readNeighbors, access: 'admin' },
    {
      method: 'PUT',
      pattern: /^\/api\/v1\/devices\/([^/]+)\/neighbors$/,
      handler: applyNeighbor,
      auditAction: 'topology_proposal_accepted',
      access: 'admin',
      requiresWrite: true,
      bodyType: 'json',
    },
    { method: 'GET', pattern: /^(?!\/api\/)/, handler: serveStatic, access: 'public' },
  ]
}

export function createHost(
  store,
  {
    port = readPort(),
    dist = resolve('dist'),
    collector,
    interfaces,
    discovery,
    infrastructureOnly = false,
    topologyDiscovery,
    routes = createRoutes(discovery, undefined, topologyDiscovery),
    lanAuthorities,
    auth,
    audit,
    tls,
    remoteAddress = (req) => req.socket.remoteAddress,
  } = {},
) {
  const writeToken = randomBytes(32).toString('hex')
  const expectedToken = Buffer.from(writeToken, 'hex')
  const scheme = tls ? 'https' : 'http'
  const request = async (req, res) => {
    if (tls) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    const send = (status, body, headers) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...headers,
      })
      res.end(JSON.stringify(body))
    }
    try {
      const origin = loopbackUrl(port === 0 ? server.address().port : port, scheme)
      const authorities = new Set([origin.slice(scheme.length + 3), ...(lanAuthorities?.() ?? [])])
      const ip = remoteAddress(req)
      const source = admitRequest(req, origin, authorities, ip)
      if (source === 'remote' && !auth?.enabled()) throw invalid('Remote access is unavailable.', 403)
      const session = source === 'remote' ? auth.inspect(req) : undefined
      const role = source === 'local' ? 'admin' : session?.role
      let url
      try {
        url = new URL(req.url, origin)
      } catch {
        throw invalid('Malformed URL.')
      }
      for (const { method, pattern, handler, requiresWrite, bodyType, access, auditAction } of routes) {
        if (req.method !== method) continue
        const match = pattern.exec(url.pathname)
        if (!match) continue
        if (source === 'remote' && access !== 'public') {
          if (access === 'local') throw invalid('Change this on the NetWatch PC.', 403)
          if (!role) throw invalid('Sign in to NetWatch.', 401)
          if (access === 'admin' && role !== 'admin') {
            if (auditAction)
              audit?.record('viewer_write_blocked', {
                source,
                ip,
                role,
                detail: auditAction,
              })
            throw invalid('This session does not have permission.', 403)
          }
        }
        if (requiresWrite && source === 'remote' && !auth.validWrite(session, req.headers['x-netwatch-write'])) {
          audit?.record('write_token_rejected', { source, ip, role })
          throw invalid('Valid write token required. Reload NetWatch and try again.', 403)
        }
        if (requiresWrite && source === 'local') {
          const token = req.headers['x-netwatch-write']
          if (
            typeof token !== 'string' ||
            !/^[0-9a-f]{64}$/.test(token) ||
            !timingSafeEqual(Buffer.from(token, 'hex'), expectedToken)
          )
            throw invalid('Valid write token required. Reload NetWatch and try again.', 403)
        }
        if (bodyType === 'json') requireJson(req)
        const body = await parseBody(req, bodyType)
        const id = match[1] === undefined ? undefined : decodePath(match[1])
        const response = {}
        const result = await handler({
          store,
          source,
          role,
          ip,
          session,
          auth,
          audit,
          collector,
          interfaces,
          discovery,
          infrastructureOnly,
          url,
          id,
          body,
          requestHeaders: req.headers,
          response,
          dist,
          res,
          streamAuthorized: () => source === 'local' || (auth.enabled() && auth.inspect(req, false)?.role === role),
          writeToken: source === 'local' ? writeToken : undefined,
        })
        if (auditAction) audit?.record(auditAction, { source, ip, role })
        if (res.headersSent || res.destroyed) return
        return send(response.status ?? 200, result, response.headers)
      }
      throw invalid('Route not found.', 404)
    } catch (e) {
      if (e.status === 413 || e.message === 'Unexpected client address.') {
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
  }
  const server = tls ? https.createServer({ ...tls, minVersion: 'TLSv1.2' }, request) : http.createServer(request)
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.maxHeadersCount = 50
  return server
}
