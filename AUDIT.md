# NetWatch repository audit

Audited on November 21, 2026. Scope is the local NetWatch 0.2.2 checkout on fix/dashboard-layout at 6b51e33, including five existing uncommitted toolbar-related edits. Line references point to that working tree unless a release tag is named.

## 1. Repo overview

NetWatch is a local-first Windows network monitor. One host owns the saved network and observations. A browser can keep its own draft map and replace the host inventory through an explicit, revision-checked review. This audit assumes one Windows host, one operator, a few optional LAN viewers, and workloads from small maps to the requested 500+ device stress case.

| Area | Role |
| --- | --- |
| index.html, src/main.jsx, src/App.jsx | Vite and React entry, session and navigation, draft editing, local storage and JSON import/export. |
| src/Dashboard.jsx, src/LinkOverview.jsx, src/TopologyDiscovery.jsx | Interactive React Flow map, reachability and port evidence, redundancy, nearby results, and manual and scheduled discovery controls. |
| host/main.js, host/server.js, host/routes/ | Node entry, loopback and optional HTTPS LAN listeners, API routing, request and role checks, scheduled jobs, and built UI serving. |
| host/store.js, host/dynamics.js, host/maintenance.js | SQLite inventory, observations, retention, topology incidents, migration, and offline backup/restore. |
| host/discovery.js, host/topology-discovery.js, host/snmp-probe.js, host/windows-probe.js | Bounded neighbor and optional ICMP discovery, enrolled-device topology discovery, SNMPv3 and Windows ICMP helpers. |
| desktop/, scripts/, tests/, .github/workflows/, docs/ | Windows launcher and packaging, browser and hardware checks, Node unit/integration fixtures, CI, and operational docs. |

Vite builds to dist/. React, React DOM, React Flow and Lucide execute in the browser. Tailwind, PostCSS, Autoprefixer, Vite and its React plugin are build tooling. ESLint, Prettier and Playwright are development tooling. net-snmp is a pinned host dependency. Node supplies SQLite. The browser uses same-origin /api/v1 requests and a server-sent event stream, with conditional snapshot polling as fallback. It keeps last-known observations and ages them using the host policy. The Windows launcher starts the host separately from the browser.

## 2. Command results

Windows, Node 26.13.1, npm 11.20.0. Install, build and test commands ran in a separate temporary copy of the working tree. Browser checks used in-memory or temporary fixture databases and loopback only.

| Command | Result |
| --- | --- |
| npm.cmd install --prefer-offline --no-fund --no-audit --fetch-retries=0 | Passed. 225 packages installed. Audit ran separately. |
| npm.cmd test | Passed. 203 passed, 0 failed, 0 skipped, 0 cancelled, about 39 seconds. An initial PowerShell harness invocation mis-splatted the test argument and ran no tests. The corrected command passed. |
| npm.cmd run build | Passed. Vite 8.3.8 warned about a chunk over 500 kB. The main JS asset was 557.32 kB before gzip and 173.86 kB gzip. CSS was 52.13 kB before gzip and 10.31 kB gzip. |
| npm.cmd run lint and npm.cmd run format:check | Both passed for host/ and src/. |
| Typecheck | No typecheck script. This repository uses JavaScript. |
| npm.cmd audit --json | Passed. Registry response reported zero advisories across the resolved dependency tree. This is a registry snapshot. |
| npm.cmd outdated --json | Exit 1 means updates were available. Six direct packages listed below. |
| Dashboard and topology-discovery browser checks | Existing Playwright checks both passed in Edge. A separate fixture confirmed the remaining wheel-scroll issue in B-01. No existing test was observed to be flaky in this run. |

| Dependency | Installed → registry latest | Reachability |
| --- | --- | --- |
| @xyflow/react | 12.12.1 → 13.0.2 | Browser runtime on both maps. Major update needs compatibility testing. |
| lucide-react | 1.72.0 → 1.77.0 | Browser runtime icons. |
| net-snmp | 3.29.2 → 3.29.3 | Host runtime when SNMPv3 is used. Pinned. |
| autoprefixer | 10.6.2 → 10.7.0 | CSS build only. |
| postcss | 8.5.32 → 8.5.33 | CSS build only. |
| tailwindcss | 3.4.19 → 4.3.5 | CSS build only. Major update needs migration review. |

No dependency above had a matching advisory in the audit response. Being behind the latest release is tracked separately from vulnerability status.

## 3. Findings by severity

| ID | Severity | Category | Finding |
| --- | --- | --- | --- |
| A-01 | High | A | Discovery decisions can be committed before the browser saves the draft. |
| A-02 | Medium | A | Scheduled and externally initiated runs can remain invisible in an open Discovered page. |
| B-01 | Medium | B | The dashboard scrolls again, but the map still captures ordinary wheel input. |
| D-01 | Medium | D | Restoring a database can reinstate old LAN access settings and roll back audit history. |
| E-01 | Medium | E | Mass-isolation analysis does synchronous repeated graph work on the host. |
| B-02 | Low | B | The editor inspector uses 11 px for the selected device type. |
| C-01 | Low | C | Clickable dashboard devices are announced as groups. |
| F-01 | Low | F | Dashboard browser checks miss the wheel-scroll and expanded-panel starting position. |
| G-01 | Low | G | Upgrade guidance is split between the installer flow and a later recovery section. |

## 4. Detailed findings by category

### A. Bugs and logic

**A-01 · High · A — Accepting discovery can consume a proposal without saving it.**

- **Where.** host/routes/topology-discovery.js:138–144, src/TopologyDiscovery.jsx:136–149, src/App.jsx:117–151, src/DiscoveredDevices.jsx:101–121.
- **Evidence.** Preview validates the draft merge without persisting it. On confirmation the host changes proposal status before returning, then the browser stages it. The browser only writes localStorage in a later effect. A lost response after host acceptance or a browser storage failure leaves the proposal accepted while the browser has no durable copy. The success message runs before that persistence result is available. Nearby bulk add has the same split between host-side status and browser-side draft staging.
- **Impact.** An operator can lose the reviewable result and need another scan or need to recover an unsaved draft. Saved monitored inventory still requires its separate replacement step.
- **Fix.** Make a reviewed patch retrievable and retryable after acceptance. Surface browser persistence failure before claiming the draft was saved. Add a failure-path test for localStorage refusal after host acceptance.

**A-02 · Medium · A — Discovery view can miss runs started elsewhere.**

- **Where.** src/TopologyDiscovery.jsx:81–117, host/main.js:130–145, host/routes/topology-discovery.js:28–38.
- **Evidence.** The page loads the latest run once on mount and polls only when its local run already has status running. The scheduler can start a new run while this view is idle. With the page left open and no manual refresh or remount, the browser never asks for that new run. If an active-run poll fails, its empty catch retries every second while still showing the old progress.
- **Impact.** Operators can miss proposals or mistake stale progress for an active job.
- **Fix.** Refresh the latest run while the page is visible, including after idle periods. Mark poll failures, back off and provide a retry. Test scheduler activity after the page has loaded and a host restart during a run.

**Status and link evidence reviewed.** src/health.js:8–25 treats absent, invalid and future checks as unknown, compares numeric timestamps, and marks a check stale after the configured boundary. Disconnection is independent of Down. Tests cover timestamp and mixed endpoint cases. Port evidence is separate from reachability. host/routes/snapshot.js:10–23 only supplies fresh port evidence for a running or degraded port collector. src/refocus.js:75–107 checks both ends and their timestamps. With no fresh mapped port readings, every link can legitimately be unverified even if both devices answer reachability checks. Current src/LinkOverview.jsx:26–41, 106–140 provides one legend and one link list, including expandable bundles. Check SNMP enrollment, mapped interfaces, and evidence age before treating a map full of question marks as a defect. No confirmed timezone arithmetic defect in the reviewed paths.

### B. Layout and UI

**B-01 · Medium · B — Map wheel capture still interrupts page scrolling.**

- **Historical root.** At tag v0.2.2, src/dashboard.css:1–15 gave the dashboard shell a fixed 100dvh height and clipped overflow. The dashboard itself was outside the scrolling .page-content. The map could shrink to zero under src/dashboard.css:120–125. src/Dashboard.jsx:571–589 placed the expanding LinkOverview above the map at line 733, and src/dashboard.css:935–955 added internal scrolling to tools and lists. A tall open overview could consume the map's space without giving the dashboard a vertical scroll path.
- **Current evidence.** src/dashboard.css:1–5, 108–113, 511–514 now uses a minimum-height shell and a stable map. src/Dashboard.jsx:719–824 places details below it. With seven unmonitored links expanded at browser zoom 100%, the map started at y=161 at 1366×768 and y≈349 at 390×844. The document heights were 1196 and 1353 px respectively. A wheel gesture over the map kept document scrollY at 0 on both because the Dashboard leaves React Flow's wheel zoom and scroll prevention at their defaults.
- **Impact.** The original clipping is resolved on this checkout. A pointer over the primary canvas still cannot use an ordinary wheel gesture to reach the now-below-map details.
- **Fix.** Let unmodified wheel input scroll the document, while retaining explicit zoom controls and modifier/pinch zoom. Test the gesture from within the canvas.

**B-02 · Low · B — Editor device type is below the requested text size.**

- **Where.** src/styles.css:583–587 and src/App.jsx:685–688.
- **Evidence and impact.** The selected-device inspector renders the type at 11 px at 100% zoom. This is core device context in an otherwise readable inspector.
- **Fix.** Use the existing 13 px metadata token and verify at narrow widths.

### C. Accessibility

**C-01 · Low · C — The map's device action has a group role.**

- **Where.** src/Dashboard.jsx:362–390.
- **Evidence and impact.** Enter and Space open details and the accessible label describes the action. The focusable node still declares ariaRole group. Users navigating by button role cannot find the canvas action that way. The Devices view provides native Details buttons as an alternative.
- **Fix.** Expose a dedicated button for the detail action or use button semantics for the actionable node without nesting its information button inside a button. Verify the accessibility tree and Enter/Space behavior after the change.

**Other checks.** Dashboard nodes expose text labels for status, and CSS supplies focus outlines. src/useModal.js:4–37 initializes and restores focus, handles Escape, and wraps Tab for its controls. This review did not substitute a full screen-reader walkthrough for these source and browser checks.

### D. Security

**D-01 · Medium · D — Full SQLite restore can roll back access policy and audit history.**

- **Where.** host/maintenance.js:187–236, host/store.js:143–157, docs/REMOTE-ACCESS.md:76.
- **Evidence.** The backup is a full VACUUM INTO copy with password and session hashes and audit records. Restore replaces the live DB with a copy of the backup, clears sessions and SNMP enrollment, and retains the backup's auth_config and audit_log. A legitimate restore from before a password rotation or viewer-policy change restores the older hashes and mode and drops newer audit rows. Remote access docs do warn about the auth rollback.
- **Impact.** An offline recovery operator can inadvertently reactivate a prior access policy on the next LAN startup. The recovered audit history cannot account for events after the backup.
- **Fix.** Present the access and audit consequences at the restore command. Require review of the restored LAN policy before serving remotely and retain a separate audit export or preserve post-backup audit history where retention policy permits.

**Boundaries checked.** host/server.js:62–158, 196–242 and host/lan.js:19–44 gate access using the actual socket peer, Host and Origin checks, role and write token. Audit read and export are loopback-only. Local OS processes are trusted by design and someone with filesystem write access can change the same SQLite file, so it is an operational log rather than tamper-evident evidence. Nearby scan requests are rate limited, with an in-flight guard, explicit opt-in, scope and worker bounds. The topology seed is resolved against authorized enrolled devices and private ranges. Windows probing and discovery launch fixed executables without a shell. Reverse DNS output is sanitized as a display hint. No source-confirmed command injection, arbitrary browser scan target, or remote audit bypass in the paths reviewed.

Browser JSON import checks size before parse, validates topology and asks before replacement. Export stores map metadata such as names, IPs and descriptions, which can still be sensitive. Passwords and tokens are not part of the topology model. The static handler sets CSP, frame restrictions and nosniff, and API responses do not opt into CORS. No raw HTML rendering sink was found in src/. .env.example is explicitly a reference file, with real env files ignored. The history check across 159 reachable commits looked for tracked env, key, credential-vault and SQLite file names and common high-signal private-key or token patterns. It found the example env file and no matching live secret. This was a pattern review of reachable refs, without scanning all historical blobs with a dedicated detector or inspecting deployed machine credentials.

### E. Reliability and performance

**E-01 · Medium · E — Redundancy incidents can block the host during a large outage.**

- **Where.** src/failure-impact.js:3–19, 70–95, host/dynamics.js:118, host/main.js:53–57.
- **Evidence.** Incident attribution reconstructs a graph and runs reachability once per isolated device, then builds and scans impact sets. With synthetic path graphs and all non-root devices marked isolated, a local run of this pure function took 90 ms at 500 nodes, 312 ms at 1,000 and 1,264 ms at 2,000. This is a stress case, without surrounding database or rendering cost. It runs synchronously from the interface evidence callback.
- **Impact.** A large correlated outage can delay API replies, event-stream updates and other timers precisely when the UI is needed.
- **Fix.** Reuse an adjacency representation and compute root cut/dependency information once per topology, or use a bounded worker if necessary. Add a mass-isolation perf fixture with a measured event-loop latency budget.

**Other checks.** Snapshot monitoring has timeouts, bounded stream slots, shared frame caching, and visibility/unmount teardown in src/monitoring.js:326–453 and host/routes/events.js:1–86. The map enables React Flow visible-element rendering at 120 devices or 200 edges in src/Dashboard.jsx:740. That does not bound topology calculations or the DOM produced by an expanded Connections list. The build warning is measured above. Whether chunk splitting improves real startup and how a 500+ device map feels on the intended PC remain **Unverified**. Profile initial load and interaction time with a 500-device fixture and mixed port evidence before tuning or changing dependencies.

### F. Tests and tooling

**F-01 · Low · F — Layout assertions miss the expanded-map scroll path.**

- **Where.** scripts/check-links-dashboard-browser.mjs:76–110 and .github/workflows/checks.yml:63–79.
- **Evidence.** The desktop viewport loop checks position and height before opening overview. Opening Connections later checks stable map height, row count and focus. No assertion wheels from the canvas to the disclosed content and back to the map. The existing script passed with B-01 present.
- **Impact.** A regression in the relevant reading and navigation path can pass CI.
- **Fix.** Test both requested desktop sizes and a narrow viewport with sections expanded, asserting native scroll and map position and measuring actual node visibility rather than only container bounds.

**Other checks.** CI runs tests, lint, format, build and audit, plus fixture browser scripts. It explicitly excludes the credentialed remote-browser check from the general fixture job. Existing fixtures cover health boundaries, topology validation, discovery, failure calculations and corrupt backup handling. The gaps with direct evidence are the failure paths in A-01 and A-02 and the outage-scale case in E-01. npm.cmd is for Windows instructions. The CI uses npm on its platform runners.

### G. Docs and maintainability

**G-01 · Low · G — Upgrade instructions make the offline backup easy to miss.**

- **Where.** README.md:15–25, 110, 170, docs/HOST-API.md:103, desktop/NetWatch.cs:165.
- **Evidence.** The opening installer steps say to run setup then Start. The required matching backup appears later, and the incident section says existing databases upgrade automatically. The host actually blocks a legacy DB without the named backup. The launcher emits a generic startup hint when it cannot continue, so the opening instructions provide little help identifying the migration gate.
- **Impact.** Returning users can install successfully and still have no dashboard until completing a mandatory recovery prerequisite.
- **Fix.** Put the stopped-host backup step and version-specific link directly in the install flow, distinguish fresh setup, and surface an actionable backup-required startup reason.

## 5. Top five fixes

| Priority | Fix | Rough effort |
| --- | --- | --- |
| 1 | A-01 · Keep accepted draft patches recoverable and test browser persistence failure. | 1–2 days |
| 2 | E-01 · Reduce repeated graph passes in outage attribution and add a load fixture. | 1–3 days |
| 3 | A-02 · Refresh idle topology discovery and report interrupted polls. | ½–1 day |
| 4 | D-01 · Add restore-time LAN policy review and audit retention handling. | ½–1 day for guardrails and docs, longer if history must be merged |
| 5 | B-01 and F-01 · Restore normal wheel scroll over the map and test it with expanded details. | ½–1 day |

## 6. Questions

- What is the target deployment size and topology mix for a large-map performance budget?
- Should an offline database restore keep the machine's current LAN access policy and audit history, or restore the policy from the backup after an explicit review?
- Should ordinary wheel input scroll the Dashboard everywhere, with a modifier reserved for graph zoom?

**Verification limits.** No real-device discovery, live LAN sign-in, full screen-reader walkthrough, installer upgrade or 500+ device browser benchmark was performed. The scope was reachable Git history and the local code, with deeper reads in the command, storage, auth and discovery paths. Only this report was added to the checkout.
