# Phase 0 audit — NetWatch uplinks and topology

## Decision summary

NetWatch can reuse its SNMPv3 collector, LLDP review, topology editor, and revision-checked inventory flow. Four current behaviors need an explicit decision before Phase 1.

| Current behavior | Recommended decision |
| --- | --- |
| The editor and dashboard identify a connection by its unordered device pair. Reverse and parallel records collapse to one displayed connection. | Extend the shared key to use a sorted pair of device-and-port endpoints for resolved links. Preserve unresolved legacy links and their IDs until reviewed. |
| LLDP review requires an admin to save a proposal. Local discovery separately can add or update switch-port links for saved devices and add upstream route links automatically. | Make future discovery-driven topology changes proposal-only, including the legacy automatic writes. Preserve existing saved links. |
| An offline backup tool exists. Startup migrations hold the database lock but have no automatic or required pre-migration backup. | Require a verified backup through the existing maintenance flow before the first topology migration. Block the upgrade if backup verification fails. |
| Viewer snapshots omit discovery and administrative collector diagnostics. The separate viewer-accessible interface route returns detailed interface rows and per-device collector attempt state. Login and logout have existing exceptions to write-token enforcement. | Preserve the authentication entry points and protected-write boundary. Review the current viewer interface projection and explicitly allowlist any new viewer-visible fields. |

The audit covers the current checkout, including the in-progress discovery, SSE, and map changes. Phase 0 involved no code or database changes and no network probes. The checked-out code takes precedence where older documentation still cites one-second polling, SQLite v9, or a device-reachability-first product direction.

[Connection identity](../src/connections.js) · [Discovery integration](../host/main.js) · [Migration runner](../host/store.js) · [Device read routes](../host/routes/devices.js)

## 1. Current information architecture and focus scorecard

| Page or surface | Question it answers today | Audience | Focus |
| --- | --- | --- | --- |
| Dashboard `#dashboard` | Which devices respond, need attention, and connect on the map? What do configured redundancy groups report? | Viewer, admin | **Core** for the map and groups. Reachability is currently the headline. |
| Dashboard counts, statuses, and filters | How many devices are Up, Down, Overdue, or Not monitored? | Viewer, admin | **Supporting**. Gives context for outages and missing evidence. |
| Device details, Connections, and Ports | Which peers are saved? Which port ends are mapped? What are the interface status, speed, and rates? | Viewer, admin, with role-gated controls | **Core** for connection and port evidence. Reachability history, incidents, and check controls are **Supporting**. |
| Network neighbors within device details | What did this enrolled device report through LLDP? Should I save a peer link? | Admin | **Core**. This is the existing review workflow to extend. |
| Edit map `#topology`, alias `#editor` | What should be in the draft, and should it replace the monitored map? | Admin | **Supporting**. Keep manual editing and explicit apply review. |
| Uplinks & redundancy within Edit map | Which interface is mapped at each end, and which router links belong to a group? | Admin | **Core**. This is the current intended-link configuration. |
| Devices `#inventory`, alias `#devices` | How do I find and inspect a device without navigating the canvas? | Admin | **Supporting**. Provides an accessible alternative to the canvas. |
| Discovered `#discovered` | Which nearby IPs were found, and should I add or remove them? | Admin | **Peripheral** as onboarding. Treating gateway hints and guessed types as topology evidence is **Distracting**. |
| Backup, restore, and host storage | Can I export, recover, load, or apply a map? | Admin. Full database maintenance is local-only. | **Supporting**. Protects existing inventory and allows reviewed changes. |
| Sign-in, access log, remote sharing, and Windows launcher | Who can view or change the system? Is the host running? Can it read an enrolled device? | Viewer sign-in, admin, local operator | **Supporting** for operation, access, and enrollment. Detailed access logs are **Peripheral** to daily topology review. |

Empty and unrecognized hashes open Dashboard. Viewers are routed to `#dashboard`. Device details, neighbor review, backup, and access log are panels or dialogs without separate URLs.

### Host routes

Paths are relative to `/api/v1` except for the SPA shell and assets.

| Audience | Routes and purpose |
| --- | --- |
| Viewer and admin | `GET /health` for readiness, `/snapshot` and `/events` for monitored state, `/devices/:id/checks` and `/incidents` for reachability history, and `/devices/:id/interfaces` for port evidence. |
| Admin | `GET` and `PUT /topology` for inventory. `GET /discovered` and `POST /discovered/scan-now`, `/discovered/clear`, `/discovered/:id/remove`, and individual or bulk `/add-to-map` for local discovery. `GET` and `PUT /devices/:id/neighbors` read and accept LLDP proposals. |
| Local only | `GET /audit` and `/audit/export`. Launcher IPC handles local settings and SNMP enrollment. |
| Public access entry points | SPA shell and assets, `GET /auth/session`, and `POST /auth/login` and `/auth/logout`. Protected data still requires admission and the appropriate role. |

[Navigation and component wiring](../src/App.jsx) · [Route table](../host/server.js)

## 2. Data model and map flow

| Data | Current shape and limits |
| --- | --- |
| Devices and inventory | SQLite `inventory` holds one revisioned JSON payload. Topology JSON is `schemaVersion: 1`. Nodes have stable application IDs, router or switch type, position, label, optional unique management IP, and description. Monitoring opt-in is separate and keyed by node ID. There is no chassis identity or alias registry. |
| Connections | Edges have an ID, source and target node IDs, label, optional rendering handles, and optional `uplink`. The uplink stores a label and `{label, index}` per side, with nullable interface indexes. Handles are drawing metadata. The model has no link-role override, verification state, provenance, observation interval, or evidence reference. |
| Groups | Each group has an ID, name, and 2–16 edge IDs. Every member touches a router, the group involves at least two distinct routers, and duplicate device pairs are rejected. There is no protected-device field, root designation, baseline, primary/backup designation, or port-channel model. |
| Interfaces | `snmp_targets` holds enrolled device IDs and opaque authorization IDs. `interface_samples` stores the latest timestamped payload per device. Rows contain index, name, description, admin and oper state, speed, octet counters, discontinuity evidence, and derived rates. Snapshots project only `checkedAt`, `admin`, and `oper` for configured link ends. |
| Checks and incidents | `checks` stores sampled device history with sequence, timestamp, effective status, raw outcome, reason, and latency. `latest_check` retains the newest observation independently of history sampling. `incidents` records device-level open and resolve times. There is no link incident or topology change ledger. |
| Discovery | `discovered_devices` stores IP/MAC/name hints, status, first and last observation, misses, and a saved-device reference where applicable. LLDP samples used for review are held separately in memory. |

### How uplinks and groups work

In Edit map, the admin selects a connection, enters port labels and interface indexes, and selects router links for a group. These changes stay in the draft until applied. The monitored dashboard checks each end against the host's SNMP freshness threshold. Either fresh end reporting admin-down or oper down, not-present, or lower-layer-down makes the link summary `down`. Both ends must report admin-up and oper-up for `up`. Other cases are `unknown`.

Any unknown group member makes the group **Unknown**. All up is **Available**, all down is **Unavailable**, and a known mix is **Degraded**. This calculation does not determine whether a switch has a usable path to a root.

### Draft, backup, and migration

Browser edits autosave locally. **Use this map → Confirm replacement** validates and previews the replacement, then writes against the host revision. A conflict requires refresh and review. The inverse flow copies the monitored map to the draft after confirmation. The editor's undirected rule uses the device pair, regardless of handle or orientation.

Browser JSON backups contain topology. Offline SQLite backup uses a validated `VACUUM INTO` under the host lock. Restore validates a staged copy, advances the revision, and clears sessions and SNMP authorizations. It requires explicit confirmation.

The checked-out store uses SQLite `user_version=10`. Versions 1–10 add inventory and checks, raw reachability and latency, incidents, SNMP targets and samples, local discovery, latest observations, authorization and sessions, audit, then add and remove the former operator role. Pending steps run in order, one transaction per version, with rollback on failure and rejection of newer databases.

[Topology validator](../src/topology.js) · [Uplink calculation](../src/uplinks.js) · [Apply review](../src/HostStorage.jsx) · [Offline backup and restore](../host/maintenance.js)

## 3. Collection, scheduling, and authorization

- **SNMPv3.** The host uses pinned `net-snmp` 3.29.2 with `authPriv`, SHA-256 or explicitly selected SHA-1, and AES privacy. It uses GET and GETBULK, zero application retries, a 1.5-second request timeout, and a 20-second protocol deadline. Limits are 64 requests, ten bulk repetitions, and 512 interfaces per device. Existing readings cover IF-MIB status, speed, and octet counters. STP, LACP, error/discard, and `ifAlias` readings are absent. [SNMP probe](../host/snmp-probe.js) · [Collector policy](SNMP-INTERFACES.md)
- **Credential handling.** The Windows CurrentUser DPAPI vault binds profiles to the database path and enrolled device identity, address, and authorization. Plaintext is confined to bounded helper pipes and process memory. Diagnostics use fixed codes. Database backups exclude SNMP credentials, and restoring clears SNMP authorizations. [Credential vault](../host/snmp-secrets.js) · [Windows launcher](WINDOWS-LAUNCHER.md)
- **LLDP.** The poll reads remote chassis subtype/value, remote port subtype/value, sysName, and the local port number from the table index. It bounds and sanitizes strings and caps observations at 64 rows. An admin chooses a saved peer or names a new one. Acceptance checks inventory revision and observation time and saves a labeled edge. It does not require reciprocal evidence or resolve both ends to `ifIndex`. New peer IDs incorporate the reporter's ID and chassis key, so two reporters can create separate records for one chassis. There is no automatic hop-by-hop crawl. [LLDP parser](../host/lldp.js) · [Neighbor acceptance](../host/routes/neighbors.js)
- **Scan now.** Opt-in Windows local IPv4 discovery reads ARP and default routes, supplements the host adapter MAC, optionally pings directly attached addresses, and uses bounded reverse DNS. The sweep cap is 1,022 addresses, the default widest scope is `/24`, and manual scans have a 30-second cooldown. Optional two-hop traces and SNMP forwarding-table matches provide route and port hints. These do not establish multi-tier topology or reliable visibility across VLANs. [Discovery limits](DISCOVERY.md)
- **Scheduling.** ICMP targets ten seconds between cycle starts with up to eight workers and no overlapping cycles. Freshness widens with the worker budget. Two consecutive network failures establish Down and one successful reply recovers it. Collector errors do neither. SNMP has a separate non-overlapping pool of two workers and a roughly 60-second target interval. Local discovery targets five minutes and shares the eight-permit ICMP budget. A scan can wait for the current SNMP cycle. The shared ICMP gate bounds total work but does not reserve permits for monitoring. A crawl should use the existing SNMP queue, prioritize scheduled monitoring between bounded requests, and include a starvation regression test. [ICMP policy](../host/icmp-policy.js) · [Shared gate](../host/probe-gate.js) · [SNMP collector](../host/snmp-collector.js)
- **Authorization and audit.** Admission uses the real socket peer, Host and Origin checks, and direct HTTPS for remote access. Loopback reads are admin without sign-in. Protected local writes use the per-launch `X-NetWatch-Write` token, and protected remote writes use an admin session and its CSRF token in that header. Viewer snapshots and SSE omit discovery and administrative collector diagnostics. They include monitored inventory, reachability, incidents, and mapped port evidence. Audit records bounded access and write actions. Exports allowlist actions and exclude IPs and detail. Keep new crawl results, candidate addresses, raw evidence, and administrative diagnostics admin-only. [Host API](HOST-API.md) · [Audit export](../host/audit.js)

## 4. Gap and trust audit

| Administrator question | Answer today |
| --- | --- |
| Which devices connect, and through which ports? | **Partial.** Saved relationships, manual mappings, LLDP labels, and forwarding-table hints exist. Port evidence can be one-sided or unresolved. |
| Which are uplinks, downlinks, and peer links? | **Partial.** There is an uplink label and editor control. Link direction has no stored role or override. |
| Are both ends healthy, including speed and errors? | **Partial.** Configured ends can show fresh admin and oper state. Per-interface speed is available. There is no peer-speed comparison or error/discard evidence. |
| Which switches have redundant uplinks, and are all usable? | **Partial.** Router-link groups have aggregate port status. Switch-level redundancy and path usability are unproven. |
| Which switches are degraded but still connected? | **Partial.** A group can show Degraded. There is no per-switch baseline or root reachability check. |
| Which uplink carries traffic or stands by? | **Partial.** Valid octet rates show recent activity. They cannot identify forwarding, STP standby, or LACP membership. |
| Where are the single points of failure? | **No.** There is no bridge or articulation-point analysis. |
| What is isolated if device or link X fails? | **No.** The map can highlight immediate neighbors, but there is no reachability simulation. |
| Which links were added, lost, or moved recently? | **No link history.** Audit records operations and incidents record device outages. Neither is a link-evidence ledger. |

- **Map lines and device colors.** Green means both management endpoints respond, even if a mapped port is down. Red can indicate management address failure while traffic still forwards. A switch's own Up state remains independent. Preserve these semantics and add a separate path-health visual.
- **Port and group summaries.** `Ports up` describes sampled admin and oper state. It does not verify forwarding, route viability, expected speed, or diversity. One fresh failed end can determine the summary while the other is unknown. A group may appear Available despite an unmodeled shared failure.
- **Labels and identity.** `Gateway route` and `Observed upstream route` are routing hints. `Last seen on` is forwarding-table evidence that can age or lead through an intermediary. LLDP labels can come from one side. A stale index after a device change or reboot can identify a different port. Pair deduplication can hide a second physical cable.
- **Incomplete views.** An empty or partial LLDP table might reflect filtering, timeout, or collector scope. Zero octet rate can mean an idle forwarding link. Dense or filtered maps can hide paths. None proves a cable disappeared or a switch became isolated.

[Map reachability semantics](../src/health.js) · [Mapped port projection](../host/store.js)

## 5. Proposed information architecture

Keep `#dashboard` as the viewer landing page. Lead with **Running without redundancy**, **Isolated**, **Needs verification**, and **Single points of failure**, with the map below and reachability available as a secondary filter and detail.

Keep `#topology` and its `#editor` alias for manual edits, root designation, port correction, and baseline review. Keep `#inventory` and `#devices` for searchable device inspection. Keep `#discovered` as the admin review destination, with **Topology proposals** first and **Nearby devices** secondary. Extend existing neighbor review so both entry points act on the same proposals. Keep backup, access log, and configuration in their supporting surfaces. Retain current hash navigation, viewer guards, reload, and Back/Forward behavior.

## 6. Proposed implementation phases

| Phase | Proposed changes and verification gate |
| --- | --- |
| **1 — Model and pure engine** | Extend `src/connections.js` and `src/topology.js`. Add a pure graph and evidence engine next to `src/uplinks.js`. Extend `host/store.js` and `host/maintenance.js` for a backed-up, transactional v10 → v11 upgrade if approved. Preserve device and edge IDs, existing groups, and v1 imports. Test parallel edges, cycles, multiple roots, conflicts, stale evidence, and failure-simulation primitives with explicit host time. |
| **2 — Health and redundancy UI** | Extend `src/Dashboard.jsx`, `DeviceDetails.jsx`, `UplinkControls.jsx`, and the snapshot/SSE projection. Add separate link evidence and redundancy visuals, reviewed baselines, and a viewer field allowlist. Verify existing line colors, hash routes, accessibility, and dense-map performance. |
| **3 — Bounded LLDP crawl and review** | Extend `host/lldp.js`, `snmp-probe.js`, `snmp-collector.js`, and the existing neighbor route/UI. Start from an admin-designated seed and explicitly enrolled targets. A reported address can become a proposal but cannot authorize a probe or credential reuse. Bound targets, depth, queue, and elapsed time. Convert legacy automatic writes into proposals if approved. |
| **4 — Evidence enrichment** | Extend the existing interface collector and validator for supported port aliases, errors/discards, STP, and LACP. Report scope and freshness per end. Keep unsupported evidence unknown and test physical hardware before naming support. |
| **5 — Changes, failure impact, and what-if** | Add bounded link observation and change history under a separately reviewed additive migration. Present added, moved, conflicted, and not-seen events. Use the engine for bridge, articulation, and per-root impact analysis. Keep accepted links until an admin changes them. Test incomplete crawls, parallel links, and shared port-channel dependencies. |

Keep accepted design in the existing revisioned inventory document. Version the topology document so older clients reject new port-level semantics explicitly instead of discarding fields. Preserve legacy groups until an admin assigns the protected device and accepts its baseline. Keep observations separate from accepted design. Test on a database produced by v10 with parallel legacy edges, groups, checks, incidents, and enrollment metadata. Verify backup validation, rollback, repeat startup, and recovery with the earlier version. Never infer ports from labels or merge chassis by hostname or IP.

### Proposed evidence and state wording

- **Link state:** **Ports up · Forwarding unverified**, **Forwarding**, **Standby**, **Link down**, **Degraded link**, **Mismatch**, **One-sided evidence**, and **Link state unknown**. Reserve Forwarding and Standby for supported fresh evidence.
- **Monitoring scope:** **Reachability only**, **SNMP one end**, **SNMP both ends**, or **Neighbor verified**. Use **Based on link status only** when STP or LACP evidence is unavailable.
- **Device redundancy:** **Healthy redundancy**, **Running without redundancy**, **Isolated**, **Redundancy unknown**, and **No baseline set**.

Use distinct confirmed observations for link hysteresis and track flapping separately. Missing or partial observations do not count as confirmed failures. Keep the current device reachability states, incident rules, and line-color meanings.

**Approval gate:** Confirm port-level connection identity, proposal-only handling of legacy automatic writes, the backup gate, viewer projection review, and state wording before Phase 1. Cisco hardware, production crawl capacity, and second-PC behavior remain unverified.
