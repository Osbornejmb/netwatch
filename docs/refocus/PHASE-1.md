## Phase 1: Foundations (no UI redesign, no crawler)
- Additive migration: interfaces/ports as link endpoints, the link table above, link roles, redundancy groups and baselines, plus a verified upgrade path for existing connections and "Uplinks & redundancy" groups.
- The pure engine module with exhaustive table-driven tests: chain, tree, ring/loop, dual-homed switch, dual links between two switches, port-channel with 1 of 2 members down, STP standby, isolated subtree, two roots, SPOF switch, SPOF link, stale readings, partially monitored network, conflicting ends, flapping, ping-only network.
- Expose results via the existing snapshot, role-filtered, backward-compatible. Document new fields in docs/HOST-API.md.
- The features must work end to end on manually mapped links, with no discovery.
Acceptance: existing tests, lint, and build pass; engine tests cover every case above; the migration is idempotent and lossless; honesty tests pass (a ping-only network never yields "redundancy verified", and stale data never yields Healthy).
