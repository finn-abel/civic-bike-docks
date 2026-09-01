# DATA.md — provenance

Discipline #1 of the Civic Ladder: every figure on screen is stamped with how it
came to exist, in a checked-in file, not promised in a README.

| Class | Meaning |
|---|---|
| **MEASURED** | Read off an instrument or authoritative census. Not modelled. |
| **COMPUTED** | Deterministic arithmetic over measured inputs and sourced constants. |
| **MODELED** | Output of a model fit on measured data. *(Not used at rung 1.)* |
| **GENERATED** | Produced by a generative model. Illustrative; feeds no calculation. |

Rung 1 started with **no computation on purpose**. The coverage layer added one
deliberately, so the COMPUTED class now carries real weight: the gap figure, the
wash, and `fullness`. Everything else on screen is MEASURED. Nothing is modelled
and nothing is generated.

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
| Cluster **size** | `point_count` | Brand tangerine, never a step on the fullness ramp. |
| Cluster **numeral** | `point_count` | The only mark on the map that contains a number. |

**The ramp is one hue, not green→red.** The build plan suggests green = bikes
available → red = empty. That is the single worst pairing for red-green colour
blindness (~8% of men), and it is a *diverging* structure used where the data is
*sequential* — fullness is a magnitude, not a polarity. A one-hue ramp reads just
as fast and works for everyone.

The hue is Bike Share Toronto's tangerine, so a dot reads as the thing it stands
for. Steps `#d2551f → #96380f → #5c200a`, monotonic in OKLCH lightness
(0.605 → 0.468 → 0.332) in even intervals, each clearing 3:1 against the basemap.

**The bikes' actual colour is not one of those steps.** `#eb6834` measures 2.98:1
on the basemap — it would fade into the map. It lives in `styles.css` as
`--color-brand`, for fills and the CTA, where contrast is not the constraint.

Kept in two places — `FULLNESS_RAMP` in `src/layers.ts` and the `--fullness-*`
tokens in `src/styles.css` — so the legend swatches cannot drift from the dots.

### The theme, by job

One hue cannot do every job, so the tangerine is split by contrast requirement:

| Token | Value | Job | Measured |
|---|---|---|---|
| `--color-brand` | `#eb6834` | Fills, rules, the CTA. Never text. | 3.07:1 on paper; ink label on it 5.11:1 |
| `--color-brand-lift` | `#f4793f` | CTA hover | ink label 5.96:1 |
| `--color-brand-ink` | `#c14a17` | Orange *text* (eyebrows) | 4.72:1 — clears WCAG AA body |
| `--fullness-*` | `#d2551f`→`#5c200a` | The data | all ≥3:1 on basemap |
| `--color-critical` | `#d03b3b` | Errors | 4.60:1 |

`--color-critical` is deliberately **not** the brand colour. An error has to be
distinguishable from branding, and orange is now both the brand and the data.

Clusters wear the bikes' own tangerine (`#eb6834`) — the brand colour, and
pointedly not a step on the fullness ramp, because a cluster has no single
fullness and colouring it by one would be a lie.

That leaves cluster and ramp close in hue (ΔE 6.6 against the lightest step), so
**the separation is structural, not chromatic**:

- a cluster is 15–26px radius against a station's 4.5–11px;
- a cluster is the only mark on the map that ever contains a number;
- a white ring holds it off the basemap.

The numeral is **ink, not white**: white on this orange measures 3.20:1 and fails,
ink measures 5.11:1. Hover lifts to `#f4793f` rather than deepening, matching the
CTA, so the numeral stays legible through the state change.

An earlier revision kept clusters a cool slate for hue distance. Colouring them
with the brand was a deliberate call to make the theme consistent; the structural
separations above are what make it safe.

Adjacent ramp steps sit at ΔE 14.2, below the validator's categorical
normal-vision floor of 15. That is inherent to a sequential ramp, where adjacent
steps are *meant* to be close, and the relief is in place: clusters carry a
number, no-data is a hollow ring rather than a fourth colour, and the panel
prints exact values. No distinction on this map rests on colour alone.

## Coverage (COMPUTED)

The one piece of real computation on the map. `src/coverage.ts`.

### What it answers

Given what the reader is trying to do — get a bike, or get rid of one — where can
they actually do it, and where can they not?

| Mode | A dock counts if | Dot colour reads |
|---|---|---|
| `borrow` | `bikes_available > 0` | `fullness` (bikes ÷ capacity) |
| `return` | `docks_available > 0` | `docks_available ÷ capacity` |
| `none` | — no wash, no gap figure | `fullness` |

`none` is not a third intent, it is the absence of one. The wash comes off and the
gap figure goes away entirely rather than sitting there stale, because a gap is
only meaningful relative to something you were trying to do. The dots stay,
coloured by the `borrow` reading — the plain question a bike-share map answers
when nobody has said otherwise: where are the bikes? The computation is skipped
in this mode rather than run and hidden.

Returning reads free docks directly rather than `1 − fullness`: bikes and free
docks need not add up to capacity, because a dock can be out of service holding
neither. Deriving one from the other would invent capacity that is not there.

### The method

A raster, not a union of circles. Overlapping translucent circles composite where
they overlap, so a dense downtown would render darker than a sparse edge and read
as "more covered" — a gradient that does not exist. Coverage is binary: you are
within a walk of a usable dock or you are not. A grid paints each patch of ground
exactly once.

- 125 m cells over the dock bbox, padded by one walk radius so edge coverage is
  drawn rather than clipped.
- For each usable dock, mark cells whose centre is within `walkRadiusMetres`.
  Worked outward from ~1000 docks rather than inward from ~76,000 cells, which is
  the difference between rebuilding in a frame and blocking the page. Measured
  **36–55 ms** from click to repaint.
- Each row's covered cells are run-length encoded into rectangles before being
  handed to MapLibre — 76,000 cells become ~620 polygons with identical output.
- Distance is equirectangular. At city scale the error against a great circle is
  centimetres, far below the cell size.

### The one assumed constant

`COVERAGE.walkRadiusMetres = 400`. That is a five-minute walk at an ordinary
4.8 km/h pace — the whole derivation, stated so it can be argued with rather than
taken on faith. It is straight-line distance, **not** walking distance along
streets: a river or a rail corridor between you and a dock is not accounted for,
so real coverage is somewhat worse than the wash shows.

### The denominator, and how it was got wrong twice

The gap figure is a ratio, and its denominator is the easiest place to lie.

1. **Bounding box** — measured **80%**. Most of that box is northwest Toronto
   where the system has never operated. Counting land the network never reached
   as a "gap" makes the number large and meaningless.
2. **Within 1 km of any dock** — measured **60%**, and stayed near 60% however
   many bikes were out. With a 400 m numerator against a 1 km denominator, an
   isolated dock can only ever cover (400/1000)² of its surroundings, so the
   ratio measured the radii, not the network.
3. **Within 400 m of any dock** — the same radius on both sides. The denominator
   is the network's own service area, and the ratio now moves only with
   availability, which is the thing the toggle is about.

Measured on the live feed: **23% gap for borrowing, 2% for returning**. Finding a
free dock is nearly always possible; finding a bike is not. The denominator does
not move when bikes do, so that difference is real and not an artefact.

### What it is not

Not a model, not a forecast, not walking-network isochrones. Distance geometry
over measured coordinates against one stated distance. Change the radius in
`constants.ts` and every number on screen moves with it.

## Camera bounds

After the landing, the camera is fenced to the dock bbox plus
`CITY.panMarginDegrees` (0.02°, ~2 km). Two limits, both derived from that one
box so they cannot disagree:

- **`maxBounds`** keeps the *viewport* inside the fence — not just the centre, so
  you can never drag the map off the data.
- **A zoom floor** from `cameraForBounds`, recomputed on resize. `maxBounds` alone
  does not stop you zooming out until Lake Erie fills the frame, and the zoom that
  fits the service area on a desktop leaves half of it off-screen on a phone.
- **Mercator, restored on arrival.** The globe is for the descent only. While the
  projection stays `globe`, MapLibre computes the `maxBounds` constraint in globe
  space, and that constraint is looser: wheel-zoom out far enough to engage the
  globe transition and the camera settles *below* the floor — measured 10.06
  against a floor of 10.93 — and stays there. Nothing about it is visible at city
  zoom, which is what made it easy to miss.

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
