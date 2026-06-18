#!/usr/bin/env bash
#
# Start or restart Node-RED for local development of this package.
#
# Node-RED loads node editor HTML (registerType / oneditprepare) at startup
# and bundles it, so edits to *.html are NOT picked up by a browser reload —
# Node-RED must be restarted. This script stops any instance listening on the
# dashboard port, relaunches it detached, and waits until it is serving again.
#
# Usage:
#   dev-tools/restart-node-red.sh          # restart (or start) Node-RED
#   PORT=1881 dev-tools/restart-node-red.sh # use a different port
#
# After it returns, hard-refresh the editor and dashboard browser tabs.

set -euo pipefail

PORT="${PORT:-1880}"
LOG="${LOG:-/tmp/node-red-h2k.log}"

echo "→ Looking for Node-RED on port ${PORT}…"
PID="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"

if [[ -n "${PID}" ]]; then
    echo "→ Stopping existing Node-RED (pid ${PID})…"
    kill "${PID}" 2>/dev/null || true
    # Wait up to ~10s for the port to free up
    for _ in $(seq 1 20); do
        sleep 0.5
        if [[ -z "$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)" ]]; then
            break
        fi
    done
fi

echo "→ Starting Node-RED (logging to ${LOG})…"
nohup node-red > "${LOG}" 2>&1 &
disown || true

# Wait up to ~30s for it to start serving
echo "→ Waiting for Node-RED to come up…"
for _ in $(seq 1 60); do
    sleep 0.5
    NEW_PID="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
    if [[ -n "${NEW_PID}" ]]; then
        echo "✓ Node-RED running (pid ${NEW_PID}) at http://127.0.0.1:${PORT}/"
        echo "  Editor:    http://127.0.0.1:${PORT}/"
        echo "  Dashboard: http://127.0.0.1:${PORT}/ui/"
        echo "  Logs:      ${LOG}"
        echo "  Remember to hard-refresh your browser tabs (Cmd+Shift+R)."
        exit 0
    fi
done

echo "✗ Node-RED did not come up within the timeout. Check ${LOG}:" >&2
tail -n 20 "${LOG}" >&2 || true
exit 1
