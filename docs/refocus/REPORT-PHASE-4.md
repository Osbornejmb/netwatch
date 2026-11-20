# Phase 4 report — Richer link evidence

## Changes

| Files | Result |
| --- | --- |
| [SNMP probe](../../host/snmp-probe.js), [collector](../../host/snmp-collector.js), [link evidence](../../host/link-evidence.js), [interface rates](../../host/interfaces.js) | Poll optional IF-MIB error and discard counters, bridge port associations, STP state, and LACP attachment in the bounded enrolled-device session. Derive rates and reject counter resets and discontinuities. |
| [Discovery parser](../../host/discovery-lldp.js), [discovery runs](../../host/topology-discovery.js), [admin routes](../../host/routes/topology-discovery.js), [review UI](../../src/TopologyDiscovery.jsx) | Collect bounded CDP evidence and correlate compatible reports with LLDP. Show conflicting and CDP-only evidence to admins for review. [Cisco CDP MIB](https://www.cisco.com/c/en/us/td/docs/voice_ip_comm/cucm/managed_services/11_5_1/cucm_b_cucm-imp-managed-services-1151/cucm_b_cucm-imp-managed-services-1151_chapter_0110.pdf) |
| [Store](../../host/store.js), [backup validation](../../host/maintenance.js) | Add timestamp-matched interface link evidence in SQLite v13. Verify the offline backup before upgrading existing data. |
| [Link health](../../src/link-health.js), [role and bundle engine](../../src/rich-link.js), [snapshot](../../host/routes/snapshot.js), [snapshot validation](../../src/monitoring.js) | Infer roles from root distance, retain manual overrides, group consistent LACP members, and send derived STP state, rates, and bundle counts to authorized viewers. |
| [Dashboard](../../src/Dashboard.jsx), [link overview](../../src/LinkOverview.jsx), [device details](../../src/DeviceDetails.jsx), [UI summary](../../src/refocus.js) | Render bundle members in admin review and display current rates, spanning tree state, and the basis for redundancy. |
| [Tests](../../tests/rich-link.test.js), [browser checks](../../scripts/check-rich-link-browser.mjs), existing migration tests | Verify wraps, reboots, thresholds, ambiguous ports, partial bundles, CDP conflicts, migrations, and the role projections. |
| [Host API](../HOST-API.md), [link health guide](../LINK-HEALTH.md), [work log](../WORKLOG.md), [configuration](../../.env.example) | Document the protocol scope, migration, default thresholds, and settings. |

## Schema and verification

SQLite v13 adds the `interface_link_evidence` table. Existing interface payloads and the topology format are preserved. An existing v12 database must have an offline backup at `<database>.pre-v13.bak` created with the existing backup command. The v12 fixture exercises missing-backup rejection, successful migration, persisted telemetry, and backup validation. Enrollment removal drops associated evidence.

- `npm test` passed **196 tests** with zero failures on Windows with Node v26.13.1 and portable OpenSSL. The suite includes approved viewer projection and evidence expiry checks.
- `npm run lint`, `npm run format:check`, and `npm run build` passed. The production build retains the existing bundle-size warning.
- Chrome passed rich link details, links-first dashboard, topology discovery, and device interface walkthroughs. The rich-link fixture exercises nested members, rates, STP, and the redundancy basis. [Desktop](../screenshots/rich-link-desktop.png) · [Narrow](../screenshots/rich-link-narrow.png)
- Physical switches, vendor or firmware compatibility, and VLAN-specific spanning tree remain unverified. No production database was upgraded.

## Decisions and tradeoffs

- Three consecutive valid intervals at or above one error per second or ten discards per second are the approved defaults. Thresholds are configurable. Unknown readings interrupt the streak.
- A 64-bit octet wrap is accepted only when it fits the physical rate bound and the same interface retained its uptime continuity and counter discontinuity marker. Ambiguous wraps and resets remain unknown.
- STP uses the reported bridge context and an unambiguous bridge-port-to-interface mapping. An aggregate attachment provides membership evidence. Confirmed forwarding requires separate fresh evidence. [BRIDGE-MIB specification](https://datatracker.ietf.org/doc/html/rfc4188)
- Consistent attachment at both ends groups physical members as one logical path. The dashboard keeps each member available for inspection. Inconsistent membership stays outside bundle calculations.
- CDP corroboration uses matching management address, identity, and ports. This implementation correlates IPv4 CDP addresses. Unmatched reports are advisory and visible only in admin discovery review. The enrolled-device authorization rule applies throughout.
- Viewer fields are limited to derived rates, spanning tree state, and bundle counts alongside previously approved evidence. Raw counters, aggregate identifiers, and discovery diagnostics stay off the viewer projection.
- The earlier collector supplied port rates and reachability without STP or LACP. The new readings add evidence without changing ICMP line colors. Live verification remains a separate hardware activity.

## Focus check

The links-first dashboard, redundancy summaries, and evidence dialogs remain Core. Discovery review and the editor support them. Generic device checks and nearby scans remain secondary.

| Question | Status |
| --- | --- |
| a. Devices and connected ports | Partial. LLDP with compatible CDP evidence strengthens reviewed port matches. |
| b. Uplink, downlink, or peer | Available when roots establish depth or an admin supplies a role. |
| c. Link health at both ends | Available for supported fresh readings, including speed and derived error and discard rates. |
| d. Usable redundant uplinks | Partial. Consistent bundles count as logical paths, with evidence scope shown. |
| e. Lost redundancy with connectivity | Available for reviewed groups with sufficient fresh evidence. |
| f. Forwarding or standby | Available in the reported bridge context when the evidence supports it. |
| g. Single points of failure | Admin structural analysis accounts for known logical bundles. |
| h. Isolation impact of a failure | Deferred. |
| i. Recent connection changes | Deferred to link-change history. |

The owner can record the approved thresholds, viewer fields, and fixture-based Phase 4 closeout in the decision log.
