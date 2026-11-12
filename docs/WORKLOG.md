# Working checkpoint

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
- Production build and GitHub push/PR checks passed for the dashboard commit; rerun checks for the implementation-plan revision.
- Browser checked the default unmonitored state, sample totals (14 total, 11 up, 1 down, 1 stale, 1 not monitored), each status filter, empty search/reset, keyboard inspection with Enter, sample isolation, and editor switching.
- Desktop and 390 px layouts inspected; narrow document width matches the viewport. Mobile navigation spacing was corrected. Map supports zoom/pan; use the inventory list for readable device details on narrow screens.
- Review images: docs/screenshots/dashboard.jpg and docs/screenshots/dashboard-mobile.jpg. Both show SAMPLE DATA.

## Next work and limits

- Implement host API/persistence and bounded Windows ICMP checks (#4–#6), then connect actual observations and monitoring freshness to the dashboard.
- No real probes, SNMP, BGP session monitoring, alerts, or remote access exist yet. Hardware behavior, large-topology performance, and screen-reader behavior are unverified.
- Issue #13 tracks the dashboard change. Do not close #1: its clean-checkout and full editor acceptance checks remain separate work.

## Issue-plan review

- Reviewed and updated all fifteen current implementation issues, keeping them open and preserving existing numbers.
- Added #15 for representative larger-map evidence and #16 for the actual Windows end-to-end local monitoring release gate.
- Clarified failure/recovery policy, stale aging without fresh API responses, history retention, browser-to-host migration, and restart/backup behavior.
- Moved local incidents #11 into M2. Alerts and authentication no longer wait unnecessarily for SNMP/LLDP. #3 verifies/reuses navigation from PR #14 rather than building it twice.
- Critical path: #13 → #1 → #4 → #5 → #6 → #11 → #16. #2/#3/#15 are also release prerequisites. No issue is closed by this plan review.
- docs/ROADMAP.md and docs/github-plan.json match the updated GitHub issues. Stable plan markers prevent renamed issues being recreated. The workflow self-check covers dependency links, reruns, renamed titles, and preservation of edited/closed issues.

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
