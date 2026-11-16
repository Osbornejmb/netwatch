param([Parameter(Mandatory = $true)][string]$Directory)

$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
Import-Module (Join-Path $env:PSModulePath 'Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
$Directory = [IO.Directory]::CreateDirectory($Directory).FullName
$computer = [Net.Dns]::GetHostName()
if ($computer -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]*$') { throw 'Unsupported computer name.' }
$privateIPs = [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
  Where-Object OperationalStatus -eq Up |
  ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
  ForEach-Object { $_.Address.ToString() } |
  Where-Object { $_ -match '^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)' } |
  Sort-Object -Unique
$names = @("DNS=$computer", 'IPAddress=127.0.0.1') + @($privateIPs | ForEach-Object { "IPAddress=$_" })
$identity = $names -join '&'
$public = Join-Path $Directory 'NetWatch-connection.cer'
$private = Join-Path $Directory 'netwatch.pfx'
$namesFile = Join-Path $Directory 'addresses.txt'

$existing = $null
if (Test-Path -LiteralPath $public) {
  try { $existing = [Security.Cryptography.X509Certificates.X509Certificate2]::new($public) } catch {}
}
if ($existing -and (Test-Path -LiteralPath $private) -and (Test-Path -LiteralPath $namesFile) -and
    (Get-Content -LiteralPath $namesFile -Raw).Trim() -eq $identity -and $existing.NotAfter -gt (Get-Date).AddDays(30)) {
  $stored = $null
  $matches = $false
  try {
    $stored = [Security.Cryptography.X509Certificates.X509Certificate2]::new($private, '', 'EphemeralKeySet')
    $matches = $stored.HasPrivateKey -and $stored.Thumbprint -eq $existing.Thumbprint
  } catch {} finally { if ($stored) { $stored.Dispose() } }
  if ($matches) { return }
}

$cert = New-SelfSignedCertificate -Type SSLServerAuthentication -Subject "CN=$computer" `
  -FriendlyName 'NetWatch connection' -TextExtension "2.5.29.17={text}$identity" `
  -CertStoreLocation 'Cert:\CurrentUser\My' -KeyLength 2048 -KeyExportPolicy Exportable -HashAlgorithm SHA256
try {
  $staged = Join-Path $Directory ($cert.Thumbprint + '.cer')
  [IO.File]::WriteAllBytes($staged, $cert.RawData)
  $pfx = $cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx, '')
  [IO.File]::WriteAllBytes($private + '.new', $pfx)
  if (Test-Path -LiteralPath $private) { [IO.File]::Replace($private + '.new', $private, [NullString]::Value) }
  else { [IO.File]::Move($private + '.new', $private) }
  Move-Item -LiteralPath $staged -Destination $public -Force
  Set-Content -LiteralPath $namesFile -Value $identity -Encoding ascii
} finally {
  Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($cert.Thumbprint)" -DeleteKey -Confirm:$false
  Remove-Item -LiteralPath $staged,($private + '.new') -Force -ErrorAction SilentlyContinue
}
