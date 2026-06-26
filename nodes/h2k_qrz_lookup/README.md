# `h2k_qrz_lookup` — QRZ.com Callsign Lookup

Looks up a ham radio callsign on [QRZ.com](https://qrz.com) and returns detailed station data.

Requires a [QRZ XML subscription](https://www.qrz.com/page/xml_data.html).

---

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| **QRZ Login** | — | Your QRZ.com username |
| **Password** | — | Your QRZ.com password (stored encrypted) |

Session keys are cached in memory and refreshed automatically on expiry.

---

## Input

Send a message with:

- `msg.payload` = callsign string, e.g. `"KI2D"`
- `msg.payload` = object with a `call` property, e.g. `{ call: "KI2D", ... }`

When the payload is an object, the QRZ data is **merged** into it and the enriched object is forwarded.

---

## Output

When found, `msg.payload` contains:

| Field | Type | Description |
|-------|------|-------------|
| `call` | string | Callsign as registered |
| `name` | string | Full display name, e.g. `Sebastian "Baz" Delmont` |
| `firstName` | string | Given name |
| `lastName` | string | Surname |
| `allCalls` | string[] | Primary call + any aliases / cross-references |
| `city` | string | City |
| `state` | string | State/province |
| `country` | string | Country |
| `postal` | string | Postal / ZIP code |
| `county` | string | County |
| `grid` | string | Maidenhead grid locator |
| `lat` | number | Latitude |
| `lon` | number | Longitude |
| `cqZone` | number | CQ zone |
| `ituZone` | number | ITU zone |
| `dxccCode` | number | DXCC entity code |
| `tz` | string | Timezone name |
| `gmtOffset` | number | UTC offset (hours) |
| `image` | string | Profile picture URL |
| `imageInfo` | string[] | `[width, height, bytes]` |

If the callsign is **not found**, `null` is sent (no message is forwarded downstream).

---

## Node status

| Indicator | Meaning |
|-----------|---------|
| Yellow ring | Lookup in progress |
| Green dot | Successful lookup — shows call and name |
| Grey dot | Callsign not found in QRZ database |
| Red ring | Error — bad credentials, network failure, or QRZ API error |
