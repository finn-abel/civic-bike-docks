/**
 * controls.ts — the intent toggle, and the readouts that depend on it.
 *
 * Kept apart from the map so the map never has to know how the choice is made —
 * it only ever receives an Intent.
 */

import type { CoverageResult } from './coverage';
import { COVERAGE } from './constants';
import type { CoverageMode, Intent } from './types';

/** With no intent chosen the ramp keeps the `borrow` reading — see CoverageMode. */
export function readingIntent(mode: CoverageMode): Intent {
  return mode === 'none' ? 'borrow' : mode;
}

const INTENT_COPY: Record<Intent, { legend: string; low: string; high: string }> = {
  borrow: { legend: 'Bikes available', low: 'None', high: 'Full' },
  return: { legend: 'Docks free', low: 'None', high: 'All free' },
};

/**
 * Wire the radio group.
 *
 * Real radio inputs rather than styled buttons: arrow-key navigation, the
 * grouping, and the announced state all come from the platform instead of being
 * reimplemented badly.
 */
export function wireIntentToggle(onChange: (mode: CoverageMode) => void): void {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[name="intent"]');
  for (const input of inputs) {
    input.addEventListener('change', () => {
      if (input.checked) onChange(input.value as CoverageMode);
    });
  }
}

/** Retitle the legend so the ramp always says what it currently means. */
export function setLegendIntent(mode: CoverageMode): void {
  const copy = INTENT_COPY[readingIntent(mode)];
  const title = document.getElementById('legend-title');
  const low = document.getElementById('legend-low');
  const high = document.getElementById('legend-high');
  if (title) title.textContent = copy.legend;
  if (low) low.textContent = copy.low;
  if (high) high.textContent = copy.high;

  // The wash swatch only means something while a wash is drawn.
  document.getElementById('legend-wash')?.toggleAttribute('hidden', mode === 'none');
}

/** With no intent there is no gap to report, so the figure comes off rather than
 *  sitting there stale from whatever was selected last. */
export function showReadout(visible: boolean): void {
  document.getElementById('gap-readout')?.toggleAttribute('hidden', !visible);
  document.getElementById('gap-detail')?.toggleAttribute('hidden', !visible);
}

function formatPercent(fraction: number): string {
  const percent = fraction * 100;
  // Below 1% "0%" would read as "no gap at all", which is a different claim.
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

/**
 * The gap readout — the one number on this map that is COMPUTED rather than
 * measured, and the reason the coverage layer exists.
 */
export function setCoverageReadout(result: CoverageResult, intent: Intent): void {
  const element = document.getElementById('gap-readout');
  if (!element) return;
  showReadout(true);

  const verb = intent === 'borrow' ? 'available bike' : 'free dock';
  const radius = COVERAGE.walkRadiusMetres;

  element.innerHTML = `
    <span class="gap__figure">${formatPercent(result.gapFraction)}</span>
    <span class="gap__label">
      of the dock network's service area has no ${verb} within&nbsp;${radius}&nbsp;m
      <span class="stamp stamp--computed">Computed</span>
    </span>`;

  const detail = document.getElementById('gap-detail');
  if (!detail) return;

  const noun = intent === 'borrow' ? 'with a bike' : 'with a free dock';
  const unknown =
    result.unknownStations > 0
      ? ` ${result.unknownStations} with no reading, counted as unusable.`
      : '';
  detail.textContent =
    `${result.usableStations.toLocaleString()} docks ${noun} right now.${unknown}`;
}
