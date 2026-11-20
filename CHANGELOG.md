# NetWatch v0.2.0 changelog

This Windows x64 prerelease consolidates the Phase 0–5 work on link health, topology discovery, redundancy, and failure impact. It includes an unsigned installer and SHA-256 checksum.

## Topology and evidence

- Added a port-level model for accepted links. Parallel physical connections retain distinct IDs, and unresolved links retain their labels and IDs. The editor supports manual roles, root routers, protected devices, and reviewed redundancy baselines.
- Added root-relative hierarchy, structural failure points, and redundancy analysis with explicit coverage and freshness. Group summaries from older maps keep their mapped-port behavior until a baseline is reviewed.
- Added read-only LLDP discovery for individually enrolled devices, with a bounded and cancellable run, normalized chassis identities, port matching and reciprocal verification, evidence review, and draft-only acceptance.
- Converted nearby scan, switch-port, and upstream route observations to reviewable hints. Discovery can stage a draft. Applying it requires the existing confirmation, and new devices start with checks disabled.
- Added matching CDP evidence to LLDP proposals. Conflicting and unmatched reports remain visible to admins, and advertisements grant no target or credential authorization.
- Added error and discard rates, configurable sustained-rate thresholds, guarded 64-bit counter wrap handling, spanning tree evidence, LACP bundles and member counts, and inferred roles with manual overrides.
- Added opt-in scheduled rediscovery, a feed for discovered devices, added or moved links, missing links, and negotiated speed changes. Missing-link reports require sufficient complete coverage. Scheduling starts off.
- Added dependency-aware redundancy incidents and saved-topology estimates for device and link failures. Admins can inspect changes and estimated isolation or lost paths without changing device configuration.

## Dashboard and operations

- The dashboard leads with link coverage and redundancy. It lists problems by severity and shows port labels, fresh speed, evidence scope and age, and per-tier summaries. Hierarchy is the monitored default, alongside Circle and Tidy.
- Existing reachability line colors, device details, history and backup controls remain available. The dashboard uses live updates with conditional polling fallback, and supports keyboard access and narrow screens.
- Viewer access includes approved port evidence and summaries. Discovery proposals, raw protocol evidence, structural failure points, changes, and failure estimates require admin access.
- The Windows installer bundles Node, the launcher, and the host helpers. The launcher stores user data separately from the program files. Uninstall preserves data and settings.

## Upgrade to SQLite v14

Quit NetWatch and run the existing offline backup command for the database shown in the control window. For a v13 database, the backup must be beside it with the suffix `.pre-v14.bak`. For example, `netwatch.sqlite.pre-v14.bak`. SQLite v12 uses `.pre-v13.bak`, v11 uses `.pre-v12.bak`, and v1–v10 use `.pre-v11.bak`. A matching verified backup is required before migration.

The upgrade preserves saved maps, IDs, settings, and existing device history. Topology v1 imports remain supported. Keep the backup if you may need to return to an earlier version.

## Verification scope

This prerelease is validated with automated tests and synthetic Windows/browser fixtures. Physical switch, firmware and VLAN-specific compatibility remain unverified. Optional edge-port device discovery is deferred.
