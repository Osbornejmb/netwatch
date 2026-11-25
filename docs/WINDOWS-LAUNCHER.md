# Windows tray and desktop controls

The per-user launcher runs the NetWatch host in the signed-in Windows account. Open NetWatch after signing in and click **Start**.

## Standalone installer

Run `NetWatch-<version>-Windows-x64-Setup.exe` on Windows 10 or 11 x64. Setup bundles Node.js, the built dashboard, host dependencies and precompiled Windows helpers. It installs to `%LOCALAPPDATA%\Programs\NetWatch` for the current user and adds a Start menu shortcut. The installer is unsigned.

Starting with 0.1.1, the installer can prepare secure sharing before the first launch. Select **Set up access from another PC on my private network**, then choose whether viewers need a password. Setup prepares the connection file. Install NetWatch on the host PC only. Follow [Connect another PC](REMOTE-ACCESS.md#windows-installer-setup) to open the dashboard in a browser.

To update, quit NetWatch, back up the database and run the new installer. The installed launcher uses the same `%LOCALAPPDATA%\NetWatch\desktop.json` and database path as the source launcher. To roll back, quit NetWatch, uninstall the current version, install the earlier package and restore a compatible database backup if the schema changed. To uninstall, quit NetWatch and remove it from **Settings → Apps**. Settings, databases, credentials and backups stay in the per-user data directory.

For terminal maintenance from the installed program folder, use `.\node.exe host/maintenance.js`, `.\node.exe host/auth-config.js` or `.\node.exe host/snmp-config.js` in place of the corresponding npm command. Use the database path shown in the launcher as `NETWATCH_DB`.

### Build the installer

On a Windows build machine with Node.js 22.13+, npm, the .NET Framework compiler and [Inno Setup](https://jrsoftware.org/inno-setup/downloads), run these commands from the checkout. Use a current Node.js LTS release. The builder downloads the official x64 runtime matching the build machine's Node version and checks its SHA-256 checksum.

Bump the version in `package.json` and `package-lock.json` before building a new installer. The installer filename, Windows version information, and installed launcher use that version. Setup builds in the release folder keep their original filenames.

```powershell
npm.cmd ci
.\scripts\package-windows.ps1 -Compiler 'C:\Path\To\ISCC.exe'
```

The installer and its SHA-256 hash are reported at the end. The installer is written to `.tools\release`.

## Source setup

From a checkout containing the launcher:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run desktop:setup -- --desktop-shortcut
```

Omit `--desktop-shortcut` if no desktop shortcut is wanted. Setup compiles the repository-owned WinForms source using the installed Framework64 compiler, writes `%LOCALAPPDATA%\NetWatch\NetWatch.exe` and `desktop.json`, and optionally creates `NetWatch.lnk` on the current user's actual Desktop. No administrator or execution-policy change is needed. Re-running setup preserves the database path and device and port monitoring, discovery and LAN preferences and updates only this launcher's shortcut; unrelated shortcuts are refused. Quit the tray app before updating its executable.

The shortcut opens host controls. Click **Start**, **Stop**, **Open dashboard**, or **Quit**. Keyboard shortcuts are Alt+S, Alt+T, Alt+O and Alt+Q. Double-click the tray icon to show controls; its context menu offers the same actions. Closing the window hides it to the tray and does not stop collection. Opening the launcher again restores the same controller, including when hidden; it does not start a second host. **Quit stops the owned host before exiting.** Closing a dashboard browser does not stop anything.

## Inventory, monitoring and storage

Default persistent data is `%LOCALAPPDATA%\NetWatch\data\netwatch.sqlite`, outside installed program files. A new data directory starts with an empty inventory. The control window shows the database path. `desktop.json` stores the selected database and device and port monitoring, discovery and LAN preferences. Source setup also records the checkout and Node paths. Keep those paths available for the source launcher and rerun source setup if either moves. To select a compatible existing database, stop NetWatch, back up the database and set `database` to its absolute path in `desktop.json`.

The **Check devices on next start** and **Discover local network neighbors on next start** checkboxes are off on first setup and apply on the next Start. Discovery is limited to directly attached IPv4 networks and its results require review. On the host PC, explicit Add to map turns on checks for that saved device; the global collector must still be enabled, and the discovery sweep does not create saved-device observations. The host/collector status is refreshed while the owned process runs. This is host process readiness, not device up/down.

Choose **Port monitoring** while the host is stopped to select a saved device, test its SNMPv3 connection and enable read-only port checks. **Check ports on next start** applies to enrolled devices and is remembered across launcher restarts. See [Port monitoring setup](SNMP-INTERFACES.md#set-up-in-the-windows-launcher).

The Node controller forks only its own host and uses private parent-child IPC for readiness/shutdown. Stop drains workers, closes SQLite and releases its lock. No HTTP start/stop endpoint is added. It cannot stop a separately started host/service: an occupied port or database produces an actionable error instead. Controller input closure requests graceful shutdown; abrupt Windows process-tree termination or a machine crash can leave the existing unclean-shutdown lock. The host and maintenance commands log and replace a stale lock when its local owner PID has exited or its owner record is unreadable and the directory is over 60 seconds old. If a lock remains, use the recovery procedure in HOST-API.md. Never delete a database to recover startup.

## Troubleshoot startup

The launcher message asking whether another copy is running is generic; it can also indicate a database, migration, Node or configuration error. First use **Quit** in the tray. In PowerShell check for hidden processes and the configured listener (default port 4317):

~~~powershell
Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'NetWatch.exe' -or
  ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'netwatch|host[\\/]')
} | Select-Object ProcessId, Name, CommandLine
Get-NetTCPConnection -LocalPort 4317 -State Listen -ErrorAction SilentlyContinue
~~~

Inspect process ownership before stopping anything; do not kill unrelated Node processes. Check the actual database path displayed by the launcher, its parent directory, access permissions and the required offline migration backup. The lock is a directory named after that database plus `.lock`. If it remains, inspect its owner and follow [database recovery](HOST-API.md#database-backup-and-restore); only rename/quarantine a stale lock once no host or maintenance process is using that database. Never delete the database, WAL or SHM files.

For an installed build, with the launcher and any maintenance process fully stopped, run the backend locally to expose its underlying error. Use the displayed database path (not a guessed default). Do not enable extra monitoring or LAN access for diagnosis. The standalone diagnostic does not reproduce every launcher setting; stop it with Ctrl+C before reopening NetWatch.

~~~powershell
Set-Location (Join-Path $env:LOCALAPPDATA 'Programs\NetWatch')
$env:NETWATCH_DB = Read-Host 'Exact absolute database path displayed by launcher'
$env:NETWATCH_ICMP = '0'
$env:NETWATCH_SNMP = '0'
$env:NETWATCH_DISCOVERY = '0'
$env:NETWATCH_DISCOVERY_ICMP = '0'
$env:NETWATCH_LAN = '0'
.\node.exe host/main.js
~~~

For a source checkout use its actual directory and installed Node. Capture the error text, redacting credentials and private paths as needed. If the error names a migration backup, follow the database upgrade guide rather than deleting files.

## Deployment and remote browsers

The intended deployment is one Windows host connected to the monitored network, with one authoritative inventory/history database and collector. Other PCs open a browser URL served from the launcher’s Remote access dialog. Start/Stop/Quit on the host affect **all** clients; closing any client browser does not stop the host. The tray app is installed only on the host, not on each remote PC.

The launcher binds the host to 127.0.0.1 on port 4317 by default. Set NETWATCH_PORT (1024 through 65535) in the launcher environment to change the port. To share the dashboard, configure the HTTPS certificate and key as described in [Remote access](REMOTE-ACCESS.md), enable **Allow other PCs on this network**, open **Remote access**, set an admin password, and start the host. Set **Viewers** to Open, Password, or Disabled. Password mode also requires a viewer password. The launcher displays the currently bound private URLs, active sessions by role, IP and last seen, and a button to sign them out. Changing a password or viewer mode signs out all remote sessions.

The launcher runs without administrator rights and never changes the firewall. If Windows displays a firewall prompt for Node, select **Private networks** only. If granting access requires an administrator in your Windows setup, ask the administrator to allow Node on the Private profile, or leave LAN sharing off. Use a unique password. A DHCP reservation can keep the URL stable. LAN sharing requires direct HTTPS. The launcher enables it when it inherits both TLS file settings.

Open the launcher and click **Start** after signing in to Windows. Sleep, sign-out, shutdown or loss of network interrupts monitoring. For a source update or rollback, quit NetWatch, back up the database, build the intended revision, and rerun source setup. Rerunning source setup preserves saved per-device SNMP port contexts. To remove the source launcher, quit it and remove its NetWatch.exe and optional desktop shortcut. Keep `desktop.json` and the data directory for recovery.

## Verification

Node tests cover real host start/stop/restart, control-pipe closure, database integrity/lock release, occupied port without stopping the existing host, existing-lock preservation, and controller death with explicit unclean-lock recovery. Windows checks compile the WinForms app. Actual native keyboard checks exercised Start, hide-to-tray with continued readiness, duplicate launch reopening the same controller, Stop with lock release, Open Dashboard and Quit. The installed shortcut target was verified. Native screenshot capture timed out on this machine, so visual layout, DPI scaling and tray context-menu pointer interaction remain unverified; keyboard/accessibility state was inspected. ICMP stayed disabled and launcher QA used empty databases.

Final merge review (2026-11-13) replayed Start, the actual installed Desktop shortcut, Stop and Quit. The shortcut restored the same controller/window, status text rendered correctly through UTF-8, the host reported ready with empty inventory, and Stop reached “Database closed” with the lock released. Existing user preferences were preserved and no device targets were probed. Code review found no merge-blocking defects; 46 tests/build and Windows/Ubuntu CI passed. Screenshot capture still timed out: visual/DPI and tray-menu pointer verification are explicitly retained in release issue 2.5 (#16), rather than claimed as passed by these functional checks.

The final Ubuntu CI run and its retry then exposed an early-stop scheduling race. Shutdown could close the database before native listen completed, after which the pending listener still opened and kept the process alive. The listen callback now closes immediately when stopping, without starting collection or announcing readiness. A deterministic delayed-listen fixture failed before the fix and passes afterward. Subprocess tests have a 20-second watchdog and CI a ten-minute job limit, so future lifecycle failures report instead of hanging indefinitely. This supersedes the earlier clean-review checkpoint; the fixed head requires fresh CI before merge.

The bounded Ubuntu rerun pinpointed a separate test race: after killing the controller, the test saw the TCP port close before database-lock cleanup finished and expected a subsequent restart to fail. Cleanup could finish before that restart, which then legitimately stayed running. That redundant restart assertion was removed; the dedicated existing-lock refusal assertions remain, as does the no-orphan-listener check. No platform tests are skipped.
