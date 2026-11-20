# Phase 5 report — Topology dynamics

- Discovery schedules default to off. Admins choose an enrolled seed and an interval from 15 minutes to 24 hours. Scheduled discovery uses the same read-only service and draft review as manual runs.
- The first complete discovery establishes a baseline. Missing links require two eligible complete runs, with both endpoint devices reporting and no ambiguous report for that pair. A port move is reported when the old and new link form a unique pair. Speed changes use fresh mapped-port evidence.
- Persistent redundancy incidents use the saved graph to group devices isolated behind the same upstream failure. Unknown evidence keeps an existing incident open. Link attention shows active incident anchors.
- The admin what-if control estimates isolation and lost redundancy from the saved graph. Each logical bundle counts as one available path while it has a surviving member.
- SQLite v14 adds the schedule, change feed, and incident history. An existing v13 database needs a verified backup beside it with the suffix `.pre-v14.bak`. Viewer snapshots omit the private data.
- The Windows v0.2.0 prerelease uses the consolidated [changelog](../../CHANGELOG.md) for Phases 0–5. Its workflow builds and smoke-tests the installer on Windows and attaches the SHA-256 checksum after main checks pass.

The topology estimate depends on the saved edges and root routers. It cannot establish switch forwarding behavior during a real outage. Physical switch and VLAN validation remain open, and edge-port device discovery is deferred.
