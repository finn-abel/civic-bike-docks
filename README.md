# civic-bike-docks

Every Bike Share Toronto dock on a map. Rung 1 of the Civic Ladder.

**Status:** Phases 0–5 complete, stretch goals included. Every real Bike Share
Toronto dock (1063 of them) on the map: clustered, clickable, coloured by live
availability, opening on a globe that flies down to the city — and still loading
with the network off.

The app opens on a title card over a slowly turning globe. **Get started** flies
the camera down to Toronto, after which the map is fenced to the service area —
you cannot pan or zoom out to anywhere there are no docks.

Append `?nointro` to skip the landing and drop straight into the fenced map.

## Run it

```bash
npm install
npm run dev        # http://localhost:5180 — opens automatically
```

The dev server is pinned to **5180**, not Vite's default 5173. 5173 collects
whatever else you have running, and a collision there is silent — Vite moves to the
next free port while you go to 5173 out of habit and get someone else's app. On
5180 a collision is a hard error instead:

```
Error: Port 5180 is already in use
lsof -nP -iTCP:5180 -sTCP:LISTEN    # find what has it
```

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc --noEmit` then `vite build` → `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run typecheck` | Types only, no build |
| `npm run generate:fake` | Phase 2 — write 50 placeholder stations to `public/data/stations.geojson` |
| `npm run build:stations` | Phase 4 — fetch GBFS, overwrite the same file with the real 1063 |

`dist/` is a plain static directory: no server, no API key, no runtime dependency
on npm. That is what keeps the wifi-off property.

## Theme

Bike Share Toronto's tangerine, split into tokens by contrast requirement — the
bikes' own `#eb6834` is a fill colour, not a text or map-mark colour. The full
table, with measurements, is in [`DATA.md`](DATA.md) § The theme, by job.

## Stack

TypeScript (strict) + Vite + MapLibre GL JS 6. No UI framework — rung 1's one hard
thing is the map, and React would be a second hard thing. GeoJSON is the only data
format.

## Layout

```
index.html               # Vite entry
src/
├─ map.ts                # camera, error surface, wiring
├─ stations.ts           # load + validate the census
├─ layers.ts             # the source and its three layers, styling expressions
├─ interactions.ts       # cluster/station click, hover, Escape
├─ live.ts               # live status polling, layered over the snapshot
├─ landing.ts            # title card, globe descent, camera fence
├─ panel.ts              # station detail panel
├─ types.ts              # the data contract, as enforced types
├─ constants.ts          # city center, zooms, feed URLs, cluster settings — with sources
└─ styles.css            # design tokens + map chrome
public/
├─ data/stations.geojson       # the committed census — 1063 real docks
└─ basemap/                    # offline fallback style + vendored glyphs
scripts/
├─ generate_fake_stations.ts   # Phase 2 placeholder generator
└─ build_stations.ts           # Phase 4 GBFS -> GeoJSON transform
DATA.md                  # provenance stamps + the contract in prose
```

`public/` is served at the site root, so `public/data/stations.geojson` is fetched
as `data/stations.geojson` — the path in `constants.ts → DATA.stations`.

## What's next

Rung 1 is done. The remaining known gap is that individual dots are not
keyboard-reachable — the panel is fully keyboard-operable once open, but opening it
needs a pointer.

See [`DATA.md`](DATA.md) for the contract, the provenance stamps, and the GBFS v3
schema gotchas. The contract is also enforced in [`src/types.ts`](src/types.ts) —
keep the two in step.
