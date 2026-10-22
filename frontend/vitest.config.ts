import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';
export default mergeConfig(
  viteConfig({
    command: 'serve',
    mode: 'test',
    isSsrBuild: false,
    isPreview: false,
  }),
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  }),
);
