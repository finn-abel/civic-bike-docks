/**
 * coverage.ts — where you can actually get a bike, or get rid of one.
 *
 * This is the only real computation in the project, so it says plainly what it
 * does. Every figure it produces is **COMPUTED**: distance geometry over measured
 * coordinates, against one assumed distance (COVERAGE.walkRadiusMetres). No model,
 * no fitting, nothing generated.
 *
 * The method is a raster, not a union of circles. Overlapping translucent circles
 * composite where they overlap, so a dense downtown would render darker than a
 * sparse edge and read as "more covered" — which is meaningless. Coverage is
 * binary: you are either within a walk of a usable dock or you are not. A grid
 * paints each patch of ground exactly once, so it cannot imply a gradient that
 * does not exist.
 */

import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';

import { CITY, COVERAGE } from './constants';
import type { Intent } from './types';

export interface CoverageResult {
  readonly geometry: FeatureCollection;
  /** Cells within a walk of a *usable* dock. */
  readonly coveredCells: number;
  /** Cells within a walk of *any* dock — the network's own service area. */
  readonly totalCells: number;
  /** Share of that service area with nothing usable in walking distance. 0–1. */
  readonly gapFraction: number;
  /** Stations that counted toward coverage for this intent. */
  readonly usableStations: number;
  /** Stations excluded for having no availability figure at all. */
  readonly unknownStations: number;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Is this station usable right now, for what the reader is trying to do?
 *
 * A station with no availability data is not counted as usable. Claiming coverage
 * from a dock whose state is unknown would be the one dishonest thing this map
 * could do — so the gap figure treats unknown as "no", and reports the count
 * separately so the reader can see how much is unknown.
 */
function isUsable(properties: Record<string, unknown>, intent: Intent): boolean {
  const value =
    intent === 'borrow'
      ? readNumber(properties['bikes_available'])
      : readNumber(properties['docks_available']);
  return value !== null && value > 0;
}

/** Grid geometry, derived once from the service area and the cell size. */
function grid() {
  const midLat = (CITY.bbox.minLat + CITY.bbox.maxLat) / 2;
  const degLat = COVERAGE.cellMetres / COVERAGE.metresPerDegreeLat;
  const degLon =
    COVERAGE.cellMetres /
    (COVERAGE.metresPerDegreeLonEquator * Math.cos((midLat * Math.PI) / 180));

  // Extend past the docks by one walk radius, so coverage at the network's edge
  // is drawn rather than clipped off at the bounding box.
  const padLat = COVERAGE.walkRadiusMetres / COVERAGE.metresPerDegreeLat;
  const padLon =
    COVERAGE.walkRadiusMetres /
    (COVERAGE.metresPerDegreeLonEquator * Math.cos((midLat * Math.PI) / 180));

  const minLon = CITY.bbox.minLon - padLon;
  const minLat = CITY.bbox.minLat - padLat;
  const cols = Math.ceil((CITY.bbox.maxLon + padLon - minLon) / degLon);
  const rows = Math.ceil((CITY.bbox.maxLat + padLat - minLat) / degLat);

  return { minLon, minLat, degLon, degLat, cols, rows, midLat };
}

/**
 * Merge each row's covered cells into runs before emitting polygons.
 *
 * A 250 m grid over the service area is ~19,000 cells. Emitting one square each
 * would hand MapLibre 19,000 polygons to redraw every time the live feed lands.
 * Coverage is contiguous, so run-length encoding each row collapses that to a few
 * hundred rectangles with identical output.
 */
function runsToFeatures(
  covered: Uint8Array,
  g: ReturnType<typeof grid>,
): Feature<Polygon>[] {
  const features: Feature<Polygon>[] = [];

  for (let row = 0; row < g.rows; row += 1) {
    let runStart = -1;

    for (let col = 0; col <= g.cols; col += 1) {
      const isCovered = col < g.cols && covered[row * g.cols + col] === 1;

      if (isCovered && runStart === -1) {
        runStart = col;
      } else if (!isCovered && runStart !== -1) {
        const west = g.minLon + runStart * g.degLon;
        const east = g.minLon + col * g.degLon;
        const south = g.minLat + row * g.degLat;
        const north = south + g.degLat;

        features.push({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
              ],
            ],
          },
        });
        runStart = -1;
      }
    }
  }

  return features;
}

/**
 * Stamp a walk radius around every usable station onto the grid.
 *
 * Works outward from the stations rather than inward from the cells: for each
 * station, only the cells in its own bounding box are tested. That is ~1000
 * stations × ~30 cells instead of 19,000 cells × 1000 stations, which is the
 * difference between rebuilding inside a frame and blocking the page.
 */
export function buildCoverage(
  stations: FeatureCollection,
  intent: Intent,
): CoverageResult {
  const g = grid();
  const covered = new Uint8Array(g.rows * g.cols);
  // Where the network reaches at all, regardless of what is parked there right
  // now. This is the denominator, and it does not move when availability does —
  // so the gap figure reflects bikes moving, not the measured area changing.
  const reached = new Uint8Array(g.rows * g.cols);
  const radius = COVERAGE.walkRadiusMetres;

  const metresPerDegLon =
    COVERAGE.metresPerDegreeLonEquator * Math.cos((g.midLat * Math.PI) / 180);
  const stamp = (
    grid: Uint8Array,
    lon: number,
    lat: number,
    reach: number,
  ): void => {
    const cols = Math.ceil(reach / (g.degLon * metresPerDegLon));
    const rows = Math.ceil(reach / (g.degLat * COVERAGE.metresPerDegreeLat));
    const centreCol = Math.floor((lon - g.minLon) / g.degLon);
    const centreRow = Math.floor((lat - g.minLat) / g.degLat);

    for (let row = centreRow - rows; row <= centreRow + rows; row += 1) {
      if (row < 0 || row >= g.rows) continue;
      const cellLat = g.minLat + (row + 0.5) * g.degLat;
      const dy = (cellLat - lat) * COVERAGE.metresPerDegreeLat;

      for (let col = centreCol - cols; col <= centreCol + cols; col += 1) {
        if (col < 0 || col >= g.cols) continue;
        const index = row * g.cols + col;
        if (grid[index] === 1) continue;

        const cellLon = g.minLon + (col + 0.5) * g.degLon;
        const dx = (cellLon - lon) * metresPerDegLon;

        // Equirectangular distance. At city scale the error against a great
        // circle is centimetres — far below the grid resolution.
        if (dx * dx + dy * dy <= reach * reach) grid[index] = 1;
      }
    }
  };

  let usableStations = 0;
  let unknownStations = 0;

  for (const feature of stations.features) {
    const properties = feature.properties ?? {};

    // Every feature reaching here has passed assertStationCollection, so the
    // geometry is a Point; the general GeoJSON type just cannot say so.
    const [lon, lat] = (feature.geometry as Point).coordinates as [number, number];

    // Every dock defines the served area, whether or not it is usable today.
    // Same radius as the numerator, so the ratio measures availability and
    // nothing else; and it does not move when bikes do, so the denominator is
    // stable while the figure above it changes.
    stamp(reached, lon, lat, radius);

    const hasFigure =
      readNumber(properties['bikes_available']) !== null ||
      readNumber(properties['docks_available']) !== null;
    if (!hasFigure) {
      unknownStations += 1;
      continue;
    }
    if (!isUsable(properties, intent)) continue;

    usableStations += 1;
    stamp(covered, lon, lat, radius);
  }

  // Measured over the network's own service area, not the bounding box. The box
  // is mostly land the system never claimed — counting it inflated the gap to
  // ~80% and said nothing about the network.
  let coveredCells = 0;
  let totalCells = 0;
  for (let index = 0; index < reached.length; index += 1) {
    if (reached[index] !== 1) continue;
    totalCells += 1;
    if (covered[index] === 1) coveredCells += 1;
  }

  return {
    geometry: { type: 'FeatureCollection', features: runsToFeatures(covered, g) },
    coveredCells,
    totalCells,
    gapFraction: totalCells === 0 ? 0 : 1 - coveredCells / totalCells,
    usableStations,
    unknownStations,
  };
}
