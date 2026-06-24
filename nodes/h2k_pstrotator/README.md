# h2k_pstrotator

Controls a [PstRotator](https://pstrotator.com) instance via its UDP API.

## PstRotator setup

In PstRotator: go to **Communication → UDP Control Port**, set the port number (default **12000**), and enable **UDP Control** in Setup. The node sends commands to that port and listens for responses on **port + 1** (default 12001).

## Node configuration

| Field | Default | Description |
|-------|---------|-------------|
| Host | `127.0.0.1` | IP address or hostname of the machine running PstRotator |
| UDP Port | `12000` | Port PstRotator listens on (responses arrive on port+1) |
| Poll interval | `1000` ms | How often to query azimuth; `0` disables auto-polling |
| Poll elevation | off | Also query elevation on each poll (az+el rigs only) |

## Inputs

| `msg.topic` | `msg.payload` | Description |
|-------------|---------------|-------------|
| `"azimuth"` | number (0–360) | Rotate to this azimuth |
| `"elevation"` | number (−90–90) | Set elevation (az+el rigs) |
| `"stop"` | — | Stop rotor, switch to manual |
| `"park"` | — | Stop rotor and park |
| `"track"` | `true`/`1` or `false`/`0` | Enable or disable tracking mode |
| `"command"` | string | Raw `<PST>…</PST>` command (pass-through) |
| *(none)* | number | Bare numeric payload treated as azimuth |

## Outputs

| `msg.topic` | `msg.payload` | Description |
|-------------|---------------|-------------|
| `"currentAzimuth"` | number | Current rotor azimuth in degrees |
| `"currentElevation"` | number | Current elevation in degrees (az+el only) |
| `"mode"` | `"tracking"` \| `"manual"` | Current tracking mode |
| `"ack"` | string | Acknowledgement for commands with an `OK:…` response |

## Typical wiring

```
[inject: azimuth=180] → [h2k_pstrotator] → [ui_h2k_rotator]
```

The `currentAzimuth` output feeds naturally into the rotator widget's `currentAzimuth` input. Clicking the widget emits `{ topic: "targetAzimuth", payload: N }` — wire that back through a `change` node (rename topic to `"azimuth"`) and into this node to close the loop.
