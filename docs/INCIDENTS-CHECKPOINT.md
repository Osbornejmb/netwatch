# Working checkpoint

## Current status (2026-11-13): faster monitoring

- Reduced the default collector interval from 30 to 10 seconds, failure threshold from three to two, and dashboard snapshot interval from five to one second. A single missed reply remains tolerated; one reply recovers. Minimum freshness is now 30 seconds and still scales with worker capacity. Timeouts, eight-worker cap, opt-in targets, non-overlapping cycles and collector-error semantics are preserved.
- The owner selected ten-second checks and retained one-second dashboard reads, which never trigger probes. Incident copy/tests and current API/architecture/usage docs match the policy. Historical hardware measurements retain their original policy and do not prove the new timings. The running host must be restarted and the browser reloaded to activate this local build; no existing service or real-device configuration was changed.
- Verification: all 56 tests, production build, incident browser checks and the existing monitoring browser regression pass. Launcher tests also pass (port 4317 was available for this run), superseding the earlier occupied-port limitation. No real-device timing or capacity claim is made.


## Current status (2026-11-13): issue 2.4 (#11), local implementation

- Branch feat/local-incidents adds atomic incident opening/deduplication and confirmed recovery, schema v3 migration, read-only bounded incident history, snapshot active incidents and validated backup/restore. Pending checks, process errors and stale/disconnected monitoring never create or resolve an outage. Pausing retains incidents; address/type changes and device removal invalidate old evidence.
- Device details include collapsible incidents and View checks navigation; Needs attention includes open outages. Resolved incidents retain 30 days / 10,000 rows globally; open incidents are bounded by inventory and survive restart. External notification delivery is deferred: no destination is approved, and no messages/configuration/secrets/delivery workers are added.
- Validation: six new incident tests pass, including fake-collector thresholds/errors/recovery, restart/pause, rollback, identity changes, retention/caps, v2 migration interruption, backup/restore, API protection and browser-response validation. Production build passes. Full suite: 53/56 pass; three unchanged launcher scenarios cannot start because another service already occupies 127.0.0.1:4317. The same three failures were reproduced against an unchanged main snapshot; the existing service was left running.
- Controlled Windows Chrome incident checks and the existing monitoring regression pass for empty history, deduplication, attention, history navigation, recovery, narrow overflow, keyboard dialog and request error; evidence: incidents-results.json and monitoring-results.json; screenshots remain local under .tools/local-screenshots. Desktop/narrow screenshots were visually inspected. No physical devices were probed or user databases changed. Issue #11 remains open pending review/merge and any required physical acceptance; release-wide Windows checks remain #16. No publication or CI result is claimed.

