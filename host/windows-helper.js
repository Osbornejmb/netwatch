import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as filesystem from 'node:fs'
import { resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ICMP_POLICY } from './icmp-policy.js'

// No SDK/npm/native add-on download. Windows .NET Framework v4 supplies csc.exe.
export function prepareWindowsHelper({
  directory = resolve('data', 'collector'),
  execute = execFile,
  fs = filesystem,
  systemRoot = process.env.SystemRoot || 'C:\\Windows',
  arch = process.arch,
  kind = 'ping',
} = {}) {
  if (!['ping', 'secrets'].includes(kind)) return Promise.reject(new Error('Unknown Windows helper'))
  const source = fileURLToPath(new URL(`./windows-${kind}.cs`, import.meta.url))
  const hashFile = (path) => createHash('sha256').update(fs.readFileSync(path)).digest('hex')
  const hash = hashFile(source).slice(0, 24)
  const helper = resolve(directory, `${kind}-${hash}.exe`)
  const sidecar = helper + '.sha256'
  if (fs.existsSync(helper)) {
    if (fs.existsSync(sidecar) && fs.readFileSync(sidecar, 'utf8').trim() === hashFile(helper))
      return Promise.resolve(helper)
    fs.rmSync(helper, { force: true })
    fs.rmSync(sidecar, { force: true })
  }
  fs.mkdirSync(directory, { recursive: true })
  const compiler = win32.join(
    systemRoot,
    'Microsoft.NET',
    arch === 'ia32' ? 'Framework' : 'Framework64',
    'v4.0.30319',
    'csc.exe',
  )
  const temporary = resolve(directory, `${kind}-${hash}-${process.pid}.building.exe`)
  const temporaryHash = temporary + '.sha256'
  return new Promise((resolvePromise, reject) => {
    execute(
      compiler,
      [
        '/nologo',
        '/target:exe',
        `/out:${temporary}`,
        ...(kind === 'secrets' ? ['/reference:System.Security.dll'] : []),
        source,
      ],
      {
        shell: false,
        windowsHide: true,
        timeout: kind === 'secrets' ? 15000 : ICMP_POLICY.processTimeoutMs,
        maxBuffer: 4096,
      },
      (error) => {
        try {
          if (error) throw new Error('Windows ICMP helper compiler is unavailable or blocked.')
          fs.writeFileSync(temporaryHash, hashFile(temporary) + '\n')
          fs.renameSync(temporary, helper)
          fs.renameSync(temporaryHash, sidecar)
          resolvePromise(helper)
        } catch (error) {
          reject(error)
        } finally {
          fs.rmSync(temporary, { force: true })
          fs.rmSync(temporaryHash, { force: true })
        }
      },
    )
  })
}
