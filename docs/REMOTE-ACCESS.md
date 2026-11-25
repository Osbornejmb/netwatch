# Remote access

NetWatch listens on loopback by default. Enable private-network sharing on the NetWatch PC before opening the dashboard from another PC. Other PCs need only a browser.

The installer's sharing option keeps the dashboard on this PC at `http://127.0.0.1:4317`. Other PCs use HTTPS and trust a copy of this NetWatch PC's connection file. Keep NetWatch private and never port-forward its port.

## Access and limits

| Access | What it permits |
| --- | --- |
| Remote viewer | Dashboard, status filters, device map and details, check history, outages and ports. Open viewer mode shares this data with any admitted client without a password. |
| Remote admin | Viewer features plus map editing and transfer, Devices, discovery review, browser map backups and imports, and per-device check controls. Admin sign-in always requires a password. |
| Loopback admin | Current local dashboard behavior without sign-in. The access log, SNMP credential management, password and viewer policy changes, launcher options, database maintenance and restore, and stopping the host remain local. |

NetWatch binds 127.0.0.1 and, when enabled, the PC's non-internal RFC1918 IPv4 addresses. It rejects socket peers outside loopback or the private ranges. Routed private clients can still qualify, so use Windows Firewall rules if you need to restrict access to particular networks. The listener leaves public addresses unbound. Clients connect directly because the host does not trust forwarding headers. The NetWatch PC's loopback URL always remains local admin. On the NetWatch PC, use its private URL to exercise the remote role workflow.

Admin sessions expire after 30 minutes idle or 12 hours total. Viewer sessions expire after eight hours idle or seven days total. At most five admin and 20 viewer sessions are active. New sessions at the cap evict the oldest. Open viewer mode creates a new viewer session when the dashboard loads after sign-out.

## Windows installer setup

Use installer 0.1.1 or newer. Leave the sharing option clear if you only use NetWatch on this PC.

1. **On the NetWatch PC**, install NetWatch and select **Set up access from another PC on my private network**. Choose **Require a viewing password** or **No viewer password**. With no password, anyone on the private network who can reach NetWatch can view the read-only dashboard. Setup prepares the connection file and keeps existing passwords for future use.
2. Open NetWatch from the Start menu and click **Start**. If Windows asks about firewall access, choose **Private networks**.
3. Open **Remote access** and choose **Save connection file**. **On the viewing PC**, open the saved `NetWatch-connection.cer` and choose **Install Certificate → Current User → Place all certificates in the following store**. Browse to **Trusted Root Certification Authorities** and finish. Only trust the connection file you saved from your own NetWatch PC.
4. Back on the NetWatch PC, use **Copy URL** in **Remote access**. Open that address in a browser on the viewing PC. If prompted, enter the viewing password and choose **View dashboard**. Only the host PC needs NetWatch installed.

For read-only sign-in on an existing installation, set **Viewers** to **Password** in **Remote access** and use **Set viewer password** if needed. Use **Set admin password** on the host only if someone needs to edit the map remotely.

If you skipped setup, check **Allow other PCs on this network** in the launcher. If your PC's address changes or the browser reports an expired certificate, stop NetWatch and choose **Remote access → Set up or repair sharing**. If the setup creates a new connection file, install the new copy on the viewing PC. Turn off **Allow other PCs on this network** to use the dashboard on this PC only.

## Manual Windows launcher setup

Use this path for a source checkout or your own certificate. On the NetWatch PC, quit any old tray instance. Install the current launcher from the checkout if needed.

   ~~~powershell
   npm.cmd ci
   npm.cmd run build
   npm.cmd run desktop:setup -- --desktop-shortcut
   ~~~

1. Configure [Direct HTTPS](#direct-https), then start the launcher from the PowerShell window with the certificate and key settings. Open **Remote access** and set an admin password. Use a unique password of 12–128 characters. Pick **Password**, **Open (no password)** or **Disabled** under **Viewers**. Set a different viewer password for Password mode.
2. Enable **Allow other PCs on this network**, then click **Start**. If Windows asks about firewall access for Node, allow **Private networks** only. The launcher runs without elevation and does not edit firewall rules.
3. Open **Remote access** again and copy a reachable URL. Paste it into the second PC's browser. Prefer a resolvable hostname covered by your certificate, or reserve the private address with your router's DHCP settings.

## Terminal setup and operations

Stop the tray host first. Set both [HTTPS file settings](#direct-https) in the same terminal before enabling LAN sharing. Use its database path if you want to share its existing inventory.

~~~powershell
$env:NETWATCH_DB = Join-Path $env:LOCALAPPDATA 'NetWatch\data\netwatch.sqlite'
npm.cmd run auth -- set-admin-password
npm.cmd run auth -- set-viewer-password
npm.cmd run auth -- viewer-mode password
npm.cmd run auth -- status
$env:NETWATCH_LAN = '1'
npm.cmd start
~~~

Password prompts are masked. Rotate passwords by running the same commands or using the launcher. Rotation and viewer policy changes revoke remote sessions. Use **Sign out all remote sessions** in the launcher or stop the host and run the command below. Use the local Dashboard's **Access log** button or the launcher to review recent entries. The API retains up to 5,000 records for up to 30 days.

If you forget the admin password, use **Set admin password** on the NetWatch PC. If the launcher is unavailable, stop NetWatch, select its existing database with `NETWATCH_DB`, run `npm.cmd run auth -- set-admin-password`, and restart. The new password replaces the old one and all remote sessions are revoked. The inventory and history stay in that database.

On the NetWatch PC, open **Access log → Download redacted log** to save a JSON file containing recognized event names, timestamps, roles and local or remote origin. The export excludes IP addresses, free-form details and credentials.

~~~powershell
npm.cmd run auth -- revoke-sessions
~~~

After restarting the host, query the local access log from another terminal on the NetWatch PC.

~~~powershell
curl.exe https://127.0.0.1:4317/api/v1/audit
~~~

An open local editor can refresh its write token when saving after a host restart. An offline restore clears sessions. Replacing a database keeps its current passwords, viewer policy, and access log. Restoring to a new path starts with remote access disabled and retains the backup access log. Protect the database and its backups because they contain hashes, inventory and the access log.

## Direct HTTPS

These steps are for manual certificate setup. If you used the installer's sharing option, use the connection file from **Remote access**. Launching the packaged app with both `NETWATCH_TLS_CERT` and `NETWATCH_TLS_KEY` set selects your own certificate for that run.

On the NetWatch PC, create a certificate that covers every URL you intend to use, including the launcher's loopback URL. Use your organization's private CA or a local CA such as [mkcert](https://github.com/FiloSottile/mkcert). With mkcert installed, run `ipconfig /all` on the NetWatch host and select the private IPv4 of the adapter reachable by viewing PCs; run `hostname` for its actual name (or use an approved DNS name resolving to that IP). The loopback address is fixed and should remain. Obtain the actual LAN URL from the launcher after starting the host. The new directory lives outside the checkout.

~~~powershell
$certDir = Join-Path $env:LOCALAPPDATA 'NetWatch\tls'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$hostIPv4 = Read-Host 'Private NetWatch host IPv4 from ipconfig /all'
$hostNameForCert = Read-Host 'Actual host name or approved DNS name'
mkcert -install
mkcert -cert-file (Join-Path $certDir 'netwatch.pem') -key-file (Join-Path $certDir 'netwatch-key.pem') 127.0.0.1 $hostIPv4 $hostNameForCert
$env:NETWATCH_TLS_CERT = Join-Path $certDir 'netwatch.pem'
$env:NETWATCH_TLS_KEY = Join-Path $certDir 'netwatch-key.pem'
~~~

Quit any open launcher, then open it from that terminal so it inherits both variables. Click **Start** in the launcher to run the host.

~~~powershell
Start-Process (Join-Path $env:LOCALAPPDATA 'Programs\NetWatch\NetWatch.exe')
~~~

For a source install, use `NetWatch\NetWatch.exe` under `LOCALAPPDATA`.

HTTPS replaces HTTP on the same port for both loopback and LAN listeners. The host accepts TLS 1.2 or later and sends Secure session cookies and HSTS. An unreadable file, incomplete pair, or invalid certificate/key prevents startup.

On each Windows viewing PC, verify the CA certificate came from the NetWatch PC, then import only the public *rootCA.pem* from the directory reported by *mkcert -CAROOT*. Keep *rootCA-key.pem* and the NetWatch server key private. Trusting the CA lets it authenticate other sites as well. Your organization may require a managed trust store or separate browser import.

~~~powershell
certutil.exe -user -addstore Root C:\Path\To\rootCA.pem
$hostUrl = Read-Host 'Exact HTTPS URL shown in the NetWatch launcher'
Start-Process $hostUrl
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

On the NetWatch PC, quit the installed tray app and set both HTTPS file settings. Make a disposable launcher and database by running these commands in one PowerShell window. This setup omits the desktop shortcut and leaves the installed launcher and its database in place.

~~~powershell
$netwatchOriginalAppData = $env:LOCALAPPDATA
$env:LOCALAPPDATA = Join-Path $env:TEMP ('NetWatch-QA-' + [guid]::NewGuid())
try {
  npm.cmd run desktop:setup
  Start-Process (Join-Path $env:LOCALAPPDATA 'NetWatch\NetWatch.exe')
} finally { $env:LOCALAPPDATA = $netwatchOriginalAppData }
~~~

Verify the launcher opens with the host stopped and starts only after you click **Start**. Leave ICMP and active discovery off during authentication tests. Verify the checkbox persists after Quit and reopen, the two password fields mask text and reject underlength or mismatched entries, and a new host with no admin password shows a warning. Verify the firewall prompt is Private only, the session list and access log update, and **Sign out all remote sessions** invalidates the second PC's admin session. Inspect listener addresses with these commands.

~~~powershell
Get-NetConnectionProfile
Get-NetTCPConnection -State Listen -LocalPort 4317 | Select-Object LocalAddress, LocalPort
curl.exe -sS https://127.0.0.1:4317/api/v1/auth/session
curl.exe -sS https://127.0.0.1:4317/api/v1/audit
node --test tests/lan.test.js tests/sessions.test.js tests/tls.test.js
~~~

Expect localhost and private IPv4 listeners only. The LAN tests inject public socket peers and prove that forwarding headers cannot make a public peer private. If you have an isolated routed lab client that already has a nonprivate source address, use curl with its bound source address and expect 403 if the firewall permits the connection. Do not open an internet route for this test. A routed RFC1918 client is eligible by design.

~~~powershell
$labSource = Read-Host 'Existing authorized nonprivate lab client IPv4 from ipconfig /all'
$hostUrl = Read-Host 'Exact reachable HTTPS URL shown by the NetWatch launcher'
curl.exe --interface $labSource -sS -i "$($hostUrl.TrimEnd('/'))/api/v1/health"
~~~

On the second PC, supply the exact HTTPS URL copied from the launcher on the host PC. Open it as viewer, inspect the Dashboard and device details, and confirm each restricted hash returns to Dashboard. Sign in as admin to open Edit map and apply an inventory change to the disposable database, then sign out. Run the browser test from a checkout with Chromium available, using only disposable test passwords. In Open viewer mode omit NETWATCH_VIEWER_PASSWORD.

~~~powershell
$env:NETWATCH_URL = Read-Host 'Exact HTTPS URL copied from the NetWatch launcher'
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

The anonymous topology request returns 401 and the unexpected Host request returns 403. To test write denial with curl as an authenticated viewer, read the viewer session cookie value from the browser's cookie inspector on the disposable host. Enter it with PowerShell 7's masked prompt. Use the __Host-netwatch_session cookie. Pipe the config to curl so the cookie is kept out of URLs and command-line arguments.

~~~powershell
$cookie = Read-Host 'Disposable viewer cookie value' -MaskInput
$cookieName = '__Host-netwatch_session'
try {
  ('cookie = "{0}={1}"' -f $cookieName,$cookie) | curl.exe --config - -sS -o NUL -w '%{http_code}' -X PUT -H 'Content-Type: application/json' --data '{}' "$env:NETWATCH_URL/api/v1/topology"
  ('cookie = "{0}={1}"' -f $cookieName,$cookie) | curl.exe --config - -sS -o NUL -w '%{http_code}' -X POST "$env:NETWATCH_URL/api/v1/discovered/clear"
} finally { Remove-Variable cookie }
~~~

Both writes should return 403. The browser check also verifies that an admin can apply a revision-checked edit and that the next protected request after logout returns 401.
