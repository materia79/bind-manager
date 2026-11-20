// @vitest-environment node
// Minor 4: every pattern is linear on hostile input; long lines are scanned in
// overlapping windows; a line that overruns the time budget refuses, never skips.

import { describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import { FAKE, everywhere, j } from './helpers.js';

describe('hygiene patterns under hostile input', () => {
  const all = () => hp.buildPatterns({
    identity: { hostname: 'build-box-17', username: 'alice', homedir: j('C:', '\\Users\\', 'alice') },
    account: 'example-person',
    denylist: hp.parseDenylist('project-nebula\n/acme-\\d+/i\n'),
    remotes: ['https://git.example.org/example-owner/secret-lab-notes.git'],
    email: 'dev@corp-internal.example',
  });
  const timed = (line, patterns) => {
    const t0 = performance.now();
    hp.scanLine(line, patterns);
    return performance.now() - t0;
  };

  it('stays linear on a 200 KB identifier run and on long backslash runs', () => {
    const p = all();
    for (const line of ['a_'.repeat(100_000), 'a-'.repeat(100_000), 'a.'.repeat(100_000), '1.'.repeat(100_000), 'x:'.repeat(100_000)]) {
      expect({ head: line.slice(0, 4), fast: timed(line, p) < 1000 }).toEqual({ head: line.slice(0, 4), fast: true });
    }
    for (const n of [28, 40, 64, 200, 5000]) {
      for (const tail of ['x', 'Users', 'Users\\', 'wt']) {
        const line = j('C:', '\\'.repeat(n), tail);
        expect({ n, tail, fast: timed(line, p) < 1000 }).toEqual({ n, tail, fast: true });
      }
      const unc = '\\'.repeat(n);
      expect({ n, unc: true, fast: timed(unc, p) < 1000 }).toEqual({ n, unc: true, fast: true });
    }
  });

  it('finds a secret anywhere in a very long line, including across a window boundary', () => {
    const p = everywhere();
    const token = FAKE['github-token'];
    for (const at of [10, 8_190, 8_185, 100_000, 199_950]) {
      const line = `${'x '.repeat(at / 2)}${token}${' y'.repeat(1000)}`;
      expect({ at, hits: hp.scanLine(line, p) }).toEqual({ at, hits: ['github-token'] });
    }
  });

  it('refuses (throws) rather than skips when a line overruns the time budget', () => {
    // cubic, so a few hundred characters take well over a millisecond
    const slow = [{ name: 'slow', scope: 'local-only', re: /a*a*!/g }];
    expect(() => hp.scanLine('a'.repeat(400), slow, { budgetMs: 1 })).toThrow(/time budget/);
  });
});
