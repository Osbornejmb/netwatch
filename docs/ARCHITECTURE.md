# NetWatch architecture

## Implemented foundation

React + Vite renders a topology canvas using React Flow. Router and switch components share the topology data contract. `src/topology.js` validates imported and saved maps and strips untrusted rendering properties. The browser stores a versioned topology; export/import is the portability boundary. Existing v1 exports remain readable.

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
