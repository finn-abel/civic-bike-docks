/**
 * constants.ts — the one place numbers and URLs live.
 *
 * Discipline #2 (Civic Ladder, Shared Foundation): no numeric literals in the map
 * code. Every value below carries the source it came from in a comment above it.
 */

import type { LonLat } from './types';

// ---------------------------------------------------------------------------
// Feeds — GBFS (General Bikeshare Feed Specification) v3.0, Bike Share Toronto
// Discovery file (the proper entry point; indexes every sub-feed):
//   https://toronto.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json
// Verified live 2026-08-31: 1063 stations, all required fields present.
// ---------------------------------------------------------------------------
export const FEEDS = {
  discovery: 'https://toronto.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json',

  /** The census. Static list of every dock — this alone is the map.
   *  Fetched once, offline, by scripts/build_stations.ts. Never fetched by the browser. */
  stationInformation:
    'https://toronto.publicbikesystem.net/customer/gbfs/v3.0/station_information',

  /** Live layer (Phase 5 stretch only). Bikes/docks free per station, ttl ~10s. */
  stationStatus:
    'https://toronto.publicbikesystem.net/customer/gbfs/v3.0/station_status',
} as const;

/** Legacy v1 endpoints — flatter schema, kept as a documented fallback only.
 *  Source: project1-bikeshare-build-plan.md § The feeds. */
export const FEEDS_V1 = {
  stationInformation:
    'https://tor.publicbikesystem.net/ube/gbfs/v1/en/station_information',
  stationStatus: 'https://tor.publicbikesystem.net/ube/gbfs/v1/en/station_status',
} as const;

// ---------------------------------------------------------------------------
// City camera
// ---------------------------------------------------------------------------
export const CITY = {
  name: 'Toronto',

  /** Downtown Toronto. Source: project1-bikeshare-build-plan.md § Phase 0. */
  center: [-79.3832, 43.6532] satisfies LonLat,

  /** Whole-system view: fits the dock network without burying downtown in clusters. */
  zoom: 12,

  /** Bounding box of the real dock network, computed from the 1063 stations in
   *  station_information on 2026-08-31. Used to place fake stations in Phase 2 so
   *  the fake map is geographically honest about where docks actually are. */
  bbox: {
    minLon: -79.6035,
    minLat: 43.5881,
    maxLon: -79.1232,
    maxLat: 43.8126,
  },
} as const;

// ---------------------------------------------------------------------------
// Basemap
// ---------------------------------------------------------------------------
export const BASEMAP = {
  /**
   * CARTO Positron — keyless, no token, no account. A muted light basemap so the
   * dock dots carry the color, not the streets.
   * Source: https://github.com/CartoDB/basemap-styles (gl/positron-gl-style)
   *
   * NOTE (discipline #3, wifi off): MapLibre itself is bundled by Vite, but these
   *   tiles are still network-fetched and browser-cached. Load the map once online
   *   before demoing. To be fully offline-proof, self-host a minimal style.
   *   Tracked as a Phase 4 verification step.
   */
  style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',

  /** MapLibre's own keyless demo style — country outlines only, no city streets.
   *  Useless for a dock map; kept as a last-resort fallback if CARTO is unreachable. */
  fallbackStyle: 'https://demotiles.maplibre.org/style.json',

  // Attribution is NOT set here: the CARTO style.json already declares its own
  // OSM + CARTO attribution, and MapLibre renders both if you also pass
  // customAttribution. A self-hosted style would need it stated explicitly.
} as const;

// ---------------------------------------------------------------------------
// Clustering — Phase 3
// Values from project1-bikeshare-build-plan.md § Map implementation notes.
// ---------------------------------------------------------------------------
export const CLUSTER = {
  /** px within which points merge into one cluster */
  radius: 50,
  /** above this zoom, every station draws individually */
  maxZoom: 14,
} as const;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export const DATA = {
  /** The committed census, contract-shaped. Fake through Phase 3, real from Phase 4.
   *  Same path either way — that is the point of the contract.
   *  Lives in public/, so Vite copies it to the build output verbatim. */
  stations: 'data/stations.geojson',

  /** Number of fake stations generated in Phase 2. Enough to exercise clustering,
   *  small enough to eyeball. Real count is 1063. */
  fakeStationCount: 50,
} as const;

// ---------------------------------------------------------------------------
// Source / layer ids — one place, so layer wiring in Phase 3 can't typo-drift.
// ---------------------------------------------------------------------------
export const IDS = {
  source: 'stations',
  clusterCircles: 'station-clusters',
  clusterCounts: 'station-cluster-counts',
  unclusteredPoints: 'station-points',
} as const;
