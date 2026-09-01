/**
 * layers.ts — the station source and the three layers drawn off it.
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
import type { Intent } from './types';
import type { Theme } from './theme';

/**
 * Fullness ramp — SEQUENTIAL (magnitude: how many bikes are here), so it is one
 * hue stepping light → dark. Monotonic in OKLCH lightness: 0.605 → 0.468 → 0.332,
 * in even steps.
 *
 * The hue is Bike Share Toronto's own tangerine, so a dot reads as the thing it
 * stands for. The bikes' exact colour (#eb6834) is deliberately NOT a step here:
 * at 2.98:1 on the basemap it fades into the map. It lives in styles.css as
 * --color-brand, for fills and the CTA, where contrast is not the constraint.
 *
 * Also deliberately not green→red. Red/green is the single worst pairing for
 * red-green colour blindness (~8% of men), and a two-hue ramp with no neutral
 * midpoint is a diverging scale used where a sequential one belongs. More ink =
 * more bikes reads just as fast, for everyone.
 *
 * Every step clears 3:1 against the basemap. Colour is never the only channel:
 * the panel prints exact numbers and the legend labels both ends.
 */
const FULLNESS_RAMP: Record<Theme, { empty: string; half: string; full: string }> = {
  /** On paper the ramp runs light → dark: more ink means more bikes.
   *  L 0.605 / 0.468 / 0.332, each ≥3:1 on the light basemap. */
  light: { empty: '#d2551f', half: '#96380f', full: '#5c200a' },

  /**
   * On a near-black ground the ramp runs the other way — dim → bright — because
   * "more" has to mean *more light* when the page is dark. These are their own
   * steps chosen against #0e0e0e, not the light ramp inverted: the light ramp's
   * dark end measures 1.4:1 there and would vanish into the basemap.
   *
   * L 0.508 / 0.605 / 0.709, evenly stepped, each ≥3:1 on the dark basemap.
   */
  dark: { empty: '#a83f14', half: '#d2551f', full: '#f4793f' },
};

/** A station with no availability data — capacity 0, or no status feed joined.
 *  Drawn hollow rather than in a fourth colour: "no data" is a different KIND of
 *  thing from a low value, so it gets a different shape, not a nearby hue. */
const NO_DATA: Record<Theme, { fill: string; stroke: string }> = {
  light: { fill: '#ffffff', stroke: '#6b6b66' },
  /** Hollow still means hollow: the fill is the ground, so the ring is all
   *  there is. On dark that means a dark centre and a light ring. */
  dark: { fill: '#0e0e0e', stroke: '#8a8a84' },
};

const STATION = {
  /** Radius interpolates over capacity. Floor is generous enough that the
   *  smallest dock is still an easy click target. */
  radiusAtMinCapacity: 4.5,
  radiusAtMaxCapacity: 11,
  minCapacity: 0,
  maxCapacity: 50,
  strokeWidth: 1.5,
  strokeWidthHover: 3,
} as const;

/** The ring that lifts a mark off the basemap. It is the ground colour, not
 *  white — a white ring on a near-black map reads as a halo, not an edge. */
const RING: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#0e0e0e',
};

const CLUSTER_STYLE = {
  /**
   * Clusters wear the bikes' own tangerine — the brand colour, and pointedly NOT
   * a step on the fullness ramp. A cluster has no single fullness; colouring it
   * by one would be a lie.
   *
   * That leaves it close to the ramp's lightest step in hue (ΔE 6.6), so the
   * separation is carried structurally instead: a cluster is 15–26px against a
   * station's 4.5–11px, it is the *only* mark that ever contains a number, and
   * the white ring holds it off the basemap. Nothing here rests on hue.
   *
   * The numeral is ink, not white: white on this orange is 3.20:1 and fails,
   * ink is 5.11:1. Hover lifts rather than deepens, matching the CTA.
   */
  color: '#eb6834',
  colorHover: '#f4793f',
  textColor: '#231f1b',
  /** Deliberately the same tangerine in both themes: a cluster is the brand
   *  mark, and holding it steady across the swap is what keeps the map feeling
   *  like one thing. Against the dark ramp it measures ΔE 9.0 from the brightest
   *  step — close, and separated the same structural way as on light: size, the
   *  numeral, and the ring. */
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

/** MapLibre expressions cannot compare to null, so coalesce to a sentinel
 *  outside the real 0–1 range. */
const NO_DATA_SENTINEL = -1;

/**
 * How good this station is for what the reader is trying to do, 0–1.
 *
 * Borrowing reads `fullness` (bikes ÷ capacity). Returning reads the free docks
 * instead — NOT `1 - fullness`, because bikes and free docks do not have to add
 * up to capacity: a dock can be out of service, holding neither. Deriving one
 * from the other would quietly invent capacity that is not there.
 */
function usefulness(intent: Intent): ExpressionSpecification {
  if (intent === 'borrow') {
    return ['coalesce', ['get', 'fullness'], NO_DATA_SENTINEL];
  }
  return [
    'case',
    [
      'any',
      ['!', ['has', 'docks_available']],
      ['==', ['coalesce', ['get', 'docks_available'], NO_DATA_SENTINEL], NO_DATA_SENTINEL],
      ['<=', ['coalesce', ['get', 'capacity'], 0], 0],
    ],
    NO_DATA_SENTINEL,
    ['/', ['get', 'docks_available'], ['get', 'capacity']],
  ];
}

function stationColor(
  intent: Intent,
  theme: Theme,
): DataDrivenPropertyValueSpecification<string> {
  const value = usefulness(intent);
  const ramp = FULLNESS_RAMP[theme];
  return [
    'case',
    ['==', value, NO_DATA_SENTINEL],
    NO_DATA[theme].fill,
    ['interpolate', ['linear'], value, 0, ramp.empty, 0.5, ramp.half, 1, ramp.full],
  ];
}

function stationStrokeColor(
  intent: Intent,
  theme: Theme,
): DataDrivenPropertyValueSpecification<string> {
  return [
    'case',
    ['==', usefulness(intent), NO_DATA_SENTINEL],
    NO_DATA[theme].stroke,
    RING[theme],
  ];
}

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

/** Repaint the station dots when the reader switches intent. */
export function setStationIntent(
  map: MapLibreMap,
  intent: Intent,
  theme: Theme,
): void {
  if (!map.getLayer(IDS.unclusteredPoints)) return;
  map.setPaintProperty(IDS.unclusteredPoints, 'circle-color', stationColor(intent, theme));
  map.setPaintProperty(
    IDS.unclusteredPoints,
    'circle-stroke-color',
    stationStrokeColor(intent, theme),
  );
}

/** Add the clustered source and its three layers to an already-loaded map. */
export function addStationLayers(
  map: MapLibreMap,
  data: GeoJSON.FeatureCollection,
  intent: Intent,
  theme: Theme,
): void {
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
      'circle-stroke-color': RING[theme],
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
      'circle-color': stationColor(intent, theme),
      'circle-radius': stationRadius,
      'circle-stroke-width': stationStrokeWidth,
      'circle-stroke-color': stationStrokeColor(intent, theme),
    },
  });
}

/** The ramp, for the legend — so the swatches cannot drift from the map. */
/** The ramp and the hollow mark, for the legend — read from the same constants
 *  the map paints with, so the swatches cannot drift from the dots. */
export function legendPalette(theme: Theme): {
  ramp: readonly string[];
  noData: { fill: string; stroke: string };
} {
  const ramp = FULLNESS_RAMP[theme];
  return { ramp: [ramp.empty, ramp.half, ramp.full], noData: NO_DATA[theme] };
}

/**
 * The coverage wash.
 *
 * Added beneath the cluster circles so the dots always read on top of it — the
 * wash is context, not the subject.
 */
export function addCoverageLayer(
  map: MapLibreMap,
  data: GeoJSON.FeatureCollection,
  theme: Theme,
): void {
  map.addSource(IDS.coverageSource, { type: 'geojson', data });

  map.addLayer(
    {
      id: IDS.coverageFill,
      type: 'fill',
      source: IDS.coverageSource,
      paint: {
        'fill-color': COVERAGE_STYLE[theme].color,
        'fill-opacity': COVERAGE_STYLE[theme].opacity,
        // The grid is emitted as edge-to-edge rectangles. Antialiasing would draw
        // a seam along every shared border and quilt the wash.
        'fill-antialias': false,
      },
    },
    IDS.clusterCircles,
  );
}

const COVERAGE_STYLE: Record<Theme, { color: string; opacity: number }> = {
  /** The brand tangerine at low opacity: the wash belongs to the same system as
   *  the dots without competing with them for attention. */
  light: { color: '#eb6834', opacity: 0.16 },
  /** Brighter and weaker on dark. A low-opacity wash over near-black barely
   *  registers, but push the opacity and it swamps the dots — so the colour does
   *  the lifting instead. */
  dark: { color: '#f9a077', opacity: 0.10 },
};

/** The legend swatch has to match whatever the wash actually paints. */
export function coverageSwatch(theme: Theme): { color: string; opacity: number } {
  return COVERAGE_STYLE[theme];
}

export function setCoverageVisible(map: MapLibreMap, visible: boolean): void {
  if (!map.getLayer(IDS.coverageFill)) return;
  map.setLayoutProperty(IDS.coverageFill, 'visibility', visible ? 'visible' : 'none');
}
