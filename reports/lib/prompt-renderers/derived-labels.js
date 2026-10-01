/**
 * Labels for derived material (phase 2, brief 2.1)
 *
 * Anything a machine produced says so wherever it reaches a writer or a judge:
 * who made it, and that the record decides where the two differ. These used to
 * reach the prompts as "use for factual accuracy", "ground truth" and "verified to
 * respect evidence boundaries", and nothing had verified any of it
 * (docs/superpowers/specs/2026-09-24-information-architecture.md §5, root cause 3).
 *
 * One wording per kind of material, shared by every prompt that carries it.
 */

const DERIVED_LABELS = {
  /** characterData, from extractCharacterData (Haiku). */
  characterContext:
    'A model (Haiku) extracted this from the documents. It is derived, not the record: ' +
    'where it differs from the record, the record decides.',

  /**
   * narrativeTensions, from surfaceContradictions (code, no model). Since phase 3
   * (3.6) the code no longer matches account names to roster names (T4): its one
   * note lists the director's own sentences about Blake and the Valet, and says so
   * itself. A thread surfaced before 3.6 keeps its stored notes (092026 and 092626
   * carry "Director observed multiple characters interacting with Blake"), so this
   * label claims only what holds for both.
   */
  narrativeTensions:
    'The pipeline\'s code found these by searching the director\'s notes. They are leads, ' +
    'not the record: where one differs from the notes or the rest of the record, the record decides.',

  /** photoAnalyses, from analyzePhotos and finalizePhotoAnalyses (Haiku). */
  photoDescriptions:
    'A model (Haiku) wrote them from the photos. They are derived, not the record: ' +
    'where they differ from the record, the record decides.',

  /**
   * The director-notes indexes, from enrichDirectorNotes (Opus): <QUOTE_BANK> and
   * <TRANSACTION_LINKS> (integrator ruling, phase 2 final fix wave: they are
   * machine-made). The notes themselves, and the corrections after them, are the
   * director's words and carry no label.
   */
  directorNotesIndex:
    'A model (Opus) built this from the director\'s notes above. It is derived, not the record: ' +
    'where it differs from the notes or the rest of the record, the record decides.'
};

module.exports = { DERIVED_LABELS };
