import { defineConfig } from 'vite';

// Relative base so the bundle works from Capacitor's local web server
// and from any static file host.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { host: true },
});
