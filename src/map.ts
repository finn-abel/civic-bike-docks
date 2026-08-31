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

/** Surface a message on the map. A silent grey rectangle is the worst possible
 *  failure mode in a demo — better to say what happened. */
function showNotice(message: string, tone: 'error' | 'info', cause?: unknown): void {
  if (cause !== undefined) console.error(`[map] ${message}`, cause);
  const banner = document.getElementById('map-error');
  if (!banner) return;
  banner.textContent = message;
  banner.classList.toggle('notice--info', tone === 'info');
  banner.removeAttribute('hidden');
}

/**
 * Pick a basemap style before building the map.
 *
 * The basemap is the only thing here that still needs the network. If it is
 * unreachable, MapLibre never fires `load`, no layers are ever added, and the page
 * shows an empty rectangle — the data is all local, but you would never know it.
 *
 * So probe the style first and fall back to the vendored one. Offline you lose the
 * streets; you keep all 1063 docks, the clustering, and the panel.
 */
async function resolveStyle(): Promise<{ style: string; online: boolean }> {
  try {
    const response = await fetch(BASEMAP.style, {
      signal: AbortSignal.timeout(BASEMAP.styleTimeoutMs),
    });
    if (response.ok) return { style: BASEMAP.style, online: true };
  } catch {
    // Unreachable or too slow — fall through to the local style.
  }
  return { style: BASEMAP.offlineStyle, online: false };
}

// Start the census fetch immediately; it does not depend on the style. Both are
// local files in the built site, so this costs nothing and saves a round trip.
const stationsReady = loadStations();
const { style, online } = await resolveStyle();

export const map = new MapLibreMap({
  container,
  style,
  center: CITY.center,
  zoom: CITY.zoom,
  attributionControl: false,
});

map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
// The CARTO style supplies its own OSM/CARTO attribution — passing
// customAttribution as well prints it twice. The offline style has none to give.
map.addControl(new AttributionControl({ compact: true }), 'bottom-left');

if (!online) {
  showNotice('Offline — showing docks without the street map.', 'info');
}

map.on('error', (event) => {
  showNotice('Something went wrong drawing the map.', 'error', event.error);
});

map.on('load', () => {
  void stationsReady
    .then((stations) => {
      addStationLayers(map, stations);
      wireInteractions(map);
    })
    .catch((error: unknown) => {
      showNotice(
        error instanceof Error
          ? `Station data failed to load: ${error.message}`
          : 'Station data failed to load.',
        'error',
        error,
      );
    });
});
