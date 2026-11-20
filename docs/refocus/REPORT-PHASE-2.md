# Phase 2 report — Reviewed LLDP topology discovery

## Changes

| Files | Result |
| --- | --- |
| [Discovery LLDP reader](../../host/discovery-lldp.js), [neighbor reader](../../host/lldp.js), [SNMP probe](../../host/snmp-probe.js) | Decode bounded LLDP and IF-MIB reads, normalize chassis identities and port IDs, resolve unambiguous ports, and retry oversized bulk responses with GETNEXT. |
| [Crawl and run store](../../host/topology-discovery.js), [interface collector](../../host/snmp-collector.js), [host wiring](../../host/main.js) | Traverse an enrolled private network by chassis, bound active work, yield to monitoring, and persist partial and completed runs. |
| [Admin routes](../../host/routes/topology-discovery.js), [route guards](../../host/server.js), [audit](../../host/audit.js) | Start, cancel, review, accept, or reject proposals using the existing access policy and write headers. Viewer snapshots exclude chassis keys and proposal data. |
| [Nearby scan](../../host/discovery.js), [switch-port hints](../../host/switch-ports.js), [nearby routes](../../host/routes/discovered.js), [neighbor review](../../host/routes/neighbors.js) | Store background connection hints for review and return draft changes from existing discovery acceptance actions. |
| [Store](../../host/store.js), [backup verifier](../../host/upgrade-backup.js), [maintenance](../../host/maintenance.js), [topology validation](../../src/topology.js) | Add SQLite v12 discovery tables and preserve accepted chassis identities in topology v2. |
| [Discovery review](../../src/TopologyDiscovery.jsx), [nearby review](../../src/DiscoveredDevices.jsx), [neighbor panel](../../src/DeviceNeighbors.jsx), [App](../../src/App.jsx), [draft merge](../../src/discovery-draft.js) | Show a discovery tree, filterable connections, evidence, individual review, and a preview before staging verified links. Preserve hand-edited draft data and use the existing inventory confirmation. |
| [Fixture tests](../../tests/topology-discovery.test.js), [browser walkthrough](../../scripts/check-topology-discovery-browser.mjs), existing migration, authorization, nearby, and interface checks | Verify traversal, limits, scheduling, migration, access, and draft behavior with synthetic evidence. |
| [README](../../README.md), [discovery guide](../DISCOVERY.md), [API](../HOST-API.md), [architecture](../ARCHITECTURE.md), [design](../DESIGN.md), [work log](../WORKLOG.md) | Document the new review workflow and the upgrade and configuration steps. |

## Schema and migration

SQLite v12 adds `topology_runs` and `topology_hints`. The run store keeps ten runs. The host offers up to 512 recent local hints for review. The migration preserves existing inventory, history, monitoring, and authorizations. Accepted chassis identities are optional topology v2 fields. The viewer projection excludes them.

Upgrading a v11 database requires an offline backup at `<database>.pre-v12.bak`. Older databases can use the existing `.pre-v11.bak` path. Verified missing-backup rejection, rollback after interruption, successful retry, repeated open, and preservation of saved data with a temporary v11 fixture.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 186 passed, 0 failed in 28.17 seconds on Windows with Node v26.13.1 and portable OpenSSL. |
| `npm run lint` and `npm run format:check` | Passed. |
| `npm run build` | Passed. Vite transformed 2,142 modules. The 533.78 kB JavaScript bundle triggered the existing chunk-size warning. |
| Discovery browser walkthroughs | Four Chrome checks passed. They covered topology proposals, nearby discovery, remote-admin audit filtering, and the existing device-neighbor panel. Desktop and 390 px layouts used synthetic data. |

The main traversal fixture contains eight switches across three levels, a loop, two parallel links, duplicate names, and aliases. Every queried device is individually enrolled. The separate 100-device fixture completed while the reachability collector ran three cycles. Another test preempted a discovery session with a scheduled interface check.

The fixtures exercise SNMP parsing and workflow behavior. Real switch implementations, vendor support, production timing, and a second-PC live LAN session remain unverified. No production database was upgraded.

## Decisions and tradeoffs

- A run queries individually enrolled devices inside the private allowlist. The seed's profile stays with the seed. The fixture enrolls every device the traversal queries. This resolves the brief's assumption that a single enrolled seed could authorize requests to other devices.
- Recursion follows routers and switches within the directly attached private scope or explicit private CIDRs. Other candidates remain proposals. The narrower private-only scope excludes public addresses even with additional CIDRs.
- A saved device without a chassis identity may be suggested by management IP. An explicit match stages the identity with the saved fields. Chassis conflicts require manual resolution.
- Existing nearby and LLDP review actions previously wrote to the monitored inventory, and local nearby adds enabled checks. Both now stage draft changes. New saved devices start with checks disabled.
- A single discovery session limits contention with normal SNMP checks. The work queue gives monitoring priority and stops on the run deadline. Requests use the existing protected vault and return fixed diagnostic codes.
- Reciprocal observations can verify proposed physical endpoints. The existing live link-health projection still uses its existing sampled evidence. Link-change events and failure impact remain deferred.

## Focus check

The map and port evidence remain Core. Discovery review directly supports building the map. The editor, access controls, backups, and device list support that workflow. Nearby ARP and route hints remain secondary.

| Question | Status |
| --- | --- |
| a. Devices and connected ports | Partial. Reciprocal LLDP proposals identify resolved endpoints and distinguish parallel links. Unmanaged and unresolved cases remain visible. |
| b. Uplink, downlink, or peer | Partial. Existing manual role assignment remains available. |
| c. Link health at both ends | Partial. The Phase 1 link-health projection and enrolled port checks still provide sampled state and speed. |
| d. Usable redundant uplinks | Partial. Reviewed baselines use Phase 1 physical path analysis. |
| e. Lost redundancy with connectivity | Partial. Reviewed baseline degradation and isolation are available in the API. |
| f. Forwarding or standby | Deferred for live networks pending richer evidence. |
| g. Single points of failure | Partial. The admin API reports structural failure-point IDs. |
| h. Isolation impact of a failure | Deferred. |
| i. Recent connection changes | Partial. Discovery runs preserve proposal evidence. Change events and history remain deferred. |
