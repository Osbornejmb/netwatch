# Configure a Cisco Catalyst switch for NetWatch

This guide covers read-only SNMPv3 on a Catalyst 3750, including access-port discovery in a named VLAN context and Cisco Discovery Protocol (CDP) evidence for trunks. Start with one switch and one endpoint, then enroll the second switch.

Use a NetWatch build that includes named SNMPv3 contexts and CDP-assisted switch-port matching. The original v0.2.0 installer does not include these fixes. A locally patched v0.2.0 installation may still show that version in Windows.

## 1. Verify the switch and VLANs

### Start with an unconfigured switch

Use the local console and choose unused management addresses before making changes. This example puts management and the two endpoint access ports in VLAN 100. Run the appropriate block on each switch. If the management VLAN and wiring already work, skip to the verification commands.

On the switch with the endpoint on port 9 and trunk on port 2

```text
configure terminal
vlan 100
 name NETWATCH-LAB
exit
interface vlan 100
 ip address 192.0.2.2 255.255.255.0
 no shutdown
exit
interface fastethernet1/0/9
 switchport mode access
 switchport access vlan 100
 no shutdown
exit
interface fastethernet1/0/2
 switchport trunk encapsulation dot1q
 switchport mode trunk
 switchport trunk allowed vlan add 100
 no shutdown
end
```

On the second switch, use the same pattern with management IP `192.0.2.3`, trunk `Fa1/0/1`, and access port `Fa1/0/4`. If IOS does not offer `switchport trunk encapsulation dot1q`, verify that the port uses fixed 802.1Q encapsulation before proceeding. Leave the native VLAN consistent at both ends. The example assumes the NetWatch PC is in the same subnet. If monitoring is routed, the switch needs a return route to the monitoring PC. Verify the actual management and trunk design before changing a switch already in service.

### Verify management and cabling

Give each switch its own reachable management IP and confirm which VLAN carries each endpoint. Use the switch console to check the intended access port and trunk. Substitute the interface names for your switch.

```text
show ip interface brief
show interfaces fa1/0/9 switchport
show interfaces trunk
show mac address-table interface fa1/0/9
show cdp neighbors detail
show snmp context
```

For the VLAN 100 example below, the access port should report VLAN 100 and list the endpoint's MAC as a dynamic entry. The trunk's CDP entry should identify the adjacent switch, its management IP, and its remote port. The IOS console cable is separate from the Ethernet topology. The context name must match exactly. On the tested switch it was `vlan-100`.

## 2. Configure read-only SNMPv3 on each switch

Replace the example monitoring PC address `192.0.2.10` with the source IP the switch sees. Use an unused standard ACL number for a new setup, or retain the existing narrow NetWatch ACL if one is already configured. Replace the username and passphrase placeholders locally. Use distinct authentication and privacy passphrases.

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
```

The default read view supplies interface names and counters, uptime, and the CDP neighbor cache. The Cisco IOS `sha` keyword in this example maps to **SHA-1** in NetWatch. Keep the existing SNMPv3 account if it already polls successfully. This setup grants read access and adds no write view. [Cisco SNMP configuration guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/15-0_2_se/configuration/guide/scg3750/swsnmp.html) · [Cisco CDP MIB reference](https://www.cisco.com/c/en/us/td/docs/security/ise/1-4-1/admin_guide/b_ise_admin_guide_141/b_ise_admin_guide_141_chapter_0100001.pdf)

Add a separate read view for the endpoint VLAN. The first subtree maps bridge-port numbers to interface indexes. The second exposes learned MAC addresses and their bridge ports. Repeat on each switch that NetWatch should use to locate endpoints.

```text
configure terminal
snmp-server view NETWATCH-VLAN100 1.3.6.1.2.1.17.1.4.1.2 included
snmp-server view NETWATCH-VLAN100 1.3.6.1.2.1.17.4.3.1.2 included
snmp-server group NETWATCH v3 priv context vlan-100 read NETWATCH-VLAN100 access 42
end
show snmp context
show snmp group
show snmp view
show snmp user
```

Older IOS can show two entries for the group without printing the context name. Use `show snmp view` without a view argument if IOS rejects a name. Confirm the port matches in NetWatch before saving the switch's running configuration with `copy running-config startup-config`.

## 3. Add and enroll the switches in NetWatch

1. Start NetWatch. Use **Discovered → Scan now** to find the switch, or add it manually in **Edit map** if the Windows neighbor scan does not see it.
2. In **Edit map**, set the device type to **Switch**, enter its management IP, and select **Use this map**. The saved switch entry is required for SNMP enrollment.
3. Stop the NetWatch host. In the Windows launcher, open **Port monitoring…** and enroll the saved switch with its SNMPv3 credentials. Select **SHA-1** for IOS `auth sha` and use the configured AES-128 passphrase. Repeat for the second switch. Enable **Check ports on next start** and **Discover local network neighbors on next start**.
4. Fully quit the launcher from the tray. Set the Windows user environment variable below. Replace both example management IPs and use the exact context from each switch. Entries are comma-separated and the current implementation uses one forwarding-table context per switch.

```powershell
$value = '192.0.2.2=vlan-100,192.0.2.3=vlan-100'
[Environment]::SetEnvironmentVariable('NETWATCH_SNMP_PORT_CONTEXTS', $value, 'User')
$env:NETWATCH_SNMP_PORT_CONTEXTS = $value
& "$env:LOCALAPPDATA\Programs\NetWatch\NetWatch.exe"
```

Start the host and confirm each switch shows recent readings under **Devices → Ports**. The named context applies only to the forwarding-table lookup. Interface polling and CDP use the default context.

## 4. Scan, review, and save the links

1. Keep the endpoints connected and awake. Wait for a fresh switch poll, then select **Discovered → Scan now**.
2. Look for **Seen on** and the interface name on a discovered endpoint's row. New devices can be added to the draft with their links. For devices already on the saved map, **Local connection hints** appears below **Topology proposals** when suggestions are available. Select **Review hint**.
3. Check the draft before selecting **Use this map**. An endpoint belongs on the access port of the switch it is plugged into. The CDP hint on each trunk should describe the adjacent switch and its port. Remove any incorrect link already saved on the map before saving the corrected draft.

In the verified test setup, the patched poll located the adjacent Catalyst on the switch's `Fa1/0/2` trunk with remote port `Fa1/0/1`, kept the directly connected laptop on `Fa1/0/9`, and excluded the monitoring PC's MAC learned through the trunk. Locating the monitoring PC on the other switch's access port requires that switch's own enrollment and forwarding-table access.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Switch is missing from **Port monitoring…** | Save it with its management IP and type **Switch**, then stop the host before opening enrollment. |
| No fresh readings in **Ports** | Check that port polling is enabled, the source IP is allowed by the ACL, and the SNMPv3 authentication and privacy settings match IOS. |
| Ports work, but no **Seen on** match | Check the endpoint MAC in the switch's MAC table and in Windows with `arp -a <endpoint-IP>`. Verify the exact context spelling, that the group has a read view for that context, and that the view includes both bridge subtrees. An SNMP authorization error indicates context or view access needs checking. An empty bridge-port table can indicate the view omits that subtree. |
| A PC appears on an inter-switch trunk | Check `show cdp neighbors detail` and confirm the CDP subtree is in the default read view. Confirm the adjacent switch advertises the management IP on your map. Enroll the adjacent switch to locate the PC's actual access port. |
| **Device identity unavailable** in **Topology proposals** | This is the separate LLDP crawl. Look for CDP and forwarding-table matches under **Discovered devices** and **Local connection hints**. |
| **Review gateway hint** is the only option | The scan has a route hint. Check port polling and forwarding-table evidence before using it to reason about physical links. |

See [NetWatch discovery behavior](docs/DISCOVERY.md) and [SNMP port monitoring](docs/SNMP-INTERFACES.md).
