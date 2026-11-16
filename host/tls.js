import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { createSecureContext } from 'node:tls'

export function readTlsOptions(
  certPath = process.env.NETWATCH_TLS_CERT,
  keyPath = process.env.NETWATCH_TLS_KEY,
  dist = resolve('dist'),
  pfxPath = process.env.NETWATCH_TLS_PFX,
) {
  if (certPath === undefined && keyPath === undefined && pfxPath === undefined) return
  if (pfxPath && (certPath !== undefined || keyPath !== undefined))
    throw new Error('Choose one HTTPS certificate setup.')
  if (!pfxPath && (!certPath || !keyPath))
    throw new Error('Set both NETWATCH_TLS_CERT and NETWATCH_TLS_KEY to enable HTTPS.')
  const privatePath = pfxPath || keyPath
  if (existsSync(dist) && existsSync(privatePath)) {
    const locations = [relative(dist, privatePath), relative(realpathSync(dist), realpathSync(privatePath))]
    if (locations.some((location) => !isAbsolute(location) && location !== '..' && !location.startsWith('..' + sep)))
      throw new Error('Keep the HTTPS private key outside the static build directory.')
  }
  try {
    const options = {
      ...(pfxPath ? { pfx: readFileSync(pfxPath) } : { cert: readFileSync(certPath), key: readFileSync(keyPath) }),
      minVersion: 'TLSv1.2',
    }
    createSecureContext(options)
    return options
  } catch {
    throw new Error('Unable to load the HTTPS certificate and key.')
  }
}
