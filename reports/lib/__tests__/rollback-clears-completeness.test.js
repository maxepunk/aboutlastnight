/**
 * ROLLBACK_CLEARS completeness guard (ROOT-1)
 *
 * buildRollbackState clears a hand-maintained denylist (ROLLBACK_CLEARS). Nothing
 * previously asserted that the denylist actually COVERS every field a node writes —
 * which is exactly how ROLL-1 (roster) and ROLL-2 (the arc packages, which went in
 * phase 4, brief 4.6) slipped in.
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
const { STOPS_INVALIDATED_BY } = require('../api-helpers');

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
  // line: the branch hangs off checkpointArcSelection's forward leg and joins at the
  // outline writer (phase 4, brief 4.6: the arc packages that joined it went). In
  // replay order: ... arc-selection -> photos -> character-ids -> outline ...
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
    // Brief 4.5: the story meeting's own approval.
    'arc-selection': ['meetingApproved'],
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

    test('directorGateNotes clears at every point upstream of arc-selection', () => {
      ['input-review', 'paper-evidence-selection', 'await-roster', 'await-full-context',
       'pre-curation', 'evidence-and-photos']
        .forEach((p) => expect(ROLLBACK_CLEARS[p]).toContain('directorGateNotes'));
    });

    // Brief 4.5 (R9): going back to the story meeting keeps the meeting's notes, and
    // prunes the map's and the article's as the later points do.
    test('directorGateNotes is NOT list-cleared by arc-selection and the four points after it (they prune instead)', () => {
      ['arc-selection', 'photos', 'character-ids', 'outline', 'article']
        .forEach((p) => expect(ROLLBACK_CLEARS[p]).not.toContain('directorGateNotes'));
    });

    // The two lists above enumerate today's eleven points by hand. This pins the
    // PARTITION itself: a twelfth rollback point that is in neither mechanism would
    // silently keep every standing note, and one in both would be a contradiction
    // (M1; the per-point-completeness lesson in the memory file is this shape).
    // Brief 4.5: the pruning reads its own table of invalidated stops, apart from the
    // evaluation stubs (lib/api-helpers.js STOPS_INVALIDATED_BY).
    test.each(points)('%s uses exactly one directorGateNotes mechanism: clear or prune', (point) => {
      const listClears = ROLLBACK_CLEARS[point].includes('directorGateNotes');
      const prunes = Object.prototype.hasOwnProperty.call(STOPS_INVALIDATED_BY, point);
      expect(listClears).toBe(!prunes);
    });
  });

  // Phase 2, brief 2.2: the director's words are cleared with the parse they belong to.
  describe("the director's-words channels (phase 2, brief 2.2)", () => {
    const points = Object.keys(ROLLBACK_CLEARS);

    test.each(points)('%s clears photoDescriptions exactly where it clears characterIdMappings', (point) => {
      const list = ROLLBACK_CLEARS[point];
      expect(list.includes('photoDescriptions')).toBe(list.includes('characterIdMappings'));
    });

    // The parse is re-derived wherever its raw inputs are re-collected: the three
    // points that clear `accusation` (await-full-context also lists the parse outputs;
    // the two upstream points re-pause it, and its capture nulls them). input-review
    // keeps the parse (loadDirectorNotes rehydrates it), so it keeps its corrections.
    test.each(points)('%s clears inputReviewCorrections exactly where it re-collects the parse inputs', (point) => {
      const list = ROLLBACK_CLEARS[point];
      expect(list.includes('inputReviewCorrections')).toBe(list.includes('accusation'));
    });

    test('input-review keeps the corrections to the parse it keeps', () => {
      expect(ROLLBACK_CLEARS['input-review']).not.toContain('inputReviewCorrections');
      expect(ROLLBACK_CLEARS['input-review']).not.toContain('sessionConfig');
    });
  });

  // Brief 4.2: the leave-out list is the boxes' record of the mappings' exclusions, so it
  // is cleared with them. A rollback that re-opens the character-IDs stop shows every box
  // clear, and a photo the director unticks there comes back.
  describe('the leave-out list (phase 4, brief 4.2)', () => {
    test.each(Object.keys(ROLLBACK_CLEARS))('%s clears leftOutPhotos exactly where it clears characterIdMappings', (point) => {
      const list = ROLLBACK_CLEARS[point];
      expect(list.includes('leftOutPhotos')).toBe(list.includes('characterIdMappings'));
    });

    test('the four points that clear the mappings clear the list', () => {
      ['paper-evidence-selection', 'await-roster', 'photos', 'character-ids']
        .forEach((point) => expect(ROLLBACK_CLEARS[point]).toContain('leftOutPhotos'));
    });
  });

  // Brief 2.7: each stop's trace holds the automatic passes of the round that its
  // feedback slot belongs to, and follows that side's hand-edit fields through every
  // clear: send back (server-build-resume-payload.test.js), approve
  // (checkpoint-hand-edit-clears.test.js) and, here, the rollback points. A rollback to
  // `article` regenerates only the article, so it keeps the outline's trace, as it
  // keeps the outline's hand edits.
  describe('trace channels (phase 2, brief 2.7)', () => {
    const points = Object.keys(ROLLBACK_CLEARS);

    test.each(points)('%s clears each trace exactly where it clears that side\'s feedback slot and hand-edit fields', (point) => {
      const list = ROLLBACK_CLEARS[point];
      expect(list.includes('_outlineTrace')).toBe(list.includes('_outlineFeedback'));
      expect(list.includes('_articleTrace')).toBe(list.includes('_articleFeedback'));
      expect(list.includes('_outlineTrace')).toBe(list.includes('_outlineHandEdits'));
      expect(list.includes('_articleTrace')).toBe(list.includes('_articleHandEdits'));
    });

    test('the outline trace is cleared at every point but `article`; the article trace at all eleven', () => {
      const clearingOutline = points.filter((p) => ROLLBACK_CLEARS[p].includes('_outlineTrace'));
      const clearingArticle = points.filter((p) => ROLLBACK_CLEARS[p].includes('_articleTrace'));
      expect(points).toHaveLength(11);
      expect(clearingOutline.sort()).toEqual(points.filter((p) => p !== 'article').sort());
      expect(clearingArticle.sort()).toEqual(points.slice().sort());
    });

    test('neither trace is exempt', () => {
      expect(ROLLBACK_CLEARS_EXEMPT.has('_outlineTrace')).toBe(false);
      expect(ROLLBACK_CLEARS_EXEMPT.has('_articleTrace')).toBe(false);
    });
  });
});

// Brief 4.5 (R9; K2 and K3 of the plan review): going back to the story meeting reopens it
// as the director left it. The weave, its baseline and the standing edits survive the
// meeting's point and every point after it, and go only with the stages that write the
// weave again; the approval, the round mark, the marks and the report go wherever the
// meeting reopens.
describe("the story meeting's channels (brief 4.5)", () => {
  const points = Object.keys(ROLLBACK_CLEARS);
  const UPSTREAM = ['input-review', 'paper-evidence-selection', 'await-roster', 'await-full-context', 'pre-curation', 'evidence-and-photos'];
  const KEPT_FROM_THE_MEETING = ['arc-selection', 'photos', 'character-ids', 'outline', 'article'];
  const THE_DIRECTORS_WEAVE = ['weave', '_weaveBaseline', '_weaveHandEdits'];
  const THE_ROUND = ['meetingApproved', '_meetingRound', '_weaveMarks', '_weaveHandEditReport'];

  test('every point is one of the two lists', () => {
    expect([...UPSTREAM, ...KEPT_FROM_THE_MEETING].sort()).toEqual(points.slice().sort());
  });

  test.each(UPSTREAM)('%s writes the weave again, so it clears the weave, its baseline, the edits and the round', (point) => {
    [...THE_DIRECTORS_WEAVE, ...THE_ROUND].forEach((field) => expect([point, field, ROLLBACK_CLEARS[point].includes(field)]).toEqual([point, field, true]));
  });

  test.each(KEPT_FROM_THE_MEETING)('%s keeps the weave as the director left it, its baseline and the standing edits', (point) => {
    THE_DIRECTORS_WEAVE.forEach((field) => expect([point, field, ROLLBACK_CLEARS[point].includes(field)]).toEqual([point, field, false]));
  });

  test("the meeting's own point reopens it: the approval, the round mark, the marks and the report go; the points after it keep the approval", () => {
    THE_ROUND.forEach((field) => expect(ROLLBACK_CLEARS['arc-selection']).toContain(field));
    ['photos', 'character-ids', 'outline', 'article'].forEach((point) => {
      THE_ROUND.forEach((field) => expect([point, field, ROLLBACK_CLEARS[point].includes(field)]).toEqual([point, field, false]));
    });
  });

  test('none of the six is exempt', () => {
    [...THE_DIRECTORS_WEAVE.filter((f) => f !== 'weave'), ...THE_ROUND].forEach((field) => expect(ROLLBACK_CLEARS_EXEMPT.has(field)).toBe(false));
  });
});
