# Phase 1 report — Port-level topology foundations

## Changes

| Files | Result |
| --- | --- |
| [Topology validation](../../src/topology.js), [connection identity](../../src/connections.js) | Topology v2 stores link roles, root routers, and reviewed groups. Both mapped interface indexes identify a physical connection. Reverse records share a display identity, and parallel port pairs remain distinct. Unresolved records and all IDs remain saved. |
| [Link engine](../../src/link-health.js) | Computes link evidence and baseline state using host time. Distinguishes fresh port evidence, disagreement, standby, and stale readings. Computes root-relative structural failure points while accounting for parallel links and multiple roots. |
| [Store](../../host/store.js), [backup verifier](../../host/upgrade-backup.js), [maintenance](../../host/maintenance.js) | Requires a verified offline backup before upgrading an existing database. Stores versioned topology in the revisioned inventory. The host keeps enough recent local observations to evaluate two-sample failures and flapping. |
| [Snapshot](../../host/routes/snapshot.js) | Adds link evidence and redundancy summaries to HTTP and SSE. Viewer responses omit new configuration and administrative diagnostics. Conditional requests and SSE update when evidence expires. |
| [Editor](../../src/App.jsx), [uplink controls](../../src/UplinkControls.jsx), [storage preview](../../src/HostStorage.jsx), [dashboard](../../src/Dashboard.jsx) | Lets admins map parallel ports, designate roots, and review baselines through the existing draft and replacement confirmation. Preserves the legacy dashboard group summaries and device reachability display. |
| [Engine tests](../../tests/link-health.test.js), [Phase 1 integration tests](../../tests/phase-one.test.js), existing migration and HTTP tests, [browser check](../../scripts/check-uplinks-browser.mjs) | Cover graph and evidence cases, verified migration and rollback, viewer filtering, expiry, and the draft-to-monitored-map workflow. |
| [README](../../README.md), [architecture](../ARCHITECTURE.md), [design](../DESIGN.md), [Host API](../HOST-API.md), [work log](../WORKLOG.md) | Describe configuration, compatibility, upgrade instructions, and the API contract. |

## Migration and compatibility

SQLite v11 updates the revisioned inventory's topology version while preserving the existing inventory payload fields, device and connection IDs, monitoring settings, history, incidents, and enrollments. Topology v1 imports still work. Legacy groups retain their existing mapped-port behavior until the admin explicitly saves a protected-device baseline.

With NetWatch stopped, run the existing backup command with the destination `<database>.pre-v11.bak`. The upgrade compares the backup's SQLite integrity, schema version, and table data against the current source before migrating. The test upgrades a v10 fixture with distinct parallel links and an unresolved record, verifies versions and preserved data, and reopens the database. It exercises missing, corrupt, and stale backups, then interrupts and retries the v11 transaction. Earlier version upgrade tests also use the offline backup command. Verification used temporary fixture databases.

## Verification

Windows with Node v26.13.1, npm 12.2.2, and portable OpenSSL 3.5.9 available to the TLS fixture.

| Check | Result |
| --- | --- |
| `npm test` | 178 passed, 0 failed in 23.67 seconds. This includes the Windows TLS and DPAPI checks. |
| `npm run lint` | Passed for `host` and `src`. |
| `npm run build` | Passed. Vite transformed 2,140 modules. The 523.35 kB JavaScript bundle triggered the 500 kB chunk-size warning. |
| `node scripts/check-uplinks-browser.mjs` | Passed in Chrome at desktop and 390 px widths. The walkthrough verified legacy group status from synthetic readings, then applied and reloaded a parallel link, root routers, and a reviewed baseline. |

The browser check uses fixture port evidence. Physical SNMP behavior, STP, LACP, and a second-PC LAN session remain unverified. The operational database was outside the verification scope.

## Decisions and tradeoffs

- The approved decision log overrides the separate link table in the brief. Versioning the existing inventory keeps map replacement atomic and preserves the established revision check.
- Both fresh oper-up ports count toward physical availability. The engine labels this evidence `portsUp` and carries the `linkStatusOnly` basis. An up/down disagreement is immediately a mismatch and the path is excluded from available paths. A sole down report needs two consecutive distinct samples.
- Standby evidence is eligible as a backup when the peer has a confirmed path toward a root. It is excluded from the confirmed active graph. A known degraded member marks the baseline degraded when a usable path remains.
- The first backup uses the filename suffix `.pre-v11.bak`. Old backup files are preserved. The snapshot reports structural failure-point IDs to admins and keeps viewer fields within the approved allowlist.
- Recent interface evidence is bounded to the latest sample plus two process-local prior samples per device. Prior samples are cleared on authorization changes or when uptime decreases. A host restart begins with the latest persisted sample, so flapping history builds again after restart.
- The existing collector supplies IF-MIB state and speed. STP forwarding, LACP membership, and reciprocal neighbor verification require additional collectors. The engine tests a manually defined parallel-member group with one failed member using fixture evidence. The existing dashboard line colors still summarize device reachability.
- The guidelines described topology v1 and SQLite v10 as the current contracts. This phase implements the approved versioned format and v11 upgrade. The shared design used oper-up as a potential forwarding indication. The approved wording requires actual forwarding evidence before using `forwarding`.

## Focus check

The dashboard and connection details remain Core. Edit map, backups, access controls, and device inspection support those views. Local discovery remains peripheral to reviewing physical topology. The phase extends accepted manual maps and the host API. The next phase covers review-only neighbor discovery.

| Question | Status after Phase 1 |
| --- | --- |
| a. Which devices connect through which ports? | Partial. Mapped ports distinguish parallel links. Unresolved and unverified links remain. |
| b. Which links are uplinks, downlinks, or peer links? | Partial. Admin-assigned roles persist through the edit workflow. |
| c. Are both ends healthy? | Partial. The API compares authorized port state and speed. Error, forwarding, and neighbor evidence are deferred. |
| d. Which switches have usable redundant uplinks? | Partial. Reviewed groups report physical availability against designated roots. |
| e. Which switches have lost redundancy but remain connected? | Partial. The host detects degraded reviewed baselines when a usable root path remains. |
| f. Which uplink forwards or stands by? | Partial. Fixtures verify distinct states. Live IF-MIB evidence only supports physical availability and recent port observations. |
| g. Which devices or links are single points of failure? | Partial. The admin API supplies structural failure-point IDs for the root-connected topology. |
| h. What becomes isolated if a device or link fails? | Deferred to the failure-impact phase. |
| i. Which connections were added, lost, or moved recently? | Deferred to the link-change phase. |
