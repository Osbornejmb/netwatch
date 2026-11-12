---
name: netwatch-context
description: Locate NetWatch code and verification paths for implementation, debugging, or code review while avoiding repeated repository discovery and oversized context reads.
---

# NetWatch context

Use the repository's AGENTS.md as the authority. This skill supplies routing, not extra permissions or a replacement workflow. Paths below are relative to the repository root, three directories above this file.

## Find the smallest connected slice

Start with the task, working-tree status and relevant issue. Use `rg -n` in the likely files below; read matching sections, their callers, data boundaries and relevant tests. Expand only when a dependency or unresolved question requires it. Treat this map as a hint: verify symbols and paths before editing.

| Concern | Start here | Contract or verification |
| --- | --- | --- |
| Map status/details | src/Dashboard.jsx, src/health.js, src/DeviceDetails.jsx | tests/health.test.js, docs/DESIGN.md |
| Inventory/browser recovery | src/App.jsx, src/topology.js, src/inventory.js | tests/topology.test.js, tests/inventory.test.js |
| Browser/host transfer | src/HostStorage.jsx, host/server.js | scripts/check-host-browser.mjs, docs/HOST-API.md |
| API, SQLite, backup | host/server.js, host/store.js, host/maintenance.js | tests/host.test.js, docs/HOST-API.md |
| ICMP/policy/errors | host/collector.js, host/icmp-policy.js, host/windows-probe.js | tests/collector.test.js, docs/ICMP-COLLECTOR.md |
| Windows helper | host/windows-helper.js, host/windows-ping.cs | scripts/check-windows-icmp.mjs |
| Tray/start/stop | desktop/NetWatch.cs, host/desktop.js, host/main.js | tests/desktop.test.js, docs/WINDOWS-LAUNCHER.md |
| Launcher installation | scripts/setup-desktop.mjs | package.json, docs/WINDOWS-LAUNCHER.md |
| Issue/deployment plan | docs/ROADMAP.md, docs/github-plan.json | tests/project-plan.test.js |

## Spend context on uncertainty

- Reuse already-read instructions and findings while their inputs remain unchanged. After compaction, recover the checkpoint and pending work before repeating discovery.
- Search WORKLOG headings for the relevant checkpoint; historical entries are not current GitHub status. Verify issue/PR state when the task depends on it. Use roadmap labels such as **issue 2.3 (#6)**; do not invent a label for an unnumbered issue.
- Keep tool output focused: matched code, failing assertions and final summaries. Batch independent reads; fetch detailed CI logs only for a failing/stuck job. If a CI stall repeats, diagnose it rather than repeatedly retrying unchanged code.
- Trace browser inventory, host inventory and observations separately. A healthy API or tray process does not prove the dashboard consumes observations; verify the actual data flow. Sample preview is never device evidence.

## Verify the change, not every historical checkpoint

Use `npm.cmd` in PowerShell and the existing package scripts. Run focused behavioral checks while iterating, then the tests/build required by AGENTS.md. Inspect failures before rerunning; add regression coverage for a reproduced bug. Documentation-only work needs link/path/format checks, not fabricated runtime evidence. Never save tokens by dropping authorization checks, data preservation, error handling or required verification.

Finish with the result, meaningful checks, issue label and remaining limits. Do not dump command transcripts or claim measured token savings without a comparison.
