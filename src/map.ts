/**
 * map.ts — Phase 0: the blank map.
 *
 * Acceptance criterion: pan and zoom an empty basemap of Toronto.
 * No data source, no layers, no click handling — those are Phases 2-3.
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

// Basemap tiles are this phase's only network dependency. If they fail, say so on
// screen — a silent grey rectangle is the worst possible failure mode in a demo.
map.on('error', (event) => {
  console.error('[map]', event.error);
  document.getElementById('map-error')?.removeAttribute('hidden');
});
