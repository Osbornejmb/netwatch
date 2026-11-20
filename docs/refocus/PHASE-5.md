## Phase 5: Dynamics
- Scheduled rediscovery (default off, admin-configurable interval, still proposal-only) with change events: device added, link added, link moved to another port, link missing, speed changed. A recent-changes feed.
- New incident type for loss of redundancy, integrated with existing incident storage and Needs attention, with dependency-aware suppression so devices behind an isolated parent produce one incident, not many.
- What-if analysis: select a device or link and see what becomes isolated or degraded if it fails, computed from the graph only and labelled a topology-based estimate.
- Optional, behind its own admin setting: edge-port device visibility from Q-BRIDGE-MIB and ARP, excluding uplink ports, with its own limits and viewer-visibility review.
- If the SSE work exists, push updates through it. Don't build new streaming otherwise.
