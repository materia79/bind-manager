// @vitest-environment node
// T1: when this clone's origin is the public repository and no working guard
// is installed, npm test and npm run hygiene print a framed block to stderr
// from a vitest globalSetup, before the reporter starts. Never in CI, never
// when the guard works or origin is not public, and never a failure.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as banner from './guard-banner.mjs';
import { HAS_GIT, makeScratch } from './helpers.js';

describe.skipIf(!HAS_GIT)('guard banner', () => {
  let s;
  beforeAll(() => { s = makeScratch('banner'); });
  afterAll(() => s?.cleanup());

  it('frames the problem and the fix when the guard is missing', () => {
    const text = banner.guardBanner({ cwd: s.work, env: {} });
    expect(text).toMatch(/={20,}/);
    expect(text).toMatch(/pre-push guard is NOT ACTIVE/);
    expect(text).toMatch(/core\.hooksPath is not set/);
    expect(text).toMatch(/npm run setup:git/);
  });

  it('prints nothing in CI', () => {
    expect(banner.guardBanner({ cwd: s.work, env: { CI: 'true' } })).toBe(null);
    expect(banner.guardBanner({ cwd: s.work, env: { GITHUB_ACTIONS: 'true' } })).toBe(null);
  });

  it('prints nothing once the guard is installed, or when origin is not public', () => {
    s.setup();
    expect(banner.guardBanner({ cwd: s.work, env: {} })).toBe(null);
    s.git(['config', '--unset', 'core.hooksPath']);
    s.git(['remote', 'set-url', 'origin', s.priv]);
    expect(banner.guardBanner({ cwd: s.work, env: {} })).toBe(null);
    s.git(['remote', 'set-url', 'origin', s.pub]);
  });

  it('is wired as a globalSetup of the config npm test and npm run hygiene use', async () => {
    const { default: config } = await import('./vitest.guard.config.mjs');
    expect(config.test.globalSetup.some((p) => /guard-banner\.mjs$/.test(p))).toBe(true);
    expect(config.test.include).toEqual(['tests/**/*.test.js']); // the base config is kept
  });
});
