## Phase 4: Richer link evidence
- CDP (cdpCacheTable 1.3.6.1.4.1.9.9.23.1.2.1.1, indexed by ifIndex; address, device ID, remote port, platform, capabilities) merged with LLDP evidence for the same link, with source = both.
- Uplink role inference: BFS depth from the root (toward root = uplink, away = downlink, equal depth = peer), with admin override always winning.
- Poll both ends of every accepted link using the existing SNMP interface feature: ifOperStatus, ifHighSpeed, ifHCInOctets/ifHCOutOctets, errors and discards. Handle 64-bit counter wraps and device reboots (sysUpTime reset). Detect speed mismatch and one-sided-down.
- LACP (dot3adAggPortAttachedAggID 1.2.840.10006.300.43.1.2.1.1.13): treat a bundle as one logical link with member links beneath it. STP port state (dot1dStpPortState 1.3.6.1.2.1.17.2.15.1.3): a blocking port is Standby.
- Update the engine and UI so redundancy is no longer labelled "based on link status only" where STP/LACP data exists.
