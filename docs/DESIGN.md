# Dashboard design direction

Reference guidance: [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), using its status/incident dashboard and minimal enterprise recommendations. Keep existing React Flow and Lucide rather than adding a design framework.

- A white topology-first landing screen with one small horizontal navigation bar at the top: Dashboard, Topology editor, Devices. No sidebar, avatar, breadcrumbs, promotional heading, summary-card row, or always-visible inventory.
- The topology fills all remaining viewport space. Only a small dashboard title and connection/sample status precede it. Search, filter counts, and reachability explanation are tucked into View options; the device table appears only on the Devices screen. Clicking a device opens a dismissible, keyboard-accessible detail popup; no permanent detail/attention sidebar competes with the map. A searchable device list offers an alternative to using the graph.
- Summary counts: all devices, up, down, stale, not monitored. Counts refer to the full current inventory; the filter states how many devices are shown.
- Green + check + Up, red + failure icon + Down, amber + clock + Stale, neutral + question mark + Not monitored. Node type uses a router/switch icon; type colors must not imply health.
- Connection lines summarize endpoint reachability: solid green when both endpoints are up, dashed red when an endpoint is down, amber for stale, and gray for unknown data. This does not establish interface, cable, traffic-forwarding, or BGP health. A responding switch keeps its own green state despite one failed upstream router. Filtered maps hide links whose endpoints are hidden.
- System fonts and bundled SVG icons. No runtime font download, decorative charts, fake uptime percentages, or animated indicators implying a connection.
- Use semantic CSS tokens for surfaces, text, boundaries, and status pairs. Target normal-text contrast of at least 4.5:1, visible focus, and controls at least 40 px tall on desktop / 44 px on narrow touch layouts.
- Keep the editor's existing dark workspace separate. Preserve topology and storage compatibility when switching screens.
- Clearly label sample mode. Default to actual configured inventory with unknown health and an honest disconnected explanation.

Validate at desktop and narrow widths. Check search, each status filter, selecting a device from map and list, sample mode isolation, and switching back to the editor. Record limitations in WORKLOG.md.

- View options can switch between saved positions and a temporary radial layout, with an optional center device. Keep the default full-map workspace and manual editor positions intact.
- Selecting a device highlights direct peers and incident paths in either layout. Use blue solid/dashed outlines to distinguish focus/peers without replacing green/red/amber/gray health colors. Keep an explicit Clear highlight control and a textual direct-peer count; do not imply transitive connectivity or live interface verification.
