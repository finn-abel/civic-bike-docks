/**
 * map.ts — the map: camera, error surface, and wiring.
 *
 * Clicking any dot shows its details; zooming out clusters the dots; zooming in
 * expands them. The map reads a stable GeoJSON contract, so swapping data files
 * does not require UI changes.
 */

import type { FeatureCollection } from 'geojson';
import {
  AJAXError,
  AttributionControl,
  type GeoJSONSource,
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

import { BASEMAP, CITY, IDS } from './constants';
import {
  readingIntent,
  setCoverageReadout,
  setLegendIntent,
  setLegendTheme,
  showReadout,
  wireIntentToggle,
} from './controls';
import { buildCoverage } from './coverage';
import { wireInteractions } from './interactions';
import { reapplyLandingCamera, skipLanding, startLanding } from './landing';
import {
  addCoverageLayer,
  addStationLayers,
  setCoverageVisible,
  setStationIntent,
} from './layers';
import type { Freshness } from './live';
import { startLiveUpdates } from './live';
import { loadStations } from './stations';
import { startTheme, type Theme } from './theme';
import type { CoverageMode } from './types';

setWorkerUrl(maplibreWorkerUrl);

const container = document.getElementById('map');
if (!container) {
  throw new Error('map.ts: no #map element — index.html and map.ts disagree.');
}

/** Surface a message on the map. A silent grey rectangle is the worst possible
 *  failure mode — better to say what happened. */
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
async function resolveStyle(theme: Theme): Promise<{ style: string; online: boolean }> {
  const remote = theme === 'dark' ? BASEMAP.styleDark : BASEMAP.style;
  const local = theme === 'dark' ? BASEMAP.offlineStyleDark : BASEMAP.offlineStyle;
  try {
    const response = await fetch(remote, {
      signal: AbortSignal.timeout(BASEMAP.styleTimeoutMs),
    });
    if (response.ok) return { style: remote, online: true };
  } catch {
    // Unreachable or too slow — fall through to the local style.
  }
  return { style: local, online: false };
}

// Start the census fetch immediately; it does not depend on the style. Both are
// local files in the built site, so this costs nothing and saves a round trip.
const stationsReady = loadStations();

/**
 * The theme is resolved before the map is built, because the basemap style is
 * part of it — a light map under a dark page is not a theme, it is a bug.
 */
let theme: Theme = startTheme((next) => {
  void swapTheme(next);
});
const { style, online } = await resolveStyle(theme);

/**
 * `?nointro` drops straight into the city — a landing screen is right once and
 * tiresome on every reload during development, and the test suite needs a way in
 * that does not depend on clicking through it.
 *
 * Reduced motion still gets the landing: it is a page with a control on it, not
 * an animation. What it loses is the idle spin and the flight, not the choice.
 */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wantsLanding = !new URLSearchParams(window.location.search).has('nointro');

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
  // Individual tiles fail all the time — a flaky connection, a CDN edge having a
  // moment. MapLibre retries and the map heals itself, so a banner here would be
  // pure noise that outlives the problem it describes. Log it and move on.
  //
  // A failed resource fetch arrives as an AJAXError; anything else is a style or
  // runtime fault worth telling someone about. (A basemap that fails outright
  // never reaches here at all — resolveStyle catches that first.)
  if (event.error instanceof AJAXError) {
    console.warn(`[map] resource request failed: ${event.error.url}`, event.error.status);
    return;
  }
  showNotice('Something went wrong drawing the map.', 'error', event.error);
});

/** Caption the availability figures with how old they are. A number on screen
 *  should say whether it is current. */
function showFreshness(freshness: Freshness): void {
  const element = document.getElementById('freshness');
  if (!element) return;

  if (freshness.kind === 'live') {
    element.textContent = `Live · ${formatClock(freshness.at)}`;
    element.classList.add('freshness--live');
    return;
  }

  element.textContent = freshness.at
    ? `Snapshot · ${formatDay(freshness.at)}`
    : 'Snapshot';
  element.classList.remove('freshness--live');
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/** The rail is the map's chrome, so it stays out of the way until there is a map
 *  to put chrome on. */
function revealChrome(): void {
  arrived = true;
  document.querySelector('.rail')?.classList.add('rail--visible');
}

/**
 * The current census, kept so coverage can be recomputed without refetching —
 * both when the reader switches intent and when the live feed lands.
 */
let census: FeatureCollection | null = null;
let mode: CoverageMode = 'borrow';

/**
 * Put the sources and layers back.
 *
 * `setStyle` replaces the whole style document, which takes every source and
 * layer with it. Event handlers survive — they are bound to the map, not the
 * style — so interactions are wired once at startup and simply start working
 * again when their layers reappear.
 */
function installLayers(): void {
  if (!census) return;
  addStationLayers(map, census, readingIntent(mode), theme);
  addCoverageLayer(map, buildCoverage(census, readingIntent(mode)).geometry, theme);
}

/** True once the camera has settled over the city and the fence is up. */
let arrived = false;

/** Swap the basemap and rebuild everything drawn on top of it. */
async function swapTheme(next: Theme): Promise<void> {
  theme = next;
  setLegendTheme(theme);

  const resolved = await resolveStyle(theme);
  map.setStyle(resolved.style);

  map.once('style.load', () => {
    // The projection is part of the style, so it resets with it — and which
    // projection is right depends on where in the flow we are. Forcing Mercator
    // unconditionally flattened the globe mid-landing; leaving it alone lets the
    // camera fence go slack after arrival. Both need saying explicitly.
    if (arrived) {
      map.setProjection({ type: 'mercator' });
    } else {
      reapplyLandingCamera(map);
    }

    installLayers();
    applyMode(mode);
  });
}

/** Recompute coverage and repaint everything that depends on the chosen mode. */
function applyMode(next: CoverageMode): void {
  mode = next;
  setLegendIntent(mode);
  if (!census) return;

  setStationIntent(map, readingIntent(mode), theme);

  if (mode === 'none') {
    // Skip the computation entirely rather than building a wash nobody will see.
    setCoverageVisible(map, false);
    showReadout(false);
    return;
  }

  setCoverageVisible(map, true);
  const result = buildCoverage(census, mode);
  const source = map.getSource(IDS.coverageSource) as GeoJSONSource | undefined;
  if (source) void source.setData(result.geometry);
  setCoverageReadout(result, mode);
}

map.on('load', () => {
  if (wantsLanding) {
    startLanding(map, { reducedMotion: prefersReducedMotion, onArrive: revealChrome });
  } else {
    skipLanding(map, revealChrome);
  }

  void stationsReady
    .then(({ data, generatedAt }) => {
      census = data;

      // Stations first: addCoverageLayer anchors itself beneath the cluster
      // layer, which has to exist before it can be named.
      addStationLayers(map, data, readingIntent(mode), theme);
      const initial = buildCoverage(census, readingIntent(mode));
      addCoverageLayer(map, initial.geometry, theme);

      // Wired once. The handlers outlive every style swap; only the layers they
      // reference are rebuilt.
      wireInteractions(map);

      setLegendTheme(theme);
      setLegendIntent(mode);
      setCoverageReadout(initial, readingIntent(mode));
      wireIntentToggle(applyMode);
      showFreshness({ kind: 'snapshot', at: generatedAt });

      // Live availability layered over the snapshot, never in place of it.
      // Coverage is derived from availability, so it has to move with it.
      if (online) {
        startLiveUpdates(map, data, showFreshness, (updated) => {
          census = updated;
          applyMode(mode);
        });
      }
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

// Dev-only handle for poking at the camera from the console or a test harness.
// Stripped from production builds by the `import.meta.env.DEV` guard.
if (import.meta.env.DEV) {
  (window as unknown as { __map?: MapLibreMap }).__map = map;
}
