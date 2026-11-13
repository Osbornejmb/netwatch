import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, relative, isAbsolute } from 'node:path'
import { invalid, MAX_BODY } from './store.js'

function readBody(req) {
  return new Promise((resolve,reject)=>{
    const chunks=[];let bytes=0;let rejected=false
    req.on('data',chunk=>{
      bytes+=chunk.length
      if(bytes>MAX_BODY) {rejected=true;chunks.length=0;return}
      if(!rejected) chunks.push(chunk)
    })
    req.on('end',()=>{if(rejected)reject(invalid('Payload exceeds 5 MB.',413));else resolve(Buffer.concat(chunks).toString('utf8'))})
    req.on('error',()=>reject(invalid('Request interrupted.')))
  })
}

export function createHost(store, { port = 4317, dist = resolve('dist'), collector } = {}) {
  const server = http.createServer(async (req,res) => {
    const send = (status,body) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))}
    try {
      const authority = `127.0.0.1:${port === 0 ? server.address().port : port}`
      if (req.headers.host !== authority) throw invalid('Unexpected host.',403)
      if (req.headers.origin && req.headers.origin !== `http://${authority}`) throw invalid('Unexpected origin.',403)
      if (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) throw invalid('Cross-site requests are disabled.',403)
      const url = new URL(req.url,`http://${authority}`)
      if (req.method==='GET' && url.pathname==='/api/v1/health') {store.read();return send(200,{apiVersion:1,ready:true,collector:collector?.snapshot() ?? {state:'not-implemented'}})}
      if (req.method==='GET' && url.pathname==='/api/v1/topology') return send(200,store.read())
      if (req.method==='GET' && url.pathname==='/api/v1/snapshot') {const snapshot=store.snapshot();const status=collector?.snapshot();if(status){snapshot.collector=status;snapshot.freshness=status.freshness}return send(200,snapshot)}
      const incidents = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/incidents$/)
      if (req.method==='GET' && incidents) return send(200,store.incidents(decodeURIComponent(incidents[1]),{limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):25,before:url.searchParams.has('before')?Number(url.searchParams.get('before')):undefined}))
      const history = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/checks$/)
      if (req.method==='GET' && history) return send(200,store.history(decodeURIComponent(history[1]),{limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):50,before:url.searchParams.has('before')?Number(url.searchParams.get('before')):undefined}))
      if (req.method==='PUT' && url.pathname==='/api/v1/topology') {
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw invalid('Use application/json.',415)
        if (req.headers['x-netwatch-write'] !== '1') throw invalid('Explicit write header required.',403)
        const raw=await readBody(req)
        let body
        try { body=JSON.parse(raw) } catch {throw invalid('Invalid JSON.')}
        return send(200,store.write(body,body?.baseRevision))
      }
      if (url.pathname.startsWith('/api/') || req.method!=='GET') throw invalid('Route not found.',404)
      const file = resolve(dist, `.${decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)}`)
      if (relative(dist,file).startsWith('..') || isAbsolute(relative(dist,file))) throw invalid('Route not found.',404)
      let data
      try {data=await readFile(file)} catch {throw invalid('Build not found. Run npm run build.',404)}
      res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'})[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(data)
    } catch(e) {send(e.status ?? 500,{error:{code:e.status===409?'revision_conflict':!e.status?'internal_error':'request_rejected',message:!e.status?'Host request failed.':e.message}})}
  })
  server.requestTimeout=15000
  server.headersTimeout=10000
  server.maxHeadersCount=50
  return server
}
