jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn(),
  isClaudeAvailable: jest.fn()
}));
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseRawInput, _testing } = require('../workflow/nodes/input-nodes');

describe('parseRawInput wiring', () => {
  it('does NOT export legacy DIRECTOR_NOTES_SCHEMA', () => {
    expect(_testing.DIRECTOR_NOTES_SCHEMA).toBeUndefined();
  });

  it('still exposes SESSION_CONFIG_SCHEMA and SESSION_REPORT_SCHEMA for step 1/2', () => {
    expect(_testing.SESSION_CONFIG_SCHEMA).toBeDefined();
    expect(_testing.SESSION_REPORT_SCHEMA).toBeDefined();
  });
});

describe('mergeDirectorOverrides — passthrough behavior', () => {
  const { mergeDirectorOverrides } = _testing;

  it('returns sessionConfig unchanged when directorNotes is present', () => {
    const sessionConfig = {
      roster: ['Alex'],
      journalistFirstName: 'Cassandra',
      reportingMode: 'remote',
      guestReporters: [{ name: 'Dana Okafor', role: 'Guest Reporter' }]
    };
    const directorNotes = { rawProse: 'anything' };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged).toEqual(sessionConfig);
  });

  it('preserves reportingMode from sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], reportingMode: 'remote' };
    const merged = mergeDirectorOverrides(sessionConfig, { rawProse: '' });
    expect(merged.reportingMode).toBe('remote');
  });

  // Phase 17 (R5): the parse stamps the list, guestReporters
  it('preserves guestReporters from sessionConfig', () => {
    const guests = [{ name: 'Dana Okafor', role: 'Guest Reporter' }, { name: 'Remi Vale', role: 'Contributing Reporter' }];
    const sessionConfig = { roster: ['Alex'], guestReporters: guests };
    const merged = mergeDirectorOverrides(sessionConfig, { rawProse: '' });
    expect(merged.guestReporters).toEqual(guests);
  });

  it('handles null directorNotes without adding default fields', () => {
    const sessionConfig = { roster: ['Alex'] };
    const merged = mergeDirectorOverrides(sessionConfig, null);
    expect(merged).toEqual(sessionConfig);
  });
});

// Phase 17 (R5): the parse stamps each guest reporter apart, as [{name, role}], read from the
// start form's value through guestReportersOf, and no longer stamps the single guestReporter.
// The file on disk carries the list.
describe('parseRawInput stamps the guest reporters as a list', () => {
  const { SESSION_CONFIG_SCHEMA, SESSION_REPORT_SCHEMA, WHITEBOARD_SCHEMA } = _testing;
  let dataDir;
  beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-guests-')); });
  afterEach(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

  const sdk = jest.fn(async (options) => {
    if (options.jsonSchema === SESSION_CONFIG_SCHEMA) {
      return { roster: ['Alex', 'Remi'], accusation: { verdictKind: 'culprit', accused: ['Alex'], charge: 'Sold it' } };
    }
    if (options.jsonSchema === SESSION_REPORT_SCHEMA) return { exposedTokens: [], exposures: [], buriedTokens: [], shellAccounts: [] };
    if (options.jsonSchema === WHITEBOARD_SCHEMA) return { names: [] };
    return { characterMentions: {}, quotes: [], transactionReferences: [], postInvestigationDevelopments: [] };
  });

  async function stampOf(rawSessionInput) {
    const state = {
      sessionId: '010126', accusation: 'Alex sold it.', sessionReport: '# Session Report',
      directorNotesRaw: 'Remi asked Alex about the sale.', sessionConfig: {}, rawSessionInput
    };
    const result = await parseRawInput(state, { configurable: { sdkClient: sdk, dataDir, sessionId: '010126' } });
    const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, '010126', 'inputs', 'session-config.json'), 'utf8'));
    return { config: result.sessionConfig, onDisk };
  }

  it("reads the start form's two names and two roles apart, in state and on disk", async () => {
    const { config, onDisk } = await stampOf({ guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Guest Reporter, Contributing Reporter' } });
    const expected = [{ name: 'Dana Okafor', role: 'Guest Reporter' }, { name: 'Remi Vale', role: 'Contributing Reporter' }];
    expect(config.guestReporters).toEqual(expected);
    expect(onDisk.guestReporters).toEqual(expected);
    expect(config).not.toHaveProperty('guestReporter');
    expect(onDisk).not.toHaveProperty('guestReporter');
  });

  it('stamps one reporter as a list of one, and an empty list with none', async () => {
    expect((await stampOf({ guestReporter: { name: 'Dana Okafor', role: 'Guest Reporter' } })).config.guestReporters)
      .toEqual([{ name: 'Dana Okafor', role: 'Guest Reporter' }]);
    const none = await stampOf({});
    expect(none.config.guestReporters).toEqual([]);
    expect(none.config).not.toHaveProperty('guestReporter');
  });
});

describe('Step-1 parse prompt does not invite a derived sessionId (Task 1 Minor)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'workflow', 'nodes', 'input-nodes.js'), 'utf8'
  );

  it('asks the model for no session id at all (phase 3, brief 3.5: code stamps it)', () => {
    // The step-1 prompt used to tell the model to copy the id verbatim, and offered a
    // "Derive sessionId from" branch when no caller gave one (coverage-upstream #10).
    expect(src).not.toContain('Use the provided sessionId verbatim');
    expect(src).not.toContain('Derive sessionId from:');
    expect(src).toContain('result.sessionId = configSessionId || state.sessionId || null;');
  });

  it('no longer offers the MMDD derivation that produced data/0711 for session 071126', () => {
    // B1: Haiku answered "0711" for session 071126, the inputs were written to
    // data/0711/ and the report published as report-0711.html with 0 photos.
    // parseRawInput overrides the value now, but the instruction stayed.
    expect(src).not.toContain('derive in MMDD format');
  });
});
