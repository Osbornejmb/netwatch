# NetWatch — Network health dashboard

A local-first network operations dashboard with a supporting topology editor. The dashboard shows inventory, health filters, a read-only map, attention panel, and device inspection. A labelled sample preview illustrates up/down states. It does **not** ping devices, monitor BGP, or perform SNMP discovery yet.

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
- Dashboard is the default screen; use Edit topology for inventory changes.
- Status counts and filters for up, down, stale, and not monitored.
- Read-only topology map, attention panel, search, and keyboard-operable inventory inspection.
- Separate sample preview with 14 example devices; sample checks are frozen and never saved into your network.
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

Still pending: improved saved-map recovery/import dialogs and ongoing browser regression coverage. Monitoring and remote access are planned, not implemented.

Repository: [Osbornejmb/netwatch](https://github.com/Osbornejmb/netwatch). See [issues](https://github.com/Osbornejmb/netwatch/issues), [milestones](https://github.com/Osbornejmb/netwatch/milestones), and [build and plan workflows](https://github.com/Osbornejmb/netwatch/actions).

## Address validation and older maps

Management addresses must be plain IPv4 or IPv6 literals; hostnames, URL/bracket notation, subnet prefixes, IPv6 zone identifiers, and ambiguous IPv4 forms such as leading-zero octets are rejected. Surrounding whitespace is removed; IPv6 is lowercased and compressed before duplicate comparison. IPv4 and IPv6 are distinct address families; IPv4-mapped IPv6 spellings are compared in their canonical IPv6 form. Empty addresses are allowed on multiple inventory entries.

Valid v1 maps keep their IDs, positions, links, and schema. Imports with invalid or duplicate addresses are rejected before replacement. Work on a copy of an older JSON backup: replace descriptive/invalid addresses with literals or empty strings and remove duplicate addresses before importing. If saved browser data fails these checks, autosave pauses and leaves the original saved content untouched; do not confirm replacement until you have a backup. Export saves the current visible map, not the unreadable original. Downloading unreadable saved content is still tracked in #3.

These UI checks do not authorize probes. The future host API must independently validate addresses, require monitoring opt-in, and use bounded shell-free probes.

## Optional inventory browser regression check

With the build preview running, use an existing Playwright installation to run `node scripts/check-inventory-browser.mjs`. This check is separate from `npm test` and does not add a runtime dependency. `PLAYWRIGHT_MODULE` can point to an external Playwright module, `CHROMIUM_PATH` to a browser executable, and `NETWATCH_URL` to the preview (defaults to `http://127.0.0.1:4173`). It uses a fresh browser context, checks edits/validation/focus/keyboard links/import preservation, and refreshes the inventory review screenshots.
