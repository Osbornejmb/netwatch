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

- Seven Node tests pass (topology validation/recovery plus health states, freshness boundaries, fixture validity, empty inventory summary, and inventory-only counts).
- Production build passes. GitHub checks must be checked for the published commit.
- Browser checked the default unmonitored state, sample totals (14 total, 11 up, 1 down, 1 stale, 1 not monitored), each status filter, empty search/reset, keyboard inspection with Enter, sample isolation, and editor switching.
- Desktop and 390 px layouts inspected; narrow document width matches the viewport. Mobile navigation spacing was corrected. Map supports zoom/pan; use the inventory list for readable device details on narrow screens.
- Review images: docs/screenshots/dashboard.jpg and docs/screenshots/dashboard-mobile.jpg. Both show SAMPLE DATA.

## Next work and limits

- Implement host API/persistence and bounded Windows ICMP checks (#4–#6), then connect actual observations and monitoring freshness to the dashboard.
- No real probes, SNMP, BGP session monitoring, alerts, or remote access exist yet. Hardware behavior, large-topology performance, and screen-reader behavior are unverified.
- Issue #13 tracks the dashboard change. Do not close #1: its clean-checkout and full editor acceptance checks remain separate work.
