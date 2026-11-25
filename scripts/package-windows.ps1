param([Parameter(Mandatory = $true)][string]$Compiler)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Compiler = (Resolve-Path -LiteralPath $Compiler).Path
if (-not $env:SystemRoot) { throw 'Build the Windows installer on Windows.' }

function Invoke-BuildCommand($Executable, [string[]]$Arguments) {
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Executable exited with code $LASTEXITCODE." }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  $nodeVersion = Invoke-BuildCommand node @('--version')
  if ($nodeVersion -notmatch '^v\d+\.\d+\.\d+$' -or [version]$nodeVersion.Substring(1) -lt [version]'22.13.0') {
    throw 'Use a released Node.js version 22.13 or newer.'
  }
  $version = (Get-Content -Raw package.json | ConvertFrom-Json).version
  if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Use a three-part Windows installer version in package.json.' }
  $tools = (New-Item -ItemType Directory -Force (Join-Path $root '.tools')).FullName
  $output = (New-Item -ItemType Directory -Force (Join-Path $tools 'release')).FullName
  $installerName = "NetWatch-$version-Windows-x64-Setup.exe"
  $installer = Join-Path $output $installerName
  if (Test-Path -LiteralPath $installer) { throw "Build $version already exists. Bump the package version before building another installer." }
  $stage = (New-Item -ItemType Directory (Join-Path $tools ('package-' + [guid]::NewGuid()))).FullName
  $payload = (New-Item -ItemType Directory (Join-Path $stage 'payload')).FullName

  try {
    Invoke-BuildCommand npm.cmd @('run', 'build')
    Copy-Item -Path host,src,dist,package.json,package-lock.json,LICENSE -Destination $payload -Recurse
    Push-Location $payload
    try { Invoke-BuildCommand npm.cmd @('ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund') }
    finally { Pop-Location }

    $archiveName = "node-$nodeVersion-win-x64.zip"
    $archive = Join-Path $stage $archiveName
    $release = "https://nodejs.org/dist/$nodeVersion"
    $sums = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 45 "$release/SHASUMS256.txt").Content
    $expected = @($sums -split '\r?\n' | Where-Object { ($_ -split '\s+')[1] -eq $archiveName })
    if ($expected.Count -ne 1) { throw 'Windows x64 Node.js checksum is missing.' }
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 "$release/$archiveName" -OutFile $archive
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne ($expected[0] -split '\s+')[0]) {
      throw 'Windows x64 Node.js checksum failed.'
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    try {
      $zipRoot = [IO.Path]::GetFileNameWithoutExtension($archiveName)
      [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry("$zipRoot/node.exe"), (Join-Path $payload 'node.exe'))
      [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry("$zipRoot/LICENSE"), (Join-Path $payload 'NODE-LICENSE.txt'))
    } finally { $zip.Dispose() }

    Push-Location $payload
    try {
      Invoke-BuildCommand '.\node.exe' @('--input-type=module', '--eval', "import './host/server.js'; import './host/snmp-collector.js'")
    } finally { Pop-Location }

    $csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    $assemblyInfo = Join-Path $stage 'AssemblyInfo.cs'
    Set-Content -LiteralPath $assemblyInfo -Encoding ascii -Value @(
      "[assembly: System.Reflection.AssemblyFileVersion(`"$version.0`")]",
      "[assembly: System.Reflection.AssemblyInformationalVersion(`"$version`")]"
    )
    Invoke-BuildCommand $csc @('/nologo', '/target:winexe', '/define:PACKAGED', "/out:$payload\NetWatch.exe",
      ('/win32icon:' + (Join-Path $root 'desktop\NetWatch.ico')),
      '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
      (Join-Path $root 'desktop\NetWatch.cs'), $assemblyInfo)
    $helpers = (New-Item -ItemType Directory (Join-Path $payload 'helpers')).FullName
    Invoke-BuildCommand $csc @('/nologo', '/target:exe', "/out:$helpers\ping.exe", (Join-Path $root 'host\windows-ping.cs'))
    Invoke-BuildCommand $csc @('/nologo', '/target:exe', "/out:$helpers\secrets.exe", '/reference:System.Security.dll',
      (Join-Path $root 'host\windows-secrets.cs'))

    Invoke-BuildCommand $Compiler @('/Qp', "/DNetWatchVersion=$version", "/DNetWatchPayload=$payload",
      "/DNetWatchOutput=$stage", (Join-Path $root 'desktop\NetWatch.iss'))
    Move-Item -LiteralPath (Join-Path $stage $installerName) -Destination $installer
    Get-FileHash -LiteralPath $installer -Algorithm SHA256
  } finally {
    $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
    if ([IO.Path]::GetDirectoryName($resolvedStage) -eq $tools -and [IO.Path]::GetFileName($resolvedStage) -match '^package-[a-f0-9-]{36}$') {
      Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
  }
} finally { Pop-Location }
