import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Surface bundle-size regressions instead of letting them creep in.
      // 700 kB is roughly the gzip floor we can defend for the editor shell.
      chunkSizeWarningLimit: 700,
    },
    server: {
      // Allow proxied/preview hostnames (Cloud Run service URLs, sandbox previews).
      // Without this, Vite 6+ returns 403 "Blocked request" for any non-localhost Host.
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      coverage: {
        provider: 'v8',
        reporter: ['text'],
        include: ['src/lib/**', 'src/utils/**'],
      },
    },
  };
});
