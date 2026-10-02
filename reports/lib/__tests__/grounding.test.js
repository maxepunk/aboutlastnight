/**
 * Grounding (phase 3, 3.6 fix, review finding 8): the one rule for whether a piece
 * of text is the director's words, shared by the notes step and the notes renderer.
 * It lives in its own module so the renderer, which every writer's and judge's
 * prompt build loads, does not load the model-calling notes step to ask it.
 */

const fs = require('fs');
const path = require('path');
const { normalizeForGrounding, isVerbatimIn, namedOutsideQuote } = require('../grounding');

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

/**
 * Task 3.11 (final review, session-data finding 2): the rule for naming a speaker from
 * one place. The notes step keeps a quote's speaker or addressee only when its kept
 * context or correction names them, and the renderer prints a stored one by the same
 * rule, so a thread enriched before the rule prints no speaker the director's words
 * do not give.
 */
describe('namedOutsideQuote', () => {
  it('finds a word of the name, whole and in any case, in the sources', () => {
    expect(namedOutsideQuote('Vic', ['Overheard vic saying to Alex: "Go."'], 'Go.')).toBe(true);
    expect(namedOutsideQuote('Victoria', ['Overheard Vic saying to Alex: "Go."'], 'Go.')).toBe(false);
  });

  it('never counts the quoted words: a line can name someone without saying who spoke it', () => {
    expect(namedOutsideQuote('Sam', ['Overheard near the end: "Oh, Sam exposed everything."'], 'Oh, Sam exposed everything.')).toBe(false);
  });

  it('reads the quoted words as the sources do, whatever their quotation marks and dashes', () => {
    expect(namedOutsideQuote('Sam', ['Overheard: “Oh, Sam — exposed everything.”'], 'Oh, Sam - exposed everything.')).toBe(false);
  });

  it('skips the words of a name that name no one ("the Valet" is named by "Valet")', () => {
    expect(namedOutsideQuote('the Valet', ['Then the Valet said: "Sit."'], 'Sit.')).toBe(true);
    expect(namedOutsideQuote('the Valet', ['Then the room said: "Sit."'], 'Sit.')).toBe(false);
  });

  it('names no one from no sources, or from a name with no word in it', () => {
    expect(namedOutsideQuote('Vic', [], 'Go.')).toBe(false);
    expect(namedOutsideQuote('', ['Vic said "Go."'], 'Go.')).toBe(false);
    expect(namedOutsideQuote('the', ['the man said "Go."'], 'Go.')).toBe(false);
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
    expect(enricher).not.toMatch(/function (normalizeForGrounding|isVerbatimIn|namedOutsideQuote)\b/);
  });

  it('both name a speaker by the rule the grounding module exports (task 3.11)', () => {
    expect(read('director-enricher.js')).toMatch(/const \{[^}]*\bnamedOutsideQuote\b[^}]*\} = require\('\.\/grounding'\);/);
    expect(read('prompt-renderers/director-notes-renderer.js')).toMatch(/const \{[^}]*\bnamedOutsideQuote\b[^}]*\} = require\('\.\.\/grounding'\);/);
  });
});
