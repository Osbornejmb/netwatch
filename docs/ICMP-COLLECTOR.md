# Windows ICMP collector (2.2)

The host now has an opt-in Windows ICMP collector. Dashboard observation integration is still issue #6: the current map remains unmonitored, even while the host APIs contain results. This is not discovery, interface verification, BGP monitoring, remote access or a packaged Windows service.

## Enable deliberately

Requires Windows 10/11, Node 22.13+, the Windows .NET Framework v4 runtime/compiler, and OS permission to send ICMP. No administrator elevation or PowerShell execution-policy change is requested. The framework compiler must be present and permitted by application control. On a non-Windows host the enabled collector reports `unsupported`; it never substitutes another platform's ping command.

1. Back up the database before upgrading (`npm.cmd run db -- backup C:\NetWatchBackups\before-2.2.sqlite`, host stopped). Schema v1 upgrades transactionally to v2, preserving inventory, sequence IDs, revisions and existing checks. V1 and v2 backups remain accepted. A compatible host migrates a restored v1 backup on its next start. Older hosts reject v2 rather than guessing its shape.
2. Start the host normally and prepare **only your approved device inventory**. In Backup → Local host storage, save the inventory, choose each authorized host device, check Authorize ICMP checks, and preview/confirm Save to host. New/imported entries default disabled. Do not opt in the starter placeholders or sample devices.
3. Stop the host, then explicitly enable the collector in the PowerShell session:

```powershell
$env:NETWATCH_ICMP = '1'
npm.cmd run build
npm.cmd start
```

4. Open http://127.0.0.1:4317/api/v1/health for host/collector readiness and http://127.0.0.1:4317/api/v1/snapshot for current observations/diagnostics. Use `/api/v1/devices/<encoded-ID>/checks?limit=50` for history. The browser has no probe-trigger or observation-write endpoint.
5. Ctrl+C cancels in-flight helpers, prevents queued probes and further cycles, waits for workers, closes SQLite and releases the host lock. To disable all collection, stop the host and `Remove-Item Env:NETWATCH_ICMP`, then restart. Per-device monitoring can also be disabled by explicitly saving it to the host.

Without NETWATCH_ICMP=1 the collector is `disabled`. Both service enablement and per-device explicit opt-in are required. No network ranges, DNS names, scans or imported observation data are accepted. Only canonical IPv4/IPv6 literals already authorized in the host database are visited.

## Probe mechanism and bounds

`windows-probe.js` directly executes a small repository-owned .NET helper with `execFile`, `shell:false` and two literal arguments (canonical address and fixed timeout). There is no PowerShell/cmd.exe invocation, shell expansion, dynamic target code, ping.exe subprocess or localized ping-output parsing. The helper uses `IPAddress.TryParse` and `.NET Ping.Send(IPAddress, timeout)` to avoid DNS. If application control/permissions block it, the result is a collector error.

On first use, the absolute Windows .NET Framework v4 `csc.exe` compiles the fixed C# source into a source-hash-named executable under `<database-directory>/collector/`. Compilation is shared across workers, uses shell:false, has a 4-second/4-KiB process limit, stages before rename, and never contacts the network. The host directory must be writable by its OS account. No SDK/add-on/npm/native binary download is used. Compiler failure is `helper_unavailable`, retried no sooner than the next polling interval. Cold compilation shares the collector probe deadline; an overlong first build can produce a collector error, followed by reuse of the cached helper next cycle. Local OS permissions protect cached executables just as they protect the host code/database.

At most eight helpers run simultaneously. Each sends one echo request with a 1,500 ms ICMP deadline; the whole helper has a 4,000 ms wall deadline including startup, 4 KiB stdout/stderr limits, abort support and termination on timeout. A valid `.NET TimedOut` or destination-unreachable response is a network failure. Killing an unresponsive helper, permission/process errors, malformed output or local ICMP errors are **collector errors**, never evidence of device down. Output is structured JSON with a finite 0–1,500 ms echo latency for successful replies; unreachable latency is null. Latency excludes helper startup and is never invented from the timeout.

A cycle snapshots at most the host inventory limit (2,000 nodes), visits enabled nodes once through a bounded worker queue and finishes before the next cycle starts. No cycle overlap, per-device immediate retries or background catch-up queues exist. Each probe and database operation is bounded; there is no unbounded retry loop inside a cycle. A slow cycle delays the next start; restart does not launch overlapping cycles. Diagnostics include duration and estimated cycle budget so an overloaded host is visible. This MVP does not claim useful polling cadence at the full inventory limit.

Before launching and before persisting each result, workers check the inventory revision. An intervening save cancels the cycle and discards obsolete results. SQLite checks the expected revision again inside the append transaction. Streaks reset on every inventory revision (including disable/re-enable/address changes), and on process restart; imported/re-authorized inventory never inherits an authorization's in-memory failure streak. Results already committed while authorized remain historical observations. No result is assigned to a newly changed target.

## Detection and freshness policy

Constants live in `host/icmp-policy.js` and are exposed in collector metadata, rather than hidden UI constants:

| Setting | Initial value |
| --- | --- |
| Target cycle start interval | 10 seconds |
| ICMP timeout | 1.5 seconds |
| Whole helper timeout | 4 seconds |
| Maximum concurrency | 8 |
| Consecutive valid network failures for down | 2 |
| Consecutive successful replies for recovery/up | 1 |
| Retry behavior | Next regular cycle only; no extra immediate attempts |
| Minimum delay after an overlong cycle | 1 second |

Initially status is unknown. First success makes it up; the first failure before any success remains unknown. An up device remains up through one valid failure, becomes down on the second, and recovers on the next successful reply. A successful reply resets the failure streak. Collector errors break consecutive runs and freeze the last stored observation without refreshing its timestamp; they cannot accumulate a down transition. Raw outcome and effective status are separate: an `up` status with `outcome:unreachable` means loss below the configured threshold, not a successful latest echo.

Let **B = max(10 seconds, ceil(enabled devices / 8) × 4 seconds)**. This estimates the worst helper-only cycle duration/start gap. Individual device checks can move within successive cycles, so use **2B + 1 second** as a conservative per-device revisit estimate, plus event-loop/database/OS scheduling overhead. From a failure immediately after a check, allow approximately **3B + 2 seconds** for two consecutive failure checks (first next check can take up to 2B, then subsequent whole cycles); recovery takes up to approximately **2B + 1 second**. These are planning estimates, not a measured SLA: local database contention and slow hardware add overhead. Changing inventory/restarting resets streaks and extends detection. Check measured last-cycle timing before relying on a deployment's detection target.

Examples: 1–8 enabled devices give B=10 seconds, conservative down planning allowance about 32 seconds and recovery about 21 seconds before dashboard transport delay; 100 devices give B=52 seconds, down about 158 seconds; 2,000 devices give B=1,000 seconds and impractically long detection for most operators. Measure and reduce the enabled inventory/adjust architecture before claiming a large-company deployment.

Snapshot `freshness.staleAfterMs = max(30,000, 2B + 10,000)` accounts for worker capacity. Collector errors or a stopped host never create fresh down observations; existing evidence eventually becomes stale. Consumers must use the exposed freshness, raw outcome and collector metadata. The dashboard polls the snapshot every second without overlapping requests. Small healthy networks typically detect down in roughly 10–22 seconds (two checks plus timeout/display delay); this is an estimate, not measured hardware acceptance. Large or slow inventories can exceed the ten-second target cadence.

## Data/API changes

SQLite user_version=2 adds raw outcome/reason, nullable measured latency and the effective `unknown` status for pending initial failures. Existing v1 up/down rows become reachable/unreachable with `reason:legacy`, null latency and unchanged timestamps/IDs. Initial migration and v1→v2 upgrade each roll back on failure; preserve the database and use recovery guidance in HOST-API.md if an upgrade fails. Do not downgrade a v2 file into a v1 host.

The upgrade also preserves the history sequence high-water mark when recent or all rows have been deleted, so newly collected checks cannot reuse earlier IDs and invalidate history cursors. Regression coverage verifies the empty-history case (last allocated ID 500 → next ID 501).

History/check entries: `{id,deviceId,status:"up"|"down"|"unknown",checkedAt:"ISO UTC",outcome:"reachable"|"unreachable",reason,latencyMs:number|null}`. Snapshot entries have the same fields except sequence ID. `reason` identifies successful reply or the .NET network status. No process error is stored as reachability evidence. Retention and pagination remain 30 days/100,000 rows and 1–200 rows per page. Monitoring opt-in remains separate from observations. No device credentials are used.

`health.collector` and `snapshot.collector` now report state (`disabled`, `unsupported`, `starting`, `idle`, `running`, `degraded`, `stopping`, `stopped`), readiness, lastSeenAt, lastCycleCompletedAt, lastSuccessfulCycleAt, enabledDevices, completedChecks, errors, up to 50 recent per-cycle diagnostics, policy, expectedCycleBudgetMs and freshness. An idle cycle has no observations; lastSuccessfulCycleAt requires a completed error-free cycle with at least one valid network result (even if every target was unreachable). It does not mean all devices were up. Collector metadata is in memory and resets on restart; history survives. Database/API readiness remains distinct from collector readiness. Useful fixed diagnostic codes include helper_unavailable, runner_process_error, runner_timeout, invalid_runner_output, icmp_exception, icmp_local_error, invalid_target, inventory_changed and collector_cycle_error; raw process stderr/host secrets are never exposed.

## Verification and remaining live-network acceptance

Fake-runner tests cover success, initial unknown, transient loss, down threshold/recovery, process/permission errors, invalid addresses/output/latency, authorization changes during checks, bounded concurrency/timeout/cadence, no overlapping cycles, graceful cancellation, timestamp freeze, schema migration/rollback and backup/restore. Windows CI additionally runs `node scripts/check-windows-icmp.mjs --loopback`: a fresh temporary explicitly authorized inventory of **127.0.0.1 and ::1 only**, exercising the real helper and finite latency without contacting external devices. Its timing/results are printed in CI. Loopback is not proof that a switch or remote router responds.

Issue #5's approved Windows device test is still required: record Windows/Node versions, exact authorized inventory, which devices are expected to answer/block ICMP, actual raw outcomes/latencies and cycle duration, three-failure detection time and recovery time. Use an approved existing unreachable/block-ICMP device; do not scan or alter production routing/firewalls to manufacture a failure. Start with one or two approved devices, export the API history/collector snapshots, and compare observed timing to the policy above. A permission/process error is an environment failure, not a passed unreachable-device test. Stop the collector after the test and disable the test inventory as appropriate. Do not close #5 based solely on fake runners or loopback.

## Single-computer test

When no other devices are available, run this from the checked-out branch on your Windows computer:

```powershell
npm.cmd ci
npm.cmd test
node scripts/check-windows-icmp.mjs --loopback
```

The smoke test creates a temporary database, explicitly authorizes only 127.0.0.1/::1, runs one real collector cycle, prints results and removes its temporary database. It does not replace your saved inventory or enable the production host. The locally compiled helper cache may be created under data/collector. It needs neither another device nor admin/firewall changes. Fake-runner tests in npm test cover the unavailable device's failure/recovery behavior. They do not turn the self-test into external-network evidence.

Recorded Windows CI result: [icmp-loopback-results.json](icmp-loopback-results.json), Windows Server 2025 x64, reviewed source commit d6078ec. Both loopbacks returned reachable/up with 0 ms (timer-resolution) roundtrip measurement; the first cycle including helper compilation took 1,973 ms, with zero collector errors. This proves the Windows executable path and local ICMP replies on that runner; Windows 10/11 user-machine execution, remote-device unreachability and end-to-end network failure/recovery timing remain unverified. The owner has only the current computer available, so those external-device checks remain pending rather than being invented.

## Local Windows validation (2026-11-12)

Validated on the owner's Windows 10 build 19045 x64 computer using Node 26.13.1 and npm.cmd 11.20.0. Both Framework/Framework64 v4.0.30319 compilers exist; the Framework64 compiler successfully built the helper. npm.cmd ci, all 42 tests and the production build passed. The sandbox initially blocked esbuild reading an ancestor directory; the same build passed outside that filesystem sandbox, without changing execution policy or installing system components.

Only 127.0.0.1 and ::1 were authorized in temporary databases. The initial cold smoke cycle took 1,659 ms; a cached repeat took 211 ms (210 ms collector duration). Both replies measured 0 ms at the .NET timer's resolution, with zero errors/diagnostics. See [local loopback results](windows-local-loopback-results.json).

Run `node scripts/check-windows-host.mjs --loopback` with port 4317 free for repeatable host verification. It starts the real host with an isolated database, checks health/snapshot/per-device history and built UI serving, stops/restarts it, verifies history persistence, reacquires the database lock and makes an offline backup. It also cancels a real loopback helper and tests three cycles of actual missing-executable errors: no new observations, down transitions or timestamp refreshes. It removes its temporary database afterward. See [host results](windows-host-results.json): 529 ms initial host cycle; shutdowns took 20/63 ms. No normal database or saved inventory was modified.

Validation found and fixed a shutdown race: abort notification can arrive before a child closes, and compilation can still be pending when collector workers return. Collector shutdown now drains preparation and child-close events before the host releases SQLite/its lock. The new regression fails against the old shutdown implementation. Actual helper cancellation also observed child close before stop returned.

The host script invokes the installed SIGINT handler through child IPC because Node's Windows child.kill('SIGINT') forcibly terminates a process. This verifies the production shutdown handler, not physical console Ctrl+C delivery. Remote-device unreachability, real network failure/recovery timing and physical Ctrl+C remain unverified; PR #27 stays draft and #5 stays open. Dashboard observations remain issue #6.

## Authorized home-router validation (2026-11-12)

The owner subsequently authorized checking the home router after its address was identified from Windows' configured Wi-Fi default gateway ([private gateway address omitted]). No network scan or router login/configuration change was used. A single Windows ping first replied in 2 ms, followed by three real NetWatch/.NET collector cycles against **only that address** in an isolated temporary inventory/database. The temporary helper cache also stayed inside that temporary directory; the normal database and running dashboard were unchanged.

All three collector checks returned reachable/up with measured 2 ms echo latency, zero errors and empty diagnostics. Cycle starts were spaced 30,004 ms and 29,997 ms apart by the validation harness. Collector durations were 1,210 ms (cold compilation), 114 ms and 96 ms. The isolated snapshot/history APIs returned all three real observations; collection stopped and the temporary database/cache were removed. See [router results](windows-router-results.json), generated against source a5a1a51.

This establishes external-device **reachable** behavior on the owner's Windows computer. No outage was induced on the home router. Actual unreachable results, three-failure detection time and recovery timing remain unverified, along with physical console Ctrl+C. PR #27 remains draft and issue #5 open pending that evidence.

## Authorized phone failure/recovery (2026-11-12)

The owner configured and authorized a phone in a separate phone-test database and operated its connection during local testing. Real stored history now verifies reachable → six valid network failures → reachable, with the effective status changing to down on exactly the third failure and up on the first successful reply. The last successful check before loss measured 69 ms; recovery and its following successful check each measured 75 ms. API inspections during down/recovery reported zero collector errors and empty diagnostics. No phone IP, device identifier or absolute timestamps are published in [redacted phone evidence](windows-phone-results.json).

Measured observation intervals: first failure to down 59,987 ms; last success to down 91,154 ms; last failed check to first recovery 28,906 ms. These are intervals between stored observations. The operator's exact Wi-Fi off/on action times were not captured, so they do **not** establish action-to-detection/recovery delays or prove a specific physical cause. The host was subsequently found stopped, its filesystem lock absent, and its test database passed a read-only integrity check; the agent did not observe the stop mechanism and cannot claim a physical Ctrl+C test.

The live reachability state transitions are now verified. Remaining acceptance work is an operator-timestamped failure/recovery run and explicit console-stop evidence. PR #27 remains draft and #5 open; dashboard integration remains #6.

## Completed timed Windows acceptance (2026-11-12)

The owner authorized USB ADB control of the connected phone. A fresh temporary database authorized only the phone's verified current Wi-Fi IPv4 address; the existing phone-test database/inventory was not changed. The actual host/collector used the default 30-second cadence, 1,500 ms ICMP timeout and three-failure/one-success policy. After an initial successful reply (66 ms), ADB disabled only the phone's Wi-Fi. Three genuine TimedOut observations occurred at 30,000/59,992/89,991 ms relative to command invocation, with statuses up/up/down. Down was recorded 89,825 ms after the disable command completed. Re-enabling Wi-Fi restored up on the first successful reply (95 ms), 28,322 ms after command completion (28,574 ms after invocation), including reassociation and the next regular check. Collector errors stayed zero with empty diagnostics. The phone's Wi-Fi was restored and its address was unchanged.

See [redacted timed phone evidence](windows-phone-timed-results.json). Command invocation/completion bracket the control operation; these are measured command-to-observation delays, not exact radio-transition timestamps or a universal SLA. The final collector cycle took 197 ms. IPC-triggered production SIGINT shutdown took 43 ms and released the lock; the temporary database/cache were removed. Only the authorized phone was probed, and the router/PC network were not changed.

A separate temporary empty host in its own hidden Windows console received a real OS CTRL_C_EVENT. A locally compiled sender first verified that the console contained only itself and that host, refusing to signal a shared console. The host exited with code 0 in 553 ms, released its database lock and passed a read-only integrity check. See [console-stop evidence](windows-console-stop-results.json). This verifies Windows console-event delivery rather than process.emit or forced child.kill; it does not claim a human keyboard press. Active helper drain is independently covered by the actual canceled-helper test and timed-phone shutdown.

Issue #5's live Windows acceptance now has reachable/unreachable results, measured default-policy failure/recovery timing and graceful shutdown evidence. Final review/CI and merge remain before closing the issue. Broader device/platform/capacity testing remains a release #16 concern. Dashboard observation integration is still #6.


## Live dashboard phone acceptance (2026-11-13, issue 2.3)

The owner authorized continued testing with the USB-connected phone. A fresh temporary inventory contained only its verified Wi-Fi address; the normal inventory/database was unchanged. The current issue #6 build ran the actual Windows host/collector at the default 30-second cadence, three-failure/one-success policy, and 90-second minimum freshness. USB ADB briefly disabled and restored only the phone Wi-Fi; no network scan or router change occurred.

The browser showed real Up (61 ms baseline latency), Down after the third genuine timeout, and recovered Up (9 ms). Down followed Wi-Fi-disable command completion by 84.287 seconds; recovery followed re-enable completion by 27.386 seconds. The dashboard reflected the down/recovery observations after 1.265/1.980 seconds. These are this run's command-to-observation delays, including collector cadence and reassociation, not a universal SLA or exact radio-transition measurement.

Stopping the test host preserved the last-known Up result with a disconnected message; the browser clock aged it to Stale without a successful API response. Restarting the same isolated host automatically restored connected/Up. Device history displayed actual up/down transitions, and the 390px details view had no document overflow. Collector errors and browser exceptions were both zero. Phone Wi-Fi was restored with the same address; graceful shutdown took 27 ms, released the lock, and the temporary database/helper cache were removed.

See [redacted live results](phone-dashboard-results.json) and [Down](screenshots/phone-dashboard-down.png), [recovered](screenshots/phone-dashboard-recovered.png), [stale/disconnected](screenshots/phone-dashboard-stale.png), [narrow history](screenshots/phone-dashboard-narrow.png). Screenshots mask the private address. This proves one phone/Wi-Fi path with the current local changes; multi-device capacity, broader Windows release checks, and publication/CI/merge remain separate work. The test stopped the host via its existing SIGINT handler over private IPC; it adds no new physical Ctrl+C evidence.

## Incident integration (2.4)

The store now records an incident with each newly confirmed down result and resolves it only on confirmed reachable/up recovery. The current defaults are ten-second cycles, two failures for down and one successful reply for recovery; the older measurements above used the previous 30-second/three-failure policy. Pending results and collector errors cannot create or resolve outages; restart resets in-memory streaks while preserving the incident ledger. See HOST-API.md for schema v3, retention and migration. No additional probes or notification delivery are introduced.
