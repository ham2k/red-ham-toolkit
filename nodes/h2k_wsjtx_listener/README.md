# h2k_wsjtx_listener

Bidirectional UDP bridge for [WSJT-X](https://wsjt.sourceforge.io/wsjtx.html). Receives decoded
spots, status updates, and QSO events from WSJT-X and can send commands (halt TX, reply to a
decode, free text, highlight callsign) back to it.

## Setup

In WSJT-X go to **File → Settings → Reporting** and set:

- **UDP Server** — the address this node will listen on (see [Choosing an address](#choosing-an-address) below)
- **UDP Server port** — must match the node's **UDP Port** field (default `2237`)
- **Accept UDP requests** — must be checked to allow incoming commands

Set the node's **Host** field to the same address you entered in WSJT-X.

## Choosing an address

| Address | When to use |
|---------|-------------|
| `127.0.0.1` | WSJT-X and Node-RED on the same machine, **and** no other apps need to listen simultaneously. With a unicast address the OS delivers each datagram to only one listener. |
| Machine's LAN IP (e.g. `10.0.0.5`) | Node-RED on a different machine from WSJT-X. Same unicast limitation — only one app receives. |
| **Multicast group** (e.g. `239.239.0.2`) | **Recommended when multiple apps listen at the same time** (Log4OM, GridTracker, JS8Call, etc.). Every app that joins the group receives every datagram. |

### Multicast groups

Any address in the range `224.0.0.0`–`239.255.255.255` is a multicast address. The node
detects this automatically and calls `addMembership()` on the socket, so no extra configuration
is needed beyond setting **Host** to the group address.

The `239.x.x.x` block (administratively scoped) is the conventional choice for local private use
— it stays within your LAN and won't leak to the wider internet. `239.239.0.2` is a common
convention in the ham radio software world; use whatever group the other apps on your machine
are already configured for, so they all share the same stream.

## Outputs

Each received WSJT-X datagram produces one `msg`. `msg.topic` identifies the type;
`msg.payload` contains the parsed fields.

| `msg.topic` | Description | Key payload fields |
|-------------|-------------|-------------------|
| `heartbeat` | Periodic keep-alive (every ~15 s) | `id`, `maxSchemaNumber`, `version`, `revision` |
| `status` | Current rig/mode state | `id`, `dialFrequency` (Hz), `mode`, `deCall`, `deGrid`, `dxCall`, `dxGrid`, `txEnabled`, `transmitting`, `decoding`, `rxDF`, `txDF`, `txWatchdog`, `subMode`, `fastMode`, `specialMode`, `configName`, `txMessage` |
| `decode` | New FT8/FT4/JT65/… spot | `id`, `new`, `time` ("HH:MM:SS" UTC), `snr`, `deltaTime` (s), `deltaFreq` (Hz), `mode`, `message`, `lowConfidence`, `offAir` |
| `clear` | Decode list cleared | `id`, `window` |
| `qso_logged` | QSO saved to log | `id`, `timeOn`, `timeOff` (ISO 8601), `dxCall`, `dxGrid`, `txFrequency`, `mode`, `reportSent`, `reportReceived`, `txPower`, `comments`, `name`, `myCall`, `myGrid`, `operatorCall`, `exchangeSent`, `exchangeReceived`, `adifPropMode` |
| `close` | WSJT-X shutting down | `id` |
| `wspr_decode` | WSPR spot | `id`, `new`, `time`, `snr`, `deltaTime`, `frequency` (Hz), `drift`, `callsign`, `grid`, `power` (dBm), `offAir` |
| `logged_adif` | Raw ADIF for a logged QSO | `id`, `adif` |

## Inputs

Send a `msg` to the node to issue a command to WSJT-X. `msg.topic` selects the command.

| `msg.topic` | Description | `msg.payload` fields |
|-------------|-------------|----------------------|
| `halt_tx` | Stop transmitting | `autoOnly` (bool, default `false`) — if `true`, only stop when the watchdog triggered |
| `reply` | Reply to a specific decode | A `decode` payload object (or compatible object with `time`, `snr`, `deltaTime`, `deltaFreq`, `mode`, `message`, `lowConfidence`) |
| `free_text` | Set the free-text message | `text` (string), `send` (bool, default `false`) — set `send: true` to also start transmitting immediately |
| `highlight_callsign` | Highlight a callsign in the decode list | `callsign`, `backgroundColor`, `foregroundColor` (optional hex strings); set `reset: true` to clear highlights |

## Node status

| Colour | Shape | Meaning |
|--------|-------|---------|
| Grey | Ring | Initializing |
| Yellow | Ring | Socket bound, waiting for first message |
| Green | Dot | Receiving — shows last message type and WSJT-X instance ID |
| Red | Ring | Socket error |
