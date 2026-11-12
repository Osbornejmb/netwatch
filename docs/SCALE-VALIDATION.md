> Current browser checks use isolated test inventories and controlled snapshot HTTP responses; the built-in sample preview and Vite sample-generator interception described in the original evidence below have been removed. Historical measurements are retained as historical evidence.

# Dashboard scale validation — issue 1.4

The default dashboard remains the network map fitted to the remaining viewport. A repeatable synthetic fixture covers 100 devices and 180 configured links using unique 198.51.100.0/24 documentation addresses. No probes or host services run.

## Method and environment

Fixture: `tests/fixtures/scale-network.js`; unit contract: `tests/scale.test.js`; browser check: `scripts/check-scale-browser.mjs`; raw results: [scale-results.json](scale-results.json).

Chromium 156.0.8078.79, Linux x64 on a shared managed cloud executor with an AMD EPYC 9V74 CPU. Node exposes 3 logical CPUs and about 10 GiB host memory; the executor cgroup quota is 2 CPU cores and 8 GiB memory. Browser runner and the measured Vite server used Node 22.23.5. These are shared resources, not dedicated benchmark hardware.

The browser preloads only validated inventory into isolated localStorage. Real inventory first renders all 100 devices as unmonitored. A response interception replaces Vite's sample generator only in that test browser, producing frozen mixed checks (70 up, 10 down, 10 stale, 10 unknown). Production source, the normal 14-device sample, and the persisted data contract do not change. Assertions confirm no fixture observations or position changes reach storage. A separate isolated empty-inventory context is also tested.

Start the development server with `npm run dev -- --port 5175 --strictPort`, then run `node scripts/check-scale-browser.mjs` with `NETWATCH_SCALE_URL` pointing to `http://127.0.0.1:5175`. As with the other optional browser scripts, use an existing Playwright installation; `PLAYWRIGHT_MODULE` may point to its module and `CHROMIUM_PATH` to Chromium. The script asserts that its sample interception matched the source; a refactored sample generator requires updating the test.

## Observed timings

| Viewport | Initial unmonitored render | Mixed sample render | Status filter range | Single-device search |
| --- | --- | --- | --- | --- |
| 1440 × 900 | 1311 ms | 453 ms | 62–143 ms | 67 ms |
| 390 × 844 | 1022 ms | 390 ms | 36–128 ms | 70 ms |

Initial render is browser navigation through 100 initialized, visible cards; it includes Vite delivery/compilation and browser automation. Sample render is activation through mixed-state cards. Filter timing is the selection action through expected node and edge counts; search timing is input through the single matching node. These single observations include automation overhead and shared-machine variation. They are development-server QA measurements, not production latency targets, percentile estimates or cold-start comparisons.

## Checks and observed limits

- Initial map: no sidebar, summary-card row or default table. Every device fits inside the map on both viewports. The previous 0.15 minimum zoom clipped 20 devices at 390 px; lowering the dashboard minimum to 0.05 fixes the measured fixture without moving any device.
- Full-inventory status counts stay 100/70/10/10/10 regardless of search or filtering. Filtered edge IDs exactly match fixture edges whose two endpoints remain visible; each rendered edge is checked against those endpoints. Empty, all-unknown, ten simultaneous down devices and mixed stale states pass.
- Search/no matches/reset, every status filter, pan, zoom and Fit view pass. Down devices can be isolated and keyboard-inspected on the map; stale devices can be filtered and keyboard-inspected in Devices with focus restored on close. Both layouts have no horizontal document overflow.
- Overview labels are approximately 5.6 px on desktop and 1.7 px on narrow screens. They are not readable at the full-network scale. Search a device and use Fit view, zoom into a region, or open Devices for readable text; the focused-label check reaches 20.8 px on both viewports, and popups remain readable at normal UI scale.
- No grouping, automatic layout or collapse was introduced: status/search/inspection provide access while preserving manual positions. The full map is an overview, not a claim that 100 labels can be read at once. Irregular or more densely crossing real layouts may need different grouping after measured evidence.
- This fixture is provisional. The 2,000-device import limit is a validation bound, not a supported performance capacity. Confirm the intended deployment size and topology shape, and test on the target Windows/browser machine before release. Live polling, sustained monitoring, real-device behavior and full screen-reader validation are outside this issue.

## Review images

- [Desktop overview](screenshots/scale-1440-overview.jpg) and [narrow overview](screenshots/scale-390-overview.jpg): whole network, colour distribution and configured links.
- [Desktop readable card](screenshots/scale-1440-readable.jpg) and [narrow readable card](screenshots/scale-390-readable.jpg): search plus Fit view.
- [Desktop failure inspection](screenshots/scale-1440-inspection.jpg) and [narrow failure inspection](screenshots/scale-390-inspection.jpg): keyboard-opened popup with readable status, address and peer/path details.
