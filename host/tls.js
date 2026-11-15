import { readFileSync } from 'node:fs'
import { createSecureContext } from 'node:tls'

export function readTlsOptions(certPath = process.env.NETWATCH_TLS_CERT, keyPath = process.env.NETWATCH_TLS_KEY) {
  if (certPath === undefined && keyPath === undefined) return
  if (!certPath || !keyPath) throw new Error('Set both NETWATCH_TLS_CERT and NETWATCH_TLS_KEY to enable HTTPS.')
  try {
    const options = { cert: readFileSync(certPath), key: readFileSync(keyPath), minVersion: 'TLSv1.2' }
    createSecureContext(options)
    return options
  } catch {
    throw new Error('Unable to load the HTTPS certificate and key.')
  }
}
