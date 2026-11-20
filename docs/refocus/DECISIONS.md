# Decisions

The owner approved the recommendations below on 2026-11-20. Phase implementation still requires approval of the phase plan.

## Phase 1 — Foundations

- Store accepted links in the existing revisioned inventory with a versioned topology format. This overrides the Phase 1 brief's separate link-table requirement for accepted links.
- Key resolved links by the unordered pair of device-and-port endpoints. Keep parallel physical links distinct. Preserve existing IDs, manual port mappings, and links with unresolved endpoints. Do not infer missing ports from labels.
- Keep existing groups on their current mapped-SNMP rules until an admin assigns a protected device and accepts a baseline.
- Require a verified offline backup using the existing backup command. Block migration if the backup is missing or fails verification.
- Allowlist new viewer-visible fields for links on the monitored map: endpoint and port labels, effective state, evidence scope and age, and redundancy summary. Keep proposals, candidate addresses, raw discovery evidence, and administrative diagnostics admin-only. A change to the existing viewer Ports endpoint's collector attempt diagnostics remains a separate decision.

## Phase 2 — LLDP topology discovery

- Convert future legacy automatic topology writes to review proposals. Preserve links already saved.
- An LLDP advertisement alone grants no probe or credential authorization. The choice between individually enrolled targets and explicit profile authorization for allowlisted new addresses remains open.

## Phase 3 — Core UI

- Use **Ports up · Forwarding unverified** when both ends report up and forwarding evidence is missing. Reserve **Forwarding** and **Standby** for supported fresh evidence. Other link labels are **Link down**, **Degraded link**, **Mismatch**, **One-sided evidence**, and **Link state unknown**.
- Show evidence scope separately with **Reachability only**, **SNMP one end**, **SNMP both ends**, or **Neighbor verified**. Use **Based on link status only** where STP or LACP evidence is unavailable.
- Use **Healthy redundancy**, **Running without redundancy**, **Isolated**, **Redundancy unknown**, and **No baseline set**. Use **Running without redundancy** when a baseline path is lost and another usable path remains.

## Phases 4–5 — Evidence and rollout

- Keep scheduled rediscovery off by default. Hardware validation targets and optional edge-port device visibility remain open.

# Corrections to earlier reports

- The full refocus brief orders Phase 2 as LLDP topology discovery and Phase 3 as core UI. The Phase 0 audit's proposed sequence listed those in the reverse order. Use the phase files from the full brief.
- The earlier handoff's Phase 1 paragraph was an example. It does not override the brief or the audit. Existing group summaries use mapped SNMP port readings.
