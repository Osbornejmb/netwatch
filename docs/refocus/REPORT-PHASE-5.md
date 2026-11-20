# Phase 5 report — Topology dynamics

- Discovery schedules default to off. Admins choose an enrolled seed and an interval from 15 minutes to 24 hours. Scheduled discovery uses the same read-only service and draft review as manual runs.
- The first complete discovery establishes a baseline. Missing links require two eligible complete runs, with both endpoint devices reporting and no ambiguous report for that pair. A port move is reported when the old and new link form a unique pair. Speed changes use fresh mapped-port evidence.
- Persistent redundancy incidents use the saved graph to group devices isolated behind the same upstream failure. Unknown evidence keeps an existing incident open. Link attention shows active incident anchors.
- The admin what-if control estimates isolation and lost redundancy from the saved graph. Each logical bundle counts as one available path while it has a surviving member.
- SQLite v14 adds the schedule, change feed, and incident history. An existing v13 database needs a verified backup beside it with the suffix `.pre-v14.bak`. Viewer snapshots omit the private data.
- The Windows v0.2.0 prerelease uses the consolidated [changelog](../../CHANGELOG.md) for Phases 0–5. Its workflow builds and smoke-tests the installer on Windows and attaches the SHA-256 checksum after main checks pass.

The topology estimate depends on the saved edges and root routers. It cannot establish switch forwarding behavior during a real outage. Physical switch and VLAN validation remain open, and edge-port device discovery is deferred.

## Implementation

| Files | Change |
| --- | --- |
| `host/main.js`, `host/topology-discovery.js`, `host/routes/topology-discovery.js`, `host/server.js`, `host/audit.js` | Schedule the existing single discovery service and protect settings with the admin write policy. Commit the baseline together with the completed run. |
| `host/dynamics.js`, `host/store.js`, `host/maintenance.js`, `host/snmp-collector.js` | Store and retain discovery changes and redundancy incidents. Track speeds from fresh interface samples and verify backups before SQLite upgrades. |
| `host/routes/snapshot.js`, `src/monitoring.js` | Validate the admin snapshot fields and reuse the existing SSE and HTTP delivery. Keep the viewer projection and cache version independent of private updates. |
| `src/failure-impact.js`, `src/Dashboard.jsx`, `src/DynamicsPanel.jsx`, `src/LinkOverview.jsx`, `src/dashboard.css`, `src/TopologyDiscovery.jsx` | Estimate failure impact, show active anchors in Link attention, and put administrative history and what-if tools in the collapsed Map tools menu. |
| `tests/dynamics.test.js`, existing host suites, `scripts/check-dynamics-browser.mjs`, `scripts/check-topology-discovery-browser.mjs` | Verify topology comparisons, dependency grouping and recovery, authorization, browser scheduling, draft review, and map controls. |
| `CHANGELOG.md`, `docs/HOST-API.md`, `docs/LINK-HEALTH.md`, `.github/workflows/release-v020.yml`, package metadata | Document the public release, API and migration, and gate publication on the merged source checks. |

## Verification

- `npm test` passed 199 tests with zero failures. `npm run lint`, `npm run format:check`, and `npm run build` passed. Vite reported a bundle-size warning.
- A temporary v13 fixture rejected migration without its matching backup. The existing offline backup command produced a verified backup, the upgrade opened at v14, and a second reopen preserved the saved inventory and default schedule.
- All five [PR jobs](https://github.com/Osbornejmb/netwatch/actions/runs/44700390570) passed. The browser job includes the desktop and narrow screenshots for the synthetic fixture in its fixture-browser-evidence artifact. The monitored/draft switch and drag walkthrough also passed in local Chrome.
- Physical switches, firmware-specific behaviors, VLAN-specific forwarding, and upgrades on a production database were outside this verification.

## Decisions and tradeoffs

- A single schedule and per-seed baselines keep the existing discovery and authorization model intact. An incomplete or ambiguous discovery cannot confirm that a link is missing.
- Incident anchors depend on the saved graph. Incidents appear in Link attention, the existing network-specific attention list. The existing device outage list continues to report independent reachability.
- The saved graph and resolved bundle membership support quick impact estimates. The estimate does not emulate switch forwarding decisions.
- Before merging, a browser check caught a draft-map rendering crash when the live snapshot was absent. The draft-map and map-tool checks passed after the fix.
- The owner can record the agreed admin visibility, default-off schedule, and deferred edge-port discovery in the decision log.

## Focus check

The map, link evidence, and redundancy remain Core. Discovery, the editor, and the collapsed admin tools support the map. Generic device checks and nearby scans remain secondary.

| Gap | Status |
| --- | --- |
| a. Devices and connected ports | Reviewed LLDP and compatible CDP evidence identify mapped connections. Edge-port visibility remains deferred. |
| b. Uplink, downlink, or peer | Roots support role inference. Saved manual roles take precedence. |
| c. Link health at both ends | Available with fresh, supported port evidence. |
| d. Usable redundant uplinks | Logical bundles count as one path when membership is consistent. |
| e. Lost redundancy with connectivity | Fresh evidence opens persistent link attention incidents for reviewed groups. |
| f. Forwarding or standby | Available in the bridge context reported by the device. |
| g. Single points of failure | Admin structural analysis includes recognized bundles. |
| h. Isolation impact of a failure | Admins can select a device or link and see an estimate from the saved map. |
| i. Recent connection changes | Admins can review discoveries, port moves, confirmed missing links, and speed changes. |
