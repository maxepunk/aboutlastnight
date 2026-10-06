/**
 * No instruction left says a sidebar entry carries document text (phase 2 final fix
 * wave, item 5).
 *
 * Brief 2.5 made a sidebar entry a headline and a summary, and put the verbatim
 * `content` on the inline evidence-card block only. Three places still described
 * evidenceCards[] as carrying both: the article writer's field list ("Array of
 * sidebar/inline evidence card content"), its placement rules ("Both sidebar AND body
 * cards (same array, dual fields)"), and the schema description the article prompt
 * embeds ("for sidebar and inline display"). The schema description reaches both
 * themes' prompts, so it stays theme-neutral.
 */

const { PromptBuilder } = require('../prompt-builder');
const { PHASE_REQUIREMENTS } = require('../theme-loader');
const schema = require('../schemas/content-bundle.schema.json');
const { stubThemeLoader } = require('./fixtures/render-writers');

const STALE = [
  'Array of sidebar/inline evidence card content',
  'Both sidebar AND body cards (same array, dual fields)',
  'for sidebar and inline display'
];

describe('the schema\'s evidenceCards description', () => {
  const description = schema.properties.evidenceCards.description;

  it('says a sidebar entry is a headline and a summary, and document text belongs on the inline card', () => {
    expect(description).toMatch(/headline and a summary/);
    expect(description).toMatch(/inline evidence-card block/);
    expect(description).not.toContain('sidebar and inline display');
  });

  it('is theme-neutral: it reaches both themes\' prompts', () => {
    expect(description).not.toMatch(/Nova|NovaNews|detective|Anondono|case file/i);
  });
});

// Phase 4 (brief 4.7b; R1): the detective's article writer went with the old stages.
describe.each(['journalist'])('the %s article writer', (theme) => {
  let userPrompt;
  beforeAll(async () => {
    const builder = new PromptBuilder(stubThemeLoader(PHASE_REQUIREMENTS[theme]), theme, { roster: [] }, {}, null);
    // Brief 4.7b: the article writer writes from the settled weave and the map.
    const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
    const { WEAVE, MAP } = require('./fixtures/rework-state');
    ({ userPrompt } = await builder.buildArticlePrompt(renderSettledWeave(WEAVE, null), MAP, [], null, null, null));
  });

  it('carries none of the stale card instructions', () => {
    STALE.forEach((line) => expect(userPrompt).not.toContain(line));
  });

  it('says evidenceCards[] holds the sidebar entries, and only the inline block carries content', () => {
    expect(userPrompt).toContain(schema.properties.evidenceCards.description);
    // Phase 3 (3.2): the rewritten field list.
    expect(userPrompt).toContain('2. "evidenceCards": the sidebar\'s entries.');
    expect(userPrompt).toContain('"content" is copied from the document with that id in <RECORD>');
  });

  // Phase 4b (brief 1E; R4): a beat's card is a marker on the beat and a flag on one piece of its
  // evidence. The map's label read a beat's "card" as a document id, which no beat carries now.
  it("reads a beat's card as the piece it flags, and names each card's document, never an id on the beat", () => {
    expect(userPrompt).not.toContain('its "card" is the id of the document it prints as an inline evidence card');
    expect(userPrompt).not.toContain('A beat names its material');
    expect(userPrompt).toContain('A beat marked "card": true prints an inline evidence card of the document named by its piece flagged "card": true.');
    expect(userPrompt).toContain('"ale003" for b2, "mor001" for b3 and "p-dna" for b4.');
  });
});
