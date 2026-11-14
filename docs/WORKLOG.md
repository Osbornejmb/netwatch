# Working checkpoint

## Current status (2026-11-14): opt-in local discovery

- Added opt-in Windows ARP discovery and optional bounded ICMP sweep over attached private IPv4 networks. Active probes share a host-wide eight-permit gate with monitoring ICMP. Discovery stays off by default and remains separate until explicit revision-checked Add to map; new devices remain monitoring-disabled. Schema v5 includes retained discovery rows in backup/restore.
- Loopback API, launcher controls, responsive review screen and fake-runner tests cover migration rollback, error freeze, three missed scans, subnet derivation, sweep cap, shared workers, pagination, rate limit and monitoring-off add. Focused discovery/collector tests passed. Full `npm test` passed 83/84; the remaining Windows DPAPI credential test fails in this environment. Production build passed.
- Browser check is present but Playwright is unavailable here. No real-network scan or Windows home-router comparison was performed. Optional reverse DNS/mDNS/SSDP hints are not included.

## Current status (2026-11-14): retain valid moves, snap only for overstretched connections

- Replaced the 64px anchor tether and unconditional release/tab reset with collision-only movement and connection-based validation on release. Each link allows max(320px, 1.5× arranged length), measured to the peer's current position; exceeding it restores the gesture's last valid positions. Unconnected devices are unconstrained except for collisions.
- App owns separate bounded session adjustments for host/draft/editor and Circle/Tidy. Valid pointer/keyboard moves and the selected dashboard source/layout/center survive tab/view changes; layout/source switching and browser blur retain valid adjustments. Structural graph changes invalidate stale geometry. Save layout saves the visible moved positions; host/storage formats and probe settings are unchanged.
- Tests cover connected-peer limits, long initial links, collision avoidance, retained moves, excessive-drag rollback, keyboard, navigation, both layouts and sources, saving and undirected links. Production build and six browser suites pass: focused movement/undirected, inventory, radial, desktop, 100-device scale and monitoring. Local npm test passes 74/77; three launcher lifecycle checks are blocked by the installed monitor on port 4317, which was preserved. GitHub Windows/Ubuntu CI and PR/merge status are recorded at handoff.


## Current status (2026-11-14): Circle default with shared layout constraints

- Circle is the default in Dashboard and Edit map. Both expose Circle/Tidy, sharing collision checks, the 64px tether, snap-back on release/view/tab changes and undirected-link handling. The editor Save layout action explicitly saves the selected layout.
- Replaced fixed 320px ring spacing with card-aware radii that clear every same-ring and earlier-ring card. Small vertical chains/opposite peers stay about 104px apart instead of 320px; crowded rings expand only as needed. Node/edge storage and host behavior are unchanged.
- Regression tests cover close circle spacing and non-overlap across small/high-degree/cyclic/disconnected graphs; browser checks exercise both layouts in both maps. Verification: production build and three desktop/narrow browser suites pass (drag/undirected across both layouts and maps, radial, desktop). npm test passes 73/76; three launcher lifecycle checks report EADDRINUSE because the installed monitor is running on port 4317. Monitoring was left running. The installed server references the new built assets; refresh the browser to load them.


## Current status (2026-11-13): tidy layouts, snap-back and undirected connections

- Both maps now default to compact, deterministic router-first layers with wrapped rows and separate component packing. Layouts ignore old scattered/stacked saved positions. Shared drag handling limits movement to 64 layout pixels, rejects card collisions and snaps back on release, view/layout/source changes and browser blur/hidden events. Only explicit Tidy layout persists positions.
- One rendered line and details/list entry per unordered device pair; reverse/parallel additions are blocked and removing a displayed connection removes all its old reciprocal records. Imported duplicate records and original coordinates remain intact until an explicit editing action. No host or persisted-format changes.
- Pure layout/drag/link regression checks and a focused desktop/narrow browser check cover compactness, overlap, snap-back, focus/tab resets, unchanged storage and undirected add/remove/render/details behavior. Production build and five browser suites pass (focused snap-back/undirected, inventory, radial, desktop, 100-device scale). Full npm test: 71/75 pass; the early-shutdown case passes on isolated rerun, leaving three launcher lifecycle checks blocked by the running installed host on port 4317. The installed monitor was preserved. No CI/publication is claimed.


## Current status (2026-11-13): integrate desktop-map commits with current main

- Reviewed all six desktop-map commits and merged current main into the branch, resolving overlapping App/Dashboard/CSS/docs/browser checks. Preserved the off-white redesign, direct map replacement reviews, persistent Outages, Ports and all host changes already on main; no new host/schema changes. Compact content-sized oblong routers, filters/attention, side handles, grid/tidy, hash navigation, connection copy, removal confirmation and responsive panels remain.
- Fixed backup anchoring for the newer full-height header, preserved open-outage attention even when current device evidence is up/paused, and used one node lookup for editor links. Browser checks cover desktop/narrow rendering, no pure-white UI, transfer-review/cancellation, editing and removal. 70 Node tests pass; production build passes. All 12 matching browser suites pass: desktop, redesign, inventory, Outages, Ports, dragging, recovery, radial, 100-device scale, empty startup, monitoring and topology. Fixed narrow View options positioning and updated reload checks for hash routes. Publication and CI status are recorded at handoff.


## Current status (2026-11-13): content-sized router oblongs

- Routers now use oblong borders in dashboard and editor, with intrinsic content width/height and compact padding. A shared 280px cap retains ellipsis/tooltips for unusually long names; switches remain 160×56 rectangles. Placement and radial spacing reserve the maximum router width. Stored topology is unchanged.
- Verification: 52 tests, production build and focused desktop/narrow Playwright check pass. Browser assertions verify both router renderers have no unused horizontal space; refreshed 1440px dashboard/editor screenshots.


## Current status (2026-11-13): desktop map refinements

- Five requested steps: compact shared cards/formatted CSS; visible counts/status/attention; nearest-side links and deterministic grid/tidy; connection copy/hash routes/removal confirmation/inline limit; anchored Backups and responsive Devices cards. Host code and v1 storage format unchanged.
- Focused Playwright check covers 1280–1920px and 320/390px, summary filters, accessible cards, solid stale paths, keyboard details, connection lifecycle, hash/reload/back, placement/removal and panel placement. Before/after 1440px screenshots and narrow/editor evidence are under docs/screenshots. Verification: 52 Node tests pass and the production build passes. The first full run exposed an incorrect new clearance-test expectation; corrected the test and reran successfully. Build ran once; no production edits followed it.
- Existing checkout had no forced 136px/ellipse override, Draft device caption or duplicate backup heading to remove. Real hardware and collector behavior are outside this UI change.


## Current status (2026-11-13): remove built-in demo data

- Removed the browser starter devices/links, generated preview statuses, preview/failure controls, demo watermark and sample-only rendering paths. Fresh browser and host inventories are empty; saved user inventory/history and import compatibility are preserved. Older saved devices are not silently erased; unwanted entries can be removed in the editor and explicitly saved to the host.
- Regression inventories/observations now live only under tests/fixtures; browser checks seed isolated contexts or intercept snapshot HTTP responses instead of using a production demo feature. Runtime source no longer imports synthetic network generators. Updated shared modal focus handling to exclude controls hidden inside collapsed history, preserving keyboard trapping.
- Rewrote README with Windows launcher installation, empty-network device setup, explicit host transfer/monitoring, status meanings, storage/backup, start/stop and current limits. Updated current architecture/design/product/host/launcher instructions. Historical acceptance records and screenshots remain as history.
- Verification: 50 Node tests, production build and nine browser suites pass (empty startup, topology, inventory editing, recovery, monitoring, host transfer, dragging, radial and 100-device scale). Empty desktop/390px screenshots are saved; user-created devices survive reload. No demo generator, starter labels or preview controls remain in the production bundle. CI/merge status is recorded in the PR; no physical devices were probed for this removal.


## Current status (2026-11-13): issue 2.3 (#6)

- Merged PR #30 (6190bb9) connects saved host inventory, snapshot health/freshness and device history to the dashboard; browser working copy and sample mode stay separate. Snapshot inventory is transactional with observations; history includes its inventory revision. Explicit saved-device monitoring uses conflict-checked writes, with no automatic retry or probes from the browser.
- Serial five-second polling has a 10-second deadline and cleanup; failures preserve last-known data while a one-second clock ages it. Details show last check/latency/service state and collapsible 25-row history pages (200 displayed maximum), with adjacent transitions and no uptime claims. Host dragging is view-local; browser saved-layout autosave is preserved.
- Added the user-requested Git Workflow & Branch Hygiene and UI & UX Copywriting Rules to AGENTS.md. PR #30 passed Ubuntu/Windows CI (including launcher build, ICMP loopback and host lifecycle); issue #6 is closed. Switched to current main, removed seven obsolete local branches and remaining merged remote branches, and pruned tracking refs; only main remains. Squash-merged branches were verified against merged PR histories before deletion; the context-skill draft was superseded by main.
- Verification: all 50 node tests and production build pass; controlled Windows Chrome checks cover failure/recovery, independent switch health, disconnect/stale/reconnect, history pagination, keyboard details, opt-in/conflict/address limits, sample isolation, deletion/empty inventory and 390px overflow. See monitoring-results.json and screenshots/monitoring-*.png. Final copy/menu checks and existing dashboard-drag, radial and host-transfer browser suites also pass; host deletion assertion now waits for the asynchronous snapshot refresh.
- Live phone dashboard acceptance now passes on the connected USB-authorized phone: genuine up -> third-failure down -> first-success up, visible history transitions, retained up on host disconnect, clock-driven stale after the real freshness window, and automatic reconnect to up. Default 30-second collection, zero collector/browser errors, desktop and 390px screenshots. Down followed Wi-Fi-disable completion by 84.287 s and recovery followed re-enable completion by 27.386 s; dashboard lag from the observations was 1.265/1.980 s. Evidence: phone-dashboard-results.json and screenshots/phone-dashboard-*.png, with the address masked.
- Phone Wi-Fi restored/address unchanged; temporary host stopped, lock released, temporary database/cache removed, existing inventory untouched. Issue #6 is merged and closed; evidence and unresolved release scope are also recorded in GitHub issue #16. Next: #11 local incident lifecycle, then the remaining release #16 checks; this single-phone test does not establish capacity or internet health.

### Unresolved work

- #11: local incidents, deduplication/recovery and optional approved notifications remain unimplemented.
- #16: full clean-install release/runbook, intended multi-device scale, incident acceptance, broader recovery/failure checks, launcher visual/DPI and tray-menu pointer validation remain open; one phone is not a full release gate.
- #7/#8/#9: SNMP/LLDP/interface/redundancy work remains planned. Hotspot clients are not guaranteed to appear in local discovery; LLDP proposals remain separate and do not guarantee phone discovery.
- #10/#12: authentication, protected remote browser access and an unattended Windows service remain planned; the interactive host must stay awake and signed in.
- Full screen-reader coverage and cross-device/browser/platform capacity are not established by the current evidence.

## Repo-local context skill (2026-11-13)

- Added .agents/skills/netwatch-context/SKILL.md and an AGENTS.md entry point. It routes implementation/debug/review to connected code, contracts and checks, promotes targeted reads instead of repeated full-document discovery, and preserves existing verification/authorization rules. Token savings are not benchmarked. Skill format and all referenced file paths were validated.
- Base checkpoint: PR #29 merged as 39c551d; launcher issue #28 is closed. Real-time dashboard issue 2.3 (#6) remains next. Earlier pending-merge launcher entries below are historical.

## Current work (2026-11-13): Windows local controls #28

- Bounded Ubuntu rerun identified the actual CI hang in a redundant post-crash restart assertion: TCP closed before lock cleanup, but cleanup could finish before the restart, so the supposedly refused host actually started. Removed that racy duplicate assertion; dedicated existing-lock refusal and no-orphan-listener checks remain. The independent delayed-listener production bug also remains fixed/covered. No platform tests were disabled; fresh CI is required before acceptance.

- Ubuntu CI and its requested retry hung in desktop lifecycle tests, revealing an early Stop/listen race after the initial review. Reproduced on Windows with a delayed-listen fixture: old host stayed alive and hit the failure deadline; the fix closes any late listener when stopping and does not start collection/readiness. Targeted lifecycle suite now passes all four tests, including the deterministic regression. Added a subprocess watchdog and bounded CI job duration; Ubuntu tests remain enabled. New full-suite/CI evidence supersedes the earlier acceptance checkpoint before merge.

- Final PR #29 review found no merge-blocking code defects or unresolved review threads. Replayed actual installed shortcut activation into the same controller, native Start/Stop/Quit, UTF-8 status, empty inventory and lock release; preserved user preferences and probed no devices. CI passes all 46 tests/build, Windows launcher compilation and loopback/lifecycle checks. Native screenshot capture still fails; visual/DPI and tray-menu pointer checks are explicitly tracked in issue 2.5 (#16) as release validation, not falsely reported as passed. Launcher accepted for the user-authorized merge; real-time dashboard issue 2.3 (#6) remains next.

- Issue #5 merged through PR #27 as a08c179 and is closed. Current branch feat/windows-launcher adds a locally compiled per-user WinForms tray app, optional Desktop shortcut, Start/Stop/Open Dashboard/Quit and ICMP opt-in. Private Node parent-child IPC owns graceful shutdown; closing/hiding a control window or browser does not stop monitoring. LOCALAPPDATA/NetWatch stores data/settings outside the checkout; existing databases are not migrated or overwritten.
- Real-process tests cover start/stop/restart, controller input closure, occupied port without affecting another host, existing locks and controller death/unclean-lock reporting. Windows native keyboard/accessibility checks exercised Start, hide-to-tray with host still ready, duplicate launch restoring the same window, Stop with released lock, Open Dashboard and Quit. The per-user launcher/shortcut were installed; ICMP remains disabled and its inventory starts empty. Screenshot capture timed out, so visual/DPI and tray-menu pointer checks remain unverified.
- #28 is brought forward before #6. Updated #12/#16 and the canonical plan: one network-connected Windows host owns monitoring and data; other PCs use authenticated secured browser access later. The future Windows service must run across sign-out/reboot; the tray attaches to it and cannot create another collector. No remote control endpoint, LAN binding, firewall or service-installation changes were made.

## Current status (2026-11-12)

- Completed live #5 acceptance using user-authorized USB ADB control of the phone and a fresh temporary database. Default-cadence failures at 30.000/59.992/89.991 s after disable invocation produced up/up/down. Down followed command completion by 89.825 s; first success restored up 28.322 s after Wi-Fi enable completion (95 ms latency). Zero collector errors; phone Wi-Fi restored/address unchanged. Temporary host shutdown took 43 ms and released its lock; existing phone-test inventory/database unchanged. Redacted evidence: windows-phone-timed-results.json. Separate real Windows CTRL_C_EVENT test exited 0 in 553 ms, released the database lock and passed integrity_check (windows-console-stop-results.json). These supersede earlier unverified external failure/recovery and console-event notes. Final review/CI and merge remain; #6 is next, with broader release testing in #16.

- Real phone history verifies up → valid network failures → down on the third failure → up on the first successful reply, with zero collector errors in API inspections. Redacted windows-phone-results.json records first failure→down 59,987 ms, last success→down 91,154 ms, last failure→recovery 28,906 ms. These are observation intervals; Wi-Fi action timestamps were not recorded. The test host is now stopped, lock absent, and its database passes read-only integrity_check. Physical Ctrl+C was not observed. Remaining acceptance: operator-timestamped failure/recovery and console stop; PR #27 draft/#5 open, #6 untouched. Earlier notes saying no external unreachable/recovery observations are superseded by this evidence.

- Owner authorized the home router discovered from the configured Wi-Fi gateway, [private gateway address omitted]. Three real collector checks at approximately 30-second spacing all returned reachable/up at 2 ms, with collector durations 1,210/114/96 ms and no errors/diagnostics. Snapshot/history validated through a separate ephemeral-loopback API and isolated temporary database/cache, all removed afterward. Evidence: windows-router-results.json (source a5a1a51). The normal running host remains collection-disabled. External reachable behavior is now verified; actual unreachability/failure/recovery timing remain outstanding, so PR #27 remains draft/#5 open.

- Continued PR #27 review found a v1→v2 migration bug: rebuilding history from remaining rows reset the AUTOINCREMENT high-water mark, reusing deleted sequence IDs. Migration now preserves sqlite_sequence before dropping the old table. Regression reproduced ID 1 instead of 501 after deleted v1 history; the fix preserves 501. All 43 tests and production build pass on the Windows computer; real loopback repeat was 305 ms with both targets reachable at 0 ms measured latency and no errors. External-device acceptance remains outstanding; no normal database was migrated during this check.

- PR #27 / feat/windows-icmp validated on the owner's Windows 10 build 19045 x64, Node 26.13.1/npm.cmd 11.20.0. npm.cmd ci, 42 tests and production build pass. Real IPv4/IPv6 loopbacks replied up/reachable at 0 ms timer resolution: cold cycle 1,659 ms, cached repeat 211 ms. Host health/snapshot/history, UI serving, restart persistence, offline backup and lock release pass with isolated temporary databases only. Evidence: windows-local-loopback-results.json and windows-host-results.json.
- Fixed a reproduced shutdown race: collector stop previously returned before pending helper preparation/aborted child closure. It now drains both before database/lock release; regression fails on the old implementation, and a real canceled helper closes before stop returns. Three actual missing-executable cycles produce only process diagnostics with unchanged observations/history. Host shutdown handler was invoked via IPC, not a physical Ctrl+C; external-device unreachability/failure/recovery timing remain unverified. PR #27 remains draft, #5 open, #6 untouched. See ICMP-COLLECTOR.md for commands and limits.

- Completed/closed: #13, #1, #2, #3, #15, #18, #24 and #4. Issue #4 (2.1) merged through PR #26 as `7dc9bacfc3bb6496235ea68b27b63857bd0e8444`. Earlier implementations/evidence were merged through #14/#20/#21/#22/#23/#19/#25.
- Latest application checkpoint: #26, commit `7dc9bacfc3bb6496235ea68b27b63857bd0e8444`. All 30 tests and build passed in Ubuntu/Windows CI on the reviewed head; host transfer, inventory, recovery and topology browser suites passed during review. The default full-map dashboard supports saved/radial layouts, direct-peer highlighting and individual dragging; saved-layout movement autosaves while radial/sample adjustments are temporary.
- Implemented: #4 host API/SQLite persistence and explicit browser transfer (see HOST-API.md). Next: #5 bounded Windows ICMP, then #6 real observations. Optional Windows ICMP collection is in progress for #5; approved device evidence remains outstanding. Dashboard observation integration, SNMP/LLDP, alerts or remote access are not implemented.
- The dated and feature-specific entries below are historical checkpoints. Their then-current next steps and open/closed notes are superseded by this current status. The 100-device fixture is provisional, not a production capacity claim; confirm deployment size and target-machine behavior before release.

## Current work: topology-first status and popup details (#18)

- Branch feat/topology-status-paths makes the map fill the viewport below a small title/status strip and horizontal menu. Sidebar, avatar/breadcrumbs, summary cards, and default table are removed; View options contains search/status counts, and Devices opens the inventory separately.
- Devices are directly tinted green/red/amber/gray. Connection lines summarize endpoint reachability: any down endpoint gives a red dashed path; both up gives green; stale/unknown remain conservative. Device state is never propagated from a failed neighbor.
- Sample preview starts with the primary router down and supports explicit restore/fail. The other router and responding switches stay green. Colored lines do not establish physical interface state or traffic failover.
- Device clicks and inventory Inspect open a native modal dialog with status, address, last check, and connected peers/path summaries. Close button, Escape, and backdrop dismiss it; trigger focus is restored.
- Ten Node tests passed, including redundancy, both-router failure without overriding switch observations, recovery, and orientation-independent stale/unknown path rules. Production build passed.
- Browser verified red primary-router paths/green alternate paths, restoration (four red paths to one; nine green paths to twelve), switch remaining up, popup data, Escape, close button, backdrop, keyboard Inspect/focus restoration, and return to the unchanged five-device inventory.
- Desktop and narrow popup/layout inspected. The simplified opening screen has zero sidebars, summary cards, or tables, and the map takes 453 of 565 viewport pixels in the checked desktop view. Top navigation, separate Devices/Inspect, hidden filters/search, clear/reset, and editor round-trip were verified. Screenshots: docs/screenshots/topology-paths.jpg, device-popup.jpg, popup-mobile.jpg.
- Pending: publish PR and verify its GitHub checks. Live monitoring, actual interface/failover proof, full screen-reader verification, and larger-map performance remain future checks.

## Product decisions

- Network health is the default screen; topology editing supports it.
- UI/UX Pro Max guides the interface; keep real observations separate from sample statuses.
- One developer owns the whole project. AGENTS.md defines the solo AI workflow adapted from L.A.R.A.'s reading order, scope discipline, and evidence-based handoffs.

## Implemented in the dashboard change

- Default dashboard, read-only network map, full-inventory status counts, all five filters, search, attention list, device details, and keyboard-operable inventory table.
- Separate 14-device sample preview using documentation-only addresses and frozen example checks. Leaving it restores the existing five-device starter inventory; sample data never reaches topology storage.
- Missing/invalid/future observations are unknown. Observations older than 90 seconds are stale; the fixed threshold is a UI prototype limit pending the collector policy.
- The topology editor and v1 JSON/storage contract are preserved. Save/load warnings also appear on the dashboard. Runtime fonts no longer use a CDN.
- Solo AI instructions, product brief, design direction, contribution guide, and PR handoff template are in the repository.

## Verification

- Eight Node tests pass (topology validation/recovery plus health states, freshness boundaries, fixture validity, empty inventory summary, and inventory-only counts).
- Production build and GitHub push/PR checks passed for the final dashboard/implementation-plan revision.
- Browser checked the default unmonitored state, sample totals (14 total, 11 up, 1 down, 1 stale, 1 not monitored), each status filter, empty search/reset, keyboard inspection with Enter, sample isolation, and editor switching.
- Desktop and 390 px layouts inspected; narrow document width matches the viewport. Mobile navigation spacing was corrected. Map supports zoom/pan; use the inventory list for readable device details on narrow screens.
- Review images: docs/screenshots/dashboard.jpg and docs/screenshots/dashboard-mobile.jpg. Both show SAMPLE DATA.

## Next work and limits

- Implement host API/persistence and bounded Windows ICMP checks (#4–#6), then connect actual observations and monitoring freshness to the dashboard.
- No real probes, SNMP, BGP session monitoring, alerts, or remote access exist yet. Hardware behavior, large-topology performance, and screen-reader behavior are unverified.
- Issue 1.0 (#13) is complete via merged PR #14, with acceptance criteria checked and linked evidence. Next is issue 1.1 (#1). Do not close #1: its clean-checkout and full editor acceptance checks remain separate work.

## Issue-plan review

- At the plan review, updated all fifteen implementation issues without closing them or changing existing numbers. Issue #13 was subsequently completed by PR #14.
- Added #15 for representative larger-map evidence and #16 for the actual Windows end-to-end local monitoring release gate.
- Clarified failure/recovery policy, stale aging without fresh API responses, history retention, browser-to-host migration, and restart/backup behavior.
- Moved local incidents #11 into M2. Alerts and authentication no longer wait unnecessarily for SNMP/LLDP. #3 verifies/reuses navigation from PR #14 rather than building it twice.
- Critical path: #13 → #1 → #4 → #5 → #6 → #11 → #16. #2/#3/#15 are also release prerequisites. No issue is closed by this plan review.
- docs/ROADMAP.md and docs/github-plan.json match the updated GitHub issues. Stable plan markers prevent renamed issues being recreated. The workflow self-check covers dependency links, reruns, renamed titles, and preservation of edited/closed issues.

## Historical PR #14 acceptance checkpoint

- Reviewed PR #14 against its connected code, tests, persisted-data boundaries, sample isolation, and issue 1.0 criteria. No merge-blocking findings; no external change requests or inline review comments were present.
- All eight local tests passed again. Final-head push and PR checks were green before the owner-authorized squash merge.
- Accepted implementation commit: 7b6b083580ccc6b15b59d5ede9d595447287ab76 on main. Local main was synchronized.
- Issue 1.0 is GitHub #13, not GitHub #1. It was already implemented in the accepted PR; all seven acceptance criteria are now checked and the issue is closed. No duplicate feature implementation is needed.
- Issue 1.1 (#1) remains the next development/verification checkpoint. No host probes or real-hardware claims were added during acceptance.

## Foundation reliability follow-up (2026-11-12)

- Reproduced the LAN issue in Chromium at a non-loopback plain HTTP address: `isSecureContext` was false and `crypto.randomUUID` was undefined. Add-device and pointer link creation now use a shared ID helper, preferring native UUID, then random bytes, with a time/sequence/random fallback for environments without crypto. IDs are not security tokens.
- Editor arrows now come from trusted default edge options, surviving storage reload and JSON import without accepting arbitrary imported rendering properties. All editor links consistently use the same arrow treatment; v1 data is unchanged.
- Real-mode freshness now advances once per second and refreshes on focus/visibility changes. Sample time remains frozen. Browser-only injected observations crossed from up to stale without a remount; this fixture is not a production monitoring source.
- Corrected README checkout instructions/tree and the roadmap's outdated pending-merge checkpoint. Pinned checkout/setup-node/github-script Actions to the exact commits resolved from their existing v4/v4/v7 tags.
- Clean Node 22.23.5/npm 11.9.0 install, ten Node tests, and production build passed. Initial installation using the default unwritable npm cache failed; using `/tmp/netwatch-npm` succeeded without lockfile changes.
- Chromium browser checks passed: insecure HTTP add/connect, link arrow after reload, no-match search, sample isolation/frozen clock, 390 px layout without horizontal overflow, and real-mode freshness using injected observations. Screenshots: `docs/screenshots/foundation-lan.jpg` and `docs/screenshots/foundation-narrow.jpg`.
- Additional browser checks passed: corrupt saved JSON preserves the raw content and pauses autosave; cancelling reset preserves it; explicit replacement resumes save; malformed/invalid/future imports and cancelled valid replacement preserve the prior saved map; JSON download, valid empty-map import, and empty dashboard work; denied reads and failed writes show warnings in dashboard/editor while retaining in-memory inventory.
- Additional Chromium checks passed: pointer movement and persistence, selection/inspection, keyboard Delete with attached-edge cleanup, editor search, all sample status filters, and keyboard inventory inspection. #1 remains open pending merge/review of this evidence. No Windows hardware or live probes were tested.
- User review follow-ups recorded: #2 owns UI IPv4/IPv6 canonicalization, duplicate checks, editable inventory and accessible controls; #4 must revalidate/normalize imported addresses at the host API, and #5 must use bounded shell-free probes. Existing address strings remain descriptive until then. #3 owns recoverable raw-data download and accessible import/recovery dialogs replacing native alert/confirm. No imported topology authorizes monitoring.
- Next: review/merge the #1 foundation evidence, then implement host API/SQLite #4; finish #2/#3/#15 before the Windows MVP release gate.


## Issue 1.2 — Accessible inventory editing (2026-11-12)

- Implemented add/edit validation and canonical IPv4/IPv6 duplicate checks. Existing-device edits preserve ID/type/position/links; empty addresses are allowed. Imports/storage use the same validation, rejecting invalid and equivalent duplicate addresses before replacement. README describes older-backup repair and paused-autosave behavior.
- Native modal dialog plus explicit forward/reverse Tab wrapping keeps focus inside, closes on Escape, and returns focus after closing. Field errors name the invalid field and focus it. Background content is inert while the modal is open.
- Added keyboard-operable device selection/edit/delete, numerical X/Y positioning, and directed link add/remove controls below the editor. Self-links, existing default-handle links and link limits are rejected. Inspector selection now uses current node data by ID.
- Thirteen Node tests and production build pass. Browser tests against the production build passed for edit preservation, invalid/duplicate input, IPv6 normalization, empty-address creation, modal focus/escape/return, save/cancel, numerical move, keyboard link add/remove, delete with attached-link cleanup, duplicate import rejection and import cancellation.
- Desktop (1440×1000) and narrow (390×844) checked; screenshots: `docs/screenshots/inventory-desktop.jpg` and `docs/screenshots/inventory-narrow.jpg`. No live probes, host API, SNMP or real-device checks are included. Host API must revalidate before probing (#4/#5). Raw corrupt-data download and import/recovery dialog replacements remain #3 work.
- Issue #2 stays open until the implementation is merged and acceptance evidence is reviewed. Next: saved-map recovery #3 or the live-monitoring critical path #4.


## Issue 1.3 — Saved-map recovery and inventory navigation (2026-11-12)

- #1 and #2 were completed and closed through merged PRs #20/#21. This change implements #3, keeping the existing dashboard/device list/navigation.
- `readTopology` retains unreadable original text separately from the visible fallback, distinguishing read-access denial from invalid content. The original is downloadable unchanged, including empty text. Denied access offers accurate recovery guidance without pretending an original backup is available.
- Backup/import/save controls and failure feedback are available in both views. Export always uses actual inventory, even in sample mode. Import validates before a native accessible confirmation; invalid input, Cancel and Escape preserve saved and visible maps. Imports during recovery change only the visible map, keeping autosave paused until separate explicit saved-map replacement succeeds.
- Recovery dialogs share the tested modal focus logic with device dialogs, start on Cancel, trap forward/reverse Tab, close on Escape and restore focus. Import errors are inline; native import/replacement alert/confirm calls are removed.
- Fourteen Node tests and production build pass. Optional `scripts/check-recovery-browser.mjs` verifies exact original downloads vs visible exports, malformed/future/invalid/oversize import rejection, cancellation, paused import, explicit replacement, backup/restore, empty/no-match states, sample-safe exports, editor/device-list navigation, denied reads, quota failures and successful retries. Failed replacement retains the raw recovery copy. Existing inventory regression checks also pass after the shared-dialog refactor.
- Desktop 1440×1000 and narrow 390×844 checked with no document overflow. Review images: `docs/screenshots/recovery-desktop.jpg` and `docs/screenshots/recovery-narrow.jpg`. Browser tests use isolated contexts; they do not probe devices.
- No dependency or persisted topology schema change. Multi-tab conflict resolution and host persistence remain future work; screen-reader/hardware verification is not claimed. #3 stays open until merge/review of the acceptance evidence.
- Next: #15 for larger-map evidence in the solo sequence; #4 for the host API on the monitoring critical path.


### PR #22 review follow-up

A fresh Node 22 install, fourteen tests and build passed during review. The first recovery browser run timed out only at its final screenshot readiness wait after switching browser contexts; four subsequent diagnostic runs passed all checks. The screenshot setup now explicitly brings the main page forward and scrolls the map into view before checking initialized nodes. Recovery and inventory suites were rerun after this change. No application behavior changed in this follow-up.


## PR #19 integration/review — Issue #18 (2026-11-12)

- Merged current main into the PR branch and resolved App/Dashboard/architecture conflicts. Preserved LAN-safe IDs, editor arrows, advancing real-mode freshness, inventory validation/editing and keyboard map controls, and saved-map backup/recovery safeguards from #20–#22.
- Recovery controls moved into a top-menu Backup popover. Paused/error indicators remain visible when closed; errors expand the controls. Default landing retains horizontal Dashboard/Topology editor/Devices navigation and a map filling the rest of the viewport, without summary cards, sidebar or default table.
- Review found that regenerating controlled graph nodes discarded React Flow measurements during freshness updates, which could leave cards hidden. Dashboard now retains measured health-card dimensions and handles dimension events. Browser regression advances the clock and confirms the cards stay visible. An injected real-mode observation ages from up to stale without remounting (test fixture only; no live monitoring).
- Review also found that Enter on a map node only selected it rather than opening details. Added Enter/Space activation and button/dialog semantics. DeviceDetails shares the existing tested modal hook for explicit Tab trapping and close/Escape/backdrop/focus restoration.
- Sixteen Node tests cover existing foundations and endpoint failure/stale/unknown rules. Optional `scripts/check-topology-browser.mjs` verifies map viewport/layout, primary-router failure/restore colors, independent responding switches, optional filters, no-match/reset, node and inventory keyboard popups, focus/backdrop, sample isolation and desktop/narrow navigation. Inventory and recovery scripts were updated for the new menu/filter layout and both pass.
- Screenshots refreshed: topology-paths.jpg, device-popup.jpg, topology-mobile.jpg, inventory and recovery layouts. Windows hardware, live monitoring, screen-reader behavior and larger-map performance remain unverified; #15 and the host monitoring issues remain separate work.
- #18 is complete only after this reviewed integration merges. #1/#2/#3 remain completed, and their behavior is preserved.


## Issue 1.4 — Representative larger-map checks (2026-11-12)

- Kept the default dashboard as the full network map. Added a repeatable 100-device/180-link documentation-address fixture and meaningful fixture contract test.
- Narrow initial-fit measurement found 20 clipped cards with minZoom 0.15. Dashboard now permits 0.05, fitting all 100 on both measured viewports. View options explains zoom/Devices for readable labels; no positions, grouping or layout data are changed.
- Optional scale browser script covers initial all-unknown inventory, 70 up/10 down/10 stale/10 unknown sample states, empty inventory, stable full-inventory counts, exact filtered-edge/endpoints, search/no-match/reset, pan/zoom/fit, and map/list keyboard inspection on 1440×900 and 390×844. Fixture observations are browser-only sample overrides and never saved or probed.
- Node 22 runner/server, browser/machine/cgroup metadata, render/filter/search timings and label sizes are recorded in docs/scale-results.json and explained in docs/SCALE-VALIDATION.md. Initial observed renders were 1311/1022 ms, status filters 62–143/36–128 ms; single measurements include Vite and automation overhead, not production capacity.
- Saved overview, readable-card and inspection screenshots for both viewports. Full-view labels are too small to read (5.6/1.7 px); search plus Fit view reaches 20.8 px, and Devices/popups provide normal-size text. Actual deployment size/topology and target-machine performance must be confirmed before release.
- #15 remains open until merge/review. Live monitoring and hardware verification remain separate work. Next critical-path issue is host API/storage #4.


## Radial network map and direct-peer highlighting — #24 (2026-11-12)

- Added View options → Map layout (Saved positions / Radial), automatic per-component router centers and an optional explicit center. Display-only BFS rings handle cycles, isolates and disconnected components deterministically; custom side handles/straight lines support the radial arrangement. Saved geometry, IDs, links and schema remain untouched. Layout/root changes refit the map, while filtering or health updates do not reorganize the rings.
- Added persistent direct-peer highlighting for map click/Enter/Space and inventory Inspect. Solid blue focus and dashed peer outlines, thicker incident paths and subdued unrelated items preserve health colors. Popup close retains the highlight; Clear highlight/background click/sample switching clears it. Incoming/outgoing direct connections count; isolates show zero peers.
- Twenty-one Node tests cover radial graph distance, centers, cycles/disconnected packing, deterministic input ordering, no mutation, 100-device mesh/star spacing, and direct-peer handling of duplicate/invalid/self edges. No new runtime dependency or persisted schema.
- Optional scripts/check-radial-browser.mjs verifies both layouts, exact manual restoration/editor positions, custom center, stable filters/health colors, popup focus, highlight persistence/clear and filter behavior, source/sample isolation, desktop/narrow and 390×565 control reachability, plus a 101-device/180-link mesh with an isolated device. Existing topology, recovery and inventory production-preview suites pass.
- Evidence images: radial-desktop.jpg, radial-narrow.jpg, radial-highlight-desktop.jpg, radial-highlight-narrow.jpg, radial-controls-narrow.jpg and radial-101-narrow.jpg. Large radial overviews can make labels tiny and links can cross; zoom/search/Devices remain necessary. No hardware, monitoring or full screen-reader claims.
- #24 remains open until PR review/merge. Next monitoring milestone remains host API/storage #4.
- Final checks: Node 22.23.5 tests/build and radial, topology, recovery, inventory and 100-device scale browser suites pass. Scale count assertions now target the status selector explicitly because View options also contains layout/center selectors.


## Dashboard individual dragging follow-up — #24 / PR #25 (2026-11-12)

- Enabled free individual node dragging in the dashboard. Position overrides render during movement; direct peers/incident paths highlight from drag start and links follow the moved device. Neighbor positions do not change, and drag release does not open a detail popup. Click/keyboard inspection remains available.
- Real Saved positions persist at drag stop through App's existing autosave/recovery flow, with reload/editor/export compatibility. Radial and sample moves remain view-only, with explicit Reset/refit. Source/layout/center/sample changes invalidate or clear temporary geometry. No IDs, fields, edge endpoints/handles or health policy change.
- Moved map focus/reset controls into an overlay, preserving canvas geometry during interaction. Added scripts/check-dashboard-drag-browser.mjs for mid-drag highlights/path geometry, individual movement, no drag popup, manual persistence/reload, radial/sample isolation/reset, narrow gestures and quota failure preserving the previous save and moved in-memory graph.
- A narrow browser gesture after resize initially started before Fit view completed. The test now waits for resize observation and fully fitted node bounds before dragging; no timing logs remain in application code.
- Screenshots: dashboard-drag-saved.jpg, dashboard-drag-radial.jpg and dashboard-drag-narrow.jpg. Highlighting refers to configured incident links, not verified hardware port state. Full hardware/touch-device/screen-reader testing is not claimed.
- Final verification: Node 22.23.5 passes all 21 tests and production build; dashboard-drag, radial, topology, recovery, inventory and 100-device scale browser checks pass. The scale QA server was restarted after a connection-refused setup failure; the rerun passed. Commit/push requested on the existing feat/radial-map branch.


## Issue 2.1 — Local host API and durable storage (2026-11-12)

- Added a Node 22.13+ loopback-only HTTP host serving the compiled dashboard and versioned health/topology/snapshot/paginated-history APIs. SQLite schema v1 uses transactional migrations and inventory/observation writes, optimistic revision checks, canonical address/graph/monitoring validation, timestamped independent observations, 30-day/100,000-row retention and bounded reads. No probe or browser observation-write route exists.
- Host inventory starts empty. Backup now includes Check host, preview/confirmed Load host and Save to host, cancel, conflict guidance and explicit per-device future monitoring opt-in. Browser working-copy autosave and original v1 JSON backup/recovery remain separate. Imports/new or address/type-changed devices default monitoring off; sample mode never supplies host inventory.
- Offline maintenance uses a shared process lock, compact validated SQLite backups, staged validated restore and a revision increase to reject old browser writes. HOST-API.md documents start/stop, contracts, origin/write boundaries, bounded retention, migration rollback, interrupted restore and stale-lock recovery.
- Thirty Node tests pass on Node 22.23.5 and Node 24; nine new host tests cover restart persistence, independent connections/stale writes, injected transaction/migration failures, invalid inventory/observations, history pagination/retention/cap, valid/corrupt backup/restore and HTTP Host/Origin/write/size limits (including chunked input). Production build passes. Existing inventory, recovery, topology, radial and dashboard-drag browser suites pass against the host-served build.
- New check-host-browser.mjs verifies explicit migration/cancel, stored IDs/links/defaults, monitoring opt-in, imported authorization reset, sample isolation, concurrent conflict rejection, host load, empty inventory and disconnected state on desktop/narrow. Screenshots: host-storage-desktop.jpg and host-storage-narrow.jpg. Visual review corrected select contrast.
- GitHub CI now runs tests/build on Ubuntu and Windows. Issue #4 stays open pending PR review/merge. Windows hardware, a packaged Windows service, live observations and remote authentication are outside this issue; full Windows process shutdown/file recovery remains a release acceptance check, not a claim from Linux browser tests.

- First Windows CI run exposed test teardown ordering (a second database connection was still open at directory removal) and an oversized-request early response that could reset the client socket on Windows. Closed the secondary connection before fixture cleanup and now drain oversized request bodies without retaining their contents before returning HTTP 413; request timeout still bounds the connection. Both fixed-size and chunked oversized inputs remain tested.


## PR #26 review follow-up (2026-11-12)

- Review found restore's finally block removed a pre-existing `.restoring` file even when overwrite was refused. Cleanup now removes only the temporary file created by that restore invocation; a regression verifies existing recovery bytes and the original database survive.
- Host preview added expandable review lists, but the shared modal focus loop omitted summary elements. Included summary/link/textarea controls in focus traversal and added a host browser keyboard check reaching and opening both review sections.
- Corrected an inherited-property edge case so a valid device ID such as `toString` with no management address defaults to monitoring disabled rather than being rejected by the host. Regression coverage includes the ID.
- Review verification: all 30 tests and production build pass on Node 22.23.5. Host transfer (including preview keyboard review), inventory, recovery and topology browser suites pass on desktop/narrow layouts. Final GitHub Ubuntu/Windows checks are required before the authorized merge.

- PR #26 was merged after all final Ubuntu/Windows and security checks passed; issue #4 is closed with all acceptance criteria checked and evidence linked. Next unresolved implementation step is #5 (2.2), bounded Windows ICMP.


## Issue 2.2 — Bounded Windows ICMP collector (2026-11-12)

- Added an explicitly enabled Windows collector (NETWATCH_ICMP=1) visiting only opted-in host inventory. Eight workers, one ICMP request/target/cycle, 1.5-second ICMP and 4-second whole-helper deadlines, 4 KiB process output and graceful cancellation prevent unbounded process/queue growth and overlapping cycles. The fixed C#/.NET Ping executable is compiled locally with the framework compiler and invoked directly with shell:false and literal argument data; no shell, PowerShell, DNS, target code interpolation or execution-policy change is used.
- Policy is exposed/documented: 30-second target start interval, three consecutive valid failures for down, one success for recovery, no immediate retries, process errors separated from network outcomes. Raw reachable/unreachable and measured latency are persisted separately from effective unknown/up/down. Collector errors freeze old observations instead of marking devices down. Freshness/detection estimates include worker-capacity effects, with no enterprise capacity claim.
- Inventory revision changes cancel obsolete work/results and reset failure streaks. Collector readiness/last successful cycle, bounded diagnostic codes, durations, counts and policy are exposed through existing health/snapshot routes. Collection defaults disabled; unsupported platforms never fall back to another probe. Dashboard API integration remains #6.
- SQLite v2 migration preserves v1 inventory/history, timestamps and sequence IDs, adds unknown/raw outcomes/latency, rolls back on upgrade failure and supports verified v1/v2 backup/restore. Retention cleanup avoids scanning all rows for every normal append.
- Forty-one Node tests pass locally, including fake-runner success/failure/loss/recovery, invalid address/output/latency, runner errors/timeout, bounded workers, non-overlap/cadence, shutdown cancellation, changed authorization, frozen evidence, v1 migration rollback and latency backup/restore. Windows CI has an explicit loopback-only smoke script (127.0.0.1 and ::1); it never contacts external devices.
- Outstanding required acceptance: real approved Windows inventory reachability/unreachability and measured detection/recovery timing. The Linux workspace cannot establish this evidence; issue #5 must remain open even if fake tests/Windows CI loopback pass. A user clarification for approved Windows inventory or local execution was requested while implementation continued.
- Node 22.23.5 final validation passes 41 tests and production build. Host transfer/preview and saved-map recovery browser suites pass on desktop/narrow layouts with collection disabled. Updated host-storage copy/screenshots explain the enabled Windows collector and separate dashboard integration. Draft PR will retain the approved Windows device test as unchecked scope.

- Windows/Ubuntu CI and security checks pass on d6078ec. Real Windows Server 2025 x64 loopback smoke passed IPv4/IPv6 with measured 0 ms echo latency and a 1,973 ms initial cycle (including native helper compilation); extracted scoped JSON evidence is in docs/icmp-loopback-results.json. The owner confirmed only the current computer is available. Added a one-computer smoke procedure; remote-device/unreachable/timing evidence remains pending, so PR #27 stays draft and #5 stays open.
