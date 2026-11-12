# NetWatch — Network health dashboard

A local-first network operations dashboard with a supporting topology editor. The dashboard shows inventory, health filters, an interactive map, endpoint-colored connection paths, and click-to-open device details. A labelled sample preview illustrates up/down states. It does **not** ping devices, monitor BGP, or perform SNMP discovery yet.

## Requirements
- Windows 10/11
- Node.js 22 or newer
- npm

## Run on the Windows host
1. Clone or download this repository.
2. Open PowerShell in the `netwatch` repository folder.
3. Run:

```powershell
npm ci
npm run dev
```

4. Open the URL printed by Vite, usually `http://localhost:5173`.

The server binds to this computer only by default. Run `npm run dev:lan` to opt into LAN development.

To open the development UI from another computer on the LAN, use the Windows host's LAN IP and port 5173, for example `http://192.168.1.50:5173`. This is development-only and is not secure remote access. Do not expose the Vite development server to the internet.

## Current capabilities
- Dashboard is the default screen; use Topology editor in the top menu for inventory changes.
- A minimal landing screen with horizontal navigation and the topology filling the remaining window. Status counts, search, and filters are available in View options.
- Full-width topology map, directly colored devices/paths, search, and click-to-open device details from the map or the separate Devices screen.
- Separate sample preview with 14 example devices and a primary-router failure/restore control; sample checks are frozen and never saved into your network.
- Actual inventory stays not monitored until the Windows backend is connected.

## Topology editor
- Add router and switch nodes.
- Edit existing device names, management addresses, and descriptions without changing IDs or connections.
- Validate IPv4/IPv6 literals and reject duplicate management addresses, including equivalent IPv6 spellings. Empty addresses are allowed.
- Use Device and link controls below the canvas to select/edit/delete devices, set X/Y positions, and add/remove directed links with a keyboard.
- Device dialogs keep focus inside, close with Escape, and return focus to their trigger.
- Routers are square-style nodes; switches are circle-style nodes.
- Drag nodes to arrange the map.
- Connect node handles to create topology links.
- Select a node to inspect its details and remove it.
- Search devices.
- Topology autosaves to browser localStorage.
- Export topology as JSON.

## Starter topology
The initial canvas contains example router and switch names/IPs for layout testing. They are placeholders, not discovered devices and not live statuses. Replace them with your actual inventory.

## Project structure

```text
netwatch/
├── src/
│   ├── App.jsx             # Topology editor and persistence
│   ├── Dashboard.jsx       # Health dashboard and sample preview
│   ├── health.js           # Observation freshness and sample data
│   ├── id.js               # IDs compatible with HTTP LAN development
│   ├── topology.js         # JSON/storage validation
│   ├── main.jsx
│   ├── styles.css
│   ├── dashboard.css
│   └── nodes/
├── tests/
├── docs/
├── .github/workflows/
├── package.json
└── vite.config.js
```

## Important deployment/security note
The selected end goal is remote access. Before enabling it, Phase 2/3 must add a backend API, authentication, authorization, HTTPS, secure secret storage, and firewall/VPN or reverse-proxy configuration. Do not port-forward this Phase 1 development server to the public internet.

## Next phases
- Phase 2: Node.js backend and controlled ICMP monitoring from the Windows host.
- Phase 3: SNMP interface/uplink checks, LLDP discovery, router redundancy groups.
- Later: authentication, audit history, alerting, HTTPS and secure remote access.

## Foundation work

- Validated JSON import/export with a versioned data contract.
- Storage failure warnings; unreadable saved data pauses autosave until explicit replacement.
- Node test checks and GitHub Actions build checks.
- Development and preview bind to loopback by default.

```powershell
npm test
npm run build
npm run preview
```

Read [AI contribution rules](AGENTS.md), the [product brief](docs/PROJECT.md), [design direction](docs/DESIGN.md), and [working checkpoint](docs/WORKLOG.md).

See [architecture](docs/ARCHITECTURE.md), [implementation roadmap](docs/ROADMAP.md), and [contributing](CONTRIBUTING.md). The machine-readable [GitHub plan](docs/github-plan.json) defines four milestones and fifteen implementation issues, with a recommended solo order and an explicit Windows MVP release gate. The Publish project plan workflow creates them on GitHub when the plan is pushed to main; check its Actions run for publication status.

Saved-map recovery and import confirmations now use keyboard-accessible dialogs; optional browser regression scripts cover inventory and recovery. Monitoring and remote access are planned, not implemented.

Repository: [Osbornejmb/netwatch](https://github.com/Osbornejmb/netwatch). See [issues](https://github.com/Osbornejmb/netwatch/issues), [milestones](https://github.com/Osbornejmb/netwatch/milestones), and [build and plan workflows](https://github.com/Osbornejmb/netwatch/actions).

## Address validation and older maps

Management addresses must be plain IPv4 or IPv6 literals; hostnames, URL/bracket notation, subnet prefixes, IPv6 zone identifiers, and ambiguous IPv4 forms such as leading-zero octets are rejected. Surrounding whitespace is removed; IPv6 is lowercased and compressed before duplicate comparison. IPv4 and IPv6 are distinct address families; IPv4-mapped IPv6 spellings are compared in their canonical IPv6 form. Empty addresses are allowed on multiple inventory entries.

Valid v1 maps keep their IDs, positions, links, and schema. Imports with invalid or duplicate addresses are rejected before replacement. Work on a copy of an older JSON backup: replace descriptive/invalid addresses with literals or empty strings and remove duplicate addresses before importing. If saved browser data fails these checks, autosave pauses and leaves the original saved content untouched; do not confirm replacement until you have a backup. Export saves the current visible map, not the unreadable original. Use Download original saved content in Map backup and recovery to preserve unreadable saved text separately from the visible map.

These UI checks do not authorize probes. The future host API must independently validate addresses, require monitoring opt-in, and use bounded shell-free probes.

## Optional inventory browser regression check

With the build preview running, use an existing Playwright installation to run `node scripts/check-inventory-browser.mjs`. This check is separate from `npm test` and does not add a runtime dependency. `PLAYWRIGHT_MODULE` can point to an external Playwright module, `CHROMIUM_PATH` to a browser executable, and `NETWATCH_URL` to the preview (defaults to `http://127.0.0.1:4173`). It uses a fresh browser context, checks edits/validation/focus/keyboard links/import preservation, and refreshes the inventory review screenshots.

## Backup, import and saved-map recovery

Open **Backup** (Map backup and recovery) in the top menu from the dashboard, Devices, or editor:

1. **Export current map** downloads the visible real inventory as JSON. Sample-preview devices and statuses are never exported. Keep this file as your normal backup.
2. **Import backup** validates a JSON file (up to 5 MB), then shows device/link counts and asks before replacing the visible map. Cancel or Escape keeps the current map. Invalid files show an inline error and change neither the visible map nor saved data. The editor's Import JSON uses the same flow.
3. If saved content is unreadable, autosave pauses and the banner identifies the visible starter map as a fallback. **Download original saved content** downloads the original text unchanged as a `.txt` file, even when it is empty or invalid JSON. This is a recovery copy, not an export of the fallback. Repair a copy offline and import the repaired JSON if needed.
4. While recovery is active, importing a valid backup changes only the visible map; the original saved content and paused autosave remain protected. After backing up both versions as needed, choose **Replace saved map…**, then explicitly confirm to write the visible map and resume autosave. Cancelling leaves the original untouched. A failed write retains the visible map and recovery copy, and autosave stays paused.
5. When browser storage access is denied, the app cannot read or download the original. Export the visible map first, allow browser storage, and reload to recover the original. A quota failure also offers an export and explicit retry; the app cannot guarantee persistence until saving succeeds.

The same warnings and controls are available on the dashboard and in the editor. Import/replacement dialogs start on Cancel, trap Tab, close with Escape, and restore keyboard focus.

With preview running, `node scripts/check-recovery-browser.mjs` runs optional recovery/download/restore regression checks using the same external Playwright configuration as the inventory check above. It also refreshes `docs/screenshots/recovery-{desktop,narrow}.jpg`.

## Optional topology browser check

`node scripts/check-topology-browser.mjs` uses the same external Playwright/browser configuration as the inventory and recovery scripts. It checks the viewport-filling layout, optional filters, independent device/path states, primary-router sample failure/restore, keyboard/mouse popups, focus restoration, sample isolation, and desktop/narrow navigation. Dashboard cards retain React Flow measurement state across freshness-clock updates so the map stays initialized while observations age.

## Larger-map checks

The dashboard defaults to the full network map. Fit view can zoom out far enough for the tested 100-device/180-link fixture on desktop and narrow screens. At overview scale, use zoom, search plus Fit view, or Devices to read individual labels. Fit/zoom leave manual node positions unchanged.

See [scale validation](docs/SCALE-VALIDATION.md) for fixture/browser commands, timings, screenshots and measured limits. `scripts/check-scale-browser.mjs` is an optional development-server QA check; it injects synthetic sample checks only into isolated test browsers. It does not enable real monitoring or establish production capacity.

## Radial layout and connection highlighting

In **View options → Map layout**, choose **Radial** to show connected devices in concentric graph-distance rings. Automatic centers prefer the router with the most connected peers (or the most connected device if there is no router). Use **Radial center** to choose a device; other disconnected groups keep their own automatic centers. Switch to **Saved positions** to restore the original arrangement exactly.

Radial layout changes only the dashboard display. It preserves IDs, configured links, health, manual positions, backups and editor data. The map refits after layout/center changes. Filters hide matching devices/links without rearranging the full radial layout. Dense meshes may still have crossing links and tiny overview labels; zoom or use Devices for detail. Layout preference is temporary for the current dashboard session, with saved positions remaining the default after reload or an editor round-trip.

Click a map device, press Enter/Space on it, or use **Inspect** in Devices to highlight its directly connected peers. The focus device gets a solid blue outline, peers get dashed blue outlines, and incident links are emphasized; other items are subdued. Device/path health colors stay unchanged. Close the details popup to explore the highlight. Use **Clear highlight** or click the canvas background to clear it. You can also drag a device to move it and highlight its peers without opening a popup. Incoming and outgoing configured links both count; indirect/transitive neighbors are not highlighted. Filters still apply, and selecting an isolated device shows zero direct peers.

`node scripts/check-radial-browser.mjs` runs the optional radial/highlight browser checks with the same external Playwright configuration as the other checks. It includes manual-position restoration, custom centers, storage/sample isolation, keyboard inspection, short-screen controls, and a 101-device/180-link graph with an isolated device. No dependency or persisted-schema change is needed.

## Drag devices directly on the dashboard

Drag an individual router or switch to reposition it. Its direct incoming/outgoing peers and attached configured links highlight immediately, and those lines follow the device while it moves. Neighboring devices stay in place. Releasing a drag leaves the highlight visible without opening a details popup; click or press Enter/Space for details as before.

- **Saved positions, your network:** releasing a drag updates that device's saved position through the existing autosave and recovery rules. Changes survive reload and appear in the editor/export. A failed save keeps the moved in-memory map available for export and shows the normal warning; unreadable original content remains protected while autosave is paused.
- **Radial layout or sample preview:** movement adjusts only the current view. **Reset radial positions** / **Reset sample positions** restores the generated arrangement and refits it. Changing layout, center or sample mode clears temporary adjustments. Saved manual geometry and sample isolation are preserved.

Clear highlight and reset controls sit over the map so selecting/dragging does not resize the canvas. Only existing configured connections are emphasized; the app does not discover or verify physical switch-port state. Connections/ports can still be edited through the topology editor. Optional `scripts/check-dashboard-drag-browser.mjs` tests drag/highlight, line following, independent-node movement, persistence/reload, radial/sample reset, narrow screens and failed-save preservation.
