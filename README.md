# civic-bike-docks

Every Bike Share Toronto dock on a map. Rung 1 of the Civic Ladder.

**Status:** Phase 0 (scaffold) and Phase 1 (contract) complete. The map renders;
no data on it yet.

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
| `npm run build:stations` | Phase 4 — fetch GBFS, write `public/data/stations.geojson` |

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
├─ map.ts                # the map (Phase 0: camera only)
├─ types.ts              # the data contract, as enforced types
├─ constants.ts          # city center, zooms, feed URLs, cluster settings — with sources
└─ styles.css            # design tokens + map chrome
public/data/             # stations.geojson lands here in Phase 2 (copied to dist/ verbatim)
scripts/                 # the offline GBFS → GeoJSON transform, Phase 4
DATA.md                  # provenance stamps + the contract in prose
```

`public/` is served at the site root, so `public/data/stations.geojson` is fetched
as `data/stations.geojson` — the path in `constants.ts → DATA.stations`.

## What's next

- **Phase 2** — generate 50 contract-shaped fake stations into `public/data/stations.geojson`.
- **Phase 3** — dots, clustering, data-driven color, click-to-panel, hover.
- **Phase 4** — swap in the real 1063 stations. The UI shouldn't change at all.
- **Phase 5** *(stretch)* — live fullness coloring, globe intro.

See [`DATA.md`](DATA.md) for the contract, the provenance stamps, and the GBFS v3
schema gotchas. The contract is also enforced in [`src/types.ts`](src/types.ts) —
keep the two in step.
