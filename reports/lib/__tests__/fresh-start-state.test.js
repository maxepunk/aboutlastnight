/**
 * FRESH_START_CLEARS / buildFreshStartState (C1)
 *
 * `/start` used to seed its initial state with `buildRollbackState('input-review')`.
 * That list is correct for a ROLLBACK to input-review — it deliberately preserves
 * everything upstream of the parse, and Task 3.1 additionally moved `sessionPhotos`
 * into ROLLBACK_CLEARS_EXEMPT because no rollback point can meaningfully re-pause
 * the photo scan. Both are wrong for a fresh start: a second `/start` on a session
 * id whose thread already exists kept the roster, the photo list, the photo
 * analyses, the preprocess stats, the raw full-context inputs AND the parse, so
 * every checkpoint before input-review skipped and the run paused once, on the OLD
 * parse, with the OLD photos. The new `rawSessionInput.photosPath` was never read.
 *
 * A fresh start is therefore its OWN list, derived so it cannot drift: everything
 * except the three channels a fresh start is defined by (`theme`, `sessionId`,
 * `rawSessionInput`).
 */

const { ReportStateAnnotation, FRESH_START_CLEARS } = require('../workflow/state');

// api-helpers requires lib/workflow/graph at module load; nothing here compiles a graph.
jest.mock('../workflow/graph', () => ({
  createReportGraphWithCheckpointer: jest.fn(() => ({ mockGraph: true }))
}));

const { buildFreshStartState } = require('../api-helpers');

const ALL_CHANNELS = Object.keys(ReportStateAnnotation.spec);
const KEPT = ['theme', 'sessionId', 'rawSessionInput'];
const APPEND_CHANNELS = ['evaluationHistory', 'errors'];

// The channels the C1 finding named one by one, because every one of them is
// ROLLBACK_CLEARS_EXEMPT (so the old `/start` preserved it) and every one of them
// is stale input on a fresh start.
const MUST_CLEAR = [
  'sessionPhotos', 'preprocessStats', 'photoAnalyses', 'whiteboardPhotoPath',
  'genericPhotoAnalyses', 'accusation', 'sessionReport', 'directorNotesRaw',
  'roster', 'rosterPronouns', 'selectedPaperEvidence', 'characterIdMappings',
  'sessionConfig', 'directorNotes', 'playerFocus', 'memoryTokens', 'paperEvidence',
  'inputReviewApproved', 'currentPhase'
];

describe('FRESH_START_CLEARS', () => {
  test('covers every declared channel except theme, sessionId and rawSessionInput', () => {
    const expected = ALL_CHANNELS.filter(f => !KEPT.includes(f));
    expect([...FRESH_START_CLEARS].sort()).toEqual(expected.sort());
  });

  test('keeps the three channels a fresh start is defined by', () => {
    for (const field of KEPT) {
      expect(FRESH_START_CLEARS).not.toContain(field);
    }
  });

  test('names every channel the C1 finding listed', () => {
    for (const field of MUST_CLEAR) {
      expect(FRESH_START_CLEARS).toContain(field);
    }
  });

  test('has no ghost entries (every name is a real channel)', () => {
    const ghosts = [...FRESH_START_CLEARS].filter(f => !ALL_CHANNELS.includes(f));
    expect(ghosts).toEqual([]);
  });
});

describe('buildFreshStartState', () => {
  test('nulls every non-kept channel and clears the append channels with []', () => {
    const state = buildFreshStartState();

    for (const field of FRESH_START_CLEARS) {
      if (APPEND_CHANNELS.includes(field)) {
        // appendReducer/appendSingleReducer treat [] as the clear sentinel; null
        // would be ignored and the array would survive.
        expect(state[field]).toEqual([]);
      } else {
        expect(state).toHaveProperty(field, null);
      }
    }
  });

  test('nulls the photo channels, so the new photosPath is actually scanned', () => {
    const state = buildFreshStartState();
    expect(state.photosPath).toBeNull();
    expect(state.sessionPhotos).toBeNull();
    expect(state.preprocessStats).toBeNull();
    expect(state.photoAnalyses).toBeNull();
    expect(state.whiteboardPhotoPath).toBeNull();
    expect(state.genericPhotoAnalyses).toBeNull();
  });

  test('nulls the raw full-context inputs and the parse outputs', () => {
    const state = buildFreshStartState();
    expect(state.accusation).toBeNull();
    expect(state.sessionReport).toBeNull();
    expect(state.directorNotesRaw).toBeNull();
    expect(state.sessionConfig).toBeNull();
    expect(state.directorNotes).toBeNull();
    expect(state.playerFocus).toBeNull();
    expect(state.roster).toBeNull();
  });

  test('sets evaluationHistory to [] (not null)', () => {
    expect(buildFreshStartState().evaluationHistory).toEqual([]);
  });

  test('does not write theme, sessionId or rawSessionInput (the caller owns them)', () => {
    const state = buildFreshStartState();
    for (const field of KEPT) {
      expect(state).not.toHaveProperty(field);
    }
  });
});
