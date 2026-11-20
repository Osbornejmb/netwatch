# Task: Refocus NetWatch on uplinks and redundancy, and add automatic topology discovery

## Product intent (the north star)
NetWatch answers one question for a network admin:
"Are my routers and switches connected the way they should be, are their uplinks healthy, and if something fails, do I still have a path?"

Today NetWatch is closer to a generic device-reachability dashboard (ICMP up/down per device, a map, a device list). Reachability stays as an input but stops being the headline. The headline becomes link and path health, and redundancy status. Topology should be discovered automatically (LLDP crawl from the main router) instead of drawn by hand, but discovery only ever produces proposals for an admin to review.

Primary user: someone responsible for a multi-tier network (a main router, core/distribution switches, access switches, often with dual uplinks or port-channels) who wants one screen that says: "Is everything connected? Which switches run without redundancy? Which uplink carries traffic? What breaks if X fails?"

Non-goals (do not build or expand): generic server/service monitoring, endpoint monitoring as a primary feature, uptime/SLA percentages, PRTG-style general sensors, chat notification integrations, SNMP SET or any device configuration changes.

## Ground rules (apply to every phase)
- Do not guess about code you haven't read. If the codebase contradicts any assumption here, STOP and report instead of choosing silently.
- This is a refocus plus a new capability, not a rewrite. Reuse existing infrastructure: SNMPv3 port monitoring, LLDP neighbor proposals, the topology editor, "Uplinks & redundancy" groups, incidents, history, roles, and the review-then-apply map flow. If you build something parallel to an existing mechanism, explain why.
- Never change the meaning of existing states (Up, Down, Overdue, Not monitored), the two-consecutive-failures rule, the freshness policy, incident rules, or map line color semantics without flagging it and getting my approval. New concepts get new names and new visuals. The README states that line colors summarize endpoint reachability, not verified cable, interface or routing-session health, and that a responding switch stays Up when a connected router fails. Preserve that honesty. Never imply a verified link state the data does not support.
- Read-only toward network devices: SNMP GET/GETNEXT/GETBULK/WALK only. No SET, no SSH, no CLI scraping, no config pushes.
- Never delete, reset, or recreate the database. Migrations are additive, idempotent, and run after the existing backup mechanism (if none exists, tell me before adding one). Verify every migration on a database created by the previous schema version.
- Authorization is unchanged: viewer vs admin, loopback rules, CSRF and X-NetWatch-Write on every state-changing call. Viewers must not receive discovery data or administrative diagnostics. Any new data placed in viewer-visible responses must be explicitly reviewed against that rule.
- Treat all data from the network (LLDP/CDP strings, sysName, port descriptions, chassis IDs) as untrusted: length-limit, strip control characters, escape on render, never use in file paths, shell commands, or SQL string concatenation.
- Use server-provided timestamps for freshness in all new code, not the browser clock.
- Never write secrets (SNMP credentials) to logs, audit entries, API responses, error messages, test snapshots, or screenshots. Reuse the existing encrypted credential storage; don't add plaintext storage.
- Keep diffs focused. No unrelated refactors. Match .prettierrc and eslint.config.js, and stay compatible with Node 22.13+. Prefer existing dependencies. Add a new one (for example net-snmp) only if the repo has no usable SNMP client; justify and pin it.
- Work in phases. Finish and verify each phase, report, and wait for my approval before starting the next.
- Don't claim vendor or hardware compatibility you did not test. The README notes Cisco hardware verification is still pending.
