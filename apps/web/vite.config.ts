import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the API server runs on :3001; the proxy keeps the browser on one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/stream': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
