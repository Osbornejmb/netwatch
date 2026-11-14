import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if(process.platform!=='win32')throw Error('The tray launcher requires Windows.')
const shortcut=process.argv.includes('--desktop-shortcut')
if(process.argv.slice(2).some(arg=>arg!=='--desktop-shortcut'))throw Error('Usage: npm.cmd run desktop:setup -- [--desktop-shortcut]')
const execute=promisify(execFile)
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
if(!existsSync(join(root,'dist','index.html')))throw Error('Build the dashboard first: npm.cmd run build')
const directory=join(process.env.LOCALAPPDATA,'NetWatch')
mkdirSync(directory,{recursive:true})
const configuration=join(directory,'desktop.json')
let settings={node:process.execPath,root,database:join(directory,'data','netwatch.sqlite'),icmp:false,discovery:false,discoveryIcmp:false}
if(existsSync(configuration)) {
  const previous=JSON.parse(readFileSync(configuration,'utf8'))
  if(typeof previous.database!=='string'||!previous.database||typeof previous.icmp!=='boolean')throw Error('Invalid existing desktop.json; preserve it and repair before setup.')
  settings={...settings,database:resolve(previous.database),icmp:previous.icmp,discovery:previous.discovery===true,discoveryIcmp:previous.discovery===true&&previous.discoveryIcmp===true}
}
const executable=join(directory,'NetWatch.exe'),temporary=join(directory,`NetWatch-${process.pid}.exe`)
try {
 await execute(join(process.env.SystemRoot,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),[
  '/nologo','/target:winexe',`/out:${temporary}`,'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',join(root,'desktop','NetWatch.cs'),
 ],{windowsHide:true,timeout:30000,maxBuffer:65536})
 try {renameSync(temporary,executable)} catch {throw Error('Unable to update NetWatch.exe. Quit its tray app first, then run setup again.')}
 writeFileSync(configuration,JSON.stringify(settings,null,2)+'\n')
} finally {rmSync(temporary,{force:true})}
if(shortcut) {
 const script="$ErrorActionPreference='Stop';$p=[Environment]::GetFolderPath('Desktop');$s=New-Object -ComObject WScript.Shell;$f=Join-Path $p 'NetWatch.lnk';$l=$s.CreateShortcut($f);if((Test-Path -LiteralPath $f)-and($l.TargetPath -ne $env:NETWATCH_LAUNCHER_EXE)){throw 'An unrelated NetWatch.lnk already exists; nothing overwritten'};$l.TargetPath=$env:NETWATCH_LAUNCHER_EXE;$l.WorkingDirectory=Split-Path $env:NETWATCH_LAUNCHER_EXE;$l.Description='NetWatch local host controls';$l.Save()"
 await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,env:{...process.env,NETWATCH_LAUNCHER_EXE:executable},timeout:15000})
}
console.log(`Launcher: ${executable}\nData: ${settings.database}\nICMP: ${settings.icmp?'enabled':'disabled'}\nDiscovery: ${settings.discovery?'enabled':'disabled'}\nDiscovery ICMP: ${settings.discoveryIcmp?'enabled':'disabled'}\nOpen NetWatch.exe${shortcut?' or the desktop shortcut':''}. Initial setup starts with empty host inventory; existing databases are not imported or overwritten.`)
