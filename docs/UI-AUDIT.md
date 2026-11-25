# NetWatch UI audit

## November 25 review

This pass starts from `8ad63a7`. Severity reflects impact on a routine workflow. Screenshots and interactive checks use fixture data.

| Severity | Screen | Finding and disposition |
| --- | --- | --- |
| Medium | Discovered | The scan action and its results were separated by scheduled discovery and topology controls. Local scan results now come first, with a shortcut to a separate topology panel. Manual proposals come before the schedule. |
| Medium | Discovered | Search and status filtered the loaded page while bulk add covered all pages. The filter scope, match count, reset action, and bulk confirmation now say which devices they affect. |
| Medium | Discovered | Concurrent pagination clicks could race, and removing the only row on the last page left an empty page selected. Paging now waits for each request and returns to the previous page after the last row is removed. |
| Medium | Discovered | The list could appear empty before loading or after an initial connection error. Loading, retry, no matches, and an empty list now have separate messages. Adding a device offers a shortcut to its draft. |
| Low | Topology proposals | An empty enrolled-device picker gave little guidance, and a filter could silently stop applying when one proposal remained. Added enrollment guidance and kept active filters consistent. Router-and-switch mode offers topology with a local scan pause notice. |
| Low | Dashboard, Edit map, Devices | Reviewed the current map, editor toolbar, search and device selection. Earlier wheel navigation, toolbar wrapping and stranded detail modal findings are already fixed. |
| Low | Device details | Section controls use keyboard-operable disclosures. Ports and Network neighbors load on demand. Retained the existing disclosure order and monitoring state rules. |
| Low | Add and edit device | The existing field validation names invalid fields and associates errors with their inputs. Retained the form and checked its behavior in the inventory and discovery fixture flows. |
| Low | Link details and saved-map preview | The existing dialogs distinguish missing port readings and keep draft changes behind a review. Retained those flows and checked the link and host browser regressions. |
| Medium | Sign-in | The initial error did not suggest how to recover, and the password did not get initial focus. Added recovery guidance, role-specific text and password focus. |
| Medium | Access log | Internal action names could appear when no display label was known. The log now uses a neutral label for those records and scrolls within the dialog. |
| Low | Backups, recovery and confirmations | Long dialog content and action rows competed for space on narrow screens. The dialog styles now use bounded widths and stack actions on narrow screens. The Backups menu keeps its label intact. |
| Medium | Windows launcher dialogs | Port monitoring and Remote access used default input and list colors, and dialog layouts had no explicit DPI baseline. Port monitoring, Remote access, password and sharing dialogs now share the launcher palette, respect Windows high contrast, and declare a DPI baseline. |
| Low | Windows main window, Settings and tray | Reviewed startup controls, the expanded settings panel and tray actions. Retained the existing lifecycle and tray commands. See the Windows verification notes for what was exercised. |

### Discovered captures

| Screen | 1440 px | 1024 px | 768 px | 390 px |
| --- | --- | --- | --- | --- |
| Local scan and topology | [Before](screenshots/ui-qol/discovered/before-1440.png) · [After](screenshots/ui-qol/discovered/after-1440.png) | [Before](screenshots/ui-qol/discovered/before-1024.png) · [After](screenshots/ui-qol/discovered/after-1024.png) | [Before](screenshots/ui-qol/discovered/before-768.png) · [After](screenshots/ui-qol/discovered/after-768.png) | [Before](screenshots/ui-qol/discovered/before-390.png) · [After](screenshots/ui-qol/discovered/after-390.png) |
| Router and switch mode | [Before](screenshots/ui-qol/discovered/before-routers-switches-1440.png) · [After](screenshots/ui-qol/discovered/after-routers-switches-1440.png) | [Before](screenshots/ui-qol/discovered/before-routers-switches-1024.png) · [After](screenshots/ui-qol/discovered/after-routers-switches-1024.png) | [Before](screenshots/ui-qol/discovered/before-routers-switches-768.png) · [After](screenshots/ui-qol/discovered/after-routers-switches-768.png) | [Before](screenshots/ui-qol/discovered/before-routers-switches-390.png) · [After](screenshots/ui-qol/discovered/after-routers-switches-390.png) |
| Clear results confirmation | [Before](screenshots/ui-qol/discovered/before-confirmation-1440.png) · [After](screenshots/ui-qol/discovered/after-confirmation-1440.png) | [Before](screenshots/ui-qol/discovered/before-confirmation-1024.png) · [After](screenshots/ui-qol/discovered/after-confirmation-1024.png) | [Before](screenshots/ui-qol/discovered/before-confirmation-768.png) · [After](screenshots/ui-qol/discovered/after-confirmation-768.png) | [Before](screenshots/ui-qol/discovered/before-confirmation-390.png) · [After](screenshots/ui-qol/discovered/after-confirmation-390.png) |

The Discovered fixture checked document width, cancellation focus and keyboard dismissal at desktop and phone sizes. The sampled palette combinations for normal and muted text, primary buttons and sign-in alerts range from 5.18:1 to 11.67:1. This was a spot check of the changed styles.

Sign-in, Access log, Backups and recovery were captured before and after at 1440, 1024, 768 and 390 px. The fixture checked for horizontal overflow and uncaught UI errors. It also checked that the access log gives unknown actions a readable label. See the [dialog captures](screenshots/ui-qol/dialogs/).

Dashboard, Edit map, Devices and expanded device details were checked at the same four widths. Each viewport exercised Outages, Check history, Ports, Network neighbors and Connections. No horizontal overflow or uncaught UI errors appeared. The Ports and Network neighbors captures show their setup-required states. See the [main screen captures](screenshots/ui-qol/main-screens/).

### Verification for this pass

| Check | Result |
| --- | --- |
| Production build, ESLint, Prettier | Passed. Vite still reports a large bundle warning. |
| Node tests on Windows | 211 passed, 1 blocked because the local OpenSSL executable is missing. The blocked TLS test could not create its fixture certificate. |
| Localhost Chromium suite | All 20 fixture scripts passed, including scan progress, draft staging, topology proposal recovery and redacted audit export. The separate real HTTPS remote-access walkthrough was not run. |
| Router and switch mode | Fixture browser run passed for CDP topology proposals with local scan controls hidden. |
| Windows launcher | Compared native baseline captures with updated offscreen WinForms renders of the main window, Settings, Port monitoring and Remote access on Windows. Checked 70 visible control bounds in the updated fixture and confirmed empty-inventory port actions were disabled. See the [launcher captures](screenshots/ui-qol/launcher/). |

Live DPI changes, the tray context menu, and the password and packaged sharing flows were not exercised. The launcher fixture used a separate empty database and did not run monitoring. No high-severity issue was reproduced in the verified workflows.

## November 24 review

November 24, 2026. Baseline `ec91f75`, Windows, Node 26.13.1 and Chromium via Playwright. The built dashboard ran at `127.0.0.1:4317` against an in-memory SQLite database populated from test fixtures. The browser checks that own their fixture servers used ephemeral loopback ports. No real inventory or devices were used.

## Findings

| Severity | Screen and steps | Expected | Actual on baseline | Evidence and disposition |
| --- | --- | --- | --- | --- |
| Medium | Dashboard. Open Link health and scroll toward the expanded details with the wheel over the map. | The page moves toward the details. | The map captured the wheel gesture. At 390 × 900, the page had 35 px of scrollable content and stayed at scroll position 0. | [Before](screenshots/ui-audit/wheel-before.png) · [After](screenshots/ui-audit/wheel-after.png). The same gesture now scrolls 35 px. Playwright checks that wheel scrolling leaves the map zoom unchanged. |
| Medium | Windows launcher. Save a per-device SNMP port context and rerun source launcher setup. | The context stays in the launcher configuration. | Setup rewrites the configuration and drops the context. | Windows subprocess regression test against a temporary configuration, [desktop-setup.test.js](../tests/desktop-setup.test.js). Fixed. Native screenshot unavailable. |
| High | Discovered devices. Confirm a topology proposal while browser storage writes are failing, or lose the response after the host records acceptance. | The proposal stays reviewable until there is a recoverable copy of the draft. | The host records acceptance before the browser's autosave, leaving a failure window across the two stores. | Code evidence in [topology-discovery.js](../host/routes/topology-discovery.js) and [App.jsx](../src/App.jsx). Prior audit A-01. Fixed. The browser persists the reviewed draft before asking the host to record acceptance. Playwright verifies that a storage failure leaves the proposal pending and that a lost acknowledgement leaves the draft available after reload. [Before](screenshots/ui-audit/discovery-draft-quota.png) · [After](screenshots/ui-audit/discovery-draft-quota-fixed.png). |
| Medium | Discovered devices. Leave the page open with no active run while a scheduled run starts. | The page updates to show the new run. | The mount request loads the latest run once. Polling starts only when the previously loaded run already reports running. | Code evidence in [TopologyDiscovery.jsx](../src/TopologyDiscovery.jsx). Prior audit A-02. Fixed. The page discovers externally started runs and retains the last results during an outage. [Refresh error](screenshots/ui-audit/discovery-refresh-error.png). |
| Low | Edit map at 768 px. Load the fixture and inspect the Draft map toolbar. | Short action labels wrap at word boundaries and remain easy to scan. | The action column is compressed and wraps individual words. | [Before](screenshots/ui-audit/topology-768.png) · [After](screenshots/ui-audit/topology-768-after.png). Controls now wrap within the toolbar and labels stay on one line. Covered by the inventory browser check. |
| Low | Dashboard. Inspect the accessible role of a focusable device node that opens details. | The control exposes an action role. | The node is described as a group. Enter and Space open details, and Devices offers a separate native Details button. | [Dashboard.jsx](../src/Dashboard.jsx) and [dashboard screenshot](screenshots/ui-audit/dashboard-390.png). Prior audit C-01. Fixed. The device name is a native button with a name, device type, and status. The information button stays separate, and the map group retains keyboard movement. Playwright opens the details using the named button. |
| Low | Devices → Dashboard with device details open. Open Details on Devices, then navigate to the Dashboard hash. | The new page starts with its own focus and modal state. | The device modal remains open over the dashboard and intercepts pointer input until dismissed. | [Before](screenshots/ui-audit/details-after-navigation-390.png) · [After Browser Back](screenshots/ui-audit/details-after-navigation-fixed.png). Fixed with a history-navigation browser check. |

## Screen captures

The four screens below were inspected at all requested widths, including the discovery empty/error view. None of the captures had document-level horizontal overflow or an uncaught page exception. The app declares a light color scheme.

| Screen | 1440 px | 1024 px | 768 px | 390 px |
| --- | --- | --- | --- | --- |
| Dashboard | [1440](screenshots/ui-audit/dashboard-1440.png) | [1024](screenshots/ui-audit/dashboard-1024.png) | [768](screenshots/ui-audit/dashboard-768.png) | [390](screenshots/ui-audit/dashboard-390.png) |
| Edit map | [1440](screenshots/ui-audit/topology-1440.png) | [1024](screenshots/ui-audit/topology-1024.png) | [768](screenshots/ui-audit/topology-768.png) | [390](screenshots/ui-audit/topology-390.png) |
| Devices | [1440](screenshots/ui-audit/inventory-1440.png) | [1024](screenshots/ui-audit/inventory-1024.png) | [768](screenshots/ui-audit/inventory-768.png) | [390](screenshots/ui-audit/inventory-390.png) |
| Discovered devices | [1440](screenshots/ui-audit/discovered-1440.png) | [1024](screenshots/ui-audit/discovered-1024.png) | [768](screenshots/ui-audit/discovered-768.png) | [390](screenshots/ui-audit/discovered-390.png) |
| Device details | [1440](screenshots/ui-audit/device-details-1440.png) | [1024](screenshots/ui-audit/device-details-1024.png) | [768](screenshots/ui-audit/device-details-768.png) | [390](screenshots/ui-audit/device-details-390.png) |
| Backups | [1440](screenshots/ui-audit/backups-1440.png) | [1024](screenshots/ui-audit/backups-1024.png) | [768](screenshots/ui-audit/backups-768.png) | [390](screenshots/ui-audit/backups-390.png) |
| Dashboard with zero devices | [1440](screenshots/ui-audit/scale-0-1440.png) | [1024](screenshots/ui-audit/scale-0-1024.png) | [768](screenshots/ui-audit/scale-0-768.png) | [390](screenshots/ui-audit/scale-0-390.png) |
| Dashboard with one long device name | [1440](screenshots/ui-audit/scale-1-1440.png) | [1024](screenshots/ui-audit/scale-1-1024.png) | [768](screenshots/ui-audit/scale-1-768.png) | [390](screenshots/ui-audit/scale-1-390.png) |
| Dashboard with 50 devices | [1440](screenshots/ui-audit/scale-50-1440.png) | [1024](screenshots/ui-audit/scale-50-1024.png) | [768](screenshots/ui-audit/scale-50-768.png) | [390](screenshots/ui-audit/scale-50-390.png) |
| Dashboard with 220 devices | [1440](screenshots/ui-audit/scale-220-1440.png) | [1024](screenshots/ui-audit/scale-220-1024.png) | [768](screenshots/ui-audit/scale-220-768.png) | [390](screenshots/ui-audit/scale-220-390.png) |

The 0, 1, 50 and 220 device fixtures rendered at all four widths without document overflow or page exceptions. This was a render check with simulated inventories. It does not measure long-running memory use or host device capacity.

## Scope and limits

The captured matrix covers the landing states, the Backups menu and the device details dialog. The fixture browser checks add interaction coverage for editor transfers, monitoring freshness, disconnect and recovery, device details, discovery, and redacted audit export. A full screenshot matrix for every dialog and transition, native launcher visual and DPI inspection, dedicated WCAG AA contrast and assistive-technology testing, long-running memory measurements, and second-PC HTTPS/login/recovery validation remain open. See [the previous repository audit](../AUDIT.md) for earlier performance evidence and deferred findings.

The known open issues cover topology discovery and LLDP review, redundancy, authentication, Windows deployment and hardware acceptance. This pass leaves their acceptance criteria open. [GitHub issues](https://github.com/osbornejmb/netwatch/issues)

## Verification

| Check | Baseline | After fixes |
| --- | --- | --- |
| Locked install | 225 packages installed when npm registry access was available | Dependency lock unchanged |
| Windows Node tests | 203 passed | 204 passed |
| Production build | Passed with a JavaScript chunk over 500 kB | Passed with the same warning |
| ESLint and Prettier | Passed | Passed |
| npm advisory query | Zero reported advisories for the locked tree | Dependency lock unchanged |
| Chromium regression | New wheel and tablet assertions reproduced failures | Both passed. All 20 CI-style fixture scripts also passed in the local Windows run. |

The first restricted test run failed only on Windows DPAPI and self-signed certificate generation. Both tests passed in the baseline and updated runs with access to the Windows credential and certificate stores. The dedicated remote browser script requires a separate HTTPS configuration and disposable accounts. The fixture admin discovery and redacted audit-export browser check passed, and the Node suite exercised authentication and recovery.

On the discovery and navigation follow-up, both new browser regressions passed and all 204 Windows Node tests passed. The CI-style browser run passed 19 scripts and exposed a timing failure in the scale check. The scale check now waits for keyboard focus and verifies the existing edge counts and node opacity in the same settled render. The updated scale check passed in standalone Chromium runs.
