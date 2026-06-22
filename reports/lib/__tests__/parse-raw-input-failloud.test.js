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

// Minimal raw input that forces BOTH step1 (config) and step2 (session report) parses.
// NOTE: parseRawInput reads `rawSessionInput.sessionReport` (not `sessionReportText`);
// step2 short-circuits to an empty shape WITHOUT calling the SDK if that field is absent,
// so it must be populated to exercise the session-report parse path under test.
function makeState() {
  return {
    rawSessionInput: {
      roster: 'Alex',
      accusation: 'Alex accused of murder',
      sessionReport: 'Final Standings: Team A 100, Team B 50\nScoring Timeline: tok001 -> Team A'
    }
  };
}

describe('parseRawInput fail-loud (N1)', () => {
  test('session-report parse failure REJECTS (no empty orchestrator fallthrough)', async () => {
    const { sdkQuery } = require('../llm');
    // step1 config parse succeeds; step2 session-report parse fails.
    sdkQuery
      .mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' }) // step1
      .mockRejectedValueOnce(new Error('overloaded_error: server is overloaded'));               // step2

    const cfg = { configurable: { sdkClient: sdkQuery, dataDir: require('os').tmpdir() } };
    await expect(parseRawInput(makeState(), cfg)).rejects.toThrow(/session report/i);
  });
});

describe('parseRawInput fail-loud (N4)', () => {
  test('whiteboard analysis failure REJECTS (no silent empty player-focus)', async () => {
    const { sdkQuery } = require('../llm');
    // SDK consumption order for this fixture (no directorNotes => enrichDirectorNotes
    // is skipped): (1) step1 config parse, (2) step2 session-report parse,
    // (3) step4 whiteboard analysis (gated on whiteboardPhotoPath). The whiteboard
    // call is the third, so it is the one that rejects.
    sdkQuery
      .mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' }) // step1 config
      .mockResolvedValueOnce({ exposedTokens: [], buriedTokens: [], shellAccounts: [],          // step2 report
        exposedCount: 0, buriedCount: 0, totalBuried: 0 })
      .mockRejectedValueOnce(new Error('api_error: internal'));                                  // step4 whiteboard

    const state = makeState();
    state.rawSessionInput.whiteboardPhotoPath = '/tmp/whiteboard.jpg';
    const cfg = { configurable: { sdkClient: sdkQuery, dataDir: require('os').tmpdir() } };
    await expect(parseRawInput(state, cfg)).rejects.toThrow(/whiteboard/i);
  });
});
