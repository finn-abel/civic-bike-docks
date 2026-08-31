/**
 * layers.ts — Phase 3. The station source and the three layers drawn off it.
 *
 * Layer order matters: clusters, then their counts, then individual stations.
 *
 * Design values live here rather than in constants.ts. That file holds figures
 * with a *source* — coordinates, feed URLs, cluster geometry — and every one of
 * them carries the citation it came from. A circle radius has no citation; it is
 * a design decision, and mixing the two would dilute what constants.ts is for.
 */

import type { DataDrivenPropertyValueSpecification, ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';

import { CLUSTER, IDS } from './constants';

/**
 * Fullness ramp — SEQUENTIAL (magnitude: how many bikes are here), so it is one
 * hue stepping light → dark. Monotonic in OKLCH lightness: 0.62 → 0.48 → 0.34.
 *
 * Deliberately NOT the green→red the build plan suggests. Red/green is the single
 * worst pairing for red-green colour blindness (~8% of men), and a two-hue ramp
 * with no neutral midpoint is a diverging scale used where a sequential one
 * belongs. More ink = more bikes reads just as fast and works for everyone.
 *
 * Every step clears 3:1 against the Positron basemap, so no dot ever fades into
 * the map. Colour is never the only channel: the panel prints exact numbers.
 */
const FULLNESS_RAMP = {
  empty: '#3987e5',
  half: '#1c5cab',
  full: '#0d366b',
} as const;

/** A station with no availability data — capacity 0, or no status feed joined.
 *  Drawn hollow rather than in a fourth colour: "no data" is a different KIND of
 *  thing from a low value, so it gets a different shape, not a nearby hue. */
const NO_DATA = {
  fill: '#ffffff',
  stroke: '#6b6b66',
} as const;

const STATION = {
  /** Radius interpolates over capacity. Floor is generous enough that the
   *  smallest dock is still an easy click target. */
  radiusAtMinCapacity: 4.5,
  radiusAtMaxCapacity: 11,
  minCapacity: 0,
  maxCapacity: 50,
  strokeColor: '#ffffff',
  strokeWidth: 1.5,
  strokeWidthHover: 3,
} as const;

const CLUSTER_STYLE = {
  /** Clusters are deliberately neutral ink, not a step on the fullness ramp.
   *  A cluster has no single fullness — colouring it by one would be a lie. */
  color: '#2f3340',
  colorHover: '#171a22',
  textColor: '#ffffff',
  /** Radius steps by how many stations a cluster holds. */
  radiusSmall: 15,
  radiusMedium: 20,
  radiusLarge: 26,
  breakMedium: 10,
  breakLarge: 30,
  /** A stack CARTO's glyph server serves; verified against the style's endpoint. */
  font: ['Montserrat Medium', 'Open Sans Bold'],
  textSize: 12,
} as const;

/** `fullness` is null for no-data stations. MapLibre expressions cannot compare to
 *  null directly, so coalesce it to a sentinel outside the real 0–1 range. */
const NO_DATA_SENTINEL = -1;
const fullnessOrSentinel: ExpressionSpecification = [
  'coalesce',
  ['get', 'fullness'],
  NO_DATA_SENTINEL,
];

const stationColor: DataDrivenPropertyValueSpecification<string> = [
  'case',
  ['==', fullnessOrSentinel, NO_DATA_SENTINEL],
  NO_DATA.fill,
  [
    'interpolate',
    ['linear'],
    fullnessOrSentinel,
    0,
    FULLNESS_RAMP.empty,
    0.5,
    FULLNESS_RAMP.half,
    1,
    FULLNESS_RAMP.full,
  ],
];

const stationStrokeColor: DataDrivenPropertyValueSpecification<string> = [
  'case',
  ['==', fullnessOrSentinel, NO_DATA_SENTINEL],
  NO_DATA.stroke,
  STATION.strokeColor,
];

/** Grow the ring on hover rather than the dot itself — the dot's radius already
 *  encodes capacity, so animating it would corrupt the reading. */
const stationStrokeWidth: DataDrivenPropertyValueSpecification<number> = [
  'case',
  ['boolean', ['feature-state', 'hover'], false],
  STATION.strokeWidthHover,
  STATION.strokeWidth,
];

const stationRadius: DataDrivenPropertyValueSpecification<number> = [
  'interpolate',
  ['linear'],
  ['get', 'capacity'],
  STATION.minCapacity,
  STATION.radiusAtMinCapacity,
  STATION.maxCapacity,
  STATION.radiusAtMaxCapacity,
];

/** Add the clustered source and its three layers to an already-loaded map. */
export function addStationLayers(map: MapLibreMap, data: GeoJSON.FeatureCollection): void {
  map.addSource(IDS.source, {
    type: 'geojson',
    data,
    cluster: true,
    clusterRadius: CLUSTER.radius,
    clusterMaxZoom: CLUSTER.maxZoom,
    // Hover highlighting sets feature-state by id, and GeoJSON features have none.
    generateId: true,
  });

  map.addLayer({
    id: IDS.clusterCircles,
    type: 'circle',
    source: IDS.source,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        CLUSTER_STYLE.colorHover,
        CLUSTER_STYLE.color,
      ],
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        CLUSTER_STYLE.radiusSmall,
        CLUSTER_STYLE.breakMedium,
        CLUSTER_STYLE.radiusMedium,
        CLUSTER_STYLE.breakLarge,
        CLUSTER_STYLE.radiusLarge,
      ],
      'circle-stroke-width': STATION.strokeWidth,
      'circle-stroke-color': STATION.strokeColor,
    },
  });

  map.addLayer({
    id: IDS.clusterCounts,
    type: 'symbol',
    source: IDS.source,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': [...CLUSTER_STYLE.font],
      'text-size': CLUSTER_STYLE.textSize,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': CLUSTER_STYLE.textColor },
  });

  map.addLayer({
    id: IDS.unclusteredPoints,
    type: 'circle',
    source: IDS.source,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': stationColor,
      'circle-radius': stationRadius,
      'circle-stroke-width': stationStrokeWidth,
      'circle-stroke-color': stationStrokeColor,
    },
  });
}

/** The ramp, for the legend — so the swatches cannot drift from the map. */
export const LEGEND_SWATCHES = [
  { label: 'Empty', color: FULLNESS_RAMP.empty },
  { label: '', color: FULLNESS_RAMP.half },
  { label: 'Full', color: FULLNESS_RAMP.full },
] as const;

export const LEGEND_NO_DATA = NO_DATA;
