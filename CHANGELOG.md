# NetWatch changelog

## Unreleased

- Keep the dashboard map visible above expandable link details, with one connection list and quick device status filters.
- Keep discovery actions visible while scrolling and use separate start-device controls for scheduled and manual topology discovery.
- Move Clear draft map next to Use this map, with the existing draft-only confirmation.

## v0.2.2 Windows prerelease

- Added a way to clear the draft map.
- Simplified map connections and improved readability on large maps.

Download the Windows x64 installer and verify it against SHA256SUMS.txt. The installer is unsigned. Back up your database before upgrading.

### Changes included in v0.2.2

- Nearby discovery adds devices without a supported switch or router identity as endpoints. Choose Endpoint, Computer, Printer, Switch, or Router in Edit map. Device shapes and icons distinguish endpoints and infrastructure without changing the health colors.


- Fill in interface indexes when reviewing discovered port hints. A nearby endpoint gets switch-side evidence, and a trunk can use both sides when the peer port matches fresh interface readings.

- Hide port labels on the dashboard until a connection is hovered, focused, or highlighted. Connection details retain the full evidence.
- Refresh the monitored dashboard after a saved map update, including while the live feed is still sending the previous revision.


- Collapse secondary link and topology controls. Keep links visible on large maps, route background links without detours, and draw endpoint cards over passing links.

- Add a confirmed Clear draft map action in Edit map for all devices and connections.
- Match the dashboard's link display in Edit map so links can pass behind opaque endpoint cards. Show link labels on hover, focus, or selection and use simpler routes on dense drafts.


## v0.2.1 Windows prerelease

- Added optional per-switch SNMPv3 contexts for access-port discovery on switches that expose their MAC forwarding table per VLAN. Existing interface polling and connection review use their current workflows.

- Added Cisco CDP neighbor hints and excluded transit MACs from direct attachment on CDP-observed ports.

- Displayed CDP trunk port labels on the dashboard alongside LLDP and access-port labels.

- Fixed port-hint review so a moved endpoint updates its existing discovered link in the draft and shows the updated port once the map is saved.

- Added a per-switch VLAN context field in Windows Port monitoring. Save it during enrollment or change it without re-entering credentials.

- Updated the README and switch setup guide with console commands for SNMPv3, VLAN forwarding tables, LLDP, and CDP.

Existing v0.2.0 databases already use schema v14. Install over v0.2.0 to keep the saved map, settings, and credentials.

## v0.2.0 Windows prerelease

This Windows x64 prerelease consolidates the Phase 0–5 work on link health, topology discovery, redundancy, and failure impact. It includes an unsigned installer and SHA-256 checksum.

## Changes since v0.1.5

- Improved port matching for discovered devices and LLDP peers. The host reconciles hints after SNMP polling, and the map shows discovered port labels.
- Reduced dashboard rendering work for large inventories. Browser coverage includes live-update fallback and reconnect, link visibility, drag, pan, and zoom on a 240-device fixture.
- Upgraded React and React DOM to 19, Lucide, Vite to 8 and its React plugin, ESLint to 10.15, and the GitHub Actions used for checkout, Node setup, scripting, and artifact uploads. Updated compatibility and removed superseded JSX lint rules.
- Recorded the Phase 0 audit, baseline verification, scope, and acceptance templates. Phase planning now records explicit owner decisions before implementation.

## Topology and evidence

- Added a port-level model for accepted links. Parallel physical connections retain distinct IDs, and unresolved links retain their labels and IDs. The editor supports manual roles, root routers, protected devices, and reviewed redundancy baselines.
- Added root-relative hierarchy, structural failure points, and redundancy analysis with explicit coverage and freshness. Group summaries from older maps keep their mapped-port behavior until a baseline is reviewed.
- Added read-only LLDP discovery for individually enrolled devices, with a bounded and cancellable run, normalized chassis identities, port matching and reciprocal verification, evidence review, and draft-only acceptance.
- Converted nearby scan, switch-port, and upstream route observations to reviewable hints. Discovery can stage a draft. Applying it requires the existing confirmation, and new devices start with checks disabled.
- Added matching CDP evidence to LLDP proposals. Conflicting and unmatched reports remain visible to admins, and advertisements grant no target or credential authorization.
- Added error and discard rates, configurable sustained-rate thresholds, guarded 64-bit counter wrap handling, spanning tree evidence, LACP bundles and member counts, and inferred roles with manual overrides.
- Added opt-in scheduled rediscovery, a feed for discovered devices, added or moved links, missing links, and negotiated speed changes. Missing-link reports require sufficient complete coverage. Scheduling starts off.
- Added dependency-aware redundancy incidents and saved-topology estimates for device and link failures. Admins can open Map tools to review changes and estimate isolation or lost paths. The panel starts collapsed to keep the network map in focus.

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
