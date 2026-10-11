/**
 * The countable facts the docs state match the code (phase 2 final fix wave, item 12),
 * and CLAUDE.md's map names exactly the files in docs/architecture/ (2026-10-11).
 *
 * The docs said "74 state fields" after phase 2 had made it 80, and the Key Files list
 * lacked two of the four prompt renderers and lib/accusation-verdict.js. These pin
 * the two facts that can drift silently. Since 2026-10-11 CLAUDE.md is a map and the
 * full accounts live in docs/architecture/, so the map is pinned too: a file it names
 * that does not exist, or a file there it does not name, fails.
 */

const fs = require('fs');
const path = require('path');
const { getDefaultState } = require('../workflow/state');

const ROOT = path.join(__dirname, '..', '..');
const ARCHITECTURE = path.join(ROOT, 'docs', 'architecture');
const read = (file) => fs.readFileSync(file, 'utf8');
const MAP = read(path.join(ROOT, 'CLAUDE.md'));

describe('docs/architecture/prompts.md', () => {
  it('states the number of state fields getDefaultState has', () => {
    const stated = read(path.join(ARCHITECTURE, 'prompts.md')).match(/\| State Management \| N\/A \| (\d+) state fields with reducers \|/);
    expect(stated).not.toBeNull();
    expect(Number(stated[1])).toBe(Object.keys(getDefaultState()).length);
  });
});

describe('docs/architecture/key-files.md', () => {
  it('names every prompt renderer and lib/accusation-verdict.js', () => {
    const keyFiles = read(path.join(ARCHITECTURE, 'key-files.md'));
    const renderers = fs.readdirSync(path.join(ROOT, 'lib', 'prompt-renderers')).filter((f) => f.endsWith('.js'));
    expect(renderers.length).toBeGreaterThan(0);
    [...renderers, 'lib/accusation-verdict.js'].forEach((file) => expect(`${file}: ${keyFiles.includes(file)}`).toBe(`${file}: true`));
  });
});

describe('reports/CLAUDE.md, the map', () => {
  const section = MAP.slice(MAP.indexOf('## Where each part is described'), MAP.indexOf('## Rules every change keeps'));
  const named = [...section.matchAll(/\| `([a-z-]+\.md)` \|$/gm)].map((m) => m[1]).sort();
  const present = fs.readdirSync(ARCHITECTURE).filter((f) => f.endsWith('.md')).sort();

  it('names every file in docs/architecture/, each once, and no other', () => {
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named).size).toBe(named.length);
    expect(named).toEqual(present);
  });

  it('stays a map: well under the size it grew to before 2026-10-11', () => {
    // It reached 385 KB, about 97,000 tokens, read whole by every build agent.
    expect(Buffer.byteLength(MAP, 'utf8')).toBeLessThan(40 * 1024);
  });
});
