/**
 * The input parse after phase 3 (brief 3.5).
 *
 * - The session-report parse keeps the Adjustment rows, and code classifies them into
 *   sessionConfig.adjustments, computes each account's total and sale count into
 *   state.shellAccounts, and checks the totals against the Final Standings. The
 *   model's own sale counts go.
 * - One session clock is decided from the first exposure or sale and stamped on the
 *   session config.
 * - Code stamps the roster from the roster stop, as it stamps the pronouns and the
 *   reporting mode; the parse never rewrites it.
 * - The step-1 prompt calls the director's text the group statement, not a murder
 *   accusation, and asks for a split vote; the step-2 prompt describes an exposure as
 *   a memory turned in to Nova.
 * - The whiteboard parse gets every character and the NPCs.
 * - The correction block promises nothing about the fields code sets.
 *
 * Synthetic rows in 092026's shape; no test reads data/.
 */
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
const { SESSION_CONFIG_SCHEMA, SESSION_REPORT_SCHEMA, WHITEBOARD_SCHEMA } = _testing;
const { buildParseCorrectionsBlock } = require('../prompt-renderers/director-words-renderer');

const REPORT_ANSWER = {
  exposedTokens: ['ale003'],
  exposures: [{ tokenId: 'ale003', exposer: 'NovaNews (Anonymous)', time: '05:20 PM', owner: 'Alex Reeves' }],
  buriedTokens: [
    { tokenId: 'aaa001', shellAccount: 'Ember', amount: 500000, time: '05:10 PM' },
    { tokenId: 'aaa002', shellAccount: 'Ember', amount: 375000, time: '06:40 PM' }
  ],
  adjustmentRows: [
    { time: '04:50 PM', detail: 'Holding Account (GM_Station_1)', team: 'First Burial Bonus', amount: 50000 },
    { time: '05:10 PM', detail: 'First burial bonus (GM_Station_1)', team: 'Ember', amount: 50000 },
    { time: '05:11PM', detail: 'ToEmber(GMStation1)', team: 'FirstBurialBonus', amount: -50000 }
  ],
  finalStandings: [{ name: 'Ember', total: 925000 }, { name: 'First Burial Bonus', total: 0 }],
  // The model's own counts, which code no longer reads.
  shellAccounts: [{ name: 'Ember', total: 925000, tokenCount: 0, rank: 1 }]
};

function makeSdk(reportAnswer = REPORT_ANSWER) {
  const calls = [];
  const sdk = jest.fn(async (options) => {
    calls.push(options);
    if (options.jsonSchema === SESSION_CONFIG_SCHEMA) {
      // The model rewrites the roster; code must not take it.
      return { roster: ['Vicky'], accusation: { verdictKind: 'culprit', accused: ['Vic'], charge: 'Murder' } };
    }
    if (options.jsonSchema === SESSION_REPORT_SCHEMA) return JSON.parse(JSON.stringify(reportAnswer));
    if (options.jsonSchema === WHITEBOARD_SCHEMA) return { names: [], regions: [] };
    return { characterMentions: {}, quotes: [], transactionReferences: [], postInvestigationDevelopments: [] };
  });
  return { sdk, calls };
}

function makeState(overrides = {}) {
  return {
    sessionId: '092026',
    roster: ['vic', 'Alex Reeves', 'Randy'],
    canonicalCharacters: { Vic: 'Vic Kingsley', Alex: 'Alex Reeves', Morgan: 'Morgan Reed' },
    accusation: 'The room accused Vic, 7 to 4 over Remi.',
    sessionReport: '# Session Report',
    directorNotesRaw: 'Vic paced.',
    sessionConfig: {},
    rawSessionInput: {},
    ...overrides
  };
}

describe('parseRawInput: the ledger', () => {
  let dataDir;
  beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-ledger-')); });
  afterEach(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });
  const run = (sdk, state = makeState()) => parseRawInput(state, { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });

  it('classifies the adjustments, computes the totals in code and reconciles them', async () => {
    const { sdk } = makeSdk();
    const result = await run(sdk);
    expect(result.sessionConfig.adjustments).toEqual([{ time: '05:10 PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' }]);
    expect(result.sessionConfig.ledgerCheck).toEqual({ adjustmentsParsed: true, mismatches: [], unclassified: [] });
    expect(result.shellAccounts).toEqual([{ name: 'Ember', total: 925000, tokenCount: 2, rank: 1 }]);

    // On disk: what fetch-nodes refills state.shellAccounts from is code's, not the model's.
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, '092026', 'inputs', 'orchestrator-parsed.json'), 'utf8'));
    expect(parsed.shellAccounts).toEqual(result.shellAccounts);
    const config = JSON.parse(fs.readFileSync(path.join(dataDir, '092026', 'inputs', 'session-config.json'), 'utf8'));
    expect(config.adjustments).toEqual(result.sessionConfig.adjustments);
  });

  it('stamps one session clock from the first exposure or sale, never the 4:50 PM setup row', async () => {
    const { sdk } = makeSdk();
    const result = await run(sdk);
    expect(result.sessionConfig.sessionClock).toEqual({ decided: true, evening: true, firstTime: '05:10 PM' });
  });

  it('stamps how many memories the evidence log turned in, from the list disposition reads (fix batch, finding 4)', async () => {
    const { sdk } = makeSdk();
    expect((await run(sdk)).sessionConfig.exposedTokenCount).toBe(1);
    // The per-row log and the id list are separate fields of the parse: the count is
    // the id list's, because tagTokensWithDisposition reads exposedTokens alone.
    const rowsOnly = makeSdk({ ...REPORT_ANSWER, exposedTokens: [] });
    expect((await run(rowsOnly.sdk)).sessionConfig.exposedTokenCount).toBe(0);
  });

  it('with no adjustment rows, keeps the Final Standings totals and says so', async () => {
    const { sdk } = makeSdk({ ...REPORT_ANSWER, adjustmentRows: [] });
    const result = await run(sdk);
    expect(result.sessionConfig.adjustments).toEqual([]);
    expect(result.sessionConfig.ledgerCheck.adjustmentsParsed).toBe(false);
    expect(result.shellAccounts).toEqual([{ name: 'Ember', total: 925000, tokenCount: 2, rank: 1 }]);
  });

  it('asks the model for the rows and the standings as written, and never for a count', async () => {
    const { sdk, calls } = makeSdk();
    await run(sdk);
    const step2 = calls.find((c) => c.jsonSchema === SESSION_REPORT_SCHEMA);
    expect(step2.prompt).toMatch(/Return every Scoring Timeline row whose Type is "Adjustment", copied as written/);
    expect(step2.prompt).not.toMatch(/skip them/);
    expect(step2.prompt).not.toMatch(/tokenCount/);
    expect(SESSION_REPORT_SCHEMA.properties.shellAccounts).toBeUndefined();
    expect(Object.keys(SESSION_REPORT_SCHEMA.properties.adjustmentRows.items.properties)).toEqual(['time', 'detail', 'team', 'amount']);
    expect(Object.keys(SESSION_REPORT_SCHEMA.properties.finalStandings.items.properties)).toEqual(['name', 'total']);
  });
});

describe('parseRawInput: what code stamps', () => {
  let dataDir;
  beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-stamp-')); });
  afterEach(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

  it('takes the roster from the roster stop, canonical where it matches, and never the model\'s', async () => {
    const { sdk } = makeSdk();
    const result = await parseRawInput(makeState(), { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });
    expect(result.sessionConfig.roster).toEqual(['Vic', 'Alex', 'Randy']);
    expect(result.sessionConfig.rosterCount).toBe(3);
    expect(result.sessionConfig.sessionId).toBe('092026');
  });

  it('asks the model for neither the roster nor the session id', () => {
    expect(SESSION_CONFIG_SCHEMA.required).toEqual(['accusation']);
    expect(SESSION_CONFIG_SCHEMA.properties.roster).toBeUndefined();
    expect(SESSION_CONFIG_SCHEMA.properties.sessionId).toBeUndefined();
    expect(SESSION_CONFIG_SCHEMA.properties.sessionDate).toBeUndefined();
  });
});

describe('the parse prompts in the fiction\'s terms', () => {
  let dataDir;
  beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-prompts-')); });
  afterEach(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

  it('step 1 reads the group statement, asks for a split vote and names who the room investigates', async () => {
    const { sdk, calls } = makeSdk();
    await parseRawInput(makeState(), { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });
    const step1 = calls.find((c) => c.jsonSchema === SESSION_CONFIG_SCHEMA);
    expect(step1.prompt).not.toMatch(/MURDER ACCUSATION/);
    expect(step1.prompt).toMatch(/THE GROUP STATEMENT/);
    expect(step1.prompt).toMatch(/Marcus Blackwood/);
    expect(step1.prompt).toMatch(/split final vote/);
    expect(step1.prompt).not.toMatch(/sessionId/);
    const votes = SESSION_CONFIG_SCHEMA.properties.accusation.properties.votes;
    expect(Object.keys(votes.items.properties)).toEqual(['option', 'count', 'adopted']);
  });

  it('step 2 describes an exposure as a memory turned in to Nova, never a sale', async () => {
    const { sdk, calls } = makeSdk();
    await parseRawInput(makeState(), { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });
    const step2 = calls.find((c) => c.jsonSchema === SESSION_REPORT_SCHEMA);
    expect(step2.prompt).toMatch(/turned in to Nova/);
    expect(step2.prompt).not.toMatch(/sold to Detective|Black Market,|sold to Black Market/);
    const exposer = SESSION_REPORT_SCHEMA.properties.exposures.items.properties.exposer.description;
    expect(exposer).toMatch(/turn-in/);
    expect(exposer).not.toMatch(/team/);
  });

  it('the whiteboard parse gets every character and the NPCs', async () => {
    const { sdk } = makeSdk();
    const captured = [];
    const imagePromptBuilder = {
      buildWhiteboardPrompt: async (args) => { captured.push(args); return { systemPrompt: 'S', userPrompt: 'U' }; }
    };
    await parseRawInput(
      makeState({ rawSessionInput: { whiteboardPhotoPath: '/p/wb.jpg' } }),
      { configurable: { sdkClient: sdk, dataDir, sessionId: '092026', imagePromptBuilder } }
    );
    expect(captured).toHaveLength(1);
    expect(captured[0].roster).toEqual(['Vic', 'Alex', 'Randy']);
    expect(captured[0].characters).toEqual(['Vic Kingsley', 'Alex Reeves', 'Morgan Reed']);
    expect(captured[0].npcs).toEqual(expect.arrayContaining(['Marcus Blackwood', 'Blake', 'Nova']));
  });
});

describe('the parse\'s correction block (D15)', () => {
  it('applies the corrections to what the parse reads, and promises nothing about the fields code sets', () => {
    const block = buildParseCorrectionsBlock(['Blake said it, not Vic.']);
    expect(block).toContain('<DIRECTOR_CORRECTIONS>\nBlake said it, not Vic.\n</DIRECTOR_CORRECTIONS>');
    expect(block).not.toMatch(/override anything/);
    expect(block).toMatch(/the correction is right/);
  });
});
