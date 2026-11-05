import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // allow the Arena preview proxy host (preview runs under *.e2b.app)
    allowedHosts: true,
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
});
