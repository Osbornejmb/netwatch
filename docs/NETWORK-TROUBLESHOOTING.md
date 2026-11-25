# Network setup and troubleshooting

Use this guide before enrolling a switch or router. The following inputs describe your actual network; they are not interchangeable. Never type the angle-bracket labels literally into Cisco IOS. Substitute values verified on your own equipment.

| Required input | Where to obtain it |
| --- | --- |
| `<NETWATCH_PC_IPV4>` | On the Windows PC running the NetWatch host, run `ipconfig /all`. Use the IPv4 address of the adapter that reaches the device, not the console cable, Wi-Fi adapter on another subnet, DHCP server, or gateway. Confirm with `route print -4`. |
| `<SWITCH_MANAGEMENT_IPV4>` | On the target switch console, run `show ip interface brief`. Use the address of the intended management SVI or routed interface. For a new switch, obtain an unused address from the network administrator/IP allocation plan; do not reuse another switch's address. |
| `<MANAGEMENT_SUBNET_MASK>` | Run `show running-config interface Vlan<VLAN_ID>` on Cisco IOS or obtain the assigned mask from the network plan. |
| `<MANAGEMENT_VLAN_ID>` | Identify the management SVI and confirm with `show vlan brief`. |
| `<PC_ACCESS_PORT>` / `<LOCAL_TRUNK_PORT>` / `<REMOTE_TRUNK_PORT>` | Trace the cables and verify with `show interfaces status`, `show interfaces trunk`, and neighbor detail on both switches. |
| `<SNMP_ACL_NUMBER>` | Inspect `show snmp group`, `show access-lists`, and the running configuration. Reuse the intended restricted ACL or choose an unused compatible standard ACL when creating a new group. |
| `<SNMP_USERNAME>` | Use the exact username shown by `show snmp user` on each device. For a new user choose a dedicated account name; do not assume every switch uses the same name. |
| `<VLAN_CONTEXT>` | Use the exact name from `show snmp context` associated with the forwarding table you need. Cisco often uses a hyphenated VLAN context; the management VLAN does not necessarily equal the endpoint VLAN. |
| `<PC_MAC>` | Run `getmac /v` on the host and match the Ethernet adapter. Cisco displays the same MAC in dotted hexadecimal notation. |
| `<PEER_MANAGEMENT_IPV4>` | Read the peer's own management interface; cross-check the management address in CDP/LLDP detail. |

## 1. Verify Windows reaches the management interface

In PowerShell on the host:

~~~powershell
ipconfig /all
getmac /v
route print -4
$pc = Read-Host 'NetWatch host IPv4 from the adapter reaching the switch'
$switch = Read-Host 'Target switch management IPv4 from its console'
ping.exe -S $pc $switch
arp.exe -a
~~~

A directly attached subnet should have an On-link route through the intended adapter. No Ethernet default gateway is needed to reach a management IP on the same subnet. A Wi-Fi default gateway may coexist. A DHCP server address is not necessarily a router. Check the actual source address again if the host uses DHCP; arrange an approved reservation or static assignment to keep the ACL and source address aligned.

A successful ping proves IP reachability, not SNMP access (UDP 161). A switch-to-PC ping can fail because Windows blocks inbound ICMP, even when PC-to-switch traffic works. Do not disable the firewall or change default routes just to make a reverse ping work. A console cable provides administrative access, not IP connectivity.

## 2. Verify Layer 2 before changing configuration

On the switch console (substitute the collected interface names and VLAN ID):

~~~text
terminal length 0
show ip interface brief
show vlan brief
show interfaces status
show interfaces <PC_ACCESS_PORT> switchport
show interfaces <PC_ACCESS_PORT>
show spanning-tree vlan <MANAGEMENT_VLAN_ID>
show spanning-tree interface <PC_ACCESS_PORT> detail
show port-security interface <PC_ACCESS_PORT>
show ip arp
show mac address-table interface <PC_ACCESS_PORT>
show mac address-table dynamic vlan <MANAGEMENT_VLAN_ID>
show mac address-table address <PC_MAC_IN_CISCO_FORMAT>
~~~

For a direct connection, expect the management SVI up/up, the PC port connected in the appropriate access VLAN and forwarding, and the PC MAC learned on that port after traffic. An ARP entry can outlive the dynamic MAC entry. Generate a fresh PC-to-switch ping and immediately repeat the MAC/ARP commands before concluding there is a fault. Check input/CRC errors, security violations and unexpected MAC movement. Do not disable STP or port security to troubleshoot.

For the inter-switch path, run on both ends:

~~~text
show interfaces trunk
show interfaces <LOCAL_TRUNK_PORT> switchport
show spanning-tree vlan <MANAGEMENT_VLAN_ID>
show cdp neighbors detail
show lldp neighbors detail
~~~

Verify the actual local and remote ports, matching native VLANs, required allowed/active VLANs and a forwarding path. Each VLAN intended to extend across a trunk must exist where required. A direct management connection does not depend on the trunk if both endpoints are on the local management VLAN. A learned MAC on a trunk is not proof of a directly attached endpoint.

## 3. Check SNMP on each switch independently

~~~text
show snmp user
show snmp group
show snmp view
show snmp context
show snmp engineID
show access-lists
show snmp
~~~

Match the exact username and security algorithms to the launcher. Older Cisco IOS `SHA` means SHA-1; AES128 means AES-128. NetWatch requires authPriv and distinct strong passphrases are recommended. The group's standard ACL must permit the actual monitoring PC's source IPv4, not the target switch, an old lease, or an example address. Inspect existing ACL usage before changing it. Add only the required host permit, preserving legitimate rules and their order; ensure it precedes any explicit deny. For the intended numbered standard ACL on compatible IOS:

~~~text
configure terminal
ip access-list standard <SNMP_ACL_NUMBER>
permit host <NETWATCH_PC_IPV4>
exit
end
show access-lists <SNMP_ACL_NUMBER>
~~~

Verify and test before saving. Do not broaden access to an entire subnet as a shortcut.

If standardizing usernames, IOS does not rename the SNMPv3 user in place. Create a new user in the existing group using local secrets, test and enroll it in NetWatch, then remove the old user only after checking no other poller depends on it. See [switch configuration](../switchconfig.md). Do not share passwords or keys in diagnostic logs.

## 4. Interpret the connection test

Save the target as Switch or Router in **Edit map → Use this map → Confirm replacement**. A discovery row or browser draft alone is not eligible for enrollment. Stop the host, open **Port monitoring**, select the correct saved device and enter its actual credentials. **Test connection** reads interface status in the default context; the VLAN context applies separately to forwarding-table queries. The default read view needs IF-MIB and uptime. A named VLAN read view needs bridge-port and forwarding-table access; CDP and LLDP use the default view.

Compare `show snmp` and `show access-lists <SNMP_ACL_NUMBER>` before and after one test. SNMPv3 engine discovery/report packets may increase totals without proving authentication or successful reads. Counters and ACL matches are clues, not definitive diagnoses. If needed, on an approved lab switch only, briefly run `debug snmp packets` (if supported), test once, then immediately `undebug all`. Avoid debug on busy production switches; redact sensitive output.

| Symptom | Next step |
| --- | --- |
| No successful PC-to-switch ping | Verify host address, ARP, VLAN membership, route, physical path. |
| Ping works, port test fails | Verify actual source ACL, exact per-switch user, credentials, auth/privacy, default-context IF-MIB and UDP reachability. |
| Test passes, no port readings | Enable monitoring and Check ports on next start, start host and wait for fresh readings. |
| Ports work, no physical link | Check LLDP/CDP default read view, actual neighbor evidence, enrollment of both switches and exact forwarding context. |
| Switch discovered as endpoint | Set its verified type manually and apply the draft; management IP alone does not identify hardware. |
| Launcher says another copy may be running | See [startup troubleshooting](WINDOWS-LAUNCHER.md#troubleshoot-startup). |

After enrollment, enable port polling, start the host, verify recent Ports readings, then review discovery proposals and apply the draft. Do not claim physical switch support or successful enrollment until real readings are observed.
