## Phase 2: LLDP topology discovery (recursive crawler producing proposals)

### Concepts
- Seed: one saved device (usually the main router) with enrolled SNMPv3 credentials. The admin starts a run from the UI or API.
- Crawl: breadth-first traversal outward over LLDP neighbors. Output is a **discovery run** of proposed devices and links with evidence and confidence. Nothing is applied automatically.

### Data to read per device (SNMPv3, read-only)
- Identity: sysName 1.3.6.1.2.1.1.5.0, sysDescr .1.0, sysObjectID .2.0, lldpLocChassisIdSubtype/lldpLocChassisId (1.0.8802.1.1.2.1.3.1.0 / .2.0), local sysName and capabilities.
- Interfaces: ifIndex, ifName (1.3.6.1.2.1.31.1.1.1.1), ifAlias (...31.1.1.1.18), ifDescr, ifOperStatus, ifAdminStatus, ifHighSpeed (...31.1.1.1.15).
- LLDP local ports: lldpLocPortTable (1.0.8802.1.1.2.1.3.7) mapping lldpLocPortNum to port ID subtype, port ID, and description.
- LLDP remote neighbors: lldpRemTable (1.0.8802.1.1.2.1.4.1.1), indexed by (timeMark, localPortNum, remIndex): chassis ID subtype and ID, port ID subtype and ID, port description, system name and description, capabilities (supported and enabled).
- Management addresses: lldpRemManAddrTable (1.0.8802.1.1.2.1.4.2), handling IPv4/IPv6 and address subtypes.
Use GETBULK with bounded max-repetitions and a hard row cap, falling back to GETNEXT. Handle noSuchObject, noSuchInstance, endOfMibView, tooBig. An empty LLDP table is a valid result recorded as a diagnostic ("LLDP table empty"), not an error.

### Port resolution
Resolve every LLDP port to a local ifIndex/ifName by matching the port ID subtype (interface name, MAC, local, ifAlias) against lldpLocPortTable and ifTable. When no confident mapping exists, keep the raw value with `port_resolved = false` and low confidence. Never guess an ifIndex. LLDP port numbers are not necessarily ifIndex.

### Verification
- `verified`: both ends report each other with consistent port IDs.
- `single_sided`: only one end reports, with a recorded reason.
- `conflict`: ends disagree on the port or device. Surfaced and never auto-accepted.
- `unresolved_port`: port mapping not confident.

### Crawl algorithm and safeguards
- BFS with a visited set keyed by chassis ID (so loops and multi-IP devices terminate).
- Follow only neighbors whose capabilities include router or bridge/switch and that advertise a usable management IP inside the admin-configured allow-list (CIDRs). Default allow-list: the private ranges the existing discovery feature uses, narrowed to directly connected ranges plus admin additions. Reject loopback, link-local, multicast, and public addresses by default. Treat spoofed LLDP data as the threat this controls.
- Record but don't follow phones, APs, hosts, and unknown-capability devices.
- Configurable limits with safe defaults: max devices per run (200), max depth (8), max neighbors per device (512), per-device time budget, global run budget, max concurrent SNMP sessions (4), per-device rate limit, SNMP timeout (2-3s), retries (1). A run stops cleanly at a limit and reports it.
- Use a separate bounded work queue that yields to the ~10 second collector, and prove it does not degrade the collector.
- Failure isolation: a timeout, credential rejection, wrong auth/priv protocol, empty LLDP, or malformed data must not abort the run. Record the node as "discovered, not manageable" with the specific reason, and still propose the node and the link seen from its neighbor.
- Cancellation stops new SNMP requests promptly and marks the run partial. Only one run at a time per host, enforced server-side.

### Credentials
- Reuse existing encrypted storage. Discovery uses a credential profile chosen by the admin (default: the seed's profile) for newly discovered devices, optionally an ordered list with a small cap on attempts per device (avoid account lockout storms). Report auth failures without revealing credentials. Credentials for a new device are saved only when an admin accepts that device.

### Proposals and review
- Reuse and extend the existing LLDP proposal mechanism if it fits. Store runs, proposed devices, proposed links, diagnostics, evidence (which device reported which normalized LLDP row), confidence, and status (proposed, accepted, rejected, superseded).
- Admin-only review UI: discovered tree and list with filters (verified only, needs attention, not manageable), device and link evidence, accept all verified, accept or reject individually, and a preview of exactly what will change in the draft map.
- Accepting writes to the **draft map** only. Applying still goes through "Use this map" and "Confirm replacement". Accepting never turns checks on, and never removes devices or links absent from a run. Discovered devices merge with existing ones by chassis ID, then management IP, never duplicating. Preserve user edits.
- Place new devices using the existing next-free-grid-cell logic (or by depth from the seed if trivial), keeping Circle and Tidy layouts working.

### API and config
- Endpoints under the versioned API (for example POST /api/v1/discovery/runs, GET .../runs/:id, POST .../cancel, GET .../proposals, POST .../accept and .../reject), admin-only, with the existing write protections on every mutating call. Viewers receive no discovery data. Poll-friendly progress status; use SSE only if it already exists.
- Audit entries for run started/cancelled/completed and proposals accepted/rejected, without secrets.
- Settings for allow-list, limits, timeouts, concurrency, and credential profile, following existing patterns. Discovery runs only when an admin starts it (no scheduling in this phase). Document everything in docs/HOST-API.md.

### Tests (fixtures or in-process SNMP fake in tests/fixtures/; use replay of recorded walks if practical)
Linear chain; tree; ring/loop; redundant dual links; same hostname on two devices; one device on two IPs; neighbor with no management address; neighbor outside the allow-list; public or link-local address; timeout; credential rejection; empty LLDP; malformed or oversized data; one-sided LLDP; mismatched ports; unresolved port IDs; chassis ID subtype variations; port ID subtype mapping to ifName, ifAlias, MAC; phones/APs/hosts; each limit producing a clean partial run; cancellation; concurrent run rejection; authorization (unauthenticated, viewer denied, admin allowed, CSRF/write header); secrets never present in responses, logs, audit entries, errors; hostile strings sanitized end to end; accept flow (draft only, no checks enabled, no deletes, merges not duplicates, preserves edits); migration on an existing database; collector timing unaffected during a large fake crawl.
Acceptance: from a router with one enrolled credential, a run discovers a fixture network of at least 3 levels and 8 switches and proposes the correct devices and links, and nothing in the monitored network changes without the existing manual confirmation.
