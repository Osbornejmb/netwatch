import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ICMP_POLICY } from './icmp-policy.js'

// No SDK/npm/native add-on download. Windows .NET Framework v4 supplies csc.exe.
export function prepareWindowsHelper({ directory = resolve('data','collector'), execute = execFile, systemRoot = process.env.SystemRoot || 'C:\\Windows', arch = process.arch, kind = 'ping' } = {}) {
  if(!['ping','secrets'].includes(kind))return Promise.reject(new Error('Unknown Windows helper'))
  const source = fileURLToPath(new URL(`./windows-${kind}.cs`,import.meta.url))
  const hash = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0,24)
  const helper = resolve(directory,`${kind}-${hash}.exe`)
  if (existsSync(helper)) return Promise.resolve(helper)
  mkdirSync(directory,{recursive:true})
  const compiler = win32.join(systemRoot,'Microsoft.NET',arch === 'ia32' ? 'Framework' : 'Framework64','v4.0.30319','csc.exe')
  const temporary = resolve(directory,`${kind}-${hash}-${process.pid}.building.exe`)
  return new Promise((resolvePromise,reject)=>{
    execute(compiler,['/nologo','/target:exe',`/out:${temporary}`,...(kind==='secrets'?['/reference:System.Security.dll']:[]),source],{shell:false,windowsHide:true,timeout:ICMP_POLICY.processTimeoutMs,maxBuffer:4096},error=>{
      try {
        if(error) throw new Error('Windows ICMP helper compiler is unavailable or blocked.')
        renameSync(temporary,helper)
        resolvePromise(helper)
      } catch(error) {reject(error)} finally {rmSync(temporary,{force:true})}
    })
  })
}
