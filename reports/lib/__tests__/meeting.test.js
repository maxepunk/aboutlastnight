/**
 * The story meeting's plumbing (phase 4, brief 4.5; spec 4.3 and 4.4; R12).
 *
 * - The director-side schema: the weave as the director leaves it, derived in code from
 *   the writer's, allowing answers and struck connections; never sent to the SDK.
 * - The meeting's payloads: approve, reweave and send back, each validated against it,
 *   and what each writes: the director's version, the standing edits against the writer's
 *   last weave, the round mark, the note.
 * - What the stop shows: a code check still failing on the weave in hand, the concerns
 *   beside their lines, the marks after a round, a round that did not run.
 *
 * Invented text: the repo is public.
 */

const Ajv = require('ajv');
const {
  DIRECTOR_WEAVE_SCHEMA, MEETING_ACTIONS, directorWeaveProblems, meetingResume,
  meetingCheckFailures, meetingConcerns, meetingMarksOf, roundDidNotRunOf
} = require('../meeting');
const { WEAVE_SCHEMA } = require('../sdk-client/subagents');
const { WEAVE: FIXTURE_WEAVE, reworkFixtureState } = require('./fixtures/rework-state');
const { weaveKey, withFactCheckMark, WEAVE_CHECKS_SOURCE } = require('../weave');
const { standingAtMeeting, DIRECTOR_EDIT_PREFIX } = require('../hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));

/** The writer's weave, judged, as the meeting shows it. */
const shown = () => withFactCheckMark(clone(FIXTURE_WEAVE), { at: '2026-10-03T10:00:00.000Z', ready: true, fixes: 0 });

/** The director's version: a role changed, a thread added with no receipt, a connection struck, a question answered. */
function leftByDirector() {
  const weave = clone(FIXTURE_WEAVE);
  weave.threads = weave.threads.map((t) => (t.id === 't3' ? { ...t, role: 'mirrors-it' } : t));
  weave.threads.push({ id: 't6', claim: 'Riley kept a second ledger.', role: 'grounds-it' });
  weave.connections = weave.connections.map((c) => (c.id === 'c2' ? { ...c, struck: true } : c));
  weave.questions = weave.questions.map((q) => ({ ...q, answer: 'Sarah ran the bar all morning.' }));
  return weave;
}

/** The meeting's stop, as the state holds it before the director acts. */
const atMeeting = (overrides = {}) => ({ ...reworkFixtureState('journalist'), weave: shown(), _weaveBaseline: clone(FIXTURE_WEAVE), ...overrides });

describe("the director-side schema (R12)", () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(DIRECTOR_WEAVE_SCHEMA);

  it("is derived from the writer's schema: the same fields and requirements, with the answer and the strike the director adds", () => {
    expect(DIRECTOR_WEAVE_SCHEMA).not.toBe(WEAVE_SCHEMA);
    expect(DIRECTOR_WEAVE_SCHEMA.required).toEqual(WEAVE_SCHEMA.required);
    expect(Object.keys(DIRECTOR_WEAVE_SCHEMA.properties)).toEqual(Object.keys(WEAVE_SCHEMA.properties));
    expect(DIRECTOR_WEAVE_SCHEMA.properties.questions.items.properties.answer).toMatchObject({ type: 'string' });
    expect(DIRECTOR_WEAVE_SCHEMA.properties.connections.items.properties.struck).toMatchObject({ type: 'boolean' });
    expect(DIRECTOR_WEAVE_SCHEMA.properties.threads.items.required).toEqual(['id', 'claim', 'role']);
  });

  it("leaves the writer's schema as it is: no model writes an answer or a strike", () => {
    expect(WEAVE_SCHEMA.properties.questions.items.properties).not.toHaveProperty('answer');
    expect(WEAVE_SCHEMA.properties.connections.items.properties).not.toHaveProperty('struck');
  });

  it('accepts the weave as the director left it: a thread added or re-roled with no receipt and no reason, a struck connection, an answer', () => {
    const left = leftByDirector();
    left.threads = left.threads.map((t) => (t.id === 't2' ? { id: 't2', claim: t.claim, role: 'left-out' } : t));
    expect(validate(left)).toBe(true);
    expect(directorWeaveProblems(left)).toBeNull();
  });

  it.each([
    ['an answer that is not text', (w) => { w.questions[0].answer = 42; }, /questions\/0\/answer/],
    ['a strike that is not true or false', (w) => { w.connections[0].struck = 'yes'; }, /connections\/0\/struck/],
    ['a role the weave does not have', (w) => { w.threads[0].role = 'supports-it'; }, /threads\/0\/role/],
    ['no story', (w) => { delete w.story; }, /story/],
    ['a thread with no claim', (w) => { delete w.threads[1].claim; }, /threads\/1.*claim/]
  ])('refuses %s, saying where', (_name, change, where) => {
    const left = leftByDirector();
    change(left);
    expect(directorWeaveProblems(left)).toMatch(where);
  });

  it('refuses anything that is not a weave', () => {
    expect(directorWeaveProblems(null)).toMatch(/weave/);
    expect(directorWeaveProblems({ story: 'x' })).toMatch(/threads/);
  });

  // Ruling 3: every id join at the meeting (the edits, the strikes, the answers) reads ids,
  // so the director's changes give each thread, connection and question an id of its own.
  // Fix round 1, finding 2: the refusal says who made the repeat.
  it("refuses the repeats the director's changes made, naming each and the director", () => {
    const doubled = clone(FIXTURE_WEAVE);
    doubled.threads.push({ id: 't3', claim: 'A thread the director added under a taken id.', role: 'grounds-it' });
    doubled.connections.push({ ...clone(FIXTURE_WEAVE.connections[0]) });
    doubled.questions.push({ ...clone(FIXTURE_WEAVE.questions[0]) });
    // 4.5b: the remedy keeps the ids the meeting showed, so it works when the director's
    // element sits under an id the writer's elements hold too.
    const theirs = 'Two threads share the id "t3"; two connections share the id "c1"; two questions share the id "q1": the director\'s changes made these repeats. Keep the ids the meeting showed, and give each one the director added an id of its own.';
    expect(directorWeaveProblems(doubled, { shown: clone(FIXTURE_WEAVE) })).toBe(theirs);
    // With no weave shown to tell them apart, every repeat counts as the director's.
    expect(directorWeaveProblems(doubled)).toBe(theirs);
    expect(directorWeaveProblems(clone(FIXTURE_WEAVE))).toBeNull();
  });

  // Fix round 1, finding 3: the gate reads an id as the checks and the diff do (lib/weave.js
  // weaveIdOf and repeatedIds), so no weave passes the gate with a repeat the diff would
  // have to resolve.
  it('reads an id as the checks and the diff do: "t6" and "t6 " are one id', () => {
    const left = leftByDirector();
    left.threads.push({ id: 't6 ', claim: 'Riley burned the second ledger.', role: 'grounds-it' });
    expect(directorWeaveProblems(left)).toMatch(/threads share the id "t6"/);
  });
});

// Fix round 1, finding 2: a repeat the writer made (the fact check's fix can add a thread
// under a taken id, and no check rework follows the fix) is the writer's defect, which the
// checks report. Refusing it would leave the meeting with no working action, since the
// meeting offers no id editing. The gate lets every action through while the director
// leaves the elements under it as the meeting showed them, so a reweave or a send-back can
// fix it, and refuses only a change under it, which no edit could find by its id.
describe('a repeated id the writer made (fix round 1, finding 2)', () => {
  /** The writer's weave with a second thread under t2, as the fact check's fix might leave it. */
  const writersRepeat = () => {
    const weave = clone(FIXTURE_WEAVE);
    weave.threads.push({ id: 't2', claim: 'A second thread the fix put under a taken id.', role: 'grounds-it', receipt: 'ledger' });
    return weave;
  };
  const atRepeat = () => atMeeting({ weave: withFactCheckMark(writersRepeat(), { at: 't', ready: true, fixes: 1 }), _weaveBaseline: writersRepeat() });

  it.each([
    ['an approve', { meeting: 'approve', weave: writersRepeat() }],
    // 4.5b: a reweave that carries no edit and no note is refused as empty, so this one
    // carries the note that asks for the fix.
    ['a reweave that carries a note', { meeting: 'reweave', weave: writersRepeat(), note: 'Give the two money threads ids of their own.' }],
    ['a send-back that carries only a note', { meeting: 'send-back', note: 'Give the two money threads ids of their own.' }]
  ])('lets %s through while the director leaves those threads as the meeting showed them', (_name, approvals) => {
    const result = meetingResume(approvals, atRepeat());
    expect(result.error).toBeNull();
    expect(result.stateUpdates.weave.threads.filter((t) => t.id === 't2')).toHaveLength(2);
  });

  it("lets the director's other changes through beside it, as edits", () => {
    const left = writersRepeat();
    left.threads = left.threads.map((t) => (t.id === 't3' ? { ...t, role: 'mirrors-it' } : t));
    left.questions = left.questions.map((q) => ({ ...q, answer: 'Sarah ran the bar.' }));
    const result = meetingResume({ meeting: 'reweave', weave: left }, atRepeat());
    expect(result.error).toBeNull();
    expect(result.stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t3].role']);
  });

  it('refuses a change under it, naming the writer and saying how to go on', () => {
    const left = writersRepeat();
    left.threads[left.threads.length - 1].role = 'mirrors-it';
    const { error, stateUpdates } = meetingResume({ meeting: 'approve', weave: left }, atRepeat());
    // 4.5b: the remedy names only what works: a reweave with no other change and no note is
    // refused as empty, so the reweave carries a note.
    expect(error).toBe('The writer gave two threads the id "t2", so the meeting cannot tell which of them the director changed. Leave them as the meeting showed them, and send the weave back or reweave it with a note: the rework gives each an id of its own.');
    expect(stateUpdates).toEqual({});
  });

  it('refuses a repeat the director made beside it, naming the director', () => {
    const left = writersRepeat();
    left.threads.push({ id: 't3', claim: 'A thread the director put under a taken id.', role: 'grounds-it' });
    expect(meetingResume({ meeting: 'approve', weave: left }, atRepeat()).error)
      .toBe('Two threads share the id "t3": the director\'s changes made this repeat. Keep the ids the meeting showed, and give each one the director added an id of its own.');
  });
});

describe("the meeting's payloads (brief 4.5)", () => {
  it('names its three actions', () => {
    expect([...MEETING_ACTIONS]).toEqual(['approve', 'reweave', 'send-back']);
  });

  describe('approve', () => {
    it('carries the weave as the director left it and a note; resumes as an approval and writes no round mark', () => {
      const result = meetingResume({ meeting: 'approve', weave: leftByDirector(), note: '  Lead with the vote.  ' }, atMeeting());
      expect(result.error).toBeNull();
      expect(result.resume).toEqual({ approved: true });
      expect(result.note).toEqual({ text: 'Lead with the vote.', kind: 'approval' });
      expect(result.stateUpdates.weave).toMatchObject(leftByDirector());
      expect(result.stateUpdates).not.toHaveProperty('_meetingRound');
      expect(result.stateUpdates).not.toHaveProperty('_outlineGuidance');
      expect(result.stateUpdates).not.toHaveProperty('selectedArcs');
    });

    it("keeps the shown weave's fact-check mark on the director's version, and takes no code-owned key from the console", () => {
      const left = { ...leftByDirector(), _factCheck: { at: 'forged', ready: true, fixes: 9 }, _other: 1 };
      const { stateUpdates } = meetingResume({ meeting: 'approve', weave: left }, atMeeting());
      expect(stateUpdates.weave._factCheck).toEqual(shown()._factCheck);
      expect(stateUpdates.weave).not.toHaveProperty('_other');
    });

    it("diffs the director's version against the writer's last weave, and the edits stand by id", () => {
      const { stateUpdates } = meetingResume({ meeting: 'approve', weave: leftByDirector() }, atMeeting());
      expect(stateUpdates._weaveHandEdits.edits.map((e) => [e.id, e.path])).toEqual([
        ['E1', 'threads[#t3].role'], ['E2', 'threads[#t6]'], ['E3', 'connections[#c2]']
      ]);
    });

    it('diffs against the shown weave when the thread holds no baseline (a weave from before this slice)', () => {
      const { stateUpdates } = meetingResume({ meeting: 'approve', weave: leftByDirector() }, atMeeting({ _weaveBaseline: null }));
      expect(stateUpdates._weaveHandEdits.edits).toHaveLength(3);
    });

    it('refuses an approve with no weave', () => {
      expect(meetingResume({ meeting: 'approve' }, atMeeting()).error).toMatch(/weave/);
    });
  });

  describe('reweave', () => {
    it("carries the weave as left and an optional note, marks the round, and opens it: the report and the marks start over", () => {
      const result = meetingResume({ meeting: 'reweave', weave: leftByDirector() }, atMeeting({ _weaveHandEditReport: { checked: ['E1'], changed: [] }, _weaveMarks: { round: 'reweave' } }));
      expect(result.error).toBeNull();
      expect(result.resume).toEqual({ approved: false, round: 'reweave' });
      expect(result.note).toBeNull();
      expect(result.stateUpdates).toMatchObject({ _meetingRound: 'reweave', _arcFeedback: null, _weaveHandEditReport: null, _weaveMarks: null });
      expect(result.stateUpdates.weave.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
      const noted = meetingResume({ meeting: 'reweave', weave: leftByDirector(), note: 'Join the ledger thread to the vote.' }, atMeeting());
      expect(noted.stateUpdates._arcFeedback).toBe('Join the ledger thread to the vote.');
      expect(noted.resume.feedback).toBe('Join the ledger thread to the vote.');
      expect(noted.note).toEqual({ text: 'Join the ledger thread to the vote.', kind: 'rejection' });
    });

    it('refuses a reweave with no weave', () => {
      expect(meetingResume({ meeting: 'reweave' }, atMeeting()).error).toMatch(/weave/);
    });
  });

  describe('send back', () => {
    it("carries a note, and the shown weave when the director edited nothing", () => {
      const result = meetingResume({ meeting: 'send-back', note: 'Rethink the money thread.' }, atMeeting());
      expect(result.error).toBeNull();
      expect(result.resume).toEqual({ approved: false, round: 'send-back', feedback: 'Rethink the money thread.' });
      expect(result.stateUpdates).toMatchObject({ _meetingRound: 'send-back', _arcFeedback: 'Rethink the money thread.' });
      expect(result.stateUpdates.weave).toEqual(shown());
      expect(result.stateUpdates._weaveHandEdits).toBeNull();
    });

    it('carries the weave as left when the director edited it', () => {
      const result = meetingResume({ meeting: 'send-back', note: 'Rethink it.', weave: leftByDirector() }, atMeeting());
      expect(result.stateUpdates._weaveHandEdits.edits).toHaveLength(3);
    });

    it('refuses a send-back with no note', () => {
      expect(meetingResume({ meeting: 'send-back', note: '   ' }, atMeeting()).error).toMatch(/note/);
      expect(meetingResume({ meeting: 'send-back', weave: leftByDirector() }, atMeeting()).error).toMatch(/note/);
    });
  });

  it.each([
    ['an action the meeting does not take', { meeting: 'select', weave: leftByDirector() }, /approve, reweave or send-back/],
    ['a note that is not text', { meeting: 'approve', weave: leftByDirector(), note: 7 }, /note/],
    ['a weave the director-side schema refuses', { meeting: 'approve', weave: { ...leftByDirector(), threads: 'none' } }, /threads/]
  ])('refuses %s, with its reason, and writes nothing', (_name, approvals, reason) => {
    const result = meetingResume(approvals, atMeeting());
    expect(result.error).toMatch(reason);
    expect(result.stateUpdates).toEqual({});
  });
});

describe('what the stop shows (brief 4.5)', () => {
  it('a code check still failing, only when it was run on the weave in hand (ruling 7)', () => {
    const failures = [{ type: 'receipt-not-in-record', message: 'Thread "t2" gives the receipt "zzz".' }];
    const state = atMeeting({ _arcValidation: { weaveKey: weaveKey(shown()), passed: false, failures, concerns: [] } });
    expect(meetingCheckFailures(state)).toEqual(failures);
    expect(meetingCheckFailures({ ...state, _arcValidation: { ...state._arcValidation, weaveKey: 'another-weave' } })).toEqual([]);
    expect(meetingCheckFailures({ ...state, _arcValidation: { ...state._arcValidation, passed: true } })).toEqual([]);
    expect(meetingCheckFailures(atMeeting())).toEqual([]);
  });

  it("the concerns: the checks' and the fact check's, each beside the line of the edit it is about", () => {
    const left = leftByDirector();
    left.threads = left.threads.map((t) => (t.id === 't6' ? { ...t, receipt: 'zzz999' } : t));
    const edits = standingAtMeeting(null, FIXTURE_WEAVE, left);
    const checkConcern = `${DIRECTOR_EDIT_PREFIX}E2: Thread "t6" gives the receipt "zzz999", which names no document in the record.`;
    const judgeConcern = `${DIRECTOR_EDIT_PREFIX}E1: T1: the new role puts weight the record does not carry.`;
    const weave = withFactCheckMark(left, { at: 't', ready: true, fixes: 0, concerns: [judgeConcern] });
    const state = atMeeting({
      weave, _weaveHandEdits: edits,
      _arcValidation: { weaveKey: weaveKey(weave), passed: true, failures: [], concerns: [checkConcern] }
    });
    expect(meetingConcerns(state)).toEqual([
      { text: checkConcern, editIds: ['E2'], places: [{ id: 'E2', path: 'threads[#t6]', where: 'thread "t6", added' }] },
      { text: judgeConcern, editIds: ['E1'], places: [{ id: 'E1', path: 'threads[#t3].role', where: 'thread "t3", role' }] }
    ]);
    // A concern about an edit the weave no longer carries is not shown.
    const undone = { ...weave, threads: weave.threads.map((t) => (t.id === 't3' ? { ...t, role: 'complicates-it' } : t)) };
    expect(meetingConcerns({ ...state, weave: undone }).map((c) => c.editIds)).toEqual([]);
  });

  it("the marks after a round: what the rework changed from the director's version, and the round", () => {
    const rewoven = { ...leftByDirector(), headline: 'A headline the reweave wrote.' };
    const marks = meetingMarksOf(atMeeting({ weave: rewoven, _weaveMarks: { round: 'reweave', from: leftByDirector(), at: 't' } }));
    expect(marks).toEqual({ round: 'reweave', marks: [{ path: 'headline', where: 'headline', before: FIXTURE_WEAVE.headline, after: 'A headline the reweave wrote.' }] });
    expect(meetingMarksOf(atMeeting())).toBeNull();
  });

  it("a round that did not run: the reweave or send-back whose rework timed out", () => {
    expect(roundDidNotRunOf({ _arcReworkTimeout: { consecutive: 1, attempt: 0, at: 't', round: 'reweave' } })).toEqual({ round: 'reweave', at: 't', note: null });
    expect(roundDidNotRunOf({ _arcReworkTimeout: { consecutive: 1, attempt: 0, at: 't', round: 'send-back', note: 'Rethink it.' } })).toEqual({ round: 'send-back', at: 't', note: 'Rethink it.' });
    expect(roundDidNotRunOf({ _arcReworkTimeout: { consecutive: 1, attempt: 1, at: 't' } })).toBeNull();
    expect(roundDidNotRunOf({})).toBeNull();
  });

  it('the checks stamp the source the meeting reads', () => {
    expect(WEAVE_CHECKS_SOURCE).toBe('weave-checks');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5b: who made a repeat, and the empty reweave
// ═══════════════════════════════════════════════════════════════════════════

// Each id's count in the weave the meeting showed against its count in the director's
// version says who made a repeat: an id that occurs more often in the director's version is
// the director's repeat. Read by whether the shown weave repeated the id at all, a third t2
// the director added over the writer's two read as the writer's repeat (4.5 re-review).
describe("4.5b: who made a repeat, read from each id's count", () => {
  const writersRepeat = () => {
    const weave = clone(FIXTURE_WEAVE);
    weave.threads.push({ id: 't2', claim: 'A second thread the fix put under a taken id.', role: 'grounds-it', receipt: 'ledger' });
    return weave;
  };
  const atRepeat = () => atMeeting({ weave: withFactCheckMark(writersRepeat(), { at: 't', ready: true, fixes: 1 }), _weaveBaseline: writersRepeat() });
  const DIRECTORS = 'Two threads share the id "t2": the director\'s changes made this repeat. Keep the ids the meeting showed, and give each one the director added an id of its own.';

  it("a third t2 the director added over the writer's two is the director's repeat, and the refusal names the director", () => {
    const left = writersRepeat();
    left.threads.push({ id: 't2', claim: 'A third thread the director put under t2.', role: 'grounds-it' });
    expect(directorWeaveProblems(left, { shown: writersRepeat() })).toBe(DIRECTORS);
    const { error, stateUpdates } = meetingResume({ meeting: 'approve', weave: left }, atRepeat());
    expect(error).toBe(DIRECTORS);
    expect(stateUpdates).toEqual({});
  });

  it("its remedy works: the director's thread under an id of its own goes through, the writer's two left as the meeting showed them", () => {
    const left = writersRepeat();
    left.threads.push({ id: 't7', claim: 'A third thread the director put under an id of its own.', role: 'grounds-it' });
    expect(directorWeaveProblems(left, { shown: writersRepeat() })).toBeNull();
    const { error, stateUpdates } = meetingResume({ meeting: 'approve', weave: left }, atRepeat());
    expect(error).toBeNull();
    expect(stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t7]']);
  });

  it("the writer's two, left as the meeting showed them, are no repeat of the director's", () => {
    expect(directorWeaveProblems(writersRepeat(), { shown: writersRepeat() })).toBeNull();
  });
});

// Spec 4.4: a reweave fits the director's changes and note into the weave, and the answers
// travel as they are to every later writer. A reweave that carries neither spent a rework
// told to keep every line word for word, then a second fact check: about ten minutes with
// nothing to show.
describe('4.5b: an empty reweave is refused, with its reason', () => {
  const EMPTY = "A reweave fits the director's changes and note into the weave, and this one carries no change to the weave and no note. The answers travel as they are to every later writer: approve to send the weave on with them, or change the weave or write a note, then reweave.";
  const answered = () => ({ ...clone(FIXTURE_WEAVE), questions: FIXTURE_WEAVE.questions.map((q) => ({ ...q, answer: 'Sarah ran the bar all morning.' })) });

  it.each([
    ['the weave as the meeting showed it', { meeting: 'reweave', weave: clone(FIXTURE_WEAVE) }],
    ['answers alone', { meeting: 'reweave', weave: answered() }],
    ['answers alone and a blank note', { meeting: 'reweave', weave: answered(), note: '   ' }]
  ])('refuses %s, and writes nothing', (_name, approvals) => {
    const result = meetingResume(approvals, atMeeting());
    expect(result.error).toBe(EMPTY);
    expect(result.stateUpdates).toEqual({});
    expect(result.resume).toEqual({});
  });

  it('takes a reweave that carries a note, or a change to the weave', () => {
    expect(meetingResume({ meeting: 'reweave', weave: answered(), note: 'Join the ledger thread to the vote.' }, atMeeting()).error).toBeNull();
    expect(meetingResume({ meeting: 'reweave', weave: leftByDirector() }, atMeeting()).error).toBeNull();
  });

  it("takes a reweave whose earlier changes still stand: the meeting reopened on the director's version, which they want fitted in", () => {
    const left = leftByDirector();
    const reopened = atMeeting({ weave: withFactCheckMark(left, { at: 't', ready: true, fixes: 0 }), _weaveHandEdits: standingAtMeeting(null, FIXTURE_WEAVE, left) });
    const result = meetingResume({ meeting: 'reweave', weave: leftByDirector() }, reopened);
    expect(result.error).toBeNull();
    expect(result.stateUpdates._weaveHandEdits.edits).toHaveLength(3);
  });

  it('leaves an approve that carries no change as it was: the answers go on with it', () => {
    expect(meetingResume({ meeting: 'approve', weave: answered() }, atMeeting()).error).toBeNull();
  });
});
