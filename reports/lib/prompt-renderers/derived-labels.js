/**
 * Labels for derived material (phase 2, brief 2.1)
 *
 * Anything a machine produced says so wherever it reaches a writer or a judge:
 * that a model or code made it, and what decides where the two differ. These used to
 * reach the prompts as "use for factual accuracy", "ground truth" and "verified to
 * respect evidence boundaries", and nothing had verified any of it
 * (docs/superpowers/specs/2026-09-24-information-architecture.md §5, root cause 3).
 *
 * One wording per kind of material, shared by every prompt that carries it. Phase 18, run 2c
 * (the wording doc's parts 4 and 5): the labels over the quote bank, the epilogue, the summary of
 * the characters and the sentences about Blake take the approved lines, in the limits' manner.
 * Run 2e (the wording doc's part 9): the label over the paired sales takes its approved line, the
 * summary's label sends pronouns to the list of names, and the Blake label names the Valet too.
 */

const DERIVED_LABELS = {
  /**
   * characterData, from extractCharacterData (Haiku). Run 2c: its pronouns are the documents',
   * which the roster overrides, so the label says where pronouns come from. Run 2e: it names the
   * block by what it is called in the prompt, the list of names (prompt-builder.js ROSTER_OPENING),
   * whose heading no longer says "roster". The weave writer and the two judges print it; the
   * article writer reads no summary (run 2b, R22).
   */
  characterContext:
    'A model made this summary from the documents in the record. Where it differs from a document, ' +
    "the document decides. Its pronouns are the documents', which are often not this session's. " +
    'Take pronouns from the list of names.',

  /**
   * narrativeTensions, from surfaceContradictions (code, no model). Since phase 3
   * (3.6) the code no longer matches account names to roster names (T4): its one
   * note lists the director's own sentences that name Blake or the Valet. From wave
   * 2 the print sites drop the old-type tensions a thread surfaced before 3.6 stored
   * (092026 and 092626 carry "Director observed multiple characters interacting
   * with Blake") and re-print a stored blake-proximity tension from its
   * `observations`, so every printed tension is the director's sentences.
   *
   * Phase 18, run 2c (the wording doc's part 4): the label says what the sentences are for, the
   * check on who was seen making a deal, and that being listed does not make them more important.
   * The weave writer (and its rework) is the one reader: it prints them under its Blake heading,
   * after the notes. The article writer and its rework no longer read the block. Run 2e (part 9):
   * the first sentence says a sentence that names only the Valet is gathered too, as
   * surfaceContradictions gathers it (contradiction-nodes.js: "blake" or "valet").
   */
  narrativeTensions:
    "Code gathered these sentences from the director's notes above: every one that mentions Blake, by name or as the Valet. " +
    'A memory is sold to Blake, so these are where the notes record who was seen making a deal. ' +
    'They are listed again for that check only. Being listed here does not make them more important to the story.',

  // photoDescriptions, the Haiku photo analyses' label, went with the outline judge, its
  // last reader (phase 4, brief 4.6).

  /**
   * The director-notes index, from enrichDirectorNotes (Opus): <QUOTE_BANK>
   * (integrator ruling, phase 2 final fix wave: it is machine-made). The notes
   * themselves, and the corrections after them, are the director's words and carry
   * no label. Run 2c: where the bank differs from the notes, the notes decide.
   */
  directorNotesIndex:
    "A model built this from the director's notes above. Where it differs from the notes, the notes decide.",

  /**
   * <TRANSACTION_LINKS>, from enrichDirectorNotes (Opus). Phase 3 (3.6): a link joins
   * one of the director's observations to ledger sales, and that join is the model's
   * reading of the notes, never something the notes state (T4). Phase 18, run 2e (the wording
   * doc's part 9): a pairing is the model's guess, and where the notes or the ledger point
   * another way, they decide.
   */
  transactionLinks:
    "A model paired each observation below, quoted from the director's notes, with the sales in the ledger it judged to match. " +
    "Each pairing is the model's guess, not something the notes state. Where the notes or the ledger point another way, they decide.",

  /**
   * <EPILOGUE>, from enrichDirectorNotes (Opus). Phase 3 (3.6): the sentences are the
   * director's, checked word for word against the notes; which sentences make the
   * epilogue is the model's choice. Run 2c: where the notes tell what happened afterwards
   * differently, the notes decide.
   */
  epilogue:
    "A model picked these sentences out of the director's notes as the epilogue, what happened after the investigation. " +
    'Each is copied as written. Where the notes give a different account of what happened afterwards, the notes decide.'
};

module.exports = { DERIVED_LABELS };
