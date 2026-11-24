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
      "Its pronouns are the documents', which are often not this session's. Take pronouns from the list of names."
    );
  });

  // Run 2c (the wording doc's part 4): the label over the sentences about Blake, word for word.
  it('the label over the sentences about Blake is the approved line', () => {
    expect(DERIVED_LABELS.narrativeTensions).toBe(
      "Code gathered these sentences from the director's notes above: every one that mentions Blake, by name or as the Valet. " +
      'A memory is sold to Blake, so these are where the notes record who was seen making a deal. ' +
      'They are listed again for that check only. Being listed here does not make them more important to the story.'
    );
  });

  // Run 2e (the wording doc's part 9): the label over the sales a model paired with the notes,
  // word for word. A pairing is the model's guess; the notes or the ledger decide.
  it('the label over the paired sales is the approved line', () => {
    expect(DERIVED_LABELS.transactionLinks).toBe(
      "A model paired each observation below, quoted from the director's notes, with the sales in the ledger it judged to match. " +
      "Each pairing is the model's guess, not something the notes state. Where the notes or the ledger point another way, they decide."
    );
  });

  // Run 2e: with the label over the paired sales reworded, no label names the model that made
  // it, and none says "the record decides" (docs/architecture/director-words.md says so).
  it('no label names the model that made it, or says the record decides', () => {
    for (const label of Object.values(DERIVED_LABELS)) {
      expect(label).not.toMatch(/\((?:Opus|Haiku|Sonnet)\)/);
      expect(label).not.toMatch(/the record decides/);
    }
  });
});
