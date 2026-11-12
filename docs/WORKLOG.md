# Working checkpoint

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
