# Ham2K's RED Ham Toolkit

`@ham2k/red-ham-toolkit` — a collection of free and open-source Ham Radio nodes and widgets
for [Node-RED](https://nodered.org/), by Sebastián Delmont KI2D. 

Visit https://github.com/ham2k/red-ham-toolkit for more details.

<p align="center">
  <img src="assets/h2k-rotator-widget-1-screenshot.png" alt="H2K Rotator widget" width="420">
</p>

## Nodes

| Node | Description |
|------|-------------|
| [**ui_h2k_rotator**](nodes/ui_h2k_rotator/README.md) | Dashboard widget: azimuthal-equidistant world map with live current/target azimuth indicators. Click to set heading, drive from rig/rotator via messages. |
| [**h2k_pstrotator**](nodes/h2k_pstrotator/README.md) | PstRotator UDP bridge: poll azimuth/elevation, send rotate/stop/park/track commands. |
| [**h2k_parse_callsign**](nodes/h2k_parse_callsign/README.md) | Parse a ham radio callsign into its component parts (base call, prefix, district digit, indicator). |
| [**h2k_annotate_callsign**](nodes/h2k_annotate_callsign/README.md) | Annotate a callsign with DXCC entity data (country, CQ zone, ITU zone, continent); auto-parses if needed. |
| [**h2k_wsjtx_listener**](nodes/h2k_wsjtx_listener/README.md) | WSJT-X UDP bridge: receive decoded spots, status and QSO events; send halt/reply/free-text commands. Supports unicast and multicast (e.g. `239.239.0.2`). |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup and the reload workflow.

## Support

If you find this useful, please consider supporting our work:

<a href="https://buymeacoffee.com/ham2k" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="48">
</a>

## License

MIT
