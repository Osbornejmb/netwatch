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
3. If a named context is required, fully quit the launcher from the tray and configure it in PowerShell as shown below. Use documentation examples only as placeholders for your switch IP and the exact context it reports. Keep any existing mappings for other switches.
4. Open NetWatch and start the host. Confirm that **Devices → Ports** shows recent readings for the switch.

```powershell
# Example of one switch using a named context.
$value = '192.0.2.2=vlan-100'
[Environment]::SetEnvironmentVariable('NETWATCH_SNMP_PORT_CONTEXTS', $value, 'User')
$env:NETWATCH_SNMP_PORT_CONTEXTS = $value
& "$env:LOCALAPPDATA\Programs\NetWatch\NetWatch.exe"
```

Enter multiple mappings separated by commas, such as `192.0.2.2=vlan-100,192.0.2.3=vlan-200`. Each switch can have one configured forwarding-table context. Regular interface polling, LLDP, and CDP use the default context. Named VLAN contexts and CDP-assisted switch-port matching require a build that includes those fixes. The original v0.2.0 installer predates them.

## 5. Review and save the discovered connections

1. Keep a test endpoint connected and awake. After a fresh port poll, select **Discovered → Scan now**.
2. Look for **Seen on** and the interface name on the endpoint's row. Add a new device to the draft with its connection. For a device already on the saved map, look under **Local connection hints → Review hint** when suggestions are available.
3. Verify the draft before selecting **Use this map**. Check an access link against the switch's MAC table. Check a trunk against the switch's neighbor table, including the local and remote ports.
4. Enroll each switch whose access ports you want to map. A switch can learn an endpoint's MAC through a trunk. The switch the endpoint is plugged into supplies the access-port evidence. Correct any old inaccurate link in **Edit map** before saving the revised draft.

## Example: Cisco Catalyst 3750 running IOS

The example uses VLAN 100, a monitoring PC at the documentation address `192.0.2.10`, and a standard ACL numbered 42. Substitute the real source IP and an appropriate unused ACL number, or reuse the existing restricted ACL. Replace the username and passphrase placeholders. The switch should already have a reachable management IP and the required VLANs, access ports, and trunks.

```text
configure terminal
access-list 42 permit host 192.0.2.10
snmp-server view NETWATCH sysUpTime included
snmp-server view NETWATCH ifTable included
snmp-server view NETWATCH ifXTable included
snmp-server view NETWATCH 1.3.6.1.4.1.9.9.23.1.2.1.1 included
snmp-server group NETWATCH v3 priv read NETWATCH access 42
snmp-server user netwatch-poller NETWATCH v3 auth sha <AUTH_PASSPHRASE> priv aes 128 <PRIVACY_PASSPHRASE>
end
show snmp context
```

If the endpoint VLAN's context is listed as `vlan-100`, add a dedicated view for it. Substitute the context and view name for a different VLAN. Keep the default group entry for interface polling and CDP.

```text
configure terminal
snmp-server view NETWATCH-VLAN100 1.3.6.1.2.1.17.1.4.1.2 included
snmp-server view NETWATCH-VLAN100 1.3.6.1.2.1.17.4.3.1.2 included
snmp-server group NETWATCH v3 priv context vlan-100 read NETWATCH-VLAN100 access 42
end
show snmp group
show snmp view
show snmp user
show interfaces trunk
show cdp neighbors detail
```

On IOS versions that require it, run `show snmp view` without a view name. Use `show interfaces <access-interface> switchport` and `show mac address-table interface <access-interface>` to verify the endpoint VLAN and learned MAC. After you confirm the matches in NetWatch, save the switch configuration with `copy running-config startup-config`. [Cisco SNMP configuration guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/15-0_2_se/configuration/guide/scg3750/swsnmp.html) · [Cisco CDP MIB reference](https://www.cisco.com/c/en/us/td/docs/security/ise/1-4-1/admin_guide/b_ise_admin_guide_141/b_ise_admin_guide_141_chapter_0100001.pdf)

## Troubleshooting

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
