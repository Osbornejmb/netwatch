# Solo development workflow

Read [AGENTS.md](AGENTS.md) first; it is the shared entry point for AI contributors. The owner works across all folders. No staging branch, team boundaries, mandatory second reviewer, or separate contract-change process is required.

1. Read the request/issue and current product, architecture, design, and checkpoint documents.
2. Start one coherent feature branch from main: `feat/<topic>`, `fix/<topic>`, or `docs/<topic>`. Keep unrelated work intact.
3. Implement the smallest complete change, including affected data definitions, tests, and documentation. The dashboard is the current product priority.
4. With Node 22+, use `npm ci` for a clean setup, then `npm test` and `npm run build`. Run `npm run dev` to inspect the UI; `npm run dev:lan` is explicit trusted-LAN development only.
5. Inspect desktop and narrow layouts, normal/empty/disconnected states, and interactions. State any missing evidence; hardware behavior needs hardware verification.
6. Push the branch and open a PR to main. Describe the result, linked issue, validation evidence, and any remaining limits. Check GitHub Actions and fix failures.
7. Merge within the owner's authorization. No separate lead or second-person approval is required by this repository. Update docs/WORKLOG.md and close only acceptance criteria actually verified.

Never commit device credentials, real topology exports, .env files, node_modules, local tools, or build output. Preserve import compatibility and user data. Use tests for status freshness, trust boundaries, and failure recovery; fixtures never establish real network health.

Repository: https://github.com/Osbornejmb/netwatch. The checked-in docs/github-plan.json and docs/ROADMAP.md define the current four milestones, fifteen implementation issues, recommended solo order, and actual dependencies. The Publish project plan workflow matches stable plan markers before titles, creates only missing work, and preserves issue bodies/states. Keep deliberate acceptance-criteria changes synchronized between the plan and existing GitHub issues.
