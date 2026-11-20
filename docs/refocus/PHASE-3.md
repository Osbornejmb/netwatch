## Phase 3: Core UI (the refocus)
Against real discovered topologies as well as hand-built ones:
1. **Status banner** answering the north-star question in one line from real data ("3 switches are running without redundancy"). Never say "all healthy" with stale, missing, or unmonitored data, and state coverage ("9 of 14 uplinks monitored").
2. **Attention list** ordered by severity: isolated, degraded redundancy, down links, one-sided/mismatch, speed mismatches, high error rates, stale or unmonitored uplinks, SPOFs, unverified or conflicting links.
3. **Links-first topology map**: links are primary (port names at both ends, speed, state with evidence), devices are nodes, hierarchy layout (root on top, depth below), with Circle and Tidy still available.
4. **Tier/device summary** of Healthy / Degraded / Isolated / Unknown counts.
5. Link detail panel with evidence, monitoring scope, and age; device redundancy panel; SPOF list; admin baseline acceptance flow (reviewed); per-state explainers; "How NetWatch decides a link is healthy" doc.
6. Demote peripheral features (generic device list, per-device history, local Scan now) rather than deleting them. Keep Dashboard/Edit map/Devices routes and reload/Back/Forward working.
7. Rewrite README opening, page titles, empty states, and onboarding for the new purpose, in the existing plain-language style. Move internal detail (layout snapping, row caps, lock-file behavior) to docs/.
Keep accessibility: keyboard-operable lists, Enter/Space activation, status not conveyed by color alone, narrow-screen layouts. Update the scripts/check-*-browser.mjs checks. Provide screenshots from the synthetic test inventory (documentation addresses only).
