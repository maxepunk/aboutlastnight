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
    for (const [kind, label] of Object.entries(DERIVED_LABELS)) {
      // The tensions are the director's own sentences, which are record; only their
      // gathering is code's (3.6 fix batch, item 4), so there is nothing for the
      // record to overrule.
      if (kind !== 'narrativeTensions') expect(label).toMatch(/the record decides/);
      expect(label).not.toMatch(/ground truth|verified to/i);
    }
    expect(DERIVED_LABELS.characterContext).toMatch(/model \(Haiku\)/);
    expect(DERIVED_LABELS.photoDescriptions).toMatch(/model \(Haiku\)/);
    expect(DERIVED_LABELS.narrativeTensions).toMatch(/pipeline's code/);
    expect(DERIVED_LABELS.directorNotesIndex).toMatch(/model \(Opus\)/);
    expect(DERIVED_LABELS.transactionLinks).toMatch(/model \(Opus\)/);
    expect(DERIVED_LABELS.epilogue).toMatch(/model \(Opus\)/);
  });

  it('labels the remaining machine-made material for what it is now (phase 3, 3.6)', () => {
    // The tensions no longer match account names to roster names (T4). From wave 2
    // the print sites drop stored old-type tensions, so a printed tension is the
    // director's own sentences naming Blake or the Valet, gathered by code (3.6 fix
    // batch, item 4, integrator's ruling): the label says so, and that they are record.
    expect(DERIVED_LABELS.narrativeTensions).toBe(
      "The pipeline's code gathered the sentences below by searching the director's notes for Blake and the Valet. " +
      "Each is the director's own sentence, copied as written, so each is part of the record; only the choice of sentences is the code's."
    );
    expect(DERIVED_LABELS.narrativeTensions).not.toMatch(/account names|leads/);
    // A transaction link joins one of the director's observations to a sale: the
    // join is the model's reading.
    expect(DERIVED_LABELS.transactionLinks).toMatch(/observation/);
    expect(DERIVED_LABELS.transactionLinks).toMatch(/sale/);
    expect(DERIVED_LABELS.transactionLinks).toMatch(/reading/);
    // The epilogue's sentences are the director's; which sentences is the model's choice.
    expect(DERIVED_LABELS.epilogue).toMatch(/epilogue/);
    expect(DERIVED_LABELS.epilogue).toMatch(/as written/);
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
