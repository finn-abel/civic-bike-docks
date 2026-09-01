/**
 * stations.ts — load and validate the station census.
 *
 * The map reads the contract in types.ts and nothing else. Whether the file behind
 * DATA.stations holds 50 generated placeholders or 1063 real Toronto docks is not
 * this module's concern — that is the whole point.
 *
 * Drawing lives in layers.ts. This file is only about getting trustworthy data.
 */

import type { FeatureCollection } from 'geojson';

import { CITY, DATA } from './constants';
import type { StationCollection, StationFeature } from './types';

/**
 * Validate at the boundary.
 *
 * types.ts is compile-time only; this file arrives over the network at runtime and
 * TypeScript cannot vouch for it. Checking here means a bad transform fails loudly,
 * naming the offending station, instead of silently rendering docks in the Gulf of
 * Guinea or colouring by NaN.
 *
 * Exported because scripts/build_stations.ts runs the same check on its output
 * before writing. One definition of "valid", enforced at both ends of the pipe.
 */
export function assertStationCollection(
  value: unknown,
): asserts value is StationCollection {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`${DATA.stations}: expected an object, got ${typeof value}`);
  }

  const collection = value as Partial<StationCollection>;
  if (collection.type !== 'FeatureCollection') {
    throw new TypeError(
      `${DATA.stations}: expected type "FeatureCollection", got ${String(collection.type)}`,
    );
  }
  if (!Array.isArray(collection.features)) {
    throw new TypeError(`${DATA.stations}: "features" is not an array`);
  }

  collection.features.forEach((feature: StationFeature, index: number) => {
    const where = `${DATA.stations}: feature ${index}`;
    const coordinates = feature?.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      throw new TypeError(`${where}: coordinates must be [lon, lat]`);
    }

    const [lon, lat] = coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new TypeError(`${where}: non-finite coordinates [${lon}, ${lat}]`);
    }

    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new RangeError(`${where}: [${lon}, ${lat}] is not a valid coordinate`);
    }

    // The lon/lat swap check, and the reason this validator exists.
    //
    // A range check alone does NOT catch it: swap Toronto's [-79.38, 43.65] and
    // you get [43.65, -79.38] — a legal longitude and a legal latitude, both in
    // range, pointing 5000 km into the South Atlantic. Only a check against where
    // the city actually is can tell the difference.
    const margin = CITY.bboxMarginDegrees;
    const outside =
      lon < CITY.bbox.minLon - margin ||
      lon > CITY.bbox.maxLon + margin ||
      lat < CITY.bbox.minLat - margin ||
      lat > CITY.bbox.maxLat + margin;

    if (outside) {
      throw new RangeError(
        `${where}: [${lon}, ${lat}] is outside ${CITY.name} — ` +
          'are lon and lat swapped? GeoJSON wants [lon, lat].',
      );
    }

    const { station_id, capacity, fullness } = feature.properties ?? {};
    if (typeof station_id !== 'string' || station_id === '') {
      throw new TypeError(`${where}: missing station_id`);
    }
    if (!Number.isFinite(capacity)) {
      throw new TypeError(`${where} (${station_id}): capacity is not a number`);
    }
    if (fullness !== null && !Number.isFinite(fullness)) {
      throw new TypeError(
        `${where} (${station_id}): fullness must be a number or null, got ${String(fullness)}`,
      );
    }
  });
}

/** The census plus the provenance the UI needs to caption it honestly. */
export interface LoadedStations {
  readonly data: FeatureCollection;
  /** When the snapshot was taken, or null for an older file without the stamp. */
  readonly generatedAt: string | null;
}

/** Fetch and validate the committed census. Throws with a specific message on any
 *  contract violation — the caller surfaces it rather than swallowing it. */
export async function loadStations(): Promise<LoadedStations> {
  const response = await fetch(DATA.stations);
  if (!response.ok) {
    throw new Error(
      `${DATA.stations}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const parsed: unknown = await response.json();
  assertStationCollection(parsed);

  return {
    // StationCollection is the narrower contract; MapLibre wants the general
    // GeoJSON type. Widening is safe — every StationFeature is a valid Feature.
    data: parsed as unknown as FeatureCollection,
    generatedAt: typeof parsed.generated_at === 'string' ? parsed.generated_at : null,
  };
}
