# h2k_parse_callsign

Parses a ham radio callsign into its component parts using
[`@ham2k/lib-callsigns`](https://github.com/ham2k/ham-js-libs/tree/main/packages/lib-callsigns).

Part of the [`@ham2k/red-ham-toolkit`](../../README.md) package.

## Input

The node accepts three payload shapes:

| Payload | Behaviour |
|---------|-----------|
| `string` | Bare callsign (e.g. `"YV5/N0CALL/P"`). Parsed; result becomes the new payload. |
| `{ call }` | Object with a `call` property. Parsed fields are merged into the existing object. |
| `{ their, our }` | Object with `their` and/or `our` sub-objects each containing a `call` property. Both are parsed in place. |

## Output fields added to the callsign object

| Field | Example | Description |
|-------|---------|-------------|
| `call` | `"YV5/N0CALL/P"` | Original callsign as given |
| `baseCall` | `"N0CALL"` | Root callsign without prefix/suffix modifiers |
| `prefix` | `"YV5"` | Geographic prefix (may differ from the home prefix) |
| `indicator` | `"P"` | Suffix indicator (`P` = portable, `M` = mobile, `MM` = maritime, etc.) |
| `digit` | `"5"` | Numeric district digit extracted from the prefix |

The exact field set depends on the callsign structure and what `lib-callsigns` can determine.

## Typical wiring

```
[inject: "KI2D/P"]  →  [h2k_parse_callsign]  →  [h2k_annotate_callsign]  →  [debug]
```
