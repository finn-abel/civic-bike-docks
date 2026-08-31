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

  /**
   * Slack allowed around `bbox` when validating loaded stations, in degrees.
   * ~111 km — wide enough that the system adding docks in a new suburb does not
   * trip it, narrow enough that a lon/lat swap always does.
   *
   * This is what actually catches the swap. A plain lon/lat range check cannot:
   * swap Toronto's [-79.38, 43.65] and you get [43.65, -79.38], where 43.65 is a
   * legal longitude and -79.38 a legal latitude. The values stay in range; only
   * the *location* is wrong — 5000 km into the South Atlantic.
   */
  bboxMarginDegrees: 1,

  /**
   * How far past `bbox` the *viewport* may extend once the map is in the city,
   * in degrees. ~2 km — enough that an edge dock is not jammed against the frame,
   * small enough that the worst-case view still has docks in it.
   *
   * Kept deliberately tight because the bbox's south edge is a single island
   * dock with open lake below it: every degree of slack here buys another
   * screenful of empty water.
   *
   * Note this fences the Bike Share *service area*, which is smaller than the
   * GTA proper — the bounds are the docks themselves, so the map goes exactly
   * where there is data and no further.
   */
  panMarginDegrees: 0.02,
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

  /**
   * Local fallback, used when CARTO cannot be reached. A flat ground with no
   * streets — but every dock still renders in its true position, so the shape of
   * the network stays readable with the wifi off (discipline #3).
   *
   * Ships with its own glyph atlas under public/basemap/fonts/, so cluster counts
   * survive offline too. Nothing in it touches the network.
   */
  offlineStyle: 'basemap/style.json',

  /** How long to wait for the CARTO style before falling back. Short: a demo on
   *  bad wifi should degrade in a beat, not hang on a blank screen. */
  styleTimeoutMs: 2500,

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
// Live status — Phase 5 stretch. An enhancement over the committed snapshot,
// never the load-bearing path.
// ---------------------------------------------------------------------------
export const LIVE = {
  /** The status feed declares ttl 10s; refreshing every 60s is current enough for
   *  a map on screen without hammering a free public endpoint. */
  refreshMs: 60_000,

  /** Short: a failed live fetch should fall back to the snapshot in a beat, not
   *  leave the map on stale data while a request hangs. */
  timeoutMs: 5_000,
} as const;

// ---------------------------------------------------------------------------
// Globe intro — Phase 5 stretch.
// ---------------------------------------------------------------------------
export const INTRO = {
  /**
   * How much of the space left over by the copy the globe should fill.
   *
   * The landing zoom is *computed* from this and the viewport, not fixed. A fixed
   * zoom pins the globe to a constant pixel size, which looks right on a laptop
   * and marooned in the middle of a 27" display.
   */
  globeFillFraction: 0.95,

  /**
   * The globe's on-screen diameter in CSS px at zoom 0, and how that diameter
   * grows per zoom level: `diameter ≈ base * 2 ** (exponent * zoom)`.
   *
   * The exponent is 0.9, not 1: MapLibre's globe is a perspective projection, so
   * the disc grows more slowly than the flat scale factor would suggest.
   * Both values are measured — 205 px at zoom 0, and the exponent fitted across
   * zooms 0/0.5/1/1.5 — and the base holds across viewport sizes.
   */
  globeBaseDiameterPx: 205,
  globeZoomExponent: 0.9,

  /** Clamp the computed zoom: below the floor the globe is a marble, above the
   *  ceiling it stops reading as a planet and becomes a curved map. The ceiling
   *  has to clear what a large display asks for — at 2560×1440 the fit wants
   *  ~2.9, and a lower cap was leaving the globe stranded in white space. */
  globeMinZoom: 0.4,
  globeMaxZoom: 3.4,

  /** Long enough to read as flight, short enough not to make anyone wait. */
  flyMs: 3600,

  /** Degrees of longitude per second while the landing globe idles. Slow enough
   *  to read as drift rather than spin. */
  spinDegreesPerSecond: 3,

  /**
   * Room reserved for the landing copy so the globe sits clear of the text
   * instead of ghosting behind it. Wide viewports put the two side by side and
   * reserve space on the left; narrow ones stack, and reserve it above.
   */
  copyGutterMinPx: 460,
  copyGutterMaxPx: 760,
  /** The gutter tracks viewport width so the copy column and the globe stay in
   *  proportion instead of the text shrinking away on a large display. */
  copyGutterWidthFraction: 0.32,
  copyStackHeightPx: 320,
  sideBySideMinWidthPx: 900,
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
