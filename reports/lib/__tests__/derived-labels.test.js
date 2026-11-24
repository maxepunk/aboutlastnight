/**
 * Labels on derived material (brief 2.1; phase 18, run 2c, the wording doc's parts 4 and 5).
 *
 * Anything a machine produced says who made it and what decides where the two differ,
 * wherever it reaches a writer or a judge. The writer-side sites (character
 * context, the sentences about Blake) are pinned beside their prompts in
 * prompt-builder.test.js, arc-specialist-prompts.test.js and
 * contradiction-prompt.test.js. The judge-side site, the outline judge's photo
 * analyses, went with the outline judge (phase 4, brief 4.6).
 */

jest.mock('../workflow/checkpoint-helpers', () => require('../../__tests__/mocks/checkpoint-helpers.mock'));

const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');

describe('derived-material labels', () => {
  it('no label calls derived material ground truth or verified, and none carries a dash', () => {
    for (const label of Object.values(DERIVED_LABELS)) {
      expect(label).not.toMatch(/ground truth|verified to/i);
      expect(label).not.toMatch(/[–—]/);
    }
    // Phase 4 (brief 4.6): the photo analyses' label went with the outline judge.
    expect(DERIVED_LABELS).not.toHaveProperty('photoDescriptions');
  });

  // Run 2c (the wording doc's part 5): the three labels over derived blocks, word for word.
  it("the label over the quote bank, the epilogue's and the character summary's are the approved lines", () => {
    expect(DERIVED_LABELS.directorNotesIndex).toBe(
      "A model built this from the director's notes above. Where it differs from the notes, the notes decide."
    );
    expect(DERIVED_LABELS.epilogue).toBe(
      "A model picked these sentences out of the director's notes as the epilogue, what happened after the investigation. " +
      'Each is copied as written. Where the notes give a different account of what happened afterwards, the notes decide.'
    );
    expect(DERIVED_LABELS.characterContext).toBe(
      'A model made this summary from the documents in the record. Where it differs from a document, the document decides. ' +
      "Its pronouns are the documents', which are often not this session's. Take pronouns from the roster."
    );
  });

  // Run 2c (the wording doc's part 4): the label over the sentences about Blake, word for word.
  it('the label over the sentences about Blake is the approved line', () => {
    expect(DERIVED_LABELS.narrativeTensions).toBe(
      "Code gathered these sentences from the director's notes above: every one that mentions Blake. " +
      'A memory is sold to Blake, so these are where the notes record who was seen making a deal. ' +
      'They are listed again for that check only. Being listed here does not make them more important to the story.'
    );
  });

  it('labels the transaction links for what they are: the model\'s pairing of an observation with sales', () => {
    // A transaction link joins one of the director's observations to a sale: the
    // join is the model's reading.
    expect(DERIVED_LABELS.transactionLinks).toMatch(/observation/);
    expect(DERIVED_LABELS.transactionLinks).toMatch(/sale/);
    expect(DERIVED_LABELS.transactionLinks).toMatch(/reading/);
  });
});
