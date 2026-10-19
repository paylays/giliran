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
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
