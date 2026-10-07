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

describe("4.9 fix round 1: the map's readers are outline-edit-logic.js's alone", () => {
  it('the view reads whether a value is a map, a beat\'s id and card, where each beat and photo sits and what a map repeats from the edit logic, and keeps no copy', () => {
    const view = read('checkpoint-view-logic.js');
    const mapPart = view.slice(view.indexOf("var MAP_STOP = 'outline';"), view.indexOf('// ── RevisionDiff'));
    ['isMapShape', 'beatIdOf', 'repeatedOf', 'mapBeatIds'].forEach((copy) => {
      expect(`${copy}: ${new RegExp(`function ${copy}\\(`).test(view)}`).toBe(`${copy}: false`);
    });
    ['isMapValue', 'beatIdOf', 'beatCardOf', 'mapBeatPlacements', 'mapPhotoPlacements', 'mapRepeats'].forEach((rule) => {
      expect(`${rule}: ${mapPart.includes(`.${rule}(`)}`).toBe(`${rule}: true`);
    });
    expect(mapPart).not.toMatch(/\.card\b/);
  });

  it('the validator reads the photos where mapPhotoPlacements places them, and each map\'s repeats through mapRepeats', () => {
    const logic = read('outline-edit-logic.js');
    ['photoEntries', 'beatEntries', 'allBeats'].forEach((copy) => {
      expect(`${copy}: ${new RegExp(`function ${copy}\\(`).test(logic)}`).toBe(`${copy}: false`);
    });
    const gate = logic.slice(logic.indexOf('function validateMapShape('), logic.indexOf('function validateOutlineShape('));
    expect(count(gate, 'mapRepeats(')).toBe(2);
    expect(count(gate, 'mapPhotoPlacements(')).toBe(2);
  });

  it("Outline.js opens a beat's editor on the beat the edit logic finds by its id", () => {
    const src = read('components/checkpoints/Outline.js');
    expect(count(src, 'EditLogic.beatWithId(draft, beat.id)')).toBe(1);
    expect(src).not.toMatch(/\.id\.trim\(\)/);
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

// Brief 4.6c: Outline.js finds a section as the editors and moves find it. Phase 4b (brief 1D;
// spec 9): it prints each beat's move and card mark as the view gives them, with the evidence
// folded, and no beat's material, kind, card id or connection id.
describe('4.6c: Outline.js reads the map through the edit logic and names its documents through the view', () => {
  const src = read('components/checkpoints/Outline.js');

  it("opens a section's editor on the section the edit logic finds by its slot, and keeps no finder of its own", () => {
    expect(count(src, 'EditLogic.sectionWithSlot(draft, section.slot)')).toBe(1);
    expect(src).not.toMatch(/function sectionOf\(|\.sections\.filter\(/);
  });

  it("prints each beat's move and its card mark as the view gives them, and its evidence folded under the view's title", () => {
    expect(count(src, 'beat.move')).toBeGreaterThan(0);
    expect(count(src, 'ViewLogic.MAP_CARD_MARK')).toBe(1);
    expect(count(src, 'React.createElement(CollapsibleSection, { title: view.evidenceTitle }')).toBe(1);
    expect(src).not.toMatch(/materialText|cardText|kindLabel|beat\.connection|BEAT_KIND_LABELS/);
  });
});

// Task 4.14b: the beat rows are keyed by the beat's id, which mapView's key carries
// (console/__tests__/checkpoint-view-logic-map.test.js holds the key to the id), so an editor
// open on a beat survives a strike or a move above it.
describe("4.14b: Outline.js keys each beat row by the view's key, the beat's id", () => {
  const src = read('components/checkpoints/Outline.js');

  it('both of a beat row\'s forms, the editor and the row, and each left-out row take the view\'s key', () => {
    const row = src.slice(src.indexOf('function beatRow('), src.indexOf('function photoRow('));
    expect(count(row, "React.createElement('li', { key: beat.key,")).toBe(2);
    expect(count(src, "React.createElement('li', { key: item.key, className: 'map__left-out' }")).toBe(1);
    expect(src).not.toMatch(/key: (beat|item)\.index|'-beat-' \+/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4b, brief 1F: the map's page shows mapView as it is (spec 2026-10-05 sections 4.2, 6.3
// and 9). Outline.js is run here with a React whose createElement builds a tree of its elements
// and whose hooks keep their state between renders, so the tests read what the page renders from
// each of the view model's fields and drive its real handlers: each move as its words, its people
// and "(card)" where it has the marker, its evidence folded in place; each photo's description
// beside its thumbnail; a check still failing under the line it names; no tag; the beat editor,
// the add line, a fold and the beside picker. Invented text: the fixtures are
// lib/__tests__/fixtures/story-level-map.js's.
// ═══════════════════════════════════════════════════════════════════════════

const ViewLogic = require('../../console/checkpoint-view-logic');
const EditLogic = require('../../console/outline-edit-logic');
const { mapCheckpointData } = require('../../lib/map');
const { keptPhotoFilenames } = require('../../lib/workflow/nodes/ai-nodes');
const { storyLevelMap, storyLevelMapState, PHOTO_DESCRIPTIONS } = require('../../lib/__tests__/fixtures/story-level-map');
const { piece } = require('../../lib/__tests__/fixtures/story-level-weave');
// One way to read a rendered tree, the meeting's test's too (fix round 3).
const { elementsOf, textOf, FOLD } = require('../../lib/__tests__/fixtures/component-source');

/** Each exposed document of the story-level record, as server.js buildEvidenceIndex names it. */
const EVIDENCE_INDEX = {
  jes002: { name: 'JES002 - The warning', owner: 'Jess Moreau', type: 'memory', firstLine: '' },
  sam001: { name: 'SAM001 - The journal', owner: 'Sam Okafor', type: 'memory', firstLine: '' },
  'p-email': { name: 'Email to Quinn', owner: 'Marcus Blackwood', type: 'paper', firstLine: '' }
};

/** The stop's payload for a state, as server.js getCheckpointData sends it (less the trace). */
function mapPayloadOf(state = storyLevelMapState()) {
  return { type: 'outline', ...mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline.topPhoto), evidenceIndex: EVIDENCE_INDEX, maxRevisions: 1 }) };
}

/** Every beat's id on a map, in the sections and in left out. */
const beatIdsOf = (map) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut].map((b) => b.id);

/**
 * Outline.js run with a React whose createElement returns `{type, props, children}` and whose
 * useState keeps each value between renders, with the console's own modules for the globals the
 * file reads. A component the page uses from utils (CollapsibleSection, TracePanel) stays a node,
 * uncalled; an editor of the page's own (BeatEditor and the rest) is a node too, which `child`
 * runs with hooks of its own. `render()` renders the page as it is now; `dispatched` holds every
 * action the page sent.
 */
function mountMap(props) {
  const src = read('components/checkpoints/Outline.js');
  let hooks = null;
  const React = {
    Fragment: 'Fragment',
    createElement: (type, p, ...children) => ({ type, props: p || {}, children }),
    useState: (initial) => {
      const store = hooks;
      const n = store.i++;
      if (!(n in store.states)) store.states[n] = typeof initial === 'function' ? initial() : initial;
      return [store.states[n], (value) => { store.states[n] = typeof value === 'function' ? value(store.states[n]) : value; }];
    },
    useEffect: () => {}
  };
  const editBtn = (onClick, held) => ({
    type: 'button', props: { className: 'article-block__edit-btn', onClick, disabled: !!held, 'aria-label': 'Edit', title: held || 'Edit' }, children: ['✎']
  });
  const window = {
    Console: {
      utils: {
        CollapsibleSection: 'CollapsibleSection', TracePanel: 'TracePanel', editBtn,
        CHECKPOINT_LABELS: { 'arc-selection': 'Story meeting', outline: 'Map', article: 'Article' }
      },
      outlineEditLogic: EditLogic,
      checkpointViewLogic: ViewLogic,
      unsavedInputLogic: require('../../console/unsaved-input-logic')
    }
  };
  const Outline = new Function('window', 'React', `${src}\nreturn window.Console.checkpoints.Outline;`)(window, React);
  const dispatched = [];
  const page = { states: [], i: 0 };
  const all = { onApprove: () => {}, onReject: () => {}, onRollback: () => {}, sessionId: '100226', theme: 'journalist', dispatch: (action) => dispatched.push(action), ...props };
  const runWith = (store, fn) => {
    const before = hooks;
    hooks = store;
    store.i = 0;
    try { return fn(); } finally { hooks = before; }
  };
  return {
    dispatched,
    /** The map as the page last saved it to its pending slot. */
    saved: () => dispatched[dispatched.length - 1].edits.map,
    render: () => runWith(page, () => Outline(all)),
    /** An editor node the page rendered, run with hooks of its own: `render()` renders it as it is now. */
    child: (node) => {
      const store = { states: [], i: 0 };
      return { render: () => runWith(store, () => node.type(node.props)) };
    }
  };
}

const mapClassesOf = (node) => String(node.props.className || '').split(/\s+/).filter(Boolean);
const hasClass = (name) => (node) => mapClassesOf(node).includes(name);

/** The text a fold holds once opened, each of its items and lines apart. */
const heldText = (fold) => elementsOf(fold.children, (n) => n.type === 'li' || n.type === 'p').map(textOf).join(' | ');

/** The folds inside a node, outside any fold. */
const foldsWithin = (node) => elementsOf(node.children, (n, folded) => n.type === FOLD && !folded);

/** Each string the page prints or reads out: every text, a field's value, a fold's title, and each aria-label, title, placeholder and alt. */
function stringsOf(tree) {
  const strings = [];
  elementsOf(tree, (node) => {
    ['aria-label', 'title', 'placeholder', 'label', 'alt'].forEach((prop) => { if (typeof node.props[prop] === 'string') strings.push(node.props[prop]); });
    if ((node.type === 'textarea' || node.type === 'input') && typeof node.props.value === 'string') strings.push(node.props.value);
    node.children.forEach((child) => { if (typeof child === 'string') strings.push(child); });
    return false;
  });
  return strings;
}

/** The view's beats in the sections, in order. */
const viewBeats = (view) => view.sections.flatMap((s) => s.beats);

/** The row of a beat in a section, found by the move it shows. */
const beatRowOf = (tree, move) => elementsOf(tree, (n) => hasClass('map__beat')(n) && textOf(n).includes(move))[0];

/** The lines the page shows for what holds its controls, in document order. */
const heldLines = (tree) => elementsOf(tree, hasClass('held-line')).map(textOf);

// Piece 4 (brief 4B; spec 2026-10-07 section 7): an edit of the director's a rework changed that
// is about a move sits on that move's card in the view, so Outline.js shows it in the move's row,
// where it no longer shows among the round's lines.
describe("4B: an edit a rework changed shows on its move's row", () => {
  it("renders the card's changed line in the move's row", () => {
    const report = { checked: ['E1'], changed: [{ id: 'E1', scope: 'outline', where: 'section \"theStory\", beat \"b5\", move', cut: false, removed: false, moved: false, director: 'Jess pulls Sarah aside', became: 'Jess warns Sarah', pass: 'send-back', automatic: false, reason: 'The note asked for the warning.', restored: false }] };
    const data = mapPayloadOf(storyLevelMapState({ _outlineHandEditReport: report, humanOutlineRevisionCount: 1 }));
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    const [line] = viewBeats(view).find((b) => b.id === 'b5').changed;
    expect(line).toContain('Jess pulls Sarah aside');
    const row = beatRowOf(mountMap({ data }).render(), 'Jess warns Sarah');
    expect(elementsOf(row, hasClass('map__changed')).map(textOf)).toEqual([line]);
  });
});

// Run 1 follow-up F8 (spec 2026-10-07 section 7): an edit about a section shows under its head, one
// about the headline, the deck or the top photo at the top of the article, and only one with no
// place among the round's lines.
describe("4B follow-up F8: an edit a rework changed shows under its section's head or at the top of the article", () => {
  const entry = (id, where, director, reason) => ({ id, scope: 'outline', where, cut: false, removed: false, moved: false, director, became: 'Something else', pass: 'send-back', automatic: false, reason, restored: false });
  const report = {
    checked: ['E1', 'E2', 'E3'],
    changed: [
      entry('E1', 'section "theStory", job', 'The case, slowly.', 'The note asked for the turn.'),
      entry('E2', 'deck', 'The room called it an accident.', 'The note asked for the count.'),
      entry('E3', 'section "thePlayers", added', 'The successors', 'The note folded it into the closing.')
    ]
  };
  const data = mapPayloadOf(storyLevelMapState({ _outlineHandEditReport: report, humanOutlineRevisionCount: 1 }));
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  const tree = mountMap({ data }).render();
  const changedIn = (node) => elementsOf(node, hasClass('map__changed')).map(textOf);

  it("renders the section's line in its head, the deck's at the top, and the one with no place among the round's lines", () => {
    const [sectionLine] = view.sections.find((s) => s.slot === 'theStory').changed;
    const [deckLine] = view.top.changed;
    const [roundLine] = view.changedEdits;
    expect([sectionLine, deckLine, roundLine].every(Boolean)).toBe(true);
    const head = elementsOf(tree, (n) => hasClass('map__section-head')(n) && textOf(n).includes("The room's case for an accident"))[0];
    expect(changedIn(head)).toEqual([sectionLine]);
    const top = elementsOf(tree, hasClass('map__top'))[0];
    expect(changedIn(top)).toEqual([deckLine]);
    expect(changedIn(tree)).toEqual([roundLine, deckLine, sectionLine]);
  });
});

describe("1F: each move shows its words, its people and \"(card)\" where it has the marker, with what's behind it folded in place", () => {
  const data = mapPayloadOf();
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  const tree = mountMap({ data }).render();
  const rows = elementsOf(tree, hasClass('map__beat'));

  it("renders each beat of the sections, in the view's order, as its move's words, then the card mark where the view sets `card`, then its people", () => {
    expect(rows).toHaveLength(viewBeats(view).length);
    rows.forEach((row, i) => {
      const beat = viewBeats(view)[i];
      const [words] = elementsOf(row, hasClass('map__move-words'));
      expect(textOf(words)).toBe(beat.card ? `${beat.move} ${ViewLogic.MAP_CARD_MARK}` : beat.move);
      expect(elementsOf(words, hasClass('map__card-mark')).map(textOf)).toEqual(beat.card ? [ViewLogic.MAP_CARD_MARK] : []);
      expect(textOf(row)).toContain(`Shows: ${beat.players}`);
    });
    expect(viewBeats(view).filter((b) => b.card).map((b) => b.move)).toEqual([
      'Marcus trying the batch on himself', 'Marcus asks Quinn for a higher dose', 'Jess warns Sarah'
    ]);
  });

  it('folds each move\'s evidence under "What\'s behind it", each piece as the view words it, in a group the view names by the move', () => {
    rows.forEach((row, i) => {
      const beat = viewBeats(view)[i];
      const folds = foldsWithin(row);
      expect(folds.map((f) => f.props.title)).toEqual([view.evidenceTitle]);
      const [group] = elementsOf(row, hasClass('map__fold'));
      expect(group.props.role).toBe('group');
      expect(group.props['aria-label']).toBe(beat.labels.fold);
      expect(beat.labels.fold).toBe(`What's behind it: ${beat.move}`);
      expect(elementsOf(group, (n) => n === folds[0])).toHaveLength(1);
      expect(elementsOf(folds[0], hasClass('map__piece')).map(textOf)).toEqual(beat.evidence.map((p) => p.text));
      beat.evidence.forEach((p) => expect(textOf(row)).not.toContain(p.shows));
    });
    expect(heldText(foldsWithin(beatRowOf(tree, 'Marcus asks Quinn for a higher dose'))[0]))
      .toBe('Email to Quinn (Marcus Blackwood): Marcus asks Quinn to "raise the dose for the pilot"');
  });

  it('marks a piece that cuts against its move', () => {
    const state = storyLevelMapState();
    state.outline.sections[3].beats[0].evidence.push(piece(['notes'], 'The room never said so.', 'cuts-against'));
    const page = mountMap({ data: mapPayloadOf(state) }).render();
    const against = elementsOf(beatRowOf(page, 'The successors wait on the case'), hasClass('map__cuts-against'));
    expect(against.map(textOf)).toEqual(['Cuts against · Your notes: The room never said so.']);
    expect(against.every(hasClass('map__piece'))).toBe(true);
  });

  it('a move the director added folds the line that the article writer finds its evidence, and nothing of it shows until opened', () => {
    const draft = EditLogic.addBeat(ViewLogic.mapDraftOf(data, undefined), 'closing', 'Remi walks out before the vote', 'Remi');
    const page = mountMap({ data, pendingEdits: ViewLogic.mapPendingSlot(data, draft) }).render();
    const row = beatRowOf(page, 'Remi walks out before the vote');
    const [fold] = foldsWithin(row);
    expect(elementsOf(fold, hasClass('map__no-evidence')).map(textOf)).toEqual([ViewLogic.MAP_NO_EVIDENCE_LINE]);
    expect(textOf(row)).not.toContain(ViewLogic.MAP_NO_EVIDENCE_LINE);
  });
});

describe("1F: each photo shows the director's description beside its thumbnail, and the beside picker names moves by their words", () => {
  const data = mapPayloadOf();
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  const pickerOf = (tree, photo) => elementsOf(tree, (n) => n.type === 'select' && n.props['aria-label'] === photo.labels.beside)[0];

  it("shows each photo's description in the row of its thumbnail, and a photo with none by its filename", () => {
    const state = storyLevelMapState({ photoDescriptions: { 'top.jpg': PHOTO_DESCRIPTIONS['top.jpg'], 'board.jpg': PHOTO_DESCRIPTIONS['board.jpg'] } });
    const tree = mountMap({ data: mapPayloadOf(state) }).render();
    const rows = elementsOf(tree, hasClass('map__photo'));
    expect(rows.map((row) => [
      elementsOf(row, (n) => n.type === 'img')[0].props.src.split('/').pop(),
      elementsOf(row, hasClass('map__photo-description')).map(textOf),
      elementsOf(row, hasClass('map__filename')).map(textOf)
    ])).toEqual([
      ['top.jpg', [PHOTO_DESCRIPTIONS['top.jpg']], []],
      ['board.jpg', [PHOTO_DESCRIPTIONS['board.jpg']], []],
      ['bar.jpg', [], ['bar.jpg']]
    ]);
  });

  it('offers, beside each photo of a section, the choices the view gives, each naming a move by its words', () => {
    const photo = view.sections[1].photos[0];
    const picker = pickerOf(mountMap({ data }).render(), photo);
    expect(elementsOf(picker, (n) => n.type === 'option').map(textOf)).toEqual(photo.besideOptions.map((o) => o.label));
    expect(textOf(picker)).toBe('Beside: Marcus trying the batch on himself');
  });

  it("a choice in the picker sets the photo beside that move on the director's map", () => {
    const mounted = mountMap({ data });
    const photo = view.sections[1].photos[0];
    pickerOf(mounted.render(), photo).props.onChange({ target: { value: 'b5' } });
    expect(mounted.dispatched[mounted.dispatched.length - 1]).toMatchObject({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline' });
    expect(mounted.saved().sections[1].photos).toEqual([{ filename: 'board.jpg', beat: 'b5' }, { filename: 'bar.jpg' }]);
    expect(textOf(pickerOf(mounted.render(), photo))).toBe('Beside: Jess warns Sarah');
  });
});

describe('1F: a check still failing shows under the line it names (spec 6.3)', () => {
  const map = storyLevelMap();
  map.sections[2].beats[0].evidence = [piece(['zzz999'], 'A document no record holds.')];
  const failures = [
    { type: 'evidence-not-in-record', message: 'Beat b6: piece 1 names "zzz999".', line: 'The evidence behind the move cites a document the record does not hold.', place: 'sections[#followTheMoney].beats[#b6]' },
    { type: 'story-terms', message: 'The job of lede holds a time.', line: 'This job gives the time 9:58.', place: 'sections[#lede]' },
    { type: 'photo-placed-twice', message: 'board.jpg twice.', line: 'This photo is placed twice.', place: 'sections[#theStory].photos[#board.jpg]' },
    { type: 'story-terms', message: 'The gap note holds a time.', line: 'The gap note gives the time 9:58.', place: 'gapNote' },
    { type: 'player-not-placed', message: 'Players in no beat: Remi.', line: 'Remi is in no move and not in the gap note.' }
  ];
  const data = { ...mapPayloadOf(storyLevelMapState({ outline: map })), checkFailures: failures };
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  const tree = mountMap({ data }).render();
  const checksIn = (node) => elementsOf(node, hasClass('map__check')).map(textOf);
  const [round] = elementsOf(tree, hasClass('map__round'));

  it("shows each failure the view sets beside a line under that line, in the director's words, styled as beside its line", () => {
    expect(checksIn(beatRowOf(tree, 'The memories sold off'))).toEqual(viewBeats(view).find((b) => b.id === 'b6').failures);
    const [lede] = elementsOf(tree, (n) => hasClass('map__section-head')(n) && textOf(n).includes('Opens on the vote'));
    expect(checksIn(lede)).toEqual(view.sections[0].failures);
    const [board] = elementsOf(tree, (n) => hasClass('map__photo')(n) && textOf(n).includes(PHOTO_DESCRIPTIONS['board.jpg']));
    expect(checksIn(board)).toEqual(view.sections[1].photos[0].failures);
    expect(view.sections[1].photos[0].failures).toEqual(['Check still failing: This photo is placed twice.']);
    const [gap] = elementsOf(tree, hasClass('map__gap'));
    expect(checksIn(gap)).toEqual(view.gapNote.failures);
    const atTop = new Set(elementsOf(round, hasClass('map__check')));
    const beside = elementsOf(tree, (n) => hasClass('map__check')(n) && !atTop.has(n));
    expect(beside).toHaveLength(4);
    beside.forEach((check) => {
      expect(mapClassesOf(check)).toContain('map__check--beside');
      expect(check.props.role).toBe('alert');
    });
  });

  it("keeps a failure with no place at the top, in the round's lines", () => {
    expect(checksIn(round)).toEqual(view.checkFailures);
    expect(view.checkFailures).toEqual(['Check still failing: Remi is in no move and not in the gap note.']);
    elementsOf(round, hasClass('map__check')).forEach((check) => expect(mapClassesOf(check)).not.toContain('map__check--beside'));
  });
});

describe('1F: no tag on the page, and every aria-label names a move by its words', () => {
  const data = mapPayloadOf();
  const draft = EditLogic.addBeat(ViewLogic.mapDraftOf(data, undefined), 'closing', 'Remi walks out before the vote', 'Remi');
  const pending = ViewLogic.mapPendingSlot(data, draft);
  const view = ViewLogic.mapView(data, draft);
  const TAG = new RegExp(`\\b(?:${[...beatIdsOf(draft), 't1', 't2', 't3', 't4', 't5', 't6', 't7', 'c1', 'c2', 'c3', 'c4'].join('|')})\\b`);

  it("prints and reads out no beat's, thread's or connection's id, with a move's editor and the add line open", () => {
    const mounted = mountMap({ data, pendingEdits: pending });
    expect(stringsOf(mounted.render()).filter((s) => TAG.test(s))).toEqual([]);
    // Open the editor on a move, and an add line holding a move, as the director would.
    elementsOf(beatRowOf(mounted.render(), 'Marcus asks Quinn for a higher dose'), hasClass('article-block__edit-btn'))[0].props.onClick();
    elementsOf(mounted.render(), (n) => n.type === 'button' && textOf(n) === '+ Add a beat')[0].props.onClick();
    elementsOf(mounted.render(), hasClass('map__add-move'))[0].props.onChange({ target: { value: 'Kai counts the votes' } });
    const open = mounted.render();
    const strings = stringsOf(open);
    expect(strings.length).toBeGreaterThan(40);
    expect(strings.filter((s) => TAG.test(s))).toEqual([]);
    // The lines under the add line and the open editor, and beside the held buttons, name the move by its words.
    expect(heldLines(open)).toEqual([
      'Before you add a beat in another section, add or cancel the new beat in "Lede".',
      'Before you edit another line, save or cancel your edit to the move "Marcus asks Quinn for a higher dose".',
      'Before you approve or send back: save or cancel your edit to the move "Marcus asks Quinn for a higher dose"; add or cancel the new beat in "Lede".'
    ]);
  });

  it("names each move's controls and its fold by the move's words, as the view gives them", () => {
    const tree = mountMap({ data, pendingEdits: pending }).render();
    const inSections = viewBeats(view);
    const all = [...inSections, ...view.leftOut.items];
    all.forEach((beat) => expect(beat.labels).toEqual({
      fold: `What's behind it: ${beat.move}`,
      moveTo: `Move "${beat.move}" to another section`,
      strike: `Strike "${beat.move}" into left out`,
      takeOut: `Take out the move you added: ${beat.move}`,
      bringBack: `Bring "${beat.move}" back into a section`,
      // Piece 4 (brief 4B): the card's own controls, for 4D's board, each by the move's title.
      select: `Select the move "${beat.move}"`,
      showSummary: `Show the summary of "${beat.move}"`,
      hideSummary: `Hide the summary of "${beat.move}"`,
      moveUp: `Move "${beat.move}" up`,
      moveDown: `Move "${beat.move}" down`,
      photoBeside: `Put a photo beside "${beat.move}"`
    }));
    const ariaLabels = elementsOf(tree, (n) => typeof n.props['aria-label'] === 'string').map((n) => n.props['aria-label']);
    const used = (beat) => [
      ...(beat.evidence.length > 0 || beat.noEvidence ? [beat.labels.fold] : []),
      ...(inSections.includes(beat) ? [beat.labels.moveTo, beat.added ? beat.labels.takeOut : beat.labels.strike] : [beat.labels.bringBack])
    ];
    const expected = all.flatMap(used);
    expect(ariaLabels.filter((label) => all.some((beat) => Object.values(beat.labels).includes(label)))).toEqual(
      expect.arrayContaining(expected)
    );
    expect(ariaLabels.filter((label) => all.some((beat) => Object.values(beat.labels).includes(label)))).toHaveLength(expected.length);
    expect(ariaLabels).toContain('Take out the move you added: Remi walks out before the vote');
  });

  // Fix round 3: a move with no words is named "a move" (moveLabelsOf's fallback), never by its
  // id, and its fold's title comes from the one builder the meeting's folds use.
  it('names a move with no words "a move" in each of its labels, never by its id', () => {
    const blank = JSON.parse(JSON.stringify(ViewLogic.mapDraftOf(data, undefined)));
    const [first] = blank.sections.find((s) => s.beats.length > 0).beats;
    first.move = '   ';
    const blankBeat = viewBeats(ViewLogic.mapView(data, blank)).find((b) => b.id === first.id);
    expect(blankBeat.move.trim()).toBe('');
    expect(blankBeat.labels).toEqual({
      fold: "What's behind it: a move",
      moveTo: 'Move a move to another section',
      strike: 'Strike a move into left out',
      takeOut: 'Take out the move you added: a move',
      bringBack: 'Bring a move back into a section',
      select: 'Select a move',
      showSummary: 'Show the summary of a move',
      hideSummary: 'Hide the summary of a move',
      moveUp: 'Move a move up',
      moveDown: 'Move a move down',
      photoBeside: 'Put a photo beside a move'
    });
    expect(blankBeat.labels.fold).toBe(ViewLogic.evidenceFoldLabel('a move'));
    expect(Object.values(blankBeat.labels).filter((label) => label.includes(blankBeat.id))).toEqual([]);
  });

  it("names each photo's controls by the director's description, as the view gives them", () => {
    const tree = mountMap({ data, pendingEdits: pending }).render();
    const [board, bar] = view.sections[1].photos;
    expect(board.labels).toEqual({
      beside: `Where "${PHOTO_DESCRIPTIONS['board.jpg']}" sits in its section`,
      moveTo: `Move "${PHOTO_DESCRIPTIONS['board.jpg']}" to the top or to another section`
    });
    expect(bar.labels.moveTo).toBe(`Move "${PHOTO_DESCRIPTIONS['bar.jpg']}" to the top or to another section`);
    expect(view.topPhoto.labels).toEqual({ moveTo: `Move the top photo "${PHOTO_DESCRIPTIONS['top.jpg']}" into a section` });
    [board.labels.beside, board.labels.moveTo, bar.labels.beside, bar.labels.moveTo, view.topPhoto.labels.moveTo]
      .forEach((label) => expect(elementsOf(tree, (n) => n.props['aria-label'] === label)).toHaveLength(1));
    const bare = ViewLogic.mapView({ ...data, photoDescriptions: {} }, draft);
    expect(bare.sections[1].photos[1].labels).toEqual({ beside: 'Where bar.jpg sits in its section', moveTo: 'Move bar.jpg to the top or to another section' });
    expect(bare.topPhoto.labels).toEqual({ moveTo: 'Move the top photo top.jpg into a section' });
  });
});

describe("1F: the beat editor edits a move's words and its people, through initBeat and buildBeat", () => {
  it("opens on the beat's move and people, and saves what the director typed into that beat, keeping the rest of it", () => {
    const mounted = mountMap({ data: mapPayloadOf() });
    elementsOf(beatRowOf(mounted.render(), 'Marcus asks Quinn for a higher dose'), hasClass('article-block__edit-btn'))[0].props.onClick();
    const [host] = elementsOf(mounted.render(), (n) => hasClass('map__beat')(n) && hasClass('map__editing')(n));
    const [editorNode] = host.children.filter((c) => c && typeof c.type === 'function');
    expect(editorNode.type.name).toBe('BeatEditor');
    const editor = mounted.child(editorNode);
    const fields = () => elementsOf(editor.render(), (n) => typeof n.type === 'function' && n.type.name === 'TextField');
    expect(fields().map((f) => [f.props.label, f.props.value])).toEqual([
      ['The move', 'Marcus asks Quinn for a higher dose'],
      ['Players it shows', 'Quinn']
    ]);
    fields()[0].props.onChange('Marcus wants a stronger dose');
    fields()[1].props.onChange('Quinn, Sam');
    elementsOf(editor.render(), (n) => n.type === 'button' && textOf(n) === 'Save')[0].props.onClick();
    expect(mounted.saved().sections[1].beats[1]).toEqual({ ...storyLevelMap().sections[1].beats[1], move: 'Marcus wants a stronger dose', players: ['Quinn', 'Sam'] });
    // The editor closes, and the row shows the move the director wrote.
    const after = mounted.render();
    expect(elementsOf(after, hasClass('map__editing'))).toHaveLength(0);
    expect(textOf(elementsOf(beatRowOf(after, 'Marcus wants a stronger dose'), hasClass('map__move-words'))[0])).toBe('Marcus wants a stronger dose Card');
  });
});

describe("1F: the add line takes a move's words and its people, under `adding.move`", () => {
  const src = read('components/checkpoints/Outline.js');

  it('names its words `move` in its state, as console/unsaved-input-logic.js reads it', () => {
    expect(src).toContain("setAdding({ slot: slot, move: '', players: '' })");
    expect(src).toContain('EditLogic.addBeat(draft, adding.slot, adding.move, adding.players)');
    expect(src).not.toMatch(/material/);
  });

  it('opens in its section, holds the buttons while it holds a move, and adds `{id, move, players}` through addBeat', () => {
    const mounted = mountMap({ data: mapPayloadOf() });
    const [closing] = elementsOf(mounted.render(), (n) => n.type === 'section' && n.props['aria-label'] === 'Closing');
    elementsOf(closing, (n) => n.type === 'button' && textOf(n) === '+ Add a beat')[0].props.onClick();
    const line = () => elementsOf(mounted.render(), hasClass('map__add'))[0];
    const addButton = () => elementsOf(line(), (n) => n.type === 'button' && textOf(n) === 'Add the beat')[0];
    const approve = () => elementsOf(mounted.render(), (n) => n.type === 'button' && textOf(n) === ViewLogic.mapButtons('', false).approve.label)[0];
    expect([elementsOf(line(), hasClass('map__add-move'))[0].props['aria-label'], elementsOf(line(), hasClass('map__add-players'))[0].props['aria-label']])
      .toEqual(['The move to add', 'The players the beat shows']);
    expect(addButton().props.disabled).toBe(true);
    expect(approve().props.disabled).toBe(false);
    elementsOf(line(), hasClass('map__add-move'))[0].props.onChange({ target: { value: 'Remi walks out before the vote' } });
    elementsOf(line(), hasClass('map__add-players'))[0].props.onChange({ target: { value: 'Remi, Kai' } });
    expect(textOf(elementsOf(line(), hasClass('map__add-move'))[0])).toBe('Remi walks out before the vote');
    expect(addButton().props.disabled).toBe(false);
    expect(approve().props.disabled).toBe(true);
    expect(heldLines(mounted.render())).toEqual([
      'Before you add a beat in another section, add or cancel the new beat in "Closing".',
      'Before you approve or send back, add or cancel the new beat in "Closing".'
    ]);
    addButton().props.onClick();
    expect(mounted.saved().sections[3].beats[1]).toEqual({ id: 'b10', move: 'Remi walks out before the vote', players: ['Remi', 'Kai'] });
    expect(elementsOf(mounted.render(), hasClass('map__add'))).toHaveLength(0);
    expect(approve().props.disabled).toBe(false);
  });
});

describe("1F: the map's styles", () => {
  const css = read('console.css');
  const map = css.slice(css.indexOf('/* ── 4.9: the map ──'), css.indexOf("/* ── 4.10: the desk's marks ──"));
  const ruled = (rule) => new RegExp(`${rule.replace(/[.-]/g, '\\$&')}[\\s,{:]`).test(map);

  it("styles the move's words, the card mark, a check beside its line, the photo's description and the add line's move", () => {
    ['.map__move-words', '.map__card-mark', '.map__check--beside', '.map__photo-description', '.map__add-move']
      .forEach((rule) => expect(`${rule}: ${ruled(rule)}`).toBe(`${rule}: true`));
  });

  // Fix round 3: the map's fold copied the meeting's declaration for declaration. Each of its
  // rules now names both pages' classes, once, under the meeting's section.
  it("styles the fold, its pieces and a piece that cuts against its move in the meeting's rules, each grouped with its twin", () => {
    const twins = [
      ['.meeting__fold .collapsible-section', '.map__fold .collapsible-section'],
      ['.meeting__fold .collapsible-header', '.map__fold .collapsible-header'],
      ['.meeting__fold .collapsible-header:hover', '.map__fold .collapsible-header:hover'],
      ['.meeting__fold .collapsible-body', '.map__fold .collapsible-body'],
      ['.meeting__pieces', '.map__pieces'],
      ['.meeting__piece', '.map__piece'],
      ['.meeting__piece.meeting__cuts-against', '.map__piece.map__cuts-against'],
      ['.meeting__no-evidence', '.map__no-evidence']
    ];
    twins.forEach(([meeting, ofMap]) => {
      const grouped = `${meeting},\n${ofMap} {`;
      expect(`${grouped}: ${css.split(grouped).length - 1}`).toBe(`${grouped}: 1`);
    });
    ['.map__fold', '.map__pieces', '.map__piece', '.map__cuts-against', '.map__no-evidence']
      .forEach((rule) => expect(`${rule}: ${ruled(rule)}`).toBe(`${rule}: false`));
  });

  it('keeps no style for an id, a kind, the material or the header that held them', () => {
    ['.map__id', '.map__kind', '.map__material', '.map__add-material', '.map__beat-head'].forEach((gone) => expect(`${gone}: ${css.includes(gone)}`).toBe(`${gone}: false`));
  });
});
