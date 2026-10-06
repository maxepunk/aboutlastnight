/**
 * 4.8: the story meeting on screen, wired (phase 4, brief 4.8; spec 4.3 and 4.4).
 *
 * The console has no DOM harness (reports/CLAUDE.md), so the meeting's logic is pinned in
 * console/__tests__/checkpoint-view-logic-meeting.test.js and its wiring here, on the source
 * text, in the style of console-trace-panel.test.js: ArcSelection.js renders the meeting
 * from the view logic and sends only the view logic's payloads; the arc cards, the 3-to-5
 * selection, the evaluation bar and the questions panel are gone; every string that names
 * the arc stop or its cost says "story meeting" and R9's cost.
 *
 * Phase 4b, brief 1C (spec 2026-10-05 sections 4.1 and 9): the page shows meetingView as it is.
 * ArcSelection.js is run here with a React whose createElement builds a tree of its elements, so
 * the tests read what the page renders from each of the view model's fields. Since piece 3 (brief
 * 3B; spec 2026-10-06 section 5): the open angle's pitch, each thread in its story as its name and
 * its line with its evidence folded under "What's behind it", the left-out threads by name, each
 * opening in place to its line, each connection between the threads in as its line, a check still
 * failing under the line it names, and no tag anywhere. Since slice 3D (spec 2026-10-06 sections 5
 * and 6): each angle's card picks it, each thread's name and line are rewritten in place, each
 * thread's control flips it in or out of the open angle (the verdict's locked), and the page shows
 * no strike. The wiring is run here: mountMeeting re-renders after each change, so a test types,
 * clicks and reads the action each control dispatches.
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');
const count = (haystack, needle) => haystack.split(needle).length - 1;

describe('4.8: ArcSelection.js is the story meeting', () => {
  const src = read('components/checkpoints/ArcSelection.js');

  it('renders the page from meetingView, section by section in the view\'s order', () => {
    // 4.5c: the view reads the note box too, for the retry line.
    expect(count(src, 'ViewLogic.meetingView(data, draft, note)')).toBe(1);
    expect(src).toMatch(/view\.order\.map\(/);
  });

  it('has the three buttons, Approve, Reweave and Send back, from meetingButtons', () => {
    expect(count(src, 'ViewLogic.meetingButtons(')).toBe(1);
    ['buttons.approve.label', 'buttons.reweave.label', 'buttons.sendBack.label'].forEach((label) => expect(src).toContain(label));
    ['approve', 'reweave', 'send-back'].forEach((action) => expect(src).toContain(`send('${action}')`));
  });

  it('sends only the view logic\'s payloads, each held to the console\'s validator first', () => {
    expect(count(src, 'ViewLogic.meetingPayload(')).toBe(1);
    expect(count(src, 'ViewLogic.meetingWeaveProblems(')).toBe(1);
    expect(src).not.toMatch(/selectedArcs|outlineGuidance|arcFeedback|arcReviewPayload/);
  });

  // Fix round 1, finding 1: whether a reweave has something to fit in reads a round that did
  // not run, which only the stop's payload carries.
  it('hands the buttons and the payloads the stop\'s payload, not the weave alone', () => {
    expect(src).toContain('ViewLogic.meetingButtons(data, draft, note, sendBackArmed)');
    // 4.5c: the note sent is the box's, or none when Approve's question cleared it.
    expect(src).toContain('ViewLogic.meetingPayload(action, data, draft, sentNote)');
    expect(src).toContain("const sentNote = typeof typed === 'string' ? typed : note;");
  });

  // Fix round 1, finding 2: a mark whose line the round took out is listed under the line's
  // heading, so the page heads each line with the same labels.
  it('heads each of the weave\'s lines with the view logic\'s labels', () => {
    const { MEETING_LINE_LABELS } = require('../../console/checkpoint-view-logic');
    expect(src).toContain('const LABELS = ViewLogic.MEETING_LINE_LABELS;');
    Object.keys(MEETING_LINE_LABELS).forEach((key) => expect(src).toContain(`LABELS.${key}`));
    Object.values(MEETING_LINE_LABELS).forEach((label) => expect(`${label}: ${src.includes(`'${label}'`)}`).toBe(`${label}: false`));
  });

  it('edits the weave only through the view logic\'s operations: the pick, the open angle\'s pitch, a thread\'s name and line, a flip, an added thread, an answer', () => {
    ['pickMeetingAngle(', 'setAngleField(', 'setThreadField(', 'flipMeetingThread(', 'addMeetingThread(', 'removeMeetingThread(', 'setQuestionAnswer('].forEach((op) => {
      expect(`${op} ${count(src, `ViewLogic.${op}`)}`).toBe(`${op} 1`);
    });
  });

  // Slice 3D (R7; spec 6 and 14): the strike goes, and the page reads no part of it.
  it('shows no strike: it reads neither a connection\'s struck nor its strike label', () => {
    ['setConnectionStruck', 'connection.struck', 'labels.strike', 'Strike', 'struck'].forEach((gone) => expect(`${gone}: ${src.includes(gone)}`).toBe(`${gone}: false`));
  });

  it('keeps the director\'s weave and note in the meeting\'s pending slot, keyed to the weave\'s version', () => {
    expect(src).toMatch(/ViewLogic\.meetingPendingSlot\(data, nextDraft\)/);
    expect(src).toMatch(/ViewLogic\.meetingDraftOf\(data, pendingEdits\)/);
    expect(src).toMatch(/ViewLogic\.meetingNoteOf\(data, pendingEdits, pendingNote\)/);
    expect(src).toMatch(/\}, \[version\]\);/);
  });

  it('the arc cards, the 3-to-5 selection, the evaluation bar, RevisionDiff and the questions panel are gone', () => {
    ['arc-grid', 'arc-card', 'arcCardModel', 'defaultArcSelection', 'arcSelectionNote', 'EvalBar', 'RevisionDiff', 'WriterQuestionsPanel', 'narrativeArcs', 'lastEvaluationFrom']
      .forEach((gone) => expect(`${gone}: ${src.includes(gone)}`).toBe(`${gone}: false`));
  });
});

// Fix round 1, finding 3: the standing notes are one builder's at every stop, each under its
// stop's console label, so the meeting and RevisionDiff (the map and the desk) both hand the
// view logic CHECKPOINT_LABELS.
describe('4.8 fix round 1: the meeting and RevisionDiff list the standing notes under the console\'s stop labels', () => {
  it('the meeting hands meetingStandingNotes the labels', () => {
    expect(read('components/checkpoints/ArcSelection.js')).toContain('ViewLogic.meetingStandingNotes(data && data.directorGateNotes, CHECKPOINT_LABELS)');
  });

  it('RevisionDiff hands steeringView the labels, and prints each note under its label', () => {
    const src = read('components/RevisionDiff.js');
    expect(src).toMatch(/^const \{ Badge, CHECKPOINT_LABELS \} = window\.Console\.utils;$/m);
    expect(src).toContain('ViewLogic.steeringView(handEditReport, gateNotes, CHECKPOINT_LABELS)');
    expect(src).toContain("n.label + ': '");
  });
});

describe('4.8: every console string that names the arc stop or its cost says "story meeting" and R9\'s cost', () => {
  // 4.5c (review 4.8, minor 7): RollbackPanel.js is not listed: it never named the arc stage,
  // so its row passed before 4.8 too. Its change is pinned by the rollbackWarningLine test below.
  const FILES = [
    'components/checkpoints/Photos.js',
    'components/checkpoints/InputReview.js',
    'components/checkpoints/AwaitRoster.js',
    'components/checkpoints/EvidenceBundle.js',
    'components/SessionStart.js'
  ];

  it.each(FILES)('%s no longer names the arc stage', (rel) => {
    expect(read(rel)).not.toMatch(/arc selection|arc analysis|re-runs arc|Opus arcs/i);
  });

  it('the photos stop offers the way back to the story meeting, at no model call', () => {
    const src = read('components/checkpoints/Photos.js');
    expect(src).toContain("onRollback('arc-selection')");
    expect(src).toContain('Back to the story meeting (no model call)');
  });

  it('the roster stop, the evidence stop and the start form ask for the photos after the story meeting', () => {
    expect(read('components/checkpoints/AwaitRoster.js')).toContain('asks for the folder after the story meeting');
    expect(count(read('components/checkpoints/EvidenceBundle.js'), 'after the story meeting')).toBe(2);
    expect(read('components/SessionStart.js')).toContain('ask for the folder after the story meeting');
    expect(read('components/checkpoints/InputReview.js')).toContain('the story meeting');
  });

  it('the rollback panel says what a rollback costs through rollbackWarningLine', () => {
    const src = read('components/RollbackPanel.js');
    expect(src).toContain('rollbackWarningLine(targetCheckpoint)');
    expect(src).not.toContain("'This will clear all data from this point forward.'");
  });
});

describe('4.8: app.js\'s fallback payload for the meeting follows 4.5\'s', () => {
  const src = read('app.js');

  it('approves with the weave the meeting showed, through the view logic', () => {
    expect(src).toContain("'arc-selection': meetingPayload('approve', state.checkpointData, meetingWeaveOf(state.checkpointData.weave), '')");
    expect(src).toMatch(/^const \{ noteSlotKey, meetingPayload, meetingWeaveOf \} = window\.Console\.checkpointViewLogic;$/m);
    expect(src).not.toMatch(/selectedArcs/);
  });
});

describe('4.8: the theme choice at session start says the detective is parked (R1)', () => {
  const src = read('components/SessionStart.js');

  it('reads the parked themes from /api/config and words each one\'s line through parkedThemeNote', () => {
    expect(src).toMatch(/cfg\.parkedThemes/);
    expect(count(src, 'parkedThemeNote(')).toBeGreaterThanOrEqual(1);
    expect(src).toMatch(/^const \{ isValidSessionId, classifyCheckpointResponse, startFreshDecision, completedResultFrom, parkedThemeNote \} =$/m);
  });
});

describe('4.8: the meeting\'s styles', () => {
  const css = read('console.css');

  it('the arc cards\' styles went with the cards, and the meeting has its own section', () => {
    ['.arc-grid', '.arc-card', '.arc-selection__note', '.character-tag'].forEach((gone) => expect(`${gone}: ${css.includes(gone)}`).toBe(`${gone}: false`));
    const meeting = css.slice(css.indexOf('/* ── 4.8: the story meeting ──'));
    expect(css).toContain('/* ── 4.8: the story meeting ──');
    ['.meeting__section', '.meeting__thread', '.meeting__connection', '.meeting__concern', '.meeting__mark', '.meeting__thin-notes']
      .forEach((rule) => expect(`${rule}: ${meeting.includes(rule)}`).toBe(`${rule}: true`));
  });

  // Slice 3D (spec 14): the role picker's, the old left-out list's and the strike's styles went with their markup.
  it('keeps no style for a role, the old left-out list or a struck connection', () => {
    ['.meeting__role', '.meeting__left-out', '.meeting__connection--struck'].forEach((gone) => expect(`${gone}: ${css.includes(gone)}`).toBe(`${gone}: false`));
  });
});

// 4.5c: after a round that did not run, the retry line reads by what the note box holds, and
// a note restored into the box is not sent with Approve until the director says so.
describe('4.5c: the meeting reads its note box for the retry line, and Approve asks before it sends a restored note', () => {
  const src = read('components/checkpoints/ArcSelection.js');

  it('hands meetingView the note box', () => {
    expect(count(src, 'ViewLogic.meetingView(data, draft, note)')).toBe(1);
  });

  it('asks through meetingApproveAsk before Approve sends a restored note, and each answer approves: with the note kept, or with the box cleared', () => {
    expect(count(src, 'ViewLogic.meetingApproveAsk(data, note)')).toBe(1);
    ['approveAsk.question', 'approveAsk.keep.label', 'approveAsk.clear.label'].forEach((field) => expect(src).toContain(field));
    expect(src).toContain("send('approve', '')");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4b, brief 1C: the meeting's page shows meetingView as it is (spec 2026-10-05 sections
// 4.1, 6.3 and 9). Invented text throughout: the fixtures are lib/__tests__/fixtures/rework-state.js's.
// ═══════════════════════════════════════════════════════════════════════════

const ViewLogic = require('../../console/checkpoint-view-logic');
const { unsavedInputLine } = require('../../console/unsaved-input-logic');
const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
const { meetingCheckpointData } = require('../../lib/meeting');
const weaveLib = require('../../lib/weave');
// One way to read a rendered tree, the map's test's too (fix round 3).
const { elementsOf, textOf, FOLD } = require('../../lib/__tests__/fixtures/component-source');

const clone = (v) => JSON.parse(JSON.stringify(v));
const MARK = { at: '2026-10-05T21:40:00.000Z', ready: true, fixes: 0 };
const INDEX = {
  ale003: { name: 'ALE003 - The sale', owner: 'Alex Reeves', type: 'memory', firstLine: 'Marcus brags about the sale.' },
  mor001: { name: 'MOR001 - The envelope', owner: 'Morgan Reed', type: 'memory', firstLine: 'Morgan hands Riley an envelope.' },
  'p-dna': { name: 'Paternity test result', owner: '', type: 'paper', firstLine: 'Subject: Sarah Blackwood.' },
  'p-rescued': { name: 'An unsigned letter', owner: '', type: 'paper', firstLine: 'Dear Marcus.' }
};
const ACCUSATION = { verdictKind: 'overdose', accused: [], charge: 'Accidental overdose', votes: [{ option: 'Overdose', count: 6, adopted: true }, { option: 'Murder', count: 2 }] };

/**
 * A state paused at the meeting in the story-level shape, before any round. The writer's
 * threads come in an order other than the page's (the main thread second), so a control that
 * changed a thread by its place on the page would change the wrong one.
 */
function meetingState(overrides = {}) {
  const weave = clone(WEAVE);
  weave.threads = [weave.threads[1], weave.threads[0], ...weave.threads.slice(2)];
  return {
    weave: weaveLib.withFactCheckMark(weave, MARK),
    _weaveBaseline: clone(weave),
    sessionConfig: { accusation: ACCUSATION },
    directorGateNotes: [],
    arcRevisionCount: 0,
    humanArcRevisionCount: 0,
    ...overrides
  };
}

/** The stop's payload for a state, as server.js getCheckpointData sends it. */
const payloadOf = (state) => ({ type: 'arc-selection', ...meetingCheckpointData(state, { evidenceIndex: INDEX, maxRevisions: 1 }) });

/** The meeting when the checks' last result, on the weave in hand, holds these failures. */
function withFailures(failures) {
  const state = meetingState();
  return payloadOf({ ...state, _arcValidation: { weaveKey: weaveLib.weaveKey(state.weave), passed: false, failures, concerns: [] } });
}

/**
 * ArcSelection.js run with a React whose createElement returns `{type, props, children}`, whose
 * hooks hold their first value, and with the console's own modules for the globals the file
 * reads. A component the page uses (CollapsibleSection, Badge) stays a node, uncalled.
 */
function renderMeeting(props) {
  return mountMeeting(props).render();
}

/**
 * ArcSelection.js mounted with a React whose hooks keep their state across renders, in the order
 * the component calls them, as React's do: a setter changes the value the next render reads. Its
 * effects never run, as on a remount of the same weave version. `render` renders the page again
 * after a change; `actions` are what the page dispatched, in order.
 */
function mountMeeting(props) {
  const src = read('components/checkpoints/ArcSelection.js');
  const states = [];
  let hook = 0;
  const React = {
    Fragment: 'Fragment',
    createElement: (type, p, ...children) => ({ type, props: p || {}, children }),
    useState: (initial) => {
      const at = hook++;
      if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial;
      return [states[at], (value) => { states[at] = typeof value === 'function' ? value(states[at]) : value; }];
    },
    useEffect: () => {}
  };
  const window = {
    Console: {
      utils: { Badge: 'Badge', CollapsibleSection: 'CollapsibleSection', CHECKPOINT_LABELS: { 'arc-selection': 'Story meeting', outline: 'Map', article: 'Article' } },
      checkpointViewLogic: ViewLogic,
      unsavedInputLogic: require('../../console/unsaved-input-logic')
    }
  };
  const ArcSelection = new Function('window', 'React', `${src}\nreturn window.Console.checkpoints.ArcSelection;`)(window, React);
  const actions = [];
  const all = { onApprove: () => {}, onReject: () => {}, onRollback: () => {}, dispatch: (action) => actions.push(action), ...props };
  return {
    actions,
    last: () => actions[actions.length - 1],
    render: () => { hook = 0; return ArcSelection(all); }
  };
}

const classesOf = (node) => String(node.props.className || '').split(/\s+/).filter(Boolean);
const withClass = (name) => (node) => classesOf(node).includes(name);

/** The text a fold holds once opened, each of its items and lines apart. */
const held = (fold) => elementsOf(fold.children, (n) => n.type === 'li' || n.type === 'p').map(textOf).join(' | ');

/** The folds inside a node, outside any fold. */
const foldsIn = (node) => elementsOf(node.children, (n, folded) => n.type === FOLD && !folded);

/** Each string the page prints or reads out: every text, a field's value, a fold's title, a badge's label, and each aria-label, title and placeholder. */
function everyString(tree) {
  const strings = [];
  elementsOf(tree, (node) => {
    ['aria-label', 'title', 'placeholder', 'label'].forEach((prop) => { if (typeof node.props[prop] === 'string') strings.push(node.props[prop]); });
    if ((node.type === 'textarea' || node.type === 'input') && typeof node.props.value === 'string') strings.push(node.props.value);
    if (node.type !== 'option') node.children.forEach((child) => { if (typeof child === 'string') strings.push(child); });
    return false;
  });
  return strings;
}

describe('1C: the meeting\'s page renders meetingView\'s threads as it gives them', () => {
  const data = payloadOf(meetingState());
  const view = ViewLogic.meetingView(data, ViewLogic.meetingDraftOf(data), '');
  const tree = renderMeeting({ data });
  const rows = elementsOf(tree, withClass('meeting__thread'));

  it('shows the threads in the story in meetingView\'s order, the open angle\'s, each as its name and its line, the verdict\'s with its lock', () => {
    expect(view.threads[0].id).toBe('t1');
    expect(view.threads[0].index).toBe(1);
    expect(rows).toHaveLength(view.threads.length);
    rows.forEach((row, i) => {
      const thread = view.threads[i];
      expect(elementsOf(row, (n) => n.type === 'select')).toEqual([]);
      const [name] = elementsOf(row, withClass('meeting__thread-name'));
      const [line] = elementsOf(row, withClass('meeting__thread-line'));
      expect([name.props.value, name.props['aria-label']]).toEqual([thread.name, thread.labels.name]);
      expect([line.props.value, line.props['aria-label']]).toEqual([thread.line, thread.labels.line]);
      expect(textOf(row).includes(ViewLogic.VERDICT_LOCK_LINE)).toBe(thread.locked);
    });
  });

  // Slice 3D (R8; spec 6): every thread in the story but the verdict's has the control that leaves
  // it out, named by meetingView; the verdict's says it is always in, and has none.
  it('gives each thread in the story its flip control, and the verdict\'s its lock in its place', () => {
    rows.forEach((row, i) => {
      const thread = view.threads[i];
      const flips = elementsOf(row, withClass('meeting__flip'));
      expect(flips.map((b) => b.props['aria-label'])).toEqual(thread.locked ? [] : [thread.labels.flip]);
    });
    expect(view.threads.filter((t) => t.locked).map((t) => t.id)).toEqual(['t1']);
  });

  it('folds each thread\'s evidence under "What\'s behind it", each piece as evidenceFoldView words it, in a group named by the thread\'s name', () => {
    rows.forEach((row, i) => {
      const thread = view.threads[i];
      const folds = foldsIn(row);
      expect(folds).toHaveLength(1);
      expect(folds[0].props.title).toBe(view.evidenceTitle);
      expect(view.evidenceTitle).toBe("What's behind it");
      thread.evidence.forEach((piece) => expect(held(folds[0])).toContain(piece.text));
      thread.evidence.forEach((piece) => expect(textOf(row)).not.toContain(piece.shows));
      const [group] = elementsOf(row, withClass('meeting__fold'));
      expect(group.props['aria-label']).toBe(`${view.evidenceTitle}: ${thread.name}`);
      expect(elementsOf(group, (n) => n === folds[0])).toHaveLength(1);
    });
  });

  it('marks a piece that cuts against its line', () => {
    const state = meetingState();
    state.weave.threads[2].evidence.push({ sources: ['notes'], shows: 'Riley says the envelope held a tip.', stance: 'cuts-against' });
    const page = renderMeeting({ data: payloadOf(state) });
    const pieces = elementsOf(page, withClass('meeting__piece'));
    const against = pieces.filter(withClass('meeting__cuts-against'));
    expect(against.map(textOf)).toEqual(['Cuts against · Your notes: Riley says the envelope held a tip.']);
    expect(pieces.length).toBeGreaterThan(against.length);
  });

  it('a thread the director added shows, folded under it, that the map writer finds its evidence, and its Take out names it', () => {
    const draft = ViewLogic.addMeetingThread(ViewLogic.meetingDraftOf(data), 'The second ledger', 'Riley kept a second ledger.');
    const page = renderMeeting({ data, pendingEdits: ViewLogic.meetingPendingSlot(data, draft) });
    const row = elementsOf(page, withClass('meeting__thread')).find((r) => textOf(r).includes('The second ledger'));
    const folds = foldsIn(row);
    expect(folds).toHaveLength(1);
    expect(held(folds[0])).toContain(ViewLogic.MEETING_NO_EVIDENCE_LINE);
    expect(textOf(row)).not.toContain(ViewLogic.MEETING_NO_EVIDENCE_LINE);
    const takeOut = elementsOf(row, (n) => n.type === 'button' && textOf(n) === 'Take out');
    expect(takeOut.map((b) => b.props['aria-label'])).toEqual(['Take out the thread you added: The second ledger']);
  });

  it('shows the left-out threads by name, each opening in place to its name and line, rewritten there, with the control that brings it in', () => {
    const [leftOut] = elementsOf(tree, withClass('meeting__out'));
    expect(view.leftOut.threads.map((t) => t.name)).toEqual(['The letter']);
    expect(textOf(leftOut)).toContain(view.leftOut.title);
    const names = elementsOf(leftOut, withClass('meeting__out-thread'));
    expect(names).toHaveLength(view.leftOut.threads.length);
    const folds = foldsIn(leftOut);
    expect(folds.map((f) => f.props.title)).toEqual(view.leftOut.threads.map((t) => t.label));
    view.leftOut.threads.forEach((thread, i) => {
      const fields = elementsOf(folds[i].children, (n) => n.type === 'input' || n.type === 'textarea');
      expect(fields.map((f) => [f.props.value, f.props['aria-label']])).toEqual([[thread.name, thread.labels.name], [thread.line, thread.labels.line]]);
      expect(textOf(leftOut)).not.toContain(thread.line);
      expect(elementsOf(names[i], withClass('meeting__flip')).map((b) => b.props['aria-label'])).toEqual([thread.labels.flip]);
    });
  });
});

describe('1C: each connection between the threads in the story shows its line, and no control', () => {
  const data = payloadOf(meetingState());
  const view = ViewLogic.meetingView(data, ViewLogic.meetingDraftOf(data), '');
  const rows = elementsOf(renderMeeting({ data }), withClass('meeting__connection'));

  it('shows each connection\'s line alone, and folds its evidence', () => {
    expect(rows).toHaveLength(view.connections.length);
    expect(view.connections[0].joins).toBe('"The overdose vote" and "The envelope"');
    rows.forEach((row, i) => {
      const connection = view.connections[i];
      expect(textOf(row)).toContain(connection.line);
      expect(textOf(row)).not.toContain('Joins');
      const folds = foldsIn(row);
      expect(folds.map((f) => f.props.title)).toEqual([view.evidenceTitle]);
      connection.evidence.forEach((piece) => expect(held(folds[0])).toContain(piece.text));
      const [group] = elementsOf(row, withClass('meeting__fold'));
      expect(group.props['aria-label']).toBe(`${view.evidenceTitle}: the connection between ${connection.joins}`);
    });
  });

  // Slice 3D (R7; spec 6): a connection the director wants gone goes with a note; the page offers no strike.
  it('offers no control on a connection', () => {
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => expect(elementsOf(row, (n) => n.type === 'button')).toEqual([]));
  });
});

describe('1C: a check still failing shows under the line it names (spec 6.3)', () => {
  const data = withFailures([
    { type: 'story-terms', message: 'rework: t3 holds a clock time', line: 'The line of "The envelope" holds a clock time.', place: 'threads[#t3]' },
    { type: 'evidence-not-in-record', message: 'rework: c2 piece 1', line: 'The evidence behind a connection cites a document the record does not hold.', place: 'connections[#c2]' },
    { type: 'story-terms', message: 'rework: a1 story figure', line: 'The angle\'s story holds a money figure.', place: 'angles[#a1]' },
    { type: 'story-terms', message: 'rework: t5 clock time', line: 'The line of "The letter" holds a clock time.', place: 'threads[#t5]' },
    { type: 'duplicate-id', message: 'rework: q1 repeated', line: 'Two questions share one id.', place: 'questions[#q1]' },
    { type: 'over-length', message: 'rework: 470 words', line: "The writer's part of the meeting runs to 400 words, past the 350 it may use." }
  ]);
  const view = ViewLogic.meetingView(data, ViewLogic.meetingDraftOf(data), '');
  const tree = renderMeeting({ data });
  const checksIn = (node) => elementsOf(node, withClass('meeting__check')).map(textOf);
  const [round] = elementsOf(tree, withClass('meeting__round'));

  it('shows each failure the view sets beside a line under that line, in the director\'s words, styled as beside its line', () => {
    const thread = elementsOf(tree, withClass('meeting__thread')).find((r) => textOf(r).includes('The envelope'));
    expect(checksIn(thread)).toEqual(view.threads.find((t) => t.id === 't3').failures);
    const connection = elementsOf(tree, withClass('meeting__connection'))[1];
    expect(checksIn(connection)).toEqual(view.connections[1].failures);
    const [pitch] = elementsOf(tree, (n) => n.type === 'section' && n.props.key === 'pitch');
    expect(view.pitch.failures).toEqual(["Check still failing: The angle's story holds a money figure."]);
    expect(checksIn(pitch)).toEqual([...view.pitch.failures, ...view.questions[0].failures]);
    const [question] = elementsOf(tree, withClass('meeting__question'));
    expect(view.questions[0].failures).toEqual(['Check still failing: Two questions share one id.']);
    expect(checksIn(question)).toEqual(view.questions[0].failures);
    const atTop = new Set(elementsOf(round, withClass('meeting__check')));
    const beside = elementsOf(tree, (n) => withClass('meeting__check')(n) && !atTop.has(n));
    expect(beside).toHaveLength(5);
    beside.forEach((check) => expect(classesOf(check)).toContain('meeting__check--beside'));
  });

  it('shows a left-out thread\'s failure beside the names, under that thread\'s name', () => {
    const [leftOut] = elementsOf(tree, withClass('meeting__out'));
    const failure = view.leftOut.threads[0].failures[0];
    const [check] = elementsOf(leftOut, (n) => withClass('meeting__check')(n) && textOf(n).includes(failure));
    expect(textOf(check)).toBe(`The letter: ${failure}`);
  });

  it('keeps a failure with no place at the top, in the round\'s lines', () => {
    expect(checksIn(round)).toEqual(view.checkFailures);
    expect(view.checkFailures).toEqual(["Check still failing: The writer's part of the meeting runs to 400 words, past the 350 it may use."]);
  });
});

describe('1C: no tag on the page, and every aria-label names a thread by its name', () => {
  const state = meetingState();
  const data = payloadOf(state);
  const draft = ViewLogic.addMeetingThread(ViewLogic.meetingDraftOf(data), 'The second ledger', 'Riley kept a second ledger.');
  const tree = renderMeeting({ data, pendingEdits: ViewLogic.meetingPendingSlot(data, draft) });
  const ids = [...draft.angles, ...draft.threads, ...draft.connections, ...draft.questions].map((element) => element.id);

  it('prints and reads out no angle\'s, thread\'s, connection\'s or question\'s id', () => {
    expect(ids).toEqual(['a1', 'a2', 'a3', 't2', 't1', 't3', 't4', 't5', 't6', 'c1', 'c2', 'q1', 'q2']);
    const tag = new RegExp(`\\b(?:${ids.join('|')})\\b`);
    const strings = everyString(tree);
    expect(strings.length).toBeGreaterThan(20);
    expect(strings.filter((s) => tag.test(s))).toEqual([]);
  });

  // Piece 3 (spec 14): the role picker goes, the add line's included.
  it('shows no role picker', () => {
    expect(elementsOf(tree, (n) => n.type === 'select')).toEqual([]);
  });
});

// The page's other controls behave as today: each changes the weave the director has through the
// view logic's operations, by the element's place in the weave, never its place on the page.
describe('1C: the pitch\'s editors and the answer change the director\'s weave', () => {
  const data = payloadOf(meetingState());
  const view = ViewLogic.meetingView(data, ViewLogic.meetingDraftOf(data), '');
  const saved = () => {
    const calls = [];
    const tree = renderMeeting({ data, dispatch: (action) => calls.push(action) });
    return { tree, last: () => calls[calls.length - 1] };
  };

  it('the pitch\'s story editor rewrites the open angle\'s story', () => {
    const { tree, last } = saved();
    const [story] = elementsOf(tree, (n) => n.type === 'textarea' && n.props.id === 'meeting-story');
    expect(story.props.value).toBe(view.pitch.story.text);
    story.props.onChange({ target: { value: 'The room voted, and the ledger kept talking.' } });
    expect(last()).toMatchObject({ type: 'SAVE_PENDING_EDITS', checkpoint: 'arc-selection' });
    expect(last().edits.weave.angles.map((a) => a.story)).toEqual(['The room voted, and the ledger kept talking.', WEAVE.angles[1].story, WEAVE.angles[2].story]);
  });

  it('an answer answers its question', () => {
    const { tree, last } = saved();
    const [answer] = elementsOf(tree, withClass('meeting__answer'));
    answer.props.onChange({ target: { value: 'Sarah ran the bar all morning.' } });
    expect(last().edits.weave.questions[0].answer).toBe('Sarah ran the bar all morning.');
  });
});

describe('1C: the add-a-thread line takes a name and a line, through addMeetingThread', () => {
  const src = read('components/checkpoints/ArcSelection.js');
  const tree = renderMeeting({ data: payloadOf(meetingState()) });
  const [add] = elementsOf(tree, withClass('meeting__add'));

  it('holds a name and a line, each in its own control, and adds them through addMeetingThread', () => {
    expect(elementsOf(add, withClass('meeting__add-name')).map((n) => n.props['aria-label'])).toEqual(['The name of a thread to add']);
    expect(elementsOf(add, withClass('meeting__add-line')).map((n) => n.props['aria-label'])).toEqual(['A thread to add, in one line']);
    expect(elementsOf(add, (n) => n.type === 'select')).toEqual([]);
    expect(src).toContain('ViewLogic.addMeetingThread(draft, newName, newLine)');
  });

  it('holds the thread\'s line in classes named for the line, never the claim', () => {
    expect(src).not.toMatch(/meeting__claim|meeting__add-claim/);
  });
});

// A weave the add line builds is a payload the gate takes, at each of the three actions, on a state
// in the story-level shape: the thread is stored as typed, `{id, name, line}`, with no evidence (the
// map writer finds it; spec 5.3), in the open angle's story, as one edit of the director's.
describe('1C: a weave the add line builds passes buildResumePayload on a state in the new shape', () => {
  const { buildResumePayload } = require('../../server.js');

  test.each([
    ['approve', ''],
    ['reweave', ''],
    ['send-back', 'Bring the second ledger into the story.']
  ])('%s', (action, note) => {
    const state = meetingState();
    const data = payloadOf(state);
    const draft = ViewLogic.addMeetingThread(ViewLogic.meetingDraftOf(data), 'The second ledger', 'Riley kept a second ledger.');
    expect(ViewLogic.meetingWeaveProblems(draft, data.weave)).toBeNull();
    const payload = ViewLogic.meetingPayload(action, data, draft, note);
    const { error, stateUpdates } = buildResumePayload(payload, state, 'journalist', 'arc-selection');
    expect(error).toBeNull();
    expect(stateUpdates.weave.threads[5]).toEqual({ id: 't6', name: 'The second ledger', line: 'Riley kept a second ledger.' });
    expect(stateUpdates.weave.angles[0].threads).toEqual(['t1', 't2', 't3', 't4', 't6']);
    expect(stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t6]']);
  });

  test('a thread typed with its name alone is taken too, and the meeting after shows it with the fold\'s line', () => {
    const state = meetingState();
    const data = payloadOf(state);
    const draft = ViewLogic.addMeetingThread(ViewLogic.meetingDraftOf(data), 'The second ledger', '');
    const { error, stateUpdates } = buildResumePayload(ViewLogic.meetingPayload('reweave', data, draft, ''), state, 'journalist', 'arc-selection');
    expect(error).toBeNull();
    expect(stateUpdates.weave.threads[5]).toEqual({ id: 't6', name: 'The second ledger', line: '' });
    // The rework keeps the thread and finds it no evidence: the meeting after shows it with the fold's line.
    const after = payloadOf({ ...state, ...stateUpdates, weave: weaveLib.withFactCheckMark(clone(stateUpdates.weave), MARK), _meetingRound: null });
    expect(after.directorsThreads).toEqual(['t6']);
    const row = elementsOf(renderMeeting({ data: after }), withClass('meeting__thread')).find((r) => textOf(r).includes('The second ledger'));
    expect(elementsOf(row, withClass('meeting__thread-name')).map((n) => n.props.value)).toEqual(['The second ledger']);
    expect(elementsOf(row, withClass('meeting__thread-line')).map((n) => n.props.value)).toEqual(['']);
    expect(held(foldsIn(row)[0])).toContain(ViewLogic.MEETING_NO_EVIDENCE_LINE);
  });
});

describe('1C: the meeting\'s styles', () => {
  const css = read('console.css');
  const meeting = css.slice(css.indexOf('/* ── 4.8: the story meeting ──'), css.indexOf('/* ── 4.9: the map ──'));

  it('styles the angle cards, the pitch, a thread\'s name and line rewritten in place, its flip, the fold and its pieces, a piece that cuts against its line, the left-out names, a check beside its line and the add line', () => {
    ['.meeting__angles', '.meeting__angle', '.meeting__angle--open', '.meeting__pitch', '.meeting__inline', '.meeting__thread-name', '.meeting__thread-line', '.meeting__flip',
      '.meeting__fold', '.meeting__piece', '.meeting__cuts-against', '.meeting__out', '.meeting__out-list', '.meeting__out-thread',
      '.meeting__check--beside', '.meeting__add-name', '.meeting__add-line']
      .forEach((rule) => expect(`${rule}: ${new RegExp(`${rule.replace(/[.-]/g, '\\$&')}[\\s,{:]`).test(meeting)}`).toBe(`${rule}: true`));
  });

  it('keeps no style for the claim or a tag', () => {
    ['.meeting__claim', '.meeting__add-claim', '.meeting__id'].forEach((gone) => expect(`${gone}: ${css.includes(gone)}`).toBe(`${gone}: false`));
  });
});

// Fix round 2: the page decides no label itself (the plan's Console rule). meetingView gives each
// thread and connection the labels the page names it by, read from one name rule (threadLabelOf,
// which the meeting's words read too), and ArcSelection.js reads them. Fix round 3: one convention
// for the meeting's and the map's pages, `label`, the element's name as the page prints it, and
// `labels`, its aria-labels and fold title keyed by the control, the fold's from one builder
// (evidenceFoldLabel). Since piece 3 a connection prints its line alone, which is its `label`.
describe('fix rounds 2 and 3: meetingView gives each thread and connection the labels the page reads, and the page builds none', () => {
  /** The meeting with the envelope's name padded, and the heir named by its line alone. */
  function labelled() {
    const state = meetingState();
    state.weave.threads[2].name = '  The envelope  ';
    state.weave.threads[3].name = '';
    const data = payloadOf(state);
    return { data, view: ViewLogic.meetingView(data, ViewLogic.meetingDraftOf(data), '') };
  }

  it("each thread carries its label, its name trimmed or its line when it has none, and its controls' labels built from it", () => {
    const { view } = labelled();
    const envelope = view.threads.find((t) => t.id === 't3');
    expect(envelope.label).toBe('The envelope');
    expect(envelope.labels).toEqual({
      fold: "What's behind it: The envelope",
      flip: 'Leave out of the story: The envelope',
      name: 'The name of the thread The envelope',
      line: 'The line of the thread The envelope',
      takeOut: 'Take out the thread you added: The envelope'
    });
    expect(envelope.labels.fold).toBe(ViewLogic.evidenceFoldLabel(envelope.label));
    expect(view.threads.find((t) => t.id === 't4').label).toBe("A paternity result names Sarah as Marcus's heir.");
    expect(view.leftOut.threads.map((t) => t.label)).toEqual(['The letter']);
    expect(view.leftOut.names).toBe('The letter');
  });

  it("each connection carries its label, the line the page prints, and its fold's label, naming it by the threads it joins", () => {
    const { view } = labelled();
    expect(view.connections[0].label).toBe(WEAVE.connections[0].line);
    expect(view.connections[0].labels.fold).toBe(`What's behind it: the connection between "The overdose vote" and "The envelope"`);
  });

  it('each angle carries its label, its headline, and its pick control\'s label', () => {
    const { view } = labelled();
    expect(view.angles.map((a) => [a.label, a.labels.pick])).toEqual(WEAVE.angles.map((a) => [a.headline, `Open the angle "${a.headline}"`]));
  });

  it('the page names each thread and connection by those fields, its fold groups and aria-labels included', () => {
    const { data, view } = labelled();
    const tree = renderMeeting({ data });
    const envelope = elementsOf(tree, withClass('meeting__thread')).find((row) => textOf(row).includes('The envelope'));
    const thread = view.threads.find((t) => t.id === 't3');
    expect(elementsOf(envelope, withClass('meeting__fold')).map((n) => n.props['aria-label'])).toEqual([thread.labels.fold]);
    expect(elementsOf(envelope, withClass('meeting__flip')).map((n) => n.props['aria-label'])).toEqual([thread.labels.flip]);
    expect(elementsOf(tree, withClass('meeting__angle')).map((n) => n.props['aria-label'])).toEqual(view.angles.map((a) => a.labels.pick));
    elementsOf(tree, withClass('meeting__connection')).forEach((row, i) => {
      expect(elementsOf(row, withClass('meeting__fold')).map((n) => n.props['aria-label'])).toEqual([view.connections[i].labels.fold]);
      expect(elementsOf(row, withClass('meeting__detail')).map(textOf)).toEqual([view.connections[i].label]);
    });
  });

  it('ArcSelection.js reads the labels and builds none of them', () => {
    const src = read('components/checkpoints/ArcSelection.js');
    ['angle.labels.pick', 'thread.label', 'thread.labels.fold', 'thread.labels.flip', 'thread.labels.name', 'thread.labels.line', 'thread.labels.takeOut', 'connection.line', 'connection.labels.fold']
      .forEach((field) => expect(`${field}: ${src.includes(field)}`).toBe(`${field}: true`));
    ['function threadName', 'function connectionName', "'Role of the thread ' +", "'Take out the thread you added: ' +", "'the connection between ' +", "view.evidenceTitle + ': '", "'Joins '",
      'foldLabel:', 'AriaLabel']
      .forEach((built) => expect(`${built}: ${src.includes(built)}`).toBe(`${built}: false`));
  });

  it("the meeting's and the map's folds name their group through one builder, and the view keeps none of the old flat fields", () => {
    const view = read('checkpoint-view-logic.js');
    expect(count(view, "EVIDENCE_FOLD_TITLE + ': '")).toBe(1);
    ['foldLabel', 'roleAriaLabel', 'takeOutAriaLabel', 'strikeAriaLabel'].forEach((gone) => expect(`${gone}: ${view.includes(gone)}`).toBe(`${gone}: false`));
    const start = view.indexOf('function meetingView(');
    const meeting = view.slice(start, view.indexOf('\n  function ', start));
    const moves = view.slice(view.indexOf('function moveLabelsOf('), view.indexOf('function photoNameOf('));
    expect(count(meeting, 'evidenceFoldLabel(')).toBe(2);
    expect(count(moves, 'evidenceFoldLabel(')).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Slice 3D: the meeting's page (spec 2026-10-06 sections 5 and 6). Each control is run on the page
// mounted once, re-rendered after each change, and each is held to the action it dispatches: the
// meeting's pending slot, `{version, weave}` under the stop's version, with the note beside it.
// ═══════════════════════════════════════════════════════════════════════════

describe('3D: the angles side by side, each card picking its angle', () => {
  const data = payloadOf(meetingState());
  const view = ViewLogic.meetingView(data, ViewLogic.meetingDraftOf(data), '');

  it('shows each angle as its card in the view\'s order: the open one says only that it is open below, every other its headline and its card line', () => {
    const cards = elementsOf(renderMeeting({ data }), withClass('meeting__angle'));
    expect(cards.map((c) => c.type)).toEqual(view.angles.map(() => 'button'));
    expect(cards.map(textOf)).toEqual(view.angles.map((a) => (a.open ? `${a.number}${view.angleOpenLine}` : `${a.number}${a.headline}${a.gist}`)));
    expect(cards.map((c) => c.props['aria-pressed'])).toEqual(view.angles.map((a) => a.open));
    expect(cards.map((c) => classesOf(c).includes('meeting__angle--open'))).toEqual([true, false, false]);
  });

  it('a card picks its angle: the action carries the pick, and the page opens that angle\'s pitch and threads', () => {
    const page = mountMeeting({ data });
    const [, second] = elementsOf(page.render(), withClass('meeting__angle'));
    second.props.onClick();
    expect(page.last()).toMatchObject({ type: 'SAVE_PENDING_EDITS', checkpoint: 'arc-selection', edits: { version: ViewLogic.meetingVersion(data) }, note: '' });
    expect(page.last().edits.weave.picked).toBe('a2');
    expect(page.last().edits.weave.angles).toEqual(ViewLogic.meetingDraftOf(data).angles);
    const after = page.render();
    const [headline] = elementsOf(after, (n) => n.props.id === 'meeting-headline');
    expect(headline.props.value).toBe(WEAVE.angles[1].headline);
    expect(elementsOf(after, withClass('meeting__thread-name')).map((n) => n.props.value).slice(0, 2)).toEqual(['The envelope', 'The overdose vote']);
    expect(elementsOf(after, withClass('meeting__angle')).map((c) => c.props['aria-pressed'])).toEqual([false, true, false]);
  });

  it('the open angle\'s card picks nothing', () => {
    const page = mountMeeting({ data });
    const [first] = elementsOf(page.render(), withClass('meeting__angle'));
    first.props.onClick();
    expect(page.actions).toEqual([]);
  });
});

describe('3D: the open angle\'s pitch, each line rewritten in place', () => {
  const data = payloadOf(meetingState());
  const view = ViewLogic.meetingView(data, ViewLogic.meetingDraftOf(data), '');

  it('shows each line of the pitch under its heading, inside the pitch\'s panel', () => {
    const [pitch] = elementsOf(renderMeeting({ data }), withClass('meeting__pitch'));
    const fields = elementsOf(pitch, (n) => n.type === 'textarea' && /^meeting-/.test(n.props.id || ''));
    expect(fields.map((f) => [f.props.id, f.props.value])).toEqual(['headline', 'story', 'question', 'lands', 'ends'].map((k) => [`meeting-${k}`, view.pitch[k].text]));
  });

  it('a pitch edit rewrites the line on the open angle, and on the angle picked after a pick', () => {
    const page = mountMeeting({ data });
    const [headline] = elementsOf(page.render(), (n) => n.props.id === 'meeting-headline');
    headline.props.onChange({ target: { value: 'The Ledger Kept Talking' } });
    expect(page.last().edits.weave.angles.map((a) => a.headline)).toEqual(['The Ledger Kept Talking', WEAVE.angles[1].headline, WEAVE.angles[2].headline]);
    elementsOf(page.render(), withClass('meeting__angle'))[2].props.onClick();
    const [lands] = elementsOf(page.render(), (n) => n.props.id === 'meeting-lands');
    lands.props.onChange({ target: { value: 'Sarah was in the room.' } });
    expect(page.last().edits.weave.angles.map((a) => a.lands)).toEqual([WEAVE.angles[0].lands, WEAVE.angles[1].lands, 'Sarah was in the room.']);
    expect(page.last().edits.weave.angles[0].headline).toBe('The Ledger Kept Talking');
  });
});

describe('3D: each thread rewritten in place, and flipped in or out of the open angle', () => {
  const data = payloadOf(meetingState());
  /** The row of the thread in the story whose name box holds `name`. */
  const rowNamed = (tree, name) => elementsOf(tree, withClass('meeting__thread'))
    .find((r) => elementsOf(r, withClass('meeting__thread-name'))[0].props.value === name);

  it('a thread edit rewrites its name, and its line, on the weave\'s thread', () => {
    const page = mountMeeting({ data });
    elementsOf(rowNamed(page.render(), 'The envelope'), withClass('meeting__thread-name'))[0].props.onChange({ target: { value: 'The envelope at the bar' } });
    expect(page.last().edits.weave.threads.map((t) => t.name)).toEqual(['The sale', 'The overdose vote', 'The envelope at the bar', 'The heir', 'The letter']);
    elementsOf(rowNamed(page.render(), 'The envelope at the bar'), withClass('meeting__thread-line'))[0].props.onChange({ target: { value: 'Morgan paid Riley out of sight.' } });
    expect(page.last().edits.weave.threads[2]).toMatchObject({ id: 't3', name: 'The envelope at the bar', line: 'Morgan paid Riley out of sight.' });
  });

  it('a left-out thread is rewritten in place inside its fold', () => {
    const page = mountMeeting({ data });
    const [out] = elementsOf(page.render(), withClass('meeting__out-thread'));
    const [line] = elementsOf(out, withClass('meeting__thread-line'));
    line.props.onChange({ target: { value: 'An unsigned letter warned Marcus off the patents.' } });
    expect(page.last().edits.weave.threads[4]).toMatchObject({ id: 't5', line: 'An unsigned letter warned Marcus off the patents.' });
  });

  it('a flip leaves a thread out of the open angle, and the next brings a left-out one in, after the angle\'s own', () => {
    const page = mountMeeting({ data });
    elementsOf(rowNamed(page.render(), 'The sale'), withClass('meeting__flip'))[0].props.onClick();
    expect(page.last().edits.weave.angles.map((a) => a.threads)).toEqual([['t1', 't3', 't4'], ['t3', 't1'], ['t4', 't1']]);
    const after = page.render();
    expect(elementsOf(after, withClass('meeting__out-thread')).map((li) => foldsIn(li)[0].props.title)).toEqual(['The sale', 'The letter']);
    const letter = elementsOf(after, withClass('meeting__out-thread'))[1];
    elementsOf(letter, withClass('meeting__flip'))[0].props.onClick();
    expect(page.last().edits.weave.angles[0].threads).toEqual(['t1', 't3', 't4', 't5']);
  });

  it('a question beside a thread moves out with it, and its answer box stays on the page', () => {
    const page = mountMeeting({ data });
    expect(elementsOf(rowNamed(page.render(), 'The sale'), withClass('meeting__answer'))).toHaveLength(1);
    elementsOf(rowNamed(page.render(), 'The sale'), withClass('meeting__flip'))[0].props.onClick();
    const [out] = elementsOf(page.render(), withClass('meeting__out'));
    expect(elementsOf(out, withClass('meeting__answer')).map((n) => n.props['aria-label'])).toEqual([`Your answer: ${WEAVE.questions[1].question}`]);
  });
});

describe('3D: the add line adds a thread to the open angle, and holds the buttons while it holds text', () => {
  const data = payloadOf(meetingState());

  it('an add puts the typed thread in the open angle\'s story, after its own, and clears the line', () => {
    const page = mountMeeting({ data });
    const field = (cls) => elementsOf(page.render(), withClass(cls))[0];
    field('meeting__add-name').props.onChange({ target: { value: 'The second ledger' } });
    field('meeting__add-line').props.onChange({ target: { value: 'Riley kept a second ledger.' } });
    const tree = page.render();
    expect(elementsOf(tree, withClass('held-line')).map(textOf)).toEqual([unsavedInputLine('arc-selection', { addLine: 'The second ledgerRiley kept a second ledger.' })]);
    const [button] = elementsOf(elementsOf(tree, withClass('meeting__add'))[0], (n) => n.type === 'button');
    expect(page.actions).toEqual([]);
    button.props.onClick();
    expect(page.last().edits.weave.threads[5]).toEqual({ id: 't6', name: 'The second ledger', line: 'Riley kept a second ledger.' });
    expect(page.last().edits.weave.angles[0].threads).toEqual(['t1', 't2', 't3', 't4', 't6']);
    expect([field('meeting__add-name').props.value, field('meeting__add-line').props.value]).toEqual(['', '']);
    expect(elementsOf(page.render(), withClass('held-line'))).toEqual([]);
  });
});

describe('3D: an answer, in its box beside what it changes', () => {
  it('an answer by the pitch sets the answer on its question', () => {
    const data = payloadOf(meetingState());
    const page = mountMeeting({ data });
    const [pitch] = elementsOf(page.render(), withClass('meeting__pitch'));
    const [answer] = elementsOf(pitch, withClass('meeting__answer'));
    expect(answer.props['aria-label']).toBe(`Your answer: ${WEAVE.questions[0].question}`);
    answer.props.onChange({ target: { value: 'Sarah ran the bar all morning.' } });
    expect(page.last()).toMatchObject({ type: 'SAVE_PENDING_EDITS', checkpoint: 'arc-selection' });
    expect(page.last().edits.weave.questions.map((q) => q.answer)).toEqual(['Sarah ran the bar all morning.', undefined]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 fix A: a pick names an angle by its id, so it opens the first angle under that id, and the
// gate refuses a pick of an id the writer repeated unless it is the angle the meeting opened
// (lib/meeting.js pickProblems). meetingView flags every other angle under such an id
// (`repeatedId`), and its card is off from the start, before the director edits anything.
// ═══════════════════════════════════════════════════════════════════════════
describe('3 fix A: an angle under an id the writer repeated cannot be picked', () => {
  /** The meeting with the writer's third angle under `id`. */
  const repeating = (id) => {
    const state = meetingState();
    [state.weave, state._weaveBaseline].forEach((w) => { w.angles[2].id = id; });
    return state;
  };
  const viewOf = (data) => ViewLogic.meetingView(data, ViewLogic.meetingDraftOf(data), '');

  it('meetingView flags every angle under a repeated id but the one the meeting opened', () => {
    expect(viewOf(payloadOf(repeating('a2'))).angles.map((a) => a.repeatedId)).toEqual([false, true, true]);
    expect(viewOf(payloadOf(repeating('a1'))).angles.map((a) => a.repeatedId)).toEqual([false, false, true]);
    expect(viewOf(payloadOf(meetingState())).angles.map((a) => a.repeatedId)).toEqual([false, false, false]);
  });

  it('the page says why a flagged angle cannot be picked', () => {
    expect(viewOf(payloadOf(repeating('a2'))).repeatedIdHint).toMatch(/one id to more than one angle, thread or connection/);
    expect(viewOf(payloadOf(meetingState())).repeatedIdHint).toBe('');
  });

  it('a flagged angle\'s card is off and picks nothing', () => {
    const page = mountMeeting({ data: payloadOf(repeating('a2')) });
    const cards = elementsOf(page.render(), withClass('meeting__angle'));
    expect(cards.map((c) => c.props.disabled)).toEqual([false, true, true]);
    cards[1].props.onClick();
    cards[2].props.onClick();
    expect(page.actions).toEqual([]);
  });

  it('the angle the meeting opened stays pickable under a repeated id, so the director can come back to it, and the gate takes that pick', () => {
    const { meetingResume } = require('../../lib/meeting');
    const state = repeating('a1');
    const data = payloadOf(state);
    const page = mountMeeting({ data });
    elementsOf(page.render(), withClass('meeting__angle'))[1].props.onClick();
    expect(page.last().edits.weave.picked).toBe('a2');
    const cards = elementsOf(page.render(), withClass('meeting__angle'));
    expect(cards.map((c) => c.props.disabled)).toEqual([false, false, true]);
    cards[0].props.onClick();
    const back = page.last().edits.weave;
    expect(back.picked).toBe('a1');
    expect(meetingResume(ViewLogic.meetingPayload('approve', data, back, ''), state).error).toBeNull();
  });
});

// 3 fix A: a flip names its thread by its id (flipMeetingThread throws on none), so a thread with no
// id has its flip control off, as an angle card with no id is.
describe('3 fix A: a thread with no id cannot be flipped', () => {
  it('its flip control is off and flips nothing, whether its id is empty or blank', () => {
    const state = meetingState();
    // An angle names its threads by id, so a thread with none sits left out: t4, the heir, taken
    // off the angles with its id, and t5, the letter, in no angle, under a blank id.
    [state.weave, state._weaveBaseline].forEach((w) => {
      w.threads.find((t) => t.id === 't4').id = '';
      w.threads.find((t) => t.id === 't5').id = ' ';
      w.angles.forEach((angle) => { angle.threads = angle.threads.filter((id) => id !== 't4'); });
    });
    const page = mountMeeting({ data: payloadOf(state) });
    const tree = page.render();
    const flips = elementsOf(tree, withClass('meeting__flip'));
    const named = (label) => flips.find((b) => b.props['aria-label'] === label);
    const heir = named('Bring into the story: The heir');
    const letter = named('Bring into the story: The letter');
    expect([heir.props.disabled, letter.props.disabled]).toEqual([true, true]);
    expect(named('Leave out of the story: The envelope').props.disabled).toBe(false);
    heir.props.onClick();
    letter.props.onClick();
    expect(page.actions).toEqual([]);
  });
});
