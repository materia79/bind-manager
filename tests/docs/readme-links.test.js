// @vitest-environment node
/**
 * Every relative link and anchor in the documentation resolves: the target
 * file or folder exists and a #fragment names a heading of the target (GitHub
 * heading ids). Links inside code blocks and inline code are ignored.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const DOCS = [
  'README.md',
  'src/core/README.md',
  'src/input/README.md',
  'src/input/controller_definitions/README.md',
  'src/input/controller_definitions/TODO.md',
  'scripts/README.md',
  'dist/README.md',
  'examples/standalone/README.md',
  'examples/threejs/README.md',
];

/** Markdown lines outside fenced code blocks, with inline code removed. */
function proseLines(text) {
  const out = [];
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) out.push(line.replace(/`[^`]*`/g, ''));
  }
  return out;
}

/** GitHub's heading id: lowercase, punctuation dropped, spaces to hyphens, duplicates numbered. */
function headingIds(text) {
  const ids = new Set();
  const seen = new Map();
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    const m = !fenced && line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const base = m[1]
      .replace(/`/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    ids.add(n === 0 ? base : `${base}-${n}`);
  }
  return ids;
}

/** Relative link targets of a document: { target, line }. */
function relativeLinks(text) {
  const links = [];
  proseLines(text).forEach((line) => {
    for (const m of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, https:, mailto:
      links.push(target);
    }
  });
  return links;
}

describe('documentation links', () => {
  for (const doc of DOCS) {
    it(`${doc}: relative links and anchors resolve`, () => {
      const file = join(ROOT, doc);
      const text = readFileSync(file, 'utf8');
      const links = relativeLinks(text);
      expect(links.length, 'the checker finds the links').toBeGreaterThan(0);
      const broken = [];
      for (const target of links) {
        const [pathPart, fragment] = target.split('#');
        const resolved = pathPart ? join(dirname(file), decodeURIComponent(pathPart)) : file;
        if (!existsSync(resolved)) {
          broken.push(`${target} (missing ${relative(ROOT, resolved)})`);
          continue;
        }
        if (fragment) {
          if (statSync(resolved).isDirectory()) {
            broken.push(`${target} (anchor on a folder)`);
            continue;
          }
          if (!headingIds(readFileSync(resolved, 'utf8')).has(fragment)) broken.push(`${target} (no heading #${fragment})`);
        }
      }
      expect(broken).toEqual([]);
    });
  }

  it('the heading-id rule matches GitHub on the cases these docs use', () => {
    const ids = headingIds('## Upgrading from 0.1.x\n## 1) `build.js`\n## Sizing and Theming\n### Browser shortcut guard\n## Browser Shortcut Guard\n```\n## not a heading\n```\n');
    expect([...ids]).toEqual(['upgrading-from-01x', '1-buildjs', 'sizing-and-theming', 'browser-shortcut-guard', 'browser-shortcut-guard-1']);
  });
});
