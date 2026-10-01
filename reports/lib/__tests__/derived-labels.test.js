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

  it('labels the remaining machine-made material for what it is now (phase 3, 3.6)', () => {
    // The tensions no longer match account names to roster names (T4). The label
    // claims only what is true of a new note and of one stored before 3.6: code
    // found it in the director's notes, and it is a lead the record overrules.
    expect(DERIVED_LABELS.narrativeTensions).not.toMatch(/account names/);
    expect(DERIVED_LABELS.narrativeTensions).toMatch(/director's notes/);
    expect(DERIVED_LABELS.narrativeTensions).toMatch(/leads, not the record/);
    for (const label of Object.values(DERIVED_LABELS)) expect(label).not.toContain('\u2014');
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
