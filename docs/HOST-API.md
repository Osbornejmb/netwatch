# Local host API and database (2.1)

Requires Node 22.13+ (built-in node:sqlite; Node 22 prints an experimental SQLite warning). No external database server or runtime package is required. This is a local API, not remote authentication or a Windows service installer.

## Run and stop

Windows users can alternatively use the [per-user tray app and desktop shortcut](WINDOWS-LAUNCHER.md). It owns the host lifecycle through private IPC, uses a separate persistent data location by default and preserves the same loopback-only HTTP boundary. It is not an unattended Windows service.

From the repository: `npm ci`, `npm run build`, `npm start`. On PowerShell with script execution disabled, use `npm.cmd` for each command. Open **http://127.0.0.1:4317**. Stop with Ctrl+C before maintenance. The host serves the compiled UI and API from the same origin, binds exclusively to 127.0.0.1, and has no LAN option. `localhost`, alternate Host headers, unexpected Origin headers and cross-site fetches are rejected. No CORS permission is granted. Vite dev/preview remain browser-only workflows; do not proxy or expose this API to the LAN.

Data defaults to `data/netwatch.sqlite` relative to the working directory. Set NETWATCH_DB to an absolute path to keep data elsewhere. Protect that directory with OS user permissions. The database contains inventory and reachability history, never device credentials. Local OS processes/users with access to this API can change inventory; remote access requires issue #10.

## Browser inventory transfer

The host starts with empty inventory. Browser storage remains the editor's working copy, including existing recovery and v1 JSON export/import. This phase uses explicit transfer, not background synchronization. In Backup → Local host storage, Check host reads current metadata. Load host previews replacement of the browser map. Save to host previews replacement of the host inventory, preserving IDs, positions and links; it does not append duplicates. Cancel changes nothing. Export the visible map first to retain a v1 backup. Host JSON export is available by loading host then exporting the current map. Migration is disabled while browser storage recovery is paused.

Only App's actual inventory reaches this control, even when Dashboard displays the separate sample preview. New host devices default to monitoring disabled. Host device monitoring lets an operator explicitly authorize a previously saved device/address, then Save to host applies that choice. New/changed addresses or types and imported backups default to disabled; v1 imports contain no authorization. The optional Windows collector is described in ICMP-COLLECTOR.md. Check host after a conflict; inspect/export/load the newer host copy before deciding whether to replace it. Checking alone does not merge changes. Refresh loses uncommitted monitoring checkbox changes.

The dashboard defaults to saved host inventory and consumes the snapshot every five seconds (10-second request deadline, no overlapping polls). Browser working copy and sample preview have no host observation binding. Details allow explicit monitoring changes on the snapshot's saved inventory/revision; a conflict requires refresh and review, with no automatic write retry. The optional Windows ICMP collector writes checks only when NETWATCH_ICMP=1 and per-device opt-in are both set; no observation-write HTTP route exists.

## Versioned API

All API responses are JSON with no-store. Errors use `{ "error": { "code": "request_rejected", "message": "..." } }`; conflicts use `revision_conflict`, unexpected failures `internal_error` with a generic message. HTTP 400 invalid input, 403 origin/host/write-intent failure, 404 missing route/device, 409 revision mismatch, 413 payload too large, 415 incorrect content type, 500 internal failure.

- `GET /api/v1/health`: `{apiVersion:1, ready:true, collector:{state:"disabled", ...}}`. The listener starts only after migrations and retention cleanup succeed. Startup/database failure leaves no ready listener. Collector readiness is independent; disabled/unsupported/degraded collection does not mean devices are down.
- `GET /api/v1/topology`: `{revision:0, updatedAt:"ISO UTC", topology:{schemaVersion:1,nodes:[],edges:[]}, monitoring:{}}`. Stable inventory IDs and v1 topology match the existing export contract; monitoring maps device IDs to booleans and is separate from topology/observations.
- `PUT /api/v1/topology`: JSON `{source:"inventory", baseRevision:0, topology:{...}, monitoring:{"device-id":false}}`, headers `Content-Type: application/json`, `X-NetWatch-Write: 1`. Missing monitoring entries default false. Full replacement, max 5 MiB UTF-8 including envelope. Success returns the new GET shape with incremented revision. The database transaction compares baseRevision after taking the write lock; there is no automatic conflict retry. Clients must explicitly choose inventory as source; `source:"sample"` is rejected.
- `GET /api/v1/snapshot`: `{generatedAt:"ISO UTC", collector:{state:"disabled", ...}, freshness:{staleAfterMs:90000}, observations:[]}`. Observation entries are `{deviceId,status:"up"|"down"|"unknown",checkedAt:"ISO UTC",outcome:"reachable"|"unreachable",reason,latencyMs:number|null}`. Raw outcome is separate from the threshold-derived status; see ICMP-COLLECTOR.md. Each device is independent. Missing/invalid/future evidence is unknown; valid evidence older than 90 seconds is stale. Collector disconnection never translates to device down. Enabled collector freshness scales with authorized inventory/worker capacity; clients must use the exposed threshold.
- `GET /api/v1/devices/:id/checks?limit=50&before=123`: `{checks:[{id:122,deviceId:"...",status:"up",checkedAt:"ISO UTC"}],nextBefore:...|null}`. Encode the stable device ID as a URL path component. Limit 1–200; before is a positive integer exclusive sequence cursor. Results are newest insertion first (sequence, not timestamp). Use nextBefore until null; inserts do not duplicate earlier pages. Deletions/retention may shorten later pages.

The snapshot additionally includes `inventory` with the complete GET topology shape (`revision`, `updatedAt`, `topology`, `monitoring`), read in the same database transaction as observations. This additive field prevents a new address or deleted device from receiving evidence from a different inventory revision. Disabled devices display unknown health while retained history stays available. The UI ages checks every second, including during API failure, preserving the last successful snapshot and timestamp.

History additionally returns `revision`, read transactionally with checks; the dashboard rejects a page for a different selected inventory revision. Details fetch 25 rows at a time and display at most 200, with explicit refresh, error and empty states. Adjacent retained status changes are labelled without inferring continuity or uptime. Changing the selected device, inventory revision or latest check cancels obsolete requests and restarts from the newest page.

Host validation reuses the v1 validator: router/switch only, 2,000 devices, 10,000 links, unique IDs and canonical nonempty IP literals, existing distinct endpoints, labels 100 chars, descriptions 500, handle strings 100, finite coordinates. Additional host bounds: IDs 100 chars and coordinates ±10,000,000. Monitoring only accepts booleans for existing devices and requires a literal management address when true. Unknown rendering/status properties are stripped from topology. Inventory validation performs no DNS lookup or probe. Only the explicitly enabled Windows collector can probe opted-in literal addresses.

## SQLite, migrations and retention

Schema version uses SQLite user_version=2 with transactional v1→v2 upgrade preserving history. See ICMP-COLLECTOR.md for new raw outcome, pending status and latency fields. Inventory (single revisioned record) and checks (indexed device, sequence and timestamp) are separate tables. Writes use BEGIN IMMEDIATE/COMMIT with rollback on failure. WAL and a three-second busy timeout support readers and serialize writers; one production host holds an exclusive filesystem lock directory. Observation batches are internal-only, max 2,000, validated against current explicit opt-in, optional expected inventory revision, finite latency and timestamps, and rolled back as a whole if any observation is invalid. Deleting a device or changing its address removes its old observations. Disabling monitoring retains history for the retention window.

History is limited to 30 days and 100,000 rows globally, with cleanup on startup, observation batches and history/snapshot reads. Pagination never returns more than 200 rows. SQLite reuses freed pages; cleanup does not immediately shrink the file. Offline backup compacts pages. Host downtime cannot accumulate new observations. The global cap can shorten a busy device's history; this is bounded MVP storage, not an enterprise sizing guarantee.

Initial schema creation and user_version are in one transaction. Migration failure exits without serving; the transaction rolls back and existing data is preserved. A newer schema is rejected rather than downgraded. Keep a verified database backup before upgrading. After a migration error, stop all host processes, preserve the database and its WAL/SHM companions, fix the cause/use a compatible host, then retry. Do not delete a database to bypass a migration error.

## Database backup and restore

Stop the host, then:

```
npm run db -- backup /path/to/new-backup.sqlite
npm run db -- restore /path/to/backup.sqlite --confirm
```

On Windows use an accessible path such as `C:\NetWatchBackups\netwatch-2026-11-12.sqlite` and npm.cmd if necessary. Parent backup folders must already exist. Backups refuse to overwrite an existing file. VACUUM INTO makes a compact standalone SQLite backup; validate integrity, supported v1/v2 schema, inventory and bounded history before accepting it. Restore validates the source before touching the target, stages a copy next to the target, checkpoints SQLite, then replaces the target file. Revision advances beyond both current and backup revisions so old browser writes are rejected. Back up the current database to a separate file before intentionally restoring; restore replaces its inventory/history.

The host and maintenance command share `<database>.lock`; concurrent maintenance is rejected. If a process crashes, confirm no host/maintenance process is running before removing that empty lock directory. If a restore is interrupted before replacement, the original remains; preserve any `.restoring` file, inspect it, and remove it only after confirming the host is stopped before retrying. Use verified backups for filesystem/disk failure recovery; this does not claim to recover arbitrary hardware corruption. Do not copy just an active WAL database's main file.

Automated tests cover restart persistence, independent-connection conflicts, inventory/observation rollback, migration failure/future version rejection, validation and origin/write limits, history pagination/retention/cap, backup/restore and corrupt backups. Browser checks cover explicit transfer, cancel, opt-in/import reset, conflict, load and responsive layouts. Windows process shutdown, file replacement and recovery still require actual Windows validation before release #16.

Windows 10 local validation now covers the real host startup, health/snapshot/history, restart persistence, offline backup, active helper cancellation and database lock release using only temporary databases and authorized loopbacks. Run `node scripts/check-windows-host.mjs --loopback` with port 4317 free; see ICMP-COLLECTOR.md and windows-host-results.json. Shutdown testing invokes the installed SIGINT handler via IPC; physical Ctrl+C delivery and broader crash/disk recovery remain release #16 checks.
