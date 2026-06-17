# Contributing

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Node-RED](https://nodered.org/) installed globally or locally
- `node-red-dashboard` 2.x installed in your Node-RED user directory

Install Node-RED and the dashboard if you haven't already:

```bash
npm install -g node-red
cd ~/.node-red
npm install node-red-dashboard
```

## Local development setup

> **Note on `npm link` and module resolution:** when a package is linked, Node.js
> resolves `require()` calls from the package's real directory, not from
> `~/.node-red/node_modules/`. The node loader in `rotator-widget.js` handles this
> by falling back to `~/.node-red/node_modules/node-red-dashboard` automatically,
> so no extra steps are needed — just make sure `node-red-dashboard` is installed
> in your Node-RED user directory (see Prerequisites above).

Clone the repo and link it into your Node-RED user directory so Node-RED picks up
changes without reinstalling:

```bash
git clone <repo-url>
cd node-red-contrib-rotator-widget

# Register the package globally so npm link can find it
npm link

# Link it into Node-RED's node_modules
cd ~/.node-red
npm link node-red-contrib-rotator-widget
```

After linking, any edits to the source files are reflected immediately on the
next Node-RED restart (server-side changes in `rotator-widget.js`) or on the
next browser reload (front-end changes in `rotator-widget.html`).

## Running Node-RED

```bash
node-red
```

Open the editor at <http://localhost:1880> and the dashboard at
<http://localhost:1880/ui>.

## Installing the widget in Node-RED

Once Node-RED is running with the linked package, the **rotator-widget** node
appears in the **dashboard** section of the node palette on the left.

1. Drag a `rotator-widget` node onto the canvas.
2. Double-click it to open the config panel.
3. Select (or create) a **Group** under a Dashboard tab.
4. Set **QTH** to your Maidenhead grid locator (4 or 6 characters, e.g. `FN31`).
5. Optionally set default **Current Az.** and **Target Az.** values.
6. Set **Size** — a square of at least 6×6 is recommended (the map needs room).
7. Click **Done**, then **Deploy**.
8. Open the dashboard at <http://localhost:1880/ui> to see the widget.

> **Note:** The widget fetches D3.js, topojson-client, and world map data from
> jsDelivr CDN on first load. The browser running the dashboard needs outbound
> internet access.

## Testing the widget manually

### Sending azimuth updates via Inject nodes

Wire an **inject** node to the `rotator-widget` input.

| Test | `msg` properties to set | Expected result |
|------|--------------------------|-----------------|
| Set current azimuth | `msg.payload = 90` (number) | Blue arrow points East |
| Set current explicitly | `msg.currentAzimuth = 180` | Blue arrow points South |
| Set target | `msg.targetAzimuth = 45` | Red arrow points NE |
| Aligned (≤ 5°) | `msg.currentAzimuth = 100`, `msg.targetAzimuth = 102` | Single black arrow, no red line |
| Misaligned (> 5°) | `msg.currentAzimuth = 0`, `msg.targetAzimuth = 90` | Blue (N) and red (E) arrows |

### Testing user interaction (click to set target)

Click anywhere inside the map circle. The widget should:

1. Immediately redraw the target azimuth line (red) pointing toward the click.
2. Emit a message on its output: `{ payload: <degrees>, topic: "targetAzimuth" }`.

Wire a **debug** node to the output to verify the emitted value.

### Quick test flow

Import this JSON into Node-RED (**Menu → Import**) for a ready-made test harness:

```json
[
  {
    "id": "inject-current",
    "type": "inject",
    "name": "Current 45°",
    "props": [{ "p": "currentAzimuth", "v": "45", "vt": "num" }],
    "wires": [["rotator-node"]]
  },
  {
    "id": "inject-target",
    "type": "inject",
    "name": "Target 270°",
    "props": [{ "p": "targetAzimuth", "v": "270", "vt": "num" }],
    "wires": [["rotator-node"]]
  },
  {
    "id": "rotator-node",
    "type": "rotator-widget",
    "name": "My Rotator",
    "qth": "FN31",
    "currentAzimuth": 0,
    "targetAzimuth": 0,
    "width": 6,
    "height": 6,
    "wires": [["debug-out"]]
  },
  {
    "id": "debug-out",
    "type": "debug",
    "name": "Rotator output",
    "active": true,
    "wires": []
  }
]
```

> The flow above omits `group` and `tab` IDs — assign a dashboard group after
> importing to make it appear on the dashboard.

## Reloading after edits

| What changed | How to reload |
|---|---|
| `rotator-widget.js` (server-side logic) | Restart Node-RED, then re-deploy |
| `rotator-widget.html` (editor UI or widget template) | Re-deploy in the editor, then hard-refresh the dashboard browser tab |
| Both | Restart Node-RED + hard-refresh |

Hard-refresh: **Cmd+Shift+R** (Mac) / **Ctrl+Shift+R** (Windows/Linux).
