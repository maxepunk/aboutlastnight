jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn(),
  isClaudeAvailable: jest.fn()
}));
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

// parseRawInput is exported at module level (wrapped in traceNode, which the
// mock above flattens to the raw fn). It is NOT in _testing, so destructure the
// top-level export directly.
const { parseRawInput } = require('../workflow/nodes/input-nodes');
const { sdkQuery } = require('../llm');
const { PHASES } = require('../workflow/state');

const cfg = { configurable: { sdkClient: sdkQuery, dataDir: require('os').tmpdir() } };

// ROLL-4: accusation/sessionReport/directorNotes are now FIRST-CLASS state channels
// (accusation / sessionReport / directorNotesRaw), not rawSessionInput sub-fields.
// parseRawInput SKIPS when sessionConfig is populated, so makeState leaves it empty {}.
// rawSessionInput carries only at-start config (photosPath).
function makeState(overrides = {}) {
  return {
    accusation: 'Players accused Marcus.',
    sessionReport: '# Session Report\n...',
    directorNotesRaw: 'Director notes prose...',
    sessionConfig: {},                                  // empty -> parseRawInput does NOT skip
    rawSessionInput: { photosPath: 'data/x/photos' },   // at-start config only
    ...overrides
  };
}

beforeEach(() => {
  sdkQuery.mockReset();
});

describe('parseRawInput fail-loud (N1)', () => {
  test('session-report parse failure REJECTS (no empty orchestrator fallthrough)', async () => {
    // step1 config parse succeeds; step2 session-report parse fails.
    sdkQuery
      .mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' }) // step1
      .mockRejectedValueOnce(new Error('overloaded_error: server is overloaded'));               // step2

    await expect(parseRawInput(makeState(), cfg)).rejects.toThrow(/session report/i);
  });
});

describe('parseRawInput fail-loud (N4)', () => {
  test('whiteboard analysis failure REJECTS (no silent empty player-focus)', async () => {
    // ROLL-4: directorNotesRaw is now non-empty (gate invariant), so enrichDirectorNotes
    // fires an Opus SDK call BEFORE the whiteboard step. SDK consumption order for this
    // fixture: (1) step1 config parse, (2) step2 session-report parse, (3) step3 director
    // enrichment, (4) step4 whiteboard analysis (gated on whiteboardPhotoPath). The
    // whiteboard call is the FOURTH, so it is the one that rejects.
    const directorProse = 'Director notes prose...';
    sdkQuery
      .mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' }) // step1 config
      .mockResolvedValueOnce({ exposedTokens: [], buriedTokens: [], shellAccounts: [],          // step2 report
        exposedCount: 0, buriedCount: 0, totalBuried: 0 })
      .mockResolvedValueOnce({ rawProse: directorProse, characterMentions: {}, quotes: [],       // step3 enrich
        transactionReferences: [], postInvestigationDevelopments: [] })
      .mockRejectedValueOnce(new Error('api_error: internal'));                                  // step4 whiteboard

    const state = makeState({ directorNotesRaw: directorProse });
    state.rawSessionInput.whiteboardPhotoPath = '/tmp/whiteboard.jpg';
    await expect(parseRawInput(state, cfg)).rejects.toThrow(/whiteboard/i);
  });
});

describe('parseRawInput skip-gate (ROLL-4)', () => {
  test('parseRawInput SKIPS when sessionConfig is already populated (resume)', async () => {
    const result = await parseRawInput(makeState({ sessionConfig: { roster: ['A'] } }), cfg);
    expect(result.currentPhase).toBe(PHASES.LOAD_DIRECTOR_NOTES); // skipped — no parse
    expect(sdkQuery).not.toHaveBeenCalled();
  });

  test('parseRawInput RE-PARSES when sessionConfig is empty even with rawSessionInput present (rollback replay)', async () => {
    const directorProse = 'Director notes prose...';
    // mocks: step1 config / step2 report / step3 enrich (no whiteboard => no step4)
    sdkQuery
      .mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' })
      .mockResolvedValueOnce({ exposedTokens: [], buriedTokens: [], shellAccounts: [],
        exposedCount: 0, buriedCount: 0, totalBuried: 0 })
      .mockResolvedValueOnce({ rawProse: directorProse, characterMentions: {}, quotes: [],
        transactionReferences: [], postInvestigationDevelopments: [] });

    await parseRawInput(makeState({ sessionConfig: {}, directorNotesRaw: directorProse }), cfg);
    expect(sdkQuery).toHaveBeenCalled();                          // proves it did NOT skip
  });
});

describe('parseRawInput gate invariant (ROLL-4 fail-loud)', () => {
  test('parseRawInput THROWS when sessionReport is missing (ROLL-4 gate invariant)', async () => {
    // step1 succeeds; the missing-sessionReport guard in step2 throws.
    sdkQuery.mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' });
    await expect(parseRawInput(makeState({ sessionReport: undefined }), cfg)).rejects.toThrow(/sessionReport is required/);
  });

  test('parseRawInput THROWS when directorNotesRaw is missing (ROLL-4 gate invariant)', async () => {
    // step1 + step2 succeed; the missing-directorNotesRaw guard throws before step3.
    sdkQuery
      .mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' })
      .mockResolvedValueOnce({ exposedTokens: [], buriedTokens: [], shellAccounts: [],
        exposedCount: 0, buriedCount: 0, totalBuried: 0 });
    await expect(parseRawInput(makeState({ directorNotesRaw: undefined }), cfg)).rejects.toThrow(/directorNotesRaw is required/);
  });
});
