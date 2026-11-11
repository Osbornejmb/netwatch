# NetWatch — Network health dashboard

A local-first network operations dashboard with a supporting topology editor. The dashboard shows inventory, health filters, a read-only map, attention panel, and device inspection. A labelled sample preview illustrates up/down states. It does **not** ping devices, monitor BGP, or perform SNMP discovery yet.

## Requirements
- Windows 10/11
- Node.js 22 or newer
- npm

## Run on the Windows host
1. Extract this folder.
2. Open PowerShell in the `netwatch-starter` folder.
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
netwatch-starter/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── README.md
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── styles.css
    └── nodes/
        ├── RouterNode.jsx
        └── SwitchNode.jsx
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

See [architecture](docs/ARCHITECTURE.md), [implementation roadmap](docs/ROADMAP.md), and [contributing](CONTRIBUTING.md). The machine-readable [GitHub plan](docs/github-plan.json) defines four milestones and twelve ordered issues. The Publish project plan workflow creates them on GitHub when the plan is pushed to main; check its Actions run for publication status.

Still pending: editable device details, full dialog focus handling, and browser interaction tests. Monitoring and remote access are planned, not implemented.

Repository: [Osbornejmb/netwatch](https://github.com/Osbornejmb/netwatch). See [issues](https://github.com/Osbornejmb/netwatch/issues), [milestones](https://github.com/Osbornejmb/netwatch/milestones), and [build and plan workflows](https://github.com/Osbornejmb/netwatch/actions).
