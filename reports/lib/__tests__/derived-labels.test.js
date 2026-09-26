/**
 * Labels on derived material (brief 2.1).
 *
 * Anything a machine produced says who made it and that the record decides,
 * wherever it reaches a writer or a judge. The writer-side sites (character
 * context, the contradiction notes) are pinned beside their prompts in
 * prompt-builder.test.js, arc-specialist-prompts.test.js and
 * contradiction-prompt.test.js. The judge-side site is pinned here.
 */

jest.mock('../workflow/checkpoint-helpers', () => require('../../__tests__/mocks/checkpoint-helpers.mock'));

const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');
const {
  _testing: { buildEvaluationSystemPrompt, getOutlineCriteria }
} = require('../workflow/nodes/evaluator-nodes');

describe('derived-material labels', () => {
  it('each label says who made the material and that the record decides', () => {
    for (const label of Object.values(DERIVED_LABELS)) {
      expect(label).toMatch(/the record decides/);
      expect(label).not.toMatch(/ground truth|verified to/i);
    }
    expect(DERIVED_LABELS.characterContext).toMatch(/model \(Haiku\)/);
    expect(DERIVED_LABELS.photoDescriptions).toMatch(/model \(Haiku\)/);
    expect(DERIVED_LABELS.narrativeTensions).toMatch(/pipeline's code/);
  });

  it('the outline judge is told the Haiku photo descriptions are derived, not ground truth', () => {
    const prompt = buildEvaluationSystemPrompt('outline', getOutlineCriteria('journalist'), 'journalist');
    expect(prompt).toContain(`- photoAnalyses: The photo descriptions are fixed upstream. ${DERIVED_LABELS.photoDescriptions}`);
    expect(prompt).not.toContain('The photo descriptions are ground truth');
  });

  it('the detective outline judge still gets no photo line', () => {
    const prompt = buildEvaluationSystemPrompt('outline', getOutlineCriteria('detective'), 'detective');
    expect(prompt).not.toContain('photoAnalyses:');
  });
});
