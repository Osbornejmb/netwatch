# NetWatch setup guide

**Audience:** first-time Windows users and network administrators. **Baseline:** NetWatch v0.2.4. This guide assumes a single Windows host and local browser first; switch configuration and remote viewing are optional. No Linux production monitoring or container installation is documented.

## 1. Overview

NetWatch is a local-first network monitoring dashboard. The Windows launcher starts/stops a Node.js host; the host serves a React dashboard, stores the saved network and history in SQLite, and optionally performs ICMP reachability and read-only SNMPv3 interface checks. ICMP is the protocol used by ping. SNMPv3 is authenticated and encrypted management polling. LLDP and Cisco CDP are neighbor advertisements used to review physical links; a MAC forwarding table helps identify access ports. A draft map is a browser working copy; the monitored network is the saved host inventory. Discovery never by itself authorizes monitoring.

## 2. Requirements

| Item | Requirement |
| --- | --- |
| Host | Windows 10 or 11 x64 (Intel/AMD), signed-in Windows account, awake during monitoring; local writable data directory |
| Browser | Browser on the host; another PC is optional |
| Installer | Bundles Node, dashboard, dependencies and Windows helpers; no separate Node/npm needed |
| Source installation | Supported Node.js LTS meeting Node >=22.13; use the Node 22 LTS line at 22.13 or newer, or a supported LTS compatible with the lockfile; bundled npm; Windows .NET Framework compiler for launcher |
| Network | Reachability from host to approved devices; ICMP if desired; UDP 161 for SNMP; local dashboard TCP 4317 by default |
| Device access | Management IP and permission to monitor; authorized console/admin access for optional switch configuration |
| SNMP | Read-only SNMPv3 authPriv account per enrolled switch/router, SHA-256 where supported or SHA-1 for older IOS, AES-128 privacy |
| Database | Built-in SQLite schema 14; no separate database server/account |
| Internet | Download installer, or fetch source/dependencies; not required for ordinary local operation |

No measured minimum RAM, CPU or disk specification is published. Allow room for retained history and backups. Installer is unsigned: obtain it from the project's official release and check the checksum; follow organization policy rather than bypassing security controls.

## 3. Installation

### A. Recommended: Windows installer

**Existing installation warning:** Quit the current host and make the verified offline backup described in section 8 before upgrading. A fresh install needs no migration backup.

1. On the monitoring PC, open [GitHub releases](https://github.com/Osbornejmb/netwatch/releases/latest). For this guide's baseline, the [v0.2.4 release](https://github.com/Osbornejmb/netwatch/releases/tag/v0.2.4) includes the Windows x64 installer and SHA256SUMS.txt.
2. Download the installer and SHA256SUMS.txt into the same folder.
3. Open PowerShell in that folder and compare the installer hash to its line in the checksum file.

   ~~~powershell
   Get-FileHash -Algorithm SHA256 .\NetWatch-0.2.4-Windows-x64-Setup.exe
   Get-Content .\SHA256SUMS.txt
   ~~~

   Expected: the SHA-256 values match (case does not matter). For a different release, use that release's actual filename and matching checksum. A checksum is an integrity check, not a code signature.
4. Open the installer and follow its prompts. Leave **Set up access from another PC on my private network** unchecked for local-first setup.
5. From Windows Start, open **NetWatch**.

   Expected: launcher shows **Stopped**, Start/Stop controls and the database path. The installer normally installs under `%LOCALAPPDATA%\Programs\NetWatch`. A fresh database starts empty.

### B. Alternative: source installation (Windows)

1. Install [Node.js LTS](https://nodejs.org/en/download) and ensure the Windows .NET Framework compiler is available for launcher compilation.
2. Download the release's **Source code (zip)** from GitHub and extract it into a permanent writable folder.
3. In File Explorer open the folder containing package.json, type `powershell` in the address bar and press Enter. Check the runtime.

   ~~~powershell
   node --version
   npm.cmd --version
   ~~~

   Expected: a supported Node LTS satisfying the requirement above and a working npm.
4. Install the exact locked dependencies.

   ~~~powershell
   npm.cmd ci
   ~~~

5. Build the browser dashboard.

   ~~~powershell
   npm.cmd run build
   ~~~

   Expected: build succeeds and creates dist/index.html.
6. Quit any running NetWatch launcher before generating the source launcher.

   ~~~powershell
   npm.cmd run desktop:setup -- --desktop-shortcut
   ~~~

   Expected: command reports launcher and data paths and creates the optional desktop shortcut. Existing settings and data are preserved.
7. Open the shortcut. Keep the source directory and Node installation in place.

Developers can run `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run format:check` from the checkout. For browser-only development use `npm.cmd run dev`; this is not the production host. For the actual terminal host use `npm.cmd start` after building, with the launcher stopped. Stop it with Ctrl+C before starting the launcher. See [launcher reference](WINDOWS-LAUNCHER.md).

## 4. Configuration

### 4.1 Identify network inputs before configuring a switch

On the NetWatch host, open PowerShell:

~~~powershell
ipconfig /all
route print -4
getmac /v
~~~

On the approved Cisco IOS device, use its console:

~~~text
show ip interface brief
show vlan brief
show interfaces status
show snmp user
show snmp group
show access-lists
show snmp context
~~~

| Input | Where to get it / purpose |
| --- | --- |
| Host/source IPv4 | IPv4 of the Windows adapter reaching the device, verified by route table; this is the address permitted in SNMP ACL (access control list) |
| Target management IPv4 | Device management interface from console; use this address in the map and enrollment |
| Subnet mask and VLAN | Device SVI (switch virtual interface) configuration and network plan; VLAN is a logical Ethernet segment |
| Access/trunk interface | Actual cable path and switch interface status; trunk carries multiple VLANs |
| SNMP ACL | Actual group ACL from show snmp group; verify source permit on every switch |
| SNMP username | Exact show snmp user entry for that device; names may differ |
| Auth/privacy passphrases | Obtain securely from authorized administrator or create locally; never put real credentials into shared docs |
| VLAN context | Exact show snmp context name for the desired forwarding table; optional, not inferred from management VLAN |

No arbitrary device IP is supplied here. If assigning a new management address, obtain an unused address and mask from your administrator. If the host uses DHCP, an approved reservation can keep the ACL valid. See the complete [network input checklist](NETWORK-TROUBLESHOOTING.md) and [Cisco setup commands](../switchconfig.md).

### 4.2 Database and launcher settings

No manual database creation is needed for a fresh setup. The default launcher database is `%LOCALAPPDATA%\NetWatch\data\netwatch.sqlite`; the actual path is shown in the launcher. Preferences are stored in `%LOCALAPPDATA%\NetWatch\desktop.json`. Source terminal execution defaults to data/netwatch.sqlite relative to the working directory; set NETWATCH_DB to the actual absolute launcher path if deliberately using that inventory offline. Do not run two hosts against the same database.

On the launcher, settings apply to the next Start:

| Setting | Required? | Fresh default / recommended first run |
| --- | --- | --- |
| Check devices on next start | Only for ICMP | Off; enable for approved saved devices |
| Discover local network neighbors on next start | Only for nearby scans | Off |
| Also check local devices with ICMP (slower) | Optional active discovery | Off; only on authorized attached network |
| Check ports on next start | Only for SNMP | Off unless configured/inherited; requires per-device enrollment |
| Allow other PCs on this network | Optional LAN access | Off; leave off initially |
| VLAN context (optional) | Only for named forwarding context | Blank/default; exact switch context when needed |

### 4.3 Advanced terminal configuration

The .env.example file is a reference; NetWatch does not automatically load it. Set variables in the PowerShell session starting the terminal host. The launcher supplies saved preferences to its child process. All settings below are optional for local startup.

| Environment variable | Purpose | Default / safe value |
| --- | --- | --- |
| NETWATCH_DB | Database path | data/netwatch.sqlite for terminal; use actual displayed path for launcher data |
| NETWATCH_PORT | Local HTTP/HTTPS port | 4317; integer 1024–65535 |
| NETWATCH_ICMP | ICMP collection | 0; 1 only with approved device checks |
| NETWATCH_SNMP | Interface polling | 0; 1 only with enrolled devices |
| NETWATCH_DISCOVERY | Nearby discovery | 0 |
| NETWATCH_DISCOVERY_ICMP | Active discovery ICMP | 0 |
| NETWATCH_DISCOVERY_MAX_PREFIX | Shortest eligible discovery subnet prefix | 24; valid 16–30, bounded sweep |
| NETWATCH_LLDP_CIDRS | Additional authorized private discovery scope | Empty; obtain CIDRs from network administrator; does not authorize credentials |
| NETWATCH_LLDP_MAX_DEVICES | Crawl device limit | 200; may lower |
| NETWATCH_LLDP_MAX_DEPTH | Crawl depth | 8; may lower |
| NETWATCH_LLDP_MAX_NEIGHBORS | Crawl neighbor limit | 512; may lower |
| NETWATCH_LLDP_TIME_MS | Crawl deadline | 300000; may lower |
| NETWATCH_LINK_ERRORS_PER_SEC | Sustained error threshold | 1 |
| NETWATCH_LINK_DISCARDS_PER_SEC | Sustained discard threshold | 10 |
| NETWATCH_SNMP_PORT_CONTEXTS | Comma-separated management-IP=context pairs | Unset; use actual target address and exact context, preferably launcher |
| NETWATCH_LAN | Private LAN listening | 0; requires HTTPS when enabled |
| NETWATCH_TLS_CERT / NETWATCH_TLS_KEY | Manual HTTPS PEM paths | Unset; both required for manual TLS |
| NETWATCH_TLS_PFX | Managed HTTPS certificate path | Unset; installer-managed sharing uses it |
| NETWATCH_HOSTNAMES | Permitted hostnames | Machine hostname; configure approved names if needed |

Safe terminal local run from source root after build, with launcher stopped (fresh isolated database):

~~~powershell
$env:NETWATCH_DB = Join-Path $env:TEMP ('netwatch-setup-' + [guid]::NewGuid() + '.sqlite')
$env:NETWATCH_ICMP = '0'
$env:NETWATCH_SNMP = '0'
$env:NETWATCH_DISCOVERY = '0'
$env:NETWATCH_DISCOVERY_ICMP = '0'
$env:NETWATCH_LAN = '0'
npm.cmd start
~~~

Use a fresh terminal without inherited custom TLS/port settings for this default-URL example. Stop with Ctrl+C. This creates a disposable database, not a replacement for your real inventory.

## 5. First run

### 5.1 Start the local dashboard

1. On the host PC, open NetWatch and leave discovery, port checks and LAN sharing off initially.
2. Click **Start**. Expected: ready/running status and **Open dashboard** enabled.
3. Click **Open dashboard**. Expected: local dashboard at http://127.0.0.1:4317 with an empty map on fresh setup.

### 5.2 Add and monitor one device

1. Obtain the actual target management IP as in section 4. On the host, verify reachability.

   ~~~powershell
   $source = Read-Host 'Host IPv4 from the adapter reaching the device'
   $target = Read-Host 'Approved target management IPv4 from the device console'
   ping.exe -S $source $target
   ~~~

   Expected for an ICMP-responsive target: replies. Some devices block ICMP; this alone does not prove SNMP failure.
2. In the browser, choose **Edit map → Add device**.
3. Enter a label and the target management IP, choose verified **Switch** or **Router** type, and click **Add device**.
4. Click **Use this map**, review the replacement, then **Confirm replacement**. This changes the saved map; preserve a backup before replacing an existing inventory.
5. In the launcher, click **Stop**, enable **Check devices on next start**, then click **Start**.
6. In **Dashboard**, select the saved device and choose **Turn checks on**. Expected: a recent **Last check** and **Up** if the device replies. New devices are not automatically authorized by discovery or draft application.

### 5.3 Optional: SNMP interface monitoring

**Warning:** Only an authorized administrator should change device configuration. Do not recreate working users or VLANs merely to troubleshoot. Keep write access unset and restrict the ACL to the actual host.

1. Follow [managed switch configuration](../switchconfig.md) for the actual device. Confirm default-context sysUpTime, ifTable and ifXTable access, SNMPv3 user/authPriv and source ACL.
2. Save the switch or router in the monitored map as in section 5.2.
3. In the launcher click **Stop**, then **Port monitoring…**.
4. Select the actual **Saved device**. Set **Authentication algorithm** to match the device; enter **SNMP username**, **Authentication password**, and **Privacy password** locally. For older Cisco IOS SHA choose SHA-1; privacy is AES-128.
5. Enter **VLAN context (optional)** only if the switch forwarding table requires a named context. Use its exact spelling from show snmp context. Test connection reads default-context interface status, not this forwarding context.
6. Click **Test connection**. Expected: successful port-status read. If it fails, check section 7 before changing switch settings.
7. Click **Enable monitoring**, then **Close**. Enable **Check ports on next start** and click **Start**.
8. In the dashboard open the saved device's **Ports**. Expected: recent interface status and, after suitable compatible samples, traffic rates. Repeat independently for each switch.

### 5.4 Optional: nearby and physical topology discovery

1. Stop the host and enable **Discover local network neighbors on next start**. Enable the slower ICMP discovery option only if authorized.
2. Start and open the dashboard. Open **Discovered devices → Scan now**.
3. Review results and choose **Add to draft** for recognized devices. Nearby discovery uses ARP/route/name evidence, not hardware fingerprinting; a switch may initially be an endpoint.
4. In **Edit map**, correct device types and review proposed links; choose **Use this map → Confirm replacement**.
5. For physical links, enroll each infrastructure device, enable read-only CDP/LLDP MIB access and any required forwarding context. Verify actual neighbor ports using the console.
6. Open **Discovered → Topology proposals**, choose the **Manual start device**, click **Find connections**, review proposals and apply the draft. An LLDP identity is needed for the topology crawl; CDP can also provide local connection hints.
7. Verify the actual saved links against the switch's neighbor and MAC tables. Do not treat a gateway route as a verified cable.

### 5.5 Optional: remote viewing

Keep local-only access unless needed. Follow [Remote access](REMOTE-ACCESS.md#windows-installer-setup) for installer-managed HTTPS, viewer password, trusted connection certificate and the exact launcher URL. On an existing installation use **Allow other PCs on this network** and **Remote access → Set up or repair sharing** if required. Use private networks only; never expose the loopback admin listener through a proxy or internet port forwarding. No second installer is required on a viewing PC.

### 5.6 Stop

Click **Stop** to stop monitoring and close the database. Click **Quit** to exit the tray application. Closing the browser or launcher window does not stop the host. Sign-out and sleep interrupt monitoring.

## 6. Verification

From another PowerShell window on the host, with default local HTTP settings:

~~~powershell
Invoke-RestMethod http://127.0.0.1:4317/api/v1/health
~~~

Expected: ready is true. Collector readiness is independent of device status. For custom port or HTTPS use the actual launcher URL and trusted certificate.

| Part | Reader verification | Evidence status |
| --- | --- | --- |
| Release package | Check SHA256SUMS, install and open launcher | Automated Windows release build and installer smoke passed for v0.2.4 |
| Host/database | Start, health ready, save a device, stop/restart and confirm persistence | Automated repository checks passed; commands file-checked |
| Browser dashboard | Open map, apply draft, inspect status | CI browser checks passed using fixtures |
| Source setup | npm ci, build, desktop:setup | Checked against files; new guide not replayed on clean Windows |
| ICMP | Fresh last check on approved device | File-checked; individual device outcomes not guaranteed |
| SNMP | Test connection and fresh Ports readings for each switch | File-checked; user session identified ACL/username issues; final enrollment not confirmed here |
| Physical links | Compare reviewed links to actual console neighbor/port outputs | File-checked; full three-switch acceptance not established |
| Remote viewing | Second PC opens trusted HTTPS URL with intended role | File-checked; new guide not replayed on second PC |
| Backup/restore | Verify backup; restore only in isolated test or approved maintenance | Automated tests cover behavior; no new real-data restore performed |

Recorded baseline: [Checks workflow](https://github.com/Osbornejmb/netwatch/actions/runs/45553156056) passed Windows and Ubuntu Node 22 and LTS jobs and browser fixtures; [Windows installer workflow](https://github.com/Osbornejmb/netwatch/actions/runs/45553453534) passed under windows-latest with Node 22 and verified installed launcher version 0.2.4.0 and a fresh schema-14 database. Exact runner OS build and Node patch not established in this documentation review. No new clean Windows installation or live hardware test was performed. Expected outcomes above are instructions, not fabricated observations.

## 7. Troubleshooting

| Symptom | Likely cause / next action |
| --- | --- |
| Another copy may be running | Generic startup error; check hidden processes, listener, actual database path, migration backup and stale lock; [startup troubleshooting](WINDOWS-LAUNCHER.md#troubleshoot-startup) |
| Empty dashboard after upgrade | Wrong database or draft view; verify displayed data path and Monitored network before modifying anything |
| Switch discovered as endpoint | No verified infrastructure hint; manually assign type and apply draft |
| No Ethernet default gateway | Normal on an isolated directly attached subnet; do not add a gateway just for monitoring |
| Port monitoring list empty | Target not saved as Switch/Router with IP; apply draft, then stop host |
| Ping works but Test connection fails | Check actual host source ACL, exact per-device SNMP username/passwords, SHA/AES, UDP 161 and default IF-MIB view |
| Switch cannot ping Windows but Windows can ping switch | Possible Windows inbound ICMP policy; don't disable firewall indiscriminately |
| ARP present but MAC table empty | Entries age independently; generate fresh host traffic and inspect MAC learning |
| Ports work but trunk absent | Check actual CDP/LLDP neighbors and default read view; enroll both switches |
| MAC forwarding missing | Check exact named context and VLAN read permissions |
| Dashboard unreachable on second PC | Check launcher URL, HTTPS trust, private firewall profile and viewer policy |

Use the [ordered troubleshooting guide](NETWORK-TROUBLESHOOTING.md) for commands and interpretation.

## 8. Maintenance

### 8.1 Offline backup (installed Windows build)

**Warning:** Stop and Quit NetWatch and stop any other process using the same database. Do not copy only the main SQLite file while it is open. A browser JSON map export is not a full history backup.

1. Note the exact database path shown by the launcher before quitting.
2. Open PowerShell in the installed program directory.

   ~~~powershell
   Set-Location (Join-Path $env:LOCALAPPDATA 'Programs\NetWatch')
   $env:NETWATCH_DB = Read-Host 'Exact absolute database path shown in launcher'
   ~~~
3. Choose a new backup file in an existing writable folder.

   ~~~powershell
   $backup = Read-Host 'New absolute backup file path (must not exist)'
   .\node.exe host/maintenance.js backup $backup
   ~~~

   Expected: successful validated backup; existing files are not overwritten. Protect backups because they contain inventory, history and possibly password hashes. For source use `npm.cmd run db -- backup $backup` from the source root with the same database selection.

### 8.2 Update

1. Quit NetWatch and make an offline backup using the currently installed compatible version before updating.
2. For old schema versions, create the exact adjacent migration backup required by the [database migration guide](HOST-API.md#sqlite-migrations-and-retention): v1–10 → .pre-v11.bak, v11 → .pre-v12.bak, v12 → .pre-v13.bak, v13 → .pre-v14.bak. Append the suffix to the actual database filename, not an invented path. Existing schema 14 does not require those migration backups, but routine backup is recommended.
3. Download and verify the new installer, run Setup, then open NetWatch and confirm saved inventory/history. For source, build the intended revision and rerun desktop setup.
4. If migration fails, preserve database and WAL/SHM files and follow recovery instructions. Do not delete data to bypass migration.

### 8.3 Restore

**Warning:** Restore replaces saved inventory/history. Make a separate backup of current data first. Stop all hosts and maintenance tasks before proceeding. Restore clears SNMP authorizations and remote sessions; re-enroll SNMP locally. Existing access policy/audit history is preserved when replacing a compatible existing database; see HOST-API for older backup restrictions.

1. Select the actual database as in section 8.1.
2. Select the verified backup and intentionally confirm the replacement.

   ~~~powershell
   $restore = Read-Host 'Absolute path of verified backup to restore'
   .\node.exe host/maintenance.js restore $restore --confirm
   ~~~

   For source, use `npm.cmd run db -- restore $restore --confirm`. Expected: successful restore; restart host, verify inventory/history and re-enroll devices.
3. For map-only recovery use **Backups → Restore map**, review the draft, then separately apply **Use this map** if intended.

### 8.4 Uninstall

1. Back up data, then **Quit** NetWatch.
2. For installed builds use Windows **Settings → Apps** and uninstall NetWatch. The per-user data/preferences remain; do not delete them unless intentionally disposing of the data.
3. For source launcher, follow [source removal](WINDOWS-LAUNCHER.md#deployment-and-remote-browsers). Keep backups and data directory for recovery.

## 9. Handoff and verification limits

Source review: package.json/package-lock.json, .env.example, desktop/NetWatch.cs, desktop setup and packaging scripts, Checks and release workflows, host/main.js, port.js, store.js, upgrade-backup.js, maintenance.js, SNMP configuration/probe and topology discovery, README and linked guides. No container manifest is present at the repository root; no container installation is proposed.

Documentation discrepancy: older launcher/runbook text described direct Add to map as enabling checks; current workflow stages a draft and requires explicit application and monitoring opt-in. Older historical hardware claims have different scopes; current CI does not establish complete physical-device compatibility. The guide uses the current workflow and preserves historical evidence. The source manifest's broad Node >=22.13 requirement is narrowed operationally to compatible supported LTS because the locked ESLint engine excludes some intervening Node versions.

Missing: measured hardware minima, exact current CI runner OS build/Node patch, clean-install replay of this new guide, final three-switch SNMP/topology acceptance, and second-PC HTTPS acceptance. No screenshots are invented. A current real installer/launcher and successful enrollment screenshot would be useful after a clean Windows walkthrough; existing README screenshots depict fixture inventory, not live hardware.
