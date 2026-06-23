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
      loadTemplate: jest.fn(),
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
    const { userPrompt } = await builder.buildOutlinePrompt(
      { narrativeArcs: [{ id: 'arc-1', title: 'The Money' }] },
      ['The Money'],
      null
    );
    expect(userPrompt).not.toContain('"pullQuotes"');
  });

  it('outline schema no longer defines a thePlayers.pullQuotes property', () => {
    expect(outlineSchema.properties.thePlayers.properties).not.toHaveProperty('pullQuotes');
  });
});
