// @vitest-environment node
// T2: one test per mechanism behind the image false-positive fix, each failing
// under exactly the mutation that removes it:
//  - short names (under 6 characters) are not applied to binary readings, even
//    inside a long printable run;
//  - in binary readings a pattern only counts inside a run of 8+ printable
//    characters.

import { describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import * as pp from '../../scripts/pre-push.mjs';

const identity = (hostname) => hp.buildPatterns({
  identity: { hostname, username: '', homedir: '' }, account: '', denylist: { entries: [] }, remotes: [], email: '',
});
async function* one(buf) { yield buf; }
const scan = async (buf, patterns) => (await pp.scanContentStream(one(buf), 'asset.bin', { patterns })).map((h) => h.pattern);
const binaryLine = (inner) => Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(inner, 'latin1'), Buffer.from([3, 0])]);

describe('binary reading mechanisms', () => {
  it('a 3-letter name in a long printable run of a binary line is not a hit; in a clean text line it is', async () => {
    const p = identity('kq7');
    expect(await scan(binaryLine(' deploy to kq7 tonight please '), p)).toEqual([]);
    expect(await scan(Buffer.from('deploy to kq7 tonight please\n'), p)).toEqual(['host-name']);
  });

  it('a 6-character name between binary bytes is not a hit; inside a 12+ character printable run it is', async () => {
    const p = identity('zqxvbn');
    expect(await scan(binaryLine('zqxvbn'), p)).toEqual([]);
    expect(await scan(binaryLine(' at zqxvbn ok '), p)).toEqual(['host-name']);
  });
});
