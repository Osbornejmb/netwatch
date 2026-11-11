# NetWatch implementation roadmap

This is the proposed implementation order, not a claim that monitoring exists. Dates are intentionally unset until scope and hardware access are confirmed. The checked-in GitHub plan is the source for publishing milestones and issues.

## M1 — Reliable topology foundation

Editable, recoverable local topology with repeatable checks.

### 1.1 Verify the starter foundation

Depends on: none.

- [ ] Run npm ci, npm test, and npm run build on a clean Node 22 checkout.
- [ ] Exercise add, drag, connect, keyboard delete, search, export, and import.
- [ ] Verify corrupt storage pauses autosave and failed writes offer an export backup.

### 1.2 Finish device editing and accessible workflows

Depends on: 1.1.

- [ ] Edit device names, management addresses, and descriptions in the inspector.
- [ ] Validate IPv4/IPv6 addresses; reject duplicate management addresses with field errors.
- [ ] Keep dialog focus inside, return focus on close, and provide keyboard alternatives to dragging.
- [ ] Add browser checks for edit, delete, import cancellation, and narrow-screen use.

### 1.3 Complete inventory navigation and recovery UX

Depends on: 1.2.

- [ ] Make Overview, Topology, and Devices navigation reach working sections.
- [ ] Provide a device list and clear empty/search states.
- [ ] Offer explicit recovery/download of unreadable saved data before reset.

## M2 — Windows monitoring backend

Persist inventory and run controlled ICMP checks on the Windows host.

### 2.1 Add a local API and SQLite inventory

Depends on: 1.3.

- [ ] Create a Node API bound to loopback by default with a health endpoint.
- [ ] Implement versioned SQLite migrations and topology CRUD with validation.
- [ ] Keep browser export/import compatibility and provide backup/restore instructions.
- [ ] Return useful errors and test invalid input, transactions, and persistence after restart.

### 2.2 Implement bounded Windows ICMP monitoring

Depends on: 2.1.

- [ ] Probe only explicitly configured and authorized device addresses.
- [ ] Pass addresses as process arguments without a shell; validate addresses at the API boundary.
- [ ] Limit concurrency, timeout, retry count, and polling frequency; cancel work on shutdown.
- [ ] Store timestamp, latency, and up/down/unknown states; test timeout and recovery with fake probes.

### 2.3 Connect live status and history to the UI

Depends on: 2.2.

- [ ] Display last check time and clearly distinguish unknown, stale, up, and down.
- [ ] Recover cleanly from API loss without marking every device down.
- [ ] Show recent device history and test offline/reconnect behavior.

## M3 — Network intelligence

Add controlled SNMP/LLDP and redundancy information.

### 3.1 Add SNMPv3 interface collection

Depends on: 2.3.

- [ ] Keep credentials in the Windows credential store or encrypted host storage, never browser JSON.
- [ ] Prefer SNMPv3; make legacy access explicit and documented.
- [ ] Collect interface state and counters with bounded requests and vendor fixtures.
- [ ] Redact credentials from logs, errors, exports, and API responses.

### 3.2 Review LLDP neighbors before topology changes

Depends on: 3.1.

- [ ] Collect LLDP only from configured devices.
- [ ] Present discovered neighbors and proposed links for user approval.
- [ ] Avoid duplicates and preserve manual topology edits; test partial and stale discovery.

### 3.3 Model uplinks and router redundancy

Depends on: 3.2.

- [ ] Allow explicit port/uplink labels and redundancy group membership.
- [ ] Distinguish device, interface, and group health.
- [ ] Verify partial failure and recovery against documented fixtures.

## M4 — Secure remote operations

Gate remote access behind identity, transport security, and operational checks.

### 4.1 Add authentication, roles, and audit records

Depends on: 3.3.

- [ ] Require authentication before any non-loopback access.
- [ ] Enforce viewer/operator/admin permissions on every backend action.
- [ ] Protect sessions, throttle login attempts, and record changes without credentials.
- [ ] Test unauthenticated access, cross-role denial, session expiry, and request forgery.

### 4.2 Implement alerts with deduplication

Depends on: 4.1.

- [ ] Configure approved notification destinations with test delivery.
- [ ] Debounce flapping, deduplicate incidents, and send recovery messages.
- [ ] Keep delivery retries bounded and test outages without sending real notifications.

### 4.3 Package and verify the Windows deployment

Depends on: 4.2.

- [ ] Provide Windows service installation, restart, update, and uninstall instructions.
- [ ] Document HTTPS reverse proxy or VPN access and least-privilege firewall rules.
- [ ] Test backup restoration and reboot recovery on a Windows host.
- [ ] Complete security review before any remote exposure.

