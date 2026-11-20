// @vitest-environment node
// Minor 3: the failure paths refuse. A scan error exits 2 (never 0), a ref
// that cannot be scanned (a tag at a blob or a tree) is refused, and an
// invalid regex in .hygiene-denylist refuses without printing the entry.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as pp from '../../scripts/pre-push.mjs';
import { HAS_GIT, ZERO, makeScratch } from './helpers.js';

describe.skipIf(!HAS_GIT)('refusals on failure paths', () => {
  let s;
  beforeAll(() => { s = makeScratch('refuse'); });
  afterAll(() => s?.cleanup());

  it('a scan error in the hook exits 2', async () => {
    s.branchFromBase('t-error');
    const sha = s.commit('any', { 'a.txt': 'a\n' });
    const broken = [{ name: 'broken', scope: 'everywhere', re: /x/ }]; // no g flag: matchAll throws
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]], patterns: broken });
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/could not scan/);
  });

  it('a scan error in the CLI exits 2', async () => {
    const lines = [];
    expect(await pp.runCli(['--scan-range', 'no-such-ref..HEAD'], { cwd: s.work, log: (l) => lines.push(l) })).toBe(2);
  });

  it('refuses a tag that points at a blob or a tree', async () => {
    const blob = s.git(['rev-parse', `${s.base}:README.md`]);
    const tree = s.git(['rev-parse', `${s.base}^{tree}`]);
    for (const [tag, target] of [['at-blob', blob], ['at-tree', tree]]) {
      s.git(['tag', tag, target]);
      const res = await s.seamPush({ refs: [[`refs/tags/${tag}`, target, ZERO]] });
      expect({ tag, code: res.code }).toEqual({ tag, code: 1 });
      expect(res.out).toMatch(/cannot be scanned/);
    }
  });

  it('an invalid regex in .hygiene-denylist refuses (exit 2) and names only the line', async () => {
    s.branchFromBase('t-denylist');
    const sha = s.commit('any', { 'b.txt': 'b\n' });
    fs.writeFileSync(path.join(s.work, '.hygiene-denylist'), '# names\n/(unclosed-codename/\n');
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]], patterns: null });
    fs.rmSync(path.join(s.work, '.hygiene-denylist'));
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/line\(s\) 2/);
    expect(res.out).not.toContain('unclosed-codename');
  });
});
