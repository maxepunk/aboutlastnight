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

  // Fix round, fix 4: one rule says where a quoted passage splits at an elision, which the
  // guard's locating of a finding's quotes and the evidence check's reading of a quotation both
  // read; and the evidence check folds a quotation with the grounding module's fold. Neither
  // module keeps a copy of either.
  it('the elision rule is the grounding module\'s, and the guard and the evidence check import it', () => {
    const { ELISION } = require('../grounding');
    ['a ... b', 'a … b', 'a [...] b', 'a [ … ] b', 'a...b'].forEach((text) => expect([text, text.split(ELISION)]).toEqual([text, ['a', 'b']]));
    expect('a. b, c'.split(ELISION)).toEqual(['a. b, c']);
    for (const file of ['evidence.js', 'hand-edit-diff.js']) {
      const source = read(file);
      expect([file, source]).toEqual([file, expect.stringMatching(/const \{[^}]*\bELISION\b[^}]*\} = require\('\.\/grounding'\);/)]);
      expect([file, source]).toEqual([file, expect.not.stringMatching(/const (ELISION|ELLIPSIS) = /)]);
    }
    expect(read('evidence.js')).toMatch(/normalizeForGrounding\(text\)/);
  });

  // Final review (data-harness-docs[1]): one rule decides a quote's speaker and
  // addressee, groundQuote, which the notes step's groundQuotes and the renderer's
  // quoteEntry both call; neither keeps a matcher of its own.
  it('both decide a quote\'s names by the one rule the grounding module exports', () => {
    expect(read('director-enricher.js')).toMatch(/const \{[^}]*\bgroundQuote\b[^}]*\} = require\('\.\/grounding'\);/);
    expect(read('prompt-renderers/director-notes-renderer.js')).toMatch(/const \{[^}]*\bgroundQuote\b[^}]*\} = require\('\.\.\/grounding'\);/);
    for (const file of ['director-enricher.js', 'prompt-renderers/director-notes-renderer.js']) {
      expect([file, read(file)]).toEqual([file, expect.not.stringMatching(/function (quotedPassages|lineSentences|holdsWholeSentence|correctionQuotesTheLine)\b|namedOutsideQuote\(/)]);
    }
  });
});

/**
 * Final review (data-harness-docs[1]; T12): a corrected quote leaves the old speaker's
 * mouth. groundQuote keeps the context the notes hold and the correction the director's
 * corrections hold, then decides the speaker and the addressee by one rule:
 * - with no correction about the line, a name the context gives;
 * - with a correction about the line, attached or quoting a whole sentence of it, a name
 *   that correction gives and the notes' account of the line does not (the context, and
 *   the notes' paragraph that holds the line);
 * - with an attached correction the director's corrections do not hold, none.
 */
describe('groundQuote', () => {
  const { groundQuote, quotedPassages } = require('../grounding');
  const NOTES = 'Overheard Vic saying to Alex: "Go."\nVic to Ashe: "My company is very interesting." Ashe said nothing.';
  const CORRECTION = 'The quote attributed to Vic, speaking to Ashe ("My company is very interesting"), was actually said by Blake to Ashe.';
  const QUOTE = { speaker: 'Vic', addressee: 'Ashe', text: 'My company is very interesting.', context: 'Vic to Ashe: "My company is very interesting."' };

  it('keeps what the director\'s words hold, and the names the context gives when no correction is about the line', () => {
    expect(groundQuote(QUOTE, NOTES, [])).toEqual({
      context: QUOTE.context, correction: null, correctionFailed: false, speaker: 'Vic', addressee: 'Ashe'
    });
  });

  it('keeps only the name a correction about the line brings in, attached or not', () => {
    for (const quote of [{ ...QUOTE, correction: CORRECTION }, QUOTE]) {
      expect(groundQuote(quote, NOTES, [CORRECTION])).toEqual(expect.objectContaining({ speaker: null, addressee: null }));
      expect(groundQuote({ ...quote, speaker: 'Blake' }, NOTES, [CORRECTION])).toEqual(expect.objectContaining({ speaker: 'Blake', addressee: null }));
    }
  });

  it('leaves both names out for an attached correction the director\'s corrections do not hold', () => {
    expect(groundQuote({ ...QUOTE, correction: 'It was Blake.' }, NOTES, [CORRECTION])).toEqual({
      context: QUOTE.context, correction: null, correctionFailed: true, speaker: null, addressee: null
    });
  });

  it('reads "unknown", which the enricher before 3.6 wrote, as no name', () => {
    expect(groundQuote({ ...QUOTE, speaker: 'Unknown' }, NOTES, [])).toEqual(expect.objectContaining({ speaker: null }));
  });

  it('reads a passage in double or single quotation marks, curly or straight, and no apostrophe inside a word', () => {
    expect(quotedPassages('He said "Go now." and ‘Trust no one’, then \'Sit.\'')).toEqual(['Go now.', 'Trust no one', 'Sit.']);
    expect(quotedPassages("Vic's line wasn't Alex's, and the players' votes counted.")).toEqual([]);
    expect(quotedPassages("Mel's memory 'Marcus has no idea what's coming' was Remi's to expose.")).toEqual(["Marcus has no idea what's coming"]);
  });
});
