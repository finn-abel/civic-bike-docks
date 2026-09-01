<h1 align="center">civic-bike-docks</h1>

![A dark cartoon illustration of a bicycle wheel rendered as a globe over a civic map](docs/assets/readme-hero-v2.png)

An interactive map of every Bike Share Toronto dock: 1063 real stations, live
availability, clustered city navigation, a globe-to-Toronto opening, and an
offline-safe data path.

The project treats a bike-share system as civic infrastructure. It shows where the
network is dense, where bikes or docks are currently available, and which parts of
the service area fall outside a practical walk to a usable station.

## Highlights

| Feature | What it does |
|---|---|
| Station map | Plots every Bike Share Toronto dock from the GBFS feed. |
| Live availability | Updates bikes and free docks from `station_status` when the network is reachable. |
| Snapshot fallback | Ships with a committed status snapshot so the map still works offline. |
| Intent toggle | Switch between **Get a bike**, **Return one**, and **Neither**. |
| Coverage wash | Computes the area within 400 m of a station that can serve the selected intent. |
| Detail panel | Opens capacity, bikes available, docks available, and fullness for each station. |
| Globe intro | Starts from a quiet globe view, then flies into the fenced Toronto service area. |
| Light and dark | Follows the system theme, with an override that persists. The basemap swaps too. |

## Why It Exists

Most bike-share maps answer the immediate question: where is the nearest station?
This one also shows the shape of the network. Dots cluster to reveal density,
colour encodes availability, and the coverage layer makes access gaps visible
without pretending to be a route planner.

Every number on screen is stamped as either **MEASURED** or **COMPUTED** in
[DATA.md](DATA.md). The app uses measured GBFS coordinates and availability, then
computes only `fullness` and the 400 m coverage gap. There is no model and no
generated data in the shipped map.

## Run Locally

```bash
npm install
npm run dev
```

The dev server is pinned to `http://localhost:5180`. If that port is already in
use, Vite exits instead of silently moving to another port.

```bash
npm run build
npm run preview
```

`dist/` is a static build: no server API, no runtime npm dependency, and no API
key. The CARTO basemap is fetched when available; if it is not, the local fallback
style still renders all stations, clusters, labels, and panels.

## Data Pipeline

The app reads a single GeoJSON contract from `public/data/stations.geojson`.

```bash
npm run build:stations          # fetch GBFS and write the real station snapshot
npm run generate:fake           # write 50 contract-shaped placeholder stations
```

`scripts/build_stations.ts` resolves sub-feed URLs through the GBFS discovery file,
joins `station_information` with `station_status`, writes GeoJSON, and runs the
same runtime validator the browser uses before it overwrites the committed file.

Current checked-in snapshot:

| Item | Value |
|---|---|
| Source | Bike Share Toronto GBFS v3.0 |
| Verified | 2026-08-31 |
| Stations | 1063 |
| Availability | 1062 stations with status, 1 station without |
| Coordinate order | GeoJSON `[lon, lat]` |

## Interaction Model

| Mode | Station counts as usable when | Dot colour means |
|---|---|---|
| `borrow` | `bikes_available > 0` | Bikes available ÷ capacity |
| `return` | `docks_available > 0` | Free docks ÷ capacity |
| `none` | Coverage hidden | Bikes available ÷ capacity |

The coverage wash is a grid calculation, not overlapping translucent circles. Each
cell is painted once, so dense downtown clusters do not falsely look “more
covered” than sparse edges. Details and tradeoffs are documented in
[DATA.md](DATA.md#coverage-computed).

The gap readout puts a number on what the wash shows: currently about 23% of the
service area has no available bike within 400 m, against 2% with no free dock.
Both the wash and the figure recompute when the live feed lands.

## Theme

The palette is Bike Share Toronto's tangerine, split into tokens by contrast
requirement. The bikes' own `#eb6834` is a fill colour only; it measures 3.07:1 on
paper, so text and map marks take deeper or lighter steps.

Light and dark follow the system preference by default. The ☾/☀ control in the
top-right corner overrides that, and the choice persists. The basemap swaps with
the page — CARTO Positron and Dark Matter, both keyless — and the dark palette is
measured against the dark ground rather than inverted from the light one. The
ramp reverses direction there: more ink means more bikes on paper, more light on
black.

Measured tables for both themes are in [DATA.md](DATA.md#dark-mode).

## Stack

- TypeScript, strict mode
- Vite
- MapLibre GL JS 6
- GeoJSON
- Plain DOM wiring, no UI framework

## Project Layout

```text
index.html
src/
├─ map.ts                # camera, error surface, wiring
├─ stations.ts           # load + validate the station census
├─ layers.ts             # MapLibre source, layers, and styling expressions
├─ interactions.ts       # cluster/station click, hover, Escape
├─ live.ts               # live status polling over the snapshot
├─ coverage.ts           # walk-radius grid and gap figure
├─ controls.ts           # intent toggle, legend, readout
├─ theme.ts              # light/dark resolution, override, persistence
├─ landing.ts            # globe opening and camera fence
├─ panel.ts              # station detail panel
├─ types.ts              # GeoJSON contract as TypeScript
├─ constants.ts          # sourced values and project constants
└─ styles.css            # design tokens and map chrome
public/
├─ data/stations.geojson
└─ basemap/
scripts/
├─ build_stations.ts
└─ generate_fake_stations.ts
docs/
└─ assets/readme-hero-v2.png
```

<!--
## Known Gap

Individual map dots are not keyboard-reachable yet. The detail panel is
keyboard-operable once open, but opening a station currently requires a pointer.
-->
