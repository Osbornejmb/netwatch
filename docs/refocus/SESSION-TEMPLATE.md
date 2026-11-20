# Session template

You are working on the NetWatch repo, on branch [BRANCH NAME].

Your task this session: **[PHASE-0 | PHASE-1 | PHASE-2 | PHASE-3 | PHASE-4 | PHASE-5]**.

## Read these files first, in this order
1. docs/refocus/00-INTENT-AND-RULES.md
2. docs/refocus/01-SHARED-DESIGN.md
3. docs/refocus/[PHASE-N].md   <- your task for this session
4. docs/refocus/CORRECTNESS-AND-TESTS.md
5. docs/refocus/DECISIONS.md   <- my approved decisions; they override anything else
6. All earlier phase reports: docs/refocus/REPORT-PHASE-*.md
7. AGENTS.md and CONTRIBUTING.md

## Rules for this session
- Do only the phase named above. Do not start later phases, even if they look easy.
- If a file I listed doesn't exist, say so and stop, rather than guessing its content.
- If the code contradicts the instructions, or two instructions conflict, STOP and report the conflict. Do not pick silently.
- DECISIONS.md overrides the phase files if they disagree. Tell me about the disagreement.
- Don't change anything outside this phase's scope. No unrelated refactors.
- Work on the current branch only. Commit in small logical commits with clear messages. Do not push, merge, or rewrite history.
- Don't delete or reset the database. Back up before running any migration.

## Before writing any code
Reply with:
1. Confirmation that you read each file above (list them).
2. A summary of the plan in under 20 lines: files you'll touch, schema changes, tests you'll add.
3. **Decisions needed for this phase.** Compare the phase file, shared design, earlier reports, and `DECISIONS.md`. List each unresolved decision for this phase as a direct question. For each question, give your recommendation and explain what it affects. If there are none, say so. Then list any other conflicts or missing information.
Wait for me to resolve any blocking decisions and reply "approved" before you start editing. Plan approval alone does not resolve an unanswered decision. Leave later-phase decisions for those phases.

## When the phase is done
1. Write your report to docs/refocus/REPORT-PHASE-[N].md using the deliverable format in CORRECTNESS-AND-TESTS.md.
2. Run npm test, eslint, and the build, and include the real output in the report.
3. List anything you couldn't verify and everything you decided yourself.
4. Do not edit DECISIONS.md. Propose changes to it at the end of the report and I will apply them.

Extra context from me for this session:
[Optional: anything new, e.g. "I captured real snmpwalk output from my switch at tests/fixtures/real-walk-switch1.txt; use it as a fixture."]
