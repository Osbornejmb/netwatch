import { readFile } from 'node:fs/promises'
import { resolve, extname, relative, isAbsolute } from 'node:path'
import { invalid } from '../store.js'

export function decodePath(path) {
  try {
    return decodeURIComponent(path)
  } catch {
    throw invalid('Malformed URL.')
  }
}

export async function serveStatic({ dist, url, res, writeToken }) {
  const file = resolve(dist, `.${decodePath(url.pathname === '/' ? '/index.html' : url.pathname)}`)
  if (relative(dist, file).startsWith('..') || isAbsolute(relative(dist, file))) throw invalid('Route not found.', 404)
  let data
  try {
    data = await readFile(file)
  } catch {
    throw invalid('Build not found. Run npm run build.', 404)
  }
  const staticPath = relative(dist, file).replaceAll('\\', '/')
  const index = staticPath === 'index.html'
  if (index)
    data = data
      .toString('utf8')
      .replace(
        /<head(?:\s[^>]*)?>/i,
        (head) => head + '<meta name="netwatch-write-token" content="' + writeToken + '">',
      )
  res.writeHead(200, {
    ...(index ? { 'Cache-Control': 'no-store' } : {}),
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
}
