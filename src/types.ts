/**
 * types.ts — the data contract, as types.
 *
 * This file IS the spine of the project. Everything downstream reads this exact
 * shape and nothing else, which is what lets Phase 2's fake data be swapped for
 * Phase 4's real data without touching a line of UI code.
 *
 * The prose version, with per-field provenance stamps, lives in DATA.md. Keep
 * the two in step: if a property changes here, stamp it there.
 */

/** Longitude first. GBFS gives `lat` and `lon` separately; swapping them puts
 *  every dock in the Gulf of Guinea. The tuple type makes that a compile error
 *  rather than a map full of dots in the ocean. */
export type LonLat = readonly [lon: number, lat: number];

/**
 * One bike-share dock.
 *
 * Availability is `number | null`, never `undefined` and never `0`-as-missing:
 * a station with genuinely zero bikes reports `0`, and a station with no status
 * feed joined reports `null`. The map must be able to tell those apart.
 */
export interface StationProperties {
  /** MEASURED — `station_information[].station_id`. Join key to `station_status`. */
  readonly station_id: string;

  /** MEASURED — the `en` entry of the v3 localized `name` array. */
  readonly name: string;

  /** MEASURED — total docks at the station. Not availability. */
  readonly capacity: number;

  /** MEASURED — `station_status[].num_vehicles_available`. `null` when no status feed. */
  readonly bikes_available: number | null;

  /** MEASURED — `station_status[].num_docks_available`. `null` when no status feed. */
  readonly docks_available: number | null;

  /**
   * COMPUTED — `bikes_available / capacity`, precomputed in the transform so the
   * map colors by one clean number.
   *
   * `null` when either input is missing or `capacity` is 0. At least one real
   * Toronto station has `capacity: 0`, so this guard is load-bearing, not defensive.
   */
  readonly fullness: number | null;
}

/** A GeoJSON Point Feature carrying one station. */
export interface StationFeature {
  readonly type: 'Feature';
  readonly geometry: {
    readonly type: 'Point';
    readonly coordinates: LonLat;
  };
  readonly properties: StationProperties;
}

/** The whole census — the shape of `public/data/stations.geojson`. */
export interface StationCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly StationFeature[];
}

/**
 * What MapLibre actually hands back from a click.
 *
 * Vector-tile encoding flattens properties to primitives and widens the types,
 * so `feature.properties` at runtime is NOT `StationProperties` — it is this.
 * Parse it back through `toStationProperties()` rather than casting.
 */
export type RawFeatureProperties = Record<string, unknown>;
