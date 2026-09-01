/**
 * theme.ts — light or dark, and who decides.
 *
 * Three states, not two: the viewer's system preference is the default, and an
 * explicit choice overrides it and persists. "No stored choice" is meaningfully
 * different from "chose light" — the first tracks the OS as it changes through
 * the day, the second does not.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'civic-bike-docks:theme';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** Reading storage throws outright in some privacy modes, so never let it be
 *  the reason the page fails to start. */
function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function store(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A viewer who blocks storage still gets the theme, just not the memory.
  }
}

export function systemTheme(): Theme {
  return darkQuery.matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Stamp the root so CSS can pick up the palette. */
function paint(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
}

/**
 * Apply the theme and keep it applied.
 *
 * `onChange` fires for viewer-driven changes *after* the first paint — the map
 * has to swap basemap styles in response, and that is expensive enough that it
 * should not run for the initial value it was constructed with.
 */
export function startTheme(onChange: (theme: Theme) => void): Theme {
  const initial = currentTheme();
  paint(initial);

  // Follow the OS only while the viewer has not overridden it.
  darkQuery.addEventListener('change', () => {
    if (storedTheme() !== null) return;
    const next = systemTheme();
    paint(next);
    onChange(next);
  });

  const button = document.getElementById('theme-toggle');
  button?.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    store(next);
    paint(next);
    setToggleLabel(next);
    onChange(next);
  });

  setToggleLabel(initial);
  return initial;
}

function setToggleLabel(theme: Theme): void {
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  const next = theme === 'dark' ? 'light' : 'dark';
  button.setAttribute('aria-label', `Switch to ${next} theme`);
  button.setAttribute('title', `Switch to ${next} theme`);
  button.textContent = theme === 'dark' ? '☀' : '☾';
}
