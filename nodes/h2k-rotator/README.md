# h2k-rotator

A Node-RED Dashboard 1.0 widget for controlling and visualising antenna rotators.

Part of the [`@ham2k/red-ham-tools`](../../README.md) package.

## Goals

Display an azimuthal equidistant world map centred on the operator's QTH, with directional
indicators for the current and target azimuths of the antenna rotator.

## Widget parameters (node config)

| Parameter | Description |
|-----------|-------------|
| **QTH** | 4- or 6-character Maidenhead grid locator (e.g. `FN31` or `FN31pr`) — sets the map centre |
| **Current Azimuth** | Default current azimuth in degrees (0–359); overridden at runtime via `msg` |
| **Target Azimuth** | Default target azimuth in degrees (0–359); overridden at runtime via `msg` or user click |
| **DX Grid** | Maidenhead grid of a DX station; shows a coloured dot at that position (overridable via `msg`) |
| **Beam width** | Beamwidth in degrees of the wedge drawn around the current azimuth (0 hides it) |
| **Colors & Styles** | Per-element colours and opacities (azimuth lines, HUD, map, graticule); collapsed by default |
| **Advanced Settings** | Default zoom, show/hide the Ham2K logo, show/hide the grayline; collapsed by default |

## Inputs / Outputs

**Inputs** (Node-RED messages flowing in):
- `msg.payload` *(number)* — current azimuth in degrees (shorthand convention)
- `msg.currentAzimuth` *(number)* — current azimuth in degrees
- `msg.targetAzimuth` *(number)* — target azimuth in degrees
- `msg.dxGrid` *(string)* — Maidenhead grid of a DX station to mark (empty string clears it)
- `{ topic, payload }` — `topic` of `"currentAzimuth"`/`"targetAzimuth"` (number) or `"dxGrid"` (string)

**Outputs** (emitted whenever the target azimuth changes — by map click or by an incoming
message that changes it; value-change only, so wiring the output back to the input won't loop):
- `msg.payload` *(number)* — the new target azimuth in degrees
- `msg.topic` — `"targetAzimuth"`

## Display logic

- **Misaligned:** current azimuth shown in the "current" colour, target in the "target" colour,
  with a black arrow between them in the HUD.
- **Aligned:** once within 3° (immediately if within 0.1°, otherwise after 5 s), a single
  indicator is shown in the "aligned" colour and the target line is hidden.
- A small HUD overlay (top-left) shows numeric azimuth values, e.g. `45° ➜ 90°`.
- An optional **grayline** layer shades the night hemisphere at 20% gray, tracking UTC time.

## Interaction

- **Click** inside the map circle to set the target azimuth (emits on the output).
- **Drag** (away from the centre) or **scroll** to zoom; a reset button appears top-right.
- The Ham2K logo sits bottom-right (toggleable; shrinks on widgets smaller than 4×4).

## Technical notes

- Targets **node-red-dashboard 1.0** (`node-red-dashboard` npm package; Dashboard 2.0 /
  `@flowfuse/node-red-dashboard` is out of scope for now).
- The map is rendered with **D3.js v7** (`geoAzimuthalEquidistant` projection) +
  **topojson-client v3** + **world-atlas 110m**, all loaded from jsDelivr CDN at first render.
  An internet connection is required on the browser side.
- Admin-1 boundaries (US/CAN/AUS) are proxied/cached server-side from Natural Earth 50m via
  `/h2k-rotator/admin1.geojson`.
- The azimuth lines are straight radial lines from the map centre — correct because azimuthal
  equidistant projections preserve true bearings from the centre point.
- Maidenhead-to-lat/lon conversion is implemented inline in the browser controller (no external
  library needed).
- The grayline night region is a 90°-radius `d3.geoCircle` centred on the antipode of the
  sub-solar point, computed from UTC (a simple approximation, no equation-of-time correction).

## Installing the widget

Once Node-RED is running with the package linked (see the package
[CONTRIBUTING](../../CONTRIBUTING.md)), the **H2K Rotator** node appears in the **dashboard**
section of the node palette.

1. Drag an `h2k-rotator` node onto the canvas.
2. Double-click it to open the config panel.
3. Select (or create) a **Group** under a Dashboard tab.
4. Set **QTH** to your Maidenhead grid locator (4 or 6 characters, e.g. `FN31`).
5. Optionally set default **Current Az.** and **Target Az.** values.
6. Set **Size** — a square of at least 6×6 is recommended (the map needs room). To go wider
   than 6, widen the containing dashboard **group** first.
7. Click **Done**, then **Deploy**.
8. Open the dashboard at <http://localhost:1880/ui> to see the widget.

> **Note:** The widget fetches D3.js, topojson-client, and world map data from jsDelivr CDN on
> first load. The browser running the dashboard needs outbound internet access.

## Testing manually

### Sending azimuth updates via Inject nodes

Wire an **inject** node to the `h2k-rotator` input.

| Test | `msg` properties to set | Expected result |
|------|--------------------------|-----------------|
| Set current azimuth | `msg.payload = 90` (number) | Current arrow points East |
| Set current explicitly | `msg.currentAzimuth = 180` | Current arrow points South |
| Set target | `msg.targetAzimuth = 45` | Target arrow points NE |
| Aligned | `msg.currentAzimuth = 100`, `msg.targetAzimuth = 102` | Single aligned arrow, no target line |
| Misaligned | `msg.currentAzimuth = 0`, `msg.targetAzimuth = 90` | Two arrows (N and E) |

### Testing user interaction (click to set target)

Click anywhere inside the map circle. The widget should:

1. Immediately redraw the target azimuth line pointing toward the click.
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
    "type": "h2k-rotator",
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

> The flow above omits `group` and `tab` IDs — assign a dashboard group after importing to make
> it appear on the dashboard.

## Future ideas (not yet implemented)

- Accept a remote grid locator (`msg.dxGrid`) and auto-compute + overlay the beam heading to that station.
- Bundle the world map data locally to remove the CDN dependency.
- Support Dashboard 2.0 (`@flowfuse/node-red-dashboard`).
- Redraw on widget resize (ResizeObserver).
