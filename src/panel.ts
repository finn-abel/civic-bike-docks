/**
 * panel.ts — Phase 3. The station detail panel.
 *
 * Reads a clicked feature's properties and renders them. Every figure carries a
 * provenance stamp (discipline #1): the four read straight off the City of Toronto
 * feed are MEASURED, and `fullness` — the one division in the whole project — is
 * COMPUTED.
 */

import type { RawFeatureProperties } from './types';

const PANEL_ID = 'station-panel';

/** Which station the panel is showing, so a live refresh can update it in place. */
let selectedStationId: string | null = null;

export function getSelectedStationId(): string | null {
  return selectedStationId;
}

/** MapLibre flattens feature properties through vector-tile encoding, so what
 *  comes back from a click is loosely typed. Narrow it here rather than casting. */
function readString(properties: RawFeatureProperties, key: string): string | null {
  const value = properties[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function readNumber(properties: RawFeatureProperties, key: string): number | null {
  const value = properties[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // A GeoJSON null can arrive as the string "null" after tile encoding.
  if (typeof value === 'string' && value !== '' && value !== 'null') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCount(value: number | null): string {
  return value === null ? '—' : String(value);
}

function formatPercent(value: number | null): string {
  return value === null ? 'No data' : `${Math.round(value * 100)}% full`;
}

/** One figure in the KPI row. Value large, label small — the hierarchy does the
 *  work, so neither needs a box around it. */
function statMarkup(label: string, value: string): string {
  return `
    <div class="stat">
      <dd class="stat__value">${value}</dd>
      <dt class="stat__label">${label}</dt>
    </div>`;
}

/**
 * The fullness meter.
 *
 * A single proportion of a known whole — the form for that is one bar against its
 * own track, not a chart. The fill uses the same ramp as the map dots so the two
 * readings agree, and the exact number sits beside it, because colour alone should
 * never be the only way to read a value.
 */
function meterMarkup(fullness: number | null): string {
  if (fullness === null) {
    return `
      <p class="meter meter--empty">
        <span class="meter__caption">No availability data</span>
      </p>`;
  }

  const percent = Math.round(fullness * 100);
  return `
    <div class="meter">
      <div
        class="meter__track"
        role="meter"
        aria-valuenow="${percent}"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Share of docks holding a bike"
      >
        <div class="meter__fill" style="--fill: ${percent}%"></div>
      </div>
      <p class="meter__caption">
        ${formatPercent(fullness)}
        <span class="stamp stamp--computed">Computed</span>
      </p>
    </div>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  );
}

interface RenderOptions {
  /** True when a live refresh is redrawing an open panel rather than a click
   *  opening it. A refresh must not yank focus to the panel from wherever the
   *  reader actually is — but it must not drop focus either, and replacing
   *  innerHTML destroys the focused element outright. */
  readonly keepFocus?: boolean;
}

export function renderPanel(
  properties: RawFeatureProperties,
  options: RenderOptions = {},
): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  // Read before the rebuild — afterwards the focused node is gone.
  const hadFocusInside =
    document.activeElement !== null && panel.contains(document.activeElement);

  const name = readString(properties, 'name') ?? 'Unnamed station';
  const stationId = readString(properties, 'station_id') ?? '—';
  const capacity = readNumber(properties, 'capacity');
  const bikes = readNumber(properties, 'bikes_available');
  const docks = readNumber(properties, 'docks_available');
  const fullness = readNumber(properties, 'fullness');

  panel.innerHTML = `
    <button class="panel__close" type="button" aria-label="Close station details">
      &times;
    </button>

    <p class="panel__eyebrow">Station ${escapeHtml(stationId)}</p>
    <h2 class="panel__title">${escapeHtml(name)}</h2>

    ${meterMarkup(fullness)}

    <dl class="stats">
      ${statMarkup('Bikes', formatCount(bikes))}
      ${statMarkup('Docks free', formatCount(docks))}
      ${statMarkup('Capacity', formatCount(capacity))}
    </dl>

    <p class="panel__source">
      <span class="stamp">Measured</span>
      City of Toronto GBFS feed
    </p>`;

  selectedStationId = readString(properties, 'station_id');
  panel.hidden = false;

  const closeButton = panel.querySelector<HTMLButtonElement>('.panel__close');
  if (!options.keepFocus) {
    closeButton?.focus();
    return;
  }

  // A refresh rebuilt the panel's contents. If the reader was focused inside it,
  // that element no longer exists — put focus back on the close button, which is
  // the panel's only stop. Without this, a live update every minute would silently
  // drop a keyboard user back to the top of the document.
  if (hadFocusInside) closeButton?.focus();
}

export function closePanel(): void {
  selectedStationId = null;
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.hidden = true;
  panel.innerHTML = '';
}

export function isPanelOpen(): boolean {
  return document.getElementById(PANEL_ID)?.hidden === false;
}
