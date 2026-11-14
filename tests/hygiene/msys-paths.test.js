// @vitest-environment node
// Major 3: Git Bash / MSYS and WSL spellings of home and worktree paths are
// caught in the `everywhere` set; documentation placeholders stay allowed.

import { describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import { everywhere, j } from './helpers.js';

describe('MSYS and WSL paths', () => {
  it('catches the /c/Users, /mnt/c/Users and drive-root worktree forms', () => {
    const p = everywhere();
    const cases = [
      [j('cd /c', '/Users/', 'alice/x'), 'windows-user-path'],
      [j('/C', '/Users/', 'Alice/x'), 'windows-user-path'],
      [j('ls /mnt/c', '/Users/', 'alice/AppData'), 'windows-user-path'],
      [j('cd /d', '/wt/', 'proj/src'), 'worktree-root-path'],
      [j('"/mnt/d', '/wt/', 'proj"'), 'worktree-root-path'],
      [j('/c', '/git/', 'x'), 'worktree-root-path'],
      [j('file:///d', '/wt/', 'x'), 'worktree-root-path'],
    ];
    for (const [line, name] of cases) expect({ line, hits: hp.scanLine(line, p) }).toEqual({ line, hits: [name] });
  });

  it('keeps placeholders and ordinary URL paths clean', () => {
    const p = everywhere();
    for (const line of [
      j('/c', '/Users/', 'you/x'),
      j('/mnt/c', '/Users/', '<name>/x'),
      j('/c', '/Users/', 'user/'),
      'https://example.com/a/git/x',
      'src/c/wt/x',
      'see /api/git/status',
      'import x from "./c/wt-helpers.js"',
    ]) expect({ line, hits: hp.scanLine(line, p) }).toEqual({ line, hits: [] });
  });
});
