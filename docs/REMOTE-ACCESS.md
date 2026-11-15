# Remote access

NetWatch listens on loopback by default. Enable private-network sharing on the NetWatch PC before opening the dashboard from another PC. Other PCs need only a browser.

NetWatch serves the dashboard over HTTP by default. Anyone able to intercept traffic can read passwords, session cookies, CSRF tokens, device addresses and dashboard data. Use direct HTTPS before signing in on a network you do not fully trust. Keep NetWatch private and never port-forward its port.

## Access and limits

| Access | What it permits |
| --- | --- |
| Remote viewer | Dashboard, status filters, device map and details, check history, outages and ports. Open viewer mode shares this data with any admitted client without a password. |
| Remote operator | Viewer features plus the Devices list, discovery results and **Scan now**. Operators use a separate password. Operator scans leave the saved map untouched. |
| Remote admin | Viewer features plus map editing and transfer, Devices, discovery review, browser map backups and imports, and per-device check controls. Admin sign-in always requires a password. |
| Loopback admin | Current local dashboard behavior without sign-in. The access log, SNMP credential management, password and viewer policy changes, launcher options, database maintenance and restore, and stopping the host remain local. |

NetWatch binds 127.0.0.1 and, when enabled, the PC's non-internal RFC1918 IPv4 addresses. It rejects socket peers outside loopback or the private ranges. Routed private clients can still qualify, so use Windows Firewall rules if you need to restrict access to particular networks. The listener leaves public addresses unbound. Clients connect directly because the host does not trust forwarding headers. The NetWatch PC's loopback URL always remains local admin. On the NetWatch PC, use its private URL to exercise the remote role workflow.

Admin and operator sessions expire after 30 minutes idle or 12 hours total. Viewer sessions expire after eight hours idle or seven days total. At most five admin, five operator and 20 viewer sessions are active. New sessions at the cap evict the oldest. Open viewer mode creates a new viewer session when the dashboard loads after sign-out.

## Windows launcher setup

1. On the NetWatch PC, quit any old tray instance, build the dashboard, and install the current launcher.

   ~~~powershell
   npm.cmd ci
   npm.cmd run build
   npm.cmd run desktop:setup -- --desktop-shortcut
   Start-Process (Join-Path $env:LOCALAPPDATA 'NetWatch\NetWatch.exe')
   ~~~

2. Open **Remote access** and set an admin password. Use a unique password of 12–128 characters. Pick **Password**, **Open (no password)** or **Disabled** under **Viewers**. Set a different viewer password for Password mode.
3. Enable **Allow other PCs on this network**, then click **Start**. If Windows asks about firewall access for Node, allow **Private networks** only. The launcher runs without elevation and does not edit firewall rules.
4. Open **Remote access** again and copy a reachable URL. Paste it into the second PC's browser. Prefer a resolvable hostname covered by your certificate, or reserve the private address with your router's DHCP settings.

## Terminal setup and operations

Stop the tray host first. Use its database path if you want to share its existing inventory.

~~~powershell
$env:NETWATCH_DB = Join-Path $env:LOCALAPPDATA 'NetWatch\data\netwatch.sqlite'
npm.cmd run auth -- set-admin-password
npm.cmd run auth -- set-viewer-password
npm.cmd run auth -- set-operator-password
npm.cmd run auth -- viewer-mode password
npm.cmd run auth -- status
$env:NETWATCH_LAN = '1'
npm.cmd start
~~~

Password prompts are masked. Rotate passwords by running the same commands or using the launcher. Rotation and viewer policy changes revoke remote sessions. Use **Sign out all remote sessions** in the launcher or stop the host and run the command below. Use the local Dashboard's **Access log** button or the launcher to review recent entries. The API retains up to 5,000 records for up to 30 days.

Set an operator password from **Remote access → Set operator password**, then choose **Operator sign in** from the remote browser. Use **Disable operator access** or `npm.cmd run auth -- disable-operator` to clear the credential and revoke remote sessions. Operator access is disabled until configured.

If you forget the admin password, use **Set admin password** on the NetWatch PC. If the launcher is unavailable, stop NetWatch, select its existing database with `NETWATCH_DB`, run `npm.cmd run auth -- set-admin-password`, and restart. The new password replaces the old one and all remote sessions are revoked. The inventory and history stay in that database.

On the NetWatch PC, open **Access log → Download redacted log** to save a JSON file containing recognized event names, timestamps, roles and local or remote origin. The export excludes IP addresses, free-form details and credentials.

~~~powershell
npm.cmd run auth -- revoke-sessions
~~~

After restarting the host, query the local access log from another terminal on the NetWatch PC.

~~~powershell
curl.exe http://127.0.0.1:4317/api/v1/audit
~~~

Reopen the browser after a host restart to refresh the admin write token. Database restore clears sessions and may restore older password hashes and viewer policy from the backup. Check the configuration before turning LAN sharing back on. Protect the database and its backups because they contain hashes, inventory and the access log.

## Direct HTTPS

On the NetWatch PC, create a certificate that covers every URL you intend to use, including the launcher's loopback URL. Use your organization's private CA or a local CA such as [mkcert](https://github.com/FiloSottile/mkcert). With mkcert installed, replace the example IP and hostname below with the actual private IP and name. The new directory lives outside the checkout.

~~~powershell
$certDir = Join-Path $env:LOCALAPPDATA 'NetWatch\tls'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
mkcert -install
mkcert -cert-file (Join-Path $certDir 'netwatch.pem') -key-file (Join-Path $certDir 'netwatch-key.pem') 127.0.0.1 192.168.1.20 netwatch-pc
$env:NETWATCH_TLS_CERT = Join-Path $certDir 'netwatch.pem'
$env:NETWATCH_TLS_KEY = Join-Path $certDir 'netwatch-key.pem'
~~~

Start NetWatch from that terminal, or quit and reopen the launcher from that terminal so it inherits both variables. HTTPS replaces HTTP on the same port for both loopback and LAN listeners. The host accepts TLS 1.2 or later and sends Secure session cookies and HSTS. An unreadable file, incomplete pair, or invalid certificate/key prevents startup.

On each Windows viewing PC, verify the CA certificate came from the NetWatch PC, then import only the public *rootCA.pem* from the directory reported by *mkcert -CAROOT*. Keep *rootCA-key.pem* and the NetWatch server key private. Trusting the CA lets it authenticate other sites as well. Your organization may require a managed trust store or separate browser import.

~~~powershell
certutil.exe -user -addstore Root C:\Path\To\rootCA.pem
Start-Process 'https://192.168.1.20:4317'
~~~

Use a URL covered by the certificate and shown by the launcher. If you move the host to a new IP, use its covered hostname or issue a new certificate. Browsers remember HSTS for the hostname, so switching an existing deployment back to HTTP may require clearing its HSTS state or waiting for it to expire.

Caddy or IIS can manage certificate renewal and termination in deployments designed around a trusted reverse proxy. NetWatch's built-in setup requires browsers to reach the host directly. It uses the actual socket peer and ignores all X-Forwarded-* headers. A proxy reaching the loopback listener would be treated as local admin, so do not put that listener behind Caddy, IIS, or another HTTP proxy.

## Troubleshooting

- **403 Unexpected host.** Use a URL shown by the launcher, with the exact port. On the host PC use 127.0.0.1. A private hostname must resolve to a bound IP and appear in NETWATCH_HOSTNAMES or be the machine hostname. Restart after changing the hostname list.
- **403 Remote access is unavailable.** Enable the LAN setting, set an admin password and verify that the launcher and CLI point at the same database.
- **401 Sign in to NetWatch.** Sign in again after timeout, password rotation or session revocation. Open mode can reopen a viewer session from the sign-in screen.
- **429 Invalid credentials.** Wait the Retry-After interval before retrying. Repeated failures cause exponential delay and temporary per-address lockout. A global cooldown can affect other clients on the network.
- **Connection timed out.** Confirm both PCs can reach the same private network, the actual listen port is open on the Windows Private profile, and wireless client isolation or subnet firewalls do not block the connection.

## Verification checklist

On Linux with Node 22.13+ and OpenSSL available, run the repository checks.

~~~sh
npm ci
npm test
npm run build
npm run lint
~~~

On the NetWatch PC, quit the installed tray app. Make a disposable launcher and database by running these commands in one PowerShell window. This setup omits the desktop shortcut and leaves the installed launcher and its database in place.

~~~powershell
$netwatchOriginalAppData = $env:LOCALAPPDATA
$env:LOCALAPPDATA = Join-Path $env:TEMP ('NetWatch-QA-' + [guid]::NewGuid())
try {
  npm.cmd run desktop:setup
  Start-Process (Join-Path $env:LOCALAPPDATA 'NetWatch\NetWatch.exe')
} finally { $env:LOCALAPPDATA = $netwatchOriginalAppData }
~~~

Leave ICMP and active discovery off during authentication tests. Verify the checkbox persists after Quit and reopen, the two password fields mask text and reject underlength or mismatched entries, and a new host with no admin password shows a warning. Verify the firewall prompt is Private only, the session list and access log update, and **Sign out all remote sessions** invalidates the second PC's admin session. Inspect listener addresses with these commands.

~~~powershell
Get-NetConnectionProfile
Get-NetTCPConnection -State Listen -LocalPort 4317 | Select-Object LocalAddress, LocalPort
curl.exe -sS http://127.0.0.1:4317/api/v1/auth/session
curl.exe -sS http://127.0.0.1:4317/api/v1/audit
node --test tests/lan.test.js tests/sessions.test.js tests/tls.test.js
~~~

Expect localhost and private IPv4 listeners only. The LAN tests inject public socket peers and prove that forwarding headers cannot make a public peer private. If you have an isolated routed lab client that already has a nonprivate source address, use curl with its bound source address and expect 403 if the firewall permits the connection. Do not open an internet route for this test. A routed RFC1918 client is eligible by design.

~~~powershell
curl.exe --interface 192.0.2.2 -sS -i http://192.168.1.20:4317/api/v1/health
~~~

On the second PC, replace the example URL with the copied one. Open it as viewer, inspect the Dashboard and device details, and confirm each restricted hash returns to Dashboard. Sign in as admin to open Edit map and apply an inventory change to the disposable database, then sign out. Run the browser test from a checkout with Chromium available, using only disposable test passwords. In Open viewer mode omit NETWATCH_VIEWER_PASSWORD.

~~~powershell
$env:NETWATCH_URL = 'http://192.168.1.20:4317'
foreach ($route in 'topology','inventory','discovered') { Start-Process "$env:NETWATCH_URL/#$route" }
curl.exe -sS -o NUL -w '%{http_code}' "$env:NETWATCH_URL/api/v1/topology"
curl.exe -sS -o NUL -w '%{http_code}' -H 'Host: unrelated.example:4317' "$env:NETWATCH_URL/api/v1/auth/session"
npm.cmd ci
npx.cmd playwright install chromium
$env:NETWATCH_ADMIN_PASSWORD = Read-Host 'Disposable admin password' -MaskInput
$env:NETWATCH_VIEWER_PASSWORD = Read-Host 'Disposable viewer password' -MaskInput
try { node scripts/check-remote-browser.mjs } finally {
  Remove-Item Env:NETWATCH_ADMIN_PASSWORD,Env:NETWATCH_VIEWER_PASSWORD -ErrorAction SilentlyContinue
}
~~~

The anonymous topology request returns 401 and the unexpected Host request returns 403. To test write denial with curl as an authenticated viewer, read the viewer session cookie value from the browser's cookie inspector on the disposable host. Enter it with PowerShell 7's masked prompt. Use the cookie name for your transport, netwatch_session for HTTP or __Host-netwatch_session for HTTPS. Pipe the config to curl so the cookie is kept out of URLs and command-line arguments.

~~~powershell
$cookie = Read-Host 'Disposable viewer cookie value' -MaskInput
$cookieName = 'netwatch_session'
if ($env:NETWATCH_URL.StartsWith('https://')) { $cookieName = '__Host-netwatch_session' }
try {
  ('cookie = "{0}={1}"' -f $cookieName,$cookie) | curl.exe --config - -sS -o NUL -w '%{http_code}' -X PUT -H 'Content-Type: application/json' --data '{}' "$env:NETWATCH_URL/api/v1/topology"
  ('cookie = "{0}={1}"' -f $cookieName,$cookie) | curl.exe --config - -sS -o NUL -w '%{http_code}' -X POST "$env:NETWATCH_URL/api/v1/discovered/clear"
} finally { Remove-Variable cookie }
~~~

Both writes should return 403. The browser check also verifies that an admin can apply a revision-checked edit and that the next protected request after logout returns 401.
