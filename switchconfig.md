# Configure a managed switch for NetWatch

Use this guide to set up read-only SNMPv3 monitoring and discover which switch ports connect to neighboring devices. The basic monitoring setup applies to managed switches that expose standard interface MIBs. Forwarding-table discovery also depends on the switch's VLAN support and the tables it exposes. The Cisco IOS example below includes the additional configuration verified on a Catalyst 3750.

## 1. Prepare the switch and network

1. Use the switch's local console or management interface to assign it a unique management IP. Use the management VLAN, subnet mask, and gateway or return route appropriate for your network.
2. Make sure the Windows PC running NetWatch can reach the management IP and that the switch can reply to the PC. Allow SNMP requests from that PC's source IP to UDP port 161.
3. Configure endpoint-facing ports as access ports in the intended VLANs. If there is an inter-switch trunk, verify its allowed VLANs and native or untagged VLAN at both ends. An administrative console connection is independent of the Ethernet topology.
4. Verify that the switch learns a test endpoint's MAC on the expected access port and VLAN. For switch-to-switch connections, check the switch's LLDP or CDP neighbor table for the adjacent switch and its remote port.

## 2. Create a read-only SNMPv3 account

1. Create an SNMP read view with system uptime and the standard interface tables. These supply interface names, status, rates, and counters.
2. Create an SNMPv3 group or equivalent access policy with **authentication and privacy** (`authPriv`). Assign the read view and restrict requests to the NetWatch PC's source address where the switch supports it. Leave the write view unset.
3. Create a dedicated SNMPv3 user in that group. Choose SHA-256 when the switch firmware and NetWatch both support it. Older IOS uses `sha`, which corresponds to **SHA-1** in NetWatch. Use **AES-128** privacy and distinct authentication and privacy passphrases.
4. Keep the username, algorithms, and passphrases available for enrollment. Enter the secrets in NetWatch's local **Port monitoring…** dialog.

## 3. Grant the read access needed for discovery

| Purpose | MIB subtree | Where NetWatch reads it |
| --- | --- | --- |
| Uptime and interface readings | `sysUpTime` (`1.3.6.1.2.1.1.3`), `ifTable` (`1.3.6.1.2.1.2.2`), and `ifXTable` (`1.3.6.1.2.1.31.1.1`) | Default context |
| LLDP neighbors, when supported and enabled | LLDP-MIB (`1.0.8802.1.1.2`) | Default context |
| Cisco CDP neighbors | Cisco CDP neighbor cache (`1.3.6.1.4.1.9.9.23.1.2.1.1`) | Default context |
| Bridge-port mapping to interface indexes | `dot1dBasePortIfIndex` (`1.3.6.1.2.1.17.1.4.1.2`) | Default context or the configured VLAN context |
| Learned MAC forwarding ports | `dot1qTpFdbPort` (`1.3.6.1.2.1.17.7.1.2.2.1.2`) or `dot1dTpFdbPort` (`1.3.6.1.2.1.17.4.3.1.2`) | Same context as the bridge-port mapping |

On switches that expose the forwarding table in the default context, grant the bridge-port and forwarding subtrees in the default read view. If the switch exposes them in a named VLAN context, grant the SNMPv3 group read access in that context and use the exact context name the switch reports. The management VLAN and the endpoint's access VLAN can differ. Use the context that exposes the endpoint's MAC entries.

## 4. Enroll the switch in NetWatch

1. In **Discovered**, scan for the switch, or add it manually in **Edit map**. Set the device type to **Switch**, use its management IP, and select **Use this map** so the launcher can enroll it.
2. Stop the NetWatch host. In the Windows launcher, open **Port monitoring…**, select the switch, and enter its SNMPv3 credentials. Enable **Check ports on next start** and **Discover local network neighbors on next start**.
3. If a named context is required, enter its exact name in **VLAN context** for the selected switch. Select **Test connection**, then **Enable monitoring** to save the credentials and context together. For an enrolled switch, **Save context** changes only the context. Clear the field and save it to use the default context.
4. Start the host and confirm that **Devices → Ports** shows recent readings for the switch.

Each switch has its own forwarding-table context. Interface polling, LLDP, and CDP use the default context. An older environment-variable mapping can still supply a value until you save a context for that switch in the launcher. Standalone hosts can use `NETWATCH_SNMP_PORT_CONTEXTS` with comma-separated `management-IP=context-name` entries. Named VLAN contexts, CDP-assisted matching, and the launcher field require a build that includes these changes. The original v0.2.0 installer predates them.

## 5. Review and save the discovered connections

1. Keep a test endpoint connected and awake. After a fresh port poll, select **Discovered → Scan now**.
2. Look for **Seen on** and the interface name on the endpoint's row. Add a new device to the draft with its connection. For a device already on the saved map, look under **Local connection hints → Review hint** when suggestions are available.
3. Verify the draft before selecting **Use this map**. Check an access link against the switch's MAC table. Check a trunk against the switch's neighbor table, including the local and remote ports.
4. Enroll each switch whose access ports you want to map. A switch can learn an endpoint's MAC through a trunk. The switch the endpoint is plugged into supplies the access-port evidence. Correct any old inaccurate link in **Edit map** before saving the revised draft.

## Cisco IOS example from a blank switch

Before running any command, collect the required values from [Network setup and troubleshooting](docs/NETWORK-TROUBLESHOOTING.md). Angle-bracket labels are required inputs, not literal IOS commands. Use the console, obtain a unique management IP and subnet mask from your network administrator/address plan, and use the actual management VLAN and physical port names. Check existing configuration before modifying an in-service switch; apply compatible trunk settings at both ends.

### A. Create the VLAN, management interface, and ports

Supply the actual access and trunk ports from cable tracing and `show interfaces status`. Supply the management VLAN ID from the network plan and existing VLAN database.

```text
configure terminal
vlan <MANAGEMENT_VLAN_ID>
 name NETWATCH-LAB
exit
interface vlan <MANAGEMENT_VLAN_ID>
 ip address <SWITCH_MANAGEMENT_IPV4> <MANAGEMENT_SUBNET_MASK>
 no shutdown
exit
interface <PC_ACCESS_PORT>
 switchport mode access
 switchport access vlan <MANAGEMENT_VLAN_ID>
 no shutdown
exit
interface <LOCAL_TRUNK_PORT>
 switchport trunk encapsulation dot1q
 switchport mode trunk
 switchport trunk allowed vlan add <MANAGEMENT_VLAN_ID>
 no shutdown
end
show ip interface brief
show interfaces <PC_ACCESS_PORT> switchport
show interfaces trunk
show mac address-table interface <PC_ACCESS_PORT>
```

If the switch only supports 802.1Q, it may omit the encapsulation command. Verify the allowed and native VLANs on both ends. If the monitoring PC is on another subnet, configure the switch's management return path for that network. An SVI may remain down until the VLAN has an active member port.

### B. Enable and verify neighbor discovery

Enable LLDP on the switch and allow it to transmit and receive on the inter-switch interface. Use this for standards-based adjacency and NetWatch's **Find connections** crawl. [Cisco LLDP configuration guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/12-2_52_se/configuration/guide/3750scg/swlldp.html)

```text
configure terminal
lldp run
interface <LOCAL_TRUNK_PORT>
 lldp transmit
 lldp receive
end
show lldp
show lldp neighbors detail
```

Use CDP where both sides support it and your network permits it. NetWatch can use the advertised management address and interface to suggest the neighboring Cisco switch and avoid mistaking a MAC learned through the trunk for a directly attached PC. [Cisco CDP configuration guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/12-2_52_se/configuration/guide/3750scg/swcdp.html)

```text
configure terminal
cdp run
interface <LOCAL_TRUNK_PORT>
 cdp enable
end
show cdp neighbors detail
```

Verify the neighbor's management address, local interface, and remote port. Enable the chosen protocol on the corresponding interface of the other switch. The CDP hint can work on its own. The separate **Find connections** crawler requires a usable LLDP chassis identity.

### C. Create the read-only SNMPv3 account and views

Obtain the source PC IPv4 from `ipconfig /all` on the NetWatch host and verify the route to the switch with `route print -4`. Do not use the switch management IP or DHCP server address in the source ACL. Choose the username (or read the existing one with `show snmp user`) and enter both passphrases locally. Identify an appropriate unused ACL number or reuse the existing restricted ACL after checking its rules and other uses. The default view grants uptime, interface counters, LLDP, and CDP. Omit the discovery subtree for a protocol you do not use.

```text
configure terminal
access-list <SNMP_ACL_NUMBER> permit host <NETWATCH_PC_IPV4>
snmp-server view NETWATCH sysUpTime included
snmp-server view NETWATCH ifTable included
snmp-server view NETWATCH ifXTable included
snmp-server view NETWATCH 1.0.8802.1.1.2 included
snmp-server view NETWATCH 1.3.6.1.4.1.9.9.23.1.2.1.1 included
snmp-server group NETWATCH v3 priv read NETWATCH access <SNMP_ACL_NUMBER>
snmp-server user <SNMP_USERNAME> NETWATCH v3 auth sha <AUTH_PASSPHRASE> priv aes 128 <PRIVACY_PASSPHRASE>
end
show snmp group
show snmp user
show snmp view
show snmp context
```

With IOS `auth sha`, select **SHA-1** in the NetWatch launcher. The privacy setting is **AES-128**. [Cisco SNMP configuration guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/15-0_2_se/configuration/guide/scg3750/swsnmp.html) · [Cisco CDP MIB reference](https://www.cisco.com/c/en/us/td/docs/security/ise/1-4-1/admin_guide/b_ise_admin_guide_141/b_ise_admin_guide_141_chapter_0100001.pdf)

### D. Expose the MAC forwarding table

If `show snmp context` lists a context for the endpoint VLAN, supply its exact name as `<VLAN_CONTEXT>` (Cisco names often contain a hyphen). Add a dedicated read view and group entry for that context. Keep the default group entry for interface polling and neighbor discovery.

```text
configure terminal
snmp-server view NETWATCH-FDB 1.3.6.1.2.1.17.1.4.1.2 included
snmp-server view NETWATCH-FDB 1.3.6.1.2.1.17.4.3.1.2 included
snmp-server group NETWATCH v3 priv context <VLAN_CONTEXT> read NETWATCH-FDB access <SNMP_ACL_NUMBER>
end
show snmp group
show snmp view
show mac address-table interface <PC_ACCESS_PORT>
```

If the switch exposes the forwarding table in the default context, use this block instead of the named VLAN view. Grant the VLAN-aware forwarding column when the switch supports it. NetWatch falls back to the standard forwarding column when the VLAN-aware table is empty.

```text
configure terminal
snmp-server view NETWATCH 1.3.6.1.2.1.17.1.4.1.2 included
snmp-server view NETWATCH 1.3.6.1.2.1.17.7.1.2.2.1.2 included
snmp-server view NETWATCH 1.3.6.1.2.1.17.4.3.1.2 included
end
show snmp view
```

### E. Optional STP and LACP evidence

If the switch exposes these tables and you want NetWatch to use them for link health and redundancy, include their columns in the default view. The STP bridge-port map and state must describe the same bridge context. Interface readings and topology discovery work without these optional columns.

```text
configure terminal
snmp-server view NETWATCH 1.3.6.1.2.1.17.1.4.1.2 included
snmp-server view NETWATCH 1.3.6.1.2.1.17.2.15.1.3 included
snmp-server view NETWATCH 1.2.840.10006.300.43.1.2.1.1.13 included
end
show snmp view
```

### F. Enroll, test, and save

1. [Enroll the switch in NetWatch](#4-enroll-the-switch-in-netwatch). Enter the actual context name from `show snmp context` in the launcher's **VLAN context** field only if you used the named context above. Save it during enrollment or with **Save context**.
2. [Review the discovered connections](#5-review-and-save-the-discovered-connections). Confirm the access-port hint and switch-to-switch link against the switch console.
3. Save the switch configuration after verifying the results.

```text
copy running-config startup-config
```

## Troubleshooting

Start with the [ordered Windows, VLAN, ACL and SNMP diagnostics](docs/NETWORK-TROUBLESHOOTING.md). A failed interface test is not evidence of a VLAN-context problem; test the default-context interface view first.

To replace an existing SNMPv3 username, create the new user in the same group with the command in section C, test and enroll it, then remove the old user with `no snmp-server user <OLD_SNMP_USERNAME> NETWATCH v3` only after verifying no other poller needs it. Save the configuration after verification.

| Symptom | Check |
| --- | --- |
| Switch is missing from **Port monitoring…** | Save the device with its management IP and type **Switch**, then stop the host before opening enrollment. |
| No fresh readings in **Ports** | Check the collector setting, connectivity, source ACL, and SNMPv3 authentication and privacy settings. |
| Port readings work, but the VLAN request returns authorization error 16 | Verify the exact context name and the group's read access in that context. |
| Port readings work, but no **Seen on** match appears | Check Windows' neighbor entry with `arp -a <endpoint-IP>`. Compare its MAC with the switch's forwarding table. An empty bridge-port table can indicate a missing read-view subtree or the wrong context. |
| A PC appears on an inter-switch trunk | Check LLDP or CDP neighbor evidence on that port and the default SNMPv3 read view. Enroll the switch the PC is plugged into to find its access port. |
| **Device identity unavailable** appears under **Topology proposals** | This describes the separate LLDP topology crawl. Check **Discovered devices** and **Local connection hints** for forwarding-table and CDP hints. |
| **Review gateway hint** is the only option | A gateway hint describes routing. Check the switch reads before using it to reason about physical connections. |

See [NetWatch discovery behavior](docs/DISCOVERY.md) and [SNMP port monitoring](docs/SNMP-INTERFACES.md).
