/**
 * Slice 2.5: a sidebar entry is a headline and a summary.
 *
 * The sidebar partial prints an entry's significance, headline and summary, and
 * never its `content`. The article prompt still asked for the full document text
 * in every sidebar entry, beside a craft line saying not to, and the card check
 * then failed six correct 092026 cards on that text. The writer is now asked for
 * document text on the inline evidence card only, copied from the document with
 * that id in <RECORD>; the schema keeps `evidenceCards[].content` optional so
 * older bundles validate, and says it does not print.
 */

const { PromptBuilder } = require('../prompt-builder');
const { SchemaValidator } = require('../schema-validator');
const schema = require('../schemas/content-bundle.schema.json');

const PROMPTS = {
  'character-voice': 'CV rules',
  'writing-principles': 'WP rules',
  'evidence-boundaries': 'EB rules',
  'section-rules': 'SR rules',
  'narrative-structure': 'NS rules',
  'formatting': 'FMT rules',
  'anti-patterns': 'AP rules',
  'editorial-design': 'ED rules'
};

async function journalistArticlePrompt() {
  const themeLoader = { loadPhasePrompts: jest.fn().mockResolvedValue(PROMPTS), validate: jest.fn() };
  const builder = new PromptBuilder(themeLoader, 'journalist', {}, { Vic: 'Vic Kingsley' });
  const { userPrompt } = await builder.buildArticlePrompt({ lede: { hook: 'x' } }, [], 'hero.png', [], null, null, null);
  return userPrompt;
}

/** The text of the evidenceCards field list, up to the next numbered field. */
function evidenceCardsFieldList(userPrompt) {
  const start = userPrompt.indexOf('2. "evidenceCards"');
  const end = userPrompt.indexOf('3. "pullQuotes"', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return userPrompt.slice(start, end);
}

describe('article prompt: sidebar entries carry no document text (slice 2.5)', () => {
  it('no longer asks for verbatim content in a sidebar entry', async () => {
    const fields = evidenceCardsFieldList(await journalistArticlePrompt());
    expect(fields).not.toContain('"content": VERBATIM');
    expect(fields).not.toContain('arcEvidencePackages fullContent');
    expect(fields).toContain('No "content": a sidebar entry prints its headline and summary only');
    expect(fields).toContain('"summary": Brief 100-char summary');
  });

  it('describes "content" as the inline card\'s, copied from the document in <RECORD>', async () => {
    const fields = evidenceCardsFieldList(await journalistArticlePrompt());
    const dual = fields.slice(fields.indexOf('EVIDENCE CARD DUAL FIELDS:'));
    expect(dual).toContain('on the BODY inline "evidence-card" block only (never on a sidebar entry)');
    expect(dual).toContain('COPY EXACTLY from the document with that id in <RECORD>');
    expect(dual).not.toContain('arcEvidencePackages evidenceItems[].fullContent');
    expect(dual).toContain('for the SIDEBAR entry, which is a headline and a summary');
  });
});

describe('content-bundle schema: sidebar content (slice 2.5)', () => {
  const entry = schema.properties.evidenceCards.items;

  it('keeps content optional, so older bundles still validate', () => {
    expect(entry.required).toEqual(['tokenId', 'headline']);
    expect(entry.properties.content).toBeDefined();

    const validator = new SchemaValidator();
    const older = {
      metadata: { sessionId: '092026', theme: 'journalist', generatedAt: '2026-09-22T17:08:47.773Z' },
      headline: { main: 'A headline' },
      sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text: 'Text.' }] }],
      evidenceCards: [{ tokenId: 'vic001', headline: 'The Offer', content: 'Full document text, as older bundles carry it.', summary: 'The offer' }]
    };
    const result = validator.validate('content-bundle', older);
    expect(result.errors).toBeNull();
    expect(result.valid).toBe(true);
  });

  it('says sidebar content does not print, in theme-neutral words', () => {
    const description = entry.properties.content.description;
    expect(description).toMatch(/not printed/i);
    expect(description).toMatch(/headline and summary/);
    // The schema's descriptions reach both themes' prompts.
    expect(description).not.toMatch(/nova|detective|journalist|anondono|reporter/i);
  });
});
