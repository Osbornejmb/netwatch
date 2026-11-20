## Correctness requirements (every phase)
- Never present an unverified or stale state as healthy; show Unknown with the reason.
- Standby links (STP-blocked, inactive LAG members) are healthy redundancy, not failures.
- Hysteresis consistent with the existing two-consecutive-failures rule.
- New states and visuals must not change the meaning of existing Up/Down/Overdue states or map line colors without my approval.

## Tests (every phase)
Run npm test, eslint, and the build; all must pass. Include migration tests (existing database, idempotent re-run, no data loss), API authorization tests (unauthenticated, viewer, admin, viewer projection, CSRF/write headers, backward compatibility of existing snapshot fields), honesty tests, and browser check updates. Report anything untestable (real vendor behavior, real switches, specific IOS versions) and don't claim compatibility for it.

## Deliverable format for each phase
1. What changed and why, file by file.
2. Schema migration details and how it was verified on an existing database.
3. Test commands and results, and what could not be verified.
4. Screenshots (Phases 3 and later) using synthetic data only.
5. Decisions made between alternatives with tradeoffs, and every place the codebase contradicted this prompt.
6. A focus check: re-run the Phase 0 scorecard and show the status of gap questions a-i.
