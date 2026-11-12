# NetWatch architecture

## Implemented foundation

React + Vite opens the network health dashboard by default. `src/Dashboard.jsx` renders a read-only React Flow map, status counts/filters, attention and detail panels, and a device table. The existing topology canvas remains available through Edit topology. Router and switch components share the topology data contract. `src/topology.js` validates imported and saved maps and strips untrusted rendering properties. The browser stores a versioned topology; export/import is the portability boundary. Valid v1 exports remain readable; invalid or duplicate management addresses are rejected without replacement (see README recovery guidance).

The system has no active probes, backend, authentication, or live status. Example addresses are inventory placeholders. Management addresses are validated as IPv4/IPv6 literals (or empty), with canonical IPv6 comparison and duplicate rejection. Backend address validation remains mandatory before any probes exist.

## Planned system

Browser UI → authenticated API → SQLite inventory/history.
The Windows service will own bounded ICMP workers and SNMP/LLDP collectors; browsers will never launch probes or receive device credentials. Start with one service and one database. Add separate workers only when measured load requires them.

API routes proposed for M2: GET /api/v1/health, GET/PUT /api/v1/topology, GET /api/v1/devices/:id/checks. Define pagination, error responses, and authorization before implementation. These routes do not exist yet.

Topology JSON: schemaVersion 1, nodes[{id,type,position:{x,y},data:{label,ip,description}}], edges[{id,source,target,label,sourceHandle,targetHandle}]. Node IDs and link IDs are unique within their collections. Links reference existing distinct nodes. Limits: 2,000 nodes, 10,000 links, 5 MB import. This version has no credentials or monitoring results. Reject unsupported future schema versions rather than silently migrating them.

## Trust and data boundaries

Treat browser storage, imported files, API input, discovery results, and device responses as untrusted. Validate at each boundary. Never interpolate device addresses into shell commands. Probe only configured authorized inventory, with rate/concurrency/time bounds. Keep secrets in host-managed secure storage; exclude them from logs, exports, and repository history.

Bind development and the future API to loopback by default. LAN development is explicit. Remote access requires authentication, authorization, HTTPS or VPN, audit records, and restrictive firewall rules. No public development-server deployment.

## Recovery and delivery

A failed storage read pauses autosave until the user explicitly replaces the saved data. Failed writes display a warning and preserve the in-memory map for export. Import replacement requires an accessible confirmation dialog. Unreadable original storage text is retained separately for download; denied access is distinguished from invalid content. Importing while recovery is active changes only the in-memory map and keeps autosave paused. A separate explicit replacement resumes autosave only after a successful write. Recovery/backup controls and failed-save warnings appear in both views. CI runs the topology self-checks and production build. Browser interaction and Windows hardware checks remain separate acceptance work in the roadmap.

## Dashboard observations

`src/health.js` defines the UI health policy separately from inventory: up/down only from valid timestamped observations, stale after 90 seconds, unknown for absent/invalid/future data. The freshness threshold is a prototype limit to replace with the collector polling policy. Actual inventory currently has no observations and is always unmonitored. Sample mode uses a separate documentation-address fixture, frozen timestamps, and an explicit banner. It never writes sample nodes/checks to storage. Link lines are configured topology only, not measured interface health or BGP session state. A monitoring service connection failure must not be translated into device failures when the backend is added.

System fonts replace the starter's Google Fonts import so the dashboard does not need a font CDN at runtime. `src/dashboard.css` contains the light dashboard tokens; the editor retains its original dark workspace. No dependencies or storage schema changes were added.

## Inventory editing

`src/inventory.js` defines literal-address normalization and duplicate comparison, shared by add/edit forms and topology import/storage validation. It rejects hostnames, CIDR/zone/bracket syntax and ambiguous IPv4 notation. IPv6 uses the WHATWG URL parser for validation and canonical compression, without network requests; IPv4-mapped IPv6 remains canonical IPv6. Empty addresses are unmonitored inventory entries. Invalid legacy saved maps pause autosave without changing the raw data; no persisted schema change is required.

`DeviceDialog.jsx` and `RecoveryDialog.jsx` share `useModal.js` for native modal dialogs, explicit Tab wrapping, Escape handling and focus restoration after close. Device fields have associated validation errors. Edits replace only device data, preserving type, ID, position and connections. Selection is derived from current nodes by ID, so edited/dragged details stay current. `InventoryControls.jsx` provides device selection, X/Y position updates and directed link creation/removal without canvas gestures. The existing pointer workflows remain available.
