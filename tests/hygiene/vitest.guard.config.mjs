// The project's vitest config (vitest.config.js, unchanged) plus one
// globalSetup: the guard banner (guard-banner.mjs). npm test and npm run
// hygiene use this file; vitest's CLI has no --globalSetup option, and
// vitest.config.js belongs to the project, not to the hygiene guard.

import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vitest/config';

import base from '../../vitest.config.js';

export default mergeConfig(base, {
  test: {
    globalSetup: [fileURLToPath(new URL('./guard-banner.mjs', import.meta.url))],
  },
});
