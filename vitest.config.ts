import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    // Pure lib tests run in node (no DOM needed). Switch to 'jsdom' and
    // `npm i -D jsdom` when adding component/canvas tests.
    environment: 'node',
    globals: true,
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
