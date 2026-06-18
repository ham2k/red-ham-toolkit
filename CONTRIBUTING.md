# Contributing

This is the `@ham2k/red-ham-tools` package, which hosts multiple Node-RED Dashboard nodes
under `nodes/`. This document covers package-wide setup and the development workflow. For
node-specific usage and testing, see each node's `README.md` (e.g.
[`nodes/h2k-rotator/README.md`](nodes/h2k-rotator/README.md)).

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
> `~/.node-red/node_modules/`. The node loaders handle this by falling back to
> `~/.node-red/node_modules/node-red-dashboard` automatically, so no extra steps are
> needed — just make sure `node-red-dashboard` is installed in your Node-RED user
> directory (see Prerequisites above).

Clone the repo and link it into your Node-RED user directory so Node-RED picks up
changes without reinstalling:

```bash
git clone <repo-url>
cd red-ham-tools

# Register the package globally so npm link can find it
npm link

# Link it into Node-RED's node_modules
cd ~/.node-red
npm link @ham2k/red-ham-tools
```

After linking, edits to the source files are picked up the next time Node-RED is
restarted (see below).

## Running Node-RED

```bash
node-red
```

Open the editor at <http://localhost:1880> and the dashboard at
<http://localhost:1880/ui>.

### Restarting after edits

Node-RED loads node editor HTML (`registerType` / `oneditprepare`) at **startup** and
bundles it, so edits to a node's `*.html` are **not** picked up by a browser reload —
Node-RED must be restarted. The same applies to server-side `*.js` changes. Use the
helper script:

```bash
dev-tools/restart-node-red.sh
```

It stops any instance listening on the dashboard port, relaunches it detached, and waits
until it is serving again. Override the port or log path with environment variables:

```bash
PORT=1881 dev-tools/restart-node-red.sh
LOG=/tmp/my-node-red.log dev-tools/restart-node-red.sh
```

After it returns, hard-refresh the editor and dashboard browser tabs
(**Cmd+Shift+R** / **Ctrl+Shift+R**).

| What changed | How to reload |
|---|---|
| A node's server-side `*.js` | Restart Node-RED (`dev-tools/restart-node-red.sh`), then re-deploy |
| A node's editor/widget `*.html` | Restart Node-RED (`dev-tools/restart-node-red.sh`), then hard-refresh |
| Both | Restart Node-RED + hard-refresh |

## Working on a specific node

Each node is self-contained under `nodes/<node-type>/`. For how to install, configure, and
manually test a node, see its `README.md`:

- [`nodes/h2k-rotator/README.md`](nodes/h2k-rotator/README.md) — H2K Rotator widget

To add a new node, see the "Adding a new node" section in [CLAUDE.md](CLAUDE.md).
