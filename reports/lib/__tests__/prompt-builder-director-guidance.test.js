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
    ['input-review', 'paper-evidence-selection', 'await-roster',
     'await-full-context', 'pre-curation', 'evidence-and-photos', 'arc-selection']
      .forEach((point) => {
        expect(ROLLBACK_CLEARS[point]).toContain('_outlineGuidance');
      });
  });

  it('SURVIVES a rollback into the photo branch or to outline/article', () => {
    // The guidance is captured AT arc-selection, which is upstream of all four.
    expect(ROLLBACK_CLEARS['photos']).not.toContain('_outlineGuidance');
    expect(ROLLBACK_CLEARS['character-ids']).not.toContain('_outlineGuidance');
    expect(ROLLBACK_CLEARS['outline']).not.toContain('_outlineGuidance');
    expect(ROLLBACK_CLEARS['article']).not.toContain('_outlineGuidance');
  });
});

describe('reporting mode REPLACES the persona (BASELINE §4 class 6)', () => {
  // Both remote sessions of the last five were written as on-site. The rule
  // existed at character-voice.md lines 89-94 but lost to the on-site persona
  // stated earlier in the same file and to hardConstraints' own
  // `use "We decided"` line. One mode block, stated once, wins.
  const REMOTE = 'You were not in the room';
  const ONSITE = 'You watched the investigation from inside the room';

  it('remote: says you were not in the room and never voted', async () => {
    const { systemPrompt } = await makeBuilder('journalist', { reportingMode: 'remote' })
      .buildArticlePrompt({ lede: {} }, [], null, [], null, null, null);
    expect(systemPrompt).toContain(REMOTE);
    expect(systemPrompt).toMatch(/you did not vote/i);
    expect(systemPrompt).not.toContain(ONSITE);
  });

  it('on-site: says you watched from the room and still never voted', async () => {
    const { systemPrompt } = await makeBuilder('journalist', { reportingMode: 'on-site' })
      .buildArticlePrompt({ lede: {} }, [], null, [], null, null, null);
    expect(systemPrompt).toContain(ONSITE);
    expect(systemPrompt).toMatch(/you did not vote/i);
    expect(systemPrompt).not.toContain(REMOTE);
  });

  it('defaults to on-site when the session config says nothing', async () => {
    const { systemPrompt } = await makeBuilder('journalist', {})
      .buildArticlePrompt({ lede: {} }, [], null, [], null, null, null);
    expect(systemPrompt).toContain(ONSITE);
  });

  it('no longer tells the reporter to write "We decided"', async () => {
    const { systemPrompt } = await makeBuilder('journalist', { reportingMode: 'remote' })
      .buildArticlePrompt({ lede: {} }, [], null, [], null, null, null);
    // This line directly contradicted the remote rule AND made Nova a member of
    // the room in both modes. It is gone, along with the stray detective line
    // that sat beside it in the JOURNALIST constraints.
    expect(systemPrompt).not.toContain('We decided');
    expect(systemPrompt).not.toContain('you ARE the detective');
  });

  it('states the mode for the detective theme too', async () => {
    const { systemPrompt } = await makeBuilder('detective', { reportingMode: 'remote' })
      .buildArticlePrompt({ executiveSummary: {} }, [], null, [], null, null, null);
    expect(systemPrompt).toContain(REMOTE);
  });
});

describe('the evaluator scores reporter mode (BASELINE §4 class 6)', () => {
  const {
    _testing: { getArticleCriteria, buildEvaluationUserPrompt }
  } = require('../workflow/nodes/evaluator-nodes');

  it('journalist article criteria include reporterMode as STRUCTURAL', () => {
    const criteria = getArticleCriteria('journalist');
    expect(criteria.reporterMode).toBeDefined();
    expect(criteria.reporterMode.type).toBe('structural');
    expect(criteria.reporterMode.weight).toBe(0.10);
  });

  it('detective has no reporterMode criterion', () => {
    expect(getArticleCriteria('detective').reporterMode).toBeUndefined();
  });

  it('both themes’ weights still sum to 1', () => {
    ['journalist', 'detective'].forEach((theme) => {
      const total = Object.values(getArticleCriteria(theme)).reduce((sum, c) => sum + c.weight, 0);
      expect(total).toBeCloseTo(1.0, 5);
    });
  });

  it('the evaluation user prompt states the session mode', () => {
    const remote = buildEvaluationUserPrompt('article', {
      contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'remote' }
    });
    expect(remote).toMatch(/REPORTING MODE/i);
    expect(remote).toContain('remote');

    const onsite = buildEvaluationUserPrompt('article', {
      contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'on-site' }
    });
    expect(onsite).toContain('on-site');
  });
});
