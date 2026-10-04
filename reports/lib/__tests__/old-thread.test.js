/**
 * Threads from before the story meeting (phase 4, task 4.11; R2).
 *
 * A thread started before phase 4 holds no weave. Once it has reached the story meeting's
 * stop, or anything after it, the new stages would replay it on the old shapes, so the
 * server refuses it and tells the director to roll back to the story meeting, which keeps
 * the parse, the curation and the photos and writes the weave fresh. The rule is
 * lib/old-thread.js's, by the weave and by the thread's stop in the console's
 * CHECKPOINT_ORDER (ruling 1: detect by the weave).
 */
const {
  OLD_THREAD_MESSAGE,
  OLD_THREAD_ROLLBACK,
  OLD_THREAD_ROLLBACK_POINTS,
  oldThreadOf,
  oldThreadRefusal,
  oldThreadRollbackState
} = require('../old-thread');
const { CHECKPOINT_ORDER } = require('../../console/session-start-logic');
const { VALID_ROLLBACK_POINTS, ROLLBACK_COUNTER_RESETS } = require('../workflow/state');
const { reworkFixtureState } = require('./fixtures/rework-state');

const WEAVE = reworkFixtureState('journalist').weave;
const MESSAGE = 'This session was started before the story meeting. Roll back to the story meeting to continue.';
const MEETING_AND_BEFORE = ['paper-evidence-selection', 'await-roster', 'await-full-context', 'input-review', 'pre-curation', 'evidence-and-photos', 'arc-selection'];
const PAST_THE_MEETING = ['photos', 'character-ids', 'outline', 'article'];

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

  it('a thread at no stop and not complete is not: a run in flight, or one that stopped without a pause', () => {
    expect(oldThreadOf({ currentPhase: '2.1' }, null)).toBeNull();
    expect(oldThreadOf({ currentPhase: 'error' }, null)).toBeNull();
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
