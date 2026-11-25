# NetWatch setup reference

For the chronological installation and enrollment walkthrough, start with [SETUP.md](SETUP.md). This page retains advanced configuration, maintenance and verification evidence.

## Advanced terminal configuration

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

## Verification

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

## Maintenance

### Offline backup (installed Windows build)

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

### Update

1. Quit NetWatch and make an offline backup using the currently installed compatible version before updating.
2. For old schema versions, create the exact adjacent migration backup required by the [database migration guide](HOST-API.md#sqlite-migrations-and-retention): v1–10 → .pre-v11.bak, v11 → .pre-v12.bak, v12 → .pre-v13.bak, v13 → .pre-v14.bak. Append the suffix to the actual database filename, not an invented path. Existing schema 14 does not require those migration backups, but routine backup is recommended.
3. Download and verify the new installer, run Setup, then open NetWatch and confirm saved inventory/history. For source, build the intended revision and rerun desktop setup.
4. If migration fails, preserve database and WAL/SHM files and follow recovery instructions. Do not delete data to bypass migration.

### Restore

**Warning:** Restore replaces saved inventory/history. Make a separate backup of current data first. Stop all hosts and maintenance tasks before proceeding. Restore clears SNMP authorizations and remote sessions; re-enroll SNMP locally. Existing access policy/audit history is preserved when replacing a compatible existing database; see HOST-API for older backup restrictions.

1. Select the actual database as in [offline backup](#offline-backup-installed-windows-build).
2. Select the verified backup and intentionally confirm the replacement.

   ~~~powershell
   $restore = Read-Host 'Absolute path of verified backup to restore'
   .\node.exe host/maintenance.js restore $restore --confirm
   ~~~

   For source, use `npm.cmd run db -- restore $restore --confirm`. Expected: successful restore; restart host, verify inventory/history and re-enroll devices.
3. For map-only recovery use **Backups → Restore map**, review the draft, then separately apply **Use this map** if intended.

### Uninstall

1. Back up data, then **Quit** NetWatch.
2. For installed builds use Windows **Settings → Apps** and uninstall NetWatch. The per-user data/preferences remain; do not delete them unless intentionally disposing of the data.
3. For source launcher, follow [source removal](WINDOWS-LAUNCHER.md#deployment-and-remote-browsers). Keep backups and data directory for recovery.

## Verification limits

Source review: package.json/package-lock.json, .env.example, desktop/NetWatch.cs, desktop setup and packaging scripts, Checks and release workflows, host/main.js, port.js, store.js, upgrade-backup.js, maintenance.js, SNMP configuration/probe and topology discovery, README and linked guides. No container manifest is present at the repository root; no container installation is proposed.

Documentation discrepancy: older launcher/runbook text described direct Add to map as enabling checks; current workflow stages a draft and requires explicit application and monitoring opt-in. Older historical hardware claims have different scopes; current CI does not establish complete physical-device compatibility. The guide uses the current workflow and preserves historical evidence. The source manifest's broad Node >=22.13 requirement is narrowed operationally to compatible supported LTS because the locked ESLint engine excludes some intervening Node versions.

Missing: measured hardware minima, exact current CI runner OS build/Node patch, clean-install replay of this new guide, final three-switch SNMP/topology acceptance, and second-PC HTTPS acceptance. No screenshots are invented. A current real installer/launcher and successful enrollment screenshot would be useful after a clean Windows walkthrough; existing README screenshots depict fixture inventory, not live hardware.
