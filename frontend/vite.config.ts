import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
