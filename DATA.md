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

### During development (Phases 2–3)

`public/data/stations.geojson` holds **50 generated stations**, contract-shaped, with
random coordinates inside the real dock bbox and random capacities.

> Every property in the dev file is **GENERATED** — placeholder, feeds nothing,
> and is overwritten wholesale in Phase 4. The header comment in the generator
> says so, and this note is the checked-in record of it.

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

### Known data hazards

- **One station has `capacity: 0`** (of 1063, as of 2026-08-31). Guard the
  division: `capacity ? bikes / capacity : null`, and let the map leave `null`
  uncolored rather than rendering `Infinity`.
- **Real bbox**, computed from all 1063 stations and recorded in
  `src/constants.ts → CITY.bbox`:
  lat `43.5881`–`43.8126`, lon `-79.6035`–`-79.1232`.

---

## Renders with the wifi off (discipline #3)

| Asset | Committed? | Notes |
|---|---|---|
| `public/data/stations.geojson` | Yes | Fetched once, offline, by `scripts/build_stations.ts`. The browser never calls the GBFS feed. |
| Status snapshot (Phase 5) | Yes, when added | Live re-fetch is an *enhancement* with the snapshot as fallback — never the load-bearing path. |
| MapLibre GL JS + CSS | **Yes** | Pinned to `6.6.0` in `package.json` and bundled into `dist/` by Vite. No CDN at runtime. |
| Basemap tiles | **No** — CARTO CDN | Keyless, but network-fetched and browser-cached. Load once online before demoing, or self-host a minimal style. |

**Basemap tiles are the one remaining gap.** Moving to Vite closed the MapLibre
half of this — the library is now bundled, not fetched. Tiles still are not, and
self-hosting a minimal style is the only real fix. Not blocking Phase 1; it is the
verification step at the end of Phase 4.
