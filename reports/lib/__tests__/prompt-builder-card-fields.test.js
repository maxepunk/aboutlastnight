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
 *
 * Phase 3 (3.2): the journalist instruction was rewritten to ask only for the fields
 * the article prints, so these read its new field list. The sidebar entry is still a
 * headline and a summary, and the card text is still the inline block's.
 */

const { PromptBuilder } = require('../prompt-builder');
const { DOCUMENT_POINTER } = require('../prompt-renderers/record-view');
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
  // Brief 4.7b: the article writer writes from the settled weave and the map.
  const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
  const { WEAVE, MAP } = require('./fixtures/rework-state');
  const { userPrompt } = await builder.buildArticlePrompt(renderSettledWeave(WEAVE, null), MAP, [], null, null, null);
  return userPrompt;
}

/** The text of the evidenceCards field list, up to the next numbered field. */
function evidenceCardsFieldList(userPrompt) {
  const start = userPrompt.indexOf('2. "evidenceCards"');
  const end = userPrompt.indexOf('3. "heroImage"', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return userPrompt.slice(start, end);
}

describe('article prompt: sidebar entries carry no document text (slice 2.5)', () => {
  it('no longer asks for verbatim content in a sidebar entry', async () => {
    const fields = evidenceCardsFieldList(await journalistArticlePrompt());
    expect(fields).not.toContain('"content"');
    expect(fields).not.toContain('arcEvidencePackages fullContent');
    expect(fields).toContain('a one-line "summary" under 100 characters');
    expect(await journalistArticlePrompt()).toContain('a sidebar entry\'s "owner", "placement" and "content"');
  });

  it('describes "content" as the inline card\'s, copied from the document in <RECORD>', async () => {
    const prompt = await journalistArticlePrompt();
    const block = prompt.slice(prompt.indexOf('* {"type": "evidence-card"'), prompt.indexOf('* {"type": "evidence-reference"'));
    expect(block).toContain(`"content" is copied from ${DOCUMENT_POINTER}`);
    expect(block).not.toContain('arcEvidencePackages evidenceItems[].fullContent');
    expect(evidenceCardsFieldList(prompt)).toContain('"evidenceCards": the sidebar\'s entries');
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
