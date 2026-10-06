/**
 * Threads from before the story meeting (phase 4, task 4.11; R2).
 *
 * A thread started before phase 4 holds no weave. Once the old stages have taken it past
 * the arc writer, the new stages would replay it on the old shapes, so the server refuses
 * it and tells the director to roll back to the story meeting, which keeps the parse, the
 * curation and the photos and writes the weave fresh. The rule is lib/old-thread.js's, by
 * the weave (ruling 1), and by the thread's stop in the console's CHECKPOINT_ORDER, its
 * completion, or what it holds that only a stage past the arc writer writes: an
 * evaluation, a rework's count, an outline or an article (fix rounds 1 and 2).
 */
const {
  OLD_THREAD_MESSAGE,
  OLD_SHAPES_MESSAGE,
  OLD_THREAD_ROLLBACK,
  OLD_THREAD_ROLLBACK_POINTS,
  OLD_SHAPES_WEAVE_CHANNELS,
  PAST_THE_ARC_WRITER,
  isOldShapeWeave,
  isOldShapeMap,
  oldThreadOf,
  oldThreadRefusal,
  oldThreadRollbackState
} = require('../old-thread');
const { CHECKPOINT_ORDER } = require('../../console/session-start-logic');
const { ReportStateAnnotation, VALID_ROLLBACK_POINTS, ROLLBACK_COUNTER_RESETS, ROLLBACK_CLEARS, _testing: { appendSingleReducer } } = require('../workflow/state');
const { buildRollbackState, buildFreshStartState } = require('../api-helpers');
const { isWeave } = require('../weave');
const { reworkFixtureState, MAP, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const { OLD_SHAPE_WEAVE, OLD_SHAPE_MAP, oldShapeWeave, oldShapeMap, oldShapeMeetingChannels, oldShapeMapChannels } = require('./fixtures/old-shapes');

const WEAVE = reworkFixtureState('journalist').weave;
const MESSAGE = 'This session was started before the story meeting. Roll back to the story meeting to continue.';
const MEETING_AND_BEFORE = ['paper-evidence-selection', 'await-roster', 'await-full-context', 'input-review', 'pre-curation', 'evidence-and-photos', 'arc-selection'];
const PAST_THE_MEETING = ['photos', 'character-ids', 'outline', 'article'];
/** An outline and an article in the shapes the old stages wrote, before phase 4. Invented text. */
const OLD_OUTLINE = { lede: { hook: 'An old hook.' }, theStory: { arcs: [] }, closing: { theme: 'An old close.' }, writerQuestions: [] };
const OLD_BUNDLE = { headline: { main: 'An old headline' }, sections: [], writerQuestions: [] };

describe('4.11: the message and the rollback an old thread is given', () => {
  it("the message is the brief's, word for word", () => {
    expect(OLD_THREAD_MESSAGE).toBe(MESSAGE);
  });

  it('the rollback is the story meeting, and the points open to it are the meeting and every point before it, in the stop order', () => {
    expect(OLD_THREAD_ROLLBACK).toBe('arc-selection');
    expect(OLD_THREAD_ROLLBACK_POINTS).toEqual(MEETING_AND_BEFORE);
    expect(OLD_THREAD_ROLLBACK_POINTS).toEqual(CHECKPOINT_ORDER.slice(0, CHECKPOINT_ORDER.indexOf('arc-selection') + 1));
    OLD_THREAD_ROLLBACK_POINTS.forEach((point) => expect(VALID_ROLLBACK_POINTS).toContain(point));
    expect(VALID_ROLLBACK_POINTS.filter((point) => !OLD_THREAD_ROLLBACK_POINTS.includes(point)).sort()).toEqual([...PAST_THE_MEETING].sort());
  });
});

describe('4.11: which thread is old (R2; ruling 1)', () => {
  const FLAG = { message: MESSAGE, rollbackTo: 'arc-selection', rollbackPoints: MEETING_AND_BEFORE };

  it.each(['arc-selection', ...PAST_THE_MEETING])('a thread with no weave paused at %s is old, and its flag names the message and the rollback', (stop) => {
    expect(oldThreadOf({ currentPhase: '2.36' }, stop)).toEqual(FLAG);
    expect(oldThreadOf({ currentPhase: '2.36', weave: null }, stop)).toEqual(FLAG);
  });

  it('a complete thread with no weave is old', () => {
    expect(oldThreadOf({ currentPhase: 'complete' }, null)).toEqual(FLAG);
  });

  it.each(['arc-selection', ...PAST_THE_MEETING])('a thread with a weave paused at %s is not', (stop) => {
    expect(oldThreadOf({ currentPhase: '2.36', weave: WEAVE }, stop)).toBeNull();
  });

  it('a complete thread with a weave is not', () => {
    expect(oldThreadOf({ currentPhase: 'complete', weave: WEAVE }, null)).toBeNull();
  });

  it.each(MEETING_AND_BEFORE.filter((stop) => stop !== 'arc-selection'))('a thread paused at %s, before the meeting, is not: the new arc stage writes its weave', (stop) => {
    expect(oldThreadOf({ currentPhase: '1.8' }, stop)).toBeNull();
  });

  it('a thread at no stop that holds nothing past the arc writer is not: a new thread before its weave, in flight or stopped in the arc writer, whose resume writes the weave', () => {
    expect(oldThreadOf({ currentPhase: '2.1' }, null)).toBeNull();
    expect(oldThreadOf({ currentPhase: 'error' }, null)).toBeNull();
    expect(oldThreadOf({ currentPhase: 'error', outline: null, contentBundle: null }, null)).toBeNull();
    expect(oldThreadOf({ currentPhase: 'error', evaluationHistory: [], arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: null }, null)).toBeNull();
  });

  it('a value that is no weave counts as none, as the arc writer reads it', () => {
    expect(oldThreadOf({ currentPhase: 'complete', weave: { story: 'No threads.' } }, null)).toEqual(FLAG);
  });

  it('a thread with no values, and a stop the order does not know, are not', () => {
    expect(oldThreadOf(undefined, null)).toBeNull();
    expect(oldThreadOf({}, null)).toBeNull();
    expect(oldThreadOf({}, 'no-such-stop')).toBeNull();
  });

  it('each flag is a copy: a caller that changes one leaves the next alone', () => {
    const first = oldThreadOf({ currentPhase: 'complete' }, null);
    first.rollbackPoints.push('photos');
    expect(oldThreadOf({ currentPhase: 'complete' }, null).rollbackPoints).toEqual(MEETING_AND_BEFORE);
  });
});

// Fix round 1, finding 1: a thread from before phase 4 that stopped on an error, or whose run
// was killed, after the old stages wrote its outline or its article sits at no stop. A resume
// replayed it from START: the arc writer wrote a weave, the meeting opened, and once it was
// approved the map writer skipped on the old outline (it skips on any outline), so the map's
// stop opened on it, or the article writer and the publish ran on the old article. Only a
// stage after the meeting writes an outline or an article, and a new thread holds neither
// without a weave, so a thread that holds one with no weave is old wherever it sits.
describe('4.11 fix round 1: a thread that holds an outline or an article with no weave is old, at no stop too', () => {
  const FLAG = { message: MESSAGE, rollbackTo: 'arc-selection', rollbackPoints: MEETING_AND_BEFORE };

  it.each([
    ['stopped on an error after its outline was written', { currentPhase: 'error', outline: OLD_OUTLINE }],
    ['stopped on an error after its article was approved', { currentPhase: 'error', outline: OLD_OUTLINE, contentBundle: OLD_BUNDLE, articleApproved: true }],
    ['killed while its article was being written', { currentPhase: '3.25', outline: OLD_OUTLINE, outlineApproved: true }],
    ['holding an article alone', { currentPhase: 'error', contentBundle: OLD_BUNDLE }]
  ])('a thread at no stop that %s is old', (_case, values) => {
    expect(oldThreadOf(values, null)).toEqual(FLAG);
  });

  it('any value counts, as the map writer and the article writer each skip on any', () => {
    expect(oldThreadOf({ currentPhase: 'error', outline: {} }, null)).toEqual(FLAG);
    expect(oldThreadOf({ currentPhase: 'error', contentBundle: {} }, null)).toEqual(FLAG);
  });

  it('a thread paused before the meeting that holds one is old too: approving its stop would carry the old outline to the map writer', () => {
    expect(oldThreadOf({ currentPhase: '1.8', outline: OLD_OUTLINE }, 'evidence-and-photos')).toEqual(FLAG);
  });

  it('a new thread that stopped on an error past the meeting holds a weave, and is not', () => {
    expect(oldThreadOf({ currentPhase: 'error', weave: WEAVE, outline: MAP, contentBundle: PREVIOUS_BUNDLE, articleApproved: true }, null)).toBeNull();
  });
});

// Fix round 2, finding 1: an outline or an article is not all an old thread past the arc
// writer holds. The old outline rework emptied the outline before it ran, and its catch left
// it empty, so a thread that stopped in that rework, on an error or killed, held neither and
// was resumed: past a fresh meeting, the map's stop opened with the old stage's note, edits,
// report, trace and counts, and a killed one's note turned the map check's rework into the
// director's send-back. A thread that stopped in the photo branch or in the old outline
// writer held neither as well, and its resume carried the old arc stage's counts into the
// fresh weave's round. Each of them holds an evaluation or a rework's count: the old arc
// stage evaluated its arcs before the arc stop opened, and every rework counts itself before
// it runs. A thread of the new code holds neither without a weave.
describe("4.11 fix round 2: a thread with no weave that holds an evaluation or a rework's count is old, at no stop too", () => {
  const FLAG = { message: MESSAGE, rollbackTo: 'arc-selection', rollbackPoints: MEETING_AND_BEFORE };
  const COUNTS = ['arcRevisionCount', 'humanArcRevisionCount', 'outlineRevisionCount', 'humanOutlineRevisionCount', 'articleRevisionCount', 'humanArticleRevisionCount'];
  /** What the old arc stage left: the evaluation it ran before the arc stop opened. */
  const ARCS_EVALUATED = [{ phase: 'arcs', ready: true }];
  /** The old outline stage's leftovers. Invented text. */
  const OLD_TRACE = [{ pass: 1, round: 1, trigger: 'evaluation', findings: { structuralIssues: ['T8: an old outline issue'] }, before: OLD_OUTLINE }];
  const OLD_EDITS = { kind: 'outline', issued: 1, edits: [{ id: 'E1', path: 'closing.theme', before: 'An older close.', after: "The director's close." }] };

  it.each([
    ['stopped on an error in the old outline rework, whose catch left the outline and its copy empty', {
      currentPhase: 'error', outline: null, _previousOutline: null, _outlineFeedback: null, contentBundle: null,
      outlineRevisionCount: 1, _outlineTrace: OLD_TRACE, _outlineHandEdits: OLD_EDITS,
      evaluationHistory: [...ARCS_EVALUATED, { phase: 'outline', ready: false }]
    }],
    ['was killed in the old outline send-back rework, the outline set aside for it', {
      currentPhase: '3.2', outline: null, _previousOutline: OLD_OUTLINE, _outlineFeedback: 'Cut the second arc.', _outlineHandEdits: OLD_EDITS,
      humanOutlineRevisionCount: 1, evaluationHistory: ARCS_EVALUATED
    }],
    ['stopped in the photo branch, after the arc stop', { currentPhase: 'error', evaluationHistory: ARCS_EVALUATED }],
    ['stopped in the old outline writer', { currentPhase: '3', evaluationHistory: ARCS_EVALUATED, arcRevisionCount: 2 }],
    ['stopped in the old arc rework, before anything was evaluated', { currentPhase: 'error', arcRevisionCount: 1 }]
  ])('a thread at no stop that %s is old', (_case, values) => {
    expect(oldThreadOf(values, null)).toEqual(FLAG);
  });

  it.each(COUNTS)('%s above zero alone makes it old', (count) => {
    expect(oldThreadOf({ currentPhase: 'error', [count]: 1 }, null)).toEqual(FLAG);
  });

  it('one evaluation alone makes it old, whatever its verdict', () => {
    expect(oldThreadOf({ currentPhase: 'error', evaluationHistory: [{ phase: 'arcs', ready: false }] }, null)).toEqual(FLAG);
  });

  it('a new thread with a weave that holds every one of them is not', () => {
    const values = { currentPhase: 'error', weave: WEAVE, evaluationHistory: ARCS_EVALUATED, outline: MAP, contentBundle: PREVIOUS_BUNDLE };
    COUNTS.forEach((count) => { values[count] = 1; });
    expect(oldThreadOf(values, null)).toBeNull();
  });

  it('reads the evaluations, the six counts, the outline and the article, each a channel of the state', () => {
    expect([...PAST_THE_ARC_WRITER].sort()).toEqual(['contentBundle', 'evaluationHistory', 'outline', ...COUNTS].sort());
    PAST_THE_ARC_WRITER.forEach((channel) => expect(ReportStateAnnotation.spec).toHaveProperty(channel));
  });

  it("the rule's premise: the fresh start, every rollback that clears the weave and an old thread's rollback to the meeting leave none of them, so a thread of the new code never holds one without a weave", () => {
    const clearsWeave = Object.keys(ROLLBACK_CLEARS).filter((point) => ROLLBACK_CLEARS[point].includes('weave'));
    expect([...clearsWeave].sort()).toEqual(MEETING_AND_BEFORE.filter((point) => point !== 'arc-selection').sort());
    // A thread that holds every one of them, and what each clear leaves of them.
    const holdingAll = { currentPhase: '4.25', weave: WEAVE, evaluationHistory: ARCS_EVALUATED, outline: MAP, contentBundle: PREVIOUS_BUNDLE };
    COUNTS.forEach((count) => { holdingAll[count] = 2; });
    const leftAfter = (update) => {
      const after = { ...holdingAll, ...update };
      return PAST_THE_ARC_WRITER.filter((channel) => (Array.isArray(after[channel]) ? after[channel].length > 0 : Boolean(after[channel])));
    };
    clearsWeave.forEach((point) => {
      const update = buildRollbackState(point);
      expect(isWeave({ ...holdingAll, ...update }.weave)).toBe(false);
      expect(`${point}: ${leftAfter(update)}`).toBe(`${point}: `);
      expect(oldThreadOf({ ...holdingAll, ...update }, null)).toBeNull();
    });
    expect(`fresh start: ${leftAfter(buildFreshStartState())}`).toBe('fresh start: ');
    // An old thread's rollback to the meeting writes the weave fresh: until the weave writer
    // succeeds, the thread holds none of them, so a failure there leaves it resumable.
    const meeting = { ...buildRollbackState('arc-selection'), ...oldThreadRollbackState('arc-selection', { ...holdingAll, weave: null }) };
    expect(`an old thread's meeting: ${leftAfter(meeting)}`).toBe("an old thread's meeting: ");
    expect(oldThreadOf({ ...holdingAll, weave: null, ...meeting }, null)).toBeNull();
  });

  // A rollback past the meeting appends a stub that marks the article's verdict stale
  // (lib/api-helpers.js buildRollbackState), whatever the thread holds. The route takes any
  // point for a thread that is not old, so a new thread whose weave writer failed and was
  // then rolled back there held the stub beside no weave. The stub is no evaluation, and the
  // thread stays resumable.
  it("a rollback's stub is no evaluation: no rollback point writes anything the rule reads into a thread that holds none of it", () => {
    const beforeTheWeave = { currentPhase: 'error', weave: null, evaluationHistory: [] };
    VALID_ROLLBACK_POINTS.forEach((point) => {
      const update = buildRollbackState(point);
      const after = { ...beforeTheWeave, ...update, evaluationHistory: appendSingleReducer(beforeTheWeave.evaluationHistory, update.evaluationHistory) };
      expect(`${point}: ${JSON.stringify(oldThreadOf(after, null))}`).toBe(`${point}: null`);
    });
    expect(buildRollbackState('photos').evaluationHistory).toEqual([expect.objectContaining({ phase: 'article', source: 'rollback' })]);
  });

  it("an old thread's evaluation beside a rollback's stub still makes it old", () => {
    expect(oldThreadOf({ currentPhase: 'error', evaluationHistory: [...ARCS_EVALUATED, ...buildRollbackState('outline').evaluationHistory] }, null)).toEqual(FLAG);
  });
});

describe("4.11: the refusal's body", () => {
  it('names the session, says the message as the error, and carries the flag', () => {
    const flag = oldThreadOf({ currentPhase: 'complete' }, null);
    expect(oldThreadRefusal('092626', flag)).toEqual({ sessionId: '092626', error: MESSAGE, oldThread: flag });
  });
});

// The rollback to the meeting keeps the meeting's counters (R9: it reopens as the director
// left it). An old thread left no meeting: its arc counters are the old arc stage's (on the
// stored threads, 0926262 holds arcRevisionCount 2 and 062126 humanArcRevisionCount 1), so
// the weave it writes fresh starts them over, as a rollback before the meeting does.
describe('4.11: an old thread rolled back to the meeting starts the arc counters over', () => {
  /** A thread from before the meeting, as server.js passes its state: the old stages' outline and counters. */
  const OLD_VALUES = { currentPhase: '2.36', theme: 'journalist', outline: OLD_OUTLINE, arcRevisionCount: 2, humanArcRevisionCount: 1 };

  it('the meeting point zeroes both arc counters, as the points before it do', () => {
    expect(oldThreadRollbackState('arc-selection', OLD_VALUES)).toEqual({ arcRevisionCount: 0, humanArcRevisionCount: 0 });
    expect(ROLLBACK_COUNTER_RESETS['evidence-and-photos']).toMatchObject(oldThreadRollbackState('arc-selection', OLD_VALUES));
    expect(ROLLBACK_COUNTER_RESETS['arc-selection']).not.toHaveProperty('arcRevisionCount');
  });

  it('every point before the meeting already resets them, so it adds nothing there', () => {
    MEETING_AND_BEFORE.filter((point) => point !== 'arc-selection').forEach((point) => {
      expect(`${point}: ${JSON.stringify(oldThreadRollbackState(point, OLD_VALUES))}`).toBe(`${point}: {}`);
    });
  });

  // Fix round 3 (Review focus 4): without the thread's state the rollback cannot tell phase 4's
  // shapes, and would keep an old-shape weave for the new stages to replay on. So the state is
  // required, at every point, and a call without it fails loud, naming the function.
  it("throws, naming itself, when it is not given the thread's state, at every point", () => {
    [undefined, null, 'state', 3, ['weave']].forEach((values) => {
      [...MEETING_AND_BEFORE, ...PAST_THE_MEETING].forEach((point) => {
        expect(() => oldThreadRollbackState(point, values)).toThrow(/^oldThreadRollbackState needs the thread's state values/);
      });
    });
    // An old-shape weave the call could not see would have stayed: given the state, it goes.
    const holding = { currentPhase: '3.25', theme: 'journalist', ...oldShapeMeetingChannels(), outline: oldShapeMap() };
    expect(oldThreadRollbackState('arc-selection', holding)).toMatchObject({ weave: null });
  });
});

// Phase 4b, brief 1G (spec 2026-10-05 section 10; ruling R9): a session paused at the story
// meeting or a later stop when the story level lands holds a weave and a map in phase 4's
// shapes, which every new gate refuses. The guard reads the shapes too: a weave with a thread
// that has no line, or a map with a beat that has no move. Such a thread gets its own message
// and the same rollback to the meeting, which writes the weave fresh. There is no conversion.
describe('1G: the old shapes, one test each', () => {
  const NEW_WEAVE = reworkFixtureState('journalist').weave;

  it('a weave whose threads have no line is in the old shape, and so is one with a single such thread', () => {
    expect(isOldShapeWeave(OLD_SHAPE_WEAVE)).toBe(true);
    expect(isOldShapeWeave({ ...NEW_WEAVE, threads: [...NEW_WEAVE.threads, OLD_SHAPE_WEAVE.threads[0]] })).toBe(true);
  });

  it('a weave in the new shape is not, a thread the director added with no evidence among its threads', () => {
    expect(isOldShapeWeave(NEW_WEAVE)).toBe(false);
    const added = { id: 't9', name: 'The test run', line: 'The director added this thread at the meeting.', role: 'complicates-it' };
    expect(isOldShapeWeave({ ...NEW_WEAVE, threads: [...NEW_WEAVE.threads, added] })).toBe(false);
  });

  it('a value that is no weave is no weave in the old shape', () => {
    [undefined, null, {}, { story: 'No threads.' }, [], 'a weave'].forEach((value) => {
      expect(`${JSON.stringify(value)}: ${isOldShapeWeave(value)}`).toBe(`${JSON.stringify(value)}: false`);
    });
  });

  it('a map with a beat that has no move is in the old shape, in a section or in left out', () => {
    expect(isOldShapeMap(OLD_SHAPE_MAP)).toBe(true);
    const leftOutOnly = { ...MAP, leftOut: [...(MAP.leftOut || []), OLD_SHAPE_MAP.leftOut[0]] };
    expect(isOldShapeMap(leftOutOnly)).toBe(true);
    const inASection = { ...MAP, sections: MAP.sections.map((section, i) => (i === 0 ? { ...section, beats: [...section.beats, OLD_SHAPE_MAP.sections[1].beats[0]] } : section)) };
    expect(isOldShapeMap(inASection)).toBe(true);
  });

  it('a map in the new shape is not, a beat the director added with its move and players among its beats', () => {
    expect(isOldShapeMap(MAP)).toBe(false);
    const added = { id: 'b20', move: 'The director added this move.', players: ['Riley'] };
    expect(isOldShapeMap({ ...MAP, sections: MAP.sections.map((section, i) => (i === 0 ? { ...section, beats: [...section.beats, added] } : section)) })).toBe(false);
  });

  it('a value that is no map is no map in the old shape: the outline from before phase 4, a map with no beat, nothing', () => {
    [undefined, null, {}, OLD_OUTLINE, { sections: [] }, { sections: [{ slot: 'lede', beats: [] }], leftOut: [] }].forEach((value) => {
      expect(`${JSON.stringify(value)}: ${isOldShapeMap(value)}`).toBe(`${JSON.stringify(value)}: false`);
    });
  });
});

describe('1G: which thread is on the old shapes', () => {
  const NEW_WEAVE = reworkFixtureState('journalist').weave;
  const SHAPES_FLAG = { message: OLD_SHAPES_MESSAGE, rollbackTo: 'arc-selection', rollbackPoints: MEETING_AND_BEFORE };
  const FLAG = { message: MESSAGE, rollbackTo: 'arc-selection', rollbackPoints: MEETING_AND_BEFORE };

  it("the message is the brief's, word for word, one constant beside the other", () => {
    expect(OLD_SHAPES_MESSAGE).toBe("This session's story meeting was written before the story level. Roll back to the story meeting to write it again.");
    expect(OLD_SHAPES_MESSAGE).not.toBe(OLD_THREAD_MESSAGE);
  });

  it('a thread paused at the meeting on the old weave is flagged, with the old-shape message', () => {
    expect(oldThreadOf({ currentPhase: '2.35', ...oldShapeMeetingChannels() }, 'arc-selection')).toEqual(SHAPES_FLAG);
  });

  it.each(PAST_THE_MEETING)('a thread paused at %s on the old weave and map is flagged', (stop) => {
    expect(oldThreadOf({ currentPhase: '3.25', ...oldShapeMapChannels() }, stop)).toEqual(SHAPES_FLAG);
  });

  it.each(['arc-selection', ...PAST_THE_MEETING])('a thread paused at %s on the old map alone, beside a weave in the new shape, is flagged', (stop) => {
    expect(oldThreadOf({ currentPhase: '3.25', weave: NEW_WEAVE, outline: oldShapeMap() }, stop)).toEqual(SHAPES_FLAG);
  });

  it('a complete thread on the old shapes is flagged, and so is one at no stop after an error, or killed mid-run', () => {
    expect(oldThreadOf({ ...oldShapeMapChannels(), currentPhase: 'complete', contentBundle: PREVIOUS_BUNDLE }, null)).toEqual(SHAPES_FLAG);
    expect(oldThreadOf({ ...oldShapeMapChannels(), currentPhase: 'error' }, null)).toEqual(SHAPES_FLAG);
    expect(oldThreadOf({ ...oldShapeMeetingChannels(), currentPhase: '2.2' }, null)).toEqual(SHAPES_FLAG);
  });

  it.each(['arc-selection', ...PAST_THE_MEETING])('a thread paused at %s on the new shapes is not', (stop) => {
    expect(oldThreadOf({ currentPhase: '3.25', weave: NEW_WEAVE, outline: MAP }, stop)).toBeNull();
    expect(oldThreadOf({ currentPhase: '2.35', weave: NEW_WEAVE, outline: null }, stop)).toBeNull();
  });

  it('a thread with no weave keeps the message it had, an old-shape map beside it included', () => {
    expect(oldThreadOf({ currentPhase: 'complete' }, null)).toEqual(FLAG);
    expect(oldThreadOf({ currentPhase: 'error', outline: oldShapeMap() }, null)).toEqual(FLAG);
    expect(oldThreadOf({ currentPhase: '3.25', weave: null, outline: oldShapeMap() }, 'outline')).toEqual(FLAG);
  });

  it.each(MEETING_AND_BEFORE.filter((stop) => stop !== 'arc-selection'))('a thread paused at %s, before the meeting, holding no weave and no map, is not', (stop) => {
    expect(oldThreadOf({ currentPhase: '1.8', weave: null, outline: null }, stop)).toBeNull();
  });

  it("the rule's premise: every rollback point above the meeting clears the weave and the map, so a thread paused before the meeting holds neither", () => {
    MEETING_AND_BEFORE.filter((point) => point !== 'arc-selection').forEach((point) => {
      const after = { currentPhase: '3.25', ...oldShapeMapChannels(), ...buildRollbackState(point) };
      expect(`${point}: ${isWeave(after.weave)} ${after.outline}`).toBe(`${point}: false null`);
      expect(`${point}: ${JSON.stringify(oldThreadOf(after, point))}`).toBe(`${point}: null`);
    });
  });
});

// The rollback to the meeting keeps the weave as the director left it (R9), so a thread on
// the old shapes needs more: the weave and everything read with it go, so the weave writer
// runs fresh, and so does everything after it. The map's and the article's channels are the
// meeting point's own list in the rollback table, which buildRollbackState applies.
describe("1G: the rollback to the meeting writes an old-shape thread's weave fresh", () => {
  const holding = () => ({
    currentPhase: '3.25', ...oldShapeMapChannels(),
    contentBundle: PREVIOUS_BUNDLE, articleApproved: true, evaluationHistory: [{ phase: 'arcs', ready: true }],
    arcRevisionCount: 1, humanArcRevisionCount: 2, outlineRevisionCount: 1, humanOutlineRevisionCount: 1,
    directorGateNotes: [{ gate: 'arc-selection', kind: 'approval', round: 1, stopRound: 1, text: 'Keep the vote first.', at: 'then' }],
    characterIdMappings: { 'p1.jpg': { characters: ['Alex'], exclude: false } },
    photoDescriptions: { 'p1.jpg': 'Alex at the bar.' },
    leftOutPhotos: ['p2.jpg'],
    photosPath: 'D:/shoots/1004'
  });
  const rolledBack = (values) => ({ ...values, ...buildRollbackState('arc-selection'), ...oldThreadRollbackState('arc-selection', values) });

  it("names the weave, its baseline, the director's weave edits and the checks' mark as the weave's channels, each a channel the meeting's point keeps", () => {
    expect([...OLD_SHAPES_WEAVE_CHANNELS].sort()).toEqual(['_arcValidation', '_weaveBaseline', '_weaveHandEdits', 'weave'].sort());
    OLD_SHAPES_WEAVE_CHANNELS.forEach((channel) => expect(ReportStateAnnotation.spec).toHaveProperty(channel));
    OLD_SHAPES_WEAVE_CHANNELS.forEach((channel) => expect(`${channel}: ${ROLLBACK_CLEARS['arc-selection'].includes(channel)}`).toBe(`${channel}: false`));
  });

  it('clears the weave and its channels and starts the arc counters over', () => {
    expect(oldThreadRollbackState('arc-selection', holding())).toEqual({
      arcRevisionCount: 0, humanArcRevisionCount: 0, weave: null, _weaveBaseline: null, _weaveHandEdits: null, _arcValidation: null
    });
  });

  it("with the meeting point's list, it clears the weave, its baseline, the director's edits, marks and report, the fact check's and the checks' marks, the map and its channels, and the article", () => {
    const after = rolledBack(holding());
    [...ROLLBACK_CLEARS['arc-selection'], ...OLD_SHAPES_WEAVE_CHANNELS].forEach((channel) => {
      const cleared = channel === 'evaluationHistory' ? [] : null;
      expect(`${channel}: ${JSON.stringify(after[channel])}`).toBe(`${channel}: ${JSON.stringify(cleared)}`);
    });
    ['weave', '_weaveBaseline', '_weaveHandEdits', '_weaveMarks', '_weaveHandEditReport', '_arcValidation', 'meetingApproved', '_meetingRound',
      'outline', '_mapBaseline', '_outlineHandEdits', '_mapCheck', 'heroImage', 'contentBundle', 'articleApproved']
      .forEach((channel) => expect(`${channel}: ${ROLLBACK_CLEARS['arc-selection'].includes(channel) || OLD_SHAPES_WEAVE_CHANNELS.includes(channel)}`).toBe(`${channel}: true`));
    expect(after).toMatchObject({ arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: 0, humanOutlineRevisionCount: 0 });
  });

  it("keeps the director's notes and the photo stops' choices", () => {
    const values = holding();
    const after = rolledBack(values);
    ['directorGateNotes', 'characterIdMappings', 'photoDescriptions', 'leftOutPhotos', 'photosPath'].forEach((channel) => {
      expect(after[channel]).toEqual(values[channel]);
    });
  });

  it('leaves the thread holding nothing the guard reads, so the weave writer runs and a failure there leaves it resumable', () => {
    const after = rolledBack(holding());
    expect(isWeave(after.weave)).toBe(false);
    expect(oldThreadOf(after, null)).toBeNull();
  });

  it('a thread at the meeting on the old weave alone gets the same', () => {
    const values = { currentPhase: '2.35', ...oldShapeMeetingChannels(), arcRevisionCount: 1 };
    expect(oldThreadRollbackState('arc-selection', values)).toEqual({
      arcRevisionCount: 0, humanArcRevisionCount: 0, weave: null, _weaveBaseline: null, _weaveHandEdits: null, _arcValidation: null
    });
  });

  it('a thread with no weave gets what it got before: the arc counters alone', () => {
    expect(oldThreadRollbackState('arc-selection', { currentPhase: 'complete', outline: OLD_OUTLINE })).toEqual({ arcRevisionCount: 0, humanArcRevisionCount: 0 });
    expect(oldThreadRollbackState('arc-selection', { currentPhase: 'error', outline: oldShapeMap() })).toEqual({ arcRevisionCount: 0, humanArcRevisionCount: 0 });
  });

  it('every point before the meeting already clears the weave and the map, so it adds nothing there', () => {
    MEETING_AND_BEFORE.filter((point) => point !== 'arc-selection').forEach((point) => {
      expect(`${point}: ${JSON.stringify(oldThreadRollbackState(point, holding()))}`).toBe(`${point}: {}`);
    });
  });

  it('a fresh weave in the new shape leaves the thread alone; one in the old shape would not', () => {
    expect(oldThreadOf({ ...rolledBack(holding()), weave: reworkFixtureState('journalist').weave }, 'arc-selection')).toBeNull();
    expect(oldThreadOf({ ...rolledBack(holding()), weave: oldShapeWeave() }, 'arc-selection')).not.toBeNull();
  });
});
