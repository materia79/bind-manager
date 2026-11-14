// @vitest-environment node
// Minor 8: the evasion shapes from the independent check, each with the
// false positives the tuning keeps out. Every value is assembled at runtime.

import { describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import { everywhere, j } from './helpers.js';

const b64 = (s) => Buffer.from(s).toString('base64');
const R40 = j('wJalrXUtnFEMI', '/K7MDENG/bPxRfiCY', 'Ab3dEf9hIj');
const hitsOf = (line, p = everywhere()) => hp.scanLine(line, p);

describe('evasion shapes', () => {
  const hit = [
    ['basic-auth', j('Authori', 'zation: Basic ', b64(j('admin', ':', 'Zq81mPx0')))],
    ['url-credentials', j('postgres://app', ':', 'Zq81mPx0Lw', '@db.internal:5432/x')],
    ['url-credentials', j('smb://svc', ':', 'S3cure!pw', '@files.example.net/share')],
    ['env-secret-assignment', j('DB_PASS', 'WORD=', 'hunter2hunter')],
    ['env-secret-assignment', j('export API_TO', 'KEN=', 'Zq81mPx0Lw2kVt7rYb4n')],
    ['env-secret-assignment', j('  tok', 'en: ', 'Zq81mPx0Lw2kVt7rYb4n')],
    ['env-secret-assignment', j('secret_', 'key = ', 'n0t-a-placeh0lder')],
    ['password-assignment', j('const pass', 'word = "', 'hunter22', '";')],
    ['password-assignment', j('pass', 'word = "', 'x7k2m9q4w8e1_r5t3y6u0p2', '"')],
    ['password-assignment', j('db_pass', 'word: "', 'a3f9c2e8b1d4f6a7', '"')],
    ['password-assignment', j('PASS', 'WORD: "', 'CORP_VPN_ACCESS_2024', '"')],
    ['generic-secret-assignment', j('api', 'Key = "', 'example_Zq81mPx0Lw2kVt7rYb4nHs', '"')],
    ['google-api-key', j('key=', 'AI', 'za', 'SyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI')],
    ['stripe-live-key', j('sk', '_live_', '4eC39HqLyjWDarjtT1zdp7dc')],
    ['stripe-live-key', j('rk', '_live_', '51H8sAbCdEfGhIjKlMnOpQr')],
    ['aws-secret-access-key', j('aws_secret_access', '_key = ', R40)],
    ['aws-secret-access-key', j('AK', 'IA', 'Q3EXAMPL7Z5RT2VW', ' ', R40)],
    ['unc-path', j('\\\\', 'fileserver01', '\\share\\x')],
    ['unc-path', j('"\\\\\\\\', 'fileserver01', '\\\\share"')],
    ['private-ipv4', j('host: 10.', '1.2.3')],
    ['private-ipv4', j('http://172.', '20.0.5:8080/')],
    ['private-ipv4', j('192.', '168.1.10')],
  ];

  it.each(hit)('%s: %#', (name, line) => {
    expect(hitsOf(line)).toContain(name);
  });

  it('keeps the shapes this code base has legitimately', () => {
    const clean = [
      'headers: { Authorization: `Basic ${btoa(user + ":" + pass)}` }',
      j('Authori', 'zation: Basic ', b64('justatoken')),
      'https://user:password@example.com/x',
      'https://${USER}:${PASS}@host/x',
      'git@github.com:owner/repo.git',
      'token: ${{ secrets.NPM_TOKEN }}',
      'password: input.value,',
      'const password = getPassword();',
      '  token: bm-modal-token-color',
      'TOKEN=',
      '  token: var(--bm-x)',
      "password: '',",
      "password: 'password123',",
      'secret: "your-secret-here",',
      "label: 'Password',",
      '\\\\server\\share\\x',
      "'\\\\n\\\\t'",
      'replace(/\\\\/g, "/")',
      '172.32.0.1 and 127.0.0.1 and 192.0.2.10 and 10.0.0 and 256.168.1.1',
      'version 1.10.20.30.40',
      j('aws_secret_access', '_key = ', '${AWS_SECRET}'),
      'const longIdentifierNameThatIsFortyCharsLong1 = 1;',
    ];
    for (const line of clean) expect({ line, hits: hitsOf(line) }).toEqual({ line, hits: [] });
  });

  it('flags the git user e-mail and its private domain, local-only, and allows noreply', () => {
    const p = hp.buildEmailPatterns('dev@corp-internal.example');
    expect(p.every((x) => x.scope === 'local-only')).toBe(true);
    expect(hp.scanLine('contact dev@corp-internal.example', p)).toEqual(['git-email']);
    expect(hp.scanLine('ops@corp-internal.example', p)).toEqual(['git-email']);
    expect(hp.scanLine('noreply@corp-internal.example', p)).toEqual([]);
    expect(hp.scanLine('dev@example.com', p)).toEqual([]);
    const webmail = hp.buildEmailPatterns('someone@gmail.com');
    expect(hp.scanLine('someone@gmail.com', webmail)).toEqual(['git-email']);
    expect(hp.scanLine('other@gmail.com', webmail)).toEqual([]);
    expect(hp.buildEmailPatterns('12345+dev@users.noreply.github.com')).toEqual([]);
    expect(everywhere().some((x) => x.name === 'git-email')).toBe(false);
  });
});
