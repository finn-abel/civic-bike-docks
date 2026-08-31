/**
 * live.ts — Phase 5 stretch. Real-time availability.
 *
 * The committed snapshot is the load-bearing path; this is an *enhancement* laid
 * over it. If the feed is slow, blocked, or offline, nothing here throws and the
 * map keeps showing the snapshot. That ordering is the whole point: a live fetch
 * must never be the reason a demo has no data.
 */

import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

import { FEEDS, IDS, LIVE } from './constants';
import { getSelectedStationId, renderPanel } from './panel';
import type { RawFeatureProperties } from './types';

interface LiveEntry {
  readonly bikes: number | null;
  readonly docks: number | null;
}

export type Freshness =
  | { readonly kind: 'snapshot'; readonly at: string | null }
  | { readonly kind: 'live'; readonly at: string };

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Fetch the live status feed. Resolves to null on any failure — unreachable,
 *  too slow, or shaped unexpectedly. Callers treat null as "keep the snapshot". */
async function fetchLiveStatus(): Promise<Map<string, LiveEntry> | null> {
  try {
    const response = await fetch(FEEDS.stationStatus, {
      signal: AbortSignal.timeout(LIVE.timeoutMs),
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      data?: { stations?: unknown };
    };
    const stations = payload.data?.stations;
    if (!Array.isArray(stations)) return null;

    const byId = new Map<string, LiveEntry>();
    for (const raw of stations) {
      const entry = raw as Record<string, unknown>;
      const id = entry['station_id'];
      if (typeof id !== 'string') continue;
      byId.set(id, {
        // v3 generalised "bike" to "vehicle" — there is no num_bikes_available.
        bikes: readFiniteNumber(entry['num_vehicles_available']),
        docks: readFiniteNumber(entry['num_docks_available']),
      });
    }
    return byId.size > 0 ? byId : null;
  } catch {
    return null;
  }
}

/** Round to the same precision the offline transform uses, so a station's colour
 *  does not shimmer between the snapshot and the live feed for no real change. */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Rebuild the collection with live availability folded in.
 *
 * Returns new objects rather than mutating the loaded census, so the snapshot
 * stays intact as a fallback if a later refresh fails.
 */
function withLiveStatus(
  base: FeatureCollection,
  live: Map<string, LiveEntry>,
): FeatureCollection {
  return {
    ...base,
    features: base.features.map((feature) => {
      const properties = feature.properties ?? {};
      const id = properties['station_id'] as string | undefined;
      const entry = id === undefined ? undefined : live.get(id);
      if (!entry) return feature;

      const capacity = readFiniteNumber(properties['capacity']) ?? 0;
      const { bikes, docks } = entry;

      return {
        ...feature,
        properties: {
          ...properties,
          bikes_available: bikes,
          docks_available: docks,
          // Same divide-by-zero guard as the offline transform.
          fullness: bikes !== null && capacity > 0 ? round(bikes / capacity, 4) : null,
        },
      };
    }),
  };
}

/**
 * Poll the live feed and push updates into the map source.
 *
 * Refreshes on an interval so the map stays current while a demo is on screen.
 * A failed refresh is a no-op: the previous data stays, and the caption stops
 * claiming to be live only if it never succeeded in the first place.
 */
export function startLiveUpdates(
  map: MapLibreMap,
  base: FeatureCollection,
  onFreshness: (freshness: Freshness) => void,
): void {
  let latest = base;

  const refresh = async (): Promise<void> => {
    const live = await fetchLiveStatus();
    if (!live) return;

    latest = withLiveStatus(base, live);

    const source = map.getSource(IDS.source) as GeoJSONSource | undefined;
    if (!source) return;
    void source.setData(latest);

    onFreshness({ kind: 'live', at: new Date().toISOString() });

    // A panel left open would otherwise keep showing the numbers it opened with,
    // beside dots that have already moved on.
    const selected = getSelectedStationId();
    if (selected === null) return;
    const feature = latest.features.find(
      (candidate) => candidate.properties?.['station_id'] === selected,
    );
    if (feature?.properties) {
      renderPanel(feature.properties as RawFeatureProperties, { keepFocus: true });
    }
  };

  void refresh();
  window.setInterval(() => void refresh(), LIVE.refreshMs);
}
