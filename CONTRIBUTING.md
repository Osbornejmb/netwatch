# Contributing

Use Node.js 22 or newer. Run `npm ci`, `npm test`, and `npm run build` before a pull request. Use `npm run dev` for local development or `npm run dev:lan` only on a trusted LAN.

Follow docs/ROADMAP.md in dependency order. Keep each pull request focused on one issue and include its acceptance evidence. Never commit device credentials, real topology exports, .env files, node_modules, or build output. New API and probe logic needs boundary and failure-path tests. Preserve existing exports when changing the schema.

The project repository is https://github.com/Osbornejmb/netwatch. docs/github-plan.json contains the proposed private repository, four milestones, twelve ordered issues, and acceptance criteria. The Publish project plan workflow creates missing milestones and issues, resolves dependency keys to issue links, and preserves existing issue bodies and states. Rerun it from Actions if publication fails.
