# civic-bike-docks

Every Bike Share Toronto dock on a map. Rung 1 of the Civic Ladder.

**Status:** Phases 0–2 complete. 50 generated placeholder stations render on the
map. Clustering, color, and the click panel are Phase 3.

## Run it

```bash
npm install
npm run dev        # dev server + HMR
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

## Stack

TypeScript (strict) + Vite + MapLibre GL JS 6. No UI framework — rung 1's one hard
thing is the map, and React would be a second hard thing. GeoJSON is the only data
format.

## Layout

```
index.html               # Vite entry
src/
├─ map.ts                # camera, error surface, wiring
├─ stations.ts           # load + validate the census, draw it
├─ types.ts              # the data contract, as enforced types
├─ constants.ts          # city center, zooms, feed URLs, cluster settings — with sources
└─ styles.css            # design tokens + map chrome
public/data/             # stations.geojson (copied to dist/ verbatim)
scripts/
└─ generate_fake_stations.ts   # Phase 2 placeholder generator
DATA.md                  # provenance stamps + the contract in prose
```

`public/` is served at the site root, so `public/data/stations.geojson` is fetched
as `data/stations.geojson` — the path in `constants.ts → DATA.stations`.

## What's next

- **Phase 3** — dots, clustering, data-driven color, click-to-panel, hover.
- **Phase 4** — swap in the real 1063 stations. The UI shouldn't change at all.
- **Phase 5** *(stretch)* — live fullness coloring, globe intro.

See [`DATA.md`](DATA.md) for the contract, the provenance stamps, and the GBFS v3
schema gotchas. The contract is also enforced in [`src/types.ts`](src/types.ts) —
keep the two in step.
