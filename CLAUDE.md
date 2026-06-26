# @ham2k/red-ham-toolkit

A collection of ham-radio tools (nodes/widgets) for Node-RED Dashboard.

The package is designed to host **multiple** nodes. Each node lives in its own folder under
`nodes/` and is registered independently in `package.json`.

## Nodes

| Node type | Folder | Description |
|-----------|--------|-------------|
| `ui_h2k_rotator` | [`nodes/ui_h2k_rotator/`](nodes/ui_h2k_rotator/README.md) | Antenna rotator widget: azimuthal-equidistant world map with current/target azimuth indicators |
| `h2k_pstrotator` | [`nodes/h2k_pstrotator/`](nodes/h2k_pstrotator/README.md) | PstRotator UDP bridge: send commands and receive position reports via UDP |
| `h2k_parse_callsign` | [`nodes/h2k_parse_callsign/`](nodes/h2k_parse_callsign/README.md) | Parse a ham radio callsign into its component parts (prefix, digit, indicators, etc.) |
| `h2k_annotate_callsign` | [`nodes/h2k_annotate_callsign/`](nodes/h2k_annotate_callsign/README.md) | Annotate a callsign with DXCC entity data (country, CQ zone, ITU zone, continent); auto-parses if needed |
| `h2k_wsjtx_listener` | [`nodes/h2k_wsjtx_listener/`](nodes/h2k_wsjtx_listener/README.md) | WSJT-X UDP bridge: receive decoded spots, status and QSO events; send halt/reply/free-text commands |
| `h2k_qrz_lookup` | [`nodes/h2k_qrz_lookup/`](nodes/h2k_qrz_lookup/README.md) | QRZ.com XML API lookup: fetch detailed callsign data (name, address, grid, DXCC, zones, image) |

See each node's `README.md` for its parameters, inputs/outputs, behaviour, and node-specific
notes.

## Repository layout

```
package.json                       node-red.nodes map (one entry per node)
assets/                            shared static assets (e.g. ham2k-square.svg)
dev-tools/                         local development helpers
  restart-node-red.sh              stop + relaunch Node-RED
nodes/
  ui_h2k_rotator/
    ui_h2k_rotator.js                      server-side node + serialised browser controller
    ui_h2k_rotator.html                    editor config panel + help
    README.md                      node documentation
    data/                          per-node local data overrides (optional)
```

## Adding a new node

1. Create `nodes/<node-type>/<node-type>.{js,html}`.
2. Add it to the `node-red.nodes` map in `package.json`.
3. Add a `nodes/<node-type>/README.md` documenting it, and list it in the table above.
4. Serve any per-node HTTP routes/assets under a `/<node-type>/…` path prefix.

## Development

- **Node-RED bundles the editor HTML at startup**, so edits to a node's `*.html` (and its
  server-side `*.js`) are NOT picked up by a browser reload — Node-RED must be restarted. Run
  `dev-tools/restart-node-red.sh` to stop and relaunch it, then hard-refresh the browser tabs.
  Override the port/log with `PORT=` / `LOG=` env vars.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for setup (`npm link`), running Node-RED, and the
  reload workflow.
