/**
 * Phase 17, fix wave 3: code holds the map's headline (the director's call, 2026-10-20, after the
 * final review). The article prints the map's headline (ai-nodes.js stampFromMap).
 * - The first map carries the settled angle's headline (lib/weave.js settledAngleOf), the
 *   director's own where they edited it at the meeting, whatever the map writer wrote. With no
 *   settled headline (an older thread), the writer's stands.
 * - Every later pass keeps the headline of the map it started from (`_previousOutline`, the
 *   director's version on a send-back), except a send-back with the director's note, whose
 *   rework may write the new headline the note asks for; the automatic passes after it in that
 *   round keep that one.
 * - The map's send-back with the director's note, and only it, reads the line that says so.
 *
 * One function holds a map's headline: lib/map.js holdHeadline. getSdkClient returns
 * config.configurable.sdkClient as is, so a jest.fn IS the model here. No model call. Invented
 * text.
 */
// server.js refuses to load without a session secret; this one signs nothing.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';

const { holdHeadline } = require('../map');
const { generateOutline, reviseOutline, createMockPromptBuilder } = require('../workflow/nodes/ai-nodes');
const { buildRevisionContext } = require('../workflow/nodes/node-helpers');
const { _testing: { incrementOutlineRevision } } = require('../workflow/graph');
const { roundNoteOf } = require('../workflow/state');
const { CHECKPOINT_TYPES } = require('../workflow/checkpoint-helpers');
const { meetingResume } = require('../meeting');
const { withFactCheckMark } = require('../weave');
const { StructuredOutputExtractionError } = require('../llm/structured-output-extractor');
const { CHANGED_EDITS_KEY, carriedEdits } = require('../hand-edit-diff');
const { buildResumePayload } = require('../../server.js');
const { reworkFixtureState, WEAVE, MAP, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));
const returning = (value) => jest.fn(async () => clone(value));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, promptBuilder: createMockPromptBuilder(), theme: 'journalist' } });
const promptOf = (sdk) => sdk.mock.calls[0][0].prompt;

/** The settled angle's headline in the fixture: the first angle's, since the weave carries no pick. */
const SETTLED = WEAVE.angles[0].headline;
/** A headline the map writer or a rework wrote over the one it was given. */
const REWORDED = 'The Room Called It an Overdose, and the Ledger Disagreed';
/** A headline the director typed on the map. */
const TYPED = 'A Sale on the Night He Died, and a Room That Looked Away';
/** The director's note that asks for a new headline. */
const NOTE = 'Give the map a headline about the sale, not the vote.';
/** The line a map send-back with the director's note reads, word for word (fix wave 3, step 3). */
const HEADLINE_LINE = "The map's headline stays word for word unless the director's note asks for a new one: then write the headline the note asks for, in the voice C12 (`<craft-voice>`) sets out.";

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

/** Freeze a value and everything under it, so a write to it throws. */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('holdHeadline: the one function that holds a map\'s headline', () => {
  it('returns a copy of the map with the headline, and nothing else changed', () => {
    const map = clone(MAP);
    const held = holdHeadline(map, REWORDED);
    expect(held).not.toBe(map);
    expect(held).toEqual({ ...clone(MAP), headline: REWORDED });
  });

  it('carries the headline as given, word for word', () => {
    expect(holdHeadline(clone(MAP), '  The Ledger, "Kept" Talking  ').headline).toBe('  The Ledger, "Kept" Talking  ');
  });

  it('leaves the map as it is when the headline is empty, blank, missing or not text', () => {
    const map = clone(MAP);
    ['', '   ', undefined, null, 42, {}, ['x']].forEach((headline) => {
      expect(holdHeadline(map, headline)).toBe(map);
    });
    expect(holdHeadline(map)).toBe(map);
  });

  it('leaves a value that is no map as it is', () => {
    const outline = { lede: { hook: 'An old hook.' }, closing: {} };
    [null, undefined, outline, [], 'a map', 7, { headline: 'No sections here' }].forEach((value) => {
      expect(holdHeadline(value, REWORDED)).toBe(value);
    });
  });

  it('never changes the map it is given', () => {
    const map = deepFreeze(clone(MAP));
    expect(() => holdHeadline(map, REWORDED)).not.toThrow();
    expect(map.headline).toBe(MAP.headline);
  });
});

describe("the map writer's node: the first map carries the settled angle's headline", () => {
  /** The state at the map writer: the meeting approved, no map yet. */
  const atWriter = (over = {}) => ({ ...reworkFixtureState('journalist'), outline: null, _mapBaseline: null, ...over });
  const writersMap = () => ({ ...clone(MAP), headline: REWORDED, deck: 'The writer\'s own deck, which stands.' });

  it("a headline the writer reworded is stored as the settled angle's, on the map and on the writer's last map", async () => {
    const result = await generateOutline(atWriter(), cfg(returning(writersMap())));
    expect(result.outline.headline).toBe(SETTLED);
    expect(result._mapBaseline.headline).toBe(SETTLED);
    expect(result.outline).toEqual({ ...writersMap(), headline: SETTLED });
    expect(result.heroImage).toBe(MAP.topPhoto);
  });

  it('the settled angle is the one the director picked', async () => {
    const result = await generateOutline(atWriter({ weave: { ...clone(WEAVE), picked: 'a2' } }), cfg(returning(writersMap())));
    expect(result.outline.headline).toBe(WEAVE.angles[1].headline);
  });

  it("the director's edit to the headline at the meeting is the one stored", async () => {
    const DIRECTORS = 'The Ledger Kept Talking After the Room Called It an Overdose';
    const shown = withFactCheckMark(clone(WEAVE), { at: '2026-10-20T10:00:00.000Z', ready: true, fixes: 0 });
    const atMeeting = { ...atWriter(), weave: shown, _weaveBaseline: clone(WEAVE), meetingApproved: null };
    const left = clone(WEAVE);
    left.angles[0].headline = DIRECTORS;
    const { stateUpdates, error } = meetingResume({ meeting: 'approve', weave: left }, atMeeting);
    expect(error).toBeNull();
    const state = { ...atMeeting, ...stateUpdates, meetingApproved: true };
    expect(state.weave.angles[0].headline).toBe(DIRECTORS);

    const result = await generateOutline(state, cfg(returning(writersMap())));
    expect(result.outline.headline).toBe(DIRECTORS);
    expect(result._mapBaseline.headline).toBe(DIRECTORS);
  });

  it("with no settled headline (an older thread, a weave with no angle, a blank headline), the writer's stands", async () => {
    const blank = clone(WEAVE);
    blank.angles[0].headline = '   ';
    for (const weave of [null, { angles: [] }, blank]) {
      const result = await generateOutline(atWriter({ weave }), cfg(returning(writersMap())));
      expect(result.outline.headline).toBe(REWORDED);
      expect(result._mapBaseline.headline).toBe(REWORDED);
    }
  });
});

describe("the map's rework: each later pass keeps the headline it started from", () => {
  /** The state at the map in round 1, the writer's map shown, no note filed. */
  const atMap = () => ({ ...reworkFixtureState('journalist'), outlineRevisionCount: 0, humanOutlineRevisionCount: 0, directorGateNotes: [] });
  /** The director's version of the map: the writer's with the headline they typed. */
  const typed = () => ({ ...clone(MAP), headline: TYPED });
  /** The director's version of the map with a deck they wrote, the headline left as shown. */
  const newDeck = () => ({ ...clone(MAP), deck: 'The sale paid out while the room argued about a pill.' });
  /** The rework's map: the version it started from with the headline reworded and the deck changed. */
  const rework = (from, headline = REWORDED) => ({ ...clone(from), headline, deck: 'A deck the rework wrote.' });

  /** The director's send-back as the server takes it (server.js buildResumePayload), with the state it leaves. */
  function sendBack(map, note, state = atMap()) {
    const { stateUpdates, error } = buildResumePayload({ outline: 'send-back', note, map }, state, 'journalist', CHECKPOINT_TYPES.OUTLINE);
    expect(error).toBeNull();
    return { ...state, ...stateUpdates };
  }
  /** The state the increment hands the rework (graph.js incrementOutlineRevision). */
  const increment = async (state) => ({ ...state, ...(await incrementOutlineRevision(state)) });

  it('an automatic pass that rewords the headline keeps the one it started from; its other changes stand', async () => {
    const state = await increment(atMap());
    expect(state.outlineRevisionCount).toBe(1);
    const result = await reviseOutline(state, cfg(returning(rework(MAP))));
    expect(result.outline.headline).toBe(MAP.headline);
    expect(result._mapBaseline.headline).toBe(MAP.headline);
    expect(result.outline.deck).toBe('A deck the rework wrote.');
  });

  describe('a send-back with no typed note', () => {
    it('never reaches the rework: the server refuses a send-back with no note, or a blank one', () => {
      [undefined, '', '   '].forEach((note) => {
        const { error } = buildResumePayload({ outline: 'send-back', note, map: typed() }, atMap(), 'journalist', CHECKPOINT_TYPES.OUTLINE);
        expect(error).toBe('A send-back carries a note: what the writer should change.');
      });
    });

    // With no note in the slot (`_outlineFeedback`) the increment counts the pass as automatic,
    // so the state such a send-back would leave runs the rework on the director's version.
    it("keeps the headline of the director's version, one they typed on the map included", async () => {
      const left = sendBack(typed(), NOTE);
      const state = await increment({ ...left, _outlineFeedback: null });
      expect(state._previousOutline.headline).toBe(TYPED);
      const result = await reviseOutline(state, cfg(returning(rework(state._previousOutline))));
      expect(result.outline.headline).toBe(TYPED);
      expect(result._mapBaseline.headline).toBe(TYPED);
      // The hold ran before settleEdits: the pass changed no line of the director's, so the
      // report records nothing to put back.
      expect(result._outlineHandEditReport.changed).toEqual([]);
    });

    it("keeps the headline of the director's version when they left it as shown", async () => {
      const state = await increment({ ...sendBack(newDeck(), NOTE), _outlineFeedback: null });
      const result = await reviseOutline(state, cfg(returning(rework(state._previousOutline))));
      expect(result.outline.headline).toBe(MAP.headline);
    });
  });

  describe("a send-back with the director's note", () => {
    it("keeps the rework's new headline, and the automatic pass after it in that round keeps that one", async () => {
      const first = await increment(sendBack(newDeck(), NOTE));
      expect(first._outlineFeedback).toBe(NOTE);
      const sent = await reviseOutline(first, cfg(returning(rework(first._previousOutline))));
      expect(sent.outline.headline).toBe(REWORDED);
      expect(sent._mapBaseline.headline).toBe(REWORDED);

      // The round's check rework: the slot is empty, while the round's note is still in hand.
      const second = await increment({ ...first, ...sent });
      expect(second.outlineRevisionCount).toBe(1);
      expect(roundNoteOf(CHECKPOINT_TYPES.OUTLINE, second)).toBe(NOTE);
      const after = await reviseOutline(second, cfg(returning(rework(second._previousOutline, 'Yet Another Headline the Check Rework Wrote'))));
      expect(after.outline.headline).toBe(REWORDED);
      expect(after._mapBaseline.headline).toBe(REWORDED);
    });

    it("may change a headline the director typed on the map, reporting it with its reason, and the pass after it keeps the new one", async () => {
      const first = await increment(sendBack(typed(), NOTE));
      const [edit] = carriedEdits(first._outlineHandEdits, first._previousOutline);
      expect(edit.at.map((step) => step.key)).toEqual(['headline']);
      const reason = 'The note asks for a headline about the sale.';
      const sent = await reviseOutline(first, cfg(returning({ ...rework(first._previousOutline), [CHANGED_EDITS_KEY]: [{ id: edit.id, reason }] })));
      expect(sent.outline.headline).toBe(REWORDED);
      expect(sent._outlineHandEditReport.changed).toEqual([expect.objectContaining({ id: edit.id, director: TYPED, became: REWORDED, reason, restored: false })]);

      const second = await increment({ ...first, ...sent });
      const after = await reviseOutline(second, cfg(returning(rework(second._previousOutline, TYPED))));
      expect(after.outline.headline).toBe(REWORDED);
    });
  });

  describe('a rework that fails keeps the previous map', () => {
    const badSchema = () => new StructuredOutputExtractionError('Structured output failed schema validation - Map revision 1');
    const throwing = () => jest.fn(async () => { throw badSchema(); });

    it('on an automatic pass', async () => {
      const state = await increment(atMap());
      const result = await reviseOutline(state, cfg(throwing()));
      expect(result.outline).toEqual(clone(MAP));
    });

    it("on a send-back with the director's note: the director's version stays, their headline with it", async () => {
      const state = await increment(sendBack(typed(), NOTE));
      const result = await reviseOutline(state, cfg(throwing()));
      expect(result.outline.headline).toBe(TYPED);
      expect(result.outline).toEqual(state._previousOutline);
    });
  });
});

describe("the send-back's line: the map's send-back with the director's note, and only it", () => {
  const atMap = () => ({ ...reworkFixtureState('journalist'), outlineRevisionCount: 0, humanOutlineRevisionCount: 0, directorGateNotes: [] });

  it("is in the map send-back's prompt, after the note's scope", async () => {
    const { stateUpdates } = buildResumePayload({ outline: 'send-back', note: NOTE, map: clone(MAP) }, atMap(), 'journalist', CHECKPOINT_TYPES.OUTLINE);
    const after = { ...atMap(), ...stateUpdates };
    const state = { ...after, ...(await incrementOutlineRevision(after)) };
    const sdk = returning(MAP);
    await reviseOutline(state, cfg(sdk));
    const prompt = promptOf(sdk);
    expect(prompt.split(HEADLINE_LINE).length - 1).toBe(1);
    expect(prompt).toContain(`What the note leaves alone stays as it was. ${HEADLINE_LINE}`);
  });

  it("is not in the map's automatic pass", async () => {
    const state = { ...atMap(), ...(await incrementOutlineRevision(atMap())) };
    const sdk = returning(MAP);
    await reviseOutline(state, cfg(sdk));
    expect(promptOf(sdk)).not.toContain(HEADLINE_LINE);
    expect(promptOf(sdk)).not.toContain("unless the director's note asks for a new one");
  });

  // Every rework's context, built as its node builds it: the map's two, the article's two and the
  // weave's three (lib/workflow/nodes/node-helpers.js buildRevisionContext).
  const contexts = {
    'the map send-back with a note': { phase: 'outline', outputName: 'map', revisionCount: 0, round: 2, previousOutput: clone(MAP), humanFeedback: NOTE },
    "the map's automatic pass": { phase: 'outline', outputName: 'map', revisionCount: 1, previousOutput: clone(MAP), humanFeedback: null, validationResults: { phase: 'outline', source: 'map-checks', passed: false, structuralIssues: ['Riley is in no move.'] } },
    "the article's send-back with a note": { phase: 'article', revisionCount: 0, round: 2, previousOutput: clone(PREVIOUS_BUNDLE), humanFeedback: NOTE },
    "the article's automatic pass": { phase: 'article', revisionCount: 1, previousOutput: clone(PREVIOUS_BUNDLE), humanFeedback: null, validationResults: { phase: 'article', passed: false, structuralIssues: ['A card quotes no document.'] } },
    "the weave's send-back with a note": { phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 2, previousOutput: clone(WEAVE), meetingRound: 'send-back', humanFeedback: NOTE },
    "the weave's reweave with a note": { phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 2, previousOutput: clone(WEAVE), meetingRound: 'reweave', humanFeedback: NOTE },
    "the weave's automatic pass": { phase: 'arcs', outputName: 'weave', revisionCount: 1, previousOutput: clone(WEAVE), meetingRound: null, humanFeedback: null, validationResults: { phase: 'arcs', passed: false, structuralIssues: ['T3 breaks a rule.'] } }
  };

  it.each(Object.keys(contexts))('%s', (name) => {
    const { contextSection } = buildRevisionContext(contexts[name]);
    const expected = name === 'the map send-back with a note';
    expect(`${name}: ${contextSection.includes(HEADLINE_LINE)}`).toBe(`${name}: ${expected}`);
  });
});
