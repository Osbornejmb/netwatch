# Issue #7 local implementation checkpoint

2026-11-13 — branch `feat/snmp-interfaces`; implementation remains local, with physical Cisco acceptance pending. The owner confirmed the Catalyst 3750 and Cisco 2811 are not connected yet. No physical-device probes or configuration changes were performed.

Implemented opt-in, read-only SNMPv3 authPriv interface collection, SHA-1/SHA-256 with AES-128, Windows CurrentUser DPAPI credential enrollment, bounded workers/requests/deadlines, schema-v4 migration and latest-sample storage, conservative counter rates, and paginated device-details interface views. Interface evidence remains independent of ICMP reachability and incidents. Restore retains observations but revokes polling authorization. See [setup and limits](SNMP-INTERFACES.md).

Verification:

- Focused SNMP suite: 11/11 passed on Windows, including real encrypted loopback UDP exchanges, wrong credentials, DPAPI, migration/restore, API protection, counter precision, cancellation and storage bounds. Sandbox restrictions prevented networking/helper/rename checks in the initial restricted run; the same suite passed outside that sandbox.
- Full regression suite: 65/68 passed; three launcher tests could not bind occupied port 4317 (`EADDRINUSE`). The existing user host was preserved. This is not an all-green full-suite result.
- Production build passed. Isolated interface, monitoring and incident browser checks passed, including keyboard operation and 390px layouts. Browser fixtures never instantiate real-device collectors. The incident script now waits for its map node before keyboard activation.
- Hidden terminal credential enrollment was exercised using synthetic credentials only. Screenshots and protected test profiles remain ignored local artifacts.
- Freshness budgeting includes both the protocol deadline and credential-access allowance; focused tests passed after this final adjustment.

Remaining: approved management addresses and IOS versions, local credential enrollment, and read-only physical verification against both available Cisco models. Synthetic FastEthernet fixtures do not prove vendor/IOS support. Multi-device capacity testing remains deferred by the owner; no deployment capacity is claimed. Issue #7 remains open. The owner requested a PR for review; hardware acceptance and merge remain pending. Clean `npm ci` passed with zero audit vulnerabilities.
