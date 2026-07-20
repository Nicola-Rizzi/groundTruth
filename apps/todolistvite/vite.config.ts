import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@acme/ui": resolve(__dirname, "../../packages/acme-ui/src/components/ui"),
    },
  },
  // Dev: proxy /api to the smart-add server so the Anthropic key stays server-side
  // and never enters the browser bundle. Run `npm run dev:api` alongside `npm run dev`.
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // tests/ belongs to Playwright (npm run test:e2e) — two runners, two directories.
    // Without this, vitest tries to execute the e2e specs and Playwright throws.
    exclude: [...configDefaults.exclude, 'tests/**'],
  },
})
