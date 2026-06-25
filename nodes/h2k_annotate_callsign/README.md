# h2k_annotate_callsign

Annotates a ham radio callsign with DXCC entity data (country, CQ zone, ITU zone, continent)
using [`@ham2k/lib-country-files`](https://github.com/ham2k/ham-js-libs/tree/main/packages/lib-country-files).
If the payload does not already contain a parsed callsign (i.e. no `baseCall` field), parsing
is performed automatically first.

Part of the [`@ham2k/red-ham-toolkit`](../../README.md) package.

## Input

The node accepts three payload shapes:

| Payload | Behaviour |
|---------|-----------|
| `string` | Bare callsign (e.g. `"KI2D"` or `"YV5/N0CALL/P"`). Parsed then annotated; result becomes the new payload. |
| `{ call }` | Object with a `call` property. Parsed if `baseCall` is absent, then DXCC fields are merged in. |
| `{ their, our }` | Object with `their` and/or `our` sub-objects each containing a `call` property. Both are annotated in place. |

## Output fields added to the callsign object

| Field | Example | Description |
|-------|---------|-------------|
| `entityPrefix` | `"K"` | DXCC entity prefix |
| `entityName` | `"United States"` | DXCC entity name |
| `dxccCode` | `291` | ARRL DXCC entity number |
| `continent` | `"NA"` | Two-letter continent code (`NA`, `EU`, `AS`, `AF`, `OC`, `SA`) |
| `cqZone` | `5` | CQ zone number |
| `ituZone` | `8` | ITU zone number |

## Typical wiring

```
[inject: "DL1ABC"]  →  [h2k_annotate_callsign]  →  [debug]
```

The node can be placed after `h2k_parse_callsign`, or used standalone — it will auto-parse
if needed.
