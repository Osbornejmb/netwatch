# NetWatch documentation

- [Linux package](LINUX.md) — run the dashboard and saved-map host without active collection.

## Tutorial for monitoring devices across routed subnets

Start with the [Windows setup instructions](../README.md#set-up-netwatch-on-windows). This walkthrough uses a known inventory of switch, router and server IPs. Leave **Find nearby devices** off.

### Prepare the monitoring path

1. Give the NetWatch PC a stable source IP, such as a DHCP reservation. Ask the network team to confirm a route from that PC to each approved target subnet and a return path to the PC. One network connection is enough when the network routes the traffic.
2. For uptime checks, allow ICMP echo from the NetWatch PC to the approved device IPs and allow echo replies back. Check network firewalls, device firewalls and switch or router management ACLs. For port monitoring, allow UDP 161 from the NetWatch PC to the selected switch and router management IPs, with replies permitted back.
3. From the NetWatch PC, run `ping <DEVICE_IP>` in PowerShell. Replace `<DEVICE_IP>`, including the angle brackets, with the assigned IP of one known device in each subnet. Use the IP by itself. A successful test confirms that target replies from this PC. If it fails, check the IP, source interface, routing and ICMP policy. Test SNMP separately with **Port monitoring… → Test connection**.

### Save and check the devices

In **Edit map → Add device**, enter the IP assigned to each device from your network inventory. For a switch or router, use its management IP. Use the same individual IP you would substitute for `<DEVICE_IP>` in the PowerShell command.

Select **Use this map → Confirm replacement**. In the launcher, enable **Check whether approved devices are online** and start NetWatch. In **Dashboard → Monitored network**, open each device and choose **Turn checks on**. Leave router-and-switch-only mode off to include servers.

Checks normally start about every 10 seconds. Two consecutive unreachable results mark the device **Down**, so a small inventory typically shows an outage in about 10–22 seconds. Larger inventories and slow checks can take longer. A successful reply restores **Up**. Ping measures reachability from the NetWatch PC. For example, a server can reply while its application is down.

### Monitor a saved uplink

Draw the connection in **Edit map** and assign its ports under **Uplinks & redundancy**, then save the map. Stop the host, enroll the switch or router that owns the port through **Settings → Port monitoring…**, turn on **Check switch and router ports**, and start NetWatch. Open the saved connection to see its port readings.

If the PC connects to Switch 1 and traffic to Switch 4 passes through Switches 2 and 3, NetWatch can poll Switch 4 directly by management IP. Switches 2 and 3 forward that traffic. Enroll Switch 4 to see its own uplink port and enroll Switch 3 only if you also need a live reading from the other end of that link.

See [SNMP interface setup](SNMP-INTERFACES.md) and [how to interpret link evidence](LINK-HEALTH.md).

## Reference

- [First-time setup guide](SETUP.md) — start here: chronological commands and enrollment
- [Setup reference](SETUP-REFERENCE.md) — advanced settings, maintenance and verification evidence

- [Network setup and troubleshooting](NETWORK-TROUBLESHOOTING.md) — required input sources, Windows reachability, VLAN/trunk, SNMP and enrollment diagnostics
- [Managed switch setup](../switchconfig.md) — Cisco IOS configuration with explicitly identified inputs

- [ARCHITECTURE](ARCHITECTURE.md) — maintained reference
- [DESIGN](DESIGN.md) — maintained reference
- [DISCOVERY](DISCOVERY.md) — maintained reference
- [LINK-HEALTH](LINK-HEALTH.md) — maintained reference for Connections, redundancy alerts and Map tools
- [Repository audit](../AUDIT.md) — findings recorded against the audited working tree
- [HOST-API](HOST-API.md) — maintained reference
- [ICMP-COLLECTOR](ICMP-COLLECTOR.md) — maintained reference
- [INCIDENTS-CHECKPOINT](INCIDENTS-CHECKPOINT.md) — historical log
- [PROJECT](PROJECT.md) — maintained reference
- [REMOTE-ACCESS](REMOTE-ACCESS.md) — maintained reference for Windows LAN deployment and release checks
- [REDESIGN-CHECKPOINT](REDESIGN-CHECKPOINT.md) — historical log
- [RELEASE-CHECKPOINT](RELEASE-CHECKPOINT.md) — historical log
- [ROADMAP](ROADMAP.md) — maintained reference
- [SCALE-VALIDATION](SCALE-VALIDATION.md) — historical log
- [SNMP-CHECKPOINT](SNMP-CHECKPOINT.md) — historical log
- [SNMP-INTERFACES](SNMP-INTERFACES.md) — maintained reference
- [WINDOWS-LAUNCHER](WINDOWS-LAUNCHER.md) — maintained reference
- [WINDOWS-RELEASE-RUNBOOK](WINDOWS-RELEASE-RUNBOOK.md) — maintained reference
- [WORKLOG](WORKLOG.md) — historical log
- [GitHub project plan](github-plan.json) — maintained reference

The [release checkpoint](RELEASE-CHECKPOINT.md) explains where to find generated evidence.
