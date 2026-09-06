# Microsoft Store visual assets

This folder contains the prepared visual assets for the desktop MSIX Store listing. It does not contain package assets, listing copy, privacy text, or upload automation.

## Microsoft requirements used

Microsoft's current MSIX guidance requires at least one Store screenshot, recommends at least four screenshots per supported device family, and permits up to ten desktop screenshots. Desktop screenshots must be PNG files, no larger than 50 MB, and at least 1366 x 768 pixels. For a non-game desktop app, Store logos are optional; a 300 x 300 PNG app tile icon is recommended and otherwise the Store can use the package icon.

- [MSIX Store listing fields](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info)
- [MSIX screenshots and images](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images)

The game- and Xbox-oriented 2:3 poster art and 1:1 box art were not generated because they are not required for this ordinary desktop app. No marketing artwork or icon redesign was introduced.

## Prepared assets

| File | Pixels | Content | Current build |
| --- | ---: | --- | --- |
| `icons/app-tile-icon-300x300.png` | 300 x 300 | Mechanical resize of the current 512 x 512 LumaTrace brand icon | Brand source from current tree; not a UI capture |
| `screenshots/en-US/01-home.png` | 1440 x 900 | Home page and Windows/Android platform choices | Yes |
| `screenshots/en-US/02-select-target.png` | 1440 x 900 | Windows target selection using the built-in Mock App/Mock Game targets | Yes |
| `screenshots/en-US/03-live-metrics.png` | 1440 x 900 | Test in progress with realtime FPS, CPU, GPU, and memory charts | Yes; the UI visibly labels demo data as `source: mock` |
| `screenshots/en-US/04-results.png` | 1440 x 900 | Results overview with smoothness, stability, and resource-use cards | Yes; generated from the same mock test session |
| `screenshots/zh-CN/01-home.png` | 1440 x 900 | Simplified Chinese home page and Windows/Android platform choices | Yes |
| `screenshots/zh-CN/02-select-target.png` | 1440 x 900 | Simplified Chinese Windows target selection using the built-in Mock App/Mock Game targets | Yes |
| `screenshots/zh-CN/03-live-metrics.png` | 1440 x 900 | Simplified Chinese realtime FPS, CPU, GPU, and memory charts | Yes; the UI visibly labels demo data as `来源: mock` |
| `screenshots/zh-CN/04-results.png` | 1440 x 900 | Simplified Chinese results overview with smoothness, stability, and resource-use cards | Yes; generated from the same mock test session |

The screenshots were captured from the current source-tree build through the local Vite UI and current local server, using an isolated temporary database. They are not captures of the older release executable. No personal path, account, token, or device serial appears in the images.

Partner Center requires images to be assigned separately for each Store listing language, even when the same image is reused. English (`en-US`) and Simplified Chinese (`zh-CN`) have dedicated captures. The remaining 102 listings reuse the current English product captures while receiving their own localized captions and textual listing fields from the matching runtime/report dictionary.
