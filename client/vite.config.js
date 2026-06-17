import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // bind to 0.0.0.0 so phones on the LAN can reach it
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          // ECONNABORTED / ECONNRESET fire whenever a browser tab closes or
          // navigates away mid-connection — harmless, just suppress the noise.
          proxy.on('error', (err) => {
            if (['ECONNABORTED', 'ECONNRESET'].includes(err.code)) return;
            console.error('[proxy]', err.message);
          });
        },
      },
    },
  },
});
