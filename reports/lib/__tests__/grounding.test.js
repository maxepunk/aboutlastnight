/**
 * Grounding (phase 3, 3.6 fix, review finding 8): the one rule for whether a piece
 * of text is the director's words, shared by the notes step and the notes renderer.
 * It lives in its own module so the renderer, which every writer's and judge's
 * prompt build loads, does not load the model-calling notes step to ask it.
 */

const fs = require('fs');
const path = require('path');
const { normalizeForGrounding, isVerbatimIn } = require('../grounding');

describe('isVerbatimIn', () => {
  it('finds a fragment whose quotation marks, dashes and line wraps differ from the source', () => {
    const source = 'Remi said “the deal was done — signed,\n  filed” to Mel.';
    expect(isVerbatimIn('Remi said "the deal was done - signed, filed" to Mel.', source)).toBe(true);
  });

  it('rejects a fragment the source does not hold, and an empty one', () => {
    expect(isVerbatimIn('Remi fled to the Cayman Islands.', 'Remi left early.')).toBe(false);
    expect(isVerbatimIn('   ', 'Remi left early.')).toBe(false);
    expect(isVerbatimIn(null, 'Remi left early.')).toBe(false);
  });

  it('normalizes curly quotes, dashes and whitespace the same way on both sides', () => {
    expect(normalizeForGrounding('  ‘a’  – b\n')).toBe("'a' - b");
  });
});

describe('who asks the question', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  it('the notes renderer reads the rule from the grounding module, not from the notes step', () => {
    const renderer = read('prompt-renderers/director-notes-renderer.js');
    expect(renderer).toContain("require('../grounding')");
    expect(renderer).not.toContain("require('../director-enricher')");
  });

  it('the notes step uses the same module, and keeps no copy of its own', () => {
    const enricher = read('director-enricher.js');
    expect(enricher).toContain("require('./grounding')");
    expect(enricher).not.toMatch(/function (normalizeForGrounding|isVerbatimIn)\b/);
  });
});
