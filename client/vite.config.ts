import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } },
  server: {
    host: true, // accessible depuis les téléphones du réseau local
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
