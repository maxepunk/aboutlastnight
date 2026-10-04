/**
 * 4.8: the story meeting on screen (phase 4, brief 4.8; spec 4.3 and 4.4).
 *
 * The meeting's view models and payload builders live in console/checkpoint-view-logic.js;
 * ArcSelection.js is their thin consumer (the console has no DOM harness). Every fixture
 * payload here is the server's own: lib/meeting.js meetingCheckpointData run on a state at
 * the meeting, so the view reads 4.5's payload as the stop sends it. Invented text.
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
  standingAtMeeting, reportAfterPass, weaveEditsBetween, concernFinding, SEND_BACK_PASS
} = require('../../lib/hand-edit-diff');

const {
  meetingWeaveOf, meetingVersion, meetingPendingSlot, meetingDraftOf, meetingNoteOf, pendingEditsAfterCheckpoint,
  setMeetingField, setThreadRole, addMeetingThread, removeMeetingThread, setConnectionStruck, setQuestionAnswer,
  meetingWeaveChanges, meetingWeaveProblems, meetingPayload, meetingButtons,
  meetingVerdictView, receiptView, concernFindingOf, meetingView, meetingStandingNotes, rollbackWarningLine
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

/** The director's version: t3 re-roled, a thread added, c2 struck, q1 answered, the story edited. */
function directorsVersion() {
  const left = clone(WEAVE);
  left.story = 'The room called it an overdose; the ledger says a sale.';
  left.threads[2].role = 'mirrors-it';
  left.threads.push({ id: 't6', claim: 'Riley kept a second ledger.', role: 'grounds-it' });
  left.connections[1].struck = true;
  left.questions[0].answer = 'Sarah ran the bar all morning.';
  return left;
}

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
    else if (prop.type === 'array' && prop.items.type === 'string') fields[key] = 'strings';
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
  test('the role labels, in the meeting\'s order, are the weave\'s roles', () => {
    expect(Object.keys(ViewLogic.WEAVE_ROLE_LABELS)).toEqual([...weaveLib.WEAVE_ROLES]);
    expect(Object.values(ViewLogic.WEAVE_ROLE_LABELS)).toEqual(['Main thread', 'Grounds it', 'Complicates it', 'Mirrors it', 'Carries it forward', 'Left out']);
  });

  test('the connection kinds, the ledger receipt, the strike and the answer keys, and the actions are the server\'s', () => {
    expect(Object.keys(ViewLogic.CONNECTION_KIND_LABELS)).toEqual([...weaveLib.CONNECTION_KINDS]);
    expect(ViewLogic.LEDGER_RECEIPT).toBe(weaveLib.LEDGER_RECEIPT);
    expect(ViewLogic.STRUCK_KEY).toBe(weaveLib.STRUCK_KEY);
    expect(ViewLogic.WEAVE_ANSWER_KEY).toBe(WEAVE_ANSWER_KEY);
    expect(ViewLogic.MEETING_ACTIONS).toEqual([...MEETING_ACTIONS]);
    expect(Object.keys(ViewLogic.WRITER_QUESTION_KIND_LABELS)).toEqual([...WEAVE_QUESTION_KINDS]);
  });

  test('the director-side schema\'s shape is DIRECTOR_WEAVE_SCHEMA\'s, and the schema uses no keyword the console does not model', () => {
    expect(ViewLogic.DIRECTOR_WEAVE_SHAPE).toEqual(shapeOf(DIRECTOR_WEAVE_SCHEMA));
    expect([...keywordsOf(DIRECTOR_WEAVE_SCHEMA)].sort()).toEqual(['description', 'enum', 'items', 'properties', 'required', 'type']);
  });

  test('a concern reads as the server reads its finding', () => {
    [
      'Director\'s edit E1: Thread "t6" gives the receipt "zzz999", which names no document in the record.',
      'Director\'s edit E1, E3: T1: the story states a motive as fact.',
      'Director\'s edit E12:no space after the colon.'
    ].forEach((text) => expect(concernFindingOf(text)).toBe(concernFinding(text)));
    expect(concernFindingOf('A finding with no prefix.')).toBe('A finding with no prefix.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The changes between two weaves, and the validator, held to the gate's decisions
// ═══════════════════════════════════════════════════════════════════════════

/** The server's change in the console's shape: what it is at, and its flags. */
const serverChange = (c) => ({
  scope: c.scope,
  id: c.at[1] && c.at[1].match ? c.at[1].match.id : null,
  field: c.at[2] ? c.at[2].key : null,
  repeatedId: c.repeatedId === true,
  struck: c.struck === true
});

/** A weave whose writer gave two threads and two connections one id each. */
function writersRepeat() {
  const w = clone(WEAVE);
  w.threads.push({ id: 't2', claim: 'A second thread under t2.', role: 'grounds-it', receipt: 'ale003' });
  w.connections.push({ id: 'c1', kind: 'line', joins: ['t2', 't5'], detail: 'A second connection under c1.' });
  w.questions.push({ id: 'q1', kind: 'figure', about: '9:40, $40,000', question: 'Is this sale right?', changes: 'The money line.' });
  return w;
}

const CHANGE_CASES = [
  ['the same weave', () => [clone(WEAVE), clone(WEAVE)]],
  ['a field changed only at its ends', () => { const a = clone(WEAVE); a.story = `  ${a.story}  `; return [clone(WEAVE), a]; }],
  ['the story rewritten', () => { const a = clone(WEAVE); a.story = 'A new story.'; return [clone(WEAVE), a]; }],
  ['the convergence and the headline rewritten', () => { const a = clone(WEAVE); a.convergence = 'x'; a.headline = 'y'; return [clone(WEAVE), a]; }],
  ['a stronger main thread added', () => { const a = clone(WEAVE); a.strongerMainThread = { thread: 't2', reason: 'The sale is stronger.' }; return [clone(WEAVE), a]; }],
  ['a role changed', () => { const a = clone(WEAVE); a.threads[2].role = 'mirrors-it'; return [clone(WEAVE), a]; }],
  ['a thread added', () => { const a = clone(WEAVE); a.threads.push({ id: 't6', claim: 'x', role: 'grounds-it' }); return [clone(WEAVE), a]; }],
  ['a thread taken out', () => { const a = clone(WEAVE); a.threads.pop(); return [clone(WEAVE), a]; }],
  ['a connection struck', () => { const a = clone(WEAVE); a.connections[0].struck = true; return [clone(WEAVE), a]; }],
  ['a connection unstruck', () => { const b = clone(WEAVE); b.connections[0].struck = true; return [b, clone(WEAVE)]; }],
  ['a struck connection reworded', () => { const b = clone(WEAVE); b.connections[0].struck = true; const a = clone(b); a.connections[0].detail = 'New detail.'; return [b, a]; }],
  ['an answer given', () => { const a = clone(WEAVE); a.questions[0].answer = 'Sarah ran the bar.'; return [clone(WEAVE), a]; }],
  ['a question reworded', () => { const a = clone(WEAVE); a.questions[0].question = 'Who?'; return [clone(WEAVE), a]; }],
  ['a thread with no id changed', () => { const b = clone(WEAVE); b.threads[0].id = ''; const a = clone(b); a.threads[0].role = 'left-out'; return [b, a]; }],
  ['the writer\'s repeat left alone, another thread re-roled', () => { const b = writersRepeat(); const a = clone(b); a.threads[0].role = 'grounds-it'; return [b, a]; }],
  ['the writer\'s repeat, one of them re-roled', () => { const b = writersRepeat(); const a = clone(b); a.threads[5].role = 'mirrors-it'; return [b, a]; }],
  ['the writer\'s repeat, a third added', () => { const b = writersRepeat(); const a = clone(b); a.threads.push({ id: 't2', claim: 'x', role: 'left-out' }); return [b, a]; }],
  ['the writer\'s repeat, one taken out', () => { const b = writersRepeat(); const a = clone(b); a.threads.splice(1, 1); return [b, a]; }],
  ['the writer\'s repeated connection, one struck', () => { const b = writersRepeat(); const a = clone(b); a.connections[2].struck = true; return [b, a]; }],
  ['a version that is no weave', () => [null, clone(WEAVE)]]
];

describe('4.8: meetingWeaveChanges reads two weaves as the server\'s diff does', () => {
  test.each(CHANGE_CASES)('%s', (_name, build) => {
    const [before, after] = build();
    expect(meetingWeaveChanges(before, after)).toEqual(weaveEditsBetween(before, after).map(serverChange));
  });

  test('the cases cover each kind of change the meeting can make', () => {
    const all = CHANGE_CASES.flatMap(([, build]) => meetingWeaveChanges(...build()));
    expect(all.some((c) => c.scope === 'story')).toBe(true);
    expect(all.some((c) => c.scope === 'threads' && c.field === 'role')).toBe(true);
    expect(all.some((c) => c.scope === 'threads' && c.field === null)).toBe(true);
    expect(all.some((c) => c.struck)).toBe(true);
    expect(all.some((c) => c.repeatedId)).toBe(true);
  });
});

/** Each case: what the director left, the weave the meeting showed, and whether the gate takes it. */
const DECISION_CASES = [
  ['the weave as shown', true, () => [clone(WEAVE), clone(WEAVE)]],
  ['every change the meeting makes', true, () => [directorsVersion(), clone(WEAVE)]],
  ['extra keys, which the schema leaves open', true, () => { const w = clone(WEAVE); w.extra = 1; w.threads[0].note = 'x'; return [w, clone(WEAVE)]; }],
  ['a thread with no receipt and no reason', true, () => { const w = clone(WEAVE); delete w.threads[4].receipt; delete w.threads[4].reason; return [w, clone(WEAVE)]; }],
  ['an empty list of joins', true, () => { const w = clone(WEAVE); w.connections[0].joins = []; return [w, clone(WEAVE)]; }],
  ['two threads with no id', true, () => { const b = clone(WEAVE); b.threads[0].id = ''; const w = clone(b); w.threads.push({ id: '', claim: 'x', role: 'left-out' }); return [w, b]; }],
  ['a missing required field', false, () => { const w = clone(WEAVE); delete w.story; return [w, clone(WEAVE)]; }],
  ['a story that is not text', false, () => { const w = clone(WEAVE); w.story = 5; return [w, clone(WEAVE)]; }],
  ['a field present as null', false, () => { const w = clone(WEAVE); w.fromYourNotes = null; return [w, clone(WEAVE)]; }],
  ['threads that are not a list', false, () => { const w = clone(WEAVE); w.threads = {}; return [w, clone(WEAVE)]; }],
  ['a thread that is not an object', false, () => { const w = clone(WEAVE); w.threads[0] = 't1'; return [w, clone(WEAVE)]; }],
  ['a thread with no role', false, () => { const w = clone(WEAVE); delete w.threads[1].role; return [w, clone(WEAVE)]; }],
  ['a role the meeting does not have', false, () => { const w = clone(WEAVE); w.threads[0].role = 'hero'; return [w, clone(WEAVE)]; }],
  ['a receipt that is not text', false, () => { const w = clone(WEAVE); w.threads[0].receipt = 12; return [w, clone(WEAVE)]; }],
  ['a verdict flag that is not true or false', false, () => { const w = clone(WEAVE); w.threads[0].verdict = 'true'; return [w, clone(WEAVE)]; }],
  ['an unknown connection kind', false, () => { const w = clone(WEAVE); w.connections[0].kind = 'rumour'; return [w, clone(WEAVE)]; }],
  ['joins that are not a list', false, () => { const w = clone(WEAVE); w.connections[0].joins = 't1'; return [w, clone(WEAVE)]; }],
  ['joins holding a number', false, () => { const w = clone(WEAVE); w.connections[0].joins = ['t1', 2]; return [w, clone(WEAVE)]; }],
  ['a strike that is not true or false', false, () => { const w = clone(WEAVE); w.connections[0].struck = 'yes'; return [w, clone(WEAVE)]; }],
  ['a question with no changes', false, () => { const w = clone(WEAVE); delete w.questions[0].changes; return [w, clone(WEAVE)]; }],
  ['a question kind the weave does not ask', false, () => { const w = clone(WEAVE); w.questions[0].kind = 'ledger'; return [w, clone(WEAVE)]; }],
  ['an answer that is not text', false, () => { const w = clone(WEAVE); w.questions[0].answer = 42; return [w, clone(WEAVE)]; }],
  ['a stronger main thread with no reason', false, () => { const w = clone(WEAVE); w.strongerMainThread = { thread: 't2' }; return [w, clone(WEAVE)]; }],
  ['a stronger main thread that is null', false, () => { const w = clone(WEAVE); w.strongerMainThread = null; return [w, clone(WEAVE)]; }],
  ['a list for a weave', false, () => [[], clone(WEAVE)]],
  ['no weave at all', false, () => [null, clone(WEAVE)]],
  ['the director repeats a thread id', false, () => { const w = clone(WEAVE); w.threads.push({ id: 't2', claim: 'x', role: 'grounds-it' }); return [w, clone(WEAVE)]; }],
  ['the director repeats a thread id, read trimmed', false, () => { const w = clone(WEAVE); w.threads.push({ id: ' t2 ', claim: 'x', role: 'grounds-it' }); return [w, clone(WEAVE)]; }],
  ['the director repeats a connection id', false, () => { const w = clone(WEAVE); w.connections.push({ id: 'c1', kind: 'line', joins: ['t1', 't2'], detail: 'x' }); return [w, clone(WEAVE)]; }],
  ['the director repeats a question id', false, () => { const w = clone(WEAVE); w.questions.push({ ...w.questions[0] }); return [w, clone(WEAVE)]; }],
  ['the writer\'s repeat, left as the meeting showed it', true, () => [writersRepeat(), writersRepeat()]],
  ['the writer\'s repeat left alone, another thread re-roled', true, () => { const w = writersRepeat(); w.threads[0].role = 'grounds-it'; return [w, writersRepeat()]; }],
  ['the writer\'s repeated question, answered', true, () => { const w = writersRepeat(); w.questions[1].answer = 'Yes.'; return [w, writersRepeat()]; }],
  ['the writer\'s repeat, one of them re-roled', false, () => { const w = writersRepeat(); w.threads[5].role = 'mirrors-it'; return [w, writersRepeat()]; }],
  ['the writer\'s repeat, a third added under it', false, () => { const w = writersRepeat(); w.threads.push({ id: 't2', claim: 'x', role: 'left-out' }); return [w, writersRepeat()]; }],
  ['the writer\'s repeat, one taken out', false, () => { const w = writersRepeat(); w.threads.splice(1, 1); return [w, writersRepeat()]; }],
  ['the writer\'s repeated connection, one struck', false, () => { const w = writersRepeat(); w.connections[2].struck = true; return [w, writersRepeat()]; }],
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
    draft.threads[0].role = 'left-out';
    expect(payloadWeave.threads[0].role).toBe('main-thread');
    expect(meetingWeaveOf(null)).toBeNull();
    expect(meetingWeaveOf({ story: 'no threads' })).toBeNull();
  });

  test('the story, the question, the headline and the convergence are edited in place, as typed', () => {
    let w = meetingWeaveOf(shown());
    w = setMeetingField(w, 'story', '  Someone built a case.  ');
    w = setMeetingField(w, 'question', 'Will it cost Alex?');
    w = setMeetingField(w, 'headline', 'A Name at the Top');
    w = setMeetingField(w, 'convergence', 'The ledger meets the vote.');
    expect([w.story, w.question, w.headline, w.convergence]).toEqual(['  Someone built a case.  ', 'Will it cost Alex?', 'A Name at the Top', 'The ledger meets the vote.']);
    expect(() => setMeetingField(w, 'fromYourNotes', 'x')).toThrow(/story, question, headline or convergence/);
  });

  test('a role changes from the list, and only to one of the roles', () => {
    const before = meetingWeaveOf(shown());
    const after = setThreadRole(before, 4, 'grounds-it');
    expect(after.threads[4].role).toBe('grounds-it');
    expect(before.threads[4].role).toBe('left-out');
    expect(() => setThreadRole(before, 0, 'hero')).toThrow(/role/);
  });

  test('a thread is added in one line with a role, under an id of its own, with no receipt and no reason', () => {
    const before = meetingWeaveOf(shown());
    const after = addMeetingThread(before, 'Riley kept a second ledger. ', 'complicates-it');
    expect(after.threads).toHaveLength(6);
    expect(after.threads[5]).toEqual({ id: 't6', claim: 'Riley kept a second ledger. ', role: 'complicates-it' });
    const twice = addMeetingThread(addMeetingThread(before, 'a', 'grounds-it'), 'b', 'grounds-it');
    expect(twice.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
    expect(addMeetingThread(before, '   ', 'grounds-it')).toBe(before);
    expect(() => addMeetingThread(before, 'x', 'hero')).toThrow(/role/);
    expect(meetingWeaveProblems(after, shown())).toBeNull();
  });

  test('a thread added at this look can be taken out again', () => {
    const added = addMeetingThread(meetingWeaveOf(shown()), 'x', 'grounds-it');
    expect(removeMeetingThread(added, 5).threads).toEqual(clone(WEAVE).threads);
  });

  test('a connection is struck with `struck: true`, and unstruck by taking the key off', () => {
    const struck = setConnectionStruck(meetingWeaveOf(shown()), 1, true);
    expect(struck.connections[1].struck).toBe(true);
    const unstruck = setConnectionStruck(struck, 1, false);
    expect(unstruck.connections[1]).toEqual(clone(WEAVE).connections[1]);
    expect(meetingWeaveChanges(meetingWeaveOf(shown()), unstruck)).toEqual([]);
  });

  test('an answer is kept as typed, and a blank answer is no answer', () => {
    const answered = setQuestionAnswer(meetingWeaveOf(shown()), 0, '  Sarah ran the bar.\n');
    expect(answered.questions[0].answer).toBe('  Sarah ran the bar.\n');
    const blank = setQuestionAnswer(answered, 0, '   ');
    expect(blank.questions[0]).toEqual(clone(WEAVE).questions[0]);
  });

  test('every change the meeting makes passes the gate', () => {
    let w = meetingWeaveOf(shown());
    w = setMeetingField(w, 'story', 'The room named an overdose; the ledger names a sale.');
    w = setThreadRole(w, 2, 'mirrors-it');
    w = addMeetingThread(w, 'Riley kept a second ledger.', 'grounds-it');
    w = setConnectionStruck(w, 1, true);
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
  const reroled = () => setThreadRole(untouched(), 2, 'mirrors-it');

  test('approve carries the weave as the director left it, without the code-owned keys, and a note only as typed', () => {
    expect(meetingPayload('approve', data(), untouched(), '')).toEqual({ meeting: 'approve', weave: clone(WEAVE) });
    expect(meetingPayload('approve', data(), untouched(), '   ')).toEqual({ meeting: 'approve', weave: clone(WEAVE) });
    expect(meetingPayload('approve', data(), reroled(), ' Lead with the vote. ')).toEqual({ meeting: 'approve', weave: reroled(), note: ' Lead with the vote. ' });
  });

  test('a reweave carries the weave and its note; with no change and no note there is none to send, and answers alone are no change', () => {
    expect(meetingPayload('reweave', data(), reroled(), '')).toEqual({ meeting: 'reweave', weave: reroled() });
    expect(meetingPayload('reweave', data(), untouched(), 'Make the sale the main thread.')).toEqual({ meeting: 'reweave', weave: clone(WEAVE), note: 'Make the sale the main thread.' });
    expect(meetingPayload('reweave', data(), untouched(), '')).toBeNull();
    expect(meetingPayload('reweave', data(), answeredOnly(), '  ')).toBeNull();
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
    expect(idle.reweave.hint).toMatch(/change the weave or write a note/);
    expect(idle.sendBack).toMatchObject({ label: 'Send back', disabled: true });
    expect(meetingButtons(data(), answeredOnly(), '', false).reweave.disabled).toBe(true);
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
    const reopened = reopenedAfter(meetingPayload('reweave', first, setThreadRole(meetingDraftOf(first, undefined), 2, 'mirrors-it'), ''));
    const data = payloadOf(reopened);
    const draft = meetingDraftOf(data, pendingEditsAfterCheckpoint({}, 'arc-selection', data)['arc-selection']);
    const view = meetingView(data, draft);
    expect(view.threads[2].roleLabel).toBe('Mirrors it');
    expect(view.didNotRun).toBe('Your reweave did not run: the writer timed out, and the weave is as you left it. Reweave again to retry.');
    expect(meetingButtons(data, draft, '', false).reweave).toMatchObject({ disabled: false, hint: '' });

    const retry = meetingPayload('reweave', data, draft, '');
    expect(retry).toEqual({ meeting: 'reweave', weave: draft });
    const taken = meetingResume(retry, reopened);
    expect(taken.error).toBeNull();
    expect(taken.resume).toEqual({ approved: false, round: 'reweave' });
    expect(taken.stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t3].role']);
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
    reworked.threads[1].claim = 'Marcus bragged about the sale in front of Alex.';
    return payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(reworked, MARK), humanArcRevisionCount: 1 }));
  };
  const draft = () => setQuestionAnswer(setThreadRole(meetingWeaveOf(data().weave), 2, 'mirrors-it'), 0, 'Sarah ran the bar.');

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

describe('4.8: each receipt names its document through evidenceIndex', () => {
  test('a document by its name and owner, matched in any case as the checks match it', () => {
    expect(receiptView('ale003', INDEX)).toEqual({ id: 'ale003', label: 'ALE003 - The sale (Alex Reeves)', ledger: false, known: true, firstLine: 'Marcus brags about the sale.' });
    expect(receiptView('ALE003', INDEX)).toMatchObject({ label: 'ALE003 - The sale (Alex Reeves)', known: true });
  });

  test('the ledger, a document the index does not hold, and no receipt', () => {
    expect(receiptView('ledger', INDEX)).toMatchObject({ label: 'the ledger', ledger: true });
    expect(receiptView('Ledger', {})).toMatchObject({ ledger: true });
    expect(receiptView('zzz999', INDEX)).toEqual({ id: 'zzz999', label: 'zzz999', ledger: false, known: false, firstLine: '' });
    expect(receiptView('p-rescued', INDEX).label).toBe('p-rescued');
    expect(receiptView('', INDEX)).toBeNull();
    expect(receiptView(undefined, INDEX)).toBeNull();
  });
});

describe('4.8: the meeting before any round', () => {
  const data = payloadOf(stateAt());
  const view = meetingView(data, meetingDraftOf(data, undefined));

  test('the page\'s sections, in the spec\'s order', () => {
    expect(view.order).toEqual(['verdict', 'story', 'fromYourNotes', 'threads', 'connections', 'questions']);
  });

  test('the verdict, the story, the question, the working headline and "from your notes", with no thin-notes line', () => {
    expect(view.verdict).toEqual({ parsed: true, who: 'No one: an overdose', charge: 'Accidental overdose', vote: 'Overdose 6 (adopted by the group statement), Murder 2' });
    expect(view.story.text).toBe(WEAVE.story);
    expect(view.question.text).toBe(WEAVE.question);
    expect(view.headline.text).toBe(WEAVE.headline);
    expect(view.fromYourNotes.text).toBe(WEAVE.fromYourNotes);
    expect(view.thinNotes).toBe('');
  });

  test('each thread with its role, its receipt by name, a left-out thread\'s reason and the verdict\'s thread', () => {
    expect(view.threads.map((t) => [t.id, t.roleLabel, t.receipt && t.receipt.label, t.verdict])).toEqual([
      ['t1', 'Main thread', 'the ledger', true],
      ['t2', 'Grounds it', 'ALE003 - The sale (Alex Reeves)', false],
      ['t3', 'Complicates it', 'MOR001 - The envelope (Morgan Reed)', false],
      ['t4', 'Carries it forward', 'Paternity test result', false],
      ['t5', 'Left out', 'p-rescued', false]
    ]);
    expect(view.threads[4].reason).toBe('No one in the room took it up.');
    expect(view.threads.every((t) => !t.added && !t.repeatedId)).toBe(true);
    expect(view.roles.map((r) => r.value)).toEqual([...weaveLib.WEAVE_ROLES]);
  });

  test('each connection with its kind, the threads it joins, and where they converge', () => {
    expect(view.connections.map((c) => [c.id, c.kindLabel, c.joins, c.struck])).toEqual([
      ['c1', 'A shared person', 't1 and t3', false],
      ['c2', 'A moment', 't2 and t4', false]
    ]);
    expect(view.convergence.text).toBe(WEAVE.convergence);
    expect(view.strongerMainThread).toBeNull();
  });

  test('each question through the meeting\'s own view, with its kind, what its answer changes and its answer box', () => {
    expect(view.questions).toEqual([{
      key: 'question-0', index: 0, id: 'q1', kind: 'player', kindLabel: 'Player', about: 'Sarah',
      question: 'The record holds nothing Sarah did this morning: what did Sarah do?',
      changes: 'Where Sarah appears in the article.', answer: '', marks: []
    }]);
  });

  test('nothing from a round: no marks, no check, no changed edits, no round that did not run', () => {
    expect(view).toMatchObject({ marked: '', removed: [], checkFailures: [], changedEdits: [], didNotRun: '', otherConcerns: [] });
  });
});

describe('4.8: the thin-notes line and the stronger main thread', () => {
  test('a weave with no "from your notes" carries the one line beside the story, and no section for the quote', () => {
    const weave = clone(WEAVE);
    delete weave.fromYourNotes;
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(weave, MARK) }));
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.thinNotes).toBe(ViewLogic.THIN_NOTES_LINE);
    expect(view.thinNotes).toBe("Your notes end without your read of the session, so this story is the writer's proposal.");
    expect(view.fromYourNotes).toBeNull();
    expect(view.order).not.toContain('fromYourNotes');
  });

  test('the optional stronger main thread, named by its thread', () => {
    const weave = clone(WEAVE);
    weave.strongerMainThread = { thread: 't2', reason: 'The sale explains the vote.' };
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(weave, MARK) }));
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.strongerMainThread).toMatchObject({ thread: 't2', claim: WEAVE.threads[1].claim, reason: 'The sale explains the vote.' });
    expect(view.order).toEqual(['verdict', 'story', 'fromYourNotes', 'threads', 'connections', 'strongerMainThread', 'questions']);
  });
});

describe('4.8: the director\'s changes on the page', () => {
  const data = payloadOf(stateAt());

  test('a role changed, a thread added (no receipt, taken out again only at this look), a connection struck and an answer typed show as the director left them', () => {
    let draft = meetingDraftOf(data, undefined);
    draft = setThreadRole(draft, 2, 'mirrors-it');
    draft = addMeetingThread(draft, 'Riley kept a second ledger.', 'grounds-it');
    draft = setConnectionStruck(draft, 1, true);
    draft = setQuestionAnswer(draft, 0, 'Sarah ran the bar.');
    const view = meetingView(data, draft);
    expect(view.threads[2].roleLabel).toBe('Mirrors it');
    expect(view.threads[5]).toMatchObject({ id: 't6', claim: 'Riley kept a second ledger.', added: true, receipt: null });
    expect(view.threads.filter((t) => t.added).map((t) => t.id)).toEqual(['t6']);
    expect(view.connections[1].struck).toBe(true);
    expect(view.questions[0].answer).toBe('Sarah ran the bar.');
  });

  test('a writer\'s repeated id is flagged, so its controls stay as shown', () => {
    const weave = writersRepeat();
    const repeated = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(weave, MARK) }));
    const view = meetingView(repeated, meetingDraftOf(repeated, undefined));
    expect(view.threads.filter((t) => t.repeatedId).map((t) => t.index)).toEqual([1, 5]);
    expect(view.connections.filter((c) => c.repeatedId).map((c) => c.index)).toEqual([0, 2]);
    expect(view.repeatedIdHint).toMatch(/reweave with a note, or a send-back, gives each its own id/);
  });
});

describe('4.8: after a reweave, a send-back, and a reweave that did not run', () => {
  const left = directorsVersion();

  test('after a reweave: each line the writer changed is marked beside it, and what it took out is listed', () => {
    const reworked = clone(left);
    reworked.threads[1].claim = 'Marcus bragged about the sale in front of Alex.';
    reworked.threads.splice(3, 1);
    reworked.questions.push({ id: 'q2', kind: 'pronoun', about: 'Riley', question: 'Which pronoun for Riley?', changes: 'Every line about Riley.' });
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveMarks: { round: 'reweave', from: left }, humanArcRevisionCount: 1 }));
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.marked).toBe('After your reweave, each line the writer changed from the weave you left is marked.');
    expect(view.threads.find((t) => t.id === 't2').marks).toEqual(['Changed this round (claim). Before: "Marcus bragged about the BizAI sale the night he died."']);
    expect(view.questions.find((q) => q.id === 'q2').marks).toEqual(['New this round.']);
    expect(view.removed).toHaveLength(1);
    expect(view.removed[0]).toMatch(/^Thread "t4": taken out this round\. Before: "/);
  });

  test('after a send-back: the edits its rework changed, with their reasons, and the marks', () => {
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads[2].role = 'grounds-it';
    delete reworked.connections[1].struck;
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS, reasons: [{ id: 'E2', reason: 'The note made the ledger the main thread.' }] });
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(reworked, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report,
      _weaveMarks: { round: 'send-back', from: left }, humanArcRevisionCount: 1
    }));
    const view = meetingView(data, meetingDraftOf(data, undefined));
    // 4.10b: one line per edit. The round's mark on t3 and the changed-edit line are about the
    // same edit, so the edit's line, with its reason, stands beside t3 in the mark's place.
    expect(view.changedEdits).toEqual([
      'Connection "c2", struck: the rework of your send-back brought it back. No reason given.'
    ]);
    expect(view.marked).toBe('After your send-back, each line the writer changed from the weave you left is marked.');
    expect(view.threads.find((t) => t.id === 't3').marks).toEqual([
      'Thread "t3", role: your "Mirrors it" became "Grounds it" (the rework of your send-back). Why: The note made the ledger the main thread.'
    ]);
  });

  test('a reweave\'s restores are not a send-back\'s changes: they are not listed', () => {
    const edits = standingAtMeeting(null, WEAVE, left);
    const report = { checked: ['E1'], changed: [{ id: 'E1', scope: 'story', where: 'story', cut: false, removed: false, moved: false, director: 'x', became: 'y', pass: 'reweave', automatic: false, reason: null, restored: true }] };
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(left, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report }));
    expect(meetingView(data, meetingDraftOf(data, undefined)).changedEdits).toEqual([]);
  });

  test('a reweave that did not run: one line, and the weave as the director left it', () => {
    const data = payloadOf(stateAt({ weave: weaveLib.withFactCheckMark(left, MARK), _arcReworkTimeout: { consecutive: 1, attempt: 0, round: 'reweave', note: null, at: '2026-10-03T22:00:00.000Z' } }));
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.didNotRun).toBe('Your reweave did not run: the writer timed out, and the weave is as you left it. Reweave again to retry.');
    expect(view.threads[2].roleLabel).toBe('Mirrors it');
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
    return [view.story, view.question, view.headline, view.fromYourNotes, view.convergence, view.strongerMainThread]
      .concat(view.threads, view.connections, view.questions)
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
    expect(view.order).not.toContain('fromYourNotes');
    expect(view.removed).toEqual([`From your notes: taken out this round. Before: "${WEAVE.fromYourNotes}"`]);
    expect(view.thinNotes).toBe('');
    expect(marksShown(view)).toBe(data.marks.marks.length);
  });

  test('a round that took out the stronger main thread: the mark is listed under the line\'s name', () => {
    const left = clone(WEAVE);
    left.strongerMainThread = { thread: 't2', reason: 'The sale explains the vote.' };
    const { data, view } = afterReweave(left, clone(WEAVE));
    expect(view.order).not.toContain('strongerMainThread');
    expect(view.removed).toEqual(['A stronger main thread: taken out this round. Before: "thread: t2; reason: The sale explains the vote."']);
    expect(marksShown(view)).toBe(data.marks.marks.length);
  });

  test('a question the meeting does not ask: the mark is listed with its place and what it holds now', () => {
    const reworked = clone(WEAVE);
    reworked.questions.push({ id: 'q2', kind: 'player', about: 'Riley', question: 'What did Riley do at the bar?', changes: '' });
    const { data, view } = afterReweave(clone(WEAVE), reworked);
    expect(view.questions.map((q) => q.id)).toEqual(['q1']);
    expect(view.otherMarks).toEqual(['Question "q2": new this round. Now: "id: q2; kind: player; about: Riley; question: What did Riley do at the bar?"']);
    expect(marksShown(view)).toBe(data.marks.marks.length);
  });

  test('a round that changed lines the page shows, took a thread out and dropped both optional lines: every mark shows', () => {
    const left = directorsVersion();
    left.strongerMainThread = { thread: 't2', reason: 'The sale explains the vote.' };
    const reworked = clone(left);
    delete reworked.strongerMainThread;
    delete reworked.fromYourNotes;
    reworked.threads[1].claim = 'Marcus bragged about the sale in front of Alex.';
    reworked.threads.splice(3, 1);
    const { data, view } = afterReweave(left, reworked);
    expect(data.marks.marks).toHaveLength(4);
    expect(marksShown(view)).toBe(4);
    expect(view.threads.find((t) => t.id === 't2').marks).toHaveLength(1);
    expect(view.removed.map((line) => line.split(':')[0])).toEqual(['From your notes', 'A stronger main thread', 'Thread "t4"']);
  });

  test('the thin-notes line still shows when the weave never had "from your notes"', () => {
    const left = clone(WEAVE);
    delete left.fromYourNotes;
    const reworked = clone(left);
    reworked.headline = 'The Ledger Kept Talking';
    const { view } = afterReweave(left, reworked);
    expect(view.thinNotes).toBe(ViewLogic.THIN_NOTES_LINE);
    expect(view.headline.marks).toEqual([`Changed this round. Before: "${WEAVE.headline}"`]);
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
  typed.threads.push({ id: 't6', claim: 'Riley kept a second ledger.', role: 'grounds-it', receipt: 'zzz999' });
  const weave = weaveLib.withFactCheckMark(typed, MARK);
  const state = stateAt({
    weave,
    _weaveHandEdits: standingAtMeeting(null, WEAVE, typed),
    _arcValidation: {
      weaveKey: weaveLib.weaveKey(weave), passed: false,
      failures: [{ type: 'over-length', message: 'The weave runs to 612 words in the fields the meeting prints.' }],
      concerns: ['Director\'s edit E1: Thread "t6" gives the receipt "zzz999", which names no document in the record.']
    }
  });
  const data = payloadOf(state);
  const view = meetingView(data, meetingDraftOf(data, undefined));

  test('a code check still failing, in one line', () => {
    expect(view.checkFailures).toEqual(['Check still failing: The weave runs to 612 words in the fields the meeting prints.']);
  });

  test('the concern sits beside the line of the edit it is about', () => {
    expect(view.threads.find((t) => t.id === 't6').concerns).toEqual(['Concern: Thread "t6" gives the receipt "zzz999", which names no document in the record.']);
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
// names it.
describe('4.8 fix round 1: the meeting phrases its report and its notes through the builders every stop reads', () => {
  const sendBack = (fields) => ({ cut: false, removed: false, moved: false, pass: SEND_BACK_PASS, automatic: false, reason: null, restored: false, ...fields });
  const CONNECTION = 'id: c2; kind: moment; joins: t2 / t4; detail: The night of the sale is the night the result came back.';
  const ENTRIES = [
    sendBack({ id: 'E1', scope: 'story', where: 'story', director: 'The room named an overdose.', became: 'The ledger names a sale.', reason: 'The note asked to lead with the sale.' }),
    sendBack({ id: 'E2', scope: 'threads', where: 'thread "t3", role', director: 'mirrors-it', became: 'grounds-it' }),
    sendBack({ id: 'E3', scope: 'threads', where: 'thread "t6", added', director: 'id: t6; claim: Riley kept a second ledger.; role: grounds-it', became: null }),
    sendBack({ id: 'E4', scope: 'question', where: 'question', removed: true, director: 'Who paid Riley?', became: 'Who gained from the sale? Who paid Riley?' }),
    sendBack({ id: 'E5', scope: 'connections', where: 'connection "c2", struck', struck: true, director: CONNECTION, became: CONNECTION }),
    sendBack({ id: 'E6', scope: 'connections', where: 'connection "c1", struck', struck: true, director: CONNECTION, became: null, reason: 'The note dropped the deadlock.' })
  ];
  const REPORT = { checked: ENTRIES.map((e) => e.id), changed: ENTRIES };
  const meetingLines = () => {
    const data = { ...payloadOf(stateAt()), handEditReport: REPORT };
    return meetingView(data, meetingDraftOf(data, undefined)).changedEdits;
  };

  test('each edit a send-back changed, in the wording every stop uses, its place as the meeting heads it', () => {
    expect(meetingLines()).toEqual([
      'The story: your "The room named an overdose." became "The ledger names a sale." (the rework of your send-back). Why: The note asked to lead with the sale.',
      'Thread "t3", role: your "Mirrors it" became "Grounds it" (the rework of your send-back). No reason given.',
      'Thread "t6", added: your "id: t6; claim: Riley kept a second ledger.; role: grounds-it" is gone (the rework of your send-back). No reason given.',
      'The question it carries: a sentence you removed came back as "Who gained from the sale? Who paid Riley?" (the rework of your send-back). No reason given.',
      'Connection "c2", struck: the rework of your send-back brought it back. No reason given.',
      'Connection "c1", struck: the rework of your send-back took it out. Why: The note dropped the deadlock.'
    ]);
  });

  test('each of the meeting\'s lines is steeringView\'s for the same entry, but for the place and a role\'s words', () => {
    const steering = ViewLogic.steeringView(REPORT, []).changedEdits.map((e) => e.line);
    const meeting = meetingLines();
    const PLACES = { E1: ['E1, story', 'The story'], E2: ['E2, thread "t3", role', 'Thread "t3", role'], E3: ['E3, thread "t6", added', 'Thread "t6", added'], E4: ['E4, question', 'The question it carries'], E5: ['E5, connection "c2", struck', 'Connection "c2", struck'], E6: ['E6, connection "c1", struck', 'Connection "c1", struck'] };
    ENTRIES.forEach((entry, i) => {
      const [steeringPlace, meetingPlace] = PLACES[entry.id];
      expect(steering[i].startsWith(`${steeringPlace}: `)).toBe(true);
      const rest = steering[i].slice(steeringPlace.length).replace('"mirrors-it"', '"Mirrors it"').replace('"grounds-it"', '"Grounds it"');
      expect(meeting[i]).toBe(meetingPlace + rest);
    });
  });

  test('a connection an automatic pass brought back says whether code struck it again (the map\'s strikes read the same line)', () => {
    const automatic = { ...ENTRIES[4], pass: 1, automatic: true };
    const lines = ViewLogic.steeringView({ checked: ['E5'], changed: [{ ...automatic, restored: true }, { ...automatic, restored: false }, { ...automatic, became: null }] }, []).changedEdits.map((e) => e.line);
    expect(lines).toEqual([
      'E5, connection "c2", struck: automatic pass 1 brought it back. It was struck again.',
      'E5, connection "c2", struck: automatic pass 1 brought it back. It could not be struck again.',
      'E5, connection "c2", struck: automatic pass 1 took it out.'
    ]);
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

  test('going back to the meeting costs no model call (R9); every other point keeps the general warning', () => {
    expect(rollbackWarningLine('arc-selection')).toBe(ViewLogic.MEETING_ROLLBACK_LINE);
    expect(ViewLogic.MEETING_ROLLBACK_LINE).toMatch(/story meeting reopens as you left it, with no model call/);
    expect(rollbackWarningLine('outline')).toBe('This will clear all data from this point forward.');
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

// The ledger's ruling on 4.5b's minor 5: bringing back a connection the director struck is
// their change, at the gate (lib/hand-edit-diff.js weaveEditsBetween) and so on the screen.
describe('4.5c: bringing back a struck connection is a change on screen, as at the gate', () => {
  test('a meeting that shows c2 struck offers Reweave once the director brings it back, and the gate takes that reweave', () => {
    const struck = setConnectionStruck(clone(WEAVE), 1, true);
    const state = stateAt({ weave: weaveLib.withFactCheckMark(struck, MARK), _weaveHandEdits: standingAtMeeting(null, WEAVE, struck) });
    const data = payloadOf(state);
    const back = setConnectionStruck(meetingDraftOf(data, undefined), 1, false);
    expect(meetingWeaveChanges(meetingWeaveOf(data.weave), back)).toEqual([{ scope: 'connections', id: 'c2', field: null, repeatedId: false, struck: false }]);
    expect(meetingButtons(data, back, '', false).reweave).toMatchObject({ disabled: false, hint: '' });
    const taken = meetingResume(meetingPayload('reweave', data, back, ''), state);
    expect(taken.error).toBeNull();
    expect(taken.resume).toEqual({ approved: false, round: 'reweave' });
  });

  test("the console's validator decides as the gate does on a connection brought back, under the writer's repeated id too", () => {
    const struck = setConnectionStruck(clone(WEAVE), 1, true);
    const repeatStruck = writersRepeat();
    repeatStruck.connections[2].struck = true;
    [
      [setConnectionStruck(struck, 1, false), struck, true],
      [setConnectionStruck(repeatStruck, 2, false), repeatStruck, false]
    ].forEach(([left, shown, accepts]) => {
      const gate = directorWeaveProblems(weaveLib.weaveForPrompt(left), { shown: weaveLib.weaveForPrompt(shown) });
      expect({ gateAccepts: gate === null, consoleAccepts: meetingWeaveProblems(left, shown) === null }).toEqual({ gateAccepts: accepts, consoleAccepts: accepts });
    });
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
    const changed = reopened('reweave', 'Make the sale the main thread.', { change: (w) => setThreadRole(w, 2, 'mirrors-it') });
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
  const strikeC2 = (w) => setConnectionStruck(w, 1, true);
  const bringBackC2 = (w) => setConnectionStruck(w, 1, false);
  const mirrorT3 = (w) => setThreadRole(w, 2, 'mirrors-it');
  const complicateT3 = (w) => setThreadRole(w, 2, 'complicates-it');
  const STORY = 'The room voted overdose, and the ledger kept a sale on the books.';
  const rewriteStory = (w) => setMeetingField(w, 'story', STORY);
  const writersStory = (w) => setMeetingField(w, 'story', WEAVE.story);

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
    ['bring back a strike a round kept', () => ranRound(acted(stateAt(), 'reweave', strikeC2)), bringBackC2, true],
    ['bring back a strike made at an approve', () => acted(stateAt(), 'approve', strikeC2), bringBackC2, true],
    ['strike again a connection brought back at an approve, after a round kept the strike', () => acted(ranRound(acted(stateAt(), 'reweave', strikeC2)), 'approve', bringBackC2), strikeC2, true],
    ['set again a role set back at an approve, after a round kept it', () => acted(ranRound(acted(stateAt(), 'reweave', mirrorT3)), 'approve', complicateT3), mirrorT3, true],
    ['rewrite again a story set back at an approve, after a round kept it', () => acted(ranRound(acted(stateAt(), 'reweave', rewriteStory)), 'approve', writersStory), rewriteStory, true],
    ["set back to the writer's a role re-roled at an approve", () => acted(stateAt(), 'approve', mirrorT3), complicateT3, true],
    ['leave the weave as the meeting showed it, with no edit standing', () => stateAt(), (w) => w, false],
    ['only answer a question', () => stateAt(), (w) => setQuestionAnswer(w, 0, 'Sarah ran the bar.'), false]
  ];

  test.each(CASES)('%s', (_name, build, change, offered) => {
    const state = build();
    const data = payloadOf(state);
    const left = change(meetingDraftOf(data, undefined));
    expect(meetingButtons(data, left, '', false).reweave.disabled).toBe(!offered);
    const gate = meetingResume({ meeting: 'reweave', weave: meetingWeaveOf(left) }, state);
    expect(gate.error === null).toBe(offered);
    if (!offered) expect(gate.error).toMatch(/carries no change to the weave and no note/);
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
  const CONNECTION = 'id: c2; kind: moment; joins: t2 / t4; detail: The night of the sale is the night the result came back.';
  /** The meeting's changed lines for a report holding these entries. */
  function linesFor(changed) {
    const data = { ...payloadOf(stateAt()), handEditReport: { checked: changed.map((c) => c.id), changed } };
    return meetingView(data, meetingDraftOf(data, undefined)).changedEdits;
  }

  test('an automatic change code put back is not shown', () => {
    expect(linesFor([entry({ id: 'E1', scope: 'story', where: 'story', director: 'The room called it an overdose.', became: 'The room was wrong.', pass: 1, automatic: true, restored: true })])).toEqual([]);
  });

  test('a cut that came back is shown, still in the weave', () => {
    expect(linesFor([entry({ id: 'E1', scope: 'story', where: 'story', cut: true, director: 'The ledger says a sale.', became: 'The room called it an overdose; the ledger says a sale.', pass: 1, automatic: true })]))
      .toEqual(['The story: the text you cut came back as "The room called it an overdose; the ledger says a sale." (automatic pass 1). It is still in the weave: cut it again if it should go.']);
  });

  test("a send-back's change is shown with its reason", () => {
    expect(linesFor([entry({ id: 'E2', scope: 'threads', where: 'thread "t3", role', director: 'mirrors-it', became: 'grounds-it', pass: SEND_BACK_PASS, automatic: false, reason: 'The note made the ledger the main thread.' })]))
      .toEqual(['Thread "t3", role: your "Mirrors it" became "Grounds it" (the rework of your send-back). Why: The note made the ledger the main thread.']);
  });

  test("a reweave's change code could not put back is shown as the reweave's", () => {
    expect(linesFor([entry({ id: 'E5', scope: 'connections', where: 'connection "c2", struck', struck: true, director: CONNECTION, became: CONNECTION, pass: REWEAVE_PASS, automatic: false })]))
      .toEqual(['Connection "c2", struck: your reweave brought it back. It could not be struck again.']);
  });

  test('the meeting lists exactly the entries the rule keeps, in the report\'s order', () => {
    const changed = [
      entry({ id: 'E1', scope: 'story', where: 'story', director: 'a', became: 'b', pass: 1, automatic: true, restored: true }),
      entry({ id: 'E2', scope: 'story', where: 'story', removed: true, director: 'c', became: 'd c', pass: 1, automatic: true }),
      entry({ id: 'E3', scope: 'story', where: 'story', director: 'e', became: 'f', pass: SEND_BACK_PASS, automatic: false })
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
    reworked.story = 'The reweave told the story its own way.';
    const { output, report } = settleEdits(null, { edits: edits.edits, before: left, after: reworked, pass: REWEAVE_PASS });
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', pass: REWEAVE_PASS, restored: true })]);
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(output, MARK), _weaveHandEdits: edits, _weaveHandEditReport: report,
      _weaveMarks: { round: 'reweave', from: left }, humanArcRevisionCount: 1
    }));
    const view = viewOf(data);
    expect(view.changedEdits).toEqual([]);
    expect(view.kept).toBe('All 4 of your edits stand.');
  });

  test('one edit, two, and a round that changed none of them', () => {
    const withReport = (report) => viewOf({ ...payloadOf(stateAt()), handEditReport: report });
    expect(withReport({ checked: ['E1'], changed: [] }).kept).toBe('Your edit stands.');
    expect(withReport({ checked: ['E1', 'E2'], changed: [] }).kept).toBe('Both of your edits stand.');
  });

  test('a changed line to show, or no edit checked, and the meeting says nothing of the kind', () => {
    const sendBack = { id: 'E1', scope: 'story', where: 'story', cut: false, removed: false, moved: false, director: 'a', became: 'b', pass: SEND_BACK_PASS, automatic: false, reason: null, restored: false };
    expect(viewOf({ ...payloadOf(stateAt()), handEditReport: { checked: ['E1', 'E2'], changed: [sendBack] } }).kept).toBe('');
    expect(viewOf(payloadOf(stateAt())).kept).toBe('');
  });
});

describe('4.10b: one line per edit at the meeting', () => {
  const { settleEdits, REWEAVE_PASS } = require('../../lib/hand-edit-diff');

  /** Every line the page shows about the round's changes: beside its lines, listed with their places, and the changed edits. */
  function roundLines(view) {
    return [view.story, view.question, view.headline, view.fromYourNotes, view.convergence, view.strongerMainThread]
      .concat(view.threads, view.connections, view.questions)
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

  test("a send-back that changed the director's role: one line beside the thread, the edit's, with its reason", () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads[2].role = 'grounds-it';
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS, reasons: [{ id: 'E2', reason: 'The note made the ledger the main thread.' }] });
    const { data, view } = after('send-back', left, reworked, edits, report);
    expect(data.marks.marks.map((m) => m.path)).toEqual(['threads[#t3].role']);
    const line = 'Thread "t3", role: your "Mirrors it" became "Grounds it" (the rework of your send-back). Why: The note made the ledger the main thread.';
    expect(view.threads.find((t) => t.id === 't3').marks).toEqual([line]);
    expect(roundLines(view)).toEqual([line]);
  });

  test('a thread the director added that the send-back took out: one line, listed with its place', () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads.splice(5, 1);
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS });
    const { view } = after('send-back', left, reworked, edits, report);
    const line = 'Thread "t6", added: your "id: t6; claim: Riley kept a second ledger.; role: grounds-it" is gone (the rework of your send-back). No reason given.';
    expect(view.removed).toEqual([line]);
    expect(roundLines(view)).toEqual([line]);
  });

  test('a sentence the director removed that a reweave put in another line: one line, beside the line it came back in', () => {
    const writers = clone(WEAVE);
    writers.story = 'The room called it an accidental overdose. The ledger points at a sale Marcus made the night he died.';
    const left = clone(writers);
    left.story = 'The room called it an accidental overdose.';
    const edits = standingAtMeeting(null, writers, left);
    const reworked = clone(left);
    reworked.convergence = `${WEAVE.convergence} The ledger points at a sale Marcus made the night he died.`;
    const { output, report } = settleEdits(null, { edits: edits.edits, before: left, after: reworked, pass: REWEAVE_PASS });
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', removed: true, became: reworked.convergence })]);
    const { view } = after('reweave', left, output, edits, report);
    const line = `The story: a sentence you removed came back as "${reworked.convergence}" (your reweave). It is still in the weave: cut it again if it should go.`;
    expect(view.convergence.marks).toEqual([line]);
    expect(roundLines(view)).toEqual([line]);
  });

  test("a change beside the edit's own field keeps its own mark, and the edit its own line", () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads[2].role = 'grounds-it';
    reworked.threads[2].claim = 'Morgan paid Riley in the back room.';
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS });
    const { view } = after('send-back', left, reworked, edits, report);
    expect(view.threads.find((t) => t.id === 't3').marks).toEqual([
      'Changed this round (claim). Before: "Morgan paid Riley at the bar, out of sight."',
      'Thread "t3", role: your "Mirrors it" became "Grounds it" (the rework of your send-back). No reason given.'
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
    return [view.story, view.question, view.headline, view.fromYourNotes, view.convergence, view.strongerMainThread]
      .concat(view.threads, view.connections, view.questions)
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

  test("a thread the director added whose claim and role a send-back changed: the edit's line once, beside the thread, and no line for its second field", () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    const t6 = reworked.threads.find((t) => t.id === 't6');
    t6.role = 'complicates-it';
    t6.claim = 'Riley kept two ledgers, one for Marcus.';
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS });
    const { data, view } = afterSendBack(left, reworked, edits, report);
    expect(data.marks.marks.map((m) => m.path)).toEqual(['threads[#t6].claim', 'threads[#t6].role']);
    const line = 'Thread "t6", added: your "id: t6; claim: Riley kept a second ledger.; role: grounds-it" became "id: t6; claim: Riley kept two ledgers, one for Marcus.; role: complicates-it" (the rework of your send-back). No reason given.';
    expect(view.threads.find((t) => t.id === 't6').marks).toEqual([line]);
    expect(roundLines(view)).toEqual([line]);
  });

  test('a thread whose role the director changed, which a send-back took out: one line says the thread went, with its claim and receipt, the role the director gave it, and why', () => {
    const left = directorsVersion();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = clone(left);
    reworked.threads = reworked.threads.filter((t) => t.id !== 't3');
    reworked.connections = reworked.connections.filter((c) => !(c.joins || []).includes('t3'));
    const report = reportAfterPass(null, {
      edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS, reasons: [{ id: 'E2', reason: 'The note folded the payment into the main thread.' }]
    });
    expect(report.changed.map((c) => [c.id, c.where, c.became])).toEqual([['E2', 'thread "t3", role', null]]);
    const { data, view } = afterSendBack(left, reworked, edits, report);
    expect(data.marks.marks.map((m) => m.path)).toEqual(['threads[#t3]', 'connections[#c1]']);
    const line = 'Thread "t3": taken out this round. Before: "id: t3; claim: Morgan paid Riley at the bar, out of sight.; role: mirrors-it; receipt: mor001". ' +
      'The role you gave it, "Mirrors it", went with it (the rework of your send-back). Why: The note folded the payment into the main thread.';
    // The connection the rework took out with the thread is no edit of the director's: its own line.
    const connection = 'Connection "c1": taken out this round. Before: "id: c1; kind: person; joins: t1 / t3; detail: Morgan: one side of the deadlock, and the payer at the bar."';
    expect(view.removed).toEqual([line, connection]);
    expect(view.changedEdits).toEqual([]);
    expect(roundLines(view)).toEqual([line, connection]);
  });
});

describe("4.10c: the meeting reads a report entry's place as lib/hand-edit-diff.js editWhere writes it", () => {
  const { editWhere, REWEAVE_PASS } = require('../../lib/hand-edit-diff');
  const { markOfEntry } = ViewLogic;
  const struck = () => {
    const weave = clone(WEAVE);
    weave.connections[1].struck = true;
    return weave;
  };
  /** A weave that carries none of the director's edits, so the report holds an entry for each. */
  const away = () => ({ ...clone(WEAVE), story: 'Another story altogether.', threads: [], connections: [] });

  test('each kind of edit the meeting makes, its place read back to its own line and field; a whole element read as every field of it', () => {
    // The first look: the story, a role, a thread added and a connection struck. A later look
    // brings back a connection struck at an earlier one.
    const left = directorsVersion();
    const firstLook = standingAtMeeting(null, WEAVE, left).edits;
    const broughtBack = standingAtMeeting(standingAtMeeting(null, clone(WEAVE), struck()), struck(), clone(WEAVE)).edits;
    const entries = [
      ...reportAfterPass(null, { edits: firstLook, before: left, after: away(), pass: SEND_BACK_PASS }).changed,
      ...reportAfterPass(null, { edits: broughtBack, before: clone(WEAVE), after: away(), pass: REWEAVE_PASS }).changed
    ];
    expect([...firstLook, ...broughtBack].map((edit) => editWhere(edit))).toEqual([
      'story', 'thread "t3", role', 'thread "t6", added', 'connection "c2", struck', 'connection "c2", brought back'
    ]);
    expect(entries.map((entry) => entry.where)).toEqual([...firstLook, ...broughtBack].map((edit) => editWhere(edit)));
    const about = (where, path) => markOfEntry({ path, before: 'before', after: 'after' }, entries.find((entry) => entry.where === where));
    // [the entry's place, a mark's path, whether the mark is about the entry]
    const CASES = [
      ['story', 'story', true],
      ['story', 'question', false],
      ['thread "t3", role', 'threads[#t3].role', true],
      ['thread "t3", role', 'threads[#t3]', true],
      ['thread "t3", role', 'threads[#t3].claim', false],
      ['thread "t3", role', 'threads[#t1].role', false],
      ['thread "t6", added', 'threads[#t6]', true],
      ['thread "t6", added', 'threads[#t6].claim', true],
      ['thread "t6", added', 'threads[#t6].role', true],
      ['thread "t6", added', 'threads[#t1].role', false],
      ['connection "c2", struck', 'connections[#c2]', true],
      ['connection "c2", struck', 'connections[#c2].detail', true],
      ['connection "c2", struck', 'connections[#c1].detail', false],
      ['connection "c2", brought back', 'connections[#c2]', true],
      ['connection "c2", brought back', 'connections[#c2].detail', true],
      ['connection "c2", brought back', 'connections[#c1].detail', false]
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
    return [view.story, view.question, view.headline, view.fromYourNotes, view.convergence, view.strongerMainThread]
      .concat(view.threads, view.connections, view.questions)
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

  /** The director's version: t3's claim and its role, both edited (probe case 1). */
  function twoFieldsEdited() {
    const left = clone(WEAVE);
    left.threads[2].role = 'mirrors-it';
    left.threads[2].claim = 'Morgan paid Riley twice.';
    return left;
  }

  /** A rework of `left` that took t3 out, with the connection that joins it. */
  function withoutT3(left) {
    const weave = clone(left);
    weave.threads = weave.threads.filter((t) => t.id !== 't3');
    weave.connections = weave.connections.filter((c) => !(c.joins || []).includes('t3'));
    return weave;
  }

  const T3_REMOVED = 'Thread "t3": taken out this round. Before: "id: t3; claim: Morgan paid Riley twice.; role: mirrors-it; receipt: mor001".';
  const C1_REMOVED = 'Connection "c1": taken out this round. Before: "id: c1; kind: person; joins: t1 / t3; detail: Morgan: one side of the deadlock, and the payer at the bar."';
  const GAVE_BOTH = ' The claim you gave it, "Morgan paid Riley twice.", and the role you gave it, "Mirrors it", went with it (the rework of your send-back).';

  test('a send-back that took out a thread whose claim and role the director edited: one line for the removal, naming both fields', () => {
    const left = twoFieldsEdited();
    const edits = standingAtMeeting(null, WEAVE, left);
    const reworked = withoutT3(left);
    const report = reportAfterPass(null, { edits: edits.edits, before: left, after: reworked, pass: SEND_BACK_PASS });
    expect(report.changed.map((c) => [c.where, c.became])).toEqual([['thread "t3", claim', null], ['thread "t3", role', null]]);
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
    const FOLDED = 'The note folded the payment into the main thread.';
    const NO_THREAD = 'The role no longer had a thread to sit on.';
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
      expect([pass, report.changed.map((c) => [c.where, c.restored])]).toEqual([pass, [['thread "t3", claim', true], ['thread "t3", role', true]]]);
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
    typed.threads.push({ id: 't6', claim: 'Riley kept a second ledger.', role: 'grounds-it' });
    const concern = 'Director\'s edit E1: T1, T4: "Riley kept a second ledger" states as fact what no document shows.';
    const data = payloadOf(stateAt({
      weave: weaveLib.withFactCheckMark(typed, { ...MARK, concerns: [concern] }),
      _weaveHandEdits: standingAtMeeting(null, WEAVE, typed)
    }));
    expect(data.concerns.map((c) => [c.text, c.places.map((p) => p.path)])).toEqual([[concern, ['threads[#t6]']]]);
    const view = meetingView(data, meetingDraftOf(data, undefined));
    expect(view.threads.find((t) => t.id === 't6').concerns).toEqual(['Concern: "Riley kept a second ledger" states as fact what no document shows.']);
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
  /** The meeting's one line for t3, whose claim and role the director edited, after a send-back took it out with these reasons. */
  function removedLineWith(reasons) {
    const left = clone(WEAVE);
    left.threads[2].role = 'mirrors-it';
    left.threads[2].claim = 'Morgan paid Riley twice.';
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
      { id: 'E1', reason: 'The note folds the payment into the main thread' },
      { id: 'E2', reason: 'No receipt left to cite' }
    ]))).toBe('Why: The note folds the payment into the main thread. No receipt left to cite.');
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
      id: 'E2', scope: 'threads', where: 'thread "t3", role', cut: false, removed: false, moved: false,
      director: 'mirrors-it', became: 'grounds-it', pass: SEND_BACK_PASS, automatic: false, reason: 'The note made the ledger the main thread', restored: false
    };
    expect(ViewLogic.changedEditLine(entry)).toBe('E2, thread "t3", role: your "mirrors-it" became "grounds-it" (the rework of your send-back). Why: The note made the ledger the main thread.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14a: the meeting's last defects (the final review, ruling 1)
// ═══════════════════════════════════════════════════════════════════════════
//
// Meeting 2: a connection that joins a thread left out is out of the story with it, so its
// line says so, and bringing the thread in brings the connection back. The console reads which
// threads it goes with by a copy of lib/weave.js leftOutThreadsJoined, held to it here.
describe('4.14a: a connection that joins a left-out thread says it goes with that thread', () => {
  const data = payloadOf(stateAt());
  const leftOutLines = (weave) => meetingView(data, weave).connections.map((c) => [c.id, c.leftOut]);

  test('its line names the thread it goes out with, and is gone once the thread is back in the story', () => {
    const draft = setThreadRole(meetingDraftOf(data, undefined), 2, 'left-out');
    expect(leftOutLines(draft)).toEqual([
      ['c1', 'Out of the story with thread t3, which is left out. Bring t3 in and this connection comes back.'],
      ['c2', '']
    ]);
    expect(leftOutLines(setThreadRole(draft, 2, 'mirrors-it'))).toEqual([['c1', ''], ['c2', '']]);
  });

  test('a connection that joins two left-out threads names both; a struck one says nothing, since the strike keeps it out', () => {
    const both = setThreadRole(setThreadRole(meetingDraftOf(data, undefined), 1, 'left-out'), 3, 'left-out');
    expect(leftOutLines(both)).toEqual([
      ['c1', ''],
      ['c2', 'Out of the story with threads t2 and t4, which are left out. Bring both in and this connection comes back.']
    ]);
    expect(leftOutLines(setConnectionStruck(both, 1, true))).toEqual([['c1', ''], ['c2', '']]);
  });

  test("the console reads which left-out threads a connection joins as lib/weave.js does, on one corpus", () => {
    expect(ViewLogic.LEFT_OUT_ROLE).toBe(weaveLib.LEFT_OUT_ROLE);
    const withRoles = (roles) => ({ ...clone(WEAVE), threads: clone(WEAVE).threads.map((t) => (roles[t.id] ? { ...t, role: roles[t.id] } : t)) });
    const repeat = withRoles({ t3: 'left-out' });
    repeat.threads.push({ id: 't3', claim: 'A second thread under t3, in the story.', role: 'grounds-it', receipt: 'ledger' });
    const odd = withRoles({ t1: 'left-out' });
    odd.connections.push({ id: 'c3', kind: 'line', joins: [' t1 ', 't9'], detail: 'A join to a thread the weave does not hold.' });
    odd.connections.push({ id: 'c4', kind: 'person', joins: 't1', detail: 'Joins that are no list.' });
    const corpus = [clone(WEAVE), withRoles({ t3: 'left-out' }), withRoles({ t2: 'left-out', t4: 'left-out' }), repeat, odd];
    corpus.forEach((weave) => weave.connections.forEach((connection) => {
      expect([connection.id, ViewLogic.leftOutThreadsOf(connection, weave)]).toEqual([connection.id, weaveLib.leftOutThreadsJoined(connection, weave)]);
    }));
  });
});
