# NetWatch

NetWatch is a Windows network-monitoring dashboard with a topology editor, device reachability checks and recent history. A fresh installation starts with an empty network. There are no built-in devices, example addresses, demo statuses or preview mode.

## Windows setup

Requirements: Windows 10/11, Node.js 22.13 or newer with npm, and the Windows .NET Framework v4 compiler/runtime used by the launcher and checks.

1. Download and extract this repository into a permanent folder, or clone it.
2. Open PowerShell in the folder containing `package.json`.
3. Run:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run desktop:setup -- --desktop-shortcut
```

4. Open the **NetWatch** desktop shortcut.
5. Enable its **Check devices on next start** checkbox if you want reachability checks, then click **Start** and **Open dashboard**.

The dashboard is available at **http://127.0.0.1:4317** on this PC. No administrator access or PowerShell execution-policy change is required. Keep the repository folder and Node installation in place; rerun setup if either moves. Quit NetWatch before updating its launcher.

For release acceptance, safe updates and recovery, see the [Windows release runbook](docs/WINDOWS-RELEASE-RUNBOOK.md).

## Add your devices

1. Open **Edit map**, choose **Add device**, and enter a device name and its actual IPv4 or IPv6 address. An empty address is allowed for a device you do not monitor.
2. Arrange devices and add their configured links. The editor saves a working copy in this browser.
3. Choose **Use this map** above the editor to prepare a fresh replacement review.
4. Review the replacement and choose **Confirm replacement**. New or changed devices start with monitoring disabled.
5. Return to **Dashboard**, open a device and choose **Turn checks on**; select the monitored network under **View options → Show** if needed.

Only enable checks for devices you manage. Both the launcher's ICMP setting and each saved device's monitoring setting must be enabled. Devices must be reachable from the monitoring PC; some hotspots isolate their clients. NetWatch does not scan networks, discover hotspot clients or add devices automatically.

## Read device status

An optional Windows-host SNMPv3 feature adds interface status and traffic rates under device details → **Ports**. It requires local credential enrollment and separate opt-in; it does not change ping-based device health. See [SNMP interface setup](docs/SNMP-INTERFACES.md). Cisco 3750/2811 physical verification is pending.

- **Up:** recent checks confirm a response.
- **Down:** two consecutive failed checks confirm no response; the first successful reply restores Up.
- **Overdue:** the last check is too old to describe the device's current state.
- **Not monitored:** monitoring is disabled, no address is configured, or no confirmed result is available.

The collector normally checks every 10 seconds. The dashboard refreshes every second and ages checks using the host's freshness policy (at least 30 seconds, increasing with device count). Host disconnection preserves the last-known result and its timestamp; it does not turn devices Down. Device details show last check, measured response time, service state and collapsible recent history, 25 checks per page up to 200 displayed. No uptime percentage is inferred.

Line colors summarize endpoint reachability, not verified cable, interface or routing-session health. A responding switch remains Up when a connected router fails.

## Edit, back up and restore

**Monitored network** shows the host's saved devices and real checks. **Draft map** shows your local edits without live health. Loading or saving host inventory is an explicit reviewed replacement, not automatic synchronization.

Use **Backups → Download map** to keep a copy of your draft, or **Edit map → Load saved map** to review the monitored map before downloading it. **Restore map** checks a backup file and asks before replacing the draft; **Use this map** applies the draft to the dashboard separately. Loading or restoring a draft never enables checks. Updates preserve saved maps and history; remove unwanted devices in the editor and review **Use this map** to apply the change.

Saved-layout dragging in the browser working copy autosaves positions. Host and radial-layout dragging changes only the current view. Search stays beside the map; filters, attention and layout settings are in **View options**; the **Devices** page offers a keyboard-operable list. Device details open with a click or Enter/Space.

The launcher stores data under `%LOCALAPPDATA%\NetWatch\data\netwatch.sqlite`; its control window shows the location. Browser JSON exports contain topology only, not history. For full database backup/restore, stop the host and follow [HOST-API.md](docs/HOST-API.md). Never delete a database to resolve a startup error.

## Start and stop

Closing the browser or hiding the control window keeps monitoring running. **Stop** stops the host; **Quit** stops it and exits the tray app. The PC must remain awake, connected and signed in. Automatic boot startup and unattended Windows service operation are not implemented.

For a terminal-based setup, build once and run:

```powershell
$env:NETWATCH_ICMP = '1'
npm.cmd start
```

This enables the collector for devices you separately authorize; it does not add or authorize devices. Omit the environment setting to start with collection disabled. Keep that terminal open and use Ctrl+C to stop. Terminal mode defaults to `data/netwatch.sqlite` in the repository, separately from the launcher's database.

## Development and verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

The Vite development UI is browser-only and does not run the monitoring host. Use the built app at port 4317 for monitoring. Optional browser checks in `scripts/check-*-browser.mjs` require external Playwright and Chromium; set `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `NETWATCH_URL` as needed. On Windows, an absolute module path must be a `file:///` URL. Test inventories and synthetic observations live under `tests/fixtures/`; they are not bundled into the application or probed.

## Remaining work

Local incidents/notifications (#11), broader Windows release/capacity/accessibility validation (#16), SNMP/LLDP/interface/redundancy work (#7/#8/#9), authentication (#10), and secured remote access/unattended service packaging (#12) remain planned. The current host is local-only; other PCs cannot access its dashboard. Do not expose the development server or bypass the host's loopback protections.

See [ROADMAP.md](docs/ROADMAP.md), [Windows launcher](docs/WINDOWS-LAUNCHER.md), [monitoring policy](docs/ICMP-COLLECTOR.md), and [WORKLOG.md](docs/WORKLOG.md) for details and evidence.

### Outages and recovery

In device details, expand **Incidents** to see outages and recovery times; **View checks** opens the recent check history. Two failed checks open an outage, and the next reply confirms recovery. Repeated failures keep one outage open. **View options → Needs attention** includes open outages. Paused or disconnected monitoring leaves incidents open until a reply confirms recovery; check freshness and monitoring state before acting.

Incidents survive host restart. Resolved incidents are kept for up to 30 days, with a 10,000-record network-wide limit; check history can expire earlier. Removing a device or replacing its address/type removes its old incident evidence. Existing databases upgrade automatically; back up before upgrading. Only new confirmed results create incidents after upgrade. External email/chat notifications remain planned and send nothing.
