import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // Warns once on stderr when this clone pushes to the public repository
    // without a working pre-push guard (never in CI, never a failure).
    globalSetup: ['tests/hygiene/guard-banner.mjs'],
    coverage: {
      enabled: false,
    },
  },
});
