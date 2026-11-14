// @vitest-environment node
// m6: three false positives removed without opening holes, and the
// defensible hits kept (an allow marker is available for them).

import { describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import { everywhere, j } from './helpers.js';

const scan = (line, file) => hp.scanLine(line, everywhere(), { file });

describe('false positives removed', () => {
  it('a four-part version string is not a private IPv4 address', () => {
    expect(scan('  "version": "10.1.2.3",', 'package.json')).toEqual([]);
    expect(scan('version = 10.1.2.3', 'notes.md')).toEqual([]);
    expect(scan('released v10.1.2.3 today', 'notes.md')).toEqual([]);
    expect(scan(j('"resolved": "x", "dep": "10.', '1.2.3"'), 'package-lock.json')).toEqual([]);
    expect(scan(j('dep@10.', '1.2.3:'), 'yarn.lock')).toEqual([]);
  });

  it('a JS/TS property with an identifier or expression value is not an env assignment', () => {
    for (const [line, file] of [
      ['  password: someVariable,', 'src/login.js'],
      ['  token: getToken(),', 'src/api.ts'],
      ['  secret: options.secret', 'src/x.mjs'],
    ]) expect({ line, hits: scan(line, file) }).toEqual({ line, hits: [] });
  });

  it("this code base's GP_ constants are not passwords", () => {
    expect(scan("const secret = 'GP_B12_GP_B13_GP_B14';", 'src/input/x.js')).toEqual([]);
    expect(scan("const secret = 'GP_A0N_GP_B3P';", 'src/input/x.js')).toEqual([]);
  });
});

describe('defensible hits kept', () => {
  it('still flags the documented examples', () => {
    expect(scan(j('postgres://user', ':pass', '@localhost/db'), 'README.md')).toContain('url-credentials');
    expect(scan(j('password: ', 'hunter22'), 'README.md')).toContain('env-secret-assignment');
    expect(scan(j('192.', '168.1.10'), 'README.md')).toContain('private-ipv4');
    expect(scan(j("const secret = '", 'GP_B12_hunter22', "';"), 'src/x.js')).toContain('password-assignment');
    expect(scan(j('ip 10.', '1.2.3'), 'notes.md')).toContain('private-ipv4');
    expect(scan(j('DB_PASS', 'WORD=', 'someVariable'), '.env')).toContain('env-secret-assignment');
  });
});
