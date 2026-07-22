import { defineConfig } from 'vite';

// Static site build. `public/` (3D models, audio) is copied verbatim into dist/.
// Three.js is bundled from node_modules for offline-reliable, cache-friendly delivery.
export default defineConfig({
  base: './',
  // Per-build id — stamped into the SW registration URL so every deploy is a
  // detectable update, and into the runtime cache name so old caches are purged.
  define: { __BUILD_ID__: JSON.stringify(String(Date.now())) },
  resolve: {
    alias: {
      // `three/addons/*` is a CDN importmap convention; map it to the npm path.
      'three/addons/': 'three/examples/jsm/',
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
