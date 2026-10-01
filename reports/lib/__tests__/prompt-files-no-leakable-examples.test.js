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

// Phase 3 (3.2): the journalist's craft files are retired; its writers read the
// rule set, whose files are swept here beside the image prompts and the detective's.
const PROMPT_DIRS = [
  path.join(__dirname, '..', '..', '.claude', 'skills', 'journalist-report', 'references', 'prompts'),
  path.join(__dirname, '..', '..', '.claude', 'skills', 'journalist-report', 'references', 'rules'),
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

  // Phase 3 (3.2): formatting.md is retired. The shapes it taught are the article
  // writer's generation instruction now, with "..." where the content goes.
  describe("the journalist article writer's generation instruction", () => {
    let instruction;
    beforeAll(async () => {
      const { PromptBuilder } = require('../prompt-builder');
      const builder = new PromptBuilder({ loadPhasePrompts: async () => ({}) }, 'journalist', { roster: [] }, {}, null);
      const { userPrompt } = await builder.buildArticlePrompt({ lede: {} }, [], 'hero.jpg', [], null, null, null);
      instruction = userPrompt.slice(userPrompt.indexOf('<GENERATION_INSTRUCTION>'), userPrompt.indexOf('\n<SCHEMA>\n'));
    });

    it('keeps the SHAPES the examples were teaching', () => {
      // The card and quote shapes must still show their field sets, or removing the
      // strings would have cost the model the contract.
      expect(instruction).toContain('{"type": "evidence-card", "tokenId": "...", "headline": "...", "content": "...", "owner": "...", "significance": "critical" | "supporting" | "contextual"}');
      expect(instruction).toContain('{"type": "quote", "text": "...", "attribution": "..."}');
    });

    it('fills them with placeholders that cannot be mistaken for evidence', () => {
      expect(instruction).not.toMatch(/"(?:text|content|headline|caption|tokenId)": "(?!\.\.\.")[^"]+"/);
      LEAKABLE.forEach((phrase) => expect(instruction).not.toContain(phrase));
    });
  });
});
