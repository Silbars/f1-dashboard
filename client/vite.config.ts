/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server proxies the API so the browser only ever talks to one origin (no CORS needed).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root serves both; Vite only exposes the VITE_-prefixed variables to the browser.
  envDir: '..',
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  test: { environment: 'node' },
});
