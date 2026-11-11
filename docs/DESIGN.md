# Dashboard design direction

Reference guidance: [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), using its status/incident dashboard and minimal enterprise recommendations. Keep existing React Flow and Lucide rather than adding a design framework.

- A restrained dark navigation rail around a light, spacious operations canvas.
- The topology takes the largest area; a right panel lists devices requiring attention and selected-device details. A searchable device list offers an alternative to using the graph.
- Summary counts: all devices, up, down, stale, not monitored. Counts refer to the full current inventory; the filter states how many devices are shown.
- Green + check + Up, red + failure icon + Down, amber + clock + Stale, neutral + question mark + Not monitored. Node type uses a router/switch icon; type colors must not imply health.
- Configured links remain neutral unless interface monitoring verifies their state. Filtered maps hide links whose endpoints are hidden.
- System fonts and bundled SVG icons. No runtime font download, decorative charts, fake uptime percentages, or animated indicators implying a connection.
- Use semantic CSS tokens for surfaces, text, boundaries, and status pairs. Target normal-text contrast of at least 4.5:1, visible focus, and controls at least 40 px tall on desktop / 44 px on narrow touch layouts.
- Keep the editor's existing dark workspace separate. Preserve topology and storage compatibility when switching screens.
- Clearly label sample mode. Default to actual configured inventory with unknown health and an honest disconnected explanation.

Validate at desktop and narrow widths. Check search, each status filter, selecting a device from map and list, sample mode isolation, and switching back to the editor. Record limitations in WORKLOG.md.
