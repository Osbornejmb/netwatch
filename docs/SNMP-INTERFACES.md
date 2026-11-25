# Read-only SNMPv3 interfaces — issue #7

This feature adds host-side IF-MIB polling and a separate Interfaces section in saved-device details. It never changes device configuration, derives ICMP device health from SNMP, recolors topology paths as verified physical links, or discovers/authorizes new devices. The browser has no credential-entry or probe-trigger endpoint.

## Initial hardware targets

Cisco Catalyst 3750-series switches and Cisco 2811 routers are the owner's intended lab devices. Their exact IOS images, management addresses, supported security algorithms and MIB views must be checked before hardware acceptance. No 3750/2811 hardware has been polled for this implementation yet; these are intended targets, not verified vendor-support claims.

Cisco documents SNMPv3 on the [3750](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/15-0_2_se/configuration/guide/scg3750/swsnmp.html); consult the exact IOS release's MIB support for the 2811. IF-MIB standard columns are used, with no proprietary Cisco discovery or configuration writes. A direct Ethernet lab connection is sufficient once the PC and device have reachable management IPs. Initial IP/SNMP setup may require console access. No configuration changes are automated.

## Set up in the Windows launcher

Port monitoring polls the saved management IP directly over UDP 161, including across routed subnets. Intermediate switches only need to forward traffic. Enable SNMPv3 on the equipment whose port readings you need. For a manually mapped uplink, one enrolled end supplies one-sided evidence, and both enrolled ends can supply both port readings. See the [routed monitoring tutorial](README.md#tutorial-for-monitoring-devices-across-routed-subnets).

Before enrollment, follow the [network input checklist](NETWORK-TROUBLESHOOTING.md). Obtain the management IP from the device console, source IPv4 from the host's `ipconfig /all` and route table, and the exact username/authentication from `show snmp user`. Verify the group's source ACL on each switch, especially after DHCP changes. A discovered device or browser draft must be applied to the saved map with Switch or Router type. Test connection uses the default IF-MIB context; VLAN context is only for forwarding-table reads. See the [ordered troubleshooting tests](NETWORK-TROUBLESHOOTING.md#3-check-snmp-on-each-switch-independently) if the test fails.

Add the switch or router and its management IP to the saved map, then stop the host in the launcher. Choose **Settings → Port monitoring…**, select the saved device, and enter its read-only SNMPv3 username, authentication algorithm and passwords. Choose **Test connection** to confirm NetWatch can read port status, then **Enable monitoring** to test again and protect the profile under your Windows account. Start the host and open the device’s **Ports** or **Network neighbors**. The launcher remembers **Check switch and router ports**. Clear that setting and restart the host to pause collection for enrolled devices.

## Terminal setup

1. Update dependencies with `npm.cmd ci` and run `npm.cmd run build`. Stop/Quit the host using this database first. Preserve a verified offline database backup before the schema upgrade.
2. Set `NETWATCH_DB` to the same absolute database path shown by your launcher, or use the repository default `data/netwatch.sqlite`. Use one authoritative database; setup does not copy your browser working copy automatically.
3. Run `npm.cmd run snmp -- list` to list saved IDs/labels and interface-configuration state. Save your approved device to the host first if it is absent.
4. In an interactive local terminal, run `npm.cmd run snmp -- set <DEVICE_ID>`. Replace `<DEVICE_ID>`, including the angle brackets, with the exact ID beside that device in the preceding `list` output. Verify the displayed device/address. Enter the authentication algorithm, then the hidden username/authentication/privacy inputs. Do not paste credentials into chat, environment variables, command arguments, topology JSON or files. Ctrl+C cancels password entry.
5. Use SNMPv3 **authPriv** with AES-128 privacy. `sha256` is supported when the device supports it; explicitly select `sha` (HMAC-SHA-1) for compatible older IOS images. MD5, DES, noAuth, v1 and v2c are not offered, and there is no automatic downgrade. Configure the device separately with a read-only account restricted to this host and the required MIB view. Do not grant SNMP write privileges.
6. Start the local host from that terminal:

```powershell
$env:NETWATCH_SNMP = '1'
npm.cmd start
```

The host still binds only to `127.0.0.1:4317`. This is independent of `NETWATCH_ICMP` and the existing per-device ICMP opt-in. Enable ICMP separately only for approved targets if you also want reachability status. Stop the terminal host before starting another launcher-owned host.

7. Open saved-device details → **Ports**. The browser reads results every five seconds only while that section is open; those reads do not issue SNMP requests. It shows 50 interfaces per page, admin/oper state, sample time and conservative receive/send rates. A replying device can remain Up while an interface is Down; stale/paused/error views show last-known interface information and unavailable rates.
8. To revoke interface monitoring, stop the host and run `npm.cmd run snmp -- remove <DEVICE_ID>`, replacing `<DEVICE_ID>` with the exact ID used when enrolling the device. This also removes that ID's protected profile, including after the device has been deleted. Removing a device or changing its address/type automatically revokes authorization and deletes its old interface observations; an orphan protected file cannot reauthorize it. Re-adding an identical ID/address cannot inherit the old credential authorization. Label/layout changes preserve authorization.

## Credentials and backup

Credentials are protected with Windows DPAPI **CurrentUser**, using a repository-owned .NET helper compiled locally with the existing Framework compiler. Plaintext passes only through bounded stdin/stdout pipes and process memory, never shell arguments. Protected profiles live in `snmp-credentials` beside the database, under a hash of the absolute database path, with hashed device filenames; the directory and `.dpapi` files are gitignored. Moving a database requires re-enrollment. A profile is bound to a random database authorization token, device ID/type and literal address. Missing, mismatched or unreadable profiles fail closed and do not cause device Down.

Only the same Windows account/profile can decrypt these files. This does not protect against compromise of that account. Do not copy profiles into exports or source control. Changing the Windows account that runs NetWatch requires re-enrolling the credentials under that account. See [Microsoft DPAPI documentation](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection).

SQLite backups contain interface observations and non-secret authorization identifiers, not usernames/passwords or protected credential files. Restore deliberately clears SNMP authorization, preserving last-known interface observations as non-current; re-enter credentials locally to resume polling. Replacing a profile may fail closed if interrupted between protected-file and database updates; retry enrollment. Inventory and reachability history are preserved.

## Bounds and failure behavior

- Opt-in requires both a locally enrolled saved device and `NETWATCH_SNMP=1`; default is disabled. Off Windows the collector is unsupported and sends no requests.
- A 60-second target cycle interval, at most two device workers, no overlapping cycles, zero application retries and a 1.5-second request timeout. Each device has a 20-second protocol deadline, plus a bounded credential-access allowance. Shutdown cancels sockets, drains active credential operations and preserves database locking until collection ends.
- At most 64 application requests per device/cycle (GET sysUpTime and bounded GETBULK; SNMPv3 engine discovery is additional bounded protocol traffic), ten repetitions per bulk request, 512 unique interfaces per device and 20,000 interfaces globally in latest-sample storage. Cap/deadline/malformed failures retain prior observations; they do not silently present a truncated table as complete.
- A truncated bulk response can continue within these bounds. Missing optional OIDs/columns remain unknown; unsupported high-capacity counters use valid 32-bit counters when available. MIB-view restrictions may return fewer interfaces; absence is not proof that a port disappeared.
- Inventory-revision changes cancel active work and reject obsolete results. Credential/profile errors and protocol failures produce fixed diagnostic codes without returning raw library errors or credentials. They do not alter ICMP observations or incident state.
- Interface freshness is at least 180 seconds and grows with configured-device count and the two-worker deadline budget. This is independent of ICMP freshness. Missing/paused/stale monitoring is not a failed interface. Large inventories can exceed the target interval; no deployment capacity is claimed.

## Counters and rates

The collector reads sysUpTime, ifDescr, ifName, ifSpeed/ifHighSpeed, ifAdminStatus, ifOperStatus, ifIn/OutOctets, ifHCIn/OutOctets and ifCounterDiscontinuityTime. High-capacity counters remain decimal strings, preserving all 64 bits; they are never rounded through JavaScript numbers. ifSpeed's overflow sentinel alone is not treated as an actual line speed.

Rates require two samples 1–180 seconds apart, increasing agent uptime, identical interface identity/counter width/speed, up operational state, and present/unchanged discontinuity evidence. Any counter decrease is treated as ambiguous wrap/reset and suppresses that direction's rate. 32-bit rates are also suppressed whenever the speed/time bound allows a complete wrap, even if the counter increased. Implausible deltas above a small line-rate tolerance are rejected. Missing evidence, first samples, agent restart, identity changes and long gaps show Unavailable. Uptime decreasing within one table read rejects that sample. The result is an approximate interval rate, not an uptime guarantee or packet-loss measurement.

## Verification and remaining acceptance

`tests/snmp.test.js` uses deterministic OID/Counter64 fixtures, a 2811-style FastEthernet table in a real authPriv loopback agent, fake bounded collectors, temporary databases and synthetic DPAPI credentials. It covers read-only requests, truncation, malformed/partial tables, wrong credentials, timeouts/abort, counter/rate rules, migration rollback, backup restore/revocation, API bounds, and credential redaction. Run the DPAPI test under the signed-in Windows profile. A sandbox without access to that profile can fail during credential protection. These fixtures do not establish Cisco vendor support.

`scripts/check-interfaces-browser.mjs` checks independent device Up/interface Down, unknown fields, rates, 55-row pagination, stale/error states, keyboard use, revocation and desktop/390px layouts. It never instantiates collectors or credentials. Screenshots remain local under `.tools/interface-screenshots`.

Issue #7 stays open until approved physical hardware is available and an actual read-only check verifies the relevant IOS/MIB behavior. Record model/IOS versions without serial numbers, bounded timing and supported/missing columns. Keep the management connection intact when testing another port; only change a lab port with explicit owner authorization. No real network discovery, hardware reconfiguration or physical-device probe was performed for this implementation.

## LLDP neighbor review

NetWatch reads the standard [IEEE LLDP-MIB](https://www.ieee802.org/1/files/public/MIBs/LLDP-MIB-200505060000Z.mib) from the same locally enrolled SNMPv3 devices used for port checks. It collects only the chassis identifier, local LLDP port number, remote port identifier, and optional system name. The LLDP read shares the existing request and time limits and can return up to 64 neighbors per device. It does not send requests to any discovered peer.

Open a saved device and expand **Network neighbors**. Check the observation time and the reported ports, then choose **Review link**. Select an existing peer or give a new peer a name and type. A new peer has no management address and starts with checks off. **Save link** writes an LLDP-labeled connection. **Dismiss** hides the proposal for the current review. Existing links, labels and saved positions are preserved. The same reported chassis can be reused on later reviews from the same source device. Match across different reporting devices by selecting an existing entry yourself. Names are hints for review.

Pending observations are held in memory. Reopening NetWatch requires another SNMP collection cycle to see proposals. Approved links are kept in the topology and included in normal backups. Missing, partial and stale information cannot remove links. Stale observations cannot be applied. An empty list can also mean that LLDP is unsupported or outside the device's configured SNMP view. Hardware compatibility is unverified.
## Uplinks and redundancy

In **Edit map → Uplinks & redundancy**, choose a connection and enter each end's label and interface index. Copy the index from **Ports** in the saved device's details. Existing link labels, including LLDP and route provenance, stay with the connection. Create a group with 2–16 distinct links involving at least two routers, then use **Use this map** to apply the draft.

An uplink is up when both mapped ports are enabled and report operational Up in fresh SNMP samples. An explicitly disabled port or a fresh Down, Not present, or Lower layer down reading makes that uplink down. Other and missing readings leave it unknown. Check the port mapping again if the device or interface indexes change.

In **Redundancy groups** on the dashboard, Available means all members have fresh up evidence, Degraded means there are both up and down members, and Unavailable means all members are confirmed down. Unknown means at least one member cannot be determined. The group shows observed port availability. Device checks and line colors still show endpoint reachability. Routing convergence and failover require separate verification.
