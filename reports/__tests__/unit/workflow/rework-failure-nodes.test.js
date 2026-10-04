/**
 * 4.14e: a failed rework keeps the version it started from (the final review's ruling 5): the
 * map's rework (reviseOutline) and the article's (reviseContentBundle), called directly, as the
 * increment leaves the state for them.
 *
 * - A call that fails on a transient error (lib/llm/retry.js isTransientError) with calls left
 *   changes nothing but the rework's record, which asks the route to run it again.
 * - A rework that fails on anything else, or on its last call, gives up. The version it
 *   started from stays the stop's output. On the director's round the round does not run: its
 *   counts and its slot go back, and the stop reopens. An automatic pass ends the run in an
 *   error, its trace entry gone, since it never returned.
 * - A rework that completes clears the record.
 *
 * getSdkClient returns config.configurable.sdkClient as is, so a jest.fn that throws IS the
 * model here. No model call. Invented text.
 */
const { reviseOutline, reviseContentBundle, createMockPromptBuilder } = require('../../../lib/workflow/nodes/ai-nodes');
const { PHASES } = require('../../../lib/workflow/state');
const { StructuredOutputExtractionError } = require('../../../lib/llm/structured-output-extractor');
const { SdkRefusalError } = require('../../../lib/llm/refusal');
const { MAP, PREVIOUS_BUNDLE } = require('../../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));
const STALL = 'SDK timeout after 900.0s idle 900.0s with no streamed activity (idle limit: 900s) - Map revision 0';
const stall = () => new Error(STALL);
const badSchema = () => new StructuredOutputExtractionError('Structured output failed schema validation - Map revision 0');
const throwing = (error) => jest.fn(async () => { throw error; });
const returning = (value) => jest.fn(async () => clone(value));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, promptBuilder: createMockPromptBuilder(), theme: 'journalist' } });

const DIRECTORS_MAP = (() => { const map = clone(MAP); map.headline = "The director's headline"; return map; })();
const DIRECTORS_DESK = (() => { const desk = clone(PREVIOUS_BUNDLE); desk.headline.main = "The director's headline"; return desk; })();
const NOTE = 'Tighten the money section.';

/** The record an increment opens, with the counts the round started from. */
const opened = (round, countsBefore, failures = 0) => ({
  round: round ? 'send-back' : null, note: round ? NOTE : null, countsBefore, failures, status: 'running'
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('4.14e: the map\'s rework that fails', () => {
  /** The state incrementOutlineRevision leaves on the director's send-back from round 3 (two rounds ran, one automatic pass). */
  const sendBack = (failures = 0) => ({
    theme: 'journalist',
    outline: DIRECTORS_MAP, _previousOutline: DIRECTORS_MAP, _outlineFeedback: NOTE,
    outlineRevisionCount: 0, humanOutlineRevisionCount: 3,
    _outlineRework: opened(true, { outlineRevisionCount: 1, humanOutlineRevisionCount: 2 }, failures)
  });
  /** The state incrementOutlineRevision leaves on the map check's automatic pass in round 1. */
  const automatic = () => ({
    theme: 'journalist',
    outline: clone(MAP), _previousOutline: clone(MAP), _outlineFeedback: null,
    outlineRevisionCount: 1, humanOutlineRevisionCount: 0,
    _outlineTrace: [{ pass: 1, round: 1, trigger: 'check', findings: { structuralIssues: ['Riley is in no beat.'] }, before: clone(MAP), at: 't' }],
    _outlineRework: opened(false, { outlineRevisionCount: 0, humanOutlineRevisionCount: 0 })
  });

  it('a call that stalls with calls left changes nothing but the record, which asks for the call again', async () => {
    const result = await reviseOutline(sendBack(), cfg(throwing(stall())));
    expect(result).toEqual({
      _outlineRework: { ...sendBack()._outlineRework, failures: 1, at: expect.any(String), error: STALL, status: 'retrying' }
    });
  });

  it("the third stall in a row gives the director's round up: the map stays theirs, and the round's counts and slots go back", async () => {
    const result = await reviseOutline(sendBack(2), cfg(throwing(stall())));
    expect(result).toEqual({
      outline: DIRECTORS_MAP,
      _previousOutline: null,
      _outlineFeedback: null,
      outlineRevisionCount: 1,
      humanOutlineRevisionCount: 2,
      _outlineRework: { ...sendBack()._outlineRework, failures: 3, at: expect.any(String), error: STALL, status: 'did-not-run' },
      currentPhase: PHASES.OUTLINE_GENERATION
    });
  });

  it("a schema failure gives the director's round up at once", async () => {
    const result = await reviseOutline(sendBack(), cfg(throwing(badSchema())));
    expect(result.outline).toEqual(DIRECTORS_MAP);
    expect(result._outlineRework).toMatchObject({ round: 'send-back', note: NOTE, failures: 1, status: 'did-not-run' });
    expect(result).not.toHaveProperty('errors');
  });

  it('a declined request is never called again, whatever words its explanation carries', async () => {
    const refused = new SdkRefusalError({ category: 'cyber', explanation: 'a timeout limit', label: 'Map revision 0' });
    const sdk = throwing(refused);
    const result = await reviseOutline(sendBack(), cfg(sdk));
    expect(sdk).toHaveBeenCalledTimes(1);
    expect(result._outlineRework.status).toBe('did-not-run');
  });

  it('an automatic pass that fails ends the run in an error, with the map it started from kept and its trace entry gone', async () => {
    const result = await reviseOutline(automatic(), cfg(throwing(badSchema())));
    expect(result).toEqual({
      outline: MAP,
      _previousOutline: null,
      _outlineTrace: [],
      _outlineRework: { ...automatic()._outlineRework, failures: 1, at: expect.any(String), error: expect.stringMatching(/schema validation/), status: 'did-not-run' },
      errors: [{ phase: PHASES.GENERATE_OUTLINE, type: 'outline-revision-failed', message: expect.stringMatching(/schema validation/), timestamp: expect.any(String) }],
      currentPhase: PHASES.ERROR
    });
  });

  it('a rework that completes clears the record', async () => {
    const result = await reviseOutline(sendBack(1), cfg(returning(MAP)));
    expect(result._outlineRework).toBeNull();
    expect(result.outline).toEqual(MAP);
  });

  it('a rework with no record decides by its note, and gives back the round its increment counted', async () => {
    const { _outlineRework: _record, ...state } = sendBack();
    const result = await reviseOutline(state, cfg(throwing(badSchema())));
    expect(result).toMatchObject({ outline: DIRECTORS_MAP, _outlineFeedback: null, humanOutlineRevisionCount: 2, currentPhase: PHASES.OUTLINE_GENERATION });
    expect(result._outlineRework).toMatchObject({ round: 'send-back', note: NOTE, status: 'did-not-run' });
  });
});

describe('4.14e: the article\'s rework that fails', () => {
  /** The verdict the desk opened on (ready), then the stub the director's send-back appended. */
  const SHOWN_VERDICT = { phase: 'article', ready: true, overallScore: 1, structuralIssues: [], advisoryWarnings: [], timestamp: 't1' };
  const BREACH = { phase: 'article', ready: false, overallScore: 0.4, structuralIssues: ['T5: the closing pays the wrong player.'], advisoryWarnings: [], timestamp: 't1' };
  const stub = (source) => ({ phase: 'article', ready: false, reason: 'revision-invalidated', source, timestamp: 't2' });

  const sendBack = (failures = 0) => ({
    theme: 'journalist',
    contentBundle: DIRECTORS_DESK, _previousContentBundle: DIRECTORS_DESK, _articleFeedback: NOTE,
    articleRevisionCount: 0, humanArticleRevisionCount: 1,
    evaluationHistory: [{ phase: 'arcs', ready: true }, SHOWN_VERDICT, stub('human')],
    _articleRework: opened(true, { articleRevisionCount: 2, humanArticleRevisionCount: 0 }, failures)
  });
  const automatic = () => ({
    theme: 'journalist',
    contentBundle: clone(PREVIOUS_BUNDLE), _previousContentBundle: clone(PREVIOUS_BUNDLE), _articleFeedback: null,
    articleRevisionCount: 1, humanArticleRevisionCount: 0,
    evaluationHistory: [BREACH, stub('evaluator')],
    _articleTrace: [{ pass: 1, round: 1, trigger: 'evaluation', findings: { structuralIssues: BREACH.structuralIssues }, before: clone(PREVIOUS_BUNDLE), at: 't' }],
    _articleRework: opened(false, { articleRevisionCount: 0, humanArticleRevisionCount: 0 })
  });

  it('a call that stalls with calls left changes nothing but the record', async () => {
    const result = await reviseContentBundle(sendBack(), cfg(throwing(stall())));
    expect(result).toEqual({
      _articleRework: { ...sendBack()._articleRework, failures: 1, at: expect.any(String), error: STALL, status: 'retrying' }
    });
  });

  it("the third stall in a row gives the director's round up: the desk stays theirs, its counts go back, and the verdict the desk opened on stands", async () => {
    const result = await reviseContentBundle(sendBack(2), cfg(throwing(stall())));
    expect(result).toEqual({
      contentBundle: DIRECTORS_DESK,
      _previousContentBundle: null,
      _articleFeedback: null,
      articleRevisionCount: 2,
      humanArticleRevisionCount: 0,
      _articleRework: { ...sendBack()._articleRework, failures: 3, at: expect.any(String), error: STALL, status: 'did-not-run' },
      // The stop's verdict, stated again after the round's stub, so a replay skips the judge.
      evaluationHistory: { ...SHOWN_VERDICT, reworkDidNotRun: true, timestamp: expect.any(String) },
      currentPhase: PHASES.GENERATE_CONTENT
    });
  });

  it('an automatic pass that fails ends the run in an error: the draft it started from is kept, its trace entry goes, and the breach that sent it is the director\'s', async () => {
    const result = await reviseContentBundle(automatic(), cfg(throwing(badSchema())));
    expect(result).toEqual({
      contentBundle: PREVIOUS_BUNDLE,
      _previousContentBundle: null,
      _articleTrace: [],
      _articleRework: { ...automatic()._articleRework, failures: 1, at: expect.any(String), error: expect.stringMatching(/schema validation/), status: 'did-not-run' },
      evaluationHistory: {
        ...BREACH, escalatedToHuman: true, escalationReason: expect.stringMatching(/did not run/), reworkDidNotRun: true, timestamp: expect.any(String)
      },
      errors: [{ phase: PHASES.GENERATE_CONTENT, type: 'article-revision-failed', message: expect.stringMatching(/schema validation/), timestamp: expect.any(String) }],
      currentPhase: PHASES.ERROR
    });
  });

  it('a rework that completes clears the record', async () => {
    const result = await reviseContentBundle(sendBack(1), cfg(returning(DIRECTORS_DESK)));
    expect(result._articleRework).toBeNull();
    expect(result.contentBundle.headline.main).toBe("The director's headline");
  });
});

// Fix round 1, finding 1: the send-back filed its note as a rejection note (server.js
// appendGateNote), which every later writer reads as applied by the rework at its stop. A round
// that did not run withdraws that note, and only it: the stop gives the note back, and the
// director's next action files it again or leaves it out, as at the story meeting.
describe('4.14e fix round 1: a round that did not run withdraws its note', () => {
  const note = (gate, kind, stopRound, text = NOTE) => ({ gate, kind, round: 1, stopRound, text, at: 't' });
  const MEETING_APPROVAL = note('arc-selection', 'approval', 1, 'Keep the envelope at the centre.');

  describe('the map', () => {
    // The send-back from round 3: two rounds ran, so its note was filed in round 3.
    const ROUND_NOTE = { ...note('outline', 'rejection', 3), round: 3 };
    // Each differs from the round's note in one of what finds it: its round, its kind, its stop.
    const OTHERS = [MEETING_APPROVAL, note('outline', 'rejection', 2), note('outline', 'approval', 3), note('article', 'rejection', 3)];
    const NOTES = [OTHERS[0], OTHERS[1], ROUND_NOTE, OTHERS[2], OTHERS[3]];
    const sendBack = (notes) => ({
      theme: 'journalist',
      outline: DIRECTORS_MAP, _previousOutline: DIRECTORS_MAP, _outlineFeedback: NOTE,
      outlineRevisionCount: 0, humanOutlineRevisionCount: 3, directorGateNotes: notes,
      _outlineRework: opened(true, { outlineRevisionCount: 1, humanOutlineRevisionCount: 2 })
    });

    it("withdraws the round's note when the round gives up, and keeps every other note", async () => {
      const result = await reviseOutline(sendBack(NOTES), cfg(throwing(badSchema())));
      expect(result.humanOutlineRevisionCount).toBe(2);
      expect(result.directorGateNotes).toEqual(OTHERS);
    });

    it('a rework with no record finds the note in the round its increment counted', async () => {
      const { _outlineRework: _record, ...state } = sendBack(NOTES);
      const result = await reviseOutline(state, cfg(throwing(badSchema())));
      expect(result.directorGateNotes).toEqual(OTHERS);
    });

    it('leaves the notes alone while the call is retried', async () => {
      const result = await reviseOutline(sendBack(NOTES), cfg(throwing(stall())));
      expect(result._outlineRework.status).toBe('retrying');
      expect(result).not.toHaveProperty('directorGateNotes');
    });

    it('writes no notes when none of them is the round\'s, as a note stored before notes recorded their round never is', async () => {
      const { stopRound: _round, ...unrounded } = ROUND_NOTE;
      const result = await reviseOutline(sendBack([MEETING_APPROVAL, unrounded]), cfg(throwing(badSchema())));
      expect(result._outlineRework.status).toBe('did-not-run');
      expect(result).not.toHaveProperty('directorGateNotes');
    });

    it('an automatic pass that gives up withdraws no note', async () => {
      const state = {
        ...sendBack(NOTES), _outlineFeedback: null, outlineRevisionCount: 1, humanOutlineRevisionCount: 2,
        _outlineRework: opened(false, { outlineRevisionCount: 0, humanOutlineRevisionCount: 2 })
      };
      const result = await reviseOutline(state, cfg(throwing(badSchema())));
      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result).not.toHaveProperty('directorGateNotes');
    });
  });

  describe('the desk', () => {
    // The send-back from round 1: its note was filed in round 1.
    const ROUND_NOTE = note('article', 'rejection', 1);
    const OTHERS = [MEETING_APPROVAL, note('outline', 'rejection', 1)];
    const sendBack = () => ({
      theme: 'journalist',
      contentBundle: DIRECTORS_DESK, _previousContentBundle: DIRECTORS_DESK, _articleFeedback: NOTE,
      articleRevisionCount: 0, humanArticleRevisionCount: 1, directorGateNotes: [OTHERS[0], ROUND_NOTE, OTHERS[1]],
      evaluationHistory: [{ phase: 'article', ready: true, structuralIssues: [], advisoryWarnings: [], timestamp: 't1' }],
      _articleRework: opened(true, { articleRevisionCount: 2, humanArticleRevisionCount: 0 })
    });

    it("withdraws the round's note when the round gives up, and keeps every other note", async () => {
      const result = await reviseContentBundle(sendBack(), cfg(throwing(badSchema())));
      expect(result.humanArticleRevisionCount).toBe(0);
      expect(result.directorGateNotes).toEqual(OTHERS);
    });

    it('leaves the notes alone while the call is retried', async () => {
      const result = await reviseContentBundle(sendBack(), cfg(throwing(stall())));
      expect(result._articleRework.status).toBe('retrying');
      expect(result).not.toHaveProperty('directorGateNotes');
    });
  });
});
