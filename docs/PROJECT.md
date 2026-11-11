# NetWatch product brief

## Primary outcome

A network operator opens the dashboard and immediately sees device reachability, where attention is needed, and how affected devices connect. The user's reference is a large up/down network map; NetWatch should make it cleaner through a dominant full-width topology, directly colored devices and paths, compact filters, and click-to-open device details. A red router/path must not turn an independently responding redundant switch red.

## Priority order

1. A clear health dashboard: counts, topology, search, filters, inspection, and explicit monitoring freshness.
2. Real bounded Windows ICMP observations and reliable history/persistence.
3. Verified interface information, SNMP/LLDP, and redundancy groups.
4. Alerts and secured remote access.

Topology creation/import remains a supporting workflow. Keep the existing editor available rather than rebuilding it. A BGP-looking topology does not establish a requirement for a BGP collector: ICMP reachability, interface state, and routing-session state are different signals. Confirm routing protocol requirements before adding a collector.

## Delivery boundary

The first dashboard is a UI foundation with a separately labelled sample preview. Actual inventory remains unmonitored until the host collector exists. Never use sample statuses as evidence that real monitoring works. See ARCHITECTURE.md for implemented components and ROADMAP.md for remaining work.
