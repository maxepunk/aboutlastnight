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

// B1: parseRawInput now REFUSES to write inputs without an authoritative sessionId
// (initializeSession guarantees one from thread_id before this node runs), so the
// shared config carries one. The B1 describe below covers the missing-id case.
const cfg = { configurable: { sdkClient: sdkQuery, dataDir: require('os').tmpdir(), sessionId: 'TEST' } };

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

describe('parseRawInput sessionId authority (B1)', () => {
  // B1: the node returned Haiku's parsed sessionId into the `sessionId` channel
  // (a replace reducer) and used it for the inputs directory. Session 071126's
  // Step-1 call answered "0711", so the inputs landed in data/0711/ while
  // data/071126/ got none, and the report was published as report-0711.html
  // with photosCopied=0. initializeSession already set the channel from
  // thread_id before this node ran.
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  let dataDir;

  function mockStepsWithParsedSessionId(parsedSessionId) {
    const directorProse = 'Director notes prose...';
    sdkQuery
      .mockResolvedValueOnce({ sessionId: parsedSessionId, roster: ['Alex'], reportingMode: 'on-site' })
      .mockResolvedValueOnce({ exposedTokens: [], buriedTokens: [], shellAccounts: [],
        exposedCount: 0, buriedCount: 0, totalBuried: 0 })
      .mockResolvedValueOnce({ characterMentions: {}, quotes: [],
        transactionReferences: [], postInvestigationDevelopments: [] });
    return directorProse;
  }

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-parse-sessionid-'));
  });

  test('ignores the model-parsed sessionId and writes under the thread sessionId', async () => {
    const directorProse = mockStepsWithParsedSessionId('0711');
    const state = makeState({ sessionId: '071126', directorNotesRaw: directorProse });
    const config = { configurable: { sdkClient: sdkQuery, dataDir, sessionId: '071126' } };

    const result = await parseRawInput(state, config);

    // The channel is owned by initializeSession; this node must not write it.
    expect(result).not.toHaveProperty('sessionId');
    expect(result.sessionConfig.sessionId).toBe('071126');
    expect(fs.existsSync(path.join(dataDir, '071126', 'inputs', 'session-config.json'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, '0711'))).toBe(false);
  });

  test('keeps the parsed sessionId when it already agrees with the thread', async () => {
    const directorProse = mockStepsWithParsedSessionId('071126');
    const state = makeState({ sessionId: '071126', directorNotesRaw: directorProse });
    const config = { configurable: { sdkClient: sdkQuery, dataDir, sessionId: '071126' } };

    const result = await parseRawInput(state, config);

    expect(result.sessionConfig.sessionId).toBe('071126');
  });

  test('falls back to config.configurable.sessionId when state has none', async () => {
    const directorProse = mockStepsWithParsedSessionId('0711');
    const state = makeState({ directorNotesRaw: directorProse });
    const config = { configurable: { sdkClient: sdkQuery, dataDir, sessionId: '071126' } };

    const result = await parseRawInput(state, config);

    expect(result.sessionConfig.sessionId).toBe('071126');
    expect(fs.existsSync(path.join(dataDir, '071126', 'inputs'))).toBe(true);
  });

  test('THROWS rather than writing inputs under a model-invented directory', async () => {
    const directorProse = mockStepsWithParsedSessionId('0711');
    const state = makeState({ directorNotesRaw: directorProse });
    const config = { configurable: { sdkClient: sdkQuery, dataDir } }; // no sessionId anywhere

    await expect(parseRawInput(state, config)).rejects.toThrow(/No sessionId/i);
    expect(fs.existsSync(path.join(dataDir, '0711'))).toBe(false);
  });
});

describe('SESSION_CONFIG_SCHEMA sessionId description (B1)', () => {
  const { _testing } = require('../workflow/nodes/input-nodes');

  test('tells the model to copy the provided sessionId rather than derive MMDD', () => {
    const desc = _testing.SESSION_CONFIG_SCHEMA.properties.sessionId.description;
    expect(desc).toMatch(/verbatim/i);
    expect(desc).not.toMatch(/MMDD/);
  });
});

describe('parseRawInput surfaces the enrichment fallback (B3)', () => {
  // B3: an empty enrichment used to be indistinguishable from prose with nothing
  // in it. The marker has to survive into BOTH the directorNotes channel (which
  // the input-review checkpoint renders) and inputs/director-notes.json (which
  // loadDirectorNotes rehydrates on resume).
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  test('persists _enrichmentFallback on the channel and in director-notes.json', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-enrich-fallback-'));
    const directorProse = 'Director notes prose...';
    sdkQuery
      .mockResolvedValueOnce({ sessionId: '091826', roster: ['Alex'], reportingMode: 'on-site' })
      .mockResolvedValueOnce({ exposedTokens: [], buriedTokens: [], shellAccounts: [],
        exposedCount: 0, buriedCount: 0, totalBuried: 0 })
      .mockRejectedValueOnce(new Error('opus overloaded_error'));   // step3 enrichment fails

    const result = await parseRawInput(
      makeState({ sessionId: '091826', directorNotesRaw: directorProse }),
      { configurable: { sdkClient: sdkQuery, dataDir, sessionId: '091826' } }
    );

    expect(result.directorNotes._enrichmentFallback).toEqual({ reason: 'opus overloaded_error' });

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(dataDir, '091826', 'inputs', 'director-notes.json'), 'utf-8')
    );
    expect(onDisk._enrichmentFallback).toEqual({ reason: 'opus overloaded_error' });
  });
});
