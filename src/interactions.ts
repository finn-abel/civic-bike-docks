/**
 * interactions.ts — Phase 3. Click and hover behaviour.
 *
 * Click a cluster → zoom to the point it breaks apart.
 * Click a station → open the detail panel.
 * Hover either → pointer cursor and a thicker ring.
 */

import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';

import { IDS } from './constants';
import { closePanel, isPanelOpen, renderPanel } from './panel';
import type { RawFeatureProperties } from './types';

/** Cluster expansion overshoots slightly so the split is visible, not marginal. */
const EXPANSION_ZOOM_PADDING = 0.4;

/** Tracks which feature currently has hover state, so it can be cleared. */
type HoverTarget = { layer: string; id: string | number } | null;

function setHover(map: MapLibreMap, target: HoverTarget, hovered: boolean): void {
  if (!target) return;
  map.setFeatureState(
    { source: IDS.source, id: target.id },
    { hover: hovered },
  );
}

/** Pointer feedback on a layer, with the feature-state bookkeeping hover needs. */
function wireHover(map: MapLibreMap, layer: string): void {
  let current: HoverTarget = null;

  map.on('mousemove', layer, (event: MapMouseEvent & { features?: unknown[] }) => {
    map.getCanvas().style.cursor = 'pointer';

    const feature = event.features?.[0] as { id?: string | number } | undefined;
    if (feature?.id === undefined || feature.id === current?.id) return;

    setHover(map, current, false);
    current = { layer, id: feature.id };
    setHover(map, current, true);
  });

  map.on('mouseleave', layer, () => {
    map.getCanvas().style.cursor = '';
    setHover(map, current, false);
    current = null;
  });
}

export function wireInteractions(map: MapLibreMap): void {
  wireHover(map, IDS.clusterCircles);
  wireHover(map, IDS.unclusteredPoints);

  // Clicking a cluster zooms to exactly the level where it splits.
  map.on('click', IDS.clusterCircles, (event) => {
    const feature = event.features?.[0];
    const clusterId = feature?.properties?.['cluster_id'] as number | undefined;
    if (clusterId === undefined) return;

    const source = map.getSource(IDS.source) as GeoJSONSource | undefined;
    if (!source) return;

    void source
      .getClusterExpansionZoom(clusterId)
      .then((zoom) => {
        map.easeTo({
          center: event.lngLat,
          zoom: zoom + EXPANSION_ZOOM_PADDING,
          duration: 500,
        });
      })
      .catch((error: unknown) => {
        // Not worth a banner — the click simply does nothing. Log for diagnosis.
        console.error('[map] cluster expansion failed', error);
      });
  });

  map.on('click', IDS.unclusteredPoints, (event) => {
    const properties = event.features?.[0]?.properties as
      | RawFeatureProperties
      | undefined;
    if (properties) renderPanel(properties);
  });

  // Clicking empty map dismisses the panel — but only empty map. MapLibre fires
  // the general click alongside the layer click, so re-query at the point.
  map.on('click', (event) => {
    const hits = map.queryRenderedFeatures(event.point, {
      layers: [IDS.unclusteredPoints, IDS.clusterCircles],
    });
    if (hits.length === 0) closePanel();
  });

  // The panel is the only modal-ish surface, so Escape closing it is unambiguous.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isPanelOpen()) closePanel();
  });

  document.getElementById('station-panel')?.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('.panel__close')) closePanel();
  });
}
