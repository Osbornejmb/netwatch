# NetWatch product brief

Current UI direction: a shared warm off-white design, everyday wording, a map-first dashboard, directly available search and progressively disclosed setup/details. Draft edits apply to monitoring only through an explicit replacement review.

## Primary outcome

Operators can maintain a map from known IP addresses and uplinks, then monitor it across routed networks. Device uptime checks use ICMP. Read-only SNMPv3 supplies port evidence for selected switches and routers. Discovery is optional.

A network operator opens the dashboard and immediately sees device reachability, where attention is needed, and how affected devices connect. The user's reference is a large up/down network map; NetWatch should make it cleaner through a viewport-filling topology, directly colored devices and paths, a small horizontal top menu, optional view controls, and click-to-open device details. The opening screen has no sidebar, summary-card row, or device table. A red router/path must not turn an independently responding redundant switch red.

## Priority order

1. A clear health dashboard: counts, topology, search, filters, inspection, and explicit monitoring freshness.
2. Real bounded Windows ICMP observations and reliable history/persistence.
3. Verified interface information, SNMP/LLDP, and redundancy groups.
4. Alerts and secured remote access.

Topology creation/import remains a supporting workflow. Keep the existing editor available rather than rebuilding it. A BGP-looking topology does not establish a requirement for a BGP collector: ICMP reachability, interface state, and routing-session state are different signals. Confirm routing protocol requirements before adding a collector.

## Delivery boundary

Read-only SNMPv3 interface collection is implemented locally for #7, behind separate Windows-host enrollment and global opt-in. It adds interface evidence without changing device reachability semantics. Cisco Catalyst 3750/Cisco 2811 hardware validation is still pending; no model support is claimed solely from protocol fixtures.

The Windows tray host starts manually in a signed-in session. Private-network sharing is opt-in and requires direct HTTPS. See [Remote access](REMOTE-ACCESS.md) for deployment and release checks.

The dashboard displays genuine host observations; fresh browser and host inventories start empty. Built-in demo devices/statuses and preview controls are removed. Synthetic observations exist only in tests. See ARCHITECTURE.md for implemented components and ROADMAP.md for remaining work.
