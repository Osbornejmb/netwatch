# Configure a managed switch for NetWatch

Use this guide to set up read-only SNMPv3 port monitoring for switches you have added by management IP. Standard interface MIBs supply port status and counters for manually mapped uplinks. VLAN forwarding tables, LLDP, and CDP support optional discovery. The Cisco IOS example below includes the additional configuration verified on a Catalyst 3750.

**Start here:** If you already have a working management IP, skip the blank-switch VLAN/trunk commands. Check Windows reachability and the existing SNMP configuration first. For a new switch, follow sections A–F in order. Only an authorized administrator should change device configuration.

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

Run these commands at the Cisco IOS console. Before pasting a block, replace each `<PLACEHOLDER>` with the value for this switch and remove the angle brackets. Use the same value wherever a placeholder repeats. Skip sections that are already configured on an in-service switch.

| Placeholder | Value to enter |
| --- | --- |
| `<MANAGEMENT_VLAN_ID>`, `<ACCESS_VLAN_ID>` | Numeric VLAN IDs from your network plan for switch management and the endpoint port. These may be the same VLAN. |
| `<MANAGEMENT_VLAN_NAME>` | The name approved for the management VLAN. |
| `<SWITCH_MANAGEMENT_IP>`, `<SWITCH_SUBNET_MASK>` | The unique management IP assigned to this switch and its dotted-decimal subnet mask. |
| `<ACCESS_PORT>`, `<TRUNK_PORT>` | Exact IOS interface names for the endpoint and the uplink. Check the cabling and `show interfaces status`. |
| `<TRUNK_VLAN_LIST>` | The VLAN IDs this trunk should carry, as a comma-separated list or range accepted by IOS. Verify the same VLANs at the other end. |
| `<NETWATCH_PC_IP>` | The source IP the switch sees from the Windows PC running NetWatch. Use its stable address, accounting for any address translation. |
| `<SNMP_ACL_NUMBER>` | The approved numbered standard ACL that permits the NetWatch PC. Check `show access-lists` before creating or modifying an ACL. |
| `<SNMP_GROUP>`, `<DEFAULT_READ_VIEW>`, `<VLAN_READ_VIEW>` | The SNMPv3 group name, its default read-view name, and the separate view name for optional VLAN forwarding-table access. Reuse your approved names or assign unused names. |
| `<SNMP_USERNAME>` | The account name created for NetWatch. Enter the same username in the launcher. |
| `<AUTH_PASSPHRASE>`, `<PRIVACY_PASSPHRASE>` | The distinct authentication and privacy passphrases for that SNMPv3 account. Enter them only in your switch console and NetWatch launcher. |
| `<VLAN_CONTEXT>` | The exact context name for the endpoint VLAN reported by `show snmp context`. This is only needed for optional forwarding-table discovery. |

For help finding these values, see [Network setup and troubleshooting](docs/NETWORK-TROUBLESHOOTING.md).

### A. Create the VLAN, management interface, and ports

Supply the actual access and trunk ports from cable tracing and `show interfaces status`. Supply the management VLAN ID from the network plan and existing VLAN database.

```text
configure terminal
vlan <MANAGEMENT_VLAN_ID>
 name <MANAGEMENT_VLAN_NAME>
exit
interface vlan <MANAGEMENT_VLAN_ID>
 ip address <SWITCH_MANAGEMENT_IP> <SWITCH_SUBNET_MASK>
 no shutdown
exit
interface <ACCESS_PORT>
 switchport mode access
 switchport access vlan <ACCESS_VLAN_ID>
 no shutdown
exit
end
show ip interface brief
show interfaces <ACCESS_PORT> switchport
show mac address-table interface <ACCESS_PORT>
```

If connecting a second switch, configure the actual inter-switch port on both ends. On an existing trunk do not replace allowed VLANs or change encapsulation unnecessarily. Only for a new trunk, run the following after confirming the required VLANs and native VLAN on both ends. If the switch only supports 802.1Q, omit the encapsulation command.

```text
configure terminal
interface <TRUNK_PORT>
 switchport trunk encapsulation dot1q
 switchport mode trunk
 switchport trunk allowed vlan add <TRUNK_VLAN_LIST>
 no shutdown
end
show interfaces trunk
```

For the remote switch, substitute its own trunk port. The block adds the management VLAN; obtain any additional required VLANs from the network plan. Verify the allowed and native VLANs on both ends. If the monitoring PC is on another subnet, configure the switch's management return path for that network. An SVI may remain down until the VLAN has an active member port.

### B. Enable and verify neighbor discovery

Enable LLDP on the switch and allow it to transmit and receive on the inter-switch interface. Use this for standards-based adjacency and NetWatch's **Find connections** crawl. [Cisco LLDP configuration guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/12-2_52_se/configuration/guide/3750scg/swlldp.html)

```text
configure terminal
lldp run
interface <TRUNK_PORT>
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
interface <TRUNK_PORT>
 cdp enable
end
show cdp neighbors detail
```

Verify the neighbor's management address, local interface, and remote port. Enable the chosen protocol on the corresponding interface of the other switch. **Find connections** can follow CDP when LLDP is unavailable if the advertised address matches an enrolled switch or router within the discovery range.

### C. Create the read-only SNMPv3 account and views

Obtain the source PC IPv4 from `ipconfig /all` on the NetWatch host and verify the route to the switch with `route print -4`. Do not use the switch management IP or DHCP server address in the source ACL. Choose the username (or read the existing one with `show snmp user`) and enter both passphrases locally. Identify an appropriate unused ACL number or reuse the existing restricted ACL after checking its rules and other uses. The default view grants uptime, interface counters, LLDP, and CDP. Omit the discovery subtree for a protocol you do not use.

```text
configure terminal
access-list <SNMP_ACL_NUMBER> permit host <NETWATCH_PC_IP>
snmp-server view <DEFAULT_READ_VIEW> sysUpTime included
snmp-server view <DEFAULT_READ_VIEW> ifTable included
snmp-server view <DEFAULT_READ_VIEW> ifXTable included
snmp-server view <DEFAULT_READ_VIEW> 1.0.8802.1.1.2 included
snmp-server view <DEFAULT_READ_VIEW> 1.3.6.1.4.1.9.9.23.1.2.1.1 included
snmp-server group <SNMP_GROUP> v3 priv read <DEFAULT_READ_VIEW> access <SNMP_ACL_NUMBER>
snmp-server user <SNMP_USERNAME> <SNMP_GROUP> v3 auth sha <AUTH_PASSPHRASE> priv aes 128 <PRIVACY_PASSPHRASE>
end
show snmp group
show snmp user
show snmp view
show snmp context
```

With IOS `auth sha`, select **SHA-1** in the NetWatch launcher. The privacy setting is **AES-128**. [Cisco SNMP configuration guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/15-0_2_se/configuration/guide/scg3750/swsnmp.html) · [Cisco CDP MIB reference](https://www.cisco.com/c/en/us/td/docs/security/ise/1-4-1/admin_guide/b_ise_admin_guide_141/b_ise_admin_guide_141_chapter_0100001.pdf)

#### Correct an existing source ACL

On the switch console, run `show snmp group` and `show access-lists` to identify the ACL already used by SNMP. On Windows, use `ipconfig /all` and `route print -4` to obtain the actual host source IPv4. Review ACL usage and rule order before editing. If the address is missing and you are authorized to add it, preserve existing rules and ensure the new permit precedes any explicit deny.

```text
configure terminal
ip access-list standard <SNMP_ACL_NUMBER>
permit host <NETWATCH_PC_IP>
exit
end
show access-lists <SNMP_ACL_NUMBER>
```

Test the existing username and credentials in NetWatch before saving the configuration. Do not create a second group or user just to fix an ACL mismatch.

### D. Expose the MAC forwarding table

If `show snmp context` lists a context for the endpoint VLAN, supply its exact name as `<VLAN_CONTEXT>` (Cisco names often contain a hyphen). Add a dedicated read view and group entry for that context. Keep the default group entry for interface polling and neighbor discovery.

```text
configure terminal
snmp-server view <VLAN_READ_VIEW> 1.3.6.1.2.1.17.1.4.1.2 included
snmp-server view <VLAN_READ_VIEW> 1.3.6.1.2.1.17.4.3.1.2 included
snmp-server group <SNMP_GROUP> v3 priv context <VLAN_CONTEXT> read <VLAN_READ_VIEW> access <SNMP_ACL_NUMBER>
end
show snmp group
show snmp view
show mac address-table interface <ACCESS_PORT>
```

If the switch exposes the forwarding table in the default context, use this block instead of the named VLAN view. Grant the VLAN-aware forwarding column when the switch supports it. NetWatch falls back to the standard forwarding column when the VLAN-aware table is empty.

```text
configure terminal
snmp-server view <DEFAULT_READ_VIEW> 1.3.6.1.2.1.17.1.4.1.2 included
snmp-server view <DEFAULT_READ_VIEW> 1.3.6.1.2.1.17.7.1.2.2.1.2 included
snmp-server view <DEFAULT_READ_VIEW> 1.3.6.1.2.1.17.4.3.1.2 included
end
show snmp view
```

### E. Optional STP and LACP evidence

If the switch exposes these tables and you want NetWatch to use them for link health and redundancy, include their columns in the default view. The STP bridge-port map and state must describe the same bridge context. Interface readings and topology discovery work without these optional columns.

```text
configure terminal
snmp-server view <DEFAULT_READ_VIEW> 1.3.6.1.2.1.17.1.4.1.2 included
snmp-server view <DEFAULT_READ_VIEW> 1.3.6.1.2.1.17.2.15.1.3 included
snmp-server view <DEFAULT_READ_VIEW> 1.2.840.10006.300.43.1.2.1.1.13 included
end
show snmp view
```

### F. Enroll, test, and save

1. [Enroll the switch in NetWatch](#4-enroll-the-switch-in-netwatch). Enter the same value you used for `<VLAN_CONTEXT>` in the launcher's **VLAN context** field if you enabled named-context forwarding-table access. Save it during enrollment or with **Save context**.
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
| Port readings work, but no **Seen on** match appears | Run `arp -a <ENDPOINT_IP>` on the NetWatch PC. Replace `<ENDPOINT_IP>` with the assigned IP of the endpoint you are looking for and remove the brackets. Compare its MAC with the switch's forwarding table. An empty bridge-port table can indicate a missing read-view subtree or the wrong context. |
| A PC appears on an inter-switch trunk | Check LLDP or CDP neighbor evidence on that port and the default SNMPv3 read view. Enroll the switch the PC is plugged into to find its access port. |
| **Device identity unavailable** appears under **Topology proposals** | NetWatch could not read an LLDP chassis ID or find a readable CDP report for an enrolled neighbor in range. Check the CDP neighbor table, CDP access in the SNMP read view, and each neighbor's saved address and enrollment. |
| **Review gateway hint** is the only option | A gateway hint describes routing. Check the switch reads before using it to reason about physical connections. |

See [NetWatch discovery behavior](docs/DISCOVERY.md) and [SNMP port monitoring](docs/SNMP-INTERFACES.md).
