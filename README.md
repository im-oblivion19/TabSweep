# TabSweep 🧹

TabSweep is a Chrome extension that automatically identifies and cleans up inactive browser tabs while protecting important tabs and active media playback.

## Features
- Automatically detects inactive tabs using background alarms
- Protects pinned tabs and user-marked important tabs
- Prevents closing active YouTube/media tabs
- Configurable inactivity threshold
- Review-before-close workflow to avoid data loss
- Clean, light purple UI

## Installation (Developer Mode)
1. Clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project folder

## Tech Stack
- JavaScript
- Chrome Extensions API (Manifest V3)
- Event-driven background service workers

## Notes
On Chrome, YouTube videos may pause when backgrounded due to browser policy. In such cases, the tab may be considered inactive.
