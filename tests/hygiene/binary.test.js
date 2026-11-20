// @vitest-environment node
// Major 1: content git treats as binary is still scanned: files marked -diff
// or binary in .gitattributes, text with a NUL byte, UTF-16 (with and without
// a BOM, both byte orders), and real binary data (a strings-like pass). Each
// case is refused by a real push into a scratch bare repository and by the
// tree scan.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as pp from '../../scripts/pre-push.mjs';
import { HAS_GIT, TOKEN, j, makeScratch, secretPart } from './helpers.js';

const HOME = j('C:', '\\Users\\', 'alice', '\\notes');
const utf16le = (text, bom = true) => Buffer.concat([bom ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0), Buffer.from(text, 'utf16le')]);
const utf16be = (text) => {
  const le = Buffer.from(text, 'utf16le');
  for (let i = 0; i + 1 < le.length; i += 2) [le[i], le[i + 1]] = [le[i + 1], le[i]];
  return Buffer.concat([Buffer.from([0xfe, 0xff]), le]);
};

const CASES = [
  { label: '-diff in .gitattributes', files: { '.gitattributes': '*.dat -diff\n', 'secret.dat': `x\n${TOKEN}\n` }, file: 'secret.dat', line: 2, pattern: 'github-token' },
  { label: 'binary in .gitattributes', files: { '.gitattributes': 'dist/*.js binary\n', 'dist/x.js': `var a = 1;\nvar p = "${HOME}";\n` }, file: 'dist/x.js', line: 2, pattern: 'windows-user-path' },
  { label: 'a text file with one NUL byte', files: { 'one-zero-byte.txt': Buffer.concat([Buffer.from('a\0b\n'), Buffer.from(`${TOKEN}\n`)]) }, file: 'one-zero-byte.txt', line: 2, pattern: 'github-token' },
  { label: 'UTF-16LE with BOM (PowerShell 5.1 "> file")', files: { 'ps.txt': utf16le(`first\r\n${TOKEN}\r\n`) }, file: 'ps.txt', line: 2, pattern: 'github-token' },
  { label: 'UTF-16LE without BOM', files: { 'nobom.txt': utf16le(`first line here\n${HOME}\n`, false) }, file: 'nobom.txt', line: 2, pattern: 'windows-user-path' },
  { label: 'UTF-16BE with BOM', files: { 'be.txt': utf16be(`first\n${TOKEN}\n`) }, file: 'be.txt', line: 2, pattern: 'github-token' },
  {
    label: 'binary data (strings-like pass)',
    files: { 'blob.bin': Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d, 0xff, 0x00]), Buffer.from(` ${TOKEN} `), Buffer.from([0, 1, 2, 3, 0xfe])]) },
    file: 'blob.bin', line: 1, pattern: 'github-token',
  },
];

describe.skipIf(!HAS_GIT)('binary and UTF-16 content', () => {
  let s;
  beforeAll(() => {
    s = makeScratch('binary');
    s.setup();
  });
  afterAll(() => s?.cleanup());

  for (const c of CASES) {
    it(`${c.label}: refused by a real push and by the tree scan`, async () => {
      s.branchFromBase(`t-${c.file.replace(/\W/g, '')}`);
      const sha = s.commit(c.label, c.files);
      const push = s.realPush(['origin', `${sha}:refs/heads/main`]);
      expect(push.code).not.toBe(0);
      expect(push.out).toContain(`${c.file}:${c.line}  [${c.pattern}]`);
      expect(push.out).not.toContain(secretPart(TOKEN));

      const lines = [];
      const code = await pp.runCli(['--scan-tree', sha, '--scope', 'everywhere'], { cwd: s.work, log: (l) => lines.push(l) });
      expect(code).toBe(1);
      expect(lines.join('\n')).toContain(`${c.file}:${c.line}  [${c.pattern}]`);

      const onDisk = [];
      const diskCode = await pp.runCli(['--scan-path', c.file, '--scope', 'everywhere'], { cwd: s.work, log: (l) => onDisk.push(l) });
      expect(diskCode).toBe(1);
      expect(onDisk.join('\n')).toContain(`[${c.pattern}]`);
    });
  }
});
