# Dashboard design direction

In Edit map, Clear draft map sits next to Use this map and asks for confirmation before clearing the draft. Backspace and Delete open the removal confirmation for the selected device. Text fields keep their normal editing behavior.

Circle gives each branch a sector based on the number of devices at its ends. Tidy places small branches in columns beneath their parents, wraps sets of direct clients, and routes connections through the gaps between rows. Wider hierarchies use the compact grid. Both layouts use measured card widths once they are available.

Circle packs busy hubs into a staggered arrangement and splits wide branches into bands. Large cyclic components that would stretch the overview use compact rows. Use Fit view for the whole topology and Zoom to 100% to read labels while panning.

Configured operators can sign in to the Dashboard, Devices and Discovered views. Map editing and access settings remain separate. The local Access log includes a redacted JSON download.

Uplinks & redundancy keeps link roles, parallel port mappings, root routers, and redundancy baseline selection within the draft editor. The map replacement preview identifies reviewed baselines and roots before applying them. Device details display mapped port status separately from reachability. The dashboard leads with link coverage and reviewed redundancy, and keeps the collapsible port summary for legacy router groups. Hierarchy is the monitored default and uses designated roots. Circle and Tidy remain available. Link details present port names, speed, evidence scope, and age.

The admin-only Network neighbors panel opens on demand in saved-device details. It shows the observation time, reported ports, and whether the evidence is current. Operators review each proposal, choose a saved peer or name a new unmonitored device, and explicitly save or dismiss the link.

Discovery shows route-check progress and reports newly saved router links at scan completion.

The dashboard map labels discovered links with the access port or both LLDP port identifiers. Port labels can be toggled in View options. The Connections section retains the full observation label.

At 30 distinct connections, the dashboard increases card spacing and shows only the selected device's links by default. **Show all links** draws a simplified overview without port labels. Node health, filters, and device details stay available in either view.

While dragging in a dense map, links follow the moving cards using straight paths. Detailed paths and port labels return when the drag ends. At 120 devices, the dashboard renders the visible part of the map and the Devices view still provides the full list.

Small rings in Circle layout use card height for vertical clearance and card width for horizontal clearance. This keeps the cards above and below a router close even when it also has peers on either side.

Discovered devices shows the default gateway as a router in the result row. Add all to map shows a confirmation with the result count and the starting check setting. The action applies across result pages.

Remote viewers see the Dashboard and device details. Remote admins have the full map workflow with a remote session indicator. Sign-in uses the existing off-white surface and standard buttons, with inline errors and retry times.

- Device type has a consistent silhouette in both dashboard and editor: routers are content-sized horizontal oblongs (280px maximum); switches are compact 160×56px rectangles. The editor uses type icons. Dashboard cards use a health border and an accessible status icon. Cards show device names and health icons. Information buttons reveal full names, addresses and check details on hover, focus or tap.
- Current redesign: one warm off-white palette across all web screens and Windows controls, with dark green actions and explicit health labels/icons. Use canvas `#f4f3ee`, surface `#fcfbf7`, text `#253a36`, muted text `#5b6963`, and accent `#176654`. Pure white is excluded from app surfaces, text, borders and icons. System window decorations remain OS-controlled.
- Everyday wording: Edit map, Draft map, Monitored network, Ports, Outages, Check history and Overdue. Internal status/API identifiers are unchanged. Search is always available; Status and clickable summary counts are visible; source, layout and explanatory details live in View options. Device details initially show IP, latest check, response time and check settings; connections and other information expand on request.
- The editor removes summary cards, minimap, footer and repeated information cards. Devices & connections expands for keyboard editing and stays open after deletion. Use this map directly prepares a fresh, conflict-checked dashboard-map replacement review; Load saved map reviews replacing the draft with the monitored map. Backups contains download/restore and recovery only; it never configures the dashboard. Additional controls live under Monitoring settings in the editor. Protocol enrollment remains local to the PC.
- Saved-device details now include a collapsed Interfaces section with separate admin/oper state, last interface check, conservative rates, 50-row paging and explicit paused/unknown/stale/error states. It loads only when opened and keeps last-known rows on connection failure. Interface state does not change ICMP device colors or imply physical-link verification. The Ports section directs local users to Port monitoring in the Windows launcher for SNMP setup. Browser sign-in accepts only Remote Access passwords.

Reference guidance: [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), using its status/incident dashboard and minimal enterprise recommendations. Keep existing React Flow and Lucide rather than adding a design framework.

- An off-white map-first landing screen with one small horizontal navigation bar: Dashboard, Edit map, Devices. No sidebar, avatar, breadcrumbs, promotional heading, summary-card row, or always-visible inventory.
- The topology has a stable height in the page scroll. Expanding the panels below the map leaves the canvas height intact. A small title, connection status, status chips, filters and conditional Needs attention controls precede it. Link evidence has one connection list below the map, with a shared explanation for unknown status icons. Map tools stays collapsed until requested. The Discovered page keeps its actions visible while scrolling and distinguishes the scheduled start device from the manual start device. Source, layout and reachability explanation are tucked into View options; the device table appears only on the Devices screen. Clicking a device opens a dismissible, keyboard-accessible detail popup; no permanent detail/attention sidebar competes with the map. A searchable device list offers an alternative to using the graph.
- Summary counts: all devices, up, down, stale, not monitored. Counts refer to the full current inventory; the filter states how many devices are shown.
- Green + check + Up, red + failure icon + Down, amber + clock + Stale, neutral + question mark + Not monitored. Node type uses a router/switch icon; type colors must not imply health.
- Connections are undirected. Distinct mapped port pairs can appear as parallel links, and unresolved records use their device pair for display. Connection lines summarize endpoint reachability: solid green when both endpoints are up, dashed red when an endpoint is down, solid amber for stale, and dashed gray for unknown data. This does not establish interface, cable, traffic-forwarding, or BGP health. A responding switch keeps its own green state despite one failed upstream router. Filtered maps hide links whose endpoints are hidden.
- System fonts and bundled SVG icons. No runtime font download, decorative charts, fake uptime percentages, or animated indicators implying a connection.
- Use semantic CSS tokens for surfaces, text, boundaries, and status pairs. Target normal-text contrast of at least 4.5:1, visible focus, and controls at least 40 px tall on desktop / 44 px on narrow touch layouts.
- Use the same off-white design in the editor; preserve topology and storage compatibility when switching screens.
- Start with empty browser and host inventory, without a demo mode. Default to Saved host network with real observations, explicit connection/checking state and last-update time; the separate Browser working copy has no live status. Preserve checks through connection loss and age them to stale with the host threshold.

- Saved-device details provide Enable/Disable monitoring, a readable service state, last-check time and measured latency. Missing addresses disable authorization; never-checked and disabled devices remain unknown. Recent history is a collapsible section with bounded pages, local timestamps, adjacent status changes, and explicit loading/error/empty feedback. Needs attention appears on the main screen for down/overdue devices and open outages. Keep UI messages readable without raw API errors or diagnostic codes.

Validate at desktop and narrow widths. Check search, each status filter, selecting a device from map and list, empty startup and saved-inventory preservation, and switching back to the editor. Record limitations in WORKLOG.md.

- Circle is the default in both maps and uses card-aware ring radii for close spacing without overlap. Tidy remains available: deterministic router-first graph layers wrap into compact rows with card-sized spacing. Both share collision checks, connection-distance limits, retained valid moves and undirected link rules. Both use deterministic display coordinates.
- Selecting a device highlights direct peers and incident paths in either layout. Use blue solid/dashed outlines to distinguish focus/peers without replacing green/red/amber/gray health colors. Keep an explicit Clear highlight control and a textual direct-peer count; do not imply transitive connectivity or live interface verification.

- Allow individual dashboard devices to be dragged, highlighting direct peers and attached links from drag start. Do not open a popup on drag release. Keep focus controls over the map so gestures do not shift the canvas. Moves push overlapping neighbors in the direction of travel and are retained on pointer/key release. Only a connection exceeding max(320px, 1.5× its arranged length) reverts the gesture to its last valid positions. Navigation, browser tab switches and reload reset adjustments. Changing the layout or map source also resets positions. Unconnected devices are free to move.

- Device details include collapsible Incidents with open/recovered labels, local timestamps, empty/loading/error feedback, bounded older pages and View checks to open Recent history. Needs attention includes open incidents even when monitoring is paused or evidence is stale. An open incident is historical outage evidence, not a claim that the latest check is fresh. External notifications remain deferred.

- The dashboard receives coalesced live snapshots with conditional polling as a fallback. Default device checks target ten-second cycles with two failures before Down and one reply for recovery; the host freshness threshold is at least 30 seconds and scales with inventory.
