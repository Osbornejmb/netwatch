# NetWatch — first-time setup

NetWatch monitors device reachability (ping), switch ports (SNMPv3) and reviewed network connections. Start with one Windows PC and one device, then add other switches.

**You need:** Windows 10/11 x64, a browser, access to your own network and permission to monitor its devices. The installer includes Node.js and SQLite (the database); no database server is required. Source installation needs Node 22 LTS at 22.13 or newer, npm and the Windows .NET Framework compiler.

## 1. Install NetWatch (Windows)

**Upgrading?** Quit NetWatch and [back up your actual database](SETUP-REFERENCE.md#offline-backup-installed-windows-build) before installing. Follow the [migration backup requirements](HOST-API.md#sqlite-migrations-and-retention) if upgrading an old schema.

1. Download the Windows x64 installer and SHA256SUMS.txt from [GitHub releases](https://github.com/Osbornejmb/netwatch/releases/latest).
2. Open PowerShell in the download folder. For v0.2.4:

   ~~~powershell
   Get-FileHash -Algorithm SHA256 .\NetWatch-0.2.4-Windows-x64-Setup.exe
   Get-Content .\SHA256SUMS.txt
   ~~~

   Use the actual filename for another release. The installer hash must match its entry in the checksum file. The installer is unsigned; follow your organization's security policy.
3. Run the installer. Leave **Set up access from another PC on my private network** unchecked.
4. Open **NetWatch** from the Windows Start menu. Expected: **Stopped** and a database path in the launcher.

**Installing from source instead?** Follow [source installation](#source-installation-alternative), then return to step 2 below.

## 2. Find the actual network addresses

On the Windows PC running NetWatch, open PowerShell:

~~~powershell
ipconfig /all
route print -4
~~~

Record the IPv4 address of the adapter reaching the switch (usually Ethernet). This is the **NetWatch source IP**, not the DHCP server, Wi-Fi gateway or switch IP.

On the target Cisco switch console:

~~~text
terminal length 0
show ip interface brief
show vlan brief
show interfaces status
~~~

Record the IPv4 address of the management interface (usually a VLAN interface), the VLAN ID and the physical port connected to the PC. If the switch has no management IP, obtain an unused address and mask from your network administrator and follow [switch setup from scratch](../switchconfig.md#cisco-ios-example-from-a-blank-switch) before continuing.

Back on Windows, verify the two addresses by entering the actual values when prompted:

~~~powershell
$pc = Read-Host 'IPv4 of the NetWatch adapter reaching the switch'
$switch = Read-Host 'Management IPv4 from the switch console'
ping.exe -S $pc $switch
~~~

Expected: replies if ICMP is permitted. A directly connected Ethernet subnet needs no default gateway. A console cable does not carry Ethernet traffic. If ping fails, check [network troubleshooting](NETWORK-TROUBLESHOOTING.md#1-verify-windows-reaches-the-management-interface) before configuring SNMP.

## 3. Start the dashboard and save the first device

1. In the Windows launcher, enable **Check devices on next start** if you want ping monitoring. Leave discovery, SNMP port checks and LAN sharing off for now.
2. Click **Start**, then **Open dashboard** when available. Expected: a local dashboard at http://127.0.0.1:4317. A fresh map is empty.
3. In the browser, choose **Edit map → Add device**. Enter a label and the management IP from step 2; select **Switch** or **Router** based on the actual equipment.
4. Click **Add device → Use this map → Confirm replacement**. This applies the browser draft to the saved monitored network. **On an existing map, review the replacement before confirming.**
5. On **Dashboard**, select the device and choose **Turn checks on** if monitoring is desired. Expected: a recent **Last check** and **Up** when it replies.

The database is created automatically. Its normal launcher location is `%LOCALAPPDATA%\NetWatch\data\netwatch.sqlite`; always use the path displayed by your launcher for maintenance.

## 4. Enable switch port monitoring (optional)

Do this for each managed switch. SNMPv3 reads port status without changing device configuration.

### A. Check the switch first

On the Cisco console:

~~~text
show snmp user
show snmp group
show snmp view
show snmp context
show access-lists
~~~

Confirm the following before enrolling:

- The exact SNMP username shown by the switch, not a name copied from another switch.
- Authentication SHA (choose SHA-1 in NetWatch) or supported SHA-256; AES128 privacy and authPriv.
- The SNMP group's ACL (access control list) permits the **Windows source IP from step 2**.
- The default read view includes sysUpTime, ifTable and ifXTable.

If SNMP is not configured, follow [create the read-only account](../switchconfig.md#c-create-the-read-only-snmpv3-account-and-views). If only the source ACL is wrong, follow [correct the existing ACL](../switchconfig.md#correct-an-existing-source-acl). Do not recreate working users or reset the switch.

### B. Enroll in NetWatch

1. In the Windows launcher click **Stop → Port monitoring…**.
2. Select the **Saved device**. If missing, return to step 3 and apply the draft as Switch or Router.
3. Enter **Authentication algorithm**, **SNMP username**, **Authentication password** and **Privacy password** from that device's configuration. Obtain passwords securely from the administrator; never share them in logs.
4. Leave **VLAN context (optional)** blank for basic interface polling. For MAC forwarding-table discovery, enter the exact context from `show snmp context` after [configuring its read view](../switchconfig.md#d-expose-the-mac-forwarding-table). Management VLAN and forwarding context are not necessarily the same.
5. Click **Test connection**. If it fails, verify username, passwords, host source ACL, UDP 161 and default IF-MIB permissions. Changing the VLAN context does not fix a default-context interface test.
6. Click **Enable monitoring → Close**. Enable **Check ports on next start** and click **Start**.
7. In the browser open the saved device's **Ports**. Expected: recent interface readings.

## 5. Discover devices and links (optional)

1. On the launcher, click **Stop**, enable **Discover local network neighbors on next start**, then **Start**. Enable **Also check local devices with ICMP (slower)** only for an approved attached network.
2. In the dashboard open **Discovered devices → Scan now**.
3. Choose **Add to draft** for recognized devices. A nearby scan is not hardware fingerprinting: a switch can appear as an endpoint. Correct the type in **Edit map**, then **Use this map → Confirm replacement**. Enable individual checks separately.
4. Enroll each switch using step 4. For switch-to-switch links, verify both ends have [LLDP/CDP enabled and readable](../switchconfig.md#b-enable-and-verify-neighbor-discovery).
5. On each switch console, verify the actual cable ports:

   ~~~text
   show interfaces trunk
   show cdp neighbors detail
   show lldp neighbors detail
   ~~~

6. In **Discovered → Topology proposals**, choose **Manual start device → Find connections** (select the enrolled device, then click the button). Review the proposed connections and apply the draft. LLDP identity is required for the crawl; CDP also supplies local connection hints.
7. Compare the saved links with the console results. A gateway route is not physical cable evidence.

For access-port matches, configure the forwarding-table view/context and review **Local connection hints**. See [discovery reference](DISCOVERY.md#switch-port-matches).

## 6. Verify and stop

On the host, in a separate PowerShell window, with default local HTTP settings:

~~~powershell
Invoke-RestMethod http://127.0.0.1:4317/api/v1/health
~~~

Expected: ready is true. This proves host readiness, not device health. Verify each enabled feature separately: recent Last check, fresh Ports readings and reviewed links matching actual ports.

Click **Stop** to close the host/database or **Quit** to exit. Closing the browser or launcher window does not stop monitoring. Keep the PC awake and signed in.

## 7. If something fails

| Symptom | First check |
| --- | --- |
| Another copy may be running | [Startup troubleshooting](WINDOWS-LAUNCHER.md#troubleshoot-startup); never delete the database |
| Switch not detected as a router | No default-gateway evidence; choose the actual device type |
| Saved device missing in Port monitoring | Apply the draft as Switch/Router with management IP |
| Ping works but SNMP test fails | Actual host IP permitted by ACL, exact username, password and default IF-MIB view |
| Ports work but links are missing | CDP/LLDP permissions, both switches enrolled, correct VLAN context |
| No MAC learned on a connected port | Generate fresh Windows traffic and recheck MAC/ARP tables |

Full diagnostic commands: [Network troubleshooting](NETWORK-TROUBLESHOOTING.md).

## 8. Maintain or expand

- [Backup, restore, update and uninstall](SETUP-REFERENCE.md#maintenance): stop the host and use the actual database path.
- [Remote viewing from another PC](REMOTE-ACCESS.md#windows-installer-setup): optional HTTPS sharing; keep local-only access until needed.
- [Advanced configuration and defaults](SETUP-REFERENCE.md#advanced-terminal-configuration): no .env file is automatically loaded.
- [Verification evidence and limits](SETUP-REFERENCE.md#verification): v0.2.4 CI and installer smoke passed; this rewritten guide has not been replayed on a clean Windows PC or verified end-to-end on physical switches.

## Source installation (alternative)

1. Install [Node.js LTS](https://nodejs.org/en/download) (Node 22 LTS at 22.13 or newer is suitable) and ensure the Windows .NET Framework compiler is available.
2. Download **Source code (zip)** from the chosen release and extract to a permanent writable folder.
3. Open PowerShell in the extracted folder containing package.json. Run each command in order; stop if one fails.

   ~~~powershell
   node --version
   npm.cmd --version
   npm.cmd ci
   npm.cmd run build
   ~~~

4. Quit any existing NetWatch launcher, then create the shortcut:

   ~~~powershell
   npm.cmd run desktop:setup -- --desktop-shortcut
   ~~~

5. Open NetWatch from the desktop shortcut and return to [step 2](#2-find-the-actual-network-addresses). Keep the source directory and Node installation in place.
