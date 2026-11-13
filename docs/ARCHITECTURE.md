# NetWatch architecture

The current UI uses one off-white theme across the map, editor, dialogs and Windows controls. Draft edits remain separate from the monitored network; the editor’s Use this map action fetches current saved inventory and prepares a reviewed, revision-checked replacement without automatically enabling new/changed targets. See DESIGN.md and REDESIGN-CHECKPOINT.md.

## Opt-in interface collection (#7, local implementation)

The Windows host can run a separate bounded SNMPv3 authPriv collector when NETWATCH_SNMP=1 and an operator enrolls saved-device credentials locally. `net-snmp` is pinned as a host-only protocol dependency. `snmp-probe.js` performs GET/GETBULK only, validates OID order/types/counters and caps rows/requests/time; `snmp-collector.js` separates workers, freshness and diagnostics from ICMP health/incidents. Inventory revisions cancel obsolete work. A repository-owned CurrentUser DPAPI helper protects credentials in a separate host directory; no browser configuration endpoint or credential response exists.

Schema v4 adds explicit SNMP authorization and latest interface samples while preserving prior data. Address/type changes or deletion revoke the target. Restore clears SNMP authorizations; matching local credential enrollment is required again. Rate computation suppresses resets/wrap ambiguity, missing discontinuity evidence and long gaps. Device details lazily poll paginated interfaces only while expanded, retain last-known results on errors, and never infer a device or configured topology link is down from missing SNMP. Cisco 3750/2811 are intended lab targets; physical vendor acceptance remains unverified. See SNMP-INTERFACES.md.

## Implemented foundation

React + Vite opens the network health dashboard by default. `src/Dashboard.jsx` renders a viewport-filling interactive React Flow map with title/status, optional View controls, and click-to-open detail dialogs. App.jsx provides horizontal Dashboard/Topology editor/Devices navigation; the supporting device table is shown only for the Devices view. The existing topology canvas remains available through Edit topology. Router and switch components share the topology data contract. `src/topology.js` validates imported and saved maps and strips untrusted rendering properties. The browser stores a versioned topology; export/import is the portability boundary. Valid v1 exports remain readable; invalid or duplicate management addresses are rejected without replacement (see README recovery guidance).

An optional bounded Windows ICMP collector is implemented; live dashboard integration is implemented locally for issue #6; authentication remains planned. A loopback-only Node API and SQLite inventory/history store are implemented; see HOST-API.md for the versioned contract, explicit browser transfer, monitoring opt-in and recovery. New browser and host inventories start empty; built-in preview data and demo controls have been removed. Test fixtures are isolated under tests/fixtures and never imported by the app. Management addresses are validated as IPv4/IPv6 literals (or empty), with canonical IPv6 comparison and duplicate rejection. Backend address validation also runs at the probe boundary.

## Planned system

An optional Windows WinForms tray/desktop controller (#28) now starts/stops its own Node host through `host/desktop.js` and private IPC. A single controller is allowed per user/session; no remote shutdown route is added. The default database/settings live under LOCALAPPDATA/NetWatch, separate from the checkout and without automatically migrating existing inventory. See WINDOWS-LAUNCHER.md. The controller requires a signed-in interactive session; the future #12 Windows service remains the unattended owner, with the tray attaching rather than creating a second collector. Remote browsers never own collector lifetime.

Browser working copy → explicit preview/confirmed loopback API transfer → SQLite inventory/history. Authentication is planned before remote access.
The current host owns bounded optional ICMP workers (ICMP-COLLECTOR.md); a packaged Windows service and SNMP/LLDP collectors remain planned, and browsers will never launch probes or receive device credentials. Start with one service and one database. Add separate workers only when measured load requires them.

Implemented API routes: GET /api/v1/health, GET/PUT /api/v1/topology, GET /api/v1/snapshot and paginated GET /api/v1/devices/:id/checks. The production host serves the compiled UI on the same origin, enforces Host/Origin/write intent, and binds only to 127.0.0.1:4317. There is no observation-write route. See HOST-API.md for exact shapes, revision conflict rules and retention.

Topology JSON: schemaVersion 1, nodes[{id,type,position:{x,y},data:{label,ip,description}}], edges[{id,source,target,label,sourceHandle,targetHandle}]. Node IDs and link IDs are unique within their collections. Links reference existing distinct nodes. Limits: 2,000 nodes, 10,000 links, 5 MB import. This version has no credentials or monitoring results. Reject unsupported future schema versions rather than silently migrating them.

## Trust and data boundaries

Treat browser storage, imported files, API input, discovery results, and device responses as untrusted. Validate at each boundary. Never interpolate device addresses into shell commands. Probe only configured authorized inventory, with rate/concurrency/time bounds. Keep secrets in host-managed secure storage; exclude them from logs, exports, and repository history.

Bind development and the future API to loopback by default. LAN development is explicit. Remote access requires authentication, authorization, HTTPS or VPN, audit records, and restrictive firewall rules. No public development-server deployment.

## Recovery and delivery

A failed storage read pauses autosave until the user explicitly replaces the saved data. Failed writes display a warning and preserve the in-memory map for export. Import replacement requires an accessible confirmation dialog. Unreadable original storage text is retained separately for download; denied access is distinguished from invalid content. Importing while recovery is active changes only the in-memory map and keeps autosave paused. A separate explicit replacement resumes autosave only after a successful write. Recovery/backup controls and failed-save warnings appear in both views. CI runs the topology self-checks and production build. Browser interaction and Windows hardware checks remain separate acceptance work in the roadmap.

## Dashboard observations

Snapshots use the additive v3 `checks_device_latest` index and select one newest timestamp/sequence per inventory device. This bounds observation lookup by inventory size rather than scanning the full 100,000-check history for every one-second reader. See host-load-results.json for the synthetic retained-history experiment; it excludes probe-helper and real-browser costs and is not a device-capacity guarantee.

`src/monitoring.js` validates and serially polls GET snapshot every second with a 10-second deadline; `useMonitoring.js` retains last-known data through failures and cancels obsolete requests when switching sources, refreshing or unmounting. The snapshot includes inventory and observations from one database transaction. Saved host inventory is the default live view; browser edits remain separate and never inherit host checks. No background inventory writes occur. Unchanged inventory revisions preserve node references and temporary host drag positions across polls.

`src/health.js` uses the host freshness threshold for live evidence; a one-second clock ages checks even during disconnection. Missing/invalid/future evidence stays unknown; disabling monitoring hides retained evidence from live health but keeps history. Counts, cards, attention, details and endpoint-colored paths share one snapshot. Collector connection/readiness remains independent of device health. Synthetic checks exist only in test fixtures and controlled browser/API checks.

Device details enable/disable only saved host devices using the snapshot revision and complete saved host inventory, preserving other devices and rejecting conflicts without retry. A missing address prevents authorization. `DeviceHistory.jsx` fetches 25 checks per page up to 200 displayed, validates device IDs/sequence/revision, cancels obsolete requests and labels adjacent retained transitions in local time. New checks reset pagination to the newest page. No uptime percentage or continuity is inferred. History is collapsible; service/errors use everyday language.

System fonts replace the starter's Google Fonts import so the dashboard does not need a font CDN at runtime. `src/dashboard.css` contains the light dashboard tokens; the editor retains its original dark workspace. The dashboard itself adds no runtime dependencies. Host SQLite schema v4 (with transactional v1/v2/v3 migration) is separate from the unchanged browser v1 JSON contract.

## Device selection

`src/DeviceDetails.jsx` uses a native modal dialog opened from map nodes or inventory Inspect. It shows the selected device and its connected peers/path summaries. The shared modal hook traps forward/reverse Tab; close button, Escape, and backdrop dismiss it, and focus returns to the trigger. Map nodes expose button/dialog semantics and Enter/Space activation.

## Inventory editing

`src/inventory.js` defines literal-address normalization and duplicate comparison, shared by add/edit forms and topology import/storage validation. It rejects hostnames, CIDR/zone/bracket syntax and ambiguous IPv4 notation. IPv6 uses the WHATWG URL parser for validation and canonical compression, without network requests; IPv4-mapped IPv6 remains canonical IPv6. Empty addresses are unmonitored inventory entries. Invalid legacy saved maps pause autosave without changing the raw data; no persisted schema change is required.

`DeviceDialog.jsx` and `RecoveryDialog.jsx` share `useModal.js` for native modal dialogs, explicit Tab wrapping, Escape handling and focus restoration after close. Device fields have associated validation errors. Edits replace only device data, preserving type, ID, position and connections. Selection is derived from current nodes by ID, so edited/dragged details stay current. `InventoryControls.jsx` provides device selection, X/Y position updates and directed link creation/removal without canvas gestures. The existing pointer workflows remain available.

Dashboard health-card dimensions are maintained separately from inventory, using React Flow dimension-change events. Rendered nodes carry those measured dimensions across freshness/filter/selection updates, preventing reinitialization or hidden nodes when the clock ticks. This UI state is not persisted or exported. Backup controls are available in a top-menu popover with visible paused/error indicators, preserving the viewport-filling map and all recovery safeguards.

## Scale evidence

`tests/fixtures/scale-network.js` generates 100 documentation-address devices and 180 grid links. `scripts/check-scale-browser.mjs` seeds isolated inventory and supplies controlled snapshot HTTP responses for mixed-health QA; the browser-working-copy view remains inventory-only; the live view reads host observations. The dashboard minimum zoom is 0.05 so the measured 390 px layout fits the complete fixture rather than clipping 20 nodes. Fit/zoom changes only the viewport, never manual node positions. See SCALE-VALIDATION.md and scale-results.json for timings, methods and limits.

## Optional radial view and connected-device focus

`src/radial.js` computes display-only positions from the complete graph before filtering. Links are treated as undirected only for BFS levels; stored direction and endpoint-health policy do not change. Each component chooses an explicit center if present, otherwise a most-connected router, then a most-connected device, with stable ID tie-breaking. Rings expand for card spacing; disconnected components are packed separately without invented links. Position generation is deterministic, cycle-safe and independent of health/input ordering. Straight radial links use facing side handles. Manual positions remain the default, and layout/center changes remount/refit the graph without persisting layout output.

The same module derives direct peers from incoming/outgoing configured links. Dashboard retains a separate highlight ID after the details popup closes. A solid blue focus outline, dashed peer outlines, thicker incident paths and subdued unrelated items are view state only; status colors, source inventory and filters are preserved. Canvas click, Clear highlight or network-source switching clears the focus. Popup keyboard/focus handling is unchanged. View options scrolls on short screens so the additional controls remain reachable.

## Dashboard drag behavior

Dashboard accepts React Flow position changes into view-local overrides, scoped by the source-node reference and layout/center key. This lets controlled nodes and their edges update during drag without writing storage on every pointer event. Drag start sets the direct-peer highlight and closes detail state; click-distance/drag thresholds keep release separate from click-to-inspect. Single-device dragging is enabled without multi-selection dragging or connection creation.

At drag stop, browser inventory in Saved positions calls App's position-update callback; App's existing validation/autosave/pause/warning flow owns persistence. Host and radial changes stay local and can be reset/refitted. Layout/center/source transitions clear those overrides, and importing a new source invalidates old overrides. IDs, edge endpoints/handles and device fields are untouched. Focus/reset controls are an overlay to keep the canvas geometry stable during gestures.

## Optional Windows ICMP collection

NETWATCH_ICMP=1 plus explicit host device monitoring opt-in enables up to eight .NET Ping helpers, compiled locally with the Windows framework compiler and executed directly with shell:false and literal address arguments. ICMP deadlines and whole-process deadlines are separate. Only valid network results affect the two-failure/one-success state machine; collector errors freeze evidence and remain separate diagnostics. Inventory revision checks cancel obsolete probes/results. Schema v2 preserves raw outcomes, threshold-derived status and finite measured latency. The server exposes policy, freshness, readiness and last successful cycle separately from database readiness. See ICMP-COLLECTOR.md for detection estimates, cancellation, migration and the outstanding approved Windows-device test. The live dashboard consumes these observations and the exposed freshness policy; browser editing remains separate.

## Local incidents

The store atomically derives incidents from current confirmed observations, deduplicating open outages and recording one recovery timestamp. Stale data and collector failures never change incident state. Incidents survive restart and monitoring pause; device identity changes remove old evidence. Snapshot active incidents feed Needs attention; device details fetch bounded incident pages with revision validation, cancellation, empty/error states and a View checks action. See HOST-API.md for migration, retention and API bounds. External notification delivery remains unimplemented.
