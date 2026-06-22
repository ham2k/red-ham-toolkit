# @ham2k/red-ham-toolkit

A collection of ham-radio tools (nodes/widgets) for Node-RED Dashboard.

The package is designed to host **multiple** nodes. Each node lives in its own folder under
`nodes/` and is registered independently in `package.json`.

## Nodes

| Node type | Folder | Description |
|-----------|--------|-------------|
| `h2k-rotator-widget-1` | [`nodes/h2k-rotator-widget-1/`](nodes/h2k-rotator-widget-1/README.md) | Antenna rotator widget: azimuthal-equidistant world map with current/target azimuth indicators |
| `h2k-pstrotator` | [`nodes/h2k-pstrotator/`](nodes/h2k-pstrotator/README.md) | PstRotator UDP bridge: send commands and receive position reports via UDP |

See each node's `README.md` for its parameters, inputs/outputs, behaviour, and node-specific
notes.

## Repository layout

```
package.json                       node-red.nodes map (one entry per node)
assets/                            shared static assets (e.g. ham2k-square.svg)
dev-tools/                         local development helpers
  restart-node-red.sh              stop + relaunch Node-RED
nodes/
  h2k-rotator-widget-1/
    h2k-rotator-widget-1.js                 server-side node + serialised browser controller
    h2k-rotator-widget-1.html              editor config panel + help
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
