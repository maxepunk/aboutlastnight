/**
 * 4.8: the story meeting on screen, wired (phase 4, brief 4.8; spec 4.3 and 4.4).
 *
 * The console has no DOM harness (reports/CLAUDE.md), so the meeting's logic is pinned in
 * console/__tests__/checkpoint-view-logic-meeting.test.js and its wiring here, on the source
 * text, in the style of console-trace-panel.test.js: ArcSelection.js renders the meeting
 * from the view logic and sends only the view logic's payloads; the arc cards, the 3-to-5
 * selection, the evaluation bar and the questions panel are gone; every string that names
 * the arc stop or its cost says "story meeting" and R9's cost.
 */
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

  it('edits the weave only through the view logic\'s operations: the four fields, a role, an added thread, a strike, an answer', () => {
    ['setMeetingField(', 'setThreadRole(', 'addMeetingThread(', 'removeMeetingThread(', 'setConnectionStruck(', 'setQuestionAnswer('].forEach((op) => {
      expect(count(src, `ViewLogic.${op}`)).toBe(1);
    });
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

  it('a meeting with no weave offers the way back to the meeting, which writes one fresh', () => {
    expect(src).toContain("onRollback('arc-selection')");
    expect(src).not.toContain("onRollback('evidence-and-photos')");
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
    ['.meeting__section', '.meeting__thread', '.meeting__connection--struck', '.meeting__concern', '.meeting__mark', '.meeting__thin-notes']
      .forEach((rule) => expect(`${rule}: ${meeting.includes(rule)}`).toBe(`${rule}: true`));
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
