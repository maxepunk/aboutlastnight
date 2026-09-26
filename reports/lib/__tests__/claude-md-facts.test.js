/**
 * The countable facts reports/CLAUDE.md states match the code (phase 2 final fix
 * wave, item 12).
 *
 * It said "74 state fields" after phase 2 had made it 80, and its Key Files list
 * lacked two of the four prompt renderers and lib/accusation-verdict.js. These pin
 * the two facts that can drift silently.
 */

const fs = require('fs');
const path = require('path');
const { getDefaultState } = require('../workflow/state');

const ROOT = path.join(__dirname, '..', '..');
const DOC = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

describe('reports/CLAUDE.md', () => {
  it('states the number of state fields getDefaultState has', () => {
    const stated = DOC.match(/\| State Management \| N\/A \| (\d+) state fields with reducers \|/);
    expect(stated).not.toBeNull();
    expect(Number(stated[1])).toBe(Object.keys(getDefaultState()).length);
  });

  it('names every prompt renderer and lib/accusation-verdict.js in Key Files', () => {
    const keyFiles = DOC.slice(DOC.indexOf('### Key Files'), DOC.indexOf('### Template System'));
    const renderers = fs.readdirSync(path.join(ROOT, 'lib', 'prompt-renderers')).filter((f) => f.endsWith('.js'));
    expect(renderers.length).toBeGreaterThan(0);
    [...renderers, 'lib/accusation-verdict.js'].forEach((file) => expect(`${file}: ${keyFiles.includes(file)}`).toBe(`${file}: true`));
  });
});
