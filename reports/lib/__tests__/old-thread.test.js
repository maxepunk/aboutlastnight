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
  OLD_THREAD_ROLLBACK,
  OLD_THREAD_ROLLBACK_POINTS,
  PAST_THE_ARC_WRITER,
  oldThreadOf,
  oldThreadRefusal,
  oldThreadRollbackState
} = require('../old-thread');
const { CHECKPOINT_ORDER } = require('../../console/session-start-logic');
const { ReportStateAnnotation, VALID_ROLLBACK_POINTS, ROLLBACK_COUNTER_RESETS, ROLLBACK_CLEARS } = require('../workflow/state');
const { buildRollbackState, buildFreshStartState } = require('../api-helpers');
const { isWeave } = require('../weave');
const { reworkFixtureState, MAP, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');

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
    const meeting = { ...buildRollbackState('arc-selection'), ...oldThreadRollbackState('arc-selection') };
    expect(`an old thread's meeting: ${leftAfter(meeting)}`).toBe("an old thread's meeting: ");
    expect(oldThreadOf({ ...holdingAll, weave: null, ...meeting }, null)).toBeNull();
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
  it('the meeting point zeroes both arc counters, as the points before it do', () => {
    expect(oldThreadRollbackState('arc-selection')).toEqual({ arcRevisionCount: 0, humanArcRevisionCount: 0 });
    expect(ROLLBACK_COUNTER_RESETS['evidence-and-photos']).toMatchObject(oldThreadRollbackState('arc-selection'));
    expect(ROLLBACK_COUNTER_RESETS['arc-selection']).not.toHaveProperty('arcRevisionCount');
  });

  it('every point before the meeting already resets them, so it adds nothing there', () => {
    MEETING_AND_BEFORE.filter((point) => point !== 'arc-selection').forEach((point) => {
      expect(`${point}: ${JSON.stringify(oldThreadRollbackState(point))}`).toBe(`${point}: {}`);
    });
  });
});
