# DATA.md — provenance

Discipline #1 of the Civic Ladder: every figure on screen is stamped with how it
came to exist, in a checked-in file, not promised in a README.

| Class | Meaning |
|---|---|
| **MEASURED** | Read off an instrument or authoritative census. Not modelled. |
| **COMPUTED** | Deterministic arithmetic over measured inputs and sourced constants. |
| **MODELED** | Output of a model fit on measured data. *(Not used at rung 1.)* |
| **GENERATED** | Produced by a generative model. Illustrative; feeds no calculation. |

Rung 1 has **no computation on purpose**. The only non-MEASURED figure is
`fullness`, and it is one division.

---

## Source

**Bike Share Toronto**, published by the City of Toronto as a
[GBFS](https://gbfs.org) v3.0 feed. Open data, no API key.

- Discovery file: `https://toronto.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json`
- Verified live **2026-08-31**: 1063 stations, all required fields present.
- Feed URLs live in [`src/constants.ts`](src/constants.ts) — never inline in map code.

---

## The data contract

Everything downstream reads **this exact shape and nothing else**. That is what
lets fake data (Phase 2) be swapped for real data (Phase 4) without touching a
line of UI code.

This shape is enforced as TypeScript in [`src/types.ts`](src/types.ts) — that file
is the machine-checked copy, this section is the human one. Keep them in step.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-79.39614, 43.63971] },
      "properties": {
        "station_id": "7000",
        "name": "Fort York Blvd / Capreol Ct",
        "capacity": 47,
        "bikes_available": 1,
        "docks_available": 44,
        "fullness": 0.0213
      }
    }
  ]
}
```

`coordinates` is **`[lon, lat]` — longitude first.** GBFS gives `lat` and `lon` as
separate fields; swapping them puts every dock in the Gulf of Guinea.

### Field stamps

| Property | Class | Origin |
|---|---|---|
| `station_id` | **MEASURED** | `station_information[].station_id`. Join key to `station_status`. |
| `name` | **MEASURED** | `station_information[].name` — see *localized name* below. |
| `coordinates` | **MEASURED** | `[station_information[].lon, station_information[].lat]`. |
| `capacity` | **MEASURED** | `station_information[].capacity`. Total docks, not availability. |
| `bikes_available` | **MEASURED** | `station_status[].num_vehicles_available`. `null` if no status feed. |
| `docks_available` | **MEASURED** | `station_status[].num_docks_available`. `null` if no status feed. |
| `fullness` | **COMPUTED** | `bikes_available / capacity`. `null` when either input is missing or `capacity` is 0. |

`fullness` is precomputed in the transform, not in the map, so the styling
expression colors by one clean number.

### The committed census (Phase 4 onward)

`public/data/stations.geojson` now holds the **real Toronto network**: 1063 stations,
written by `scripts/build_stations.ts` (`npm run build:stations`) from a snapshot
taken **2026-08-31**. 1062 carry availability; 1 does not (station `8258`, capacity 0).

The script resolves its sub-feed URLs through the GBFS **discovery file** rather
than hardcoding them, so pointing `FEEDS.discovery` at another city's system is the
one-line change the rest of the pipeline follows.

It runs the *same* `assertStationCollection` the browser runs, before writing — one
definition of "valid", enforced at both ends of the pipe, so a bad transform can
never overwrite a good file.

**`station_status` is included in the snapshot.** The build plan sequences the
status join as a Phase 5 stretch, but the contract already declares
`bikes_available` / `docks_available` / `fullness` as MEASURED, and shipping the
census alone would leave every dot in the no-data state with the whole colour
channel dead. Snapshotting status once and committing it is what the plan
prescribes for offline anyway. What remains genuinely Phase 5 is the *live*
re-fetch in the browser, with this snapshot as the fallback.

Run `npm run build:stations -- --no-status` for the strict census-only file.

### Live availability (Phase 5)

`src/live.ts` polls `station_status` in the browser every 60s and folds the result
over the loaded census, rebuilding features rather than mutating them so the
snapshot survives intact as a fallback.

**The snapshot is the load-bearing path; live is an enhancement laid over it.** A
failed, slow, or blocked fetch is a silent no-op — the map keeps showing the
snapshot and never throws. That ordering is the point: a live fetch must never be
the reason a demo has no data.

The masthead caption says which you are looking at, because a number on screen
should say whether it is current:

| Caption | Meaning |
|---|---|
| `Live · 13:35` | The status feed answered; figures are current as of that clock time. |
| `Snapshot · Aug 31` | Feed unreachable. Figures are from `generated_at` in the committed file. |

The census carries `generated_at` (ISO 8601) as a GeoJSON foreign member for
exactly this — without it the panel would report a months-stale count as though it
were current.

Live updates start only if the basemap probe found the network at load. Coming back
online mid-session does not start them; reload for that.

### During development (Phases 2–3)

`public/data/stations.geojson` holds **50 generated stations**, contract-shaped,
written by `scripts/generate_fake_stations.ts` (`npm run generate:fake`).

> Every property in the dev file is **GENERATED** — placeholder, feeds nothing,
> and is overwritten wholesale in Phase 4. The header comment in the generator
> says so, and this note is the checked-in record of it.

Two deliberate choices in the generator:

- **Coordinates are gaussian around downtown, not uniform over the bbox.** Real
  dock networks are dense in the core, and clustering (Phase 3) needs something
  interesting to cluster. A side effect is that a handful of placeholders land in
  Lake Ontario — cosmetic, and gone in Phase 4.
- **Station `fake-000` is given `capacity: 0`,** mirroring the real feed, so the
  `fullness` divide-by-zero guard is exercised from Phase 2 rather than
  discovered in Phase 4.

The seed is fixed (`SEED = 20260831`), so regenerating produces a byte-identical
file and an empty git diff.

---

## Feed schema notes (read before writing the Phase 4 transform)

The build plan's pseudocode uses GBFS **v1** field names. The live v3.0 feed
differs in two places that will silently produce `undefined` if you trust the
older names:

1. **`name` is a localized array, not a string.** v3 returns
   `[{ "text": "Fort York Blvd / Capreol Ct", "language": "en" }, …]` with one
   entry per language. Take the `en` entry, falling back to the first:
   `(s.name.find(n => n.language === 'en') ?? s.name[0]).text`
2. **Bikes available is `num_vehicles_available`, not `num_bikes_available`.**
   v3 generalized "bike" to "vehicle". `num_docks_available` is unchanged.

Other v3 fields present but unused at rung 1: `external_id`, `short_name`,
`address`, `is_charging_station`, `is_virtual_station`, `rental_methods`,
`rental_uris`, `vehicle_types_capacity`, `vehicle_docks_capacity`.

### Validation at the boundary

`src/types.ts` is compile-time only; `stations.geojson` arrives over the network at
runtime, so `loadStations()` in `src/stations.ts` re-checks it and fails loudly,
naming the offending feature, rather than rendering something wrong.

**The lon/lat swap needs a bounds check, not a range check.** This is worth stating
plainly because the obvious validation does not work: swap Toronto's
`[-79.38, 43.65]` and you get `[43.65, -79.38]` — a legal longitude and a legal
latitude, both inside `[-180, 180]` and `[-90, 90]`. Nothing is out of range; the
point is simply 5000 km into the South Atlantic. The only check that catches it is
one against where the city actually is, which is why `CITY.bboxMarginDegrees`
exists.

### Known data hazards

- **One station has `capacity: 0`** (of 1063, as of 2026-08-31). Guard the
  division: `capacity ? bikes / capacity : null`, and let the map leave `null`
  uncolored rather than rendering `Infinity`.
- **Real bbox**, computed from all 1063 stations and recorded in
  `src/constants.ts → CITY.bbox`:
  lat `43.5881`–`43.8126`, lon `-79.6035`–`-79.1232`.

---

## Encoding

| Channel | Encodes | Notes |
|---|---|---|
| Dot **colour** | `fullness` | Sequential, one hue, light → dark. More ink = more bikes. |
| Dot **size** | `capacity` | Independent of colour, so the two readings never conflict. |
| **Hollow** dot | `fullness` is `null` | A different *kind* of value, so a different shape — not a fourth colour. |
| Cluster **size** | `point_count` | Neutral ink, never a step on the fullness ramp. |

**The ramp is blue, not green→red.** The build plan suggests green = bikes
available → red = empty. That is the single worst pairing for red-green colour
blindness (~8% of men), and it is a *diverging* structure used where the data is
*sequential* — fullness is a magnitude, not a polarity. A one-hue ramp reads just
as fast and works for everyone.

Steps are `#3987e5 → #1c5cab → #0d366b`, monotonic in OKLCH lightness
(0.62 → 0.48 → 0.34) and each clearing 3:1 against the basemap, so no dot ever
fades into the map. Colour is never the only channel: the panel prints the exact
numbers and the legend labels both ends.

Kept in two places — `FULLNESS_RAMP` in `src/layers.ts` and the `--fullness-*`
tokens in `src/styles.css` — so the legend swatches cannot drift from the dots.

## Camera bounds

After the landing, the camera is fenced to the dock bbox plus
`CITY.panMarginDegrees` (0.02°, ~2 km). Two limits, both derived from that one
box so they cannot disagree:

- **`maxBounds`** keeps the *viewport* inside the fence — not just the centre, so
  you can never drag the map off the data.
- **A zoom floor** from `cameraForBounds`, recomputed on resize. `maxBounds` alone
  does not stop you zooming out until Lake Erie fills the frame, and the zoom that
  fits the service area on a desktop leaves half of it off-screen on a phone.

The margin is deliberately tight. The bbox's south edge is a single island dock
with open lake below it, so every extra degree of slack buys another screenful of
empty water — at 0.05° the southern limit was a view with no docks in it at all.
Measured at 0.02°: every extreme of the fence keeps 47–95 docks in view.

This fences the Bike Share **service area**, which is smaller than the GTA proper.
The bounds are the docks themselves, so the map goes exactly where there is data.

## Renders with the wifi off (discipline #3)

| Asset | Committed? | Notes |
|---|---|---|
| Offline basemap style + glyphs | **Yes** | `public/basemap/` — a flat ground plus one vendored glyph atlas. Used automatically when CARTO is unreachable. |
| `public/data/stations.geojson` | Yes | Fetched once, offline, by `scripts/build_stations.ts`. The browser never calls the GBFS feed. |
| Status snapshot (Phase 5) | Yes, when added | Live re-fetch is an *enhancement* with the snapshot as fallback — never the load-bearing path. |
| MapLibre GL JS + CSS | **Yes** | Pinned to `6.6.0` in `package.json` and bundled into `dist/` by Vite. No CDN at runtime. |
| Basemap tiles | **No** — CARTO CDN | Keyless and network-fetched, but no longer load-bearing: if they fail, the local style takes over. |

**Closed in Phase 4.** Verified by loading the built site with every off-origin
request aborted: all 1063 docks, clustering, cluster counts, colour, and the click
panel work with the network down. The only thing lost is the street basemap, and
the page says so rather than showing an empty rectangle.

The fix has two parts. `resolveStyle()` in `src/map.ts` probes the CARTO style with
a short timeout and falls back to `public/basemap/style.json`; without that probe
MapLibre never fires `load`, no layers are ever added, and the map renders blank
even though every byte of data is already local. And the cluster-count glyphs are
vendored under `public/basemap/fonts/`, because a symbol layer with no reachable
glyph endpoint silently drops its text.

Glyph atlas is Montserrat (SIL OFL 1.1) and Open Sans (Apache 2.0), rendered by the
CARTO glyph server.
