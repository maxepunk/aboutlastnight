/**
 * API Helpers Unit Tests
 *
 * Tests for shared helpers extracted from server.js:
 * - buildRollbackState: Builds state object for rollback operations
 * - createGraphAndConfig: Creates graph instance and config object
 * - sendErrorResponse: Sends sanitized 500 error responses
 */

const {
  ROLLBACK_CLEARS,
  ROLLBACK_COUNTER_RESETS,
  PHASES
} = require('../workflow/state');

// Mock createReportGraphWithCheckpointer before requiring api-helpers
jest.mock('../workflow/graph', () => ({
  createReportGraphWithCheckpointer: jest.fn(() => ({ mockGraph: true }))
}));

const { createReportGraphWithCheckpointer } = require('../workflow/graph');
const { buildRollbackState, createGraphAndConfig, sendErrorResponse, confineToBase, pruneGateNotes, PHASES_INVALIDATED_BY } = require('../api-helpers');

// ═══════════════════════════════════════════════════════
// buildRollbackState
// ═══════════════════════════════════════════════════════

describe('buildRollbackState', () => {
  test('returns object with all ROLLBACK_CLEARS fields cleared', () => {
    const state = buildRollbackState('arc-selection');
    const expectedFields = ROLLBACK_CLEARS['arc-selection'];
    const appendReducerFields = new Set(['evaluationHistory', 'errors']);

    for (const field of expectedFields) {
      if (appendReducerFields.has(field)) {
        expect(state[field]).toEqual([]);
      } else {
        expect(state).toHaveProperty(field, null);
      }
    }
  });

  test('includes counter resets from ROLLBACK_COUNTER_RESETS', () => {
    const state = buildRollbackState('arc-selection');
    const expectedCounters = ROLLBACK_COUNTER_RESETS['arc-selection'];

    for (const [key, value] of Object.entries(expectedCounters)) {
      expect(state[key]).toBe(value);
    }
  });

  test('sets currentPhase to null', () => {
    const state = buildRollbackState('arc-selection');
    expect(state.currentPhase).toBeNull();
  });

  test('defaults to input-review when no argument provided', () => {
    const state = buildRollbackState();
    const expectedFields = ROLLBACK_CLEARS['input-review'];
    const appendReducerFields = new Set(['evaluationHistory', 'errors']);

    for (const field of expectedFields) {
      if (appendReducerFields.has(field)) {
        expect(state[field]).toEqual([]);
      } else {
        expect(state).toHaveProperty(field, null);
      }
    }

    const expectedCounters = ROLLBACK_COUNTER_RESETS['input-review'];
    for (const [key, value] of Object.entries(expectedCounters)) {
      expect(state[key]).toBe(value);
    }
  });

  test('sets evaluationHistory to [] (not null) for append-reducer compatibility', () => {
    const state = buildRollbackState('evidence-and-photos');
    expect(state.evaluationHistory).toEqual([]);
    expect(state.evaluationHistory).not.toBeNull();
  });

  test('works for each valid rollback point', () => {
    const appendReducerFields = new Set(['evaluationHistory', 'errors']);
    for (const point of Object.keys(ROLLBACK_CLEARS)) {
      const state = buildRollbackState(point);

      // All fields from ROLLBACK_CLEARS should be cleared appropriately
      for (const field of ROLLBACK_CLEARS[point]) {
        if (appendReducerFields.has(field)) {
          expect(state[field]).toEqual([]);
        } else {
          expect(state).toHaveProperty(field, null);
        }
      }

      // Counter resets should be present
      const counters = ROLLBACK_COUNTER_RESETS[point];
      for (const [key, value] of Object.entries(counters)) {
        expect(state[key]).toBe(value);
      }

      // currentPhase always null
      expect(state.currentPhase).toBeNull();
    }
  });

  test('does not include extra unexpected fields', () => {
    const state = buildRollbackState('article');
    const expectedKeys = [
      ...ROLLBACK_CLEARS['article'],
      ...Object.keys(ROLLBACK_COUNTER_RESETS['article']),
      'currentPhase',
      // I1: the one deliberate addition — a ready:false stub that stops
      // evaluateArticle skipping the Opus evaluation and the fact-check on the
      // previous article's verdict. `article` does not clear evaluationHistory,
      // so the stub is appended to it. See rollback-invalidates-evaluation.test.js.
      'evaluationHistory'
    ];

    for (const key of Object.keys(state)) {
      expect(expectedKeys).toContain(key);
    }
  });

  test('throws on invalid rollback point', () => {
    expect(() => buildRollbackState('nonexistent')).toThrow("Invalid rollback point: 'nonexistent'");
  });
});

// ═══════════════════════════════════════════════════════
// buildRollbackState — re-pause correctness (ROLL-1/ROLL-3)
// ═══════════════════════════════════════════════════════

describe('buildRollbackState re-pause correctness', () => {
  test("await-roster nulls roster so checkpointAwaitRoster re-pauses (ROLL-1)", () => {
    const state = buildRollbackState('await-roster');
    // checkpointAwaitRoster skips on state.roster?.length > 0 — must be cleared
    expect(state).toHaveProperty('roster', null);
    expect(state).toHaveProperty('rosterPronouns', null);
  });

  test('input-review nulls its own approval gate, NOT the upstream roster (B2)', () => {
    const state = buildRollbackState('input-review');
    // checkpointInputReview skips on inputReviewApproved === true — must be cleared.
    expect(state).toHaveProperty('inputReviewApproved', null);
    expect(state).toHaveProperty('_inputCorrections', null);
    // ROLL-3 used to clear roster/rosterPronouns here. The roster is captured at
    // await-roster, which the graph reaches BEFORE parseRawInput, so clearing it
    // threw the operator back to an UPSTREAM checkpoint. await-roster owns it.
    expect(state).not.toHaveProperty('roster');
    expect(state).not.toHaveProperty('rosterPronouns');
    // Same for the parse outputs: loadDirectorNotes rehydrates them from disk on the
    // replay, so the gate shows the restored parse and a reject re-parses.
    expect(state).not.toHaveProperty('sessionConfig');
  });

  test('every rollback point at/upstream of input-review clears inputReviewApproved', () => {
    // The gate skips on an approval FLAG, not on a re-derivable parse output, so a
    // rollback to any earlier point must re-open it.
    ['paper-evidence-selection', 'await-roster', 'await-full-context', 'input-review']
      .forEach((point) => {
        expect(buildRollbackState(point)).toHaveProperty('inputReviewApproved', null);
      });
  });

  test('await-roster still clears its existing downstream fields', () => {
    const state = buildRollbackState('await-roster');
    expect(state).toHaveProperty('whiteboardAnalysis', null);
    expect(state).toHaveProperty('evidenceBundle', null);
    expect(state).toHaveProperty('selectedArcs', null);
  });

  test('arc-selection clears arcEvidencePackages so it rebuilds for new arcs (ROLL-2)', () => {
    const state = buildRollbackState('arc-selection');
    // buildArcEvidencePackages skips when state.arcEvidencePackages.length > 0 —
    // re-picking arcs must NOT reuse evidence packaged for the OLD arcs.
    expect(state).toHaveProperty('arcEvidencePackages', null);
  });

  test('every rollback point at/upstream of arc-selection clears arcEvidencePackages', () => {
    const upstreamOfPackages = [
      'input-review', 'paper-evidence-selection', 'await-roster',
      'pre-curation', 'evidence-and-photos', 'arc-selection'
    ];
    for (const point of upstreamOfPackages) {
      const state = buildRollbackState(point);
      expect(state).toHaveProperty('arcEvidencePackages', null);
    }
  });

  test('the photo-branch points clear arcEvidencePackages so the join rebuilds them', () => {
    // photos/character-ids are DOWNSTREAM of arc-selection now, but the packages
    // fold photo analyses into arc data, so new mappings mean new packages.
    for (const point of ['photos', 'character-ids']) {
      expect(buildRollbackState(point)).toHaveProperty('arcEvidencePackages', null);
    }
  });

  test('a photos rollback clears the five photo inputs as a unit (C3)', () => {
    const state = buildRollbackState('photos');
    expect(state).toHaveProperty('photosPath', null);
    expect(state).toHaveProperty('sessionPhotos', null);
    expect(state).toHaveProperty('preprocessStats', null);
    expect(state).toHaveProperty('whiteboardPhotoPath', null);
    expect(state).toHaveProperty('genericPhotoAnalyses', null);
  });

  test('a character-ids rollback preserves photoAnalyses and every upstream input', () => {
    const state = buildRollbackState('character-ids');
    expect(state).toHaveProperty('characterIdMappings', null);
    expect(state).not.toHaveProperty('photoAnalyses');
    expect(state).not.toHaveProperty('sessionPhotos');
    expect(state).not.toHaveProperty('selectedArcs');
    expect(state).not.toHaveProperty('inputReviewApproved');
    expect(state).not.toHaveProperty('accusation');
  });

  test('await-full-context is a valid rollback point that clears the 3 raw inputs (ROLL-4)', () => {
    const state = buildRollbackState('await-full-context'); // must NOT throw
    expect(state).toHaveProperty('accusation', null);
    expect(state).toHaveProperty('sessionReport', null);
    expect(state).toHaveProperty('directorNotesRaw', null);
    expect(state).toHaveProperty('sessionConfig', null);     // parse output cleared -> re-parse triggers
    expect(state).toHaveProperty('preprocessedEvidence', null);
    expect(state).toHaveProperty('evidenceBundle', null);
    expect(state).not.toHaveProperty('roster');            // upstream — preserved
    expect(state).not.toHaveProperty('characterIdMappings'); // upstream — preserved
  });
});

// ═══════════════════════════════════════════════════════
// createGraphAndConfig
// ═══════════════════════════════════════════════════════

describe('createGraphAndConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns { graph, config } object', () => {
    const result = createGraphAndConfig('1221', 'journalist', {
      checkpointer: { mockCheckpointer: true },
      promptBuilder: { mockPromptBuilder: true }
    });

    expect(result).toHaveProperty('graph');
    expect(result).toHaveProperty('config');
  });

  test('config.configurable includes sessionId, theme, thread_id (no promptBuilder)', () => {
    const result = createGraphAndConfig('1221', 'journalist', {
      checkpointer: {}
    });

    expect(result.config.configurable).toEqual({
      sessionId: '1221',
      theme: 'journalist',
      thread_id: '1221'
    });
  });

  test('calls createReportGraphWithCheckpointer with provided checkpointer', () => {
    const checkpointer = { mockCheckpointer: true };
    createGraphAndConfig('1221', 'journalist', {
      checkpointer
    });

    expect(createReportGraphWithCheckpointer).toHaveBeenCalledWith(checkpointer);
  });

  test('defaults theme to journalist when not provided', () => {
    const result = createGraphAndConfig('1221', undefined, {
      checkpointer: {},
      promptBuilder: {}
    });

    expect(result.config.configurable.theme).toBe('journalist');
  });

  test('thread_id matches sessionId', () => {
    const result = createGraphAndConfig('0225', 'detective', {
      checkpointer: {},
      promptBuilder: {}
    });

    expect(result.config.configurable.thread_id).toBe('0225');
    expect(result.config.configurable.sessionId).toBe('0225');
  });
});

// ═══════════════════════════════════════════════════════
// sendErrorResponse
// ═══════════════════════════════════════════════════════

describe('sendErrorResponse', () => {
  let mockRes;
  let consoleSpy;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('calls console.error with full error and context string', () => {
    const error = new Error('Something broke');
    sendErrorResponse(mockRes, '1221', error, 'POST /api/test');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logMessage = consoleSpy.mock.calls[0][0];
    expect(logMessage).toContain('POST /api/test');
    expect(consoleSpy.mock.calls[0][1]).toBe(error);
  });

  test('calls res.status(500).json() with sanitized response', () => {
    const error = new Error('Internal details should not leak');
    sendErrorResponse(mockRes, '1221', error, 'test context');

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledTimes(1);

    const response = mockRes.json.mock.calls[0][0];
    expect(response.error).toBe('Internal server error');
    // Must NOT contain the raw error message
    expect(JSON.stringify(response)).not.toContain('Internal details should not leak');
  });

  test('response includes generic error message', () => {
    sendErrorResponse(mockRes, '1221', new Error('secret'), 'ctx');

    const response = mockRes.json.mock.calls[0][0];
    expect(response.error).toBe('Internal server error');
  });

  test('when sessionId provided, adds sessionId and PHASES.ERROR', () => {
    sendErrorResponse(mockRes, '1221', new Error('test'), 'ctx');

    const response = mockRes.json.mock.calls[0][0];
    expect(response.sessionId).toBe('1221');
    expect(response.currentPhase).toBe(PHASES.ERROR);
    expect(response.details).toContain('ctx');
    expect(response.details).toContain('Check server logs');
  });

  test('when sessionId is null, returns simple error object', () => {
    sendErrorResponse(mockRes, null, new Error('test'), 'ctx');

    const response = mockRes.json.mock.calls[0][0];
    expect(response.error).toBe('Internal server error');
    expect(response).not.toHaveProperty('sessionId');
    expect(response).not.toHaveProperty('currentPhase');
  });
});

// ═══════════════════════════════════════════════════════
// confineToBase
// ═══════════════════════════════════════════════════════

const path = require('path');

describe('confineToBase', () => {
  const base = path.join(__dirname, '..', '..', 'data');

  test('returns the resolved path for a child file', () => {
    const resolved = confineToBase(base, path.join(base, '1221', 'fetched', 'tokens.json'));
    expect(resolved).toBe(path.resolve(base, '1221', 'fetched', 'tokens.json'));
  });

  test('returns the resolved path for a relative child', () => {
    const resolved = confineToBase(base, path.join('1221', 'photos', 'a.jpg'));
    expect(resolved).toBe(path.resolve(base, '1221', 'photos', 'a.jpg'));
  });

  test('allows the base dir itself', () => {
    expect(confineToBase(base, base)).toBe(path.resolve(base));
  });

  test('throws on ../ escape', () => {
    expect(() => confineToBase(base, path.join(base, '..', 'CLAUDE.md')))
      .toThrow(/outside the permitted directory/i);
  });

  test('throws on absolute escape (C:/Windows/win.ini style)', () => {
    const outside = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd';
    expect(() => confineToBase(base, outside))
      .toThrow(/outside the permitted directory/i);
  });

  test('throws on a sibling-prefix bypass (data-evil)', () => {
    // path.resolve(base) === .../data ; a sibling '.../data-evil' must NOT pass a naive startsWith
    const sibling = path.resolve(base) + '-evil';
    expect(() => confineToBase(base, sibling))
      .toThrow(/outside the permitted directory/i);
  });

  test('throws on empty/missing requestedPath', () => {
    expect(() => confineToBase(base, '')).toThrow(/missing path/i);
    expect(() => confineToBase(base, null)).toThrow(/missing path/i);
  });
});

describe('pruneGateNotes (spec 2026-09-19 §5.4)', () => {
  const notes = [
    { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'a', at: 't1' },
    { gate: 'outline', kind: 'rejection', round: 1, text: 'o', at: 't2' },
    { gate: 'outline', kind: 'rejection', round: 2, text: 'o2', at: 't3' },
    { gate: 'article', kind: 'rejection', round: 1, text: 'r', at: 't4' }
  ];

  test('PHASES_INVALIDATED_BY is exported with exactly the four regenerating points', () => {
    expect(Object.keys(PHASES_INVALIDATED_BY).sort()).toEqual(['article', 'character-ids', 'outline', 'photos']);
    expect(PHASES_INVALIDATED_BY.outline).toEqual(['outline', 'article']);
    expect(PHASES_INVALIDATED_BY.article).toEqual(['article']);
  });

  test('article keeps the arc and outline notes', () => {
    expect(pruneGateNotes(notes, 'article').map((n) => n.text)).toEqual(['a', 'o', 'o2']);
  });

  test.each(['outline', 'photos', 'character-ids'])('%s keeps only the arc-selection notes', (point) => {
    expect(pruneGateNotes(notes, point).map((n) => n.text)).toEqual(['a']);
  });

  test('a point outside the table returns every note unchanged (the caller clears via ROLLBACK_CLEARS)', () => {
    expect(pruneGateNotes(notes, 'input-review')).toEqual(notes);
    expect(pruneGateNotes(notes, 'evidence-and-photos')).toEqual(notes);
  });

  test('returns a new array and tolerates null/garbage', () => {
    expect(pruneGateNotes(notes, 'article')).not.toBe(notes);
    expect(pruneGateNotes(null, 'outline')).toEqual([]);
    expect(pruneGateNotes([null, 'x', { gate: 'arc-selection', text: 'k' }], 'outline')).toEqual([{ gate: 'arc-selection', text: 'k' }]);
  });
});

describe('pruneGateNotes keeps approval notes (phase 1, final review I1)', () => {
  const notes = [
    { gate: 'outline', kind: 'approval', round: 1, text: 'develop the story through every section', at: 't1' },
    { gate: 'article', kind: 'rejection', round: 1, text: 'the deck must name the tension', at: 't2' },
    { gate: 'article', kind: 'approval', round: 1, text: 'keep the closing as it is', at: 't3' }
  ];

  it('a rollback to the article stop drops its rejection note and keeps its approval note', () => {
    expect(pruneGateNotes(notes, 'article').map((n) => n.text)).toEqual([
      'develop the story through every section', 'keep the closing as it is'
    ]);
  });

  it('a rollback to the outline stop keeps the approval notes of both stops', () => {
    expect(pruneGateNotes(notes, 'outline').map((n) => n.text)).toEqual([
      'develop the story through every section', 'keep the closing as it is'
    ]);
  });
});

// ═══════════════════════════════════════════════════════
// 4.5: going back to the story meeting (R9)
// ═══════════════════════════════════════════════════════
//
// A rollback to the meeting keeps the weave as the director last left it, with its
// fact-check mark, its answers, the standing edits and their baseline, and the meeting's
// notes. It clears the approval, the map, the article and the history, and prunes the
// map's and the article's rejection notes as the later points do. The note pruning has a
// table of its own, apart from the evaluation stubs: the meeting's point prunes the notes
// and writes no stub, so the cleared history reruns every later evaluation.
describe("4.5: going back to the story meeting (R9)", () => {
  const { STOPS_INVALIDATED_BY } = require('../api-helpers');
  const notes = [
    { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'meeting send-back', at: 't1' },
    { gate: 'arc-selection', kind: 'approval', round: 1, text: 'meeting approval', at: 't2' },
    { gate: 'outline', kind: 'rejection', round: 1, text: 'map send-back', at: 't3' },
    { gate: 'outline', kind: 'approval', round: 1, text: 'map approval', at: 't4' },
    { gate: 'article', kind: 'rejection', round: 1, text: 'desk send-back', at: 't5' }
  ];

  test('the note pruning has a table of its own: the stops each rollback invalidates', () => {
    expect(STOPS_INVALIDATED_BY).toEqual({
      'arc-selection': ['outline', 'article'],
      photos: ['outline', 'article'],
      'character-ids': ['outline', 'article'],
      outline: ['outline', 'article'],
      article: ['article']
    });
    // The evaluation stubs keep their own table, which the meeting's point is not in.
    expect(PHASES_INVALIDATED_BY).not.toHaveProperty('arc-selection');
  });

  test("the meeting's point keeps the meeting's notes and the approval notes, and prunes the map's and the article's rejection notes", () => {
    expect(pruneGateNotes(notes, 'arc-selection').map((n) => n.text)).toEqual(['meeting send-back', 'meeting approval', 'map approval']);
  });

  test('the rollback handler writes the pruned notes at the points that prune them, and nothing at the points that clear them', () => {
    const { rollbackNotesUpdate } = require('../api-helpers');
    expect(rollbackNotesUpdate('arc-selection', notes)).toEqual({ directorGateNotes: pruneGateNotes(notes, 'arc-selection') });
    expect(rollbackNotesUpdate('article', notes).directorGateNotes.map((n) => n.text)).toEqual(['meeting send-back', 'meeting approval', 'map send-back', 'map approval']);
    ['evidence-and-photos', 'pre-curation', 'input-review'].forEach((point) => expect([point, rollbackNotesUpdate(point, notes)]).toEqual([point, {}]));
  });

  test('writes no evaluation stub: the history is cleared, so the map and the article are judged again', () => {
    const state = buildRollbackState('arc-selection');
    expect(state.evaluationHistory).toEqual([]);
    expect(state).not.toHaveProperty('directorGateNotes');
  });

  test("clears the approval and the round's marks, keeps the weave, its baseline and the standing edits, and keeps the meeting's counters", () => {
    const state = buildRollbackState('arc-selection');
    ['meetingApproved', '_meetingRound', '_weaveMarks', '_weaveHandEditReport', 'outline', 'contentBundle'].forEach((field) => {
      expect([field, state[field]]).toEqual([field, null]);
    });
    ['weave', '_weaveBaseline', '_weaveHandEdits', 'photosPath', 'characterIdMappings', 'leftOutPhotos', 'photoDescriptions'].forEach((field) => {
      expect([field, Object.prototype.hasOwnProperty.call(state, field)]).toEqual([field, false]);
    });
    expect(state).not.toHaveProperty('arcRevisionCount');
    expect(state).not.toHaveProperty('humanArcRevisionCount');
    expect(state.outlineRevisionCount).toBe(0);
    expect(state.articleRevisionCount).toBe(0);
  });
});
