const { PromptBuilder } = require('../prompt-builder');
const outlineSchema = require('../schemas/outline.schema.json');

// Mock ThemeLoader — minimal: loadPhasePrompts returns empty prompts for each key
jest.mock('../theme-loader', () => {
  const actual = jest.requireActual('../theme-loader');
  return {
    ...actual,
    createThemeLoader: jest.fn(() => ({
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'section-rules': '',
        'editorial-design': '',
        'narrative-structure': '',
        'formatting': '',
        'evidence-boundaries': ''
      }),
      validate: jest.fn()
    }))
  };
});

describe('outline contract — pullQuotes removed post-F3 (X-5)', () => {
  it('outline JSON skeleton in the prompt no longer elicits pullQuotes', async () => {
    const mockThemeLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'section-rules': '',
        'editorial-design': '',
        'narrative-structure': '',
        'formatting': '',
        'evidence-boundaries': ''
      })
    };
    const builder = new PromptBuilder(mockThemeLoader, 'journalist');
    // Phase 4 (brief 4.6): the outline is the story map, laid out from the settled weave.
    const { userPrompt } = await builder.buildOutlinePrompt('<SETTLED_WEAVE>\nSTORY: The Money\n</SETTLED_WEAVE>', [], [], null, {});
    expect(userPrompt).not.toContain('"pullQuotes"');
  });

  it('the map schema defines no pullQuotes anywhere', () => {
    expect(JSON.stringify(outlineSchema)).not.toContain('pullQuotes');
  });
});
