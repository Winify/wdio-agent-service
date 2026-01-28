import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['types/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: 'node',
  outDir: 'build',
});
