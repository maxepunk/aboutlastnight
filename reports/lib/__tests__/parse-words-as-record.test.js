/**
 * The parse keeps the director's words beside what it makes of them
 * (phase 2, brief 2.2).
 *
 * - A verdict with no culprit has its own shape: a kind, and an empty `accused`.
 *   Session 092026's room voted for an accidental overdose and the parse, which
 *   could only name a defendant, wrote the victim as the accused.
 * - The director's accusation, word for word, is stored with the parse.
 * - The session report's exposer, exposure time and owner are kept.
 * - Every input-review correction so far reaches every parse call, the whiteboard
 *   parse included (it used to get none).
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
const { SESSION_CONFIG_SCHEMA, SESSION_REPORT_SCHEMA, WHITEBOARD_SCHEMA, correctionsForParse } = _testing;
const {
  VERDICT_KINDS,
  NO_CULPRIT_KINDS,
  isNoCulpritVerdict,
  normalizeAccusation,
  directorAccusationText
} = require('../accusation-verdict');

const RAW_ACCUSATION = 'Six votes for an accidental overdose, in a final round that had already deadlocked 4 to 4 between Alex and Vic.';

describe('SESSION_CONFIG_SCHEMA: the no-culprit verdict', () => {
  const acc = SESSION_CONFIG_SCHEMA.properties.accusation;

  it('requires a verdict kind beside the accused and the charge', () => {
    expect(acc.required).toEqual(expect.arrayContaining(['verdictKind', 'accused', 'charge']));
    expect(acc.properties.verdictKind.enum).toEqual(VERDICT_KINDS);
  });

  it('names an accident, an overdose and self-harm as kinds that name no culprit', () => {
    expect(NO_CULPRIT_KINDS).toEqual(expect.arrayContaining(['accident', 'overdose', 'self-harm']));
    expect(NO_CULPRIT_KINDS).not.toContain('culprit');
  });

  it('lets accused be empty and tells the parser never to list the victim', () => {
    expect(acc.properties.accused.minItems).toBeUndefined();
    // Phase 3 (3.5): empty for every kind but "culprit", and for a culprit verdict
    // that blames an institution or an unnamed person; the victim is named (#5).
    expect(acc.properties.accused.description).toMatch(/Empty when it blames an institution or an unnamed person, and for every kind but "culprit"/);
    expect(acc.properties.accused.description).toMatch(/Marcus Blackwood is the man whose death the room investigates, so he is never listed here/);
  });

  it('carries no JSON-schema format keyword (SDK #277)', () => {
    expect(JSON.stringify(SESSION_CONFIG_SCHEMA)).not.toMatch(/"format"/);
    expect(JSON.stringify(SESSION_REPORT_SCHEMA)).not.toMatch(/"format"/);
  });
});

describe('SESSION_REPORT_SCHEMA: exposer, time and owner per exposed memory', () => {
  it('keeps one exposures entry per exposed token', () => {
    const exposures = SESSION_REPORT_SCHEMA.properties.exposures;
    expect(exposures.type).toBe('array');
    expect(exposures.items.required).toEqual(['tokenId']);
    expect(Object.keys(exposures.items.properties)).toEqual(['tokenId', 'exposer', 'time', 'owner']);
  });
});

describe('normalizeAccusation', () => {
  it('empties accused for a verdict that names no culprit, whatever the model listed', () => {
    const out = normalizeAccusation({ verdictKind: 'overdose', accused: ['Marcus'], charge: 'Accidental overdose' });
    expect(out).toEqual({ verdictKind: 'overdose', accused: [], charge: 'Accidental overdose' });
    expect(isNoCulpritVerdict(out)).toBe(true);
  });

  it('keeps a culprit verdict as parsed', () => {
    const acc = { verdictKind: 'culprit', accused: ['Vic'], charge: 'Murder', notes: '9 votes' };
    expect(normalizeAccusation(acc)).toEqual(acc);
    expect(isNoCulpritVerdict(acc)).toBe(false);
  });

  it('drops an unknown kind instead of trusting it', () => {
    expect(normalizeAccusation({ verdictKind: 'suicide-pact', accused: ['Vic'] })).toEqual({ accused: ['Vic'] });
  });

  it('a parse from before verdict kinds is not read as no-culprit', () => {
    expect(isNoCulpritVerdict({ accused: [], charge: 'Murder' })).toBe(false);
  });
});

describe('directorAccusationText', () => {
  it('prefers the text stored with the parse, then the channel', () => {
    expect(directorAccusationText({ sessionConfig: { accusationRaw: 'stored' }, accusation: 'channel' })).toBe('stored');
    expect(directorAccusationText({ sessionConfig: {}, accusation: 'channel' })).toBe('channel');
    expect(directorAccusationText({ sessionConfig: {}, accusation: '  ' })).toBeNull();
    expect(directorAccusationText(null)).toBeNull();
  });
});

describe('correctionsForParse', () => {
  it('is every correction of the session, in order', () => {
    expect(correctionsForParse({ inputReviewCorrections: ['first', 'second'], _inputCorrections: 'second' }))
      .toEqual(['first', 'second']);
  });

  it('falls back to the round\'s own correction when the list is empty', () => {
    expect(correctionsForParse({ inputReviewCorrections: null, _inputCorrections: ' only ' })).toEqual(['only']);
    expect(correctionsForParse({})).toEqual([]);
  });
});

describe('parseRawInput: the director\'s words stored with the parse', () => {
  let dataDir;
  beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-words-')); });
  afterEach(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

  /** An SDK stub that answers each parse call by its schema and records the prompts. */
  function makeSdk() {
    const calls = [];
    const sdk = jest.fn(async (options) => {
      calls.push(options);
      if (options.jsonSchema === SESSION_CONFIG_SCHEMA) {
        // The model lists the victim, as it did on 092026.
        return { sessionId: 'X', roster: ['Alex', 'Vic'], accusation: { verdictKind: 'overdose', accused: ['Marcus'], charge: 'Accidental overdose', notes: 'deadlocked 4 to 4' } };
      }
      if (options.jsonSchema === SESSION_REPORT_SCHEMA) {
        return {
          exposedTokens: ['ale003', 'ash003'],
          exposures: [
            { tokenId: 'ale003', exposer: 'NovaNews (Anonymous)', time: '09:06 PM', owner: 'Alex Reeves' },
            { tokenId: 'ash003', exposer: 'Ashe', time: '09:40 PM', owner: 'Ashe Motoko' }
          ],
          buriedTokens: [],
          shellAccounts: []
        };
      }
      if (options.jsonSchema === WHITEBOARD_SCHEMA) return { names: [] };
      // The director-notes enricher.
      return { characterMentions: {}, quotes: [], transactionReferences: [], postInvestigationDevelopments: [] };
    });
    return { sdk, calls };
  }

  function makeState(overrides = {}) {
    return {
      sessionId: '092026',
      accusation: RAW_ACCUSATION,
      sessionReport: '# Session Report',
      directorNotesRaw: 'Vic to Ashe: "My company is very interesting."',
      sessionConfig: {},
      rawSessionInput: {},
      ...overrides
    };
  }

  it('stamps the raw accusation with the parse and keeps no victim as accused', async () => {
    const { sdk } = makeSdk();
    const result = await parseRawInput(makeState(), { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });

    expect(result.sessionConfig.accusation).toEqual({ verdictKind: 'overdose', accused: [], charge: 'Accidental overdose', notes: 'deadlocked 4 to 4' });
    expect(result.sessionConfig.accusationRaw).toBe(RAW_ACCUSATION);
    expect(result.playerFocus.accusation.verdictKind).toBe('overdose');
    expect(result.playerFocus.primarySuspects).toEqual([]);

    // On disk, beside the parse: inputs/session-config.json carries the text.
    const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, '092026', 'inputs', 'session-config.json'), 'utf8'));
    expect(onDisk.accusationRaw).toBe(RAW_ACCUSATION);
    expect(onDisk.accusation.accused).toEqual([]);
  });

  // Final fix wave (K3): with no first name from the start form, the parse stamps the theme's
  // default for the article's writer, the one the byline and the roster line read.
  it("stamps the theme's default first name for Nova when the start form gives none, and the director's when it gives one", async () => {
    const { getThemeNPCEntries } = require('../theme-config');
    const fallback = getThemeNPCEntries('journalist').find((entry) => entry && entry.writer).writer.defaultFirstName;
    const none = await parseRawInput(makeState(), { configurable: { sdkClient: makeSdk().sdk, dataDir, sessionId: '092026' } });
    expect(none.sessionConfig.journalistFirstName).toBe(fallback);
    const given = await parseRawInput(makeState({ rawSessionInput: { journalistFirstName: 'Rhea' } }),
      { configurable: { sdkClient: makeSdk().sdk, dataDir, sessionId: '092026' } });
    expect(given.sessionConfig.journalistFirstName).toBe('Rhea');
  });

  it('keeps each exposure in state (sessionConfig) and in orchestrator-parsed.json', async () => {
    const { sdk } = makeSdk();
    const result = await parseRawInput(makeState(), { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });

    expect(result.sessionConfig.exposures).toHaveLength(2);
    expect(result.sessionConfig.exposures[1]).toEqual({ tokenId: 'ash003', exposer: 'Ashe', time: '09:40 PM', owner: 'Ashe Motoko' });
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, '092026', 'inputs', 'orchestrator-parsed.json'), 'utf8'));
    expect(parsed.exposures).toEqual(result.sessionConfig.exposures);
  });

  it('asks step 2 for the exposer, time and owner of each exposed memory', async () => {
    const { sdk, calls } = makeSdk();
    await parseRawInput(makeState(), { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });
    const step2 = calls.find((c) => c.jsonSchema === SESSION_REPORT_SCHEMA);
    expect(step2.prompt).toMatch(/exposer = the "Exposed By" column/);
  });

  it('sends every correction so far, in order, to every parse call, the whiteboard included', async () => {
    const { sdk, calls } = makeSdk();
    const state = makeState({
      inputReviewCorrections: ['This was actually Blake -> Ashe.', 'The room accused no one.'],
      _inputCorrections: 'The room accused no one.',
      rawSessionInput: { whiteboardPhotoPath: path.join(dataDir, 'whiteboard.jpg') }
    });
    const result = await parseRawInput(state, { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });

    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.prompt).toContain('<DIRECTOR_CORRECTIONS>');
      expect(call.prompt).toContain('1. This was actually Blake -> Ashe.');
      expect(call.prompt).toContain('2. The room accused no one.');
    }
    const whiteboard = calls.find((c) => c.jsonSchema === WHITEBOARD_SCHEMA);
    // Phase 3 (3.5, D15): the line speaks only to what the parse reads from the source text.
    expect(whiteboard.prompt).toMatch(/Apply these corrections to what you parse from the source text; where a correction and the source text differ, the correction is right\.$/);
    // The round's correction is consumed; the kept list is not the parse's to touch.
    expect(result._inputCorrections).toBeNull();
    expect(result).not.toHaveProperty('inputReviewCorrections');
  });

  it('one correction renders exactly as the parse rendered it before (no numbering)', async () => {
    const { sdk, calls } = makeSdk();
    await parseRawInput(makeState({ inputReviewCorrections: ['Blake said it, not Vic.'] }),
      { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });
    const step1 = calls.find((c) => c.jsonSchema === SESSION_CONFIG_SCHEMA);
    expect(step1.prompt).toContain('<DIRECTOR_CORRECTIONS>\nBlake said it, not Vic.\n</DIRECTOR_CORRECTIONS>');
  });

  it('tells step 1 how to parse a verdict with no culprit', async () => {
    const { sdk, calls } = makeSdk();
    await parseRawInput(makeState(), { configurable: { sdkClient: sdk, dataDir, sessionId: '092026' } });
    const step1 = calls.find((c) => c.jsonSchema === SESSION_CONFIG_SCHEMA);
    expect(step1.prompt).toContain(RAW_ACCUSATION);
    // Phase 3 (3.5): the group statement's three shapes, and the victim named (#5).
    expect(step1.prompt).toMatch(/It names no culprit \(an accident, an overdose, self-harm\): verdictKind is that kind, accused empty, and the verdict in charge\./);
    expect(step1.prompt).toMatch(/Marcus Blackwood is the man whose death the room investigates, so accused never lists him\./);
  });
});
