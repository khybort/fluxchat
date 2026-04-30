import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Manual vendor chunking — keeps the per-route runtime small by isolating the
 * heavy dependencies (framer-motion, the radix-ui surface, the Phosphor icon
 * registry) from React itself. Browsers cache each vendor chunk independently,
 * so app-code changes don't bust them.
 *
 * Order matters: more specific patterns first. `/react/` matches the reconciler
 * itself, distinct from `react-dom`, `react-router-dom`, etc.
 */
const manualChunks = (id: string): string | undefined => {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('@phosphor-icons')) return 'icons-vendor';
  if (id.includes('framer-motion')) return 'animation-vendor';
  if (id.includes('@radix-ui')) return 'ui-vendor';
  if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
  if (id.includes('react-router')) return 'router-vendor';
  return 'vendor';
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: { manualChunks },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    watch: {
      // When the project is bind-mounted into a container on a foreign filesystem
      // (Docker Desktop on macOS/Windows), file events can be unreliable. Polling
      // is opt-in via env so native fs events stay the default on Linux hosts.
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
    },
  },
});
