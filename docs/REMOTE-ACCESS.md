# Remote access

NetWatch serves the dashboard over HTTP by default. Anyone able to intercept traffic on that network can read passwords, session cookies, CSRF tokens, device addresses and dashboard data. Enable direct HTTPS before signing in on a network you do not fully trust. Keep LAN mode on a private network, and never port-forward the NetWatch port.

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

Start NetWatch from that terminal, or quit the tray launcher and reopen it from that terminal so it inherits both variables. HTTPS replaces HTTP on the same port for both loopback and LAN listeners. The host accepts TLS 1.2 or later and sends Secure session cookies and HSTS. An unreadable file, incomplete pair, or invalid certificate/key prevents startup.

On each Windows viewing PC, verify the CA certificate came from the NetWatch PC, then import only the public *rootCA.pem* from the directory reported by *mkcert -CAROOT*. Keep *rootCA-key.pem* and the NetWatch server key private. Trusting the CA lets it authenticate other sites as well. Your organization may require a managed trust store or separate browser import.

~~~powershell
certutil.exe -user -addstore Root C:\Path\To\rootCA.pem
Start-Process 'https://192.168.1.20:4317'
~~~

Use a URL covered by the certificate and shown by the launcher. If you move the host to a new IP, use its covered hostname or issue a new certificate. Browsers remember HSTS for the hostname, so switching an existing deployment back to HTTP may require clearing its HSTS state or waiting for it to expire.

Caddy or IIS can manage certificate renewal and termination in deployments designed around a trusted reverse proxy. NetWatch's built-in setup requires browsers to reach the host directly. It uses the actual socket peer and ignores all X-Forwarded-* headers. A proxy reaching the loopback listener would be treated as local admin, so do not put that listener behind Caddy, IIS, or another HTTP proxy.
