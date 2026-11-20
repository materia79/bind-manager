// @vitest-environment node
// Minors 6 and 7: host identity and plain denylist entries of 5+ characters
// match as case-insensitive substrings (compound names), shorter ones as
// whole words; common-word identities produce no pattern, and setup:git warns
// when a host identity floods the tracked tree.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import { HAS_GIT, makeScratch } from './helpers.js';

describe('compound names', () => {
  it('host identity of 5+ characters matches inside compound names', () => {
    const p = hp.buildHostPatterns({ hostname: 'buildbox17', username: 'aliceb', homedir: '' });
    expect(hp.scanLine('new AliceBTools()', p)).toEqual(['host-username']);
    expect(hp.scanLine('mail aliceb79@example.com', p)).toEqual(['host-username']);
    expect(hp.scanLine('xbuildbox17y', p)).toEqual(['host-name']);
    const short = hp.buildHostPatterns({ hostname: 'mp9', username: 'bob7', homedir: '' });
    expect(hp.scanLine('bob7x mp9z', short)).toEqual([]);
    expect(hp.scanLine('by bob7 on mp9', short).sort()).toEqual(['host-name', 'host-username']);
  });

  it('plain denylist entries of 5+ characters match inside compound names', () => {
    const p = hp.buildDenylistPatterns(hp.parseDenylist('acmecorp\nacme\n'));
    expect(hp.scanLine('class AcmeCorpClient {}', p)).toEqual(['denylist-line-1']);
    expect(hp.scanLine('acmeClient', p)).toEqual([]);
    expect(hp.scanLine('acme-tools', p)).toEqual(['denylist-line-2']);
  });

  it('common words as host identities produce no pattern', () => {
    for (const word of ['laptop', 'desktop', 'office', 'gamer', 'panel', 'input', 'admin', 'home', 'work', 'player']) {
      expect({ word, p: hp.buildHostPatterns({ hostname: word, username: word, homedir: '' }) }).toEqual({ word, p: [] });
    }
    expect(hp.buildHostPatterns({ hostname: '', username: 'mariela', homedir: '' }).map((x) => x.name)).toEqual(['host-username']);
  });
});

describe.skipIf(!HAS_GIT)('setup:git warns about a flooding host identity', () => {
  let s;
  beforeAll(() => { s = makeScratch('names'); });
  afterAll(() => s?.cleanup());

  it('warns when a host identity pattern matches many tracked lines, and not otherwise', () => {
    s.commit('many', { 'words.md': `${Array.from({ length: 40 }, (_, i) => `line ${i} zorblax`).join('\n')}\n` });
    const flood = s.setup({ identity: { hostname: '', username: 'zorblax', homedir: '' } });
    expect(flood.out).toMatch(/user name matches 40 lines of the tracked tree/);
    expect(flood.out).toMatch(/\.hygiene-denylist/);
    expect(flood.out).not.toContain('zorblax');
    const quiet = s.setup({ identity: { hostname: '', username: 'quuxable', homedir: '' } });
    expect(quiet.out).not.toMatch(/matches \d+ lines/);
  });
});
