## Shared design: the data model and engine (built in Phase 1, used by everything after)

### Link model
- Links are keyed by the canonical sorted pair of endpoints (device, port), so A to B and B to A are one link. Reuse the editor's existing undirected-connection logic rather than duplicating it. Two physical links between the same two devices (dual links) are two distinct links.
- Fields (names are suggestions; follow repo conventions): endpoints with ifIndex, ifName, ifAlias where known; `role` (uplink, downlink, peer, unknown) with an admin override that always wins; `source` (manual, lldp, cdp, both); `verified` (both ends report each other consistently); `confidence` (verified, single_sided, conflict, unresolved_port); `first_seen`, `last_seen`; evidence references.
- Device identity key is the normalized chassis ID, never hostname or IP. Keep an alias set (management IPs, sysName, chassis ID) for matching only. Two devices with the same hostname must never merge; one device with several IPs must not duplicate. Normalize chassis ID by subtype (MAC lowercase colon-separated; interface-name, network-address, and locally-assigned subtypes tagged and kept opaque).
- Missing links are never deleted automatically. They become "not seen" and raise a change event (Phase 5).
- Manual and admin-edited data always wins over discovered data. Never overwrite user-chosen names, types, positions, or roles.

### Link states (effective state computed from evidence, never guessed)
- **Forwarding**: both ends oper-up and, when known, not STP-blocked.
- **Standby**: oper-up but STP-blocking or an inactive group member. Healthy redundancy, not a fault.
- **Degraded**: up but with a problem (speed below expected or below its peer, sustained errors/discards, one port-channel member down).
- **Down**: oper-down at either end, or confirmed missing by neighbor data.
- **Mismatch / One-sided**: ends disagree (one up and one down, different speeds, conflicting neighbor reports).
- **Unknown / Not monitored**: no confirmed data. Never shown as healthy.
Every state carries evidence (which port, which reading, how old) and a monitoring-scope label: "ping only", "SNMP one end", "SNMP both ends", "neighbor verified". A ping-only network must produce honest wording ("inferred from reachability only"). Reuse the existing freshness/Overdue logic for staleness, and apply the existing hysteresis (two consecutive failures) to avoid flapping. Show flapping links as a separate condition.
Propose the exact state names and UI copy for my approval before using them in the UI.

### Redundancy model
- A **redundancy group** is a set of alternate uplinks for a device (dual uplinks, port-channel members, dual-router paths). Evolve the existing "Uplinks & redundancy" groups into this and migrate existing groups without data loss.
- Each device has a **baseline**: the uplink paths the admin accepted as the intended design. Status against the baseline:
  - **Healthy**: all baseline paths usable.
  - **Degraded** ("running without redundancy"): a baseline path is lost but the device is still connected. This is the state admins most often miss. It must be prominent and never equal plain Up.
  - **Isolated**: no usable path to a root.
  - **Unknown**: insufficient data.
  No baseline means "No baseline set", with an admin-only reviewed action to accept the current state as baseline.
- Roots are admin-designated (default: the seed router). Support multiple roots and cyclic topologies.
- Single points of failure: find bridges and articulation points on the link graph, and show them as warnings even when everything is up, with an explanation of what would be isolated.
- If STP/LACP data is not yet collected, label redundancy as "based on link status only" instead of overclaiming.

### Pure engine module
Build a deterministic, side-effect-free module with no database or UI dependency. Inputs: devices, links, port readings with timestamps, freshness policy, baselines, roots. Outputs: link states, device redundancy states, isolated sets, SPOFs, and what-if results (Phase 5). This module is the core of the product. Be rigorous and keep it fully unit-tested.
