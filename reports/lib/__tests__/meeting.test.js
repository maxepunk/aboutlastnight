/**
 * The story meeting's plumbing (phase 4, brief 4.5; spec 4.3 and 4.4; R12).
 *
 * - The director-side schema: the weave as the director leaves it, derived in code from
 *   the writer's, allowing the pick and answers; never sent to the SDK.
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

/** The director's line on c2. */
const C2_LINE = 'The sale and the result came back the same night.';

/** The director's line on t3, "The envelope". */
const T3_LINE = 'Morgan paid Riley at the bar, where no one looked.';

/** The director's version: a thread's line rewritten, a thread added with no evidence, a connection's line rewritten, a question answered. */
function leftByDirector() {
  const weave = clone(FIXTURE_WEAVE);
  weave.threads = weave.threads.map((t) => (t.id === 't3' ? { ...t, line: T3_LINE } : t));
  weave.threads.push({ id: 't6', name: 'The second ledger', line: 'Riley kept a second ledger.' });
  weave.connections = weave.connections.map((c) => (c.id === 'c2' ? { ...c, line: C2_LINE } : c));
  weave.questions = weave.questions.map((q) => ({ ...q, answer: 'Sarah ran the bar all morning.' }));
  return weave;
}

/** The meeting's stop, as the state holds it before the director acts. */
const atMeeting = (overrides = {}) => ({ ...reworkFixtureState('journalist'), weave: shown(), _weaveBaseline: clone(FIXTURE_WEAVE), ...overrides });

describe("the director-side schema (R12)", () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(DIRECTOR_WEAVE_SCHEMA);

  it("is derived from the writer's schema: the same fields, with the pick and the answer the director adds, and no evidence required (R6)", () => {
    expect(DIRECTOR_WEAVE_SCHEMA).not.toBe(WEAVE_SCHEMA);
    expect(DIRECTOR_WEAVE_SCHEMA.required).toEqual(WEAVE_SCHEMA.required);
    // Piece 3 (brief 3B; R1): the director's pick, the angle they sent on.
    expect(Object.keys(DIRECTOR_WEAVE_SCHEMA.properties)).toEqual([...Object.keys(WEAVE_SCHEMA.properties), 'picked']);
    expect(DIRECTOR_WEAVE_SCHEMA.properties.questions.items.properties.answer).toMatchObject({ type: 'string' });
    // R7: the strike went from the weave.
    expect(DIRECTOR_WEAVE_SCHEMA.properties.connections.items.properties).not.toHaveProperty('struck');
    expect(Object.keys(DIRECTOR_WEAVE_SCHEMA.properties.threads.items.properties)).toEqual(Object.keys(WEAVE_SCHEMA.properties.threads.items.properties));
    // Phase 4b (briefs 1B and 3B): a thread the director adds needs only its id, name and line.
    expect(DIRECTOR_WEAVE_SCHEMA.properties.threads.items.required).toEqual(['id', 'name', 'line']);
    expect(DIRECTOR_WEAVE_SCHEMA.properties.connections.items.required).toEqual(['id', 'joins', 'line', 'kind']);
    expect(WEAVE_SCHEMA.properties.threads.items.required).toContain('evidence');
  });

  it("leaves the writer's schema as it is: no model writes an answer", () => {
    expect(WEAVE_SCHEMA.properties.questions.items.properties).not.toHaveProperty('answer');
  });

  it("accepts the weave as the director left it: a thread added, and a writer's thread, each with no evidence, a thread's line and a connection's line rewritten, an answer", () => {
    const left = leftByDirector();
    left.threads = left.threads.map((t) => (t.id === 't2' ? { id: 't2', name: t.name, line: t.line } : t));
    expect(validate(left)).toBe(true);
    expect(directorWeaveProblems(left)).toBeNull();
  });

  // Review focus 3: only the writer's output is held to the bound; the gate never counts words.
  it("never refuses the director's version for its length", () => {
    const left = leftByDirector();
    left.threads.push({ id: 't7', name: 'A long thread', line: Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ') });
    expect(directorWeaveProblems(left)).toBeNull();
    expect(meetingResume({ meeting: 'approve', weave: left }, atMeeting()).error).toBeNull();
  });

  it.each([
    ['an answer that is not text', (w) => { w.questions[0].answer = 42; }, /questions\/0\/answer/],
    ['a pick that is not text', (w) => { w.picked = 2; }, /\/picked/],
    ['no angles', (w) => { delete w.angles; }, /angles/],
    ['an angle with no ends', (w) => { delete w.angles[1].ends; }, /angles\/1.*ends/],
    ['a thread with no line', (w) => { delete w.threads[1].line; }, /threads\/1.*line/],
    ['a thread with no name', (w) => { delete w.threads[1].name; }, /threads\/1.*name/],
    ['a piece of evidence with no sources', (w) => { w.threads[1].evidence[0].sources = []; }, /threads\/1\/evidence\/0\/sources/]
  ])('refuses %s, saying where', (_name, change, where) => {
    const left = leftByDirector();
    change(left);
    expect(directorWeaveProblems(left)).toMatch(where);
  });

  it('refuses anything that is not a weave', () => {
    expect(directorWeaveProblems(null)).toMatch(/weave/);
    expect(directorWeaveProblems({ story: 'x' })).toMatch(/threads/);
  });

  // Ruling 3: every id join at the meeting (the edits and the answers) reads ids,
  // so the director's changes give each thread, connection and question an id of its own.
  // Fix round 1, finding 2: the refusal says who made the repeat.
  it("refuses the repeats the director's changes made, naming each and the director", () => {
    const doubled = clone(FIXTURE_WEAVE);
    doubled.threads.push({ id: 't3', name: 'A taken id', line: 'A thread the director added under a taken id.' });
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
    left.threads.push({ id: 't6 ', name: 'The burned ledger', line: 'Riley burned the second ledger.' });
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
    weave.threads.push({ id: 't2', name: 'A second sale', line: 'A second thread the fix put under a taken id.', evidence: [{ sources: ['ledger'], shows: 'A sale into Melanie.', stance: 'supports' }] });
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
    left.threads = left.threads.map((t) => (t.id === 't3' ? { ...t, line: T3_LINE } : t));
    left.questions = left.questions.map((q) => ({ ...q, answer: 'Sarah ran the bar.' }));
    const result = meetingResume({ meeting: 'reweave', weave: left }, atRepeat());
    expect(result.error).toBeNull();
    expect(result.stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t3].line']);
  });

  it('refuses a change under it, naming the writer and saying how to go on', () => {
    const left = writersRepeat();
    left.threads[left.threads.length - 1].line = 'The second sale, as the director put it.';
    const { error, stateUpdates } = meetingResume({ meeting: 'approve', weave: left }, atRepeat());
    // 4.5b: the remedy names only what works: a reweave with no other change and no note is
    // refused as empty, so the reweave carries a note.
    expect(error).toBe('The writer gave two threads the id "t2", so the meeting cannot tell which of them the director changed. Leave them as the meeting showed them, and send the weave back or reweave it with a note: the rework gives each an id of its own.');
    expect(stateUpdates).toEqual({});
  });

  it('refuses a repeat the director made beside it, naming the director', () => {
    const left = writersRepeat();
    left.threads.push({ id: 't3', name: 'A taken id', line: 'A thread the director put under a taken id.' });
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
        ['E1', 'threads[#t3].line'], ['E2', 'threads[#t6]'], ['E3', 'connections[#c2].line']
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
    const failures = [{ type: 'evidence-not-in-record', message: 'The thread "The sale": piece 1 names "zzz", which is no document in <RECORD>.', place: 'threads[#t2]' }];
    const state = atMeeting({ _arcValidation: { weaveKey: weaveKey(shown()), passed: false, failures, concerns: [] } });
    expect(meetingCheckFailures(state)).toEqual(failures);
    expect(meetingCheckFailures({ ...state, _arcValidation: { ...state._arcValidation, weaveKey: 'another-weave' } })).toEqual([]);
    expect(meetingCheckFailures({ ...state, _arcValidation: { ...state._arcValidation, passed: true } })).toEqual([]);
    expect(meetingCheckFailures(atMeeting())).toEqual([]);
  });

  it("the concerns: the checks' and the fact check's, each beside the line of the edit it is about", () => {
    const left = leftByDirector();
    left.threads = left.threads.map((t) => (t.id === 't1' ? { ...t, line: 'The room argued for an hour.' } : t));
    const edits = standingAtMeeting(null, FIXTURE_WEAVE, left);
    const checkConcern = `${DIRECTOR_EDIT_PREFIX}E1: The thread "The overdose vote" carries the room's verdict and its line no longer tells it.`;
    const judgeConcern = `${DIRECTOR_EDIT_PREFIX}E2: T1: the new line puts weight the record does not carry.`;
    const weave = withFactCheckMark(left, { at: 't', ready: true, fixes: 0, concerns: [judgeConcern] });
    const state = atMeeting({
      weave, _weaveHandEdits: edits,
      _arcValidation: { weaveKey: weaveKey(weave), passed: true, failures: [], concerns: [checkConcern] }
    });
    expect(meetingConcerns(state)).toEqual([
      { text: checkConcern, editIds: ['E1'], places: [{ id: 'E1', path: 'threads[#t1].line', where: 'thread "t1", line' }] },
      { text: judgeConcern, editIds: ['E2'], places: [{ id: 'E2', path: 'threads[#t3].line', where: 'thread "t3", line' }] }
    ]);
    // A concern about an edit the weave no longer carries is not shown.
    const undone = { ...weave, threads: weave.threads.map((t) => (t.id === 't3' ? { ...t, line: FIXTURE_WEAVE.threads[2].line } : t)) };
    expect(meetingConcerns({ ...state, weave: undone }).map((c) => c.editIds)).toEqual([]);
  });

  it("the marks after a round: what the rework changed from the director's version, and the round", () => {
    // Piece 3 (brief 3B): "from your notes" is the weave's one text field of its own; the pitch is each angle's.
    const rewoven = { ...leftByDirector(), fromYourNotes: 'Riley watched the ledger' };
    const marks = meetingMarksOf(atMeeting({ weave: rewoven, _weaveMarks: { round: 'reweave', from: leftByDirector(), at: 't' } }));
    expect(marks).toEqual({ round: 'reweave', marks: [{ path: 'fromYourNotes', where: 'fromYourNotes', before: FIXTURE_WEAVE.fromYourNotes, after: 'Riley watched the ledger' }] });
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
    weave.threads.push({ id: 't2', name: 'A second sale', line: 'A second thread the fix put under a taken id.', evidence: [{ sources: ['ledger'], shows: 'A sale into Melanie.', stance: 'supports' }] });
    return weave;
  };
  const atRepeat = () => atMeeting({ weave: withFactCheckMark(writersRepeat(), { at: 't', ready: true, fixes: 1 }), _weaveBaseline: writersRepeat() });
  const DIRECTORS = 'Two threads share the id "t2": the director\'s changes made this repeat. Keep the ids the meeting showed, and give each one the director added an id of its own.';

  it("a third t2 the director added over the writer's two is the director's repeat, and the refusal names the director", () => {
    const left = writersRepeat();
    left.threads.push({ id: 't2', name: 'A third sale', line: 'A third thread the director put under t2.' });
    expect(directorWeaveProblems(left, { shown: writersRepeat() })).toBe(DIRECTORS);
    const { error, stateUpdates } = meetingResume({ meeting: 'approve', weave: left }, atRepeat());
    expect(error).toBe(DIRECTORS);
    expect(stateUpdates).toEqual({});
  });

  it("its remedy works: the director's thread under an id of its own goes through, the writer's two left as the meeting showed them", () => {
    const left = writersRepeat();
    left.threads.push({ id: 't7', name: 'A third sale', line: 'A third thread the director put under an id of its own.' });
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
  const EMPTY = "A reweave fits the director's changes and note into the angle, and this one carries no change to an angle or a thread and no note. The pick and the answers travel as they are to every later writer: approve to send the angle on with them, or change the angle or one of its threads, or write a note, then reweave.";
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

// ═══════════════════════════════════════════════════════════════════════════
// 4.14a: the meeting's marks say what changed in words (the final review, ruling 1)
// ═══════════════════════════════════════════════════════════════════════════
//
// Meeting 5: a thread a round took out read as a field dump ("id: t5; claim: ...; role: ...").
// Each mark of a thread or a connection a round took out carries the element as the director
// left it, so the meeting reads it by its words.
describe("4.14a: each mark of an element a round took out carries the element", () => {
  // Phase 4b (brief 1B; R6): the element as the version the director left held it, without its
  // evidence, which no mark carries.
  it('a thread and a connection a round took out each carry the element as the version the director left held it; a field mark carries none', () => {
    const left = leftByDirector();
    const reworked = clone(left);
    reworked.threads = reworked.threads.filter((t) => t.id !== 't5');
    reworked.connections = reworked.connections.filter((c) => c.id !== 'c1');
    reworked.fromYourNotes = 'Riley watched the ledger';
    const { marks } = meetingMarksOf(atMeeting({ weave: reworked, _weaveMarks: { round: 'reweave', from: left, at: 't' } }));
    const withoutEvidence = ({ evidence: _evidence, ...rest }) => rest;
    expect(marks.map((m) => [m.path, m.element])).toEqual([
      ['fromYourNotes', undefined],
      ['threads[#t5]', withoutEvidence(left.threads.find((t) => t.id === 't5'))],
      ['connections[#c1]', withoutEvidence(left.connections.find((c) => c.id === 'c1'))]
    ]);
  });

  it('a round that only re-cites a line marks nothing: the evidence is never the director\'s (R6)', () => {
    const left = leftByDirector();
    const reworked = clone(left);
    reworked.threads[1].evidence = [{ sources: ['mor001'], shows: 'A piece the rework found.', stance: 'supports' }];
    reworked.threads[5].evidence = [{ sources: ['notes'], shows: 'Riley watched the ledger.', stance: 'supports' }];
    expect(meetingMarksOf(atMeeting({ weave: reworked, _weaveMarks: { round: 'reweave', from: left, at: 't' } })).marks).toEqual([]);
  });

  it("under an id the director's version repeats, each mark carries the element the round took out, by its place under the id", () => {
    const left = clone(FIXTURE_WEAVE);
    left.threads.push({ id: 't2', name: 'A second sale', line: 'A second thread the writer put under t2.', evidence: [{ sources: ['ledger'], shows: 'A sale into Melanie.', stance: 'supports' }] });
    const reworked = clone(left);
    reworked.threads = reworked.threads.filter((t) => t.line !== 'A second thread the writer put under t2.');
    const { marks } = meetingMarksOf(atMeeting({ weave: reworked, _weaveMarks: { round: 'send-back', from: left, at: 't' } }));
    expect(marks.map((m) => [m.path, m.element && m.element.line])).toEqual([['threads[#t2]', 'A second thread the writer put under t2.']]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4b, piece 1 (brief 1B): the story level, with the evidence underneath
// ═══════════════════════════════════════════════════════════════════════════

// R6: the evidence is never the director's edit. The console sends the weave with the writer's
// evidence on it, and a version whose evidence differs (a pass re-cited a thread since the
// meeting showed it) makes no edit and no refusal.
describe("1B: the evidence under a line is never the director's edit (R6)", () => {
  it('a version whose evidence differs from the weave shown makes no edit', () => {
    const left = clone(FIXTURE_WEAVE);
    left.threads[1].evidence = [{ sources: ['mor001'], shows: 'Another piece the writer cited.', stance: 'cuts-against' }];
    left.connections[0].evidence = [];
    const result = meetingResume({ meeting: 'approve', weave: left }, atMeeting());
    expect(result.error).toBeNull();
    expect(result.stateUpdates._weaveHandEdits).toBeNull();
  });

  it('a thread the director added carries no evidence into its edit, and their other changes stand as edits', () => {
    const left = leftByDirector();
    left.threads[1].evidence = [];
    const { stateUpdates } = meetingResume({ meeting: 'approve', weave: left }, atMeeting());
    expect(stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t3].line', 'threads[#t6]', 'connections[#c2].line']);
    expect(stateUpdates._weaveHandEdits.edits[1].after).toEqual({ id: 't6', name: 'The second ledger', line: 'Riley kept a second ledger.' });
    expect(JSON.stringify(stateUpdates._weaveHandEdits)).not.toMatch(/"evidence"/);
  });
});

// The map's page names a meeting change by the line the meeting shows (brief 4.14a): a thread by
// its name and a connection by its line, never by an id (phase 4b, brief 1B).
describe('1B: where a meeting change sits, by the names the meeting shows', () => {
  const { meetingChangePlace } = require('../meeting');
  const placesOf = (left) => standingAtMeeting(null, FIXTURE_WEAVE, left).edits.map((edit) => meetingChangePlace(edit, left));

  it("names a thread by its name, quotes a line the director rewrote, and names a connection by its line", () => {
    const left = leftByDirector();
    left.threads[1].line = 'Marcus bragged about the sale at the bar.';
    left.threads[1].name = 'The brag';
    expect(placesOf(left)).toEqual([
      'the name "The brag"',
      'the line "Marcus bragged about the sale at the bar"',
      'the line "Morgan paid Riley at the bar, where no one looked"',
      'the thread you added, "The second ledger"',
      'the connection "The sale and the result came back the same night"'
    ]);
  });

  // Piece 3 (brief 3C): a thread has no reason, so no place names one.
  it('names the verdict flag by the thread it belongs to, and no place carries an id', () => {
    const left = clone(FIXTURE_WEAVE);
    delete left.threads[0].verdict;
    left.threads[1].verdict = true;
    const places = placesOf(left);
    expect(places).toEqual([
      'whether "The overdose vote" carries the room\'s verdict',
      'whether "The sale" carries the room\'s verdict'
    ]);
    places.forEach((place) => expect(place).not.toMatch(/\b[tc]\d\b/));
  });
});
