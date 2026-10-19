import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Streams (SSE) pass through the proxy unbuffered.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        configure: (proxy) => {
          // When the API process dies or restarts mid-stream, the proxy would keep the browser
          // connection open. Tear it down so EventSource sees the failure and reconnects.
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const endClient = () => {
              if (!res.writableEnded) res.destroy();
            };
            proxyRes.on('close', endClient);
            proxyRes.on('error', endClient);
          });
        },
      },
    },
  },
});
