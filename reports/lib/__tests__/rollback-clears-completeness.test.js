/**
 * ROLLBACK_CLEARS completeness guard (ROOT-1)
 *
 * buildRollbackState clears a hand-maintained denylist (ROLLBACK_CLEARS). Nothing
 * previously asserted that the denylist actually COVERS every field a node writes —
 * which is exactly how ROLL-1 (roster) and ROLL-2 (arcEvidencePackages) slipped in.
 *
 * This test enumerates every Annotation channel (ReportStateAnnotation.spec) and
 * asserts each one is EITHER cleared by some rollback point OR explicitly listed in
 * ROLLBACK_CLEARS_EXEMPT with a documented reason. A new node-written field added
 * without a clear-list entry (and not exempted) fails here.
 */

const {
  ReportStateAnnotation,
  ROLLBACK_CLEARS,
  ROLLBACK_CLEARS_EXEMPT
} = require('../workflow/state');
const { PHASES_INVALIDATED_BY } = require('../api-helpers');

describe('ROLLBACK_CLEARS completeness (ROOT-1)', () => {
  // Union of every field cleared by ANY rollback point
  const clearedSomewhere = new Set(
    Object.values(ROLLBACK_CLEARS).flat()
  );

  // Enumerate the TRUE channel set (Annotation.spec), not getDefaultState() —
  // getDefaultState omits shellAccounts, so it would miss that channel's drift.
  const allStateFields = Object.keys(ReportStateAnnotation.spec);

  test('every state field is either cleared by a rollback point or explicitly exempt', () => {
    const uncovered = allStateFields.filter(
      f => !clearedSomewhere.has(f) && !ROLLBACK_CLEARS_EXEMPT.has(f)
    );
    expect(uncovered).toEqual([]);
  });

  test('EXEMPT and CLEARED are disjoint (no field both cleared and exempted)', () => {
    const both = [...ROLLBACK_CLEARS_EXEMPT].filter(f => clearedSomewhere.has(f));
    expect(both).toEqual([]);
  });

  test('every EXEMPT entry is a real state field (no stale exemptions)', () => {
    const stale = [...ROLLBACK_CLEARS_EXEMPT].filter(f => !allStateFields.includes(f));
    expect(stale).toEqual([]);
  });

  test('every cleared field is a real state field (no typos in ROLLBACK_CLEARS)', () => {
    const ghosts = [...clearedSomewhere].filter(f => !allStateFields.includes(f));
    expect(ghosts).toEqual([]);
  });

  test('roster + rosterPronouns are cleared somewhere (ROLL-1/ROLL-3 guard)', () => {
    expect(clearedSomewhere.has('roster')).toBe(true);
    expect(clearedSomewhere.has('rosterPronouns')).toBe(true);
  });

  test('arcEvidencePackages is cleared somewhere (ROLL-2 guard)', () => {
    expect(clearedSomewhere.has('arcEvidencePackages')).toBe(true);
  });

  test('full-context raw inputs cleared + _previousFullContext exempt (ROLL-4 guard)', () => {
    expect(clearedSomewhere.has('accusation')).toBe(true);
    expect(clearedSomewhere.has('sessionReport')).toBe(true);
    expect(clearedSomewhere.has('directorNotesRaw')).toBe(true);
    expect(ROLLBACK_CLEARS_EXEMPT.has('_previousFullContext')).toBe(true);
  });
});

describe('ROLLBACK_CLEARS per-point re-pause completeness (ROOT-1, audit extension)', () => {
  // GRAPH EXECUTION / REPLAY order (derived from graph.js edges) - deliberately NOT
  // the frontend DISPLAY order. On rollback the graph replays from START in this
  // order, so a field captured at checkpoint C is "downstream" of every point
  // at-or-before C. 'input-review' executes LATE (after await-full-context) despite
  // its 0.2 label: the graph reaches it via checkpointAwaitContext -> parseRawInput
  // -> checkpointInputReview (B2).
  const MAIN_LINE = [
    'paper-evidence-selection',
    'await-roster',
    'await-full-context',
    'input-review',
    'pre-curation',
    'evidence-and-photos',
    'arc-selection',
    'outline',
    'article'
  ];

  // The PHOTO BRANCH (photo late-join). These two gates are not stages of the main
  // line: the branch hangs off checkpointArcSelection's forward leg and joins at
  // buildArcEvidencePackages. In replay order: ... arc-selection -> photos ->
  // character-ids -> outline ...
  const PHOTO_BRANCH = ['photos', 'character-ids'];

  // The branch's fields split in two, and the split is what the two rules below
  // enforce.
  //
  // INPUTS: nothing on the main line makes these stale, and they must move as a
  // unit (C3), so ONLY `photos` clears them.
  const PHOTO_INPUT_FIELDS = [
    'photosPath', 'sessionPhotos', 'preprocessStats', 'whiteboardPhotoPath', 'genericPhotoAnalyses'
  ];

  // ROSTER-DERIVED: the roster feeds every Haiku photo prompt AND the character-ID
  // parse, and finalizePhotoAnalyses skips whenever any analysis is already
  // enriched - so a roster change leaves the captions keyed to the OLD names and
  // no replay re-enriches them. Points at-or-before await-roster MAY clear these;
  // points after it must not (C4: the common rollback must not re-pay Haiku).
  const ROSTER_DERIVED_FIELDS = ['photoAnalyses', 'characterIdMappings'];

  // The human-captured skip-field(s) whose presence makes each checkpoint SKIP
  // (silently reuse stale input) on the replay - verified against
  // checkpoint-nodes.js skip conditions. 'photos' skips on state.photosPath alone
  // (C1/C2: NOT on a directory scan - preprocessPhotos copies every photo into
  // data/<id>/photos, so a scan-based skip could never fire twice).
  const SKIP_FIELDS = {
    'paper-evidence-selection': ['selectedPaperEvidence'],
    'await-roster': ['roster', 'rosterPronouns'],
    'await-full-context': ['accusation', 'sessionReport', 'directorNotesRaw'],
    'input-review': ['inputReviewApproved'],
    'pre-curation': ['preCurationApproved'],
    'evidence-and-photos': ['_evidenceApproved'],
    'arc-selection': ['selectedArcs'],
    'photos': ['photosPath'],
    'character-ids': ['characterIdMappings'],
    'outline': ['outlineApproved'],
    'article': ['articleApproved']
  };

  test('every main-line point clears its own + every downstream main-line skip-field', () => {
    const gaps = [];
    MAIN_LINE.forEach((checkpoint, idx) => {
      for (const field of SKIP_FIELDS[checkpoint]) {
        for (let p = 0; p <= idx; p++) {
          const point = MAIN_LINE[p];
          if (!(ROLLBACK_CLEARS[point] || []).includes(field)) {
            gaps.push(`${point} does not clear '${field}' (captured at ${checkpoint})`);
          }
        }
      }
    });
    expect(gaps).toEqual([]);
  });

  test('each photo-branch point clears its own + the branch skip-fields after it', () => {
    // photos precedes character-ids inside the branch, so it clears both.
    expect(ROLLBACK_CLEARS['photos']).toContain('photosPath');
    expect(ROLLBACK_CLEARS['photos']).toContain('characterIdMappings');
    expect(ROLLBACK_CLEARS['character-ids']).toContain('characterIdMappings');
    expect(ROLLBACK_CLEARS['character-ids']).not.toContain('photosPath');
  });

  test('each photo-branch point clears the main-line gates downstream of the join', () => {
    for (const point of PHOTO_BRANCH) {
      expect(ROLLBACK_CLEARS[point]).toContain('outlineApproved');
      expect(ROLLBACK_CLEARS[point]).toContain('articleApproved');
      // The join rebuilds the packages from the new analyses/mappings.
      expect(ROLLBACK_CLEARS[point]).toContain('arcEvidencePackages');
    }
  });

  test('no photo-branch point clears an UPSTREAM main-line gate', () => {
    const upstreamSkipFields = MAIN_LINE.slice(0, MAIN_LINE.indexOf('outline'))
      .flatMap((cp) => SKIP_FIELDS[cp]);
    for (const point of PHOTO_BRANCH) {
      const wrong = (ROLLBACK_CLEARS[point] || []).filter((f) => upstreamSkipFields.includes(f));
      expect(wrong).toEqual([]);
    }
  });

  test('no main-line point ever clears a photo INPUT - only `photos` owns those (C4/C3)', () => {
    const wrong = [];
    MAIN_LINE.forEach((point) => {
      (ROLLBACK_CLEARS[point] || []).forEach((field) => {
        if (PHOTO_INPUT_FIELDS.includes(field)) wrong.push(`${point} clears input '${field}'`);
      });
    });
    expect(wrong).toEqual([]);
    expect(ROLLBACK_CLEARS['character-ids'].filter((f) => PHOTO_INPUT_FIELDS.includes(f))).toEqual([]);
  });

  test('only points at-or-before await-roster clear the roster-derived outputs (v2 I2)', () => {
    const rosterIdx = MAIN_LINE.indexOf('await-roster');
    const wrong = [];
    MAIN_LINE.forEach((point, idx) => {
      const cleared = (ROLLBACK_CLEARS[point] || []).filter((f) => ROSTER_DERIVED_FIELDS.includes(f));
      if (idx > rosterIdx && cleared.length > 0) {
        wrong.push(`${point} (after await-roster) clears ${cleared.join(', ')}`);
      }
    });
    expect(wrong).toEqual([]);
    // And the two that MAY, do: the roster is an input to both outputs, so a roster
    // rollback that left them in place would ship captions keyed to the old names.
    expect(ROLLBACK_CLEARS['paper-evidence-selection']).toContain('photoAnalyses');
    expect(ROLLBACK_CLEARS['paper-evidence-selection']).toContain('characterIdMappings');
    expect(ROLLBACK_CLEARS['await-roster']).toContain('photoAnalyses');
    expect(ROLLBACK_CLEARS['await-roster']).toContain('characterIdMappings');
  });

  test('sessionPhotos is never cleared without preprocessStats and whiteboardPhotoPath (C3)', () => {
    // preprocessPhotos OVERWRITES sessionPhotos with the PROCESSED paths and skips
    // on preprocessStats, so clearing the list alone re-fetches the full-resolution
    // originals and then skips the resize - the article then points at 46 MB of
    // unprocessed images and Character IDs is a minute of blank cards (H27).
    Object.entries(ROLLBACK_CLEARS).forEach(([point, fields]) => {
      if (!fields.includes('sessionPhotos')) return;
      expect(fields).toContain('preprocessStats');
      expect(fields).toContain('whiteboardPhotoPath');
      expect(fields).toContain('genericPhotoAnalyses');
    });
  });

  test('every checkpoint in both lists is a real rollback point', () => {
    for (const cp of [...MAIN_LINE, ...PHOTO_BRANCH]) {
      expect(ROLLBACK_CLEARS).toHaveProperty(cp);
    }
  });

  test('every skip-field and photo field is a real state channel (no stale fixture)', () => {
    const all = Object.keys(ReportStateAnnotation.spec);
    const names = [...new Set([
      ...Object.values(SKIP_FIELDS).flat(), ...PHOTO_INPUT_FIELDS, ...ROSTER_DERIVED_FIELDS
    ])];
    expect(names.filter((f) => !all.includes(f))).toEqual([]);
  });

  describe('steering channels (spec 2026-09-19 §4.5, §5.4)', () => {
    const points = Object.keys(ROLLBACK_CLEARS);

    test.each(points)('%s clears the hand-edit diff and report exactly where it clears the feedback slot', (point) => {
      const list = ROLLBACK_CLEARS[point];
      expect(list.includes('_outlineHandEdits')).toBe(list.includes('_outlineFeedback'));
      expect(list.includes('_outlineHandEditReport')).toBe(list.includes('_outlineFeedback'));
      expect(list.includes('_articleHandEdits')).toBe(list.includes('_articleFeedback'));
      expect(list.includes('_articleHandEditReport')).toBe(list.includes('_articleFeedback'));
    });

    test('directorGateNotes clears at arc-selection and every point upstream of it', () => {
      ['input-review', 'paper-evidence-selection', 'await-roster', 'await-full-context',
       'pre-curation', 'evidence-and-photos', 'arc-selection']
        .forEach((p) => expect(ROLLBACK_CLEARS[p]).toContain('directorGateNotes'));
    });

    test('directorGateNotes is NOT list-cleared by the four downstream points (they prune instead)', () => {
      ['photos', 'character-ids', 'outline', 'article']
        .forEach((p) => expect(ROLLBACK_CLEARS[p]).not.toContain('directorGateNotes'));
    });

    // The two lists above enumerate today's eleven points by hand. This pins the
    // PARTITION itself: a twelfth rollback point that is in neither mechanism would
    // silently keep every standing note, and one in both would be a contradiction
    // (M1; the per-point-completeness lesson in the memory file is this shape).
    test.each(points)('%s uses exactly one directorGateNotes mechanism: clear or prune', (point) => {
      const listClears = ROLLBACK_CLEARS[point].includes('directorGateNotes');
      const prunes = Object.prototype.hasOwnProperty.call(PHASES_INVALIDATED_BY, point);
      expect(listClears).toBe(!prunes);
    });
  });
});
