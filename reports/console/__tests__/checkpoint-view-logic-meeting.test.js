/**
 * 4.8: the story meeting on screen (phase 4, brief 4.8; spec 4.3 and 4.4).
 *
 * The meeting's view models and payload builders live in console/checkpoint-view-logic.js;
 * ArcSelection.js is their thin consumer (the console has no DOM harness). Every fixture
 * payload here is the server's own: lib/meeting.js meetingCheckpointData run on a state at
 * the meeting, so the view reads 4.5's payload as the stop sends it. Invented text.
 *
 * Phase 4b (brief 1B; spec 2026-10-05 sections 4.1 and 9): the meeting at the level of the
 * story. Each thread is its role, its name and its line, with its evidence folded; the
 * left-out threads come by name; each connection is its line, with the names of the threads
 * it joins; a check still failing sits beside the line it names; and no line or label names
 * an element by its id.
 */
const ViewLogic = require('../checkpoint-view-logic');
const { computeResetKey } = require('../outline-edit-logic');
const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
const {
  meetingCheckpointData, meetingResume, directorWeaveProblems, DIRECTOR_WEAVE_SCHEMA, MEETING_ACTIONS
} = require('../../lib/meeting');
const weaveLib = require('../../lib/weave');
const { WEAVE_ANSWER_KEY, WEAVE_QUESTION_KINDS } = require('../../lib/writer-questions');
const {
  standingAtMeeting, reportAfterPass, weaveEditsBetween, concernFinding, SEND_BACK_PASS, _testing: diffTesting
} = require('../../lib/hand-edit-diff');
const { EVIDENCE_SOURCES, EVIDENCE_STANCES } = require('../../lib/evidence');

const {
  meetingWeaveOf, meetingVersion, meetingPendingSlot, meetingDraftOf, meetingNoteOf, pendingEditsAfterCheckpoint,
  pickMeetingAngle, setAngleField, setThreadField, flipMeetingThread, addMeetingThread, removeMeetingThread, setQuestionAnswer,
  meetingWeaveChanges, meetingWeaveProblems, meetingPayload, meetingButtons,
  meetingVerdictView, receiptView, concernFindingOf, meetingView, meetingStandingNotes, rollbackWarningLine, evidenceFoldView
} = ViewLogic;

const clone = (v) => JSON.parse(JSON.stringify(v));
const MARK = { at: '2026-10-03T21:40:00.000Z', ready: true, fixes: 0 };
const INDEX = {
  ale003: { name: 'ALE003 - The sale', owner: 'Alex Reeves', type: 'memory', firstLine: 'Marcus brags about the sale.' },
  mor001: { name: 'MOR001 - The envelope', owner: 'Morgan Reed', type: 'memory', firstLine: 'Morgan hands Riley an envelope.' },
  'p-dna': { name: 'Paternity test result', owner: '', type: 'paper', firstLine: 'Subject: Sarah Blackwood.' },
  'p-rescued': { name: 'p-rescued', owner: '', type: 'paper', firstLine: 'Dear Marcus.' }
};
const ACCUSATION = { verdictKind: 'overdose', accused: [], charge: 'Accidental overdose', votes: [{ option: 'Overdose', count: 6, adopted: true }, { option: 'Murder', count: 2 }] };

/** A state paused at the meeting, before any round: the writer's weave, fact-checked. */
function stateAt(overrides = {}) {
  return {
    weave: weaveLib.withFactCheckMark(clone(WEAVE), MARK),
    _weaveBaseline: clone(WEAVE),
    sessionConfig: { accusation: ACCUSATION },
    directorGateNotes: [],
    arcRevisionCount: 0,
    humanArcRevisionCount: 0,
    ...overrides
  };
}

/** The stop's payload for a state, as server.js getCheckpointData sends it. */
const payloadOf = (state) => meetingCheckpointData(state, { evidenceIndex: INDEX, maxRevisions: 1 });

/** The thread the director adds at the meeting: its name and its line, and no evidence (phase 4b, brief 1B; piece 3). */
const ADDED = { id: 't6', name: 'The second ledger', line: 'Riley kept a second ledger.' };

/** The line the director gives t3 ("The envelope") in place of the writer's. */
const T3_LINE = 'Morgan paid Riley at the bar, where no one looked.';

/** A piece of evidence, as the weave carries it under a line. */
const piece = (sources, shows, stance = 'supports') => ({ sources, shows, stance });

/**
 * The director's version: angle 1's story edited, t3's line rewritten, a thread added in angle 1's
 * story, q1 answered. Its edits, in the order the meeting prints them: angle 1's story (E1), t3's
 * line (E2) and t6, added in angle 1 (E3) (piece 3, brief 3C).
 */
function directorsVersion() {
  const left = clone(WEAVE);
  left.angles[0].story = 'The room called it an overdose; the ledger says a sale.';
  left.threads[2].line = T3_LINE;
  left.threads.push(clone(ADDED));
  left.angles[0].threads.push('t6');
  left.questions[0].answer = 'Sarah ran the bar all morning.';
  return left;
}

/** A thread of the view by its id: the page lists the threads in the open angle's order and the rest left out. */
const threadOf = (view, id) => view.threads.concat(view.leftOut.threads).find((t) => t.id === id);

// ═══════════════════════════════════════════════════════════════════════════
// The console's copies of the server's constants and rules
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The director-side schema as the console models it: each property's type, an enum's
 * values, a list's or an object's own shape, and the required names. Built here from
 * DIRECTOR_WEAVE_SCHEMA itself, so the console's copy is held to the schema the gate uses.
 */
function shapeOf(schema) {
  const fields = {};
  Object.entries(schema.properties).forEach(([key, prop]) => {
    if (prop.enum) fields[key] = [...prop.enum];
    else if (prop.type === 'array' && prop.items.type === 'object') fields[key] = { list: shapeOf(prop.items) };
    else if (prop.type === 'array' && prop.items.type === 'string') fields[key] = prop.minItems ? 'nonEmptyStrings' : 'strings';
    else if (prop.type === 'object') fields[key] = { object: shapeOf(prop) };
    else fields[key] = prop.type;
  });
  return { required: [...(schema.required || [])], fields };
}

/** Every keyword the schema uses, at every depth. */
function keywordsOf(schema, out = new Set()) {
  Object.keys(schema).forEach((keyword) => out.add(keyword));
  Object.values(schema.properties || {}).forEach((prop) => keywordsOf(prop, out));
  if (schema.items) keywordsOf(schema.items, out);
  return out;
}

describe('4.8: the console\'s copies of the server\'s meeting constants', () => {
  // Piece 3 (brief 3B): an angle's printed fields and the pick are lib/weave.js's, and the console
  // opens the angle lib/weave.js pickedAngleOf reads as picked.
  test('the angle\'s printed fields and the pick\'s key are the weave\'s', () => {
    expect(ViewLogic.ANGLE_FIELDS).toEqual([...weaveLib.ANGLE_FIELDS]);
    expect(ViewLogic.PICKED_KEY).toBe(weaveLib.PICKED_KEY);
  });

  test('the open angle is lib/weave.js pickedAngleOf\'s, on one corpus', () => {
    const withPick = (picked) => ({ ...clone(WEAVE), picked });
    const corpus = [
      clone(WEAVE), withPick('a2'), withPick(' a3 '), withPick('a9'), withPick(''), withPick(7),
      { ...clone(WEAVE), angles: [] }, { ...clone(WEAVE), angles: [null, ...clone(WEAVE).angles] }, null, {}
    ];
    corpus.forEach((weave, i) => {
      const server = weaveLib.pickedAngleOf(weave);
      expect([i, ViewLogic.openAngleOf(weave)]).toEqual([i, server]);
    });
  });

  // 3B fix 1: the page's open story and the settled story every later reader goes through tell the
  // same threads, in the same order, and leave out the same ones.
  test('the open angle\'s threads, in and left out, are lib/weave.js settledAngleOf\'s, on one corpus', () => {
    const withAngle = (threads) => {
      const weave = clone(WEAVE);
      weave.angles[0].threads = threads;
      return weave;
    };
    const added = () => {
      const weave = clone(WEAVE);
      weave.threads.push(clone(ADDED));
      weave.angles[0].threads.push('t6');
      return weave;
    };
    const corpus = [
      ['no pick', clone(WEAVE)],
      ['a pick of the second angle', { ...clone(WEAVE), picked: 'a2' }],
      ['a pick of the second angle, with a thread the director added there', (() => {
        const weave = { ...added(), picked: 'a2' };
        weave.angles[0].threads.pop();
        weave.angles[1].threads.push('t6');
        return weave;
      })()],
      ['a repeated id in the angle\'s list', withAngle(['t1', 't2', 't1', 't3', 't2'])],
      ['an id the weave lacks', withAngle(['t1', 't9', 't2'])],
      ['an id with spaces round it', withAngle([' t2 ', 't1'])],
      ['a thread the director added', added()],
      ['an angle with an empty list', withAngle([])],
      ['an angle with no list', withAngle(undefined)],
      ['a thread id the weave repeats', (() => {
        const weave = clone(WEAVE);
        weave.threads.push({ ...clone(WEAVE.threads[1]), name: 'The second sale' });
        return weave;
      })()],
      ['a thread that is not an object', (() => {
        const weave = clone(WEAVE);
        weave.threads.splice(2, 0, null, 'The letter', ['t5']);
        return weave;
      })()]
    ];
    const idsOf = (threads) => threads.map((thread) => thread.id);
    corpus.forEach(([name, weave]) => {
      const server = weaveLib.settledAngleOf(weave);
      const page = ViewLogic.openStoryOf(weave);
      expect([name, idsOf(page.inStory.map((t) => t.thread)), idsOf(page.leftOut.map((t) => t.thread))])
        .toEqual([name, idsOf(server.threads), idsOf(server.leftOut)]);
      // The page keeps each thread's place in the weave, by which the operations change it.
      page.inStory.concat(page.leftOut).forEach((t) => expect([name, weave.threads[t.index]]).toEqual([name, t.thread]));
    });
  });

  test('the connection kinds, the answer key, and the actions are the server\'s', () => {
    expect(ViewLogic.CONNECTION_KINDS).toEqual([...weaveLib.CONNECTION_KINDS]);
    expect(ViewLogic.WEAVE_ANSWER_KEY).toBe(WEAVE_ANSWER_KEY);
    expect(ViewLogic.MEETING_ACTIONS).toEqual([...MEETING_ACTIONS]);
    expect(Object.keys(ViewLogic.WRITER_QUESTION_KIND_LABELS)).toEqual([...WEAVE_QUESTION_KINDS]);
  });

  // Phase 4b (brief 1B): the evidence's sources and stances are lib/evidence.js's, and its key
  // lib/hand-edit-diff.js's, which leaves the evidence out of every diff (R6).
  test('the evidence\'s sources, with the fold\'s words for each, its stances and its key are the server\'s', () => {
    expect(Object.keys(ViewLogic.EVIDENCE_SOURCE_LABELS)).toEqual(Object.values(EVIDENCE_SOURCES));
    expect(Object.values(ViewLogic.EVIDENCE_SOURCE_LABELS)).toEqual(['The ledger', 'The evidence log', 'Your notes']);
    expect(ViewLogic.EVIDENCE_STANCES).toEqual([...EVIDENCE_STANCES]);
    expect(ViewLogic.EVIDENCE_KEY).toBe(diffTesting.EVIDENCE_KEY);
  });

  test('the director-side schema\'s shape is DIRECTOR_WEAVE_SCHEMA\'s, and the schema uses no keyword the console does not model', () => {
    expect(ViewLogic.DIRECTOR_WEAVE_SHAPE).toEqual(shapeOf(DIRECTOR_WEAVE_SCHEMA));
    expect([...keywordsOf(DIRECTOR_WEAVE_SCHEMA)].sort()).toEqual(['description', 'enum', 'items', 'minItems', 'properties', 'required', 'type']);
  });

  test('a concern reads as the server reads its finding', () => {
    [
      'Director\'s edit E1: The thread "The second ledger" carries the room\'s verdict and is left out.',
      'Director\'s edit E1, E3: T1: the story states a motive as fact.',
      'Director\'s edit E12:no space after the colon.'
    ].forEach((text) => expect(concernFindingOf(text)).toBe(concernFinding(text)));
    expect(concernFindingOf('A finding with no prefix.')).toBe('A finding with no prefix.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The changes between two weaves, and the validator, held to the gate's decisions
// ═══════════════════════════════════════════════════════════════════════════

/** The server's change in the console's shape: what it is at, and its flags; a flip with its thread and its way (piece 3, R2). */
const serverChange = (c) => ({
  scope: c.scope,
  id: c.at[1] && c.at[1].match ? c.at[1].match.id : null,
  field: c.at[2] ? c.at[2].key : null,
  repeatedId: c.repeatedId === true,
  ...(c.flip && { thread: c.at[3].match.id, flip: c.flip })
});

/** A weave whose writer gave two threads and two connections one id each. */
function writersRepeat() {
  const w = clone(WEAVE);
  w.threads.push({ id: 't2', name: 'The second t2', line: 'A second thread under t2.', evidence: [piece(['ale003'], 'The brag again.')] });
  w.connections.push({ id: 'c1', joins: ['t2', 't5'], line: 'A second connection under c1.', kind: 'line', evidence: [piece(['ledger'], 'One account.')] });
  w.questions.push({ id: 'q1', kind: 'figure', about: '9:40, $40,000', question: 'Is this sale right?', changes: 'The money line.' });
  return w;
}

const CHANGE_CASES = [
  ['the same weave', () => [clone(WEAVE), clone(WEAVE)]],
  ['a field changed only at its ends', () => { const a = clone(WEAVE); a.fromYourNotes = `  ${a.fromYourNotes}  `; return [clone(WEAVE), a]; }],
  ['"from your notes" rewritten', () => { const a = clone(WEAVE); a.fromYourNotes = 'Riley kept the ledger.'; return [clone(WEAVE), a]; }],
  // Piece 3 (brief 3C; R1, R2): a line of the pitch and each thread flipped are changes; the pick is none.
  ['an angle\'s pitch rewritten, a thread flipped in and another angle picked', () => { const a = clone(WEAVE); a.angles[0].story = 'x'; a.angles[0].threads.push('t5'); a.picked = 'a2'; return [clone(WEAVE), a]; }],
  ['the pick alone', () => { const a = clone(WEAVE); a.picked = 'a3'; return [clone(WEAVE), a]; }],
  ['an angle\'s headline and where it ends up rewritten', () => { const a = clone(WEAVE); a.angles[1].headline = 'Morgan Paid Riley'; a.angles[1].ends = 'The envelope stays closed.'; return [clone(WEAVE), a]; }],
  ['a thread flipped out, and the angle told in another order', () => { const a = clone(WEAVE); a.angles[0].threads = ['t4', 't1', 't2']; return [clone(WEAVE), a]; }],
  ['two threads flipped, in two angles', () => { const a = clone(WEAVE); a.angles[1].threads.push('t5'); a.angles[2].threads.push('t2'); return [clone(WEAVE), a]; }],
  ['a thread added in the open angle, which is no flip beside it', () => { const a = clone(WEAVE); a.threads.push(clone(ADDED)); a.angles[0].threads.push('t6'); return [clone(WEAVE), a]; }],
  ['a thread taken out, off the angles too, which is no flip beside it', () => { const a = clone(WEAVE); a.threads.splice(3, 1); a.angles.forEach((angle) => { angle.threads = angle.threads.filter((id) => id !== 't4'); }); return [clone(WEAVE), a]; }],
  ['an angle taken out and one added, as a send-back pitches', () => { const a = clone(WEAVE); a.angles[2] = { ...clone(a.angles[2]), id: 'a4' }; return [clone(WEAVE), a]; }],
  ['a thread flipped in under an id the writer repeated', () => { const b = writersRepeat(); const a = clone(b); a.angles[2].threads.push('t2'); return [b, a]; }],
  // 3B fix 7: the first angle under an id the writer repeated is the one the pick opens.
  ["the writer's repeated angle id, the first angle under it rewritten", () => { const b = clone(WEAVE); b.angles[1].id = 'a1'; const a = clone(b); a.angles[0].story = 'x'; return [b, a]; }],
  ["the writer's repeated angle id, the second angle under it rewritten", () => { const b = clone(WEAVE); b.angles[1].id = 'a1'; const a = clone(b); a.angles[1].story = 'x'; return [b, a]; }],
  ['a thread\'s name and line rewritten', () => { const a = clone(WEAVE); a.threads[1].name = 'The brag'; a.threads[1].line = 'Marcus bragged.'; return [clone(WEAVE), a]; }],
  ['a thread added', () => { const a = clone(WEAVE); a.threads.push(clone(ADDED)); return [clone(WEAVE), a]; }],
  ['a thread taken out', () => { const a = clone(WEAVE); a.threads.pop(); return [clone(WEAVE), a]; }],
  // Phase 4b (brief 1B; R6): the evidence is the writers', so a piece found, re-cited or dropped is no change.
  ['a thread\'s evidence re-cited', () => { const a = clone(WEAVE); a.threads[1].evidence = [piece(['ledger'], 'The sale on the ledger.')]; return [clone(WEAVE), a]; }],
  ['a connection\'s evidence dropped', () => { const a = clone(WEAVE); delete a.connections[0].evidence; return [clone(WEAVE), a]; }],
  ["a connection's line rewritten", () => { const a = clone(WEAVE); a.connections[0].line = 'A new line.'; return [clone(WEAVE), a]; }],
  ['an answer given', () => { const a = clone(WEAVE); a.questions[0].answer = 'Sarah ran the bar.'; return [clone(WEAVE), a]; }],
  ['a question reworded', () => { const a = clone(WEAVE); a.questions[0].question = 'Who?'; return [clone(WEAVE), a]; }],
  ['a thread with no id changed', () => { const b = clone(WEAVE); b.threads[0].id = ''; const a = clone(b); a.threads[0].line = 'x'; return [b, a]; }],
  ['the writer\'s repeat left alone, another thread rewritten', () => { const b = writersRepeat(); const a = clone(b); a.threads[0].line = 'x'; return [b, a]; }],
  ['the writer\'s repeat, one of them rewritten', () => { const b = writersRepeat(); const a = clone(b); a.threads[5].line = 'x'; return [b, a]; }],
  ['the writer\'s repeat, a third added', () => { const b = writersRepeat(); const a = clone(b); a.threads.push({ id: 't2', name: 'x', line: 'x' }); return [b, a]; }],
  ['the writer\'s repeat, one taken out', () => { const b = writersRepeat(); const a = clone(b); a.threads.splice(1, 1); return [b, a]; }],
  ['the writer\'s repeated connection, one rewritten', () => { const b = writersRepeat(); const a = clone(b); a.connections[2].line = 'x'; return [b, a]; }],
  ['a version that is no weave', () => [null, clone(WEAVE)]]
];

describe('4.8: meetingWeaveChanges reads two weaves as the server\'s diff does', () => {
  test.each(CHANGE_CASES)('%s', (_name, build) => {
    const [before, after] = build();
    expect(meetingWeaveChanges(before, after)).toEqual(weaveEditsBetween(before, after).map(serverChange));
  });

  test('the cases cover each kind of change the meeting can make', () => {
    const all = CHANGE_CASES.flatMap(([, build]) => meetingWeaveChanges(...build()));
    expect(all.some((c) => c.scope === 'fromYourNotes')).toBe(true);
    expect(all.some((c) => c.scope === 'threads' && c.field === 'name')).toBe(true);
    expect(all.some((c) => c.scope === 'threads' && c.field === 'line')).toBe(true);
    expect(all.some((c) => c.scope === 'threads' && c.field === null)).toBe(true);
    expect(all.some((c) => c.scope === 'connections' && c.field === 'line')).toBe(true);
    expect(all.some((c) => c.repeatedId)).toBe(true);
    // Piece 3 (brief 3C): a line of the pitch, a thread flipped each way, an angle whole.
    expect(all.some((c) => c.scope === 'angles' && c.field === 'story')).toBe(true);
    expect(all.some((c) => c.scope === 'angles' && c.flip === 'in')).toBe(true);
    expect(all.some((c) => c.scope === 'angles' && c.flip === 'out')).toBe(true);
    expect(all.some((c) => c.scope === 'angles' && c.field === null)).toBe(true);
    expect(all.some((c) => c.flip && c.repeatedId)).toBe(true);
  });

  test('the pick alone is no change (R1)', () => {
    const [before, after] = CHANGE_CASES.find(([n]) => n === 'the pick alone')[1]();
    expect(meetingWeaveChanges(before, after)).toEqual([]);
  });

  // R6: no change of the director's is read from the evidence, on either side.
  test('the evidence under a line is no change, re-cited or dropped (R6)', () => {
    ['a thread\'s evidence re-cited', 'a connection\'s evidence dropped'].forEach((name) => {
      const [before, after] = CHANGE_CASES.find(([n]) => n === name)[1]();
      expect([name, meetingWeaveChanges(before, after)]).toEqual([name, []]);
    });
  });
});

/** Each case: what the director left, the weave the meeting showed, and whether the gate takes it. */
const DECISION_CASES = [
  ['the weave as shown', true, () => [clone(WEAVE), clone(WEAVE)]],
  ['every change the meeting makes', true, () => [directorsVersion(), clone(WEAVE)]],
  ['extra keys, which the schema leaves open', true, () => { const w = clone(WEAVE); w.extra = 1; w.threads[0].note = 'x'; return [w, clone(WEAVE)]; }],
  ['a thread with no evidence and no reason', true, () => { const w = clone(WEAVE); delete w.threads[4].evidence; delete w.threads[4].reason; return [w, clone(WEAVE)]; }],
  ['a connection with no evidence', true, () => { const w = clone(WEAVE); delete w.connections[0].evidence; return [w, clone(WEAVE)]; }],
  ['an empty list of joins', true, () => { const w = clone(WEAVE); w.connections[0].joins = []; return [w, clone(WEAVE)]; }],
  ['two threads with no id', true, () => { const b = clone(WEAVE); b.threads[0].id = ''; const w = clone(b); w.threads.push({ id: '', name: 'x', line: 'x' }); return [w, b]; }],
  // Piece 3 (brief 3B): the angles, the pick, and the verdict's thread in the picked angle (R8).
  ['the pick names angle 2', true, () => { const w = clone(WEAVE); w.picked = 'a2'; return [w, clone(WEAVE)]; }],
  ['an angle the director did not pick lacks the verdict\'s thread', true, () => { const w = clone(WEAVE); w.picked = 'a2'; w.angles[2].threads = ['t4']; return [w, clone(WEAVE)]; }],
  ['the picked angle lacks the verdict\'s thread', false, () => { const w = clone(WEAVE); w.picked = 'a2'; w.angles[1].threads = ['t3']; return [w, clone(WEAVE)]; }],
  ['the first angle, open with no pick, lacks the verdict\'s thread', false, () => { const w = clone(WEAVE); w.angles[0].threads = ['t2', 't3']; return [w, clone(WEAVE)]; }],
  // Fix round 1, finding 2: the verdict's thread is the one the meeting showed, by id (R8).
  ["the verdict's flag taken off its thread, which stays in the picked angle", false, () => { const w = clone(WEAVE); delete w.threads[0].verdict; return [w, clone(WEAVE)]; }],
  ["the verdict's flag set false and its thread left out of the picked angle", false, () => { const w = clone(WEAVE); w.threads[0].verdict = false; w.angles[0].threads = w.angles[0].threads.filter((id) => id !== 't1'); return [w, clone(WEAVE)]; }],
  ["the verdict's flag moved to a thread in the picked angle", false, () => { const w = clone(WEAVE); delete w.threads[0].verdict; w.threads[1].verdict = true; w.angles[0].threads = w.angles[0].threads.filter((id) => id !== 't1'); return [w, clone(WEAVE)]; }],
  ["the verdict's thread deleted from the weave and every angle", false, () => { const w = clone(WEAVE); w.threads.splice(0, 1); w.angles.forEach((a) => { a.threads = a.threads.filter((id) => id !== 't1'); }); return [w, clone(WEAVE)]; }],
  ["the verdict's thread renamed, kept flagged in the picked angle", true, () => { const w = clone(WEAVE); w.threads[0].name = 'The vote the room settled'; return [w, clone(WEAVE)]; }],
  // Fix round 1, finding 3: the angles the meeting showed are the angles stored, by id (R9).
  ['an angle the meeting showed dropped', false, () => { const w = clone(WEAVE); w.angles.splice(2, 1); return [w, clone(WEAVE)]; }],
  ['an angle the meeting never showed added', false, () => { const w = clone(WEAVE); w.angles.push({ ...clone(w.angles[2]), id: 'a4' }); return [w, clone(WEAVE)]; }],
  ['an angle swapped for one the meeting never showed', false, () => { const w = clone(WEAVE); w.angles[2] = { ...clone(w.angles[2]), id: 'a4' }; return [w, clone(WEAVE)]; }],
  ['the angles in another order, none added or dropped', true, () => { const w = clone(WEAVE); w.angles.reverse(); return [w, clone(WEAVE)]; }],
  ['a pick that names no angle', false, () => { const w = clone(WEAVE); w.picked = 'a9'; return [w, clone(WEAVE)]; }],
  ['a pick that is not text', false, () => { const w = clone(WEAVE); w.picked = 3; return [w, clone(WEAVE)]; }],
  ['the director repeats an angle id', false, () => { const w = clone(WEAVE); w.angles.push({ ...w.angles[2] }); return [w, clone(WEAVE)]; }],
  // 3B fix 7: the gate stores the angle sent by its id, so a pick of an id the writer repeated is
  // refused; the angle the meeting opened, left open, and one under an id of its own pass.
  ['the director picks an angle id the writer repeated', false, () => { const b = clone(WEAVE); b.angles[2].id = 'a2'; const w = clone(b); w.picked = 'a2'; return [w, b]; }],
  ["the writer's repeated angle id, the angle the meeting opened left open", true, () => { const b = clone(WEAVE); b.angles[1].id = 'a1'; return [clone(b), b]; }],
  ["the writer's repeated angle id, the meeting's own pick of it kept", true, () => { const b = clone(WEAVE); b.angles[2].id = 'a2'; b.picked = 'a2'; return [clone(b), b]; }],
  ["the writer's repeated angle id, an angle under an id of its own picked", true, () => { const b = clone(WEAVE); b.angles[1].id = 'a1'; const w = clone(b); w.picked = 'a3'; return [w, b]; }],
  ['a missing required field', false, () => { const w = clone(WEAVE); delete w.angles; return [w, clone(WEAVE)]; }],
  ['an angle with no ends', false, () => { const w = clone(WEAVE); delete w.angles[1].ends; return [w, clone(WEAVE)]; }],
  ['an angle\'s story that is not text', false, () => { const w = clone(WEAVE); w.angles[0].story = 5; return [w, clone(WEAVE)]; }],
  ['an angle\'s threads that are not a list', false, () => { const w = clone(WEAVE); w.angles[0].threads = 't1'; return [w, clone(WEAVE)]; }],
  ['a question\'s thread that is not text', false, () => { const w = clone(WEAVE); w.questions[1].thread = 2; return [w, clone(WEAVE)]; }],
  ['a field present as null', false, () => { const w = clone(WEAVE); w.fromYourNotes = null; return [w, clone(WEAVE)]; }],
  ['threads that are not a list', false, () => { const w = clone(WEAVE); w.threads = {}; return [w, clone(WEAVE)]; }],
  ['a thread that is not an object', false, () => { const w = clone(WEAVE); w.threads[0] = 't1'; return [w, clone(WEAVE)]; }],
  ['a thread with no line', false, () => { const w = clone(WEAVE); delete w.threads[1].line; return [w, clone(WEAVE)]; }],
  ['a name that is not text', false, () => { const w = clone(WEAVE); w.threads[0].name = 12; return [w, clone(WEAVE)]; }],
  ['a verdict flag that is not true or false', false, () => { const w = clone(WEAVE); w.threads[0].verdict = 'true'; return [w, clone(WEAVE)]; }],
  ['a piece that names no source', false, () => { const w = clone(WEAVE); w.threads[0].evidence[0].sources = []; return [w, clone(WEAVE)]; }],
  ['a piece with a stance the evidence does not take', false, () => { const w = clone(WEAVE); w.threads[0].evidence[0].stance = 'neutral'; return [w, clone(WEAVE)]; }],
  ['a piece with no line of what it shows', false, () => { const w = clone(WEAVE); delete w.connections[0].evidence[0].shows; return [w, clone(WEAVE)]; }],
  ['a card flag that is not true or false', false, () => { const w = clone(WEAVE); w.threads[1].evidence[0].card = 'yes'; return [w, clone(WEAVE)]; }],
  ['evidence that is not a list', false, () => { const w = clone(WEAVE); w.threads[1].evidence = 'ale003'; return [w, clone(WEAVE)]; }],
  ['an unknown connection kind', false, () => { const w = clone(WEAVE); w.connections[0].kind = 'rumour'; return [w, clone(WEAVE)]; }],
  ['joins that are not a list', false, () => { const w = clone(WEAVE); w.connections[0].joins = 't1'; return [w, clone(WEAVE)]; }],
  ['joins holding a number', false, () => { const w = clone(WEAVE); w.connections[0].joins = ['t1', 2]; return [w, clone(WEAVE)]; }],
  // R7: the strike went from the weave, so a struck key on a connection is an extra key, which the schema leaves open.
  ['a struck key on a connection', true, () => { const w = clone(WEAVE); w.connections[0].struck = 'yes'; return [w, clone(WEAVE)]; }],
  ['a question with no changes', false, () => { const w = clone(WEAVE); delete w.questions[0].changes; return [w, clone(WEAVE)]; }],
  ['a question kind the weave does not ask', false, () => { const w = clone(WEAVE); w.questions[0].kind = 'ledger'; return [w, clone(WEAVE)]; }],
  ['an answer that is not text', false, () => { const w = clone(WEAVE); w.questions[0].answer = 42; return [w, clone(WEAVE)]; }],
  ['a list for a weave', false, () => [[], clone(WEAVE)]],
  ['no weave at all', false, () => [null, clone(WEAVE)]],
  ['the director repeats a thread id', false, () => { const w = clone(WEAVE); w.threads.push({ id: 't2', name: 'x', line: 'x' }); return [w, clone(WEAVE)]; }],
  ['the director repeats a thread id, read trimmed', false, () => { const w = clone(WEAVE); w.threads.push({ id: ' t2 ', name: 'x', line: 'x' }); return [w, clone(WEAVE)]; }],
  ['the director repeats a connection id', false, () => { const w = clone(WEAVE); w.connections.push({ id: 'c1', joins: ['t1', 't2'], line: 'x', kind: 'line' }); return [w, clone(WEAVE)]; }],
  ['the director repeats a question id', false, () => { const w = clone(WEAVE); w.questions.push({ ...w.questions[0] }); return [w, clone(WEAVE)]; }],
  ['the writer\'s repeat, left as the meeting showed it', true, () => [writersRepeat(), writersRepeat()]],
  ['the writer\'s repeat left alone, another thread rewritten', true, () => { const w = writersRepeat(); w.threads[0].line = 'Another line for the vote.'; return [w, writersRepeat()]; }],
  ['the writer\'s repeated question, answered', true, () => { const w = writersRepeat(); w.questions[2].answer = 'Yes.'; return [w, writersRepeat()]; }],
  ['the writer\'s repeat, one of them rewritten', false, () => { const w = writersRepeat(); w.threads[5].line = 'Another line for the second t2.'; return [w, writersRepeat()]; }],
  ['the writer\'s repeat, a third added under it', false, () => { const w = writersRepeat(); w.threads.push({ id: 't2', name: 'x', line: 'x' }); return [w, writersRepeat()]; }],
  ['the writer\'s repeat, one taken out', false, () => { const w = writersRepeat(); w.threads.splice(1, 1); return [w, writersRepeat()]; }],
  ['the writer\'s repeated connection, one rewritten', false, () => { const w = writersRepeat(); w.connections[2].line = 'x'; return [w, writersRepeat()]; }],
  // Piece 3 (brief 3C): a flip finds its thread by its id, and an angle under a repeated id is the
  // first, the one the pick opens (3B fix 7).
  ['the writer\'s repeat, a thread under it flipped into the open angle', false, () => { const w = writersRepeat(); w.angles[1].threads.push('t2'); w.picked = 'a2'; return [w, writersRepeat()]; }],
  ['the writer\'s repeat left alone, another thread flipped into the open angle', true, () => { const w = writersRepeat(); w.angles[0].threads.push('t5'); return [w, writersRepeat()]; }],
  ["the writer's repeated angle id, the first angle under it, the one open, rewritten", true, () => { const b = clone(WEAVE); b.angles[1].id = 'a1'; const w = clone(b); w.angles[0].story = 'x'; return [w, b]; }],
  ['a repeat with no weave shown, read as the director\'s', false, () => [writersRepeat(), null]]
];

describe('4.8: the console\'s validator reaches the gate\'s decisions (ruling 4)', () => {
  test.each(DECISION_CASES)('%s', (_name, accepts, build) => {
    const [left, shown] = build();
    const gate = directorWeaveProblems(weaveLib.weaveForPrompt(left), { shown: weaveLib.weaveForPrompt(shown) });
    const consoleSays = meetingWeaveProblems(left, shown);
    expect({ gateAccepts: gate === null, consoleAccepts: consoleSays === null })
      .toEqual({ gateAccepts: accepts, consoleAccepts: accepts });
    if (!accepts) expect(typeof consoleSays === 'string' && consoleSays.length > 0).toBe(true);
  });

  test('the fact check\'s mark on the weave the meeting showed is a code-owned key, read past as the gate reads it', () => {
    const shown = weaveLib.withFactCheckMark(writersRepeat(), MARK);
    expect(meetingWeaveProblems(meetingWeaveOf(shown), shown)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The director's changes: what the meeting's controls do to the weave
// ═══════════════════════════════════════════════════════════════════════════

describe('4.8: the director\'s changes at the meeting, each as typed', () => {
  const shown = () => weaveLib.withFactCheckMark(clone(WEAVE), MARK);

  test('the weave the meeting edits is the shown weave without its code-owned keys, never the payload\'s own object', () => {
    const payloadWeave = shown();
    const draft = meetingWeaveOf(payloadWeave);
    expect(draft).toEqual(clone(WEAVE));
    expect(draft).not.toHaveProperty('_factCheck');
    draft.threads[0].name = 'Another name';
    expect(payloadWeave.threads[0].name).toBe('The overdose vote');
    expect(meetingWeaveOf(null)).toBeNull();
    expect(meetingWeaveOf({ angles: [] })).toBeNull();
  });

  // Piece 3 (brief 3B; spec 6): the director picks an angle, rewrites its pitch and a thread in
  // place, flips a thread in or out of the open angle, and adds a thread to it.
  test('an angle is picked by its id, and a pick of an angle the weave does not hold throws', () => {
    const before = meetingWeaveOf(shown());
    const after = pickMeetingAngle(before, 'a2');
    expect(after.picked).toBe('a2');
    expect(before).not.toHaveProperty('picked');
    expect(meetingWeaveChanges(before, after)).toEqual([]);
    expect(() => pickMeetingAngle(before, 'a9')).toThrow(/no angle a9/);
  });

  test('a line of an angle\'s pitch is rewritten in place, as typed, on the angle it was made on', () => {
    let w = meetingWeaveOf(shown());
    w = setAngleField(w, 'a2', 'story', '  Someone built a case.  ');
    w = setAngleField(w, 'a2', 'ends', 'The ledger meets the vote.');
    expect([w.angles[1].story, w.angles[1].ends]).toEqual(['  Someone built a case.  ', 'The ledger meets the vote.']);
    expect(w.angles[0]).toEqual(WEAVE.angles[0]);
    // Switching angles keeps the change on the angle it was made on (spec 6).
    expect(pickMeetingAngle(w, 'a3').angles[1].story).toBe('  Someone built a case.  ');
    expect(() => setAngleField(w, 'a2', 'threads', 'x')).toThrow(/headline, gist, story, question, lands, ends/);
    expect(() => setAngleField(w, 'a9', 'story', 'x')).toThrow(/no angle a9/);
  });

  test('a thread\'s name or line is rewritten in place, as typed, and shows in every angle that tells it', () => {
    const w = setThreadField(setThreadField(meetingWeaveOf(shown()), 0, 'name', 'The vote'), 0, 'line', 'The room voted.');
    expect([w.threads[0].name, w.threads[0].line]).toEqual(['The vote', 'The room voted.']);
    const data = payloadOf(stateAt());
    expect(meetingView(data, pickMeetingAngle(w, 'a3'), '').threads.map((t) => t.name)).toContain('The vote');
    expect(() => setThreadField(w, 0, 'verdict', 'x')).toThrow(/name or line/);
  });

  test('a thread flips into the open angle after its own, or out of it; the verdict\'s thread stays in', () => {
    const before = meetingWeaveOf(shown());
    const inA1 = flipMeetingThread(before, 't5', true);
    expect(inA1.angles[0].threads).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(flipMeetingThread(inA1, 't5', true).angles[0].threads).toEqual(['t1', 't2', 't3', 't4', 't5']);
    const out = flipMeetingThread(before, 't3', false);
    expect(out.angles[0].threads).toEqual(['t1', 't2', 't4']);
    expect(out.angles.slice(1)).toEqual(WEAVE.angles.slice(1));
    expect(flipMeetingThread(before, 't1', false).angles[0].threads).toEqual(['t1', 't2', 't3', 't4']);
    // On the angle the pick opens.
    expect(flipMeetingThread(pickMeetingAngle(before, 'a2'), 't2', true).angles[1].threads).toEqual(['t3', 't1', 't2']);
    expect(() => flipMeetingThread(before, 't9', true)).toThrow(/no thread t9/);
  });

  // Phase 4b (brief 1B; spec 9; piece 3, spec 6): the add line takes a name and a line, and the
  // thread goes into the open angle's story. It carries no evidence: the map writer finds it
  // (piece 1, spec 5.3), and the gate takes it so.
  test('a thread is added with its name and its line, under an id of its own, in the open angle, with no evidence', () => {
    const before = meetingWeaveOf(shown());
    const after = addMeetingThread(before, 'The second ledger', 'Riley kept a second ledger. ');
    expect(after.threads).toHaveLength(6);
    expect(after.threads[5]).toEqual({ id: 't6', name: 'The second ledger', line: 'Riley kept a second ledger. ' });
    expect(after.angles[0].threads).toEqual(['t1', 't2', 't3', 't4', 't6']);
    const twice = addMeetingThread(addMeetingThread(before, 'A', 'a'), 'B', 'b');
    expect(twice.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
    expect(addMeetingThread(before, '   ', '  ')).toBe(before);
    expect(addMeetingThread(before, 'The second ledger', '').threads[5]).toEqual({ id: 't6', name: 'The second ledger', line: '' });
    expect(addMeetingThread(pickMeetingAngle(before, 'a3'), 'x', 'x').angles[2].threads).toEqual(['t4', 't1', 't6']);
    expect(meetingWeaveProblems(after, shown())).toBeNull();
    expect(directorWeaveProblems(after, { shown: weaveLib.weaveForPrompt(shown()) })).toBeNull();
  });

  test('a thread added at this look can be taken out again, off the angle too', () => {
    const added = addMeetingThread(meetingWeaveOf(shown()), 'x', 'x');
    const taken = removeMeetingThread(added, 5);
    expect(taken.threads).toEqual(clone(WEAVE).threads);
    expect(taken.angles).toEqual(clone(WEAVE).angles);
  });

  test('an answer is kept as typed, and a blank answer is no answer', () => {
    const answered = setQuestionAnswer(meetingWeaveOf(shown()), 0, '  Sarah ran the bar.\n');
    expect(answered.questions[0].answer).toBe('  Sarah ran the bar.\n');
    const blank = setQuestionAnswer(answered, 0, '   ');
    expect(blank.questions[0]).toEqual(clone(WEAVE).questions[0]);
  });

  test('every change the meeting makes passes the gate', () => {
    let w = meetingWeaveOf(shown());
    w = pickMeetingAngle(w, 'a3');
    w = setAngleField(w, 'a3', 'story', 'The room named an overdose; the ledger names a sale.');
    w = setThreadField(w, 2, 'line', T3_LINE);
    w = flipMeetingThread(w, 't3', true);
    w = addMeetingThread(w, 'The second ledger', 'Riley kept a second ledger.');
    w = setQuestionAnswer(w, 0, 'Sarah ran the bar.');
    expect(meetingWeaveProblems(w, shown())).toBeNull();
    expect(directorWeaveProblems(w, { shown: weaveLib.weaveForPrompt(shown()) })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The payloads and the buttons
// ═══════════════════════════════════════════════════════════════════════════

describe('4.8: the meeting\'s payloads are 4.5\'s', () => {
  // The payloads and the buttons read the stop's payload: the weave it showed, and a round
  // that did not run (fix round 1, finding 1).
  const data = () => payloadOf(stateAt());
  const untouched = () => meetingWeaveOf(data().weave);
  const answeredOnly = () => setQuestionAnswer(untouched(), 0, 'Sarah ran the bar.');
  const reroled = () => setThreadField(untouched(), 2, 'line', T3_LINE);
  const picked = () => pickMeetingAngle(untouched(), 'a2');

  test('approve carries the weave as the director left it, without the code-owned keys, and a note only as typed', () => {
    expect(meetingPayload('approve', data(), untouched(), '')).toEqual({ meeting: 'approve', weave: clone(WEAVE) });
    expect(meetingPayload('approve', data(), untouched(), '   ')).toEqual({ meeting: 'approve', weave: clone(WEAVE) });
    expect(meetingPayload('approve', data(), reroled(), ' Lead with the vote. ')).toEqual({ meeting: 'approve', weave: reroled(), note: ' Lead with the vote. ' });
    // Piece 3 (R1): the director's version goes with its pick.
    expect(meetingPayload('approve', data(), picked(), '')).toEqual({ meeting: 'approve', weave: { ...clone(WEAVE), picked: 'a2' } });
  });

  test('a reweave carries the weave and its note; with no change and no note there is none to send, and answers alone are no change', () => {
    expect(meetingPayload('reweave', data(), reroled(), '')).toEqual({ meeting: 'reweave', weave: reroled() });
    expect(meetingPayload('reweave', data(), untouched(), 'Make the sale the main thread.')).toEqual({ meeting: 'reweave', weave: clone(WEAVE), note: 'Make the sale the main thread.' });
    expect(meetingPayload('reweave', data(), untouched(), '')).toBeNull();
    expect(meetingPayload('reweave', data(), answeredOnly(), '  ')).toBeNull();
    // A pick alone has nothing to fit in (spec 7).
    expect(meetingPayload('reweave', data(), picked(), '')).toBeNull();
  });

  test('a send-back carries its note, and the weave only when the director changed it, answers included', () => {
    expect(meetingPayload('send-back', data(), untouched(), 'Rethink the money thread.')).toEqual({ meeting: 'send-back', note: 'Rethink the money thread.' });
    expect(meetingPayload('send-back', data(), answeredOnly(), 'Rethink it.')).toEqual({ meeting: 'send-back', note: 'Rethink it.', weave: answeredOnly() });
    expect(meetingPayload('send-back', data(), reroled(), '')).toBeNull();
  });

  test('an action the meeting does not take throws', () => {
    expect(() => meetingPayload('select', data(), untouched(), '')).toThrow(/approve, reweave or send-back/);
  });

  test('the buttons: Approve, Reweave offered only on a change or a note, Send back on its note in two clicks', () => {
    const idle = meetingButtons(data(), untouched(), '', false);
    expect(idle.approve.label).toBe('Approve');
    expect(idle.reweave).toMatchObject({ label: 'Reweave', disabled: true });
    expect(idle.reweave.hint).toMatch(/change the angle or one of its threads, or write a note/);
    expect(idle.sendBack).toMatchObject({ label: 'Send back', disabled: true });
    expect(meetingButtons(data(), answeredOnly(), '', false).reweave.disabled).toBe(true);
    expect(meetingButtons(data(), picked(), '', false).reweave.disabled).toBe(true);
    expect(meetingButtons(data(), reroled(), '', false).reweave).toMatchObject({ disabled: false, hint: '' });
    expect(meetingButtons(data(), untouched(), 'A note.', false).reweave.disabled).toBe(false);
    expect(meetingButtons(data(), untouched(), 'A note.', false).sendBack).toMatchObject({ label: 'Send back', disabled: false });
    expect(meetingButtons(data(), untouched(), 'A note.', true).sendBack).toMatchObject({ label: 'Confirm send back, starts a rework', armed: true });
  });
});

// Fix round 1, finding 1. A director's round whose rework times out reopens the meeting on
// the director's own version: lib/meeting.js meetingResume stored it before the rework, and
// reviseArcs gives the round back. So the weave shown already holds the changes the round
// carried, still to fit in. The round's line says how to retry, and the buttons offer
// exactly that, with nothing new typed when the round carried no note.
describe('4.8 fix round 1: a round that did not run says how to retry, and the buttons offer it', () => {
  /** The state a director's round leaves when its rework times out (reviseArcs' timeout path). */
  function reopenedAfter(payload, before = stateAt()) {
    const taken = meetingResume(payload, before);
    expect(taken.error).toBeNull();
    return {
      ...before,
      ...taken.stateUpdates,
      _meetingRound: null,
      _arcFeedback: null,
      _arcReworkTimeout: { consecutive: 1, attempt: 0, round: taken.stateUpdates._meetingRound, note: taken.stateUpdates._arcFeedback, at: '2026-10-03T22:00:00.000Z' },
      humanArcRevisionCount: before.humanArcRevisionCount
    };
  }

  test('a reweave with no note: the meeting reopens on its changes, Reweave is offered with nothing new typed, and the retry is a payload the gate takes', () => {
    const first = payloadOf(stateAt());
    const reopened = reopenedAfter(meetingPayload('reweave', first, setThreadField(meetingDraftOf(first, undefined), 2, 'line', T3_LINE), ''));
    const data = payloadOf(reopened);
    const draft = meetingDraftOf(data, pendingEditsAfterCheckpoint({}, 'arc-selection', data)['arc-selection']);
    const view = meetingView(data, draft);
    expect(threadOf(view, 't3').line).toBe(T3_LINE);
    expect(view.didNotRun).toBe('Your reweave did not run: the writer timed out, and the weave is as you left it. Reweave again to retry.');
    expect(meetingButtons(data, draft, '', false).reweave).toMatchObject({ disabled: false, hint: '' });

    const retry = meetingPayload('reweave', data, draft, '');
    expect(retry).toEqual({ meeting: 'reweave', weave: draft });
    const taken = meetingResume(retry, reopened);
    expect(taken.error).toBeNull();
    expect(taken.resume).toEqual({ approved: false, round: 'reweave' });
    expect(taken.stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t3].line']);
  });

  test('a reweave with a note: the line gives the note back to write again, and Reweave comes on once it is written', () => {
    const first = payloadOf(stateAt());
    const reopened = reopenedAfter(meetingPayload('reweave', first, meetingDraftOf(first, undefined), 'Make the sale the main thread.'));
    const data = payloadOf(reopened);
    const draft = meetingDraftOf(data, undefined);
    expect(meetingView(data, draft).didNotRun).toBe('Your reweave did not run: the writer timed out, and the weave is as you left it. To retry, write your note in the box again and reweave. Your note was: "Make the sale the main thread."');
    expect(meetingButtons(data, draft, '', false).reweave.disabled).toBe(true);
    expect(meetingPayload('reweave', data, draft, '')).toBeNull();
    expect(meetingButtons(data, draft, 'Make the sale the main thread.', false).reweave.disabled).toBe(false);
  });

  test('a send-back: the line gives the note back to write again, and Send back comes on once it is written', () => {
    const first = payloadOf(stateAt());
    const reopened = reopenedAfter(meetingPayload('send-back', first, meetingDraftOf(first, undefined), 'Rethink the money thread.'));
    const data = payloadOf(reopened);
    const draft = meetingDraftOf(data, undefined);
    expect(meetingView(data, draft).didNotRun).toBe('Your send-back did not run: the writer timed out, and the weave is as you left it. To retry, write your note in the box again and send the weave back. Your note was: "Rethink the money thread."');
    const idle = meetingButtons(data, draft, '', false);
    expect(idle.sendBack.disabled).toBe(true);
    expect(idle.reweave.disabled).toBe(true);
    expect(meetingButtons(data, draft, 'Rethink the money thread.', false).sendBack.disabled).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The pending edits across a remount and a new version
// ═══════════════════════════════════════════════════════════════════════════

describe('4.8: the pending edits and answers survive a remount of the same weave version, and clear on a new one', () => {
  const data = () => payloadOf(stateAt());
  const nextVersion = () => {
    const reworked = clone(WEAVE);
    reworked.threads[1].line = 'Marcus bragged about the sale in front of Alex.';
    return payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(reworked, MARK), humanArcRevisionCount: 1 }));
  };
  const draft = () => setQuestionAnswer(pickMeetingAngle(setThreadField(meetingWeaveOf(data().weave), 2, 'line', T3_LINE), 'a2'), 0, 'Sarah ran the bar.');

  test('the version is keyed the way computeResetKey keys the outline: the weave and both round counters', () => {
    const d = { ...data(), humanRevisionCount: 2, revisionCount: 1 };
    expect(meetingVersion(d)).toBe(computeResetKey(d.weave, 2 * 1000 + 1));
    expect(meetingVersion({ ...d, revisionCount: 0 })).not.toBe(meetingVersion(d));
    expect(meetingVersion(nextVersion())).not.toBe(meetingVersion(data()));
  });

  test('CHECKPOINT_RECEIVED keeps the meeting\'s slot and its note for the same version, and clears every other slot', () => {
    const slot = meetingPendingSlot(data(), draft());
    expect(slot).toEqual({ version: meetingVersion(data()), weave: draft() });
    const pending = { 'arc-selection': slot, 'arc-selection:note': 'Lead with the vote.', outline: { lede: {} }, 'outline:note': 'x', 'character-ids': { leftOut: {} } };
    expect(pendingEditsAfterCheckpoint(pending, 'arc-selection', data())).toEqual({ 'arc-selection': slot, 'arc-selection:note': 'Lead with the vote.' });
  });

  test('a new version, the counters moving alone, or another stop clears the meeting\'s slot too', () => {
    const pending = { 'arc-selection': meetingPendingSlot(data(), draft()), 'arc-selection:note': 'Lead with the vote.' };
    expect(pendingEditsAfterCheckpoint(pending, 'arc-selection', nextVersion())).toEqual({});
    expect(pendingEditsAfterCheckpoint(pending, 'arc-selection', { ...data(), revisionCount: 1 })).toEqual({});
    expect(pendingEditsAfterCheckpoint(pending, 'photos', data())).toEqual({});
    expect(pendingEditsAfterCheckpoint({}, 'arc-selection', data())).toEqual({});
    expect(pendingEditsAfterCheckpoint(undefined, 'arc-selection', data())).toEqual({});
  });

  test('the meeting reopens on the director\'s weave and note for the same version, and on the stop\'s weave for a new one', () => {
    const slot = meetingPendingSlot(data(), draft());
    expect(meetingDraftOf(data(), slot)).toEqual(draft());
    expect(meetingNoteOf(data(), slot, 'Lead with the vote.')).toBe('Lead with the vote.');
    expect(meetingDraftOf(nextVersion(), slot)).toEqual(meetingWeaveOf(nextVersion().weave));
    expect(meetingNoteOf(nextVersion(), slot, 'Lead with the vote.')).toBe('');
    expect(meetingDraftOf(data(), undefined)).toEqual(clone(WEAVE));
    expect(meetingNoteOf(data(), undefined, undefined)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The view models
// ═══════════════════════════════════════════════════════════════════════════

describe('4.8: the verdict, printed by code from the parse', () => {
  test('a culprit, with the charge and a split final vote', () => {
    expect(meetingVerdictView({ verdictKind: 'culprit', accused: ['Alex Reeves'], charge: 'Murder', votes: [{ option: 'Alex Reeves', count: 5, adopted: true }, { option: 'Jess Kane', count: 4 }] }))
      .toEqual({ parsed: true, who: 'Alex Reeves', charge: 'Murder', vote: 'Alex Reeves 5 (adopted by the group statement), Jess Kane 4' });
  });

  test('a verdict with no culprit, and one that blames no character', () => {
    expect(meetingVerdictView({ verdictKind: 'overdose', accused: [], charge: 'Accidental overdose' }))
      .toEqual({ parsed: true, who: 'No one: an overdose', charge: 'Accidental overdose', vote: '' });
    expect(meetingVerdictView({ verdictKind: 'culprit', accused: [], charge: 'NeurAI\'s board' }).who)
      .toBe('No character: the room blamed an institution or an unnamed person');
  });

  test('a verdict the parse did not read says so', () => {
    expect(meetingVerdictView(null)).toEqual({ parsed: false, who: '', charge: '', vote: '' });
    expect(meetingVerdictView({ verdictKind: 'culprit', accused: [], charge: '' }).parsed).toBe(false);
  });
});

describe('1B: each document a piece cites is named through evidenceIndex', () => {
  test('a document by its name and owner, matched in any case as the evidence check matches it', () => {
    expect(receiptView('ale003', INDEX)).toEqual({ id: 'ale003', label: 'ALE003 - The sale (Alex Reeves)', known: true, firstLine: 'Marcus brags about the sale.' });
    expect(receiptView('ALE003', INDEX)).toMatchObject({ label: 'ALE003 - The sale (Alex Reeves)', known: true });
  });

  test('a document the index does not hold shows as its id, and no id names no document', () => {
    expect(receiptView('zzz999', INDEX)).toEqual({ id: 'zzz999', label: 'zzz999', known: false, firstLine: '' });
    expect(receiptView('p-rescued', INDEX).label).toBe('p-rescued');
    expect(receiptView('', INDEX)).toBeNull();
    expect(receiptView(undefined, INDEX)).toBeNull();
  });
});

// Phase 4b (brief 1B; spec 5.4 and 9): the "What's behind it" fold, one function the map reuses.
describe('1B: the fold under a line lists each piece of its evidence (evidenceFoldView)', () => {
  test('each piece with its sources by name, what it shows, and "Cuts against" where it does', () => {
    expect(evidenceFoldView([
      piece(['ale003'], 'Marcus on the sale: "Worth it."'),
      piece(['ledger', 'evidence-log'], 'Five sales into Rich two minutes after the turn-in.'),
      piece(['MOR001', 'notes'], 'Morgan argues at the bar.', 'cuts-against'),
      piece(['zzz999'], 'A document the index does not hold.')
    ], INDEX)).toEqual([
      { key: 'piece-0', sources: ['ALE003 - The sale (Alex Reeves)'], shows: 'Marcus on the sale: "Worth it."', cutsAgainst: false, text: 'ALE003 - The sale (Alex Reeves): Marcus on the sale: "Worth it."' },
      { key: 'piece-1', sources: ['The ledger', 'The evidence log'], shows: 'Five sales into Rich two minutes after the turn-in.', cutsAgainst: false, text: 'The ledger and the evidence log: Five sales into Rich two minutes after the turn-in.' },
      { key: 'piece-2', sources: ['MOR001 - The envelope (Morgan Reed)', 'Your notes'], shows: 'Morgan argues at the bar.', cutsAgainst: true, text: 'Cuts against · MOR001 - The envelope (Morgan Reed) and your notes: Morgan argues at the bar.' },
      { key: 'piece-3', sources: ['zzz999'], shows: 'A document the index does not hold.', cutsAgainst: false, text: 'zzz999: A document the index does not hold.' }
    ]);
    expect(ViewLogic.CUTS_AGAINST_LABEL).toBe('Cuts against');
  });

  test('a source named in any case reads as the evidence check reads it, and a line with no evidence folds no piece', () => {
    expect(evidenceFoldView([piece(['Ledger'], 'A sale.')], {})[0].text).toBe('The ledger: A sale.');
    expect(evidenceFoldView([piece(['NOTES', 'Evidence-Log'], 'x')], {})[0].sources).toEqual(['Your notes', 'The evidence log']);
    expect(evidenceFoldView(undefined, INDEX)).toEqual([]);
    expect(evidenceFoldView([null, 'x'], INDEX)).toEqual([]);
  });
});

/** Every string the meeting's view holds, but the ids and keys its controls change the weave by. */
function viewTexts(view) {
  const texts = [];
  const walk = (value, key) => {
    if (typeof value === 'string') {
      if (!['id', 'key', 'thread', 'role', 'kind', 'value'].includes(key)) texts.push(value);
      return;
    }
    if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k));
  };
  walk(view, '');
  return texts;
}

/** A tag: an element's id, as the writer gives it (a2, t3, c2, q1), which the page no longer shows (spec 9). */
const TAG = /\b[tcqa]\d+\b/;

// Piece 3 (brief 3B; spec 2026-10-06 sections 5 and 6): the memo of angles.
describe('4.8: the meeting before any round', () => {
  const data = payloadOf(stateAt());
  const view = meetingView(data, meetingDraftOf(data, undefined));

  test('the page\'s sections, in the spec\'s order', () => {
    expect(view.order).toEqual(['verdict', 'fromYourNotes', 'angles', 'pitch', 'threads', 'connections']);
  });

  test('the verdict and "from your notes", with no thin-notes line', () => {
    expect(view.verdict).toEqual({ parsed: true, who: 'No one: an overdose', charge: 'Accidental overdose', vote: 'Overdose 6 (adopted by the group statement), Murder 2' });
    expect(view.fromYourNotes.text).toBe(WEAVE.fromYourNotes);
    expect(view.thinNotes).toBe('');
  });

  test('the angles side by side, each its number, headline and card line, angle 1 open below with no pick', () => {
    expect(view.angles.map((a) => [a.number, a.headline, a.gist, a.open, a.label])).toEqual(
      WEAVE.angles.map((a, i) => [i + 1, a.headline, a.gist, i === 0, a.headline])
    );
    expect(view.angleOpenLine).toBe('Open below');
    expect(view.angles[1].labels).toEqual({ pick: `Open the angle "${WEAVE.angles[1].headline}"` });
  });

  test('the open angle\'s pitch: its headline, story, question, why it lands and where it ends up, with the questions that sit by it', () => {
    const a1 = WEAVE.angles[0];
    expect(view.pitch).toMatchObject({ id: 'a1', number: 1, label: a1.headline });
    expect(['headline', 'story', 'question', 'lands', 'ends'].map((f) => view.pitch[f].text)).toEqual([a1.headline, a1.story, a1.question, a1.lands, a1.ends]);
    expect(view.pitch.questions.map((q) => q.id)).toEqual(['q1']);
    expect(ViewLogic.MEETING_LINE_LABELS).toMatchObject({ headline: 'Headline', story: 'The story', question: 'The question it carries', lands: 'Why it lands', ends: 'Where it ends up' });
  });

  // Phase 4b (brief 1B): each thread its name and its line, with its evidence folded; piece 3:
  // in the angle's order, the verdict's locked in.
  test('the threads in the story, in the angle\'s order, each its name and its line, the verdict\'s locked, with its evidence folded', () => {
    expect(view.threads.map((t) => [t.id, t.name, t.line, t.verdict, t.locked, t.inStory])).toEqual([
      ['t1', 'The overdose vote', WEAVE.threads[0].line, true, true, true],
      ['t2', 'The sale', WEAVE.threads[1].line, false, false, true],
      ['t3', 'The envelope', WEAVE.threads[2].line, false, false, true],
      ['t4', 'The heir', WEAVE.threads[3].line, false, false, true]
    ]);
    expect(view.threads[0].lockedLine).toBe('Always in: the article reports the verdict.');
    expect(view.threads.slice(1).every((t) => t.lockedLine === '')).toBe(true);
    expect(view.threads.map((t) => t.evidence.map((p) => p.text))).toEqual([
      ['Your notes: Alex and Morgan argued at the bar.'],
      ['ALE003 - The sale (Alex Reeves): Marcus on the sale: "Worth it. Finally worth it."'],
      ['MOR001 - The envelope (Morgan Reed): Morgan hands Riley an envelope by the bar, and Riley says "Not here."'],
      ['Paternity test result: The paternity test names Sarah Blackwood.']
    ]);
    expect(view.threads.every((t) => !t.added && !t.repeatedId && t.noEvidence === '' && t.failures.length === 0)).toBe(true);
    expect(view.evidenceTitle).toBe("What's behind it");
    expect(view.threads[1].labels).toEqual({
      fold: "What's behind it: The sale",
      flip: 'Leave out of the story: The sale',
      name: 'The name of the thread The sale',
      line: 'The line of the thread The sale',
      takeOut: 'Take out the thread you added: The sale'
    });
    expect(view).not.toHaveProperty('roles');
  });

  test('a question that sits beside a thread is in that thread\'s view, and every question is in the flat list', () => {
    expect(threadOf(view, 't2').questions.map((q) => q.id)).toEqual(['q2']);
    expect(view.questions.map((q) => [q.id, q.thread])).toEqual([['q1', ''], ['q2', 't2']]);
  });

  test('the threads left out, by name, each opening in place to its line', () => {
    expect(view.leftOut).toMatchObject({ title: 'Left out', names: 'The letter', questions: [] });
    expect(view.leftOut.threads.map((t) => [t.name, t.line, t.inStory, t.labels.flip])).toEqual([
      ['The letter', WEAVE.threads[4].line, false, 'Bring into the story: The letter']
    ]);
    expect(view.add).toEqual({
      button: 'Add a thread',
      labels: { name: 'The name of a thread to add', line: 'A thread to add, in one line' },
      placeholders: { name: 'What happened, with its people', line: 'The thread in one line' }
    });
  });

  test('each connection between the threads in the story as its line, its evidence folded, its kind unprinted', () => {
    expect(view.connections.map((c) => [c.line, c.label, c.joins, c.evidence.map((p) => p.text)])).toEqual([
      [WEAVE.connections[0].line, WEAVE.connections[0].line, '"The overdose vote" and "The envelope"', ['Your notes and MOR001 - The envelope (Morgan Reed): Morgan argues at the bar and hands Riley the envelope there.']],
      [WEAVE.connections[1].line, WEAVE.connections[1].line, '"The sale" and "The heir"', ['ALE003 - The sale (Alex Reeves) and Paternity test result: The brag and the test result come from the same night.']]
    ]);
    expect(view.connections.every((c) => !('kindLabel' in c) && !('kind' in c) && !('leftOut' in c))).toBe(true);
    // R7: the strike went from the weave, and with it each connection's strike control.
    expect(view.connections.every((c) => !('struck' in c) && !('strike' in c.labels))).toBe(true);
    expect(view).not.toHaveProperty('convergence');
    expect(view).not.toHaveProperty('strongerMainThread');
  });

  test('each question through the meeting\'s own view, with its kind, what its answer changes and its answer box', () => {
    expect(view.questions[0]).toEqual({
      key: 'question-0', index: 0, id: 'q1', kind: 'player', kindLabel: 'Player', about: 'Sarah',
      question: 'The record holds nothing Sarah did this morning: what did Sarah do?',
      changes: 'Where Sarah appears in the article.', answer: '', thread: '',
      label: 'Question about Sarah', labels: { answer: 'Your answer: The record holds nothing Sarah did this morning: what did Sarah do?' },
      marks: [], failures: []
    });
  });

  test('nothing from a round: no marks, no check, no changed edits, no round that did not run', () => {
    expect(view).toMatchObject({ marked: '', removed: [], checkFailures: [], changedEdits: [], didNotRun: '', otherConcerns: [] });
  });

  test('no line or label names an angle, a thread, a connection or a question by its id (spec 9)', () => {
    expect(viewTexts(view).filter((text) => TAG.test(text))).toEqual([]);
  });
});

describe('piece 3: the angle the director opens', () => {
  const data = payloadOf(stateAt());

  test('the pick opens its angle: its pitch, its threads in its order, the rest left out, the connections between its threads', () => {
    const view = meetingView(data, pickMeetingAngle(meetingDraftOf(data, undefined), 'a2'));
    expect(view.angles.map((a) => a.open)).toEqual([false, true, false]);
    expect(view.pitch).toMatchObject({ id: 'a2', number: 2, story: expect.objectContaining({ text: WEAVE.angles[1].story }) });
    expect(view.threads.map((t) => t.id)).toEqual(['t3', 't1']);
    expect(view.leftOut.threads.map((t) => t.id)).toEqual(['t2', 't4', 't5']);
    expect(view.leftOut.names).toBe('The sale · The heir · The letter');
    expect(view.connections.map((c) => c.id)).toEqual(['c1']);
    // A question beside a thread the open angle leaves out sits beside that thread, under the names.
    expect(view.leftOut.questions.map((q) => q.id)).toEqual(['q2']);
    expect(view.pitch.questions.map((q) => q.id)).toEqual(['q1']);
  });

  test('a question beside a thread the weave does not hold sits by the pitch (R10)', () => {
    const weave = clone(WEAVE);
    weave.questions[1].thread = 't9';
    const stale = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(weave, MARK) }));
    const view = meetingView(stale, meetingDraftOf(stale, undefined));
    expect(view.pitch.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(view.questions[1].thread).toBe('');
  });

  test('the verdict\'s thread is locked only where it is in the story', () => {
    const weave = clone(WEAVE);
    weave.angles[0].threads = ['t2', 't3'];
    const view = meetingView(payloadOf(stateAt()), weave);
    expect(threadOf(view, 't1')).toMatchObject({ inStory: false, locked: false, lockedLine: '' });
    expect(view.threads.some((t) => t.locked)).toBe(false);
  });
});

describe('4.8: the thin-notes line', () => {
  test('a weave with no "from your notes" carries the one line in its place', () => {
    const weave = clone(WEAVE);
    delete weave.fromYourNotes;
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(weave, MARK) }));
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.thinNotes).toBe(ViewLogic.THIN_NOTES_LINE);
    expect(view.thinNotes).toBe("Your notes end without your read of the session, so every angle is the writer's.");
    expect(view.fromYourNotes).toBeNull();
    expect(view.order).toContain('fromYourNotes');
  });
});

describe('4.8: the director\'s changes on the page', () => {
  const data = payloadOf(stateAt());

  // Review focus 1: a thread the director adds carries no evidence, and its fold says the map
  // writer finds it.
  test('a thread flipped in, a thread added (no evidence yet, taken out again only at this look) and an answer typed show as the director left them', () => {
    let draft = meetingDraftOf(data, undefined);
    draft = flipMeetingThread(draft, 't5', true);
    draft = addMeetingThread(draft, 'The second ledger', 'Riley kept a second ledger.');
    draft = setQuestionAnswer(draft, 0, 'Sarah ran the bar.');
    const view = meetingView(data, draft);
    expect(view.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
    expect(view.leftOut.threads).toEqual([]);
    expect(threadOf(view, 't6')).toMatchObject({
      index: 5, name: 'The second ledger', line: 'Riley kept a second ledger.', added: true, evidence: [],
      noEvidence: 'Nothing yet: the map writer finds the evidence for it.'
    });
    expect(ViewLogic.MEETING_NO_EVIDENCE_LINE).toBe('Nothing yet: the map writer finds the evidence for it.');
    expect(view.threads.filter((t) => t.added).map((t) => t.id)).toEqual(['t6']);
    expect(view.questions[0].answer).toBe('Sarah ran the bar.');
  });

  // Spec 6: a connection shows only while both its threads are in.
  test('a thread flipped out goes to the left-out names, and its connections go with it', () => {
    const view = meetingView(data, flipMeetingThread(meetingDraftOf(data, undefined), 't3', false));
    expect(view.threads.map((t) => t.id)).toEqual(['t1', 't2', 't4']);
    expect(view.leftOut.names).toBe('The envelope · The letter');
    expect(view.connections.map((c) => c.id)).toEqual(['c2']);
  });

  test('a writer\'s repeated id is flagged, so its controls stay as shown', () => {
    const weave = writersRepeat();
    const repeated = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(weave, MARK) }));
    // t5 flipped in, so the connection the writer repeated, which joins it, is on the page.
    const view = meetingView(repeated, flipMeetingThread(meetingDraftOf(repeated, undefined), 't5', true));
    expect(view.threads.concat(view.leftOut.threads).filter((t) => t.repeatedId).map((t) => t.index).sort()).toEqual([1, 5]);
    expect(view.connections.filter((c) => c.repeatedId).map((c) => c.index)).toEqual([0, 2]);
    expect(view.repeatedIdHint).toMatch(/reweave with a note, or a send-back, gives each its own id/);
  });
});

// Phase 4b (brief 1B; spec 6.3): a check still failing after the rework sits beside the line its
// place names; one with no place, or a place the page does not show, stays at the top.
describe('1B: a code check still failing sits beside the line it names', () => {
  /** The meeting when the checks' last result, on the weave in hand, holds these failures. */
  function withFailures(failures, weave = clone(WEAVE)) {
    const marked = weaveLib.withFactCheckMark(weave, MARK);
    const data = payloadOf(stateAt({ weave: marked, _arcValidation: { weaveKey: weaveLib.weaveKey(marked), passed: false, failures, concerns: [] } }));
    return meetingView(data, meetingDraftOf(data, undefined));
  }

  test('a failure about an angle, a thread, a connection or a question sits beside its line', () => {
    const view = withFailures([
      { type: 'story-terms', message: 'The thread "The envelope": its line holds the clock time "9:58".', place: 'threads[#t3]' },
      { type: 'evidence-not-in-record', message: 'The connection "The night of the sale": piece 1 names "zzz999".', place: 'connections[#c2]' },
      { type: 'story-terms', message: 'The angle "The Room Voted Overdose": its story holds the money figure "$450,000".', place: 'angles[#a1]' },
      { type: 'angle-incomplete', message: 'The angle "Sarah Inherits" has no lands.', place: 'angles[#a3]' },
      { type: 'story-terms', message: 'The thread "The letter": its line holds a clock time.', place: 'threads[#t5]' },
      { type: 'question-too-long', message: 'The question runs to 52 words.', place: 'questions[#q1]' }
    ]);
    expect(threadOf(view, 't3').failures).toEqual(['Check still failing: The thread "The envelope": its line holds the clock time "9:58".']);
    expect(view.connections[1].failures).toEqual(['Check still failing: The connection "The night of the sale": piece 1 names "zzz999".']);
    // The open angle's failure sits beside its pitch; another angle's beside its card.
    expect(view.pitch.failures).toEqual(['Check still failing: The angle "The Room Voted Overdose": its story holds the money figure "$450,000".']);
    expect(view.angles[0].failures).toEqual([]);
    expect(view.angles[2].failures).toEqual(['Check still failing: The angle "Sarah Inherits" has no lands.']);
    expect(threadOf(view, 't5').failures).toEqual(['Check still failing: The thread "The letter": its line holds a clock time.']);
    expect(view.questions[0].failures).toEqual(['Check still failing: The question runs to 52 words.']);
    expect(view.checkFailures).toEqual([]);
  });

  // Fix round, fix 1 (spec 6.3): the page shows the director's line, never the rework's message;
  // a failure stored before the line existed is read by its message.
  test("shows the director's line, not the rework's message, and a stored failure with no line by its message", () => {
    const view = withFailures([
      { type: 'evidence-not-in-record', message: 'The connection "The night of the sale": piece 1 names "zzz999".', line: 'The evidence behind the connection "The night of the sale" cites a document the record does not hold.', place: 'connections[#c2]' },
      { type: 'over-length', message: "The meeting's page runs to 470 words, past its bound of 450.", line: "The writer's part of the meeting runs to 400 words, past the 350 it may use." },
      { type: 'story-terms', message: 'The thread "The letter": its line holds a clock time.', place: 'threads[#t5]' }
    ]);
    expect(view.connections[1].failures).toEqual(['Check still failing: The evidence behind the connection "The night of the sale" cites a document the record does not hold.']);
    expect(view.checkFailures).toEqual(["Check still failing: The writer's part of the meeting runs to 400 words, past the 350 it may use."]);
    expect(threadOf(view, 't5').failures).toEqual(['Check still failing: The thread "The letter": its line holds a clock time.']);
  });

  test('a failure with no place, or one whose line the page does not show, stays at the top', () => {
    const weave = clone(WEAVE);
    delete weave.fromYourNotes;
    const view = withFailures([
      { type: 'angle-count', message: 'The weave pitches 4 angles.' },
      { type: 'from-your-notes-not-verbatim', message: '"From your notes" is not word for word.', place: 'fromYourNotes' },
      { type: 'connection-joins-unknown-thread', message: 'A connection joins a thread the weave does not hold.', place: 'connections[#c9]' }
    ], weave);
    expect(view.checkFailures).toEqual([
      'Check still failing: The weave pitches 4 angles.',
      'Check still failing: "From your notes" is not word for word.',
      'Check still failing: A connection joins a thread the weave does not hold.'
    ]);
  });
});

// Fix round, fix 2 (spec 5.3 and 6.1; Review focus 1): "Nothing yet: the map writer finds the
// evidence for it." belongs to a thread the director added, at this look or an earlier one, which
// the stop names (`directorsThreads` since fix round 4). A thread of the writer's with no evidence,
// one the director flipped into the story included (3 fix A), is a failing check, and the page
// shows the check's line beside it instead.
describe("1B fix 2: the fold says the map writer finds the evidence only for a thread the director added", () => {
  const NO_EVIDENCE = {
    type: 'thread-without-evidence',
    message: 'The thread "The envelope" is in the story with no piece of evidence that supports it. Give it the pieces of the record that tell it, at least one with the stance "supports".',
    line: 'The thread "The envelope" is in the story with nothing behind it: no piece of the record supports it.',
    place: 'threads[#t3]'
  };

  test("a writer's thread with no evidence shows the check's failure beside it, not the fold's line", () => {
    const weave = clone(WEAVE);
    weave.threads[2].evidence = [];
    const marked = weaveLib.withFactCheckMark(weave, MARK);
    const data = payloadOf(stateAt({ weave: marked, _arcValidation: { weaveKey: weaveLib.weaveKey(marked), passed: false, failures: [NO_EVIDENCE], concerns: [] } }));
    const t3 = threadOf(meetingView(data, meetingDraftOf(data, undefined)), 't3');
    expect(t3).toMatchObject({ evidence: [], noEvidence: '' });
    expect(t3.failures).toEqual([`Check still failing: ${NO_EVIDENCE.line}`]);
  });

  test("a thread the director added at an earlier look, still with no evidence, keeps the fold's line; once it has evidence, its fold lists it", () => {
    const left = clone(WEAVE);
    left.threads.push(clone(ADDED));
    left.angles[0].threads.push('t6');
    const edits = standingAtMeeting(null, WEAVE, left);
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(left, MARK), _weaveHandEdits: edits }));
    expect(data.directorsThreads).toEqual(['t6']);
    expect(threadOf(meetingView(data, meetingDraftOf(data, undefined)), 't6')).toMatchObject({
      added: false, evidence: [], noEvidence: ViewLogic.MEETING_NO_EVIDENCE_LINE
    });
    const found = clone(left);
    found.threads[5].evidence = [piece(['ledger'], 'Two ledgers for one bar.')];
    const later = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(found, MARK), _weaveHandEdits: edits }));
    expect(threadOf(meetingView(later, meetingDraftOf(later, undefined)), 't6')).toMatchObject({ noEvidence: '', evidence: [expect.objectContaining({ shows: 'Two ledgers for one bar.' })] });
  });

  test('the stop names no thread of the director\'s when the director added none and brought none in', () => {
    expect(payloadOf(stateAt()).directorsThreads).toEqual([]);
  });

  // 3 fix A: a flip makes no thread the director's to find evidence for. A writer's thread with no
  // evidence that the director flipped into the open angle shows the check's failure alone, while
  // the map writer may still name it in the gap note (lib/meeting.js meetingDirectorsThreads).
  test("a writer's thread with no evidence that the director flipped in shows the check's failure alone", () => {
    const { meetingDirectorsThreads } = require('../../lib/meeting');
    const writers = clone(WEAVE);
    writers.threads[4].evidence = [];
    const left = clone(writers);
    left.angles[0].threads.push('t5');
    const marked = weaveLib.withFactCheckMark(left, MARK);
    const failure = {
      type: 'thread-without-evidence',
      message: 'The thread "The letter" has no piece of evidence that supports it.',
      line: 'The thread "The letter" has nothing behind it: no piece of the record supports it.',
      place: 'threads[#t5]'
    };
    const state = stateAt({
      weave: marked, _weaveBaseline: writers, _weaveHandEdits: standingAtMeeting(null, writers, left),
      _arcValidation: { weaveKey: weaveLib.weaveKey(marked), passed: false, failures: [failure], concerns: [] }
    });
    expect(meetingDirectorsThreads(state)).toEqual([{ id: 't5', added: false, broughtIn: true }]);
    const data = payloadOf(state);
    expect(data.directorsThreads).toEqual([]);
    const t5 = threadOf(meetingView(data, meetingDraftOf(data, undefined)), 't5');
    expect(t5).toMatchObject({ inStory: true, evidence: [], noEvidence: '' });
    expect(t5.failures).toEqual([`Check still failing: ${failure.line}`]);
  });
});

describe('4.8: after a reweave, a send-back, and a reweave that did not run', () => {
  const left = directorsVersion();

  test('after a reweave: each line the writer changed is marked beside it, and what it took out is listed', () => {
    const reworked = clone(left);
    reworked.threads[1].line = 'Marcus bragged about the sale in front of Alex.';
    reworked.threads.splice(3, 1);
    reworked.questions.push({ id: 'q3', kind: 'pronoun', about: 'Riley', question: 'Which pronoun for Riley?', changes: 'Every line about Riley.' });
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveMarks: { round: 'reweave', from: left }, humanArcRevisionCount: 1 }));
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.marked).toBe('After your reweave, each line the writer changed from the weave you left is marked.');
    expect(threadOf(view, 't2').marks).toEqual(['Changed this round (line). Before: "Marcus bragged about the BizAI sale the night he died."']);
    expect(view.questions.find((q) => q.id === 'q3').marks).toEqual(['New this round.']);
    expect(view.removed).toEqual(['Thread "The heir": taken out this round. Before: "A paternity result names Sarah as Marcus\'s heir."']);
  });

  // R6: a round that re-cites the evidence under a line marks nothing.
  test('after a reweave that re-cited a thread\'s evidence and changed nothing else: no mark', () => {
    const reworked = clone(left);
    reworked.threads[1].evidence = [piece(['ledger'], 'The sale on the ledger.')];
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveMarks: { round: 'reweave', from: left }, humanArcRevisionCount: 1 }));
    expect(data.marks.marks).toEqual([]);
    expect(meetingView(data, meetingDraftOf(data, undefined)).marked).toBe('After your reweave, the writer changed no line of the weave you left.');
  });

  test('after a send-back: the edits its rework changed, with their reasons, and the marks, every place by its words', () => {
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads[2].line = 'Morgan paid Riley in the back room.';
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS, reasons: [{ id: 'E2', reason: 'The note asked to lead with the sale.' }] });
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report,
      _weaveMarks: { round: 'send-back', from: left }, humanArcRevisionCount: 1
    }));
    const view = meetingView(data, meetingDraftOf(data, undefined));
    // 4.10b: one line per edit. The round's mark on t3 and the changed-edit line are about the
    // same edit, so the edit's line, with its reason, stands beside t3 in the mark's place.
    expect(view.changedEdits).toEqual([]);
    expect(view.marked).toBe('After your send-back, each line the writer changed from the weave you left is marked.');
    expect(threadOf(view, 't3').marks).toEqual([
      `Thread "The envelope", line: your "${T3_LINE}" became "Morgan paid Riley in the back room." (the rework of your send-back). Why: The note asked to lead with the sale.`
    ]);
    expect(viewTexts(view).filter((text) => TAG.test(text))).toEqual([]);
  });

  test('a reweave\'s restores are not a send-back\'s changes: they are not listed', () => {
    const edits = standingAtMeeting(null, WEAVE, left);
    const report = { checked: ['E1'], changed: [{ id: 'E1', scope: 'threads', where: 'thread "t3", line', cut: false, removed: false, moved: false, director: 'x', became: 'y', pass: 'reweave', automatic: false, reason: null, restored: true }] };
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(left, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report }));
    expect(meetingView(data, meetingDraftOf(data, undefined)).changedEdits).toEqual([]);
  });

  test('a reweave that did not run: one line, and the weave as the director left it', () => {
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(left, MARK), _arcReworkTimeout: { consecutive: 1, attempt: 0, round: 'reweave', note: null, at: '2026-10-03T22:00:00.000Z' } }));
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.didNotRun).toBe('Your reweave did not run: the writer timed out, and the weave is as you left it. Reweave again to retry.');
    expect(threadOf(view, 't3').line).toBe(T3_LINE);
  });

  test('a send-back that did not run names its note, so the director can send it again', () => {
    const data = payloadOf(stateAt({ _arcReworkTimeout: { consecutive: 1, attempt: 0, round: 'send-back', note: 'Rethink the money thread.', at: null } }));
    expect(meetingView(data, meetingDraftOf(data, undefined)).didNotRun)
      .toBe('Your send-back did not run: the writer timed out, and the weave is as you left it. To retry, write your note in the box again and send the weave back. Your note was: "Rethink the money thread."');
  });
});

// Fix round 1, finding 2. Each mark after a round sits beside the line it is about, and a
// mark whose line the page does not show is listed with its place, as the page names it: a
// line or an element the round took out, or a question the meeting does not ask. No mark is
// lost, so the banner's "each line the writer changed ... is marked" holds.
describe('4.8 fix round 1: every mark after a round shows on the page', () => {
  /** How many marks the page shows: beside its lines, and listed with their places. */
  function marksShown(view) {
    return [view.fromYourNotes, view.pitch]
      .concat(view.angles, view.threads, view.leftOut.threads, view.connections, view.questions)
      .filter(Boolean)
      .reduce((n, line) => n + line.marks.length, 0) + view.removed.length + view.otherMarks.length;
  }

  /** The meeting after a reweave whose rework turned the director's version `left` into `reworked`. */
  function afterReweave(left, reworked) {
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveBaseline: clone(reworked),
      _weaveMarks: { round: 'reweave', from: left }, humanArcRevisionCount: 1
    }));
    return { data, view: meetingView(data, meetingDraftOf(data, undefined)) };
  }

  test('a round that took out "from your notes": the mark is listed under the line\'s name, and the thin-notes line stays off', () => {
    const reworked = clone(WEAVE);
    delete reworked.fromYourNotes;
    const { data, view } = afterReweave(clone(WEAVE), reworked);
    expect(view.fromYourNotes).toBeNull();
    expect(view.removed).toEqual([`From your notes: taken out this round. Before: "${WEAVE.fromYourNotes}"`]);
    expect(view.thinNotes).toBe('');
    expect(marksShown(view)).toBe(data.marks.marks.length);
  });

  test('a question the meeting does not ask: the mark is listed with its place and what it holds now, by its words', () => {
    const reworked = clone(WEAVE);
    reworked.questions.push({ id: 'q3', kind: 'player', about: 'Riley', question: 'What did Riley do at the bar?', changes: '' });
    const { data, view } = afterReweave(clone(WEAVE), reworked);
    expect(view.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(view.otherMarks).toEqual(['The question about "Riley": new this round. Now: "What did Riley do at the bar?"']);
    expect(marksShown(view)).toBe(data.marks.marks.length);
  });

  test('a round that changed a line the page shows, took a thread out and dropped "from your notes": every mark shows', () => {
    const left = directorsVersion();
    const reworked = clone(left);
    delete reworked.fromYourNotes;
    reworked.threads[1].line = 'Marcus bragged about the sale in front of Alex.';
    reworked.threads.splice(3, 1);
    const { data, view } = afterReweave(left, reworked);
    expect(data.marks.marks).toHaveLength(3);
    expect(marksShown(view)).toBe(3);
    expect(threadOf(view, 't2').marks).toHaveLength(1);
    expect(view.removed.map((line) => line.split(':')[0])).toEqual(['From your notes', 'Thread "The heir"']);
  });

  // R1: a connection's kind stays underneath, unprinted, so a round that changed it marks no line.
  test('a round that changed a connection\'s kind alone marks no line, and the threads it joins read by name', () => {
    const reworked = clone(WEAVE);
    reworked.connections[0].kind = 'moment';
    reworked.connections[1].joins = ['t2', 't1'];
    const { data, view } = afterReweave(clone(WEAVE), reworked);
    expect(data.marks.marks.map((m) => m.path)).toEqual(['connections[#c1].kind', 'connections[#c2].joins']);
    expect(view.connections[0].marks).toEqual([]);
    expect(view.connections[1].marks).toEqual(['Changed this round (joins). Before: "The sale and The heir"']);
  });

  test('the thin-notes line still shows when the weave never had "from your notes"', () => {
    const left = clone(WEAVE);
    delete left.fromYourNotes;
    const reworked = clone(left);
    reworked.threads[1].line = 'Marcus bragged about the sale in front of Alex.';
    const { view } = afterReweave(left, reworked);
    expect(view.thinNotes).toBe(ViewLogic.THIN_NOTES_LINE);
    expect(threadOf(view, 't2').marks).toEqual([`Changed this round (line). Before: "${WEAVE.threads[1].line}"`]);
  });

  test('a concern whose only place is a line the page does not show is listed on its own', () => {
    const weave = clone(WEAVE);
    delete weave.fromYourNotes;
    const data = { ...payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(weave, MARK) })), concerns: [{ text: 'Director\'s edit E4: a place the page does not show.', editIds: ['E4'], places: [{ id: 'E4', path: 'fromYourNotes', where: 'fromYourNotes' }] }] };
    expect(meetingView(data, meetingDraftOf(data, undefined)).otherConcerns).toEqual(['Concern: a place the page does not show.']);
  });
});

describe('4.8: with a failing check and with a concern', () => {
  const typed = clone(WEAVE);
  typed.threads.push(clone(ADDED));
  const weave = weaveLib.withFactCheckMark(typed, MARK);
  const state = stateAt({
    weave,
    _weaveHandEdits: standingAtMeeting(null, WEAVE, typed),
    _arcValidation: {
      weaveKey: weaveLib.weaveKey(weave), passed: false,
      failures: [{ type: 'over-length', message: "The meeting's page runs to 340 words, past its bound of 300." }],
      concerns: ['Director\'s edit E1: The thread "The second ledger" carries the room\'s verdict and is left out.']
    }
  });
  const data = payloadOf(state);
  const view = meetingView(data, meetingDraftOf(data, undefined));

  test('a code check still failing with no place, in one line at the top', () => {
    expect(view.checkFailures).toEqual(["Check still failing: The meeting's page runs to 340 words, past its bound of 300."]);
  });

  test('the concern sits beside the line of the edit it is about', () => {
    expect(threadOf(view, 't6').concerns).toEqual(['Concern: The thread "The second ledger" carries the room\'s verdict and is left out.']);
    expect(view.threads.filter((t) => t.id !== 't6').every((t) => t.concerns.length === 0)).toBe(true);
    expect(view.otherConcerns).toEqual([]);
  });

  test('a concern whose place is not on the page is listed on its own', () => {
    const odd = { ...data, concerns: [{ text: 'Director\'s edit E9: somewhere else.', editIds: ['E9'], places: [{ id: 'E9', path: 'threads[#index-3]', where: 'thread 4' }] }] };
    expect(meetingView(odd, meetingDraftOf(odd, undefined)).otherConcerns).toEqual(['Concern: somewhere else.']);
  });
});

// Fix round 1, finding 3. One builder phrases an entry of the hand-edit report, and one lists
// the standing notes, for every stop. The meeting reads steeringView's own: it names a place
// as its page heads it, with no edit id (the meeting shows none), and a role as its picker
// names it. Phase 4b (brief 1B; spec 9): an element by its words, never its id, and a value
// the diff wrote as an element's fields by its words too.
describe('4.8 fix round 1: the meeting phrases its report and its notes through the builders every stop reads', () => {
  const sendBack = (fields) => ({ cut: false, removed: false, moved: false, pass: SEND_BACK_PASS, automatic: false, reason: null, restored: false, ...fields });
  const ADDED_TEXT = 'id: t6; name: The second ledger; line: Riley kept a second ledger.';
  const ENTRIES = [
    sendBack({ id: 'E1', scope: 'fromYourNotes', where: 'fromYourNotes', director: 'Riley watched the ledger all morning', became: 'Riley watched the ledger.', reason: 'The note asked to lead with the sale.' }),
    sendBack({ id: 'E2', scope: 'threads', where: 'thread "t3", line', director: T3_LINE, became: 'Morgan paid Riley in the back room.' }),
    sendBack({ id: 'E3', scope: 'threads', where: 'thread "t6", added', director: ADDED_TEXT, became: null }),
    sendBack({ id: 'E4', scope: 'threads', where: 'thread "t2", line', removed: true, director: 'Who paid Riley?', became: 'Marcus bragged about the sale. Who paid Riley?' })
  ];
  const REPORT = { checked: ENTRIES.map((e) => e.id), changed: ENTRIES };
  const meetingLines = () => {
    const data = { ...payloadOf(stateAt()), handEditReport: REPORT };
    return meetingView(data, meetingDraftOf(data, undefined)).changedEdits;
  };

  test('each edit a send-back changed, in the wording every stop uses, its place as the meeting heads it, each element by its words', () => {
    expect(meetingLines()).toEqual([
      'From your notes: your "Riley watched the ledger all morning" became "Riley watched the ledger." (the rework of your send-back). Why: The note asked to lead with the sale.',
      `Thread "The envelope", line: your "${T3_LINE}" became "Morgan paid Riley in the back room." (the rework of your send-back). No reason given.`,
      'Thread "The second ledger", added: your "The second ledger: Riley kept a second ledger." is gone (the rework of your send-back). No reason given.',
      'Thread "The sale", line: a sentence you removed came back as "Marcus bragged about the sale. Who paid Riley?" (the rework of your send-back). No reason given.'
    ]);
  });

  test('each of the meeting\'s lines is steeringView\'s for the same entry, but for the place and the words of a value', () => {
    const steering = ViewLogic.steeringView(REPORT, []).changedEdits.map((e) => e.line);
    const meeting = meetingLines();
    const PLACES = {
      E1: ['E1, fromYourNotes', 'From your notes'],
      E2: ['E2, thread "t3", line', 'Thread "The envelope", line'],
      E3: ['E3, thread "t6", added', 'Thread "The second ledger", added'],
      E4: ['E4, thread "t2", line', 'Thread "The sale", line']
    };
    const VALUES = [[ADDED_TEXT, 'The second ledger: Riley kept a second ledger.']];
    ENTRIES.forEach((entry, i) => {
      const [steeringPlace, meetingPlace] = PLACES[entry.id];
      expect(steering[i].startsWith(`${steeringPlace}: `)).toBe(true);
      const rest = VALUES.reduce((line, [from, to]) => line.replace(from, to), steering[i].slice(steeringPlace.length));
      expect(meeting[i]).toBe(meetingPlace + rest);
    });
  });

  test('the standing notes are one builder\'s, under the console\'s stop labels, at the meeting and wherever steeringView lists them', () => {
    const LABELS = { 'arc-selection': 'Story meeting', outline: 'Map', article: 'Article' };
    const notes = [
      { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the heir thread.' },
      { gate: 'article', kind: 'approval', round: 1, text: 'Keep the closing short.' },
      { gate: 'outline', text: '  ' }
    ];
    expect(ViewLogic.steeringView(null, notes, LABELS).notes).toEqual(meetingStandingNotes(notes, LABELS).items);
    expect(meetingStandingNotes(notes, LABELS).items.map((n) => n.label)).toEqual(['Story meeting, rework note 1', 'Article, approval note 1']);
  });
});

describe('4.8: the standing notes folded under the note box, and the rollback\'s cost', () => {
  const LABELS = { 'arc-selection': 'Story meeting', outline: 'Map', article: 'Article' };

  test('each standing note under its stop\'s label, its kind and its round', () => {
    const notes = meetingStandingNotes([
      { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the heir thread.' },
      { gate: 'outline', kind: 'approval', round: 2, text: '  Keep the closing short.  ' },
      { gate: 'arc-selection', text: '   ' },
      null
    ], LABELS);
    expect(notes).toEqual({
      any: true,
      title: 'Standing notes (2)',
      items: [
        { key: 'note-0', label: 'Story meeting, rework note 1', text: 'Drop the heir thread.' },
        { key: 'note-1', label: 'Map, approval note 2', text: 'Keep the closing short.' }
      ]
    });
    expect(meetingStandingNotes([], LABELS)).toEqual({ any: false, title: 'Standing notes (0)', items: [] });
  });

  test('going back to the meeting costs no model call (R9); the map has its own line (4.14b), and every other point keeps the general warning', () => {
    expect(rollbackWarningLine('arc-selection')).toBe(ViewLogic.MEETING_ROLLBACK_LINE);
    expect(ViewLogic.MEETING_ROLLBACK_LINE).toMatch(/story meeting reopens as you left it, with no model call/);
    expect(rollbackWarningLine('outline')).toBe(ViewLogic.MAP_ROLLBACK_LINE);
    expect(rollbackWarningLine('photos')).toBe('This will clear all data from this point forward.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5c: the meeting's follow-ups on the screen
// ═══════════════════════════════════════════════════════════════════════════

describe("4.5c: the console's copies of the weave's fields and elements are the server's", () => {
  test('WEAVE_TEXT_FIELDS and ELEMENT_WORDS are lib/hand-edit-diff.js WEAVE_FIELDS and WEAVE_ELEMENTS', () => {
    const { _testing } = require('../../lib/hand-edit-diff');
    expect(ViewLogic.WEAVE_TEXT_FIELDS).toEqual([..._testing.WEAVE_FIELDS]);
    expect(ViewLogic.ELEMENT_WORDS).toEqual(_testing.WEAVE_ELEMENTS);
  });
});

describe("3 fix A: the console's words for a line of an angle's pitch are the meeting's", () => {
  // One table names each line of the pitch: the page's headings (MEETING_LINE_LABELS), with the
  // card line, which the pitch does not head. A later stop names the same lines through
  // lib/meeting.js ANGLE_FIELD_PLACES, each as a phrase that may open on "the".
  test('ANGLE_FIELD_WORDS names each angle field as ANGLE_FIELD_PLACES does, without its "the"', () => {
    const { ANGLE_FIELD_PLACES } = require('../../lib/meeting');
    expect(Object.keys(ViewLogic.ANGLE_FIELD_WORDS).sort()).toEqual(Object.keys(ANGLE_FIELD_PLACES).sort());
    expect(Object.keys(ANGLE_FIELD_PLACES).sort()).toEqual([...weaveLib.ANGLE_FIELDS].sort());
    for (const field of Object.keys(ANGLE_FIELD_PLACES)) {
      expect(ViewLogic.ANGLE_FIELD_WORDS[field]).toBe(ANGLE_FIELD_PLACES[field].replace(/^the /, ''));
    }
  });

  test('each pitch line the page heads is named by its heading', () => {
    for (const field of Object.keys(ViewLogic.ANGLE_FIELD_WORDS)) {
      if (!Object.prototype.hasOwnProperty.call(ViewLogic.MEETING_LINE_LABELS, field)) continue;
      const heading = ViewLogic.MEETING_LINE_LABELS[field];
      expect(ViewLogic.ANGLE_FIELD_WORDS[field]).toBe((heading.charAt(0).toLowerCase() + heading.slice(1)).replace(/^the /, ''));
    }
    expect(ViewLogic.ANGLE_FIELD_WORDS.gist).toBe('card line');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Piece 3 (brief 3C; R1, R2; Review focus 1 and 3): the director's edits on angles at the meeting.
// A line of the pitch and each thread flipped are the director's changes; the pick is none. The
// round's marks and the edits a round changed name each by its words, never by an id.
// ═══════════════════════════════════════════════════════════════════════════
describe("3C: the director's edits on angles at the meeting", () => {
  const data = () => payloadOf(stateAt());
  const untouched = () => meetingWeaveOf(data().weave);
  /** The thread "The letter" (t5), which no angle tells, brought into the open angle. */
  const flipped = () => flipMeetingThread(untouched(), 't5', true);
  const pitched = () => setAngleField(untouched(), 'a1', 'lands', 'Every player watched the vote go to overdose.');

  test('a flip or a line of the pitch is something to fit in; the pick alone, or answers alone, is not (Review focus 3)', () => {
    expect(meetingButtons(data(), flipped(), '', false).reweave.disabled).toBe(false);
    expect(meetingButtons(data(), pitched(), '', false).reweave.disabled).toBe(false);
    expect(meetingButtons(data(), pickMeetingAngle(untouched(), 'a2'), '', false).reweave.disabled).toBe(true);
    expect(meetingButtons(data(), setQuestionAnswer(untouched(), 0, 'Sarah ran the bar.'), '', false).reweave.disabled).toBe(true);
    // The gate takes each reweave the console offers.
    [flipped(), pitched()].forEach((weave) => {
      expect(meetingResume(meetingPayload('reweave', data(), weave, ''), stateAt()).error).toBeNull();
    });
  });

  // Fix round 1, findings 1 and 2: the gate stores every angle the director did not send as the
  // meeting showed it (R9), so a change left on an angle they switched away from is nothing to fit in.
  test("a change left on an angle the director switched away from is not something to fit in; a thread's line is, whichever angle goes (R9)", () => {
    const onAngle2ThenBack = (change) => pickMeetingAngle(change(pickMeetingAngle(untouched(), 'a2')), 'a1');
    const pitchedAway = onAngle2ThenBack((w) => setAngleField(w, 'a2', 'story', 'Morgan paid Riley at the bar, and the room never asked why.'));
    const flippedAway = onAngle2ThenBack((w) => flipMeetingThread(w, 't5', true));
    [pitchedAway, flippedAway].forEach((weave) => {
      expect(meetingButtons(data(), weave, '', false).reweave.disabled).toBe(true);
      expect(meetingPayload('reweave', data(), weave, '')).toBeNull();
      // The gate refuses the same version as empty.
      expect(meetingResume({ meeting: 'reweave', weave }, stateAt()).error).toMatch(/carries no change to an angle or a thread and no note/);
    });
    const threadAway = onAngle2ThenBack((w) => setThreadField(w, 2, 'line', T3_LINE));
    expect(meetingButtons(data(), threadAway, '', false).reweave.disabled).toBe(false);
    expect(meetingResume(meetingPayload('reweave', data(), threadAway, ''), stateAt()).error).toBeNull();
  });

  test('the console stores the angles the director did not send as lib/meeting.js withUnsentAnglesAsShown does, on one corpus (R9)', () => {
    const { withUnsentAnglesAsShown } = require('../../lib/meeting');
    const shown = () => clone(WEAVE);
    const corpus = [
      ['the weave as shown', () => [shown(), shown()]],
      ['angle 2 picked, its story rewritten', () => { const w = shown(); w.picked = 'a2'; w.angles[1].story = 'x'; return [w, shown()]; }],
      ['angle 2 rewritten and a thread flipped into it, angle 1 picked', () => { const w = shown(); w.picked = 'a1'; w.angles[1].story = 'x'; w.angles[1].threads.push('t5'); return [w, shown()]; }],
      ['angle 2 rewritten, no pick', () => { const w = shown(); w.angles[1].ends = 'x'; return [w, shown()]; }],
      ['the angles in another order, the first open by order alone', () => { const w = shown(); w.angles.reverse(); w.angles[2].story = 'x'; return [w, shown()]; }],
      ['a thread renamed with angle 3 picked', () => { const w = shown(); w.picked = 'a3'; w.threads[1].name = 'The brag'; return [w, shown()]; }],
      ["the writer's repeated angle id, both angles under it rewritten", () => { const b = shown(); b.angles[1].id = 'a1'; const w = clone(b); w.angles[0].story = 'x'; w.angles[1].story = 'y'; return [w, b]; }],
      ['an open angle with no id', () => { const b = shown(); b.angles[0].id = ''; const w = clone(b); w.angles[1].story = 'x'; return [w, b]; }],
      ['no weave shown', () => [shown(), null]],
      ['a shown weave with no angles', () => [shown(), { threads: [] }]]
    ];
    corpus.forEach(([name, build]) => {
      const [left, meetingShowed] = build();
      expect([name, ViewLogic.withUnsentAnglesAsShown(clone(left), clone(meetingShowed))])
        .toEqual([name, withUnsentAnglesAsShown(clone(left), clone(meetingShowed))]);
    });
  });

  test('the console offers a reweave exactly when the gate takes one, on one corpus (ruling 5, R9)', () => {
    const onThenBack = (angleId, change) => (w) => pickMeetingAngle(change(pickMeetingAngle(w, angleId)), 'a1');
    const corpus = [
      ['nothing changed', (w) => w],
      ['the pick alone', (w) => pickMeetingAngle(w, 'a3')],
      ['an answer alone', (w) => setQuestionAnswer(w, 0, 'Sarah ran the bar.')],
      ['a line of the open pitch', (w) => setAngleField(w, 'a1', 'lands', 'Every player watched the vote go to overdose.')],
      ['a flip in the open angle', (w) => flipMeetingThread(w, 't5', true)],
      ["angle 2's story, then back to angle 1", onThenBack('a2', (w) => setAngleField(w, 'a2', 'story', 'x'))],
      ['a flip in angle 3, then back to angle 1', onThenBack('a3', (w) => flipMeetingThread(w, 't2', true))],
      ['angle 2 picked, its story rewritten', (w) => setAngleField(pickMeetingAngle(w, 'a2'), 'a2', 'story', 'x')],
      ["a thread's line, on angle 2, then back to angle 1", onThenBack('a2', (w) => setThreadField(w, 2, 'line', T3_LINE))],
      ['a thread added', (w) => addMeetingThread(w, ADDED.name, ADDED.line)]
    ];
    corpus.forEach(([name, change]) => {
      const weave = change(untouched());
      const offered = !meetingButtons(data(), weave, '', false).reweave.disabled;
      const taken = meetingResume({ meeting: 'reweave', weave }, stateAt()).error === null;
      expect([name, offered]).toEqual([name, taken]);
    });
  });

  test('after a reweave: a flip and a line of the pitch the round changed are marked beside their lines, by their words', () => {
    const left = untouched();
    const reworked = clone(left);
    reworked.angles[0].lands = 'The players remember the deadlock.';
    reworked.angles[0].threads.push('t5');
    reworked.angles[1].threads = reworked.angles[1].threads.filter((id) => id !== 't3');
    const view = meetingView(...((d) => [d, meetingDraftOf(d, undefined)])(payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveMarks: { round: 'reweave', from: left }, humanArcRevisionCount: 1
    }))));
    expect(view.pitch.marks).toEqual([`Changed this round (why it lands). Before: "${WEAVE.angles[0].lands}"`]);
    expect(threadOf(view, 't5').marks).toEqual(['Brought into the story this round.']);
    expect(threadOf(view, 't3').marks).toEqual([`Left out of the story of "${WEAVE.angles[1].headline}" this round.`]);
    expect(viewTexts(view).filter((text) => TAG.test(text))).toEqual([]);
  });

  test("after a send-back that undid a flip and rewrote the director's line of the pitch: one line each, with its reason, and no id", () => {
    const left = pitched();
    left.angles[0].threads.push('t5');
    const edits = standingAtMeeting(null, WEAVE, left);
    expect(edits.edits.map((edit) => edit.path)).toEqual(['angles[#a1].lands', 'angles[#a1].threads[#t5]']);
    const reworked = clone(left);
    reworked.angles[0].lands = 'The deadlock is what the players remember.';
    reworked.angles[0].threads = reworked.angles[0].threads.filter((id) => id !== 't5');
    const report = reportAfterPass(null, {
      edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS,
      reasons: [{ id: 'E1', reason: 'The note asked to lead with the deadlock.' }, { id: 'E2', reason: 'The note kept the letter out' }]
    });
    const d = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report,
      _weaveMarks: { round: 'send-back', from: left }, humanArcRevisionCount: 1
    }));
    const view = meetingView(d, meetingDraftOf(d, undefined));
    expect(view.pitch.marks).toEqual([
      `The angle "${WEAVE.angles[0].headline}", why it lands: your "Every player watched the vote go to overdose." became "The deadlock is what the players remember." (the rework of your send-back). Why: The note asked to lead with the deadlock.`
    ]);
    expect(threadOf(view, 't5').marks).toEqual([
      'Thread "The letter": the rework of your send-back left it out of the story, which you brought it into. Why: The note kept the letter out.'
    ]);
    expect(view.changedEdits).toEqual([]);
    expect(viewTexts(view).filter((text) => TAG.test(text))).toEqual([]);
  });

  test("a flip's entry and its mark are about one edit; a thread's own field is not the flip (markOfEntry)", () => {
    const { markOfEntry } = ViewLogic;
    const entry = { where: 'angle "a1", thread "t5", brought in', flip: 'in' };
    expect(markOfEntry({ path: 'angles[#a1].threads[#t5]', before: '', after: 'The letter' }, entry)).toBe(true);
    expect(markOfEntry({ path: 'threads[#t5]', before: 'x', after: '' }, entry)).toBe(true);
    expect(markOfEntry({ path: 'threads[#t5].line', before: 'a', after: 'b' }, entry)).toBe(false);
    expect(markOfEntry({ path: 'angles[#a1].threads[#t2]', before: '', after: 'The sale' }, entry)).toBe(false);
  });

  test("a question moved beside another thread reads by the threads' names, never as a stronger main thread", () => {
    const left = untouched();
    const reworked = clone(left);
    reworked.questions[1].thread = 't3';
    const view = meetingView(...((d) => [d, meetingDraftOf(d, undefined)])(payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveMarks: { round: 'reweave', from: left }, humanArcRevisionCount: 1
    }))));
    expect(view.questions.find((q) => q.id === 'q2').marks).toEqual(['Changed this round (thread). Before: "The sale"']);
  });
});

describe('4.5c: after a round that did not run, the retry line and Approve read what the note box holds', () => {
  const NOTE_KEY = ViewLogic.noteSlotKey('arc-selection');
  const LINE = 'the writer timed out, and the weave is as you left it.';

  /**
   * A director's round whose rework times out, as the console lives it: send() saves the draft
   * and the note in the meeting's pending slot before the post; the gate takes the round;
   * incrementArcRevision zeroes the automatic count and reviseArcs' timeout gives the round
   * back; CHECKPOINT_RECEIVED keeps the slot while the stop shows the same weave version
   * (pendingEditsAfterCheckpoint); and the meeting reopens on meetingDraftOf and meetingNoteOf.
   */
  function reopened(action, note, { change, before = stateAt() } = {}) {
    const data0 = payloadOf(before);
    const draft0 = change ? change(meetingDraftOf(data0, undefined)) : meetingDraftOf(data0, undefined);
    const pending = { 'arc-selection': meetingPendingSlot(data0, draft0), [NOTE_KEY]: note };
    const taken = meetingResume(meetingPayload(action, data0, draft0, note), before);
    expect(taken.error).toBeNull();
    const after = {
      ...before, ...taken.stateUpdates, arcRevisionCount: 0, humanArcRevisionCount: before.humanArcRevisionCount,
      _meetingRound: null, _arcFeedback: null,
      _arcReworkTimeout: { consecutive: 1, attempt: 0, round: action, note: taken.stateUpdates._arcFeedback, at: '2026-10-03T22:00:00.000Z' }
    };
    const data = payloadOf(after);
    const kept = pendingEditsAfterCheckpoint(pending, 'arc-selection', data);
    return { after, data, draft: meetingDraftOf(data, kept['arc-selection']), box: meetingNoteOf(data, kept['arc-selection'], kept[NOTE_KEY]) };
  }

  test('a reweave whose note the reopened box holds: the line says to reweave again, and Reweave is on', () => {
    const { data, draft, box } = reopened('reweave', 'Make the sale the main thread.');
    expect(box).toBe('Make the sale the main thread.');
    expect(meetingView(data, draft, box).didNotRun).toBe(`Your reweave did not run: ${LINE} Your note is in the box: reweave again to retry.`);
    expect(meetingButtons(data, draft, box, false).reweave.disabled).toBe(false);
  });

  test('a send-back whose note the reopened box holds: the line says to send the weave back again', () => {
    const { data, draft, box } = reopened('send-back', 'Rethink the money thread.');
    expect(box).toBe('Rethink the money thread.');
    expect(meetingView(data, draft, box).didNotRun).toBe(`Your send-back did not run: ${LINE} Your note is in the box: send the weave back again to retry.`);
  });

  test('a box the reopened meeting left empty: the line gives the note back and asks for it again', () => {
    // The round carried a change, so the meeting reopened on a new weave version.
    const changed = reopened('reweave', 'Make the sale the main thread.', { change: (w) => setThreadField(w, 2, 'line', T3_LINE) });
    expect(changed.box).toBe('');
    expect(meetingView(changed.data, changed.draft, changed.box).didNotRun)
      .toBe(`Your reweave did not run: ${LINE} To retry, write your note in the box again and reweave. Your note was: "Make the sale the main thread."`);
    // An automatic pass before the round moves the version too.
    const counted = reopened('send-back', 'Rethink the money thread.', { before: stateAt({ arcRevisionCount: 1 }) });
    expect(counted.box).toBe('');
    expect(meetingView(counted.data, counted.draft, counted.box).didNotRun)
      .toBe(`Your send-back did not run: ${LINE} To retry, write your note in the box again and send the weave back. Your note was: "Rethink the money thread."`);
  });

  test('the note restored into the box goes with the round it was written for: Approve asks to keep it, as an approval note, or to clear it', () => {
    const { after, data, draft, box } = reopened('reweave', 'Make the sale the main thread.');
    expect(ViewLogic.meetingApproveAsk(data, box)).toEqual({
      question: 'The note in the box was written for your reweave, which did not run. Approve with it as an approval note, which every later writer reads, or clear it?',
      keep: { label: 'Keep it and approve', ariaLabel: 'Approve the weave, with the note in the box as an approval note' },
      clear: { label: 'Clear it and approve', ariaLabel: 'Clear the note box, then approve the weave' }
    });
    // Each answer approves, with a payload the gate takes: the note as an approval note, or none.
    const kept = meetingResume(meetingPayload('approve', data, draft, box), after);
    expect(kept.error).toBeNull();
    expect(kept.note).toEqual({ text: 'Make the sale the main thread.', kind: 'approval' });
    const cleared = meetingResume(meetingPayload('approve', data, draft, ''), after);
    expect(cleared.error).toBeNull();
    expect(cleared.note).toBeNull();
    // A send-back's note is asked about by its round.
    const sentBack = reopened('send-back', 'Rethink the money thread.');
    expect(ViewLogic.meetingApproveAsk(sentBack.data, sentBack.box).question).toMatch(/^The note in the box was written for your send-back, which did not run\./);
    // A note typed at this look, an empty box, and a meeting with no round that did not run ask nothing.
    expect(ViewLogic.meetingApproveAsk(data, 'Keep the heir thread out.')).toBeNull();
    expect(ViewLogic.meetingApproveAsk(data, '')).toBeNull();
    expect(ViewLogic.meetingApproveAsk(payloadOf(stateAt()), 'Make the sale the main thread.')).toBeNull();
  });
});

// Review of 4.5c, finding 2: the console reads the director's changes against the weave the
// meeting showed, and the gate now reads the place of each standing edit the same way
// (lib/hand-edit-diff.js withShownEdits), so the gate takes every reweave the console offers,
// with a round since the last look or without one. With nothing changed, no note and no edit
// standing, both refuse it. (With an edit standing and nothing changed at this look, the gate
// takes a reweave, which the console does not offer: 4.5b's rule for an empty reweave beside
// 4.8's ruling 5.)
describe('4.5c fix round 1: the gate takes every reweave the console offers, with or without a round since', () => {
  const { settleEdits, carriedEdits, REWEAVE_PASS } = require('../../lib/hand-edit-diff');
  const rewriteT3 = (w) => setThreadField(w, 2, 'line', T3_LINE);
  const writersT3 = (w) => setThreadField(w, 2, 'line', WEAVE.threads[2].line);
  const NOTES = 'Riley watched the ledger and the bar all morning';
  const rewriteNotes = (w) => ({ ...w, fromYourNotes: NOTES });
  const writersNotes = (w) => ({ ...w, fromYourNotes: WEAVE.fromYourNotes });

  /** The director acts at the meeting, as the gate takes it: the state after, with no pass since (R9 keeps it so). */
  function acted(state, action, change) {
    const data = payloadOf(state);
    const taken = meetingResume(meetingPayload(action, data, change(meetingDraftOf(data, undefined)), ''), state);
    expect(taken.error).toBeNull();
    return { ...state, ...taken.stateUpdates };
  }

  /** A reweave that runs and keeps every line of the director's: code settles it, and its weave is the writer's last. */
  function ranRound(state) {
    const before = weaveLib.weaveForPrompt(state.weave);
    const { output } = settleEdits(null, { edits: carriedEdits(state._weaveHandEdits, before), before, after: clone(before), pass: REWEAVE_PASS });
    return {
      ...state, weave: weaveLib.withFactCheckMark(output, MARK), _weaveBaseline: weaveLib.weaveForPrompt(output),
      _meetingRound: null, humanArcRevisionCount: state.humanArcRevisionCount + 1
    };
  }

  const CASES = [
    ["rewrite again a thread's line set back at an approve, after a round kept it", () => acted(ranRound(acted(stateAt(), 'reweave', rewriteT3)), 'approve', writersT3), rewriteT3, true],
    ['rewrite again "from your notes" set back at an approve, after a round kept it', () => acted(ranRound(acted(stateAt(), 'reweave', rewriteNotes)), 'approve', writersNotes), rewriteNotes, true],
    ["set back to the writer's a thread's line rewritten at an approve", () => acted(stateAt(), 'approve', rewriteT3), writersT3, true],
    ['leave the weave as the meeting showed it, with no edit standing', () => stateAt(), (w) => w, false],
    ['only answer a question', () => stateAt(), (w) => setQuestionAnswer(w, 0, 'Sarah ran the bar.'), false],
    // Piece 3 (brief 3C; R1, R2; Review focus 1 and 3): a line of the pitch and a flip are the
    // director's to fit in, at any look; the pick alone is not.
    ['only pick another angle', () => stateAt(), (w) => pickMeetingAngle(w, 'a3'), false],
    ["rewrite a line of the open angle's pitch", () => stateAt(), (w) => setAngleField(w, 'a1', 'lands', 'The players remember the deadlock.'), true],
    ['flip a thread into the open angle', () => stateAt(), (w) => flipMeetingThread(w, 't5', true), true],
    ['flip again a thread flipped in, kept by a round, and flipped out at an approve', () => acted(ranRound(acted(stateAt(), 'reweave', (w) => flipMeetingThread(w, 't5', true))), 'approve', (w) => flipMeetingThread(w, 't5', false)), (w) => flipMeetingThread(w, 't5', true), true]
  ];

  test.each(CASES)('%s', (_name, build, change, offered) => {
    const state = build();
    const data = payloadOf(state);
    const left = change(meetingDraftOf(data, undefined));
    expect(meetingButtons(data, left, '', false).reweave.disabled).toBe(!offered);
    const gate = meetingResume({ meeting: 'reweave', weave: meetingWeaveOf(left) }, state);
    expect(gate.error === null).toBe(offered);
    if (!offered) expect(gate.error).toMatch(/carries no change to an angle or a thread and no note/);
  });
});

// Review of 4.5c, finding 1: the note of a round that did not run is the director's to send
// again. The stop lists it in the note box, not among the standing notes, and the director's
// next action files it or leaves it out (server.js withdrawUnrunRoundNote), so Approve's
// question tells the truth: keeping it files an approval note, and clearing it files none.
describe('4.5c fix round 1: the reopened meeting lists the round\'s note in the box, not among the standing notes', () => {
  const LABELS = { 'arc-selection': 'Story meeting', outline: 'Map', article: 'Article' };
  const NOTE = 'Make the sale the main thread.';
  const EARLIER = { gate: 'outline', kind: 'approval', round: 1, stopRound: 1, text: 'Keep the bonus beat.', at: 't0' };

  test('the standing notes leave out the note the round filed, and Approve asks about the note in the box', () => {
    const before = stateAt({ directorGateNotes: [EARLIER] });
    const taken = meetingResume(meetingPayload('reweave', payloadOf(before), meetingWeaveOf(before.weave), NOTE), before);
    expect(taken.error).toBeNull();
    // The note as server.js appendGateNote files it with the round, and the round's rework timing out.
    const filed = { gate: 'arc-selection', kind: 'rejection', round: 1, stopRound: 1, text: NOTE, at: 't1' };
    const reopened = {
      ...before, ...taken.stateUpdates, directorGateNotes: [EARLIER, filed], _meetingRound: null, _arcFeedback: null,
      _arcReworkTimeout: { consecutive: 1, attempt: 0, round: 'reweave', note: NOTE, at: 't2' }
    };
    const data = payloadOf(reopened);
    expect(meetingStandingNotes(data.directorGateNotes, LABELS).items.map((n) => [n.label, n.text])).toEqual([['Map, approval note 1', EARLIER.text]]);
    expect(ViewLogic.meetingApproveAsk(data, NOTE)).not.toBeNull();
    // Once a round runs, the note stands, listed as the round's.
    const ran = payloadOf({ ...reopened, _arcReworkTimeout: null, humanArcRevisionCount: 1 });
    expect(meetingStandingNotes(ran.directorGateNotes, LABELS).items.map((n) => n.label)).toEqual(['Map, approval note 1', 'Story meeting, rework note 1']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10: one rule for which changed lines a stop shows (the integrator's ruling 8 on 4.9's
// minors). A stop shows what a send-back's rework changed of the director's edits, with its
// reason, and what any other pass changed that code did not put back; an entry code put back
// asks nothing of the director. The meeting reads the rule the map and the desk read
// (changedEditsToShow), and phrases a reweave's entry as the reweave's.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10: the meeting shows the changes no pass put back, and a send-back\'s with their reasons', () => {
  const { REWEAVE_PASS } = require('../../lib/hand-edit-diff');
  const entry = (fields) => ({ cut: false, removed: false, moved: false, reason: null, restored: false, ...fields });
  const CONNECTION = 'id: c2; joins: t2 / t4; line: The night of the sale is the night the result came back.; kind: moment';
  /** The meeting's changed lines for a report holding these entries. */
  function linesFor(changed) {
    const data = { ...payloadOf(stateAt()), handEditReport: { checked: changed.map((c) => c.id), changed } };
    return meetingView(data, meetingDraftOf(data, undefined)).changedEdits;
  }

  test('an automatic change code put back is not shown', () => {
    expect(linesFor([entry({ id: 'E1', scope: 'fromYourNotes', where: 'fromYourNotes', director: 'Riley watched the ledger.', became: 'Riley was wrong.', pass: 1, automatic: true, restored: true })])).toEqual([]);
  });

  test('a cut that came back is shown, still in the weave', () => {
    expect(linesFor([entry({ id: 'E1', scope: 'threads', where: 'thread "t2", line', cut: true, director: 'The ledger says a sale.', became: 'Marcus bragged; the ledger says a sale.', pass: 1, automatic: true })]))
      .toEqual(['Thread "The sale", line: the text you cut came back as "Marcus bragged; the ledger says a sale." (automatic pass 1). It is still in the weave: cut it again if it should go.']);
  });

  test("a send-back's change is shown with its reason", () => {
    expect(linesFor([entry({ id: 'E2', scope: 'threads', where: 'thread "t3", line', director: T3_LINE, became: 'Morgan paid Riley in the back room.', pass: SEND_BACK_PASS, automatic: false, reason: 'The note asked to lead with the sale.' })]))
      .toEqual([`Thread "The envelope", line: your "${T3_LINE}" became "Morgan paid Riley in the back room." (the rework of your send-back). Why: The note asked to lead with the sale.`]);
  });

  test('the meeting lists exactly the entries the rule keeps, in the report\'s order', () => {
    const changed = [
      entry({ id: 'E1', scope: 'fromYourNotes', where: 'fromYourNotes', director: 'a', became: 'b', pass: 1, automatic: true, restored: true }),
      entry({ id: 'E2', scope: 'fromYourNotes', where: 'fromYourNotes', removed: true, director: 'c', became: 'd c', pass: 1, automatic: true }),
      entry({ id: 'E3', scope: 'fromYourNotes', where: 'fromYourNotes', director: 'e', became: 'f', pass: SEND_BACK_PASS, automatic: false })
    ];
    expect(ViewLogic.changedEditsToShow({ checked: ['E1', 'E2', 'E3'], changed }).map((e) => e.id)).toEqual(['E2', 'E3']);
    expect(linesFor(changed)).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10b: the stops' lines, follow-ups (the integrator's ruling 1 on 4.10's minors and
// hand-offs). When the stop checked the director's edits and shows no changed line, the
// meeting says the edits stand, as the map does. And when the round marks a line and a
// changed-edit line names the same edit, the meeting shows one line: the edit's, where the
// round's mark would sit.
// ═══════════════════════════════════════════════════════════════════════════
describe("4.10b: the meeting says when the director's edits stand", () => {
  const { settleEdits, REWEAVE_PASS } = require('../../lib/hand-edit-diff');
  const viewOf = (data) => meetingView(data, meetingDraftOf(data, undefined));

  test("a reweave whose change to the director's line code put back: the edits stand, and no changed line shows", () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads[2].line = 'The reweave told it its own way.';
    const { output, report } = settleEdits(null, { edits: edits.edits, before: left, after: reworked, pass: REWEAVE_PASS });
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E2', pass: REWEAVE_PASS, restored: true })]);
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(output, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report,
      _weaveMarks: { round: 'reweave', from: left }, humanArcRevisionCount: 1
    }));
    const view = viewOf(data);
    expect(view.changedEdits).toEqual([]);
    expect(view.kept).toBe('All 3 of your edits stand.');
  });

  test('one edit, two, and a round that changed none of them', () => {
    const withReport = (report) => viewOf({ ...payloadOf(stateAt()), handEditReport: report });
    expect(withReport({ checked: ['E1'], changed: [] }).kept).toBe('Your edit stands.');
    expect(withReport({ checked: ['E1', 'E2'], changed: [] }).kept).toBe('Both of your edits stand.');
  });

  test('a changed line to show, or no edit checked, and the meeting says nothing of the kind', () => {
    const sendBack = { id: 'E1', scope: 'fromYourNotes', where: 'fromYourNotes', cut: false, removed: false, moved: false, director: 'a', became: 'b', pass: SEND_BACK_PASS, automatic: false, reason: null, restored: false };
    expect(viewOf({ ...payloadOf(stateAt()), handEditReport: { checked: ['E1', 'E2'], changed: [sendBack] } }).kept).toBe('');
    expect(viewOf(payloadOf(stateAt())).kept).toBe('');
  });
});

describe('4.10b: one line per edit at the meeting', () => {
  const { settleEdits, REWEAVE_PASS } = require('../../lib/hand-edit-diff');

  /** Every line the page shows about the round's changes: beside its lines, listed with their places, and the changed edits. */
  function roundLines(view) {
    return [view.fromYourNotes, view.pitch]
      .concat(view.angles, view.threads, view.leftOut.threads, view.connections, view.questions)
      .filter(Boolean)
      .flatMap((line) => line.marks)
      .concat(view.removed, view.otherMarks, view.changedEdits);
  }

  /** The meeting after a director's round, from the version the director left. */
  function after(round, left, weave, edits, report) {
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(weave, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report,
      _weaveMarks: { round, from: left }, humanArcRevisionCount: 1
    }));
    return { data, view: meetingView(data, meetingDraftOf(data, undefined)) };
  }

  test("a send-back that changed the director's line: one line beside the thread, the edit's, with its reason", () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads[2].line = 'Morgan paid Riley in the back room.';
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS, reasons: [{ id: 'E2', reason: 'The note asked to lead with the sale.' }] });
    const { data, view } = after('send-back', left, reworked, edits, report);
    expect(data.marks.marks.map((m) => m.path)).toEqual(['threads[#t3].line']);
    const line = `Thread "The envelope", line: your "${T3_LINE}" became "Morgan paid Riley in the back room." (the rework of your send-back). Why: The note asked to lead with the sale.`;
    expect(threadOf(view, 't3').marks).toEqual([line]);
    expect(roundLines(view)).toEqual([line]);
  });

  test('a thread the director added that the send-back took out: one line, listed with its place', () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads.splice(5, 1);
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS });
    const { view } = after('send-back', left, reworked, edits, report);
    const line = 'Thread "The second ledger", added: your "The second ledger: Riley kept a second ledger." is gone (the rework of your send-back). No reason given.';
    expect(view.removed).toEqual([line]);
    expect(roundLines(view)).toEqual([line]);
  });

  test('a sentence the director removed that a reweave put in another line: one line, beside the line it came back in', () => {
    const writers = clone(WEAVE);
    writers.threads[1].line = 'Marcus bragged about the BizAI sale. He made it the night he died.';
    const left = clone(writers);
    left.threads[1].line = 'Marcus bragged about the BizAI sale.';
    const edits = standingAtMeeting(null, writers, left);
    const reworked = clone(left);
    reworked.threads[3].line = `${WEAVE.threads[3].line} He made it the night he died.`;
    const { output, report } = settleEdits(null, { edits: edits.edits, before: left, after: reworked, pass: REWEAVE_PASS });
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', removed: true, became: reworked.threads[3].line })]);
    const { view } = after('reweave', left, output, edits, report);
    const line = `Thread "The sale", line: a sentence you removed came back as "${reworked.threads[3].line}" (your reweave). It is still in the weave: cut it again if it should go.`;
    expect(threadOf(view, 't4').marks).toEqual([line]);
    expect(roundLines(view)).toEqual([line]);
  });

  test("a change beside the edit's own field keeps its own mark, and the edit its own line", () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads[2].name = 'The payment';
    reworked.threads[2].line = 'Morgan paid Riley in the back room.';
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS });
    const { view } = after('send-back', left, reworked, edits, report);
    expect(threadOf(view, 't3').marks).toEqual([
      'Changed this round (name). Before: "The envelope"',
      `Thread "The payment", line: your "${T3_LINE}" became "Morgan paid Riley in the back room." (the rework of your send-back). No reason given.`
    ]);
    expect(view.changedEdits).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10c: a caption left out with a photo the article cannot print reads as such at the meeting
// too (ruling 6 on 4.5e's findings): every stop phrases its report through one line
// (changedEditLine). Only the desk's passes are given the photos, so this entry is built by hand.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10c: a caption left out with a photo the article cannot print reads as such at the meeting too', () => {
  test("the line every stop phrases its report with says the pass took out a photo the article cannot print, so the director's text on it was not put back", () => {
    const entry = {
      id: 'E1', scope: 'section:s', where: 'section "s", photo not-ours.jpg, caption', cut: false, removed: false, moved: false,
      director: 'Six people huddle at the bar.', became: null, pass: 1, automatic: true, reason: null, restored: false, unprintable: true
    };
    const data = { ...payloadOf(stateAt()), handEditReport: { checked: ['E1'], changed: [entry] } };
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.changedEdits).toEqual([
      'Section "s", photo not-ours.jpg, caption: automatic pass 1 took out the photo, which the article cannot print, so your "Six people huddle at the bar." was not put back.'
    ]);
    expect(view.kept).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10c: the meeting's last lines (the integrator's ruling 2 on 4.10b's minors). One line per
// edit at the meeting, in the two shapes 4.10b's review found (scratch
// p4/4.10b-review/meeting-probe.js): several fields of a thread the director added, which the
// round marks one by one; and a field the director edited on a thread a send-back took out. The
// meeting's reading of a report entry's place is held to lib/hand-edit-diff.js editWhere, every
// word it closes a whole element's place with included.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10c: one line per edit at the meeting, where the round marks an edit twice', () => {
  /** Every line the page shows about the round's changes: beside its lines, listed with their places, and the changed edits. */
  function roundLines(view) {
    return [view.fromYourNotes, view.pitch]
      .concat(view.angles, view.threads, view.leftOut.threads, view.connections, view.questions)
      .filter(Boolean)
      .flatMap((line) => line.marks)
      .concat(view.removed, view.otherMarks, view.changedEdits);
  }

  /** The meeting after the director's send-back, from the version the director left. */
  function afterSendBack(left, weave, edits, report) {
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(weave, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report,
      _weaveMarks: { round: 'send-back', from: left }, humanArcRevisionCount: 1
    }));
    return { data, view: meetingView(data, meetingDraftOf(data, undefined)) };
  }

  test("a thread the director added whose name and line a send-back changed: the edit's line once, beside the thread, and no line for its second field", () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    const t6 = reworked.threads.find((t) => t.id === 't6');
    t6.name = 'The two ledgers';
    t6.line = 'Riley kept two ledgers, one for Marcus.';
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS });
    const { data, view } = afterSendBack(left, reworked, edits, report);
    expect(data.marks.marks.map((m) => m.path)).toEqual(['threads[#t6].name', 'threads[#t6].line']);
    const line = 'Thread "The two ledgers", added: your "The second ledger: Riley kept a second ledger." became "The two ledgers: Riley kept two ledgers, one for Marcus." (the rework of your send-back). No reason given.';
    expect(threadOf(view, 't6').marks).toEqual([line]);
    expect(roundLines(view)).toEqual([line]);
  });

  // Brief 4.14a: the thread that went reads by its words, never as a field dump; since phase 4b
  // (brief 1B), by its name and its line, and never by its id.
  test('a thread whose line the director changed, which a send-back took out: one line says the thread went, with its name and line, the line the director gave it, and why', () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads = reworked.threads.filter((t) => t.id !== 't3');
    reworked.connections = reworked.connections.filter((c) => !(c.joins || []).includes('t3'));
    const report = reportAfterPass(null, {
      edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS, reasons: [{ id: 'E2', reason: 'The note folded the payment into the sale.' }]
    });
    expect(report.changed.map((c) => [c.id, c.where, c.became])).toEqual([['E2', 'thread "t3", line', null]]);
    const { data, view } = afterSendBack(left, reworked, edits, report);
    expect(data.marks.marks.map((m) => m.path)).toEqual(['threads[#t3]', 'connections[#c1]']);
    const line = `Thread "The envelope": taken out this round. Before: "${T3_LINE}". ` +
      `The line you gave it, "${T3_LINE}", went with it (the rework of your send-back). Why: The note folded the payment into the sale.`;
    // The connection the rework took out with the thread is no edit of the director's: its own line.
    const connection = 'The connection between "The overdose vote" and "The envelope": taken out this round. Before: "Morgan sits on one side of the deadlock and pays at the bar."';
    expect(view.removed).toEqual([line, connection]);
    expect(view.changedEdits).toEqual([]);
    expect(roundLines(view)).toEqual([line, connection]);
  });
});

describe("4.10c: the meeting reads a report entry's place as lib/hand-edit-diff.js editWhere writes it", () => {
  const { editWhere, REWEAVE_PASS } = require('../../lib/hand-edit-diff');
  const { markOfEntry } = ViewLogic;
  /** A weave that carries none of the director's edits, so the report holds an entry for each. */
  const away = () => ({ ...clone(WEAVE), angles: [], threads: [], connections: [] });

  test('each kind of edit the meeting makes, its place read back to its own line and field; a whole element read as every field of it', () => {
    // A look: angle 1's story rewritten, a thread's line rewritten and a thread added.
    const left = directorsVersion();
    const firstLook = standingAtMeeting(null, WEAVE, left).edits;
    const entries = reportAfterPass(null, { edits: firstLook, before: left, after: away(), pass: SEND_BACK_PASS }).changed;
    expect(firstLook.map((edit) => editWhere(edit))).toEqual(['angle "a1", story', 'thread "t3", line', 'thread "t6", added']);
    expect(entries.map((entry) => entry.where)).toEqual(firstLook.map((edit) => editWhere(edit)));
    const about = (where, path) => markOfEntry({ path, before: 'before', after: 'after' }, entries.find((entry) => entry.where === where));
    // [the entry's place, a mark's path, whether the mark is about the entry]
    const CASES = [
      ['angle "a1", story', 'angles[#a1].story', true],
      ['angle "a1", story', 'angles[#a1]', true],
      ['angle "a1", story', 'angles[#a1].ends', false],
      ['angle "a1", story', 'angles[#a2].story', false],
      ['thread "t3", line', 'threads[#t3].line', true],
      ['thread "t3", line', 'threads[#t3]', true],
      ['thread "t3", line', 'threads[#t3].name', false],
      ['thread "t3", line', 'threads[#t1].line', false],
      ['thread "t6", added', 'threads[#t6]', true],
      ['thread "t6", added', 'threads[#t6].line', true],
      ['thread "t6", added', 'threads[#t6].name', true],
      ['thread "t6", added', 'threads[#t1].name', false]
    ];
    CASES.forEach(([where, path, expected]) => expect([where, path, about(where, path)]).toEqual([where, path, expected]));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5g: a whole element that came back without a photo the article cannot print shows at every
// stop (the integrator's ruling 1 on 4.5f's findings): it asks the director for a photo the
// article can print, so changedEditsToShow keeps it, and every stop phrases it through one line
// (changedEditLine). Only the desk's passes are given the photos, so this entry is built by hand,
// as 4.10c's caption entry above is.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.5g: a whole element that came back without a photo the article cannot print shows at the meeting too', () => {
  test('the line every stop phrases its report with says the pass took out the photo and the rest of the edit stands, and the edits do not all stand', () => {
    const entry = {
      id: 'E1', scope: 'section:aftermath', where: 'section "aftermath"', cut: false, removed: false, moved: false,
      director: 'id: aftermath; heading: Aftermath; content: The morning after. / filename: lost.jpg; caption: Six people.',
      became: null, pass: 1, automatic: true, reason: null, restored: true, unprintable: true
    };
    const data = { ...payloadOf(stateAt()), handEditReport: { checked: ['E1'], changed: [entry] } };
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.changedEdits).toEqual([
      'Section "aftermath": automatic pass 1 took out a photo you placed here, which the article cannot print. The rest of your edit stands: place a photo the article can print here if it should have one.'
    ]);
    expect(view.kept).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10d: the meeting's last lines (the integrator's ruling 1 on 4.6e's and 4.10c's minors).
// - A send-back that took out a thread on which the director had edited two fields showed two
//   lines, each repeating the whole removal (scratch p4/4.10c-review/probe-meeting.js, case 1).
//   One line now says the thread went and names each field the director gave it.
// - One wording for a pass: the taken-out line reads its pass from passWords and writes no
//   ending of its own. Only a send-back's rework takes such an element out for good: a reweave
//   and an automatic pass are held to the director's edits, code puts the element back from the
//   version the pass started from (lib/hand-edit-diff.js settleEdits), and the meeting shows no
//   line for their entries.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10d: one line per removed element at the meeting, its pass in passWords\' words', () => {
  const { settleEdits, REWEAVE_PASS } = require('../../lib/hand-edit-diff');

  /** Every line the page shows about the round's changes: beside its lines, listed with their places, and the changed edits. */
  function roundLines(view) {
    return [view.fromYourNotes, view.pitch]
      .concat(view.angles, view.threads, view.leftOut.threads, view.connections, view.questions)
      .filter(Boolean)
      .flatMap((line) => line.marks)
      .concat(view.removed, view.otherMarks, view.changedEdits);
  }

  /** The meeting after a director's round, from the version the director left. */
  function afterRound(round, left, weave, edits, report) {
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(weave, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report,
      _weaveMarks: { round, from: left }, humanArcRevisionCount: 1
    }));
    return { data, view: meetingView(data, meetingDraftOf(data, undefined)) };
  }

  /** The director's version: t3's name and its line, both edited (probe case 1). */
  function twoFieldsEdited() {
    const left = clone(WEAVE);
    left.threads[2].name = 'The payment';
    left.threads[2].line = 'Morgan paid Riley twice.';
    return left;
  }

  /** A rework of `left` that took t3 out, with the connection that joins it. */
  function withoutT3(left) {
    const weave = clone(left);
    weave.threads = weave.threads.filter((t) => t.id !== 't3');
    weave.connections = weave.connections.filter((c) => !(c.joins || []).includes('t3'));
    return weave;
  }

  // Brief 4.14a: an element taken out reads by its words, never as a field dump; since phase 4b
  // (brief 1B), a thread by its name and its line, a connection by the names of the threads it
  // joins and its line, and never by an id.
  const T3_REMOVED = 'Thread "The payment": taken out this round. Before: "Morgan paid Riley twice.".';
  const C1_REMOVED = 'The connection between "The overdose vote" and "The payment": taken out this round. Before: "Morgan sits on one side of the deadlock and pays at the bar."';
  const GAVE_BOTH = ' The name you gave it, "The payment", and the line you gave it, "Morgan paid Riley twice.", went with it (the rework of your send-back).';

  test('a send-back that took out a thread whose name and line the director edited: one line for the removal, naming both fields', () => {
    const left = twoFieldsEdited();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = withoutT3(left);
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS });
    expect(report.changed.map((c) => [c.where, c.became])).toEqual([['thread "t3", name', null], ['thread "t3", line', null]]);
    const { data, view } = afterRound('send-back', left, reworked, edits, report);
    expect(data.marks.marks.map((m) => m.path)).toEqual(['threads[#t3]', 'connections[#c1]']);
    const line = `${T3_REMOVED}${GAVE_BOTH} No reason given.`;
    expect(view.removed).toEqual([line, C1_REMOVED]);
    expect(view.changedEdits).toEqual([]);
    expect(roundLines(view)).toEqual([line, C1_REMOVED]);
  });

  test("the rework's reasons for the two edits: each reason once, in the report's order", () => {
    const left = twoFieldsEdited();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = withoutT3(left);
    const removedLineWith = (reasons) => {
      const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS, reasons });
      return afterRound('send-back', left, reworked, edits, report).view.removed[0];
    };
    const FOLDED = 'The note folded the payment into the sale.';
    const NO_THREAD = 'The line no longer had a thread to sit on.';
    expect(removedLineWith([{ id: 'E1', reason: FOLDED }, { id: 'E2', reason: FOLDED }])).toBe(`${T3_REMOVED}${GAVE_BOTH} Why: ${FOLDED}`);
    expect(removedLineWith([{ id: 'E2', reason: NO_THREAD }, { id: 'E1', reason: FOLDED }])).toBe(`${T3_REMOVED}${GAVE_BOTH} Why: ${FOLDED} ${NO_THREAD}`);
    expect(removedLineWith([{ id: 'E2', reason: NO_THREAD }])).toBe(`${T3_REMOVED}${GAVE_BOTH} Why: ${NO_THREAD}`);
  });

  test("the taken-out line writes no ending of its own: changedEditLine's is the module's one ending for a held pass", () => {
    const source = require('fs').readFileSync(require.resolve('../checkpoint-view-logic'), 'utf8');
    expect(source.split(', which should have kept your edit)').length - 1).toBe(1);
    const takenOut = source.slice(source.indexOf('function takenOutWithEditLine('), source.indexOf('function elsewhereLine('));
    expect(takenOut).toContain('passWords(');
    expect(takenOut).not.toContain('held');
  });

  test('a reweave, or an automatic pass, that took the thread out: code puts it back, so no line names the removal of the edits', () => {
    [REWEAVE_PASS, 1].forEach((pass) => {
      const left = twoFieldsEdited();
      const edits = standingAtMeeting(null, WEAVE, left);
      const { output, report } = settleEdits(null, { edits: edits.edits, before: left, after: withoutT3(left), pass });
      expect([pass, output.threads.find((t) => t.id === 't3')]).toEqual([pass, left.threads[2]]);
      expect([pass, report.changed.map((c) => [c.where, c.restored])]).toEqual([pass, [['thread "t3", name', true], ['thread "t3", line', true]]]);
      expect([pass, ViewLogic.changedEditsToShow(report)]).toEqual([pass, []]);
    });
    // The reweave's round as the meeting shows it: the connection the reweave took out is no
    // edit of the director's, and the director's edits stand.
    const left = twoFieldsEdited();
    const edits = standingAtMeeting(null, WEAVE, left);
    const { output, report } = settleEdits(null, { edits: edits.edits, before: left, after: withoutT3(left), pass: REWEAVE_PASS });
    const { view } = afterRound('reweave', left, output, edits, report);
    expect(roundLines(view)).toEqual([C1_REMOVED]);
    expect(view.kept).toBe('Both of your edits stand.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10d: rule ids never reach the director (the integrator's ruling 1 on 4.6e's and 4.10c's
// minors). A concern at the meeting printed "Concern: T1: …", read past its prefix and ids
// alone (concernFindingOf). It reads past its rule ids too, as the desk's marks do since 4.10c
// (judgeMarkText), through the builder the map reads as well (concernsBesideLines).
// ═══════════════════════════════════════════════════════════════════════════
describe("4.10d: the meeting's concerns read past their rule ids", () => {
  test("the fact check's concern beside the line of the edit it is about, one listed apart, and the map's", () => {
    const typed = clone(WEAVE);
    typed.threads.push(clone(ADDED));
    const concern = 'Director\'s edit E1: T1, T4: "Riley kept a second ledger" states as fact what no document shows.';
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(typed, { ...MARK, concerns: [concern] }),
      _weaveHandEdits: standingAtMeeting(null, WEAVE, typed)
    }));
    expect(data.concerns.map((c) => [c.text, c.places.map((p) => p.path)])).toEqual([[concern, ['threads[#t6]']]]);
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(threadOf(view, 't6').concerns).toEqual(['Concern: "Riley kept a second ledger" states as fact what no document shows.']);
    const apart = { ...data, concerns: [{ text: 'Director\'s edit E9: T6: the thread names who turned the memory in.', editIds: ['E9'], places: [{ id: 'E9', path: 'threads[#index-3]', where: 'thread 4' }] }] };
    expect(meetingView(apart, meetingDraftOf(apart, undefined)).otherConcerns).toEqual(['Concern: The thread names who turned the memory in.']);
    // The map's concerns go through the same builder.
    const placed = ViewLogic.concernsBesideLines([{ text: 'Director\'s edit E2: T5: the figure is not the ledger\'s.', places: [{ path: 'headline' }] }], new Set(['headline']), (path) => path);
    expect([...placed.byLine]).toEqual([['headline', ['Concern: The figure is not the ledger\'s.']]]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10e: a reason ends before the next begins (the integrator's ruling 2 on the fifth wave's
// findings, 4.10d's minor 2). passWords joined the rework's reasons with a space, so a reason
// with no closing punctuation ran into the next: "Why: The note folds the payment into the main
// thread No receipt left to cite." (scratch p4/4.10d-review/probe-meeting.js, case 1). Each reason
// is closed with a full stop, so the line reads as sentences at every stop.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10e: a reason ends before the next begins', () => {
  /** The meeting's one line for t3, whose name and line the director edited, after a send-back took it out with these reasons. */
  function removedLineWith(reasons) {
    const left = clone(WEAVE);
    left.threads[2].name = 'The payment';
    left.threads[2].line = 'Morgan paid Riley twice.';
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads = reworked.threads.filter((t) => t.id !== 't3');
    reworked.connections = reworked.connections.filter((c) => !(c.joins || []).includes('t3'));
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS, reasons });
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report,
      _weaveMarks: { round: 'send-back', from: left }, humanArcRevisionCount: 1
    }));
    return meetingView(data, meetingDraftOf(data, undefined)).removed[0];
  }
  const WHY = /\(the rework of your send-back\)\. (Why: .*|No reason given\.)$/;
  const whyOf = (line) => WHY.exec(line)[1];

  test('two reasons, neither closed: each closed with a full stop, in the line', () => {
    expect(whyOf(removedLineWith([
      { id: 'E1', reason: 'The note folds the payment into the sale' },
      { id: 'E2', reason: 'No receipt left to cite' }
    ]))).toBe('Why: The note folds the payment into the sale. No receipt left to cite.');
  });

  test('a reason closed by its own punctuation keeps it, and a reason the rework gave twice, once with its full stop, is one reason', () => {
    expect(whyOf(removedLineWith([
      { id: 'E1', reason: 'Was the payment ever its own thread?' },
      { id: 'E2', reason: 'The note said "fold it in."' }
    ]))).toBe('Why: Was the payment ever its own thread? The note said "fold it in."');
    expect(whyOf(removedLineWith([
      { id: 'E1', reason: 'No receipt left to cite' },
      { id: 'E2', reason: 'No receipt left to cite.' }
    ]))).toBe('Why: No receipt left to cite.');
  });

  test("one reason with no closing punctuation, in a send-back's changed line at any stop", () => {
    const entry = {
      id: 'E2', scope: 'threads', where: 'thread "t3", line', cut: false, removed: false, moved: false,
      director: T3_LINE, became: 'Morgan paid Riley in the back room.', pass: SEND_BACK_PASS, automatic: false, reason: 'The note asked to lead with the sale', restored: false
    };
    expect(ViewLogic.changedEditLine(entry)).toBe(`E2, thread "t3", line: your "${T3_LINE}" became "Morgan paid Riley in the back room." (the rework of your send-back). Why: The note asked to lead with the sale.`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14a: the meeting's last defects (the final review, ruling 1)
// ═══════════════════════════════════════════════════════════════════════════
//
// Meeting 5: the round's marks said what changed in raw values: a receipt's id, "true" for the
// verdict flag, and a field dump for a thread taken out. They say it in the meeting's words.
// Phase 4b (brief 1B; spec 9): those words name each thread by its name, never its id. (Meeting
// 2's line under a connection that joins a left-out thread went in piece 3: a connection shows
// only while both its threads are in the open angle's story, spec 2026-10-06 section 6.)
describe("4.14a: the round's marks say what changed in the meeting's words", () => {
  /** The meeting after a reweave whose rework turned the weave the director left into `reworked`. */
  function afterReweave(reworked) {
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveMarks: { round: 'reweave', from: clone(WEAVE) }, humanArcRevisionCount: 1
    }));
    return meetingView(data, meetingDraftOf(data, undefined));
  }

  test('a name and a line the round changed are marked beside the thread, in the words it had', () => {
    const reworked = clone(WEAVE);
    reworked.threads[2].name = 'The payment';
    reworked.threads[2].line = 'Morgan paid Riley in the back room.';
    const view = afterReweave(reworked);
    expect(threadOf(view, 't3').marks).toEqual([
      'Changed this round (name). Before: "The envelope"',
      'Changed this round (line). Before: "Morgan paid Riley at the bar, out of sight."'
    ]);
    expect(threadOf(view, 't3').name).toBe('The payment');
  });

  test("the verdict flag reads as carrying the room's verdict, or no longer carrying it", () => {
    const reworked = clone(WEAVE);
    reworked.threads[0].verdict = false;
    reworked.threads[1].verdict = true;
    const view = afterReweave(reworked);
    expect(threadOf(view, 't1').marks).toEqual(["Changed this round: no longer carries the room's verdict."]);
    expect(threadOf(view, 't2').marks).toEqual(["Changed this round: carries the room's verdict."]);
  });

  test('a thread the round took out reads by its name and its line, and a connection by the threads it joins and its line', () => {
    const reworked = clone(WEAVE);
    reworked.threads = reworked.threads.filter((t) => t.id !== 't5');
    reworked.connections = reworked.connections.filter((c) => c.id !== 'c1');
    expect(afterReweave(reworked).removed).toEqual([
      'Thread "The letter": taken out this round. Before: "An unsigned letter threatened Marcus over the patents."',
      'The connection between "The overdose vote" and "The envelope": taken out this round. Before: "Morgan sits on one side of the deadlock and pays at the bar."'
    ]);
  });
});

// Fix round 4, fix 2 (spec 4.1 and 9): the evidence stays behind the fold and the tags off the
// page. The director adds a thread and sends back; the rework rewrites it and gives it evidence.
// The line "Your edits a rework changed" shows reads the thread by its name and its line, never
// the evidence the rework gave it (lib/hand-edit-diff.js weaveReportText).
describe('fix round 4: a meeting line after a send-back shows no evidence', () => {
  const H = require('../../lib/hand-edit-diff');
  const { storyLevelWeave, storyLevelState } = require('../../lib/__tests__/fixtures/story-level-weave');

  test("a thread the director added that the send-back's rework rewrote and gave evidence: its line holds no evidence", () => {
    const shown = storyLevelWeave();
    const left = clone(shown);
    left.threads.push({ id: 't11', name: "Vic's payoff", line: 'Vic got paid to stay quiet.' });
    left.angles[0].threads.push('t11');
    const edits = H.standingAtMeeting(null, shown, left, { shown });
    const after = clone(left);
    after.threads[10] = {
      id: 't11', name: "Vic's payoff", line: 'Someone paid Vic to stay quiet about the batch.',
      evidence: [{ sources: ['p-email'], shows: 'Marcus asks Quinn to "raise the dose for the pilot"', stance: 'supports' }]
    };
    const settled = H.settleEdits(null, {
      edits: H.carriedEdits(edits, left), before: left, after, pass: H.SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asked for who paid.' }]
    });
    expect(settled.report.changed[0].became).toBe("id: t11; name: Vic's payoff; line: Someone paid Vic to stay quiet about the batch.");
    const data = {
      weave: settled.output,
      handEditReport: H.handEditReportOf(settled.report),
      evidenceIndex: { 'p-email': { name: 'Email to Quinn', owner: 'Marcus', type: 'Document', firstLine: '' } },
      questions: settled.output.questions,
      accusation: storyLevelState().sessionConfig.accusation
    };
    const view = ViewLogic.meetingView(data, ViewLogic.meetingDraftOf(data, null), '');
    expect(view.changedEdits).toEqual([
      'Thread "Vic\'s payoff", added: your "Vic\'s payoff: Vic got paid to stay quiet." became "Vic\'s payoff: Someone paid Vic to stay quiet about the batch." (the rework of your send-back). Why: The note asked for who paid.'
    ]);
    view.changedEdits.forEach((line) => {
      expect(line).not.toMatch(/p-email|raise the dose|stance|supports|evidence|complicates-it/);
    });
  });
});

// Fix round 4, fix 4 (spec 5.3): the fold's line is the director's thread's alone. Since slice 3C
// a flip is an edit, so lib/meeting.js meetingDirectorsThreads names a thread the director flipped
// into the story beside the threads they added, for the map writer's gap note; the stop names only
// the threads they added (3 fix A), so a thread of the writer's gets no line, flipped in or not.
describe('fix round 4: "Nothing yet" is never under a thread of the writer\'s', () => {
  const { storyLevelWeave } = require('../../lib/__tests__/fixtures/story-level-weave');

  test("a thread of the writer's with no evidence gets no line, and the stop names no thread of the director's", () => {
    const left = storyLevelWeave();
    left.threads.find((t) => t.id === 't5').evidence = [];
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(left, MARK),
      _weaveBaseline: storyLevelWeave(),
      _weaveHandEdits: standingAtMeeting(null, storyLevelWeave(), left)
    }));
    expect(data.directorsThreads).toEqual([]);
    expect(data).not.toHaveProperty('addedThreads');
    expect(threadOf(meetingView(data, meetingDraftOf(data, undefined)), 't5')).toMatchObject({ noEvidence: '' });
  });
});
