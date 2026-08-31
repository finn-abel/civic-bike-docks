import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built site works from any subdirectory —
  // a file:// open, a GitHub Pages project path, or a plain static host.
  base: './',

  // MapLibre's worker is an ES module and is instantiated with { type: 'module' }.
  // Vite bundles workers as IIFE by default, which would break its imports.
  worker: {
    format: 'es',
  },

  build: {
    outDir: 'dist',
    // The bundle is ~950 kB raw / ~250 kB gzipped, and essentially all of it is
    // MapLibre. That is the app — code-splitting it would only add a round trip
    // before the map can draw. Raise the ceiling rather than pretend to fix it.
    chunkSizeWarningLimit: 1000,
  },

  // MapLibre loads its own worker as a sibling ESM chunk (maplibre-gl-worker.mjs).
  // Vite's dep pre-bundler rewrites the entry but does not carry the worker chunk
  // into .vite/deps, so the dev server 404s on it and the map never draws.
  // Excluding maplibre-gl from pre-bundling serves it from node_modules intact.
  // The production build is unaffected (Rollup resolves the chunk correctly).
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },

  server: {
    /**
     * Deliberately not Vite's default 5173 — that port is a magnet for whatever
     * else is running, and a collision there is silent: Vite just moves to the
     * next free port while muscle memory still sends you to 5173, where some
     * other project answers.
     */
    port: 5180,

    /** Fail loudly on a collision rather than drifting to another port. If this
     *  errors, something else already has 5180 — find it with:
     *    lsof -nP -iTCP:5180 -sTCP:LISTEN */
    strictPort: true,

    open: true,
  },
});
