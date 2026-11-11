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
