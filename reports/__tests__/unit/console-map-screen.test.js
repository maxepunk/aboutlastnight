/**
 * 4.9: the map on screen, wired (phase 4, brief 4.9; spec 5.2 and 5.3).
 *
 * The console has no DOM harness (reports/CLAUDE.md), so the map's logic is pinned in
 * console/__tests__/checkpoint-view-logic-map.test.js and its wiring here, on the source text,
 * in the style of console-meeting-screen.test.js: Outline.js renders the map from the view
 * logic, changes it only through the edit logic's operations and editors, holds it to the
 * gate's decisions and sends only the view logic's payloads; the old outline's editors, the
 * thesis panel, the evaluation bar, RevisionDiff, the JSON editor and the writers' questions
 * panel are gone.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');
const count = (haystack, needle) => haystack.split(needle).length - 1;

describe('4.9: Outline.js is the map', () => {
  const src = read('components/checkpoints/Outline.js');

  it('renders the page from mapView, on the map as the director has it', () => {
    expect(count(src, 'ViewLogic.mapView(data, draft)')).toBe(1);
  });

  it('holds the map to the gate\'s decisions, then sends only the view logic\'s payloads', () => {
    expect(count(src, 'ViewLogic.mapProblems(draft, data)')).toBe(1);
    expect(count(src, 'ViewLogic.mapPayload(action, draft, note)')).toBe(1);
    expect(count(src, 'ViewLogic.mapButtons(note, sendBackArmed)')).toBe(1);
    ['send(\'approve\')', 'send(\'send-back\')'].forEach((call) => expect(src).toContain(call));
    expect(src).not.toMatch(/outlineReviewPayload|outlineEdits|outlineFeedback|outlineNote|validateOutlineShape/);
  });

  it('changes the map only through the edit logic\'s moves', () => {
    ['moveBeat(', 'strikeBeat(', 'bringBackBeat(', 'addBeat(', 'removeBeat(', 'movePhoto(', 'setPhotoBeside('].forEach((op) => {
      expect(`${op} ${count(src, `EditLogic.${op}`)}`).toBe(`${op} 1`);
    });
  });

  it('edits each line through its editor: init when it opens, build when it saves, merge into the map', () => {
    [['initMapHead', 'buildMapHead', 'mergeMapHead'], ['initGapNote', 'buildGapNote', 'mergeGapNote'],
      ['initMapSection', 'buildMapSection', 'mergeMapSection'], ['initBeat', 'buildBeat', 'mergeBeat'],
      ['initMapLength', 'buildMapLength', 'mergeMapLength']].forEach((names) => {
      names.forEach((name) => expect(`${name} ${count(src, `EditLogic.${name}(`)}`).toBe(`${name} 1`));
    });
  });

  it('keeps the director\'s map and note in the map\'s pending slot, keyed to the map\'s version', () => {
    expect(src).toMatch(/ViewLogic\.mapPendingSlot\(data, nextDraft\)/);
    expect(src).toMatch(/ViewLogic\.mapDraftOf\(data, pendingEdits\)/);
    expect(src).toMatch(/ViewLogic\.mapNoteOf\(data, pendingEdits, pendingNote\)/);
    expect(src).toMatch(/\}, \[version\]\);/);
  });

  it('shows the settled story read-only, with the way back to the meeting through the existing rollback', () => {
    expect(src).toContain("onRollback('arc-selection')");
    expect(src).not.toMatch(/setMeetingField|settledStory\.story = /);
  });

  it('folds the standing notes under the note box, each under the console\'s stop label', () => {
    expect(src).toContain('ViewLogic.standingNotesView(data && data.directorGateNotes, CHECKPOINT_LABELS)');
  });

  it('folds the trace of an automatic rework below the map', () => {
    expect(count(src, 'ViewLogic.traceView(data && data.trace, theme)')).toBe(1);
    expect(src).toMatch(/React\.createElement\(CollapsibleSection, \{ title: trace\.title \},\s*React\.createElement\(TracePanel, \{ view: trace \}\)\)/);
  });

  it('the old outline\'s editors, the thesis panel, the evaluation bar, RevisionDiff, the JSON editor and the questions panel are gone', () => {
    ['initThesis', 'buildThesisPayload', 'dropRetiredOutlineFields', 'LedeEditor', 'renderThesis', 'EvalBar', 'evaluationView',
      'RevisionDiff', 'revisionCache', 'CACHE_REVISION', 'WriterQuestionsPanel', 'writerQuestionsView', 'handleJsonApprove', 'isDetective']
      .forEach((gone) => expect(`${gone}: ${src.includes(gone)}`).toBe(`${gone}: false`));
  });
});

describe('4.9: app.js\'s fallback payload for the map follows 4.6\'s', () => {
  const src = read('app.js');

  it('approves with the map the stop showed, through the view logic', () => {
    expect(src).toContain("'outline': mapPayload('approve', mapDraftOf(state.checkpointData, undefined), '')");
    expect(src).toMatch(/^const \{ mapPayload, mapDraftOf \} = window\.Console\.checkpointViewLogic;$/m);
    expect(src).not.toContain("'outline': { outline: true }");
  });
});

describe('4.9: CHECKPOINT_RECEIVED keeps the map\'s slot as it keeps the meeting\'s', () => {
  it('state.js says so beside the one call that decides it', () => {
    const stateSrc = read('state.js');
    const received = stateSrc.slice(stateSrc.indexOf('case ACTIONS.CHECKPOINT_RECEIVED:'), stateSrc.indexOf('case ACTIONS.PROCESSING_START:'));
    expect(received).toMatch(/the story meeting's and the map's/);
    expect(count(received, 'pendingEditsAfterCheckpoint(')).toBe(1);
  });
});

describe('4.9: the map\'s styles', () => {
  const css = read('console.css');

  it('the map has its own section, and the old outline\'s thesis panel and lists went with its editors', () => {
    expect(css).toContain('/* ── 4.9: the map ──');
    const map = css.slice(css.indexOf('/* ── 4.9: the map ──'));
    ['.map__story', '.map__section', '.map__beat', '.map__photo', '.map__thumb', '.map__concern', '.map__check', '.map__tally', '.map__controls']
      .forEach((rule) => expect(`${rule}: ${map.includes(rule)}`).toBe(`${rule}: true`));
    ['.outline-thesis', '.outline-section__list', '.outline-section--editing'].forEach((gone) => expect(`${gone}: ${css.includes(gone)}`).toBe(`${gone}: false`));
  });
});
