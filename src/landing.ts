/**
 * landing.ts — the opening screen and the camera contract that follows it.
 *
 * Three jobs, in order:
 *   1. Hold on the globe behind a title card until someone chooses to start.
 *   2. Fly down to the city on that choice.
 *   3. Fence the camera to the service area, so from then on the map only goes
 *      where there is data to show.
 *
 * Step 3 is the reason this is one module rather than three: the fence must be
 * installed *after* the flight, because it would otherwise forbid the globe the
 * flight starts from.
 */

import { LngLatBounds, type Map as MapLibreMap } from 'maplibre-gl';

import { CITY, INTRO } from './constants';

/** The camera fence: the dock bbox plus a margin. Built once, used for both the
 *  pan limit and the zoom floor, so the two can never disagree. */
export function serviceAreaBounds(): LngLatBounds {
  const margin = CITY.panMarginDegrees;
  return new LngLatBounds(
    [CITY.bbox.minLon - margin, CITY.bbox.minLat - margin],
    [CITY.bbox.maxLon + margin, CITY.bbox.maxLat + margin],
  );
}

/**
 * Where to make room for the landing copy.
 *
 * Camera padding, not CSS: the globe is drawn by the map, so the only way to move
 * it out from behind the text is to tell the camera its usable frame is smaller.
 */
function copyPadding(): { top: number; right: number; bottom: number; left: number } {
  const sideBySide = window.innerWidth >= INTRO.sideBySideMinWidthPx;
  const gutter = Math.min(
    Math.max(window.innerWidth * INTRO.copyGutterWidthFraction, INTRO.copyGutterMinPx),
    INTRO.copyGutterMaxPx,
  );
  return {
    top: sideBySide ? 0 : INTRO.copyStackHeightPx,
    right: 0,
    bottom: 0,
    left: sideBySide ? gutter : 0,
  };
}

const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 } as const;

/**
 * The zoom that makes the globe fill the space the copy leaves it.
 *
 * Inverts `diameter ≈ base * 2 ** (exponent * zoom)` for the diameter we want,
 * which is a fraction of the smaller side of the leftover frame — the globe is a
 * disc, so the tighter dimension is what constrains it.
 */
function globeZoom(): number {
  const padding = copyPadding();
  const usableWidth = window.innerWidth - padding.left;
  const usableHeight = window.innerHeight - padding.top;
  const target = Math.min(usableWidth, usableHeight) * INTRO.globeFillFraction;

  const zoom =
    Math.log2(target / INTRO.globeBaseDiameterPx) / INTRO.globeZoomExponent;
  return Math.min(Math.max(zoom, INTRO.globeMinZoom), INTRO.globeMaxZoom);
}

/**
 * Fence the camera to the service area.
 *
 * `maxBounds` alone is not enough: it clamps the centre but still lets you zoom
 * out until Lake Erie fills the frame. The zoom floor is what actually stops that,
 * and it has to be computed from the viewport — the zoom that fits the service
 * area on a desktop leaves half of it off-screen on a phone.
 */
function fenceCamera(map: MapLibreMap): void {
  const bounds = serviceAreaBounds();

  const applyZoomFloor = (): void => {
    const camera = map.cameraForBounds(bounds, { padding: 24 });
    if (camera?.zoom === undefined) return;
    // Floor it slightly so the whole area is always reachable rather than
    // sitting a hair outside the limit.
    map.setMinZoom(camera.zoom - 0.15);
  };

  applyZoomFloor();
  map.setMaxBounds(bounds);

  // A rotated phone changes which zoom fits the area, so recompute on resize.
  map.on('resize', applyZoomFloor);
}

interface LandingOptions {
  /** Reduced motion: no idle spin, and arrival is a cut rather than a flight. */
  readonly reducedMotion: boolean;
  /** Called once the camera has settled over the city. */
  readonly onArrive: () => void;
}

/**
 * Show the landing card over an idling globe and wire the start control.
 *
 * Returns nothing: everything after the click is driven by the map's own camera
 * events, so there is no state here for a caller to get wrong.
 */
export function startLanding(map: MapLibreMap, options: LandingOptions): void {
  const landing = document.getElementById('landing');
  const startButton = document.getElementById('start');

  map.setProjection({ type: 'globe' });

  const frameGlobe = (): void => {
    map.jumpTo({ zoom: globeZoom(), padding: copyPadding() });
  };

  map.jumpTo({ center: CITY.center, zoom: globeZoom(), padding: copyPadding() });

  // The globe is sized to the viewport, so it has to be resized with it — and a
  // resize can also flip the layout between side-by-side and stacked.
  map.on('resize', frameGlobe);
  const stopFraming = (): void => {
    map.off('resize', frameGlobe);
  };

  // Scroll-zoom on a title card is a trap — a stray wheel event should not throw
  // you into the map before you have chosen to go. Restored on arrival.
  map.scrollZoom.disable();
  map.doubleClickZoom.disable();

  // Drive the spin off elapsed time, not frame count: requestAnimationFrame is
  // 120Hz on a ProMotion display and throttled in a background tab, so a
  // per-frame step would spin at double speed on one and stall on the other.
  let spinning = !options.reducedMotion;
  let lastFrame: number | null = null;
  const spin = (now: number): void => {
    if (!spinning) return;
    const elapsedSeconds = lastFrame === null ? 0 : (now - lastFrame) / 1000;
    lastFrame = now;
    const centre = map.getCenter();
    // Drift west, so the Americas turn toward the viewer rather than away.
    map.setCenter([
      centre.lng - INTRO.spinDegreesPerSecond * elapsedSeconds,
      centre.lat,
    ]);
    window.requestAnimationFrame(spin);
  };
  window.requestAnimationFrame(spin);

  const arrive = (): void => {
    spinning = false;
    stopFraming();
    document.querySelector('main')?.classList.add('chrome-visible');
    map.scrollZoom.enable();
    map.doubleClickZoom.enable();
    fenceCamera(map);
    options.onArrive();
  };

  const start = (): void => {
    startButton?.removeEventListener('click', start);
    spinning = false;
    landing?.classList.add('landing--leaving');
    // Keep it out of the tab order the moment it starts to go, not when the
    // transition happens to finish.
    landing?.setAttribute('inert', '');

    if (options.reducedMotion) {
      map.jumpTo({ center: CITY.center, zoom: CITY.zoom, padding: { ...NO_PADDING } });
      landing?.remove();
      arrive();
      return;
    }

    map.flyTo({
      center: CITY.center,
      zoom: CITY.zoom,
      duration: INTRO.flyMs,
      essential: true,
      padding: { ...NO_PADDING },
    });

    map.once('moveend', () => {
      landing?.remove();
      arrive();
    });
  };

  startButton?.addEventListener('click', start);
  startButton?.focus();
}

/** Skip the landing entirely: straight to the city, fence already up. */
export function skipLanding(map: MapLibreMap, onArrive: () => void): void {
  document.getElementById('landing')?.remove();
  document.querySelector('main')?.classList.add('chrome-visible');
  fenceCamera(map);
  onArrive();
}
