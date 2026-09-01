/**
 * build_stations.ts — the GBFS → GeoJSON transform.
 *
 * Runs ONCE, offline, from the terminal. Writes public/data/stations.geojson,
 * which is committed. The browser never calls a GBFS feed for its baseline data,
 * so the map still works when the network is unavailable.
 *
 *   npm run build:stations              # census + a status snapshot
 *   npm run build:stations -- --no-status   # census only; availability all null
 *
 * The output satisfies the same contract the generated placeholders did, so the
 * map does not change — and neither does a single line of UI code.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CITY, DATA, FEEDS } from '../src/constants';
import { assertStationCollection } from '../src/stations';
import type { StationCollection, StationFeature } from '../src/types';

/** Six decimals ≈ 0.1 m. More is noise and it bloats the committed file. */
const COORDINATE_PLACES = 6;
const FULLNESS_PLACES = 4;

const REQUEST_TIMEOUT_MS = 30_000;

// --- GBFS v3 shapes --------------------------------------------------------
// Only the fields this transform reads. The feed carries more; see DATA.md.

interface LocalizedName {
  readonly text?: unknown;
  readonly language?: unknown;
}

interface GbfsStationInformation {
  readonly station_id?: unknown;
  /** v3 returns an array of {text, language}, NOT a plain string. */
  readonly name?: unknown;
  readonly lat?: unknown;
  readonly lon?: unknown;
  readonly capacity?: unknown;
  readonly is_virtual_station?: unknown;
}

interface GbfsStationStatus {
  readonly station_id?: unknown;
  /** v3 generalised "bike" to "vehicle". There is no num_bikes_available. */
  readonly num_vehicles_available?: unknown;
  readonly num_docks_available?: unknown;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Resolve sub-feed URLs from the GBFS discovery file — the proper entry point.
 *
 * Going through discovery rather than hardcoding is what makes swapping cities a
 * one-line change: point `FEEDS.discovery` at another system and the rest follows.
 * Falls back to the pinned URLs if discovery is unreachable or shaped differently.
 */
async function resolveFeeds(): Promise<{ information: string; status: string }> {
  const fallback = {
    information: FEEDS.stationInformation,
    status: FEEDS.stationStatus,
  };

  try {
    const discovery = (await fetchJson(FEEDS.discovery)) as {
      data?: { feeds?: { name?: unknown; url?: unknown }[] };
    };
    const feeds = discovery.data?.feeds ?? [];
    const find = (name: string): string | undefined => {
      const match = feeds.find((feed) => feed.name === name);
      return typeof match?.url === 'string' ? match.url : undefined;
    };
    return {
      information: find('station_information') ?? fallback.information,
      status: find('station_status') ?? fallback.status,
    };
  } catch (error) {
    console.warn(
      `  ! discovery file unreachable, using pinned URLs (${String(error)})`,
    );
    return fallback;
  }
}

function readStations(payload: unknown, feedName: string): unknown[] {
  const stations = (payload as { data?: { stations?: unknown } })?.data?.stations;
  if (!Array.isArray(stations)) {
    throw new TypeError(`${feedName}: expected data.stations to be an array`);
  }
  return stations;
}

/**
 * v3 names are localized arrays. Prefer English, fall back to the first entry
 * rather than dropping the station — an unlabelled dock is still a dock.
 */
function readName(value: unknown): string | null {
  if (typeof value === 'string') return value || null; // tolerate a v1-shaped feed
  if (!Array.isArray(value)) return null;

  const entries = value as LocalizedName[];
  const english = entries.find((entry) => entry.language === 'en');
  const chosen = english ?? entries[0];
  return typeof chosen?.text === 'string' && chosen.text ? chosen.text : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

interface Skipped {
  readonly station_id: string;
  readonly reason: string;
}

function transform(
  information: unknown[],
  statusById: Map<string, GbfsStationStatus>,
): { features: StationFeature[]; skipped: Skipped[] } {
  const features: StationFeature[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();

  for (const raw of information) {
    const station = raw as GbfsStationInformation;
    const id =
      typeof station.station_id === 'string'
        ? station.station_id
        : typeof station.station_id === 'number'
          ? String(station.station_id)
          : null;

    if (!id) {
      skipped.push({ station_id: '(none)', reason: 'missing station_id' });
      continue;
    }
    if (seen.has(id)) {
      skipped.push({ station_id: id, reason: 'duplicate station_id' });
      continue;
    }

    const lat = readFiniteNumber(station.lat);
    const lon = readFiniteNumber(station.lon);
    if (lat === null || lon === null) {
      skipped.push({ station_id: id, reason: 'missing or non-numeric lat/lon' });
      continue;
    }

    seen.add(id);

    const capacity = readFiniteNumber(station.capacity) ?? 0;
    const status = statusById.get(id);
    const bikes = status ? readFiniteNumber(status.num_vehicles_available) : null;
    const docks = status ? readFiniteNumber(status.num_docks_available) : null;

    features.push({
      type: 'Feature',
      // [lon, lat] — longitude FIRST. GBFS gives them as separate fields, and
      // getting this backwards is the single most common bug in the project.
      geometry: {
        type: 'Point',
        coordinates: [round(lon, COORDINATE_PLACES), round(lat, COORDINATE_PLACES)],
      },
      properties: {
        station_id: id,
        name: readName(station.name) ?? `Station ${id}`,
        capacity,
        bikes_available: bikes,
        docks_available: docks,
        // Guard the division: at least one real Toronto station has capacity 0.
        fullness:
          bikes !== null && capacity > 0
            ? round(bikes / capacity, FULLNESS_PLACES)
            : null,
      },
    });
  }

  // Stable order, so a re-run produces a readable diff instead of reshuffling
  // 1000 lines whenever the feed changes its ordering.
  features.sort((a, b) =>
    a.properties.station_id.localeCompare(b.properties.station_id, 'en', {
      numeric: true,
    }),
  );

  return { features, skipped };
}

async function main(): Promise<void> {
  const withStatus = !process.argv.includes('--no-status');

  console.log(`Building ${CITY.name} station census…`);
  const urls = await resolveFeeds();

  const informationPayload = await fetchJson(urls.information);
  const information = readStations(informationPayload, 'station_information');
  console.log(`  station_information: ${information.length} stations`);

  const statusById = new Map<string, GbfsStationStatus>();
  if (withStatus) {
    const statusPayload = await fetchJson(urls.status);
    for (const raw of readStations(statusPayload, 'station_status')) {
      const entry = raw as GbfsStationStatus;
      if (typeof entry.station_id === 'string') {
        statusById.set(entry.station_id, entry);
      }
    }
    console.log(`  station_status:      ${statusById.size} entries (snapshot)`);
  } else {
    console.log('  station_status:      skipped (--no-status)');
  }

  const { features, skipped } = transform(information, statusById);

  const collection: StationCollection = {
    type: 'FeatureCollection',
    generated_at: new Date().toISOString(),
    features,
  };

  // Same contract check the browser runs on load. If the transform produced
  // something the map would reject, fail here — before overwriting a good file.
  assertStationCollection(collection);

  const outputPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'public',
    DATA.stations,
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);

  const withAvailability = features.filter(
    (feature) => feature.properties.fullness !== null,
  ).length;

  console.log(`\n  wrote ${features.length} MEASURED stations → ${outputPath}`);
  console.log(`  ${withAvailability} with availability, ${features.length - withAvailability} without`);
  if (skipped.length > 0) {
    console.log(`  skipped ${skipped.length}:`);
    for (const entry of skipped.slice(0, 10)) {
      console.log(`    ${entry.station_id}: ${entry.reason}`);
    }
  }
  console.log(`\n  Snapshot taken ${new Date().toISOString()} — commit it.`);
}

await main();
