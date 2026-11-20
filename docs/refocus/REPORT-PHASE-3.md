# Phase 3 report — Link health dashboard

## Changes

| Files | Result |
| --- | --- |
| [Dashboard](../../src/Dashboard.jsx), [link overview and details](../../src/LinkOverview.jsx), [device details](../../src/DeviceDetails.jsx), [dashboard styles](../../src/dashboard.css) | Lead with monitoring coverage and redundancy. Add ordered attention, a keyboard-operable connection list, evidence and age, device baseline state, and tier summaries. |
| [Layout and summary](../../src/refocus.js), [map edges](../../src/nodes/MapEdge.jsx), [App](../../src/App.jsx) | Place designated roots above their tiers, retain Circle and Tidy, and separate paths and labels for parallel links. Keep the existing route and reviewed baseline workflows. |
| [Snapshot](../../host/routes/snapshot.js), [evidence projection](../../src/link-health.js), [browser validation](../../src/monitoring.js) | Add viewer-safe tier numbers and fresh reported port speeds. Expire link health and speeds with the host clock and keep failure-point IDs admin-only. |
| [Backup verifier](../../host/upgrade-backup.js) | Compare exact filesystem identities when verifying an offline backup. A Windows test rerun detected an intermittent identity comparison with numeric inode values. |
| [Unit tests](../../tests/refocus.test.js), [snapshot checks](../../tests/phase-one.test.js), [dashboard browser check](../../scripts/check-links-dashboard-browser.mjs), existing map browser checks | Exercise evidence expiry, layout, projections, keyboard access, navigation, and map interactions. |
| [README](../../README.md), [link health guide](../LINK-HEALTH.md), [host API](../HOST-API.md), [design](../DESIGN.md), [work log](../WORKLOG.md) | Explain onboarding, evidence, coverage, and reviewed baselines. |

There was no schema migration. The host still uses SQLite v12 and topology v2. Existing documents and legacy router groups continue to load.

## Verification

- On Windows with Node v26.13.1, `npm test` passed 189 tests with 0 failures. The Windows TLS test used the portable OpenSSL executable.
- `npm run lint`, `npm run format:check`, and `npm run build` passed. The existing JavaScript chunk-size warning remains.
- Chrome passed the links-first walkthrough at desktop and 390 px, the Circle and Tidy regression, the map interaction regression, and the LLDP proposal and confirmation walkthrough. The links-first check covers speed details, keyboard activation, and Devices reload and Back/Forward navigation.
- Screenshots use documentation addresses and synthetic port evidence. [Desktop dashboard](../screenshots/link-health-desktop.png) · [Narrow dashboard](../screenshots/link-health-narrow.png)
- Live hardware, forwarding or standby inference on a real network, error rate telemetry, and a second-PC session remain unverified.

## Decisions and tradeoffs

- Hierarchy is the monitored default. With no designated roots, its display uses the Circle geometry. The editor starts in Circle. Tiers are shortest saved-link distances from the roots.
- Viewer-visible speeds and tiers follow the approved scope. The host sends a speed only for a fresh sample. Failure-point IDs and the related attention entries require admin access.
- A fresh pair of up ports supports physical availability. The UI uses **Ports up · Forwarding unverified** and reports **Based on link status only** for baseline status. The shared design's potential forwarding inference yields to the approved evidence requirement.
- Attention promotes redundancy loss, isolation, link failures, mismatches, and missing evidence. Generic device statuses and history remain accessible. Error alerts and live forwarding need Phase 4 evidence.

## Focus check

The dashboard and link details are Core. Device and tier summaries provide context. Edit map and topology review support maintaining the baseline. Nearby device scanning and device history remain secondary.

| Question | Status |
| --- | --- |
| a. Devices and ports | Partial. The map and connection details show resolved port names and identify missing endpoints. |
| b. Uplink, downlink, or peer | Partial. Manual role assignment remains in the editor. |
| c. Link health at both ends | Partial. Details show available status, speed, scope, and age. Error rate and forwarding evidence remain pending. |
| d. Usable redundant uplinks | Partial. Reviewed baselines report physical availability and coverage. |
| e. Lost redundancy with connectivity | Available for reviewed groups with sufficient fresh evidence. |
| f. Forwarding or standby | Deferred for live networks pending richer evidence. |
| g. Single points of failure | The admin attention list shows root-relative structural dependencies. |
| h. Isolation impact of a failure | Deferred. |
| i. Recent connection changes | Discovery proposals preserve evidence. Change events and history remain deferred. |
