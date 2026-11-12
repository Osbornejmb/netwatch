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
| Target cycle start interval | 30 seconds |
| ICMP timeout | 1.5 seconds |
| Whole helper timeout | 4 seconds |
| Maximum concurrency | 8 |
| Consecutive valid network failures for down | 3 |
| Consecutive successful replies for recovery/up | 1 |
| Retry behavior | Next regular cycle only; no extra immediate attempts |
| Minimum delay after an overlong cycle | 1 second |

Initially status is unknown. First success makes it up; first/second failures before any success remain unknown. An up device remains up through one/two consecutive valid failures, becomes down on the third, and recovers on the next successful reply. A successful reply resets the failure streak. Collector errors break consecutive runs and freeze the last stored observation without refreshing its timestamp; they cannot accumulate a down transition. Raw outcome and effective status are separate: an `up` status with `outcome:unreachable` means loss below the configured threshold, not a successful latest echo.

Let **B = max(30 seconds, ceil(enabled devices / 8) × 4 seconds)**. This estimates the worst helper-only cycle duration/start gap. Individual device checks can move within successive cycles, so use **2B + 1 second** as a conservative per-device revisit estimate, plus event-loop/database/OS scheduling overhead. From a failure immediately after a check, allow approximately **4B + 3 seconds** for three consecutive failure checks (first next check can take up to 2B, then subsequent whole cycles); recovery takes up to approximately **2B + 1 second**. These are planning estimates, not a measured SLA: local database contention and slow hardware add overhead. Changing inventory/restarting resets streaks and extends detection. Check measured last-cycle timing before relying on a deployment's detection target.

Examples: 1–56 enabled devices give B=30 seconds, down planning allowance about 123 seconds and recovery about 61 seconds; 100 devices give B=52 seconds, down about 211 seconds; 2,000 devices give B=1,000 seconds and impractically long detection for most operators. Measure and reduce the enabled inventory/adjust architecture before claiming a large-company deployment.

Snapshot `freshness.staleAfterMs = max(90,000, 2B + 10,000)` accounts for worker capacity. Collector errors or a stopped host never create fresh down observations; existing evidence eventually becomes stale. Consumers must use the exposed freshness, raw outcome and collector metadata. The current dashboard still uses its independent sample/unknown policy until #6 wires the API in.

## Data/API changes

SQLite user_version=2 adds raw outcome/reason, nullable measured latency and the effective `unknown` status for pending initial failures. Existing v1 up/down rows become reachable/unreachable with `reason:legacy`, null latency and unchanged timestamps/IDs. Initial migration and v1→v2 upgrade each roll back on failure; preserve the database and use recovery guidance in HOST-API.md if an upgrade fails. Do not downgrade a v2 file into a v1 host.

History/check entries: `{id,deviceId,status:"up"|"down"|"unknown",checkedAt:"ISO UTC",outcome:"reachable"|"unreachable",reason,latencyMs:number|null}`. Snapshot entries have the same fields except sequence ID. `reason` identifies successful reply or the .NET network status. No process error is stored as reachability evidence. Retention and pagination remain 30 days/100,000 rows and 1–200 rows per page. Monitoring opt-in remains separate from observations. No device credentials are used.

`health.collector` and `snapshot.collector` now report state (`disabled`, `unsupported`, `starting`, `idle`, `running`, `degraded`, `stopping`, `stopped`), readiness, lastSeenAt, lastCycleCompletedAt, lastSuccessfulCycleAt, enabledDevices, completedChecks, errors, up to 50 recent per-cycle diagnostics, policy, expectedCycleBudgetMs and freshness. An idle cycle has no observations; lastSuccessfulCycleAt requires a completed error-free cycle with at least one valid network result (even if every target was unreachable). It does not mean all devices were up. Collector metadata is in memory and resets on restart; history survives. Database/API readiness remains distinct from collector readiness. Useful fixed diagnostic codes include helper_unavailable, runner_process_error, runner_timeout, invalid_runner_output, icmp_exception, icmp_local_error, invalid_target, inventory_changed and collector_cycle_error; raw process stderr/host secrets are never exposed.

## Verification and remaining live-network acceptance

Fake-runner tests cover success, initial unknown, transient loss, down threshold/recovery, process/permission errors, invalid addresses/output/latency, authorization changes during checks, bounded concurrency/timeout/cadence, no overlapping cycles, graceful cancellation, timestamp freeze, schema migration/rollback and backup/restore. Windows CI additionally runs `node scripts/check-windows-icmp.mjs --loopback`: a fresh temporary explicitly authorized inventory of **127.0.0.1 and ::1 only**, exercising the real helper and finite latency without contacting external devices. Its timing/results are printed in CI. Loopback is not proof that a switch or remote router responds.

Issue #5's approved Windows device test is still required: record Windows/Node versions, exact authorized inventory, which devices are expected to answer/block ICMP, actual raw outcomes/latencies and cycle duration, three-failure detection time and recovery time. Use an approved existing unreachable/block-ICMP device; do not scan or alter production routing/firewalls to manufacture a failure. Start with one or two approved devices, export the API history/collector snapshots, and compare observed timing to the policy above. A permission/process error is an environment failure, not a passed unreachable-device test. Stop the collector after the test and disable the test inventory as appropriate. Do not close #5 based solely on fake runners or loopback.
