# node-red-contrib-rotator-widget

A Node-RED Dashboard 1.0 widget for controlling and visualising antenna rotators.

## Goals

Display an azimuthal equidistant world map centred on the operator's QTH, with directional
indicators for the current and target azimuths of the antenna rotator.

## Widget parameters (node config)

| Parameter | Description |
|-----------|-------------|
| **QTH** | 4- or 6-character Maidenhead grid locator (e.g. `FN31` or `FN31pr`) — sets the map centre |
| **Current Azimuth** | Default current azimuth in degrees (0–359); overridden at runtime via `msg` |
| **Target Azimuth** | Default target azimuth in degrees (0–359); overridden at runtime via `msg` or user click |

## Inputs / Outputs

**Inputs** (Node-RED messages flowing in):
- `msg.payload` *(number)* — current azimuth in degrees (shorthand convention)
- `msg.currentAzimuth` *(number)* — current azimuth in degrees
- `msg.targetAzimuth` *(number)* — target azimuth in degrees

**Outputs** (emitted when user clicks the map):
- `msg.payload` *(number)* — selected target azimuth in degrees
- `msg.topic` — `"targetAzimuth"`

## Display logic

- **Misaligned (> 5° difference):** current azimuth shown in blue, target in red.
- **Aligned (≤ 5° difference):** single black indicator; target line hidden.
- A small HUD overlay (top-left of the map) always shows numeric azimuth values.

## Technical notes

- Targets **node-red-dashboard 1.0** (`node-red-dashboard` npm package; Dashboard 2.0 / `@flowfuse/node-red-dashboard` is out of scope for now).
- The map is rendered with **D3.js v7** (`geoAzimuthalEquidistant` projection) + **topojson-client v3** + **world-atlas 110m**, all loaded from jsDelivr CDN at first render. An internet connection is required on the browser side.
- The azimuth lines are straight radial lines from the map centre — correct because azimuthal equidistant projections preserve true bearings from the centre point.
- Maidenhead-to-lat/lon conversion is implemented inline in the browser controller (no external library needed).

## Future ideas (not yet implemented)

- Accept a remote grid locator (`msg.dxGrid`) and auto-compute + overlay the beam heading to that station.
- Bundle the world map data locally to remove the CDN dependency.
- Support Dashboard 2.0 (`@flowfuse/node-red-dashboard`).
- Redraw on widget resize (ResizeObserver).
