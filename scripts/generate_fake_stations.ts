/**
 * generate_fake_stations.ts — Phase 2. Writes public/data/stations.geojson.
 *
 * GENERATED data. Every value this script emits is a placeholder: it feeds no
 * calculation, appears in no claim, and is overwritten wholesale in Phase 4 by
 * scripts/build_stations.ts. DATA.md is the checked-in record of that.
 *
 * The point of this file is that the map is built entirely against its output.
 * The map cannot tell fake from real, because both satisfy the same contract —
 * which is what makes the Phase 4 swap a one-file change.
 *
 *   npm run generate:fake
 */

import { writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CITY, DATA } from '../src/constants';
import type { StationCollection, StationFeature } from '../src/types';

/** Fixed seed: re-running produces a byte-identical file, so a regenerate shows
 *  up as an empty git diff rather than 50 lines of churn. */
const SEED = 20260831;

/** Real Toronto capacities run 0–87, clustered in the teens and twenties. */
const CAPACITY = { min: 11, max: 47 } as const;

/** Docks cluster downtown rather than spreading evenly over the bbox. Scattering
 *  uniformly would give clustering (Phase 3) nothing interesting to do. */
const SPREAD_DEGREES = 0.028;

/** mulberry32 — small, fast, seedable. Not cryptographic; does not need to be. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(SEED);

/** Box–Muller. Uniform-in-bbox would put half the docks in Lake Ontario. */
function gaussian(): number {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** Six decimals ≈ 0.1 m. More is noise, and it bloats the committed file. */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function makeStation(index: number): StationFeature {
  const lon = clamp(
    CITY.center[0] + gaussian() * SPREAD_DEGREES,
    CITY.bbox.minLon,
    CITY.bbox.maxLon,
  );
  const lat = clamp(
    CITY.center[1] + gaussian() * SPREAD_DEGREES,
    CITY.bbox.minLat,
    CITY.bbox.maxLat,
  );

  // One station is given capacity 0 on purpose. At least one real Toronto station
  // has it, and it is the input that makes `fullness` divide by zero. The fake
  // data should exercise that guard, not hide it until Phase 4.
  const capacity = index === 0 ? 0 : randomInt(CAPACITY.min, CAPACITY.max);
  const bikesAvailable = capacity === 0 ? 0 : randomInt(0, capacity);

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [round(lon, 6), round(lat, 6)] },
    properties: {
      station_id: `fake-${String(index).padStart(3, '0')}`,
      name: `Placeholder Station ${index + 1}`,
      capacity,
      bikes_available: bikesAvailable,
      docks_available: capacity - bikesAvailable,
      fullness: capacity ? round(bikesAvailable / capacity, 4) : null,
    },
  };
}

const collection: StationCollection = {
  type: 'FeatureCollection',
  features: Array.from({ length: DATA.fakeStationCount }, (_, i) => makeStation(i)),
};

const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  DATA.stations,
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);

console.log(
  `Wrote ${collection.features.length} GENERATED stations → ${outputPath}`,
);
