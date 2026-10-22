import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.DEV_API_TARGET || 'http://127.0.0.1:8000';
  return {
    base: '/',
    plugins: [react(), tailwind()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true,
      proxy: Object.fromEntries(
        ['/api', '/health', '/ws'].map((path) => [
          path,
          { target, ws: path === '/ws', changeOrigin: false },
        ]),
      ),
    },
    build: {
      sourcemap: false,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'react-core', test: /node_modules[\\/]react(?:-dom)?[\\/]/ },
              { name: 'validation', test: /node_modules[\\/]zod[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
