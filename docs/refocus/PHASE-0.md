## Phase 0: Audit and plan (no code)
Read AGENTS.md, CONTRIBUTING.md, .agents/skills/netwatch-context, README.md, and everything in docs/ (ROADMAP, WORKLOG, SNMP-INTERFACES, ICMP-COLLECTOR, DISCOVERY, HOST-API, WINDOWS-LAUNCHER). Inspect host/, src/, tests/ and tests/fixtures/. Produce a written report:

1. **Information architecture.** Every page, route, and major component. For each: the question it answers and who uses it.
2. **Focus scorecard.** Mark each page/feature Core (directly shows links, uplinks, redundancy, path health), Supporting (feeds the core), Peripheral, or Distracting, with a one-line reason.
3. **Data model.** Do connections carry port-level endpoints? Is there a concept of uplink, redundancy group, baseline, primary vs backup path, port-channel? Document exactly how "Uplinks & redundancy" works today and how group status is computed from port readings. Document the schema for devices, connections, interfaces, incidents, history, and how migrations are versioned and run (and whether a backup precedes them).
4. **Existing SNMP and discovery code.** SNMP library, session handling, SNMPv3 auth/priv support, timeouts/retries, credential storage, encryption, redaction. The existing LLDP proposal feature: what it reads, how proposals are stored and accepted. The "Scan now" discovery feature and its limits.
5. **Map flow.** Draft map vs monitored map, "Use this map" / "Confirm replacement" validation, backup/restore, and the editor's undirected-connection rule.
6. **Authorization and audit.** Roles, loopback behavior, CSRF/X-NetWatch-Write, audit logging, and what the viewer projection omits.
7. **Scheduling.** How background work and the ~10 second collector run, so discovery and SNMP polling can't starve it.
8. **Gap analysis.** For each question, say whether the product answers it today, partially, or not at all, and why:
   a. Which devices connect to which, via which ports?
   b. Which links are uplinks, downlinks, or peer links?
   c. Is each link healthy at both ends (oper status, negotiated speed, errors)?
   d. Which switches have redundant uplinks, and are all usable?
   e. Which switches are degraded (lost redundancy but still connected)?
   f. Which uplink carries traffic vs stands by?
   g. What are the single points of failure?
   h. What gets isolated if device or link X fails?
   i. What changed recently (link added, lost, moved)?
9. **Trust audit.** Every place the product could currently show a misleading link state (for example a healthy-looking line because endpoints ping while a port is down or at lower speed).
10. **Proposed information architecture**, mapping each current page/feature to keep, merge, demote, or relocate, with a URL plan that keeps Dashboard/Edit map/Devices links, reload, and Back/Forward working.
11. **Phase plan with file-level changes, the schema migration, and risks.**
Wait for my approval before writing code.
