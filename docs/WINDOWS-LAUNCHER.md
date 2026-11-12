# Windows tray and desktop controls

The per-user launcher starts the existing local Node host without leaving a PowerShell window open. It is an interactive Windows application, not a Windows service or a remote-access installer. Requires Windows 10/11, Node 22.13+, and the existing .NET Framework v4 compiler/runtime; no new runtime dependency is installed.

## One-time setup

From a checkout containing the launcher:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run desktop:setup -- --desktop-shortcut
```

Omit `--desktop-shortcut` if no desktop shortcut is wanted. Setup compiles the repository-owned WinForms source using the installed Framework64 compiler, writes `%LOCALAPPDATA%\NetWatch\NetWatch.exe` and `desktop.json`, and optionally creates `NetWatch.lnk` on the current user's actual Desktop. No administrator or execution-policy change is needed. Re-running setup preserves the database path and ICMP preference and updates only this launcher's shortcut; unrelated shortcuts are refused. Quit the tray app before updating its executable.

The shortcut opens host controls. Click **Start**, **Stop**, **Open dashboard**, or **Quit**. Keyboard shortcuts are Alt+S, Alt+T, Alt+O and Alt+Q. Double-click the tray icon to show controls; its context menu offers the same actions. Closing the window hides it to the tray and does not stop collection. Opening the launcher again restores the same controller, including when hidden; it does not start a second host. **Quit stops the owned host before exiting.** Closing a dashboard browser does not stop anything.

## Inventory, monitoring and storage

Default persistent data is `%LOCALAPPDATA%\NetWatch\data\netwatch.sqlite`, outside replaceable checkout/program files. This is a new, initially empty host inventory, not an automatic import of `data/netwatch.sqlite` or `phone-test.sqlite`. Existing databases/browser storage are untouched. The data path is visible in the control window; `desktop.json` records the absolute Node, checkout and database paths plus the ICMP preference. Keep the checkout and Node executable available. To intentionally select an existing compatible database, stop both hosts, back it up, then change only `database` in this settings file to its absolute path. Re-run setup after relocating the checkout or Node.

The ICMP checkbox is off on first setup and applies on the next Start. Existing per-device host authorization is still required; turning it on never authorizes starter/sample addresses. The host/collector status is refreshed while the owned process runs. This is host process readiness, not device up/down. Dashboard observations remain issue #6.

The Node controller forks only its own host and uses private parent-child IPC for readiness/shutdown. Stop drains workers, closes SQLite and releases its lock. No HTTP start/stop endpoint is added. It cannot stop a separately started host/service: an occupied port or database produces an actionable error instead. Controller input closure requests graceful shutdown; abrupt Windows process-tree termination or a machine crash can leave the existing unclean-shutdown lock. Follow HOST-API.md recovery guidance, verify processes are stopped and back up data before removing an empty stale lock. Never delete a database to recover startup.

## Deployment and remote browsers

The intended deployment is one Windows host connected to the monitored network, with one authoritative inventory/history database and collector. Other PCs open a browser URL served through the future secured remote-access setup. Start/Stop/Quit on the host affect **all** clients; closing any client browser does not stop the host. The tray app is installed only on the host, not on each remote PC.

This launcher keeps the current host bound to 127.0.0.1:4317. It does not grant LAN access, change Host/Origin protection, create firewall rules, or implement authentication. A shared URL must wait for #10/#12's authentication/roles and HTTPS reverse proxy or VPN design; simply binding the current API to all interfaces is not a deployment solution.

Interactive mode requires the host account to remain signed in; sleep, shutdown or loss of network interrupts monitoring. It does not auto-start at boot or survive sign-out. Issue #12 packages the unattended Windows service, reboot recovery, updates/rollback and uninstall. At that point the tray becomes an optional controller for that service, not a second collector; closing the tray/signing out must not stop the deployed service. Keep the database outside service binaries and preserve it during upgrades/uninstall. Service installation/control permissions and remote API permissions are separate concerns; remote viewers do not receive host shutdown rights.

## Verification

Node tests cover real host start/stop/restart, control-pipe closure, database integrity/lock release, occupied port without stopping the existing host, existing-lock preservation, and controller death with explicit unclean-lock recovery. Windows checks compile the WinForms app. Actual native keyboard checks exercised Start, hide-to-tray with continued readiness, duplicate launch reopening the same controller, Stop with lock release, Open Dashboard and Quit. The installed shortcut target was verified. Native screenshot capture timed out on this machine, so visual layout, DPI scaling and tray context-menu pointer interaction remain unverified; keyboard/accessibility state was inspected. ICMP stayed disabled and launcher QA used empty databases.

Final merge review (2026-11-13) replayed Start, the actual installed Desktop shortcut, Stop and Quit. The shortcut restored the same controller/window, status text rendered correctly through UTF-8, the host reported ready with empty inventory, and Stop reached “Database closed” with the lock released. Existing user preferences were preserved and no device targets were probed. Code review found no merge-blocking defects; 46 tests/build and Windows/Ubuntu CI passed. Screenshot capture still timed out: visual/DPI and tray-menu pointer verification are explicitly retained in release issue 2.5 (#16), rather than claimed as passed by these functional checks.

The final Ubuntu CI run and its retry then exposed an early-stop scheduling race. Shutdown could close the database before native listen completed, after which the pending listener still opened and kept the process alive. The listen callback now closes immediately when stopping, without starting collection or announcing readiness. A deterministic delayed-listen fixture failed before the fix and passes afterward. Subprocess tests have a 20-second watchdog and CI a ten-minute job limit, so future lifecycle failures report instead of hanging indefinitely. This supersedes the earlier clean-review checkpoint; the fixed head requires fresh CI before merge.
