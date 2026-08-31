/**
 * map.ts — the map: camera, error surface, and wiring.
 *
 * Acceptance criterion (Phase 3): clicking any dot shows its details, zooming out
 * clusters the dots, zooming in expands them. Swapping the data file is Phase 4,
 * and nothing in this file should have to change for it.
 */

import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';

// MapLibre v6 resolves its worker at runtime via `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)`. Rollup cannot see through that, so the chunk is never emitted
// and the built site 404s on it.
//
// `?worker&url` makes Vite bundle the worker as its own entry — pulling in the
// maplibre-gl-shared.mjs chunk it imports — and hand back the emitted URL, which
// setWorkerUrl points MapLibre at. A plain `?url` is not enough: that copies the
// file verbatim and leaves its relative import dangling.
//
// Without this the map still draws, but every tile is parsed on the main thread.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import { BASEMAP, CITY } from './constants';
import { wireInteractions } from './interactions';
import { addStationLayers } from './layers';
import { loadStations } from './stations';

setWorkerUrl(maplibreWorkerUrl);

const container = document.getElementById('map');
if (!container) {
  throw new Error('map.ts: no #map element — index.html and map.ts disagree.');
}

export const map = new MapLibreMap({
  container,
  style: BASEMAP.style,
  center: CITY.center,
  zoom: CITY.zoom,
  attributionControl: false,
});

map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
// The style supplies its own OSM/CARTO attribution — passing customAttribution
// here as well prints it twice. Compact so it stays out of the map's way.
map.addControl(new AttributionControl({ compact: true }), 'bottom-left');

/** Surface a failure on screen. A silent grey rectangle is the worst possible
 *  failure mode in a demo — better to say what broke. */
function showFailure(message: string, cause: unknown): void {
  console.error(`[map] ${message}`, cause);
  const banner = document.getElementById('map-error');
  if (!banner) return;
  banner.textContent = message;
  banner.removeAttribute('hidden');
}

// Basemap tiles are the only network dependency at runtime; MapLibre itself is
// bundled, and the station census is a committed static file.
map.on('error', (event) => {
  showFailure('Basemap tiles didn’t load. Check the network connection.', event.error);
});

// Fetch the census in parallel with the style load rather than after it — the two
// are independent, and waiting for the style first would add a needless round trip.
const stationsReady = loadStations();

map.on('load', () => {
  void stationsReady
    .then((stations) => {
      addStationLayers(map, stations);
      wireInteractions(map);
    })
    .catch((error: unknown) => {
      showFailure(
        error instanceof Error
          ? `Station data failed to load: ${error.message}`
          : 'Station data failed to load.',
        error,
      );
    });
});
