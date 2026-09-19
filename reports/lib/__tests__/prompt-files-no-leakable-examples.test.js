/**
 * Prompt examples must not read like session evidence (BASELINE.md §6(b))
 *
 * formatting.md shipped this illustrative card:
 *
 *   { "tokenId": "rat031", "headline": "The Offer",
 *     "content": "The job is yours. The CEO isn't even cold yet.", ... }
 *
 * 071826's real `jam003` card came back reading "He's out. You're in. **The job
 * is yours.** That was Vic's voice..." and the refinement findings flag exactly
 * `invents "The job is yours"`. All seven of that session's cards were written in
 * second person: the model reproduced the FORM of a memory token's
 * fullDescription while inventing the CONTENT — and took the content from here.
 *
 * An example that reads like evidence will always be copied as evidence. The
 * shapes stay; the quotable strings become obvious placeholders.
 */

const fs = require('fs');
const path = require('path');

const PROMPT_DIRS = [
  path.join(__dirname, '..', '..', '.claude', 'skills', 'journalist-report', 'references', 'prompts'),
  path.join(__dirname, '..', '..', '.claude', 'skills', 'detective-report', 'references', 'prompts')
];

/** The strings observed leaking, verbatim, into a published card. */
const LEAKABLE = [
  'The job is yours',
  "The CEO isn't even cold yet"
];

function promptFiles() {
  return PROMPT_DIRS
    .filter(dir => fs.existsSync(dir))
    .flatMap(dir => fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(dir, f)));
}

describe('prompt files carry no leakable example content', () => {
  const files = promptFiles();

  it('finds the prompt files (guard against a silently empty sweep)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  LEAKABLE.forEach((phrase) => {
    it(`no prompt file contains "${phrase}"`, () => {
      const offenders = files.filter(f => fs.readFileSync(f, 'utf8').includes(phrase));
      expect(offenders.map(f => path.basename(f))).toEqual([]);
    });
  });

  it('the fact-check still guards the phrases in case one comes back', () => {
    const { _testing } = require('../content-bundle-fact-check');
    LEAKABLE.forEach((phrase) => {
      expect(_testing.LEAKED_PROMPT_EXAMPLES).toContain(phrase.toLowerCase());
    });
  });

  it('keeps the SHAPES the examples were teaching', () => {
    const formatting = fs.readFileSync(
      path.join(PROMPT_DIRS[0], 'formatting.md'), 'utf8'
    );
    // The card/quote/pull-quote examples must still show their field sets, or
    // removing the strings would have cost the model the contract.
    expect(formatting).toContain('"type": "evidence-card"');
    expect(formatting).toContain('"significance": "critical"');
    expect(formatting).toContain('"type": "quote"');
    expect(formatting).toContain('"attribution"');
  });

  it('replaces them with placeholders that cannot be mistaken for evidence', () => {
    const formatting = fs.readFileSync(path.join(PROMPT_DIRS[0], 'formatting.md'), 'utf8');
    expect(formatting).toContain("<verbatim sentence(s) copied from the token's full description>");
    expect(formatting).toContain('<real token id from the evidence>');
    expect(formatting).toContain('<verbatim line from the source>');
  });
});
