import { defineConfig } from 'vite';

// Static site build. `public/` (3D models, audio) is copied verbatim into dist/.
// Three.js is bundled from node_modules for offline-reliable, cache-friendly delivery.
export default defineConfig({
  base: './',
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
