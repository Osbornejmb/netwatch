# NetWatch architecture

## Implemented foundation

React + Vite opens the network health dashboard by default. `src/Dashboard.jsx` renders a viewport-filling read-only React Flow map with title/status, optional View controls, and click-to-open detail dialogs. App.jsx provides horizontal Dashboard/Topology editor/Devices navigation; the supporting device table is shown only for the Devices view. The existing topology canvas remains available through Edit topology. Router and switch components share the topology data contract. `src/topology.js` validates imported and saved maps and strips untrusted rendering properties. The browser stores a versioned topology; export/import is the portability boundary. Existing v1 exports remain readable.

The system has no active probes, backend, authentication, or live status. Example addresses are inventory placeholders. Management address text is descriptive in this phase; backend address validation is mandatory before any probes exist.

## Planned system

Browser UI → authenticated API → SQLite inventory/history.
The Windows service will own bounded ICMP workers and SNMP/LLDP collectors; browsers will never launch probes or receive device credentials. Start with one service and one database. Add separate workers only when measured load requires them.

API routes proposed for M2: GET /api/v1/health, GET/PUT /api/v1/topology, GET /api/v1/devices/:id/checks. Define pagination, error responses, and authorization before implementation. These routes do not exist yet.

Topology JSON: schemaVersion 1, nodes[{id,type,position:{x,y},data:{label,ip,description}}], edges[{id,source,target,label,sourceHandle,targetHandle}]. Node IDs and link IDs are unique within their collections. Links reference existing distinct nodes. Limits: 2,000 nodes, 10,000 links, 5 MB import. This version has no credentials or monitoring results. Reject unsupported future schema versions rather than silently migrating them.

## Trust and data boundaries

Treat browser storage, imported files, API input, discovery results, and device responses as untrusted. Validate at each boundary. Never interpolate device addresses into shell commands. Probe only configured authorized inventory, with rate/concurrency/time bounds. Keep secrets in host-managed secure storage; exclude them from logs, exports, and repository history.

Bind development and the future API to loopback by default. LAN development is explicit. Remote access requires authentication, authorization, HTTPS or VPN, audit records, and restrictive firewall rules. No public development-server deployment.

## Recovery and delivery

A failed storage read pauses autosave until the user explicitly replaces the saved data. Failed writes display a warning and preserve the in-memory map for export. Import replacement requires confirmation. CI runs the topology self-checks and production build. Browser interaction and Windows hardware checks remain separate acceptance work in the roadmap.

## Dashboard observations

`src/health.js` defines the UI health policy separately from inventory: up/down only from valid timestamped observations, stale after 90 seconds, unknown for absent/invalid/future data. The freshness threshold is a prototype limit to replace with the collector polling policy. Actual inventory currently has no observations and is always unmonitored. Sample mode uses a separate documentation-address fixture, frozen timestamps, and an explicit banner. It never writes sample nodes/checks to storage. Connection lines use connectionHealth(source, target): a down endpoint is red, missing/unknown evidence is gray, stale evidence amber, and two up endpoints green. This is an endpoint-reachability summary, not measured interface health or BGP session state. Device observations remain independent, so a responding switch stays up when a router fails. A monitoring service connection failure must not be translated into device failures when the backend is added.

System fonts replace the starter's Google Fonts import so the dashboard does not need a font CDN at runtime. `src/dashboard.css` contains the light dashboard tokens; the editor retains its original dark workspace. No dependencies or storage schema changes were added.

## Device selection

`src/DeviceDetails.jsx` uses a native modal dialog opened from map nodes or inventory Inspect. It shows the selected device and its connected peers/path summaries. The browser traps focus; close button, Escape, and backdrop dismiss it, and focus returns to the trigger. `createSampleNetwork` still supplies a separate fixture; the dashboard adds an explicit primary-router failure/restore preview without writing to storage.
