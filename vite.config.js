import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom plugin to handle firebase-init.js - tell Vite to load it as-is without parsing
const firebaseInitPlugin = {
  name: 'firebase-init-raw',
  apply: 'serve',
  async resolveId(id) {
    // When firebase-init is requested, load it without transformation
    if (id.includes('/core/firebase-init.js')) {
      return id; // Let Vite handle it normally, but it won't be analyzed
    }
  },
  async load(id) {
    // Return null to use default loader
    return null;
  },
};

// Builds straight into www/ — the exact folder capacitor.config.json already
// points at (webDir: "www"). This replaces the old scripts/sync-www.js copy
// step entirely: Vite's build IS the sync step now. Run `npm run build`
// (or `npm run sync`, which does build + cap sync together) before opening
// Android Studio, same as before — just one tool doing it instead of two.
export default defineConfig({
  plugins: [
    firebaseInitPlugin,
    react({
      // firebase-init.js is pure ES module without JSX, exclude from Babel
      exclude: /firebase-init\.js$/,
    }),
  ],
  root: 'src',
  base: '',
  optimizeDeps: {
    // Exclude firebase-init.js and its CDN dependencies from optimization
    exclude: ['core/firebase-init.js'],
  },
  build: {
    outDir: '../www',
    emptyOutDir: true,
  },
});
