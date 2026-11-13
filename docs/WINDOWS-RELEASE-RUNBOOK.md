# Windows local release runbook — issue #16

This runbook covers one awake, signed-in Windows host and local browsers. Remote access, authentication and an unattended Windows service remain #10/#12. Do not expose port 4317 or the Vite server to the LAN.

## Install and first start

1. Use a permanent checkout of the intended release commit. Record the commit, Windows build, `node --version` and `npm --version`. Node 22.13+ and the Windows .NET Framework v4 compiler/runtime are required.
2. Run `npm.cmd ci`, `npm.cmd test`, and `npm.cmd run build`. A failed check is a release blocker to investigate, not a reason to delete data or bypass checks.
3. For the interactive app, run `npm.cmd run desktop:setup -- --desktop-shortcut`. Quit an existing tray app before replacing its executable. Re-running setup preserves its database path and ICMP preference. It does not migrate an unrelated checkout database.
4. Open the shortcut. Confirm the displayed data location. First installations start empty; verify that no fixture devices appear. Existing installations preserve their devices/history.
5. Start with ICMP disabled. Start/Open dashboard should show the local dashboard at `http://127.0.0.1:4317`. Confirm that closing the browser leaves the host running.
6. Add only owner-approved devices in Topology editor. Export the browser map as a backup. Use Backup → Local host storage → Check host → Save to host, review and confirm replacement. Verify stable IDs/counts and monitoring initially disabled. Loading a host map replaces the browser working copy only after review.
7. Enable the collector on the next start only after target approval. Enable monitoring separately on each approved saved device. Never scan a subnet or automatically authorize imported/discovered addresses.

## Timing and status expectations

- Target cycle interval: 10 seconds; one request per authorized device per cycle; at most eight workers. Cycles do not overlap. An overloaded cycle takes longer than 10 seconds.
- Down requires two consecutive valid network failures. One missed reply is tolerated; the next successful reply restores Up. Process/helper/permission errors interrupt checks and never establish Down.
- Dashboard reads saved snapshots every second; those reads do not trigger checks. An API connection does not prove that devices are reachable.
- Freshness is host-defined: at least 30 seconds and `max(30,000, 2 × cycleBudgetMs + 10,000)`. For 100 enabled devices, the conservative helper budget is 52 seconds and freshness is 114 seconds; this is not a measured detection SLA.
- For an uncomplicated small inventory, roughly 10–22 seconds is a planning estimate for outage detection plus display delay. Device/OS/database scheduling and inventory churn add overhead. Measure the intended deployment instead of assuming this estimate for 100 devices.
- Open incidents survive monitoring pause/restart and resolve only on confirmed recovery. Disconnection ages evidence to Stale; it does not mark every device Down.

## Real-device acceptance

Use a single explicitly approved device with an owner-controlled reversible interruption. Do not unplug production infrastructure, alter routing/firewalls, or automate Wi-Fi changes without specific authorization.

With external Playwright and Chrome configured, the interactive helper can record a temporary test session:

```powershell
$env:PLAYWRIGHT_MODULE = '<file URL or installed Playwright module>'
$env:CHROMIUM_PATH = '<absolute Chrome executable path>'
node scripts/check-windows-release-device.mjs --approved-target <approved-literal-IP>
```

The script probes only that address, uses an isolated temporary database and an ephemeral loopback port, and does not control device Wi-Fi. Wait for READY_FOR_WIFI_OFF before turning off the device Wi-Fi. Leave it off until READY_FOR_WIFI_ON, then restore Wi-Fi immediately. Keep Wi-Fi restored even if the script reports a failure. The report omits the target and private paths; screenshots mask the management address and stay under ignored `.tools/`. It verifies real dashboard transitions, deduplication/recovery, genuine freshness aging, reconnect and offline backup/restore. Owner command times are not recorded automatically, so report observation timestamps/display lag rather than claiming exact radio-transition detection time.

Record sustained failure, recovery, incident history and independent healthy-device behavior. The owner deferred real multi-device capacity testing for this release on 2026-11-13. One real device and a 100-card fixture do not establish 100-device collector capacity.

## Stop, update and recover

- Closing the control window hides it; closing a browser does not stop collection. Stop drains checks, closes the database and disconnects all clients. Quit also exits the tray app. Sign-out, sleep or reboot interrupts this interactive host.
- Before updating, Stop/Quit and make a verified offline database backup. Keep configuration/data outside replaceable checkout files. Preserve the checkout and Node paths referenced by the launcher, or rerun setup after moving them.
- For full backup: `npm.cmd run db -- backup <new-backup.sqlite>`. The host must be stopped and the destination must not exist. Browser JSON exports contain topology only.
- Before restoring, back up current data separately. Run `npm.cmd run db -- restore <backup.sqlite> --confirm`. Restore replaces inventory/checks/incidents and advances the inventory revision; refresh browsers afterward. Confirm IDs, monitoring authorization and histories before restarting checks.
- Occupied port: identify the existing NetWatch owner; do not kill an unrelated process or start a second collector. The launcher must report an error without stopping the other host.
- Existing lock: verify that every process using that database is stopped. Preserve the database and WAL/SHM files. Back up before explicitly removing an empty stale `.lock` directory. Never delete a database to bypass a lock/migration error.
- A newer database schema needs a compatible host. Do not downgrade or silently discard it. Schema v3 upgrades v1/v2 transactionally and starts a new incident ledger; it does not invent past incidents.
- Checks retain up to 30 days / 100,000 rows globally; resolved incidents retain 30 days / 10,000 rows. Busy networks retain less. Open incidents remain until recovery or identity removal. SQLite reuses freed pages; offline backup compacts the file.

## Release sign-off

For isolated storage/API load validation, run `node scripts/check-host-load.mjs --fixtures`. It seeds 100 documentation-address devices, 100,000 checks and 10,000 resolved incidents in a temporary database, then simulates two one-second readers and individual-result writes. It launches no collector and probes no address. Results go to host-load-results.json. This covers retained-history/API costs, not 100 real Windows ping helpers, browser CPU or a sustained deployment. Existing v3 databases gain the latest-check index automatically at startup; allow startup time and additional disk space for index creation, preserving a pre-update backup.

The owner has no approved multi-device test inventory available yet; 100 devices is a planning target, not a verified deployment count. By the owner's explicit decision on 2026-11-13, real multi-device capacity testing is deferred and does not block this local release. It remains required before making a production-capacity claim.

Keep #16 open until all of these have evidence on the intended host:

- Clean install and empty startup; saved-device preservation; explicit browser/host transfer and backup/restore.
- Real reachable → second-failure Down → first-reply Up with incidents; API/collector outage → Stale → reconnect; persistent histories after restart.
- Record the available synthetic storage/API and browser measurements; explicitly defer real multi-device collector capacity per the owner's decision. Do not extrapolate a supported device count from fixtures.
- Tray Start/Stop/Open dashboard/Quit, hide/reopen, duplicate shortcut, occupied-host refusal, pointer menu operation and readable layout at intended DPI scales.
- Actual Windows/browser/Node versions, remaining limitations, and a recoverable update/restore path. External notifications remain deferred without an approved destination.
