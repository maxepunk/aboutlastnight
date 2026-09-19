/**
 * Director guidance from the arc-selection gate (Q2 decision)
 *
 * The director picks the arcs and then has nothing to say about them until the
 * outline is already written. The only intervention available was reject-and-
 * regenerate. `outlineGuidance` rides along with the arc selection and is
 * appended LAST to the outline AND article prompts (recency bias), stated to
 * outrank the craft rules where they conflict.
 */

const { PromptBuilder } = require('../prompt-builder');

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

function makeBuilder(theme = 'journalist', sessionConfig = {}) {
  const themeLoader = { loadPhasePrompts: jest.fn().mockResolvedValue(PROMPTS), validate: jest.fn() };
  return new PromptBuilder(themeLoader, theme, sessionConfig, { Vic: 'Vic Kingsley' });
}

const GUIDANCE = 'Lead with the money, not the vote.';

describe('buildOutlinePrompt — <DIRECTOR_GUIDANCE>', () => {
  it('appends the guidance as the LAST section of the user prompt', async () => {
    const { userPrompt } = await makeBuilder().buildOutlinePrompt(
      { narrativeArcs: [{ id: 'a1', title: 'The money' }] },
      ['The money'], 'hero.png', [], [], [], null,
      { directorGuidance: GUIDANCE }
    );
    expect(userPrompt).toContain('<DIRECTOR_GUIDANCE>');
    expect(userPrompt).toContain(GUIDANCE);
    expect(userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
    // The whole point of putting it last: it wins where it conflicts.
    expect(userPrompt).toMatch(/outranks the craft rules/i);
  });

  it('omits the section entirely when there is no guidance', async () => {
    const { userPrompt } = await makeBuilder().buildOutlinePrompt(
      { narrativeArcs: [] }, [], 'hero.png', [], [], [], null
    );
    expect(userPrompt).not.toContain('DIRECTOR_GUIDANCE');
  });

  it('works for the detective theme too', async () => {
    const { userPrompt } = await makeBuilder('detective').buildOutlinePrompt(
      { narrativeArcs: [{ id: 'a1', title: 'The money' }] },
      ['The money'], 'hero.png', [], [], [], null,
      { directorGuidance: GUIDANCE }
    );
    expect(userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });
});

describe('buildArticlePrompt — <DIRECTOR_GUIDANCE>', () => {
  it('appends the guidance as the LAST section of the user prompt', async () => {
    const { userPrompt } = await makeBuilder().buildArticlePrompt(
      { lede: { hook: 'x' } }, [], 'hero.png', [], null, null, null,
      { directorGuidance: GUIDANCE }
    );
    expect(userPrompt).toContain('<DIRECTOR_GUIDANCE>');
    expect(userPrompt).toContain(GUIDANCE);
    expect(userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('omits the section entirely when there is no guidance', async () => {
    const { userPrompt } = await makeBuilder().buildArticlePrompt(
      { lede: { hook: 'x' } }, [], 'hero.png', [], null, null, null
    );
    expect(userPrompt).not.toContain('DIRECTOR_GUIDANCE');
  });

  it('works for the detective theme too', async () => {
    const { userPrompt } = await makeBuilder('detective').buildArticlePrompt(
      { executiveSummary: { hook: 'x' } }, [], 'hero.png', [], null, null, null,
      { directorGuidance: GUIDANCE }
    );
    expect(userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });
});

describe('_outlineGuidance state channel', () => {
  const { ReportStateAnnotation, ROLLBACK_CLEARS } = require('../workflow/state');

  it('is a declared channel (LangGraph drops undeclared keys)', () => {
    expect(Object.keys(ReportStateAnnotation.spec)).toContain('_outlineGuidance');
  });

  it('is cleared by every rollback point at or upstream of arc-selection', () => {
    ['input-review', 'paper-evidence-selection', 'await-roster', 'character-ids',
     'await-full-context', 'pre-curation', 'evidence-and-photos', 'arc-selection']
      .forEach((point) => {
        expect(ROLLBACK_CLEARS[point]).toContain('_outlineGuidance');
      });
  });

  it('SURVIVES a rollback to outline or article (the arcs and the guidance stand)', () => {
    expect(ROLLBACK_CLEARS['outline']).not.toContain('_outlineGuidance');
    expect(ROLLBACK_CLEARS['article']).not.toContain('_outlineGuidance');
  });
});
