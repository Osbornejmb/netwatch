# NetWatch step-by-step implementation plan

The owner's priority is a clear dashboard showing genuine device up/down behavior. The topology editor supports it. This is a solo workflow: one coherent feature at a time, short branches to main, and evidence before closing an issue. Dates and production capacity are not promised without deployment evidence.

## First usable release

M1 + M2 deliver the local monitoring MVP. SNMP/LLDP, BGP collection, and remote access are not prerequisites for seeing real up/down status. BGP session monitoring is not currently in scope; ping results cannot establish BGP health.

**Critical path:** #13 → #1 → #4 → #5 → #28 → #6 → #11 → #16. Local tray/desktop controls (#28) are brought forward before live dashboard integration. Inventory editing (#2), recovery (#3), and map evidence (#15) must also be complete before the release gate #16. Authentication #10 can be brought forward after #4/#6 if remote access becomes urgent, without waiting for SNMP.

## Recommended solo order

| Order | Issue | Deliverable | Required before starting |
|---|---|---|---|
| 1 | [#13 Make the network health dashboard the primary screen](https://github.com/Osbornejmb/netwatch/issues/13) | Dashboard UI foundation | None |
| 2 | [#1 Verify dashboard and topology foundation from a clean checkout](https://github.com/Osbornejmb/netwatch/issues/1) | Reliable topology foundation | #13 |
| 3 | [#2 Finish device editing and accessible inventory workflows](https://github.com/Osbornejmb/netwatch/issues/2) | Reliable topology foundation | #1 |
| 4 | [#3 Finish saved-map recovery and verify inventory navigation](https://github.com/Osbornejmb/netwatch/issues/3) | Reliable topology foundation | #1 |
| 5 | [#15 Verify dashboard readability and larger-map behavior](https://github.com/Osbornejmb/netwatch/issues/15) | Larger-map evidence | #13 |
| 6 | [#4 Add local host API and durable inventory/history storage](https://github.com/Osbornejmb/netwatch/issues/4) | Windows monitoring backend | #1 |
| 7 | [#5 Implement bounded Windows ICMP checks and health transitions](https://github.com/Osbornejmb/netwatch/issues/5) | Windows monitoring backend | #4 |
| 8 | [#28 Add Windows tray controls and optional desktop launcher](https://github.com/Osbornejmb/netwatch/issues/28) | Local host usability | #4, #5 |
| 9 | [#6 Connect real observations, freshness, and history to the dashboard](https://github.com/Osbornejmb/netwatch/issues/6) | Windows monitoring backend | #13, #5 |
| 10 | [#11 Add local incident lifecycle and optional approved notifications](https://github.com/Osbornejmb/netwatch/issues/11) | Windows monitoring backend | #6 |
| 11 | [#16 Validate the live dashboard end to end on Windows](https://github.com/Osbornejmb/netwatch/issues/16) | Proven Windows monitoring MVP | #6, #2, #3, #15, #11, #28 |
| 12 | [#7 Add SNMPv3 interface collection](https://github.com/Osbornejmb/netwatch/issues/7) | Network intelligence | #16 |
| 13 | [#8 Review LLDP neighbors before applying topology changes](https://github.com/Osbornejmb/netwatch/issues/8) | Network intelligence | #7 |
| 14 | [#9 Model verified uplinks and router redundancy groups](https://github.com/Osbornejmb/netwatch/issues/9) | Network intelligence | #7 |
| 15 | [#10 Add authentication, roles, and audit records before remote access](https://github.com/Osbornejmb/netwatch/issues/10) | Secure remote operations | #4, #6 |
| 16 | [#12 Package and verify secure Windows deployment](https://github.com/Osbornejmb/netwatch/issues/12) | Secure remote operations | #16, #10 |

The recommended order is not an artificial dependency chain. Follow the required dependencies if prioritizing the live-monitoring critical path.

## Milestones and exit criteria

### M1 — Reliable topology foundation

Dashboard-first navigation, valid/editable inventory, recoverable saved maps, and representative map/browser evidence. A sample preview is not proof of live monitoring.

Issues: [#13](https://github.com/Osbornejmb/netwatch/issues/13), [#1](https://github.com/Osbornejmb/netwatch/issues/1), [#2](https://github.com/Osbornejmb/netwatch/issues/2), [#3](https://github.com/Osbornejmb/netwatch/issues/3), [#15](https://github.com/Osbornejmb/netwatch/issues/15).

### M2 — Windows monitoring backend

A Windows-hosted local monitoring MVP: real reachable → down → recovered observations, truthful stale/disconnected behavior, persistent inventory/history, local incident lifecycle, backup/restore, and recorded end-to-end evidence.

Issues: [#4](https://github.com/Osbornejmb/netwatch/issues/4), [#5](https://github.com/Osbornejmb/netwatch/issues/5), [#28](https://github.com/Osbornejmb/netwatch/issues/28), [#6](https://github.com/Osbornejmb/netwatch/issues/6), [#11](https://github.com/Osbornejmb/netwatch/issues/11), [#16](https://github.com/Osbornejmb/netwatch/issues/16).

### M3 — Network intelligence

Optional read-only SNMP/LLDP and configured redundancy enrich the proven dashboard with verified interface/neighborhood evidence without overwriting manual topology.

Issues: [#7](https://github.com/Osbornejmb/netwatch/issues/7), [#8](https://github.com/Osbornejmb/netwatch/issues/8), [#9](https://github.com/Osbornejmb/netwatch/issues/9).

### M4 — Secure remote operations

Recoverable Windows service deployment with tested authentication/authorization and an explicitly enabled, protected remote path. Optional SNMP/LLDP is not required for secure access.

Issues: [#10](https://github.com/Osbornejmb/netwatch/issues/10), [#12](https://github.com/Osbornejmb/netwatch/issues/12).

## Current evidence and next action

- The dashboard foundation and solo instructions were merged through [PR #14](https://github.com/Osbornejmb/netwatch/pull/14), with eight tests/build and desktop/narrow acceptance evidence.
- Issues #13, #1, #2 and #3 are complete and closed: dashboard foundation, clean-checkout verification, accessible inventory editing and saved-map recovery (#14/#20/#21/#22).
- Issue #18's map-first layout and popups are merged through #19; issue #15's provisional 100-device/180-link evidence is merged through #23. See SCALE-VALIDATION.md for timings and limits.
- Issue #24's radial layout, direct-peer highlights and individual dashboard dragging are merged through #25. All 21 tests, build, browser regression suites and pre-merge CI checks passed. Real saved-layout moves autosave; radial/sample moves remain temporary and resettable.
- Issue #4 (2.1) is merged through PR #26 and closed: loopback API/SQLite, explicit inventory transfer, monitoring opt-in and bounded history/backup/restore. All 30 tests/build and final Ubuntu/Windows checks passed.
- Issue #5 is complete through merged PR #27 (a08c179), with 43 tests/build, Windows/Ubuntu CI and actual approved router/phone failure/recovery and console-shutdown evidence. See ICMP-COLLECTOR.md for timing and limits.
- Current work: #28 local tray/desktop controls, then #6 real dashboard observations. WINDOWS-LAUNCHER.md explains the interactive launcher and future service handoff. SNMP/LLDP, alerts, unattended service and remote access remain planned. #16 requires actual Windows release evidence.
- Deployment is one Windows host connected to the monitored network and multiple browser clients. The tray is host-local; remote browser closure never owns collection lifetime. #12's unattended service must survive sign-out/reboot and be the single collector/database owner, with optional tray controls attached to it. Remote shared URLs require #10/#12 security first.

## Plan maintenance

`docs/github-plan.json` contains the same 16 issue definitions and dependency keys. Keys are stable identifiers, not execution order; original keys remain stable after reordering. GitHub issue numbers and this table identify the work.

The Publish project plan workflow matches stable markers or titles before creating missing work, updates canonical titles/milestones, and preserves existing issue bodies/states. Intentional acceptance-criteria revisions must be applied to both the plan and existing GitHub issues. It must not recreate issues solely because a title changes.

