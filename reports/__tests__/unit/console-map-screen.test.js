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
/** A function's body in a source, from its declaration to the brace that closes it at its own indent. */
const functionBody = (src, name) => {
  const start = src.indexOf(`\n  function ${name}(`);
  return start === -1 ? '' : src.slice(start, src.indexOf('\n  }\n', start));
};

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

  // Piece 4 (R10): each move has one call site, its handler, which its button and its drop both call.
  it('changes the map only through the edit logic\'s moves, each from one handler', () => {
    [['moveBeat(', 'moveCard'], ['moveBeatBy(', 'moveCardBy'], ['strikeBeat(', 'leaveOut'], ['bringBackBeat(', 'bringBack'], ['addBeat(', 'addTheBeat'],
      ['removeBeat(', 'takeOut'], ['movePhoto(', 'movePhotoTo'], ['setPhotoBeside(', 'photoBeside'], ['placePhotoBeside(', 'placePhoto']].forEach(([op, handler]) => {
      expect(`${op} ${count(src, `EditLogic.${op}`)}`).toBe(`${op} 1`);
      const at = src.indexOf(`EditLogic.${op}`);
      const declared = src.lastIndexOf('\n  function ', at);
      expect(`${op} ${src.slice(declared + 12, src.indexOf('(', declared + 12))}`).toBe(`${op} ${handler}`);
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
    ['.map__story', '.map__column', '.map__card', '.map__photo', '.map__thumb', '.map__concern', '.map__check', '.map__tally', '.map__controls']
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

  // Piece 4 (brief 4D; spec 5, R8): a card prints its title and the view's card mark, and what's
  // behind it shows on the selected card under the view's title, unfolded.
  it("prints each move's title and its card mark as the view gives them, and what's behind it under the view's title", () => {
    expect(count(src, 'beat.label')).toBeGreaterThan(0);
    expect(count(src, 'beat.cardMark')).toBe(2);
    expect(src).not.toContain('ViewLogic.MAP_CARD_MARK');
    expect(count(src, 'view.evidenceTitle')).toBe(1);
    expect(src).not.toContain('CollapsibleSection, { title: view.evidenceTitle');
    expect(src).not.toMatch(/materialText|cardText|kindLabel|beat\.connection|BEAT_KIND_LABELS/);
  });
});

// Task 4.14b: the beat rows are keyed by the beat's id, which mapView's key carries
// (console/__tests__/checkpoint-view-logic-map.test.js holds the key to the id), so an editor
// open on a beat survives a strike or a move above it.
describe("4.14b: Outline.js keys each card by the view's key, the beat's id", () => {
  const src = read('components/checkpoints/Outline.js');

  // Piece 4 (brief 4D): a card holds its editor in place, so one element, keyed by the view's key,
  // carries both, and the tray's cards take theirs the same way.
  it("each card in a column, its editor among it, and each card in the tray take the view's key", () => {
    expect(count(functionBody(src, 'card'), 'key: beat.key,')).toBe(1);
    expect(count(functionBody(src, 'trayItem'), 'key: item.key,')).toBe(1);
    expect(src).not.toMatch(/key: (beat|item)\.index|'-beat-' \+/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Piece 4, brief 4D: the board (spec 2026-10-07 sections 4 to 7). Outline.js is run here with a
// React whose createElement builds a tree of its elements and whose hooks keep their state between
// renders, so the tests read what the page renders from each of the view model's fields and drive
// its real handlers: the parts in the view's order, the columns and their cards, selecting a card,
// a move in the tray and a photo, the summaries, a thread picked, and each control reaching its
// EditLogic op once. Invented text: the fixtures are lib/__tests__/fixtures/story-level-map.js's
// and board-map.js's.
// ═══════════════════════════════════════════════════════════════════════════

const ViewLogic = require('../../console/checkpoint-view-logic');
const EditLogic = require('../../console/outline-edit-logic');
const { mapCheckpointData } = require('../../lib/map');
const { keptPhotoFilenames } = require('../../lib/workflow/nodes/ai-nodes');
const { storyLevelMap, storyLevelMapState, PHOTO_DESCRIPTIONS } = require('../../lib/__tests__/fixtures/story-level-map');
const { boardMap, boardMapState, BOARD_PHOTOS } = require('../../lib/__tests__/fixtures/board-map');
const { piece } = require('../../lib/__tests__/fixtures/story-level-weave');
// One way to read a rendered tree, the meeting's test's too (fix round 3).
const { elementsOf, textOf } = require('../../lib/__tests__/fixtures/component-source');

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

/** The board's payload: the mock-up's shape, five sections, sixteen moves and ten photos. */
const boardPayloadOf = (state = boardMapState()) => mapPayloadOf(state);

/** Every beat's id on a map, in the sections and in left out. */
const beatIdsOf = (map) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut].map((b) => b.id);

/** Each EditLogic op a control can reach, as a spy that calls the real op. */
const MOVE_OPS = ['moveBeat', 'moveBeatBy', 'strikeBeat', 'bringBackBeat', 'addBeat', 'removeBeat', 'movePhoto', 'setPhotoBeside', 'placePhotoBeside'];

/**
 * Outline.js run with a React whose createElement returns `{type, props, children}` and whose
 * useState keeps each value between renders, with the console's own modules for the globals the
 * file reads. A component the page uses from utils (CollapsibleSection, TracePanel) stays a node,
 * uncalled; an editor of the page's own (BeatEditor and the rest) is a node too, which `child`
 * runs with hooks of its own. `render()` renders the page as it is now; `dispatched` holds every
 * action the page sent; `ops` holds a spy for each of the moves' EditLogic ops. `options.mapView`,
 * when given, stands in for the view logic's mapView, for a view field set by hand.
 */
function mountMap(props, options = {}) {
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
  const ops = {};
  const editLogic = { ...EditLogic };
  MOVE_OPS.forEach((op) => { ops[op] = jest.fn(EditLogic[op]); editLogic[op] = ops[op]; });
  const window = {
    Console: {
      utils: {
        CollapsibleSection: 'CollapsibleSection', TracePanel: 'TracePanel', editBtn,
        CHECKPOINT_LABELS: { 'arc-selection': 'Story meeting', outline: 'Map', article: 'Article' }
      },
      outlineEditLogic: editLogic,
      checkpointViewLogic: options.mapView ? { ...ViewLogic, mapView: options.mapView } : ViewLogic,
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
    ops,
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

/** The view's cards in the columns, in order. */
const viewBeats = (view) => view.sections.flatMap((s) => s.beats);

/** The cards in the columns, in document order. */
const columnCards = (tree) => elementsOf(tree, (n) => hasClass('map__card')(n) && !hasClass('map__card--tray')(n));

/** A card, in a column or in the tray, found by its title. */
const cardOf = (tree, title) => elementsOf(tree, (n) => hasClass('map__card')(n) && textOf(elementsOf(n, hasClass('map__card-title'))[0]) === title)[0];

/** A click on a card or a photo itself, as the browser gives it: the target is the element clicked. */
const click = (node) => node.props.onClick({ target: node, currentTarget: node });

/** The button inside a node whose text is `text`. */
const buttonOf = (node, text) => elementsOf(node, (n) => n.type === 'button' && textOf(n) === text)[0];

/** The control inside a node whose aria-label is `label`. */
const labelled = (node, label) => elementsOf(node, (n) => n.props['aria-label'] === label)[0];

/** The lines the page shows for what holds its controls, in document order. */
const heldLines = (tree) => elementsOf(tree, hasClass('held-line')).map(textOf);

/** The part of the page each of mapView's `order` names, by the class of the element Outline.js renders it in. */
const PART_CLASSES = {
  round: 'map__round', tally: 'map__tally', settledStory: 'map__story-row', legend: 'map__legend', top: 'map__top',
  sections: 'map__board', leftOut: 'map__tray', dropped: 'map__dropped', weaveChanges: 'map__changes'
};

describe("4D: the board renders mapView's parts in its order, with no id anywhere", () => {
  it("renders each part the view's order names, in that order, before the note box", () => {
    const state = boardMapState({ humanOutlineRevisionCount: 1, previousFeedback: 'Move the vote earlier.' });
    state.outline.weaveChanges = [{ source: 'note', change: 'The successors get their own section.' }];
    const data = boardPayloadOf(state);
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    expect(view.order).toEqual(['round', 'tally', 'settledStory', 'legend', 'top', 'sections', 'leftOut', 'dropped', 'weaveChanges']);
    const tree = mountMap({ data }).render();
    const [parts] = tree.children;
    expect(parts.map((part) => Object.keys(PART_CLASSES).find((name) => hasClass(PART_CLASSES[name])(part)))).toEqual(view.order);
    expect(parts.map((part) => part.props.key)).toEqual(view.order);
  });

  it('leaves out a part the view leaves out of its order', () => {
    const data = boardPayloadOf();
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    expect(view.order).not.toContain('round');
    const [parts] = mountMap({ data }).render().children;
    expect(parts.map((part) => part.props.key)).toEqual(view.order);
    expect(elementsOf(parts, hasClass('map__round'))).toHaveLength(0);
  });

  it("prints and reads out no move's, thread's or connection's id, with a card selected, every summary open, a thread picked, a photo selected and an editor open", () => {
    const data = boardPayloadOf();
    const TAG = new RegExp(`\\b(?:${[...beatIdsOf(boardMap()), ...Array.from({ length: 10 }, (_, i) => `t${i + 1}`), 'c1', 'c2', 'c3', 'c4'].join('|')})\\b`);
    const mounted = mountMap({ data });
    expect(stringsOf(mounted.render()).filter((s) => TAG.test(s))).toEqual([]);
    click(cardOf(mounted.render(), 'Marcus asks Quinn to raise the dose'));
    buttonOf(mounted.render(), ViewLogic.MAP_SUMMARY_TOGGLE.open).props.onClick();
    elementsOf(mounted.render(), hasClass('map__thread'))[2].props.onClick();
    click(cardOf(mounted.render(), 'The other suspects let go'));
    const opened = mounted.render();
    expect(elementsOf(opened, hasClass('map__card-detail'))).toHaveLength(1);
    const strings = stringsOf(opened);
    expect(strings.length).toBeGreaterThan(100);
    expect(strings.filter((s) => TAG.test(s))).toEqual([]);
    elementsOf(mounted.render(), hasClass('map__thumb-button'))[0].props.onClick();
    click(cardOf(mounted.render(), 'Jess warns Sarah away'));
    buttonOf(mounted.render(), 'Edit the words').props.onClick();
    expect(stringsOf(mounted.render()).filter((s) => TAG.test(s))).toEqual([]);
  });
});

describe("4D: the top of the page: the counts, the settled story with the gap note, the threads and the top of the article", () => {
  const data = boardPayloadOf();
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  const tree = mountMap({ data }).render();

  it('the counts, each as the view words it, with the expected length under its pencil', () => {
    const [tally] = elementsOf(tree, hasClass('map__tally'));
    expect(tally.props['aria-label']).toBe('The counts');
    expect(elementsOf(tally, (n) => n.type === 'p').map(textOf)).toEqual([view.tally.placed, view.tally.cards, view.tally.photos, view.tally.length]);
    expect(elementsOf(tally, hasClass('map__length'))).toHaveLength(1);
  });

  it("the legend: each thread by its dot and its name, picked by its label, with no line shown until one is picked", () => {
    const [legend] = elementsOf(tree, hasClass('map__legend'));
    expect(legend.props['aria-label']).toBe(view.legend.title);
    const threads = elementsOf(legend, hasClass('map__thread'));
    expect(threads.map(textOf)).toEqual(view.legend.threads.map((t) => t.label));
    expect(threads.map((t) => t.props['aria-label'])).toEqual(view.legend.threads.map((t) => t.labels.pick));
    expect(threads.map((t) => mapClassesOf(elementsOf(t, hasClass('map__dot'))[0]))).toEqual(view.legend.threads.map((t) => ['map__dot', `map__dot--tone-${t.tone}`]));
    expect(elementsOf(legend, hasClass('map__thread-line'))).toHaveLength(0);
    expect(buttonOf(legend, view.legend.showAll)).toBeUndefined();
  });

  it('the top photo as its thumbnail, its description in its title, and no words of it on the page', () => {
    const [top] = elementsOf(tree, hasClass('map__top'));
    const [img] = elementsOf(top, (n) => n.type === 'img');
    expect(img.props.src.split('/').pop()).toBe('p01.jpg');
    expect(img.props.title).toBe(BOARD_PHOTOS['p01.jpg']);
    expect(textOf(top)).not.toContain(BOARD_PHOTOS['p01.jpg']);
    expect(textOf(top)).toContain(view.headline.text);
  });
});

describe('4D: the board: a column per section, its cards in order, its photos by themselves and its add line', () => {
  const data = boardPayloadOf();
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  const tree = mountMap({ data }).render();
  const columns = elementsOf(tree, hasClass('map__column'));

  it("renders a column for each of the view's sections, headed by its label, its heading or that none prints, and its job", () => {
    expect(columns.map((c) => c.props['aria-label'])).toEqual(view.sections.map((s) => s.label));
    columns.forEach((column, i) => {
      const section = view.sections[i];
      const [head] = elementsOf(column, hasClass('map__section-head'));
      expect(textOf(elementsOf(head, (n) => n.type === 'h4')[0])).toBe(section.label);
      expect(textOf(elementsOf(head, hasClass('map__heading'))[0])).toBe(section.heading || ViewLogic.MAP_NO_HEADING_LINE);
      expect(textOf(elementsOf(head, hasClass('map__job'))[0])).toBe(section.job);
      expect(elementsOf(column, (n) => n.type === 'button' && textOf(n) === '+ Add a move')).toHaveLength(1);
    });
  });

  it('shows each card as its title, its people, its dots naming their threads, the "Card" mark where the view sets it and its thumbnails, and no summary until opened', () => {
    const cards = columnCards(tree);
    expect(cards).toHaveLength(16);
    cards.forEach((card, i) => {
      const beat = viewBeats(view)[i];
      expect(card.props.key).toBe(beat.key);
      expect(textOf(elementsOf(card, hasClass('map__card-title'))[0])).toBe(beat.label);
      expect(textOf(elementsOf(card, hasClass('map__people'))[0])).toBe(beat.players);
      expect(elementsOf(card, hasClass('map__dot')).map((d) => [mapClassesOf(d)[1], d.props.title])).toEqual(beat.dots.map((d) => [`map__dot--tone-${d.tone}`, d.name]));
      expect(elementsOf(card, hasClass('map__card-mark')).map(textOf)).toEqual(beat.cardMark ? ['Card'] : []);
      expect(elementsOf(card, (n) => n.type === 'img').map((img) => img.props.src.split('/').pop())).toEqual(beat.photos.map((p) => p.filename));
      expect(elementsOf(card, hasClass('map__synopsis'))).toHaveLength(0);
      expect(textOf(card)).not.toContain(beat.synopsis);
      expect(labelled(card, beat.labels.showSummary).props['aria-expanded']).toBe(false);
    });
  });

  it("puts each photo beside no move at its column's foot, as a thumbnail with its description in its title", () => {
    columns.forEach((column, i) => {
      const loose = elementsOf(column, hasClass('map__loose'));
      const expected = view.sections[i].byThemselves.map((p) => p.filename);
      expect(loose.flatMap((l) => elementsOf(l, (n) => n.type === 'img').map((img) => [img.props.src.split('/').pop(), img.props.title]))).toEqual(
        expected.map((name) => [name, BOARD_PHOTOS[name]])
      );
    });
  });

  it('shows a picture that cannot load as its description in its place', () => {
    const mounted = mountMap({ data });
    const [img] = elementsOf(cardOf(mounted.render(), 'Marcus tests the batch on himself'), (n) => n.type === 'img');
    img.props.onError({ currentTarget: {} });
    const card = cardOf(mounted.render(), 'Marcus tests the batch on himself');
    expect(elementsOf(card, (n) => n.type === 'img')).toHaveLength(0);
    expect(elementsOf(card, hasClass('map__thumb--missing')).map(textOf)).toEqual([BOARD_PHOTOS['p03.jpg']]);
  });

  it("shows the tray's moves by their titles and their dots, always open", () => {
    const [tray] = elementsOf(tree, hasClass('map__tray'));
    expect(tray.props['aria-label']).toBe(view.leftOut.title);
    const items = elementsOf(tray, hasClass('map__card'));
    expect(items.map((n) => textOf(elementsOf(n, hasClass('map__card-title'))[0]))).toEqual(view.leftOut.items.map((b) => b.label));
    expect(items.map((n) => n.props.key)).toEqual(view.leftOut.items.map((b) => b.key));
    expect(items.map((n) => elementsOf(n, hasClass('map__dot')).map((d) => d.props.title))).toEqual(view.leftOut.items.map((b) => b.dots.map((d) => d.name)));
  });
});

describe('4D: selecting a card opens it in place', () => {
  const data = boardPayloadOf();
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  const b4 = viewBeats(view).find((b) => b.id === 'b4');
  const TITLE = 'Marcus asks Quinn to raise the dose';

  it('a card is focusable and opens on a click, with its summary, its people, its threads by name, its photos, its controls and what is behind it', () => {
    const mounted = mountMap({ data });
    const closed = cardOf(mounted.render(), TITLE);
    expect(closed.props.tabIndex).toBe(0);
    expect(elementsOf(closed, hasClass('map__card-detail'))).toHaveLength(0);
    click(closed);
    const card = cardOf(mounted.render(), TITLE);
    expect(card.props['aria-expanded']).toBe(true);
    expect(mapClassesOf(card)).toContain('map__card--selected');
    expect(elementsOf(card, hasClass('map__synopsis')).map(textOf)).toEqual([b4.synopsis]);
    const [detail] = elementsOf(card, hasClass('map__card-detail'));
    expect(elementsOf(detail, hasClass('map__thread-name')).map(textOf)).toEqual(b4.dots.map((d) => d.name));
    expect(elementsOf(detail, hasClass('map__photo-description')).map(textOf)).toEqual(b4.photos.map((p) => p.description));
    expect(elementsOf(detail, (n) => n.type === 'button').map(textOf)).toEqual(['Edit the words', 'Move up', 'Move down', 'Leave it out']);
    expect(labelled(detail, b4.labels.moveTo).type).toBe('select');
    expect(labelled(detail, b4.labels.photoBeside).type).toBe('select');
    const [behind] = elementsOf(detail, hasClass('map__behind'));
    expect(behind.props['aria-label']).toBe(b4.labels.fold);
    expect(textOf(elementsOf(behind, hasClass('map__label'))[0])).toBe(view.evidenceTitle);
    expect(elementsOf(behind, hasClass('map__piece')).map(textOf)).toEqual(b4.evidence.map((p) => (p.printsAsCard ? `${ViewLogic.MAP_PRINTS_AS_CARD}${p.text}` : p.text)));
    expect(elementsOf(behind, hasClass('map__prints-as-card')).map(textOf)).toEqual([ViewLogic.MAP_PRINTS_AS_CARD]);
    expect(elementsOf(behind, hasClass('map__meets')).map(textOf)).toEqual([b4.meets]);
  });

  it('Enter selects a card that has focus; clicking it again, Escape, or selecting another closes it', () => {
    const mounted = mountMap({ data });
    const selectedTitles = () => elementsOf(mounted.render(), hasClass('map__card--selected')).map((n) => textOf(elementsOf(n, hasClass('map__card-title'))[0]));
    const first = cardOf(mounted.render(), TITLE);
    first.props.onKeyDown({ key: 'Enter', target: first, currentTarget: first, preventDefault: () => {} });
    expect(selectedTitles()).toEqual([TITLE]);
    click(cardOf(mounted.render(), TITLE));
    expect(selectedTitles()).toEqual([]);
    click(cardOf(mounted.render(), TITLE));
    cardOf(mounted.render(), TITLE).props.onKeyDown({ key: 'Escape' });
    expect(selectedTitles()).toEqual([]);
    click(cardOf(mounted.render(), TITLE));
    click(cardOf(mounted.render(), 'Jess warns Sarah away'));
    expect(selectedTitles()).toEqual(['Jess warns Sarah away']);
  });

  it("a click on one of the card's own controls does not close it", () => {
    const mounted = mountMap({ data });
    click(cardOf(mounted.render(), TITLE));
    const card = cardOf(mounted.render(), TITLE);
    const inside = { closest: () => ({}) };
    card.props.onClick({ target: inside, currentTarget: { contains: () => true } });
    expect(mapClassesOf(cardOf(mounted.render(), TITLE))).toContain('map__card--selected');
  });

  it('a move in the tray opens the same way, with Bring it back into a section and what is behind it', () => {
    const mounted = mountMap({ data });
    const item = view.leftOut.items[0];
    click(cardOf(mounted.render(), item.label));
    const [detail] = elementsOf(cardOf(mounted.render(), item.label), hasClass('map__card-detail'));
    expect(elementsOf(detail, hasClass('map__synopsis')).map(textOf)).toEqual([item.synopsis]);
    const bring = labelled(detail, item.labels.bringBack);
    expect(elementsOf(bring, (n) => n.type === 'option').slice(1).map(textOf)).toEqual(item.targets.map((t) => t.label));
    expect(elementsOf(detail, hasClass('map__behind'))).toHaveLength(1);
  });

  it('a photo opens with its description and where it can go: beside a move in any section, by itself, to the top or another section', () => {
    const mounted = mountMap({ data });
    const photo = view.sections[2].byThemselves[0];
    labelled(mounted.render(), photo.labels.select).props.onClick();
    const [panel] = elementsOf(mounted.render(), hasClass('map__photo-panel'));
    expect(elementsOf(panel, hasClass('map__photo-description')).map(textOf)).toEqual([photo.description]);
    expect(elementsOf(labelled(panel, photo.labels.placeBeside), (n) => n.type === 'option').slice(1).map(textOf)).toEqual(photo.besideTargets.map((t) => t.label));
    expect(elementsOf(labelled(panel, photo.labels.moveTo), (n) => n.type === 'option').slice(1).map(textOf)).toEqual(photo.moveTargets.map((t) => t.label));
    expect(elementsOf(labelled(panel, photo.labels.beside), (n) => n.type === 'option').map(textOf)).toEqual(photo.besideOptions.map((o) => o.label));
    labelled(mounted.render(), photo.labels.select).props.onClick();
    expect(elementsOf(mounted.render(), hasClass('map__photo-panel'))).toHaveLength(0);
  });

  it('a photo the director left out shows that it does not print, with no controls', () => {
    const left = { ...data, leftOutPhotos: ['p06.jpg'] };
    const photo = ViewLogic.mapView(left, ViewLogic.mapDraftOf(left, undefined)).sections[2].byThemselves[0];
    const mounted = mountMap({ data: left });
    labelled(mounted.render(), photo.labels.select).props.onClick();
    const [item] = elementsOf(mounted.render(), hasClass('map__photo--selected'));
    expect(elementsOf(item, hasClass('map__concern')).map(textOf)).toEqual([ViewLogic.mapView(left, ViewLogic.mapDraftOf(left, undefined)).sections[2].byThemselves[0].concerns[0]]);
    expect(elementsOf(item, (n) => n.type === 'select')).toHaveLength(0);
  });
});

describe('4D: the summaries and a thread picked', () => {
  const data = boardPayloadOf();
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));

  it("a card's arrow opens its summary, and closes it again", () => {
    const mounted = mountMap({ data });
    const b1 = viewBeats(view)[0];
    labelled(mounted.render(), b1.labels.showSummary).props.onClick();
    const card = cardOf(mounted.render(), b1.label);
    expect(elementsOf(card, hasClass('map__synopsis')).map(textOf)).toEqual([b1.synopsis]);
    expect(labelled(card, b1.labels.hideSummary).props['aria-expanded']).toBe(true);
    expect(elementsOf(mounted.render(), hasClass('map__synopsis'))).toHaveLength(1);
    labelled(mounted.render(), b1.labels.hideSummary).props.onClick();
    expect(elementsOf(mounted.render(), hasClass('map__synopsis'))).toHaveLength(0);
  });

  it('the board\'s button opens every summary, then closes every one', () => {
    const mounted = mountMap({ data });
    buttonOf(mounted.render(), view.summaries.open).props.onClick();
    const open = mounted.render();
    expect(elementsOf(open, hasClass('map__synopsis')).map(textOf)).toEqual(viewBeats(view).map((b) => b.synopsis));
    expect(buttonOf(open, view.summaries.close).props['aria-pressed']).toBe(true);
    buttonOf(open, view.summaries.close).props.onClick();
    expect(elementsOf(mounted.render(), hasClass('map__synopsis'))).toHaveLength(0);
  });

  it('a map from before piece 4 shows no arrow and no button for the summaries', () => {
    const old = boardMap();
    old.sections.forEach((s) => s.beats.forEach((b) => { delete b.synopsis; }));
    const tree = mountMap({ data: boardPayloadOf(boardMapState({ outline: old, _mapBaseline: boardMap() })) }).render();
    expect(columnCards(tree)).toHaveLength(16);
    expect(elementsOf(tree, hasClass('map__summary-toggle'))).toHaveLength(0);
    expect(elementsOf(tree, hasClass('map__summaries'))).toHaveLength(0);
  });

  it('picking a thread shows its line, outlines the cards that carry it and dims the rest; Show all, or picking it again, clears it', () => {
    const mounted = mountMap({ data });
    const thread = view.legend.threads[2];
    labelled(mounted.render(), thread.labels.pick).props.onClick();
    const tree = mounted.render();
    expect(elementsOf(tree, hasClass('map__thread-line')).map(textOf)).toEqual([thread.line]);
    expect(labelled(tree, thread.labels.pick).props['aria-pressed']).toBe(true);
    const carry = [...viewBeats(view), ...view.leftOut.items].filter((b) => b.legendKeys.includes(thread.key)).map((b) => b.label);
    expect(carry.length).toBeGreaterThan(0);
    const cards = elementsOf(tree, hasClass('map__card'));
    expect(cards.filter(hasClass('map__card--follows')).map((n) => textOf(elementsOf(n, hasClass('map__card-title'))[0]))).toEqual(carry);
    expect(cards.filter(hasClass('map__card--dimmed'))).toHaveLength(cards.length - carry.length);
    buttonOf(tree, view.legend.showAll).props.onClick();
    expect(elementsOf(mounted.render(), hasClass('map__card--dimmed'))).toHaveLength(0);
    labelled(mounted.render(), thread.labels.pick).props.onClick();
    labelled(mounted.render(), thread.labels.pick).props.onClick();
    expect(elementsOf(mounted.render(), hasClass('map__thread-line'))).toHaveLength(0);
  });
});

describe("4D: each of a selected card's controls, and a photo's, reaches its EditLogic op once", () => {
  const data = boardPayloadOf();
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  const selected = (mounted, title) => {
    click(cardOf(mounted.render(), title));
    return elementsOf(cardOf(mounted.render(), title), hasClass('map__card-detail'))[0];
  };
  const calledOnly = (mounted, op) => MOVE_OPS.forEach((name) => expect(`${name} ${mounted.ops[name].mock.calls.length}`).toBe(`${name} ${name === op ? 1 : 0}`));
  const slotOf = (map, id) => map.sections.find((s) => s.beats.some((b) => b.id === id));

  it('Move up moves the card one place up in its column, and it stays selected', () => {
    const mounted = mountMap({ data });
    buttonOf(selected(mounted, 'Marcus asks Quinn to raise the dose'), 'Move up').props.onClick();
    calledOnly(mounted, 'moveBeatBy');
    expect(mounted.ops.moveBeatBy.mock.calls[0].slice(1)).toEqual(['b4', -1]);
    expect(mounted.saved().sections[1].beats.map((b) => b.id)).toEqual(['b4', 'b3', 'b5', 'b6', 'b7', 'b8']);
    expect(mapClassesOf(cardOf(mounted.render(), 'Marcus asks Quinn to raise the dose'))).toContain('map__card--selected');
  });

  it("Move up is off at the column's head, and Move down at its foot", () => {
    const mounted = mountMap({ data });
    const head = selected(mounted, 'Marcus tests the batch on himself');
    expect(buttonOf(head, 'Move up').props.disabled).toBe(true);
    expect(buttonOf(head, 'Move down').props.disabled).toBe(false);
    const foot = selected(mounted, 'Remi presses Quinn and backs off');
    expect(buttonOf(foot, 'Move down').props.disabled).toBe(true);
  });

  it('Move to another section puts the card at the foot of that section', () => {
    const mounted = mountMap({ data });
    const b4 = viewBeats(view).find((b) => b.id === 'b4');
    labelled(selected(mounted, b4.label), b4.labels.moveTo).props.onChange({ target: { value: 'closing' } });
    calledOnly(mounted, 'moveBeat');
    expect(mounted.ops.moveBeat.mock.calls[0].slice(1, 3)).toEqual(['b4', 'closing']);
    expect(slotOf(mounted.saved(), 'b4').beats.map((b) => b.id)).toEqual(['b15', 'b16', 'b4']);
  });

  it('Leave it out puts the move in the tray; Take it out takes a move the director added out whole', () => {
    const mounted = mountMap({ data });
    buttonOf(selected(mounted, 'Jess warns Sarah away'), 'Leave it out').props.onClick();
    calledOnly(mounted, 'strikeBeat');
    expect(mounted.saved().leftOut.map((b) => b.id)).toEqual(['b17', 'b18', 'b5']);
    const added = EditLogic.addBeat(ViewLogic.mapDraftOf(data, undefined), 'closing', 'Remi walks out before the vote', 'Remi');
    const withAdded = mountMap({ data, pendingEdits: ViewLogic.mapPendingSlot(data, added) });
    const detail = selected(withAdded, 'Remi walks out before the vote');
    expect(buttonOf(detail, 'Leave it out')).toBeUndefined();
    buttonOf(detail, 'Take it out').props.onClick();
    calledOnly(withAdded, 'removeBeat');
    expect(beatIdsOf(withAdded.saved())).not.toContain('b19');
  });

  it('Bring it back puts a move from the tray at the foot of the section picked', () => {
    const mounted = mountMap({ data });
    const item = view.leftOut.items[0];
    labelled(selected(mounted, item.label), item.labels.bringBack).props.onChange({ target: { value: 'lede' } });
    calledOnly(mounted, 'bringBackBeat');
    expect(mounted.saved().sections[0].beats.map((b) => b.id)).toEqual(['b1', 'b2', 'b17']);
    expect(mounted.saved().leftOut.map((b) => b.id)).toEqual(['b18']);
  });

  it('Put a photo beside it places the photo picked beside the move, from any place, in one op', () => {
    const mounted = mountMap({ data });
    const b15 = viewBeats(view).find((b) => b.id === 'b15');
    const choice = b15.photoChoices.find((c) => c.label.includes(BOARD_PHOTOS['p06.jpg']));
    labelled(selected(mounted, b15.label), b15.labels.photoBeside).props.onChange({ target: { value: choice.value } });
    calledOnly(mounted, 'placePhotoBeside');
    expect(mounted.ops.placePhotoBeside.mock.calls[0].slice(1)).toEqual(['followTheMoney', 0, 'closing', 'b15']);
    expect(mounted.saved().sections[4].photos).toEqual([{ filename: 'p09.jpg', beat: 'b16' }, { filename: 'p10.jpg' }, { filename: 'p06.jpg', beat: 'b15' }]);
  });

  it("a selected photo goes beside a move in another section, by itself in its own, or to the top, each in one op", () => {
    const photo = view.sections[2].byThemselves[0];
    const besideB1 = mountMap({ data });
    labelled(besideB1.render(), photo.labels.select).props.onClick();
    labelled(besideB1.render(), photo.labels.placeBeside).props.onChange({ target: { value: 'b1' } });
    calledOnly(besideB1, 'placePhotoBeside');
    expect(besideB1.ops.placePhotoBeside.mock.calls[0].slice(1)).toEqual(['followTheMoney', 0, 'lede', 'b1']);

    const toTop = mountMap({ data });
    labelled(toTop.render(), photo.labels.select).props.onClick();
    labelled(toTop.render(), photo.labels.moveTo).props.onChange({ target: { value: EditLogic.MAP_TOP_PHOTO } });
    calledOnly(toTop, 'movePhoto');
    expect(toTop.saved().topPhoto).toBe('p06.jpg');

    const onCard = view.sections[1].photos[0];
    const byItself = mountMap({ data });
    labelled(byItself.render(), onCard.labels.select).props.onClick();
    labelled(byItself.render(), onCard.labels.beside).props.onChange({ target: { value: '' } });
    calledOnly(byItself, 'setPhotoBeside');
    expect(byItself.saved().sections[1].photos[0]).toEqual({ filename: 'p03.jpg' });
  });

  it('the top photo goes beside a move, from its own panel', () => {
    const mounted = mountMap({ data });
    labelled(mounted.render(), view.topPhoto.labels.select).props.onClick();
    labelled(mounted.render(), view.topPhoto.labels.placeBeside).props.onChange({ target: { value: 'b9' } });
    calledOnly(mounted, 'placePhotoBeside');
    expect(mounted.ops.placePhotoBeside.mock.calls[0].slice(1)).toEqual([EditLogic.MAP_TOP_PHOTO, 0, 'followTheMoney', 'b9']);
    expect(mounted.saved().topPhoto).toBeUndefined();
  });
});

describe("4D: Edit the words opens the move's editor on its card: its title, its summary and its people", () => {
  it("opens on the move's words, and saves what the director typed into that move, keeping the rest of it", () => {
    const data = boardPayloadOf();
    const mounted = mountMap({ data });
    click(cardOf(mounted.render(), 'Jess warns Sarah away'));
    buttonOf(cardOf(mounted.render(), 'Jess warns Sarah away'), 'Edit the words').props.onClick();
    const [host] = elementsOf(mounted.render(), (n) => hasClass('map__card')(n) && hasClass('map__editing')(n));
    const [editorNode] = elementsOf(host, (n) => typeof n.type === 'function' && n.type.name === 'BeatEditor');
    const editor = mounted.child(editorNode);
    const fields = () => elementsOf(editor.render(), (n) => typeof n.type === 'function' && n.type.name === 'TextField');
    expect(fields().map((f) => [f.props.label, f.props.value])).toEqual([
      ['The move', 'Jess warns Sarah away'],
      ['Summary', boardMap().sections[1].beats[2].synopsis],
      ['Players it shows', 'Jess, Sarah']
    ]);
    fields()[1].props.onChange('Jess tells Sarah to stay clear of the vote.');
    elementsOf(editor.render(), (n) => n.type === 'button' && textOf(n) === 'Save')[0].props.onClick();
    expect(mounted.saved().sections[1].beats[2]).toEqual({ ...boardMap().sections[1].beats[2], synopsis: 'Jess tells Sarah to stay clear of the vote.' });
    expect(elementsOf(mounted.render(), hasClass('map__editing'))).toHaveLength(0);
  });

  // Review focus 3 (R9): with a move's editor open, a click on another card waits and says why on
  // that card, and the words typed in the editor survive: the editor stays open on its own card,
  // and its Save puts them on the map.
  it('a click on another card while an editor is open is held, shows its line on that card, and the typed words survive', () => {
    const mounted = mountMap({ data: boardPayloadOf() });
    click(cardOf(mounted.render(), 'Jess warns Sarah away'));
    buttonOf(cardOf(mounted.render(), 'Jess warns Sarah away'), 'Edit the words').props.onClick();
    const editorOf = () => elementsOf(mounted.render(), (n) => typeof n.type === 'function' && n.type.name === 'BeatEditor')[0];
    const editor = mounted.child(editorOf());
    const fields = () => elementsOf(editor.render(), (n) => typeof n.type === 'function' && n.type.name === 'TextField');
    fields()[0].props.onChange('Jess pulls Sarah out of the vote');
    click(cardOf(mounted.render(), 'Quinn tells the room another story'));
    const tree = mounted.render();
    const LINE = 'Before you select or move anything else, save or cancel your edit to the move "Jess warns Sarah away".';
    expect(elementsOf(tree, (n) => hasClass('map__card')(n) && hasClass('map__editing')(n)).map((n) => n.props.key)).toEqual(['theStory-beat-b5']);
    expect(elementsOf(tree, hasClass('map__card--selected')).map((n) => n.props.key)).toEqual(['theStory-beat-b5']);
    expect(elementsOf(cardOf(tree, 'Quinn tells the room another story'), hasClass('held-line')).map(textOf)).toEqual([LINE]);
    expect(editorOf().props.beat.id).toBe('b5');
    expect(fields()[0].props.value).toBe('Jess pulls Sarah out of the vote');
    elementsOf(editor.render(), (n) => n.type === 'button' && textOf(n) === 'Save')[0].props.onClick();
    expect(mounted.saved().sections[1].beats[2].move).toBe('Jess pulls Sarah out of the vote');
    expect(heldLines(mounted.render())).toEqual([]);
    click(cardOf(mounted.render(), 'Quinn tells the room another story'));
    expect(elementsOf(mounted.render(), hasClass('map__card--selected')).map((n) => n.props.key)).toEqual(['theStory-beat-b6']);
  });

  it('while an editor is open, the card selected can still be closed, by a click on it or by Escape', () => {
    const mounted = mountMap({ data: boardPayloadOf() });
    click(cardOf(mounted.render(), 'Jess warns Sarah away'));
    elementsOf(mounted.render(), (n) => n.type === 'button' && n.props.className === 'article-block__edit-btn')[0].props.onClick();
    click(cardOf(mounted.render(), 'Jess warns Sarah away'));
    expect(elementsOf(mounted.render(), hasClass('map__card--selected'))).toHaveLength(0);
    click(cardOf(mounted.render(), 'Quinn tells the room another story'));
    expect(elementsOf(mounted.render(), hasClass('map__card--selected'))).toHaveLength(0);
    click(cardOf(mounted.render(), 'Jess warns Sarah away'));
    cardOf(mounted.render(), 'Jess warns Sarah away').props.onKeyDown({ key: 'Escape' });
    expect(elementsOf(mounted.render(), hasClass('map__card--selected'))).toHaveLength(0);
  });
});

// Piece 4 (brief 4D; R9): every control on the selected card waits while an editor is open or the
// add line holds text, disabled with its line as its tooltip and its line under the controls, and
// its click changes nothing; so does a photo's thumbnail and a selected photo's places.
describe("4D: the selected card's controls, and selecting a photo, wait for what the director typed", () => {
  const data = boardPayloadOf();
  const LINE = 'Before you select or move anything else, add or cancel the new move in "Closing".';
  const typeInAddLine = (mounted) => {
    const [closing] = elementsOf(mounted.render(), (n) => n.type === 'section' && n.props['aria-label'] === 'Closing');
    buttonOf(closing, '+ Add a move').props.onClick();
    elementsOf(mounted.render(), hasClass('map__add-move'))[0].props.onChange({ target: { value: 'Remi walks out before the vote' } });
  };

  it('each button and place on the selected card is off, says why, and does nothing', () => {
    const mounted = mountMap({ data });
    click(cardOf(mounted.render(), 'Marcus asks Quinn to raise the dose'));
    typeInAddLine(mounted);
    const [detail] = elementsOf(cardOf(mounted.render(), 'Marcus asks Quinn to raise the dose'), hasClass('map__card-detail'));
    const controls = elementsOf(detail, (n) => (n.type === 'button' || n.type === 'select') && textOf(n) !== 'Edit the words');
    expect(controls.map((n) => (n.type === 'select' ? textOf(n.children[0]) : textOf(n)))).toEqual(['Move up', 'Move down', 'Move to another section…', 'Put a photo beside it…', 'Leave it out']);
    controls.forEach((n) => expect([textOf(n).slice(0, 20), n.props.disabled, n.props.title]).toEqual([textOf(n).slice(0, 20), true, LINE]));
    buttonOf(detail, 'Move up').props.onClick();
    buttonOf(detail, 'Leave it out').props.onClick();
    controls.filter((n) => n.type === 'select').forEach((n) => n.props.onChange({ target: { value: n.children[1][0].props.value } }));
    MOVE_OPS.filter((op) => op !== 'addBeat').forEach((op) => expect(`${op} ${mounted.ops[op].mock.calls.length}`).toBe(`${op} 0`));
    expect(elementsOf(detail, hasClass('held-line')).map(textOf)).toEqual([LINE]);
  });

  it('Edit the words waits only for an open editor, as every pencil does, so it opens beside a typed add line', () => {
    const mounted = mountMap({ data });
    click(cardOf(mounted.render(), 'Marcus asks Quinn to raise the dose'));
    typeInAddLine(mounted);
    const edit = buttonOf(cardOf(mounted.render(), 'Marcus asks Quinn to raise the dose'), 'Edit the words');
    expect(edit.props.disabled).toBe(false);
  });

  it('a move in the tray waits to be brought back, and a photo to be selected', () => {
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    const item = view.leftOut.items[0];
    const photo = view.sections[2].byThemselves[0];
    const mounted = mountMap({ data });
    click(cardOf(mounted.render(), item.label));
    typeInAddLine(mounted);
    const bring = labelled(mounted.render(), item.labels.bringBack);
    expect([bring.props.disabled, bring.props.title]).toEqual([true, LINE]);
    bring.props.onChange({ target: { value: 'lede' } });
    labelled(mounted.render(), photo.labels.select).props.onClick();
    expect(elementsOf(mounted.render(), hasClass('map__photo-panel'))).toHaveLength(0);
    expect(labelled(mounted.render(), photo.labels.select).props.title).toBe(LINE);
    expect(mounted.ops.bringBackBeat).not.toHaveBeenCalled();
  });
});

// Piece 4 (brief 4D; R10): the board's drag and drop is the browser's own. Each drop calls the
// handler its button calls, which reaches its EditLogic op once; a drop target shows where the card
// or photo will land. The stand-in dataTransfer keeps what the drag start set, as the browser's does.
describe('4D: each drop reaches the same op as its button, once', () => {
  const data = boardPayloadOf();
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  const calledOnly = (mounted, op) => MOVE_OPS.forEach((name) => expect(`${name} ${mounted.ops[name].mock.calls.length}`).toBe(`${name} ${name === op ? 1 : 0}`));
  const transfer = () => {
    const store = {};
    return { setData: (type, value) => { store[type] = String(value); }, getData: (type) => store[type] || '', effectAllowed: '', dropEffect: '' };
  };
  const event = (dt) => ({ dataTransfer: dt, target: {}, currentTarget: {}, relatedTarget: null, preventDefault: jest.fn(), stopPropagation: () => {} });
  /** A drag from the node `from` finds to the node `to` finds, each found again in the page as it is then. */
  const drag = (mounted, from, to) => {
    const dt = transfer();
    from(mounted.render()).props.onDragStart(event(dt));
    const over = event(dt);
    to(mounted.render()).props.onDragOver(over);
    const landing = mounted.render();
    to(landing).props.onDrop(event(dt));
    return { over, landing };
  };
  const card = (title) => (tree) => cardOf(tree, title);
  const column = (label) => (tree) => elementsOf(tree, (n) => hasClass('map__column')(n) && n.props['aria-label'] === label)[0];
  const tray = (tree) => elementsOf(tree, hasClass('map__tray'))[0];
  const top = (tree) => elementsOf(tree, hasClass('map__top'))[0];
  const photo = (filename) => (tree) => elementsOf(tree, (n) => hasClass('map__photo')(n) && elementsOf(n, (img) => img.type === 'img' && img.props.src.endsWith('/' + filename)).length > 0)[0];
  const ids = (map, slot) => map.sections.find((s) => s.slot === slot).beats.map((b) => b.id);

  it('a card dropped on a card in its column lands just before it, as Move up and Move down place it', () => {
    const mounted = mountMap({ data });
    const { over, landing } = drag(mounted, card('The trial run comes to light'), card('Marcus asks Quinn to raise the dose'));
    expect(over.preventDefault).toHaveBeenCalled();
    expect(mapClassesOf(cardOf(landing, 'Marcus asks Quinn to raise the dose'))).toContain('map__card--drop-before');
    calledOnly(mounted, 'moveBeat');
    expect(mounted.ops.moveBeat.mock.calls[0].slice(1)).toEqual(['b7', 'theStory', 1]);
    expect(ids(mounted.saved(), 'theStory')).toEqual(['b3', 'b7', 'b4', 'b5', 'b6', 'b8']);
    expect(elementsOf(mounted.render(), (n) => /--drop|--dragging/.test(n.props.className || ''))).toHaveLength(0);
  });

  it('a card dropped lower in its own column lands just before the card it was dropped on', () => {
    const mounted = mountMap({ data });
    drag(mounted, card('Marcus tests the batch on himself'), card('Quinn tells the room another story'));
    calledOnly(mounted, 'moveBeat');
    expect(ids(mounted.saved(), 'theStory')).toEqual(['b4', 'b5', 'b3', 'b6', 'b7', 'b8']);
  });

  it('a card dropped on a card in another column lands before it, and on a column at its foot, as Move to another section puts it', () => {
    const before = mountMap({ data });
    drag(before, card('Marcus asks Quinn to raise the dose'), card('A launch waits on the closed case'));
    calledOnly(before, 'moveBeat');
    expect(ids(before.saved(), 'closing')).toEqual(['b15', 'b4', 'b16']);
    const foot = mountMap({ data });
    const { landing } = drag(foot, card('Marcus asks Quinn to raise the dose'), column('Closing'));
    expect(mapClassesOf(column('Closing')(landing))).toContain('map__column--drop');
    calledOnly(foot, 'moveBeat');
    expect(foot.ops.moveBeat.mock.calls[0].slice(1, 3)).toEqual(['b4', 'closing']);
    expect(ids(foot.saved(), 'closing')).toEqual(['b15', 'b16', 'b4']);
  });

  // Fix round 1: a drop on a card lands just before it, so the column's foot is the one place that
  // takes a card to the last place in its own column.
  it("a card dropped on its own column's foot goes to the last place there, and the card already last shows no landing", () => {
    const mounted = mountMap({ data });
    const { over, landing } = drag(mounted, card('Marcus tests the batch on himself'), column('The Story'));
    expect(over.preventDefault).toHaveBeenCalled();
    expect(mapClassesOf(column('The Story')(landing))).toContain('map__column--drop');
    calledOnly(mounted, 'moveBeat');
    expect(ids(mounted.saved(), 'theStory')).toEqual(['b4', 'b5', 'b6', 'b7', 'b8', 'b3']);
    const last = mountMap({ data });
    const lastDrag = drag(last, card('Remi presses Quinn and backs off'), column('The Story'));
    expect(lastDrag.over.preventDefault).not.toHaveBeenCalled();
    expect(mapClassesOf(column('The Story')(lastDrag.landing))).not.toContain('map__column--drop');
    MOVE_OPS.forEach((op) => expect(`${op} ${last.ops[op].mock.calls.length}`).toBe(`${op} 0`));
  });

  it('a card dropped in the tray is left out, and a move the director added is taken out, as their buttons do', () => {
    const mounted = mountMap({ data });
    const { landing } = drag(mounted, card('Jess warns Sarah away'), tray);
    expect(mapClassesOf(tray(landing))).toContain('map__tray--drop');
    calledOnly(mounted, 'strikeBeat');
    expect(mounted.saved().leftOut.map((b) => b.id)).toEqual(['b17', 'b18', 'b5']);
    const added = EditLogic.addBeat(ViewLogic.mapDraftOf(data, undefined), 'closing', 'Remi walks out before the vote', 'Remi');
    const withAdded = mountMap({ data, pendingEdits: ViewLogic.mapPendingSlot(data, added) });
    drag(withAdded, card('Remi walks out before the vote'), tray);
    calledOnly(withAdded, 'removeBeat');
  });

  it('a move dragged out of the tray onto a card comes back before it, and onto a column at its foot, as Bring it back does', () => {
    const item = view.leftOut.items[0];
    const before = mountMap({ data });
    drag(before, card(item.label), card('Alex wonders if everyone was dosed'));
    calledOnly(before, 'bringBackBeat');
    expect(before.ops.bringBackBeat.mock.calls[0].slice(1)).toEqual(['b17', 'lede', 1]);
    expect(ids(before.saved(), 'lede')).toEqual(['b1', 'b17', 'b2']);
    const foot = mountMap({ data });
    drag(foot, card(item.label), column('Lede'));
    calledOnly(foot, 'bringBackBeat');
    expect(ids(foot.saved(), 'lede')).toEqual(['b1', 'b2', 'b17']);
  });

  it('a photo dropped on a move in another section goes beside it there, in one op, as Put a photo beside it does', () => {
    const mounted = mountMap({ data });
    const { landing } = drag(mounted, photo('p06.jpg'), card('The verdict clears every hand'));
    expect(mapClassesOf(cardOf(landing, 'The verdict clears every hand'))).toContain('map__card--drop-beside');
    calledOnly(mounted, 'placePhotoBeside');
    expect(mounted.ops.placePhotoBeside.mock.calls[0].slice(1)).toEqual(['followTheMoney', 0, 'closing', 'b15']);
  });

  it('a photo dropped on a column stands there by itself: from another section, and from beside a move of its own', () => {
    const other = mountMap({ data });
    drag(other, photo('p06.jpg'), column('Closing'));
    calledOnly(other, 'movePhoto');
    expect(other.ops.movePhoto.mock.calls[0].slice(1)).toEqual(['followTheMoney', 0, 'closing']);
    const own = mountMap({ data });
    drag(own, photo('p03.jpg'), column('The Story'));
    calledOnly(own, 'setPhotoBeside');
    expect(own.saved().sections[1].photos[0]).toEqual({ filename: 'p03.jpg' });
  });

  it('a photo dropped on the top of the article becomes the top photo, and the top photo goes into a column', () => {
    const toTop = mountMap({ data });
    const { landing } = drag(toTop, photo('p06.jpg'), top);
    expect(mapClassesOf(top(landing))).toContain('map__top--drop');
    calledOnly(toTop, 'movePhoto');
    expect(toTop.saved().topPhoto).toBe('p06.jpg');
    const fromTop = mountMap({ data });
    drag(fromTop, photo('p01.jpg'), column('Closing'));
    calledOnly(fromTop, 'movePhoto');
    expect(fromTop.ops.movePhoto.mock.calls[0].slice(1)).toEqual([EditLogic.MAP_TOP_PHOTO, 0, 'closing']);
  });

  it('a target that does not take what is dragged shows no landing and changes nothing', () => {
    const mounted = mountMap({ data });
    const { over, landing } = drag(mounted, card('Jess warns Sarah away'), top);
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(mapClassesOf(top(landing))).not.toContain('map__top--drop');
    drag(mounted, card('Jess warns Sarah away'), card('Jess warns Sarah away'));
    drag(mounted, photo('p01.jpg'), top);
    drag(mounted, photo('p05.jpg'), column('The Story'));
    drag(mounted, photo('p04.jpg'), card('Quinn tells the room another story'));
    MOVE_OPS.forEach((op) => expect(`${op} ${mounted.ops[op].mock.calls.length}`).toBe(`${op} 0`));
    cardOf(mounted.render(), 'Jess warns Sarah away').props.onDrop(event(transfer()));
    MOVE_OPS.forEach((op) => expect(`${op} ${mounted.ops[op].mock.calls.length}`).toBe(`${op} 0`));
  });

  // Fix round 1: the browser bubbles a drag's events from the card to its column. A card that holds
  // what is dragged already (the card itself, or a photo beside it) stops them there, so the column
  // never takes a drop that would change nothing into a move.
  /** A drag whose dragover and drop bubble through `path`, the innermost first, until a handler stops them. */
  const bubbleDrag = (mounted, from, path) => {
    const dt = transfer();
    from(mounted.render()).props.onDragStart(event(dt));
    const bubbled = (type) => {
      let stopped = false;
      const e = { ...event(dt), stopPropagation: () => { stopped = true; } };
      path.forEach((find) => {
        const node = find(mounted.render());
        if (!stopped && node.props[type]) node.props[type](e);
      });
      return e;
    };
    const over = bubbled('onDragOver');
    const landing = mounted.render();
    bubbled('onDrop');
    return { over, landing };
  };

  it('a photo dropped back on the move it sits beside stays there: its card stops the drag, and its column shows no landing', () => {
    const mounted = mountMap({ data });
    const { over, landing } = bubbleDrag(mounted, photo('p03.jpg'), [card('Marcus tests the batch on himself'), column('The Story')]);
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(elementsOf(landing, (n) => /--drop/.test(n.props.className || ''))).toHaveLength(0);
    MOVE_OPS.forEach((op) => expect(`${op} ${mounted.ops[op].mock.calls.length}`).toBe(`${op} 0`));
    expect(mounted.dispatched).toEqual([]);
  });

  it('a card dropped back on itself stays where it is, the column under it showing no landing', () => {
    const mounted = mountMap({ data });
    const { over, landing } = bubbleDrag(mounted, card('Marcus tests the batch on himself'), [card('Marcus tests the batch on himself'), column('The Story')]);
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(elementsOf(landing, (n) => /--drop/.test(n.props.className || ''))).toHaveLength(0);
    MOVE_OPS.forEach((op) => expect(`${op} ${mounted.ops[op].mock.calls.length}`).toBe(`${op} 0`));
  });

  it('a photo dropped on another move of its column goes beside that move, the column taking nothing', () => {
    const mounted = mountMap({ data });
    bubbleDrag(mounted, photo('p03.jpg'), [card('Jess warns Sarah away'), column('The Story')]);
    calledOnly(mounted, 'placePhotoBeside');
    expect(mounted.saved().sections[1].photos.find((p) => p.filename === 'p03.jpg').beat).toBe('b5');
  });

  it('a card whose editor is open does not drag, and a drop waits for no editor, since an editor is keyed by its line', () => {
    const mounted = mountMap({ data });
    click(cardOf(mounted.render(), 'Jess warns Sarah away'));
    buttonOf(cardOf(mounted.render(), 'Jess warns Sarah away'), 'Edit the words').props.onClick();
    expect(cardOf(mounted.render(), 'Jess warns Sarah away').props.draggable).toBe(false);
    expect(cardOf(mounted.render(), 'Marcus tests the batch on himself').props.draggable).toBe(true);
    drag(mounted, card('The trial run comes to light'), card('Marcus tests the batch on himself'));
    calledOnly(mounted, 'moveBeat');
    expect(elementsOf(mounted.render(), (n) => hasClass('map__card')(n) && hasClass('map__editing')(n)).map((n) => n.props.key)).toEqual(['theStory-beat-b5']);
  });

  it('the dragged card is marked while it drags, and the marks clear when the drag ends', () => {
    const mounted = mountMap({ data });
    const dt = transfer();
    cardOf(mounted.render(), 'Jess warns Sarah away').props.onDragStart(event(dt));
    expect(mapClassesOf(cardOf(mounted.render(), 'Jess warns Sarah away'))).toContain('map__card--dragging');
    cardOf(mounted.render(), 'Marcus tests the batch on himself').props.onDragOver(event(dt));
    expect(mapClassesOf(cardOf(mounted.render(), 'Marcus tests the batch on himself'))).toContain('map__card--drop-before');
    cardOf(mounted.render(), 'Jess warns Sarah away').props.onDragEnd(event(dt));
    expect(elementsOf(mounted.render(), (n) => /--drop|--dragging/.test(n.props.className || ''))).toHaveLength(0);
  });
});

describe('4D: the margin: what the round says of a move, a section or the top sits under it (spec 7)', () => {
  it("renders a card's changed line under its title, whether selected or not", () => {
    const report = { checked: ['E1'], changed: [{ id: 'E1', scope: 'outline', where: 'section "theStory", beat "b5", move', cut: false, removed: false, moved: false, director: 'Jess pulls Sarah aside', became: 'Jess warns Sarah', pass: 'send-back', automatic: false, reason: 'The note asked for the warning.', restored: false }] };
    const data = mapPayloadOf(storyLevelMapState({ _outlineHandEditReport: report, humanOutlineRevisionCount: 1 }));
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    const [line] = viewBeats(view).find((b) => b.id === 'b5').changed;
    expect(line).toContain('Jess pulls Sarah aside');
    const mounted = mountMap({ data });
    expect(elementsOf(cardOf(mounted.render(), 'Jess warns Sarah'), hasClass('map__changed')).map(textOf)).toEqual([line]);
    click(cardOf(mounted.render(), 'Jess warns Sarah'));
    expect(elementsOf(cardOf(mounted.render(), 'Jess warns Sarah'), hasClass('map__changed')).map(textOf)).toEqual([line]);
  });

  // Run 1 follow-up F8: an edit about a section shows under its head, one about the headline, the
  // deck or the top photo at the top of the article, and only one with no place among the round's lines.
  describe("an edit a rework changed shows under its section's head, while its editor is open too, or at the top of the article", () => {
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
    const changedIn = (node) => elementsOf(node, hasClass('map__changed')).map(textOf);
    const headOf = (tree) => elementsOf(tree, (n) => hasClass('map__section-head')(n) && elementsOf(n, (m) => textOf(m) === "The room's case for an accident, then the turn.").length > 0)[0];

    it("renders the section's line in its head, the deck's at the top, and the one with no place among the round's lines", () => {
      const [sectionLine] = view.sections.find((s) => s.slot === 'theStory').changed;
      const [deckLine] = view.top.changed;
      const [roundLine] = view.changedEdits;
      expect([sectionLine, deckLine, roundLine].every(Boolean)).toBe(true);
      const tree = mountMap({ data }).render();
      expect(changedIn(headOf(tree))).toEqual([sectionLine]);
      expect(changedIn(elementsOf(tree, hasClass('map__top'))[0])).toEqual([deckLine]);
      expect(changedIn(tree)).toEqual([roundLine, deckLine, sectionLine]);
    });

    it("keeps the section's line under its head while the head's editor is open", () => {
      const mounted = mountMap({ data });
      const [column] = elementsOf(mounted.render(), (n) => hasClass('map__column')(n) && n.props['aria-label'] === view.sections[1].label);
      elementsOf(column, hasClass('article-block__edit-btn'))[0].props.onClick();
      const [open] = elementsOf(mounted.render(), (n) => hasClass('map__section-head')(n) && hasClass('map__editing')(n));
      expect(changedIn(open)).toEqual(view.sections[1].changed);
    });
  });

  // Fix round 1: the run 2 contract's changedBeside, which 4C fills, holds the changed lines about the
  // gap note, the expected length and the map's changes to the weave; each shows under its place,
  // while its editor is open too, and an absent field shows nothing.
  describe("an edit a rework changed about the gap note, the expected length or the weave changes shows under it (changedBeside)", () => {
    const data = mapPayloadOf(storyLevelMapState());
    const BESIDE = { gapNote: ['Your gap note was changed.'], length: ['Your length was changed.'], weaveChanges: ['Your change to the weave was changed.'] };
    const withBeside = (beside) => (d, m) => {
      const v = ViewLogic.mapView(d, m);
      const order = v.order.includes('weaveChanges') ? v.order : [...v.order, 'weaveChanges'];
      return beside === undefined ? { ...v, order } : { ...v, order, changedBeside: beside };
    };
    const changedIn = (node) => elementsOf(node, hasClass('map__changed')).map(textOf);
    const gapOf = (tree) => elementsOf(tree, hasClass('map__gap'))[0];
    const lengthOf = (tree) => elementsOf(tree, hasClass('map__length'))[0];
    const weaveChangesOf = (tree) => elementsOf(tree, hasClass('map__changes'))[0];

    it('renders each under its place, and nowhere else', () => {
      const tree = mountMap({ data }, { mapView: withBeside(BESIDE) }).render();
      expect(changedIn(gapOf(tree))).toEqual(BESIDE.gapNote);
      expect(changedIn(lengthOf(tree))).toEqual(BESIDE.length);
      expect(changedIn(weaveChangesOf(tree))).toEqual(BESIDE.weaveChanges);
      expect(changedIn(tree)).toEqual([...BESIDE.length, ...BESIDE.gapNote, ...BESIDE.weaveChanges]);
    });

    it("keeps the gap note's and the length's lines under them while their editors are open", () => {
      const mounted = mountMap({ data }, { mapView: withBeside(BESIDE) });
      elementsOf(gapOf(mounted.render()), hasClass('article-block__edit-btn'))[0].props.onClick();
      const gap = gapOf(mounted.render());
      expect(mapClassesOf(gap)).toContain('map__editing');
      expect(changedIn(gap)).toEqual(BESIDE.gapNote);
      const lengthMounted = mountMap({ data }, { mapView: withBeside(BESIDE) });
      elementsOf(lengthOf(lengthMounted.render()), hasClass('article-block__edit-btn'))[0].props.onClick();
      const length = lengthOf(lengthMounted.render());
      expect(mapClassesOf(length)).toContain('map__editing');
      expect(changedIn(length)).toEqual(BESIDE.length);
    });

    it('shows nothing for a view with no changedBeside, or with a field of it absent', () => {
      expect(changedIn(mountMap({ data }, { mapView: withBeside(undefined) }).render())).toEqual([]);
      expect(changedIn(mountMap({ data }, { mapView: withBeside({ length: ['Only the length.'] }) }).render())).toEqual(['Only the length.']);
    });

    it("shows the gap note's line under the settled story when the map holds no gap note any more", () => {
      const noGap = (d, m) => ({ ...withBeside(BESIDE)(d, m), gapNote: null });
      const gap = gapOf(mountMap({ data }, { mapView: noGap }).render());
      expect(changedIn(gap)).toEqual(BESIDE.gapNote);
      expect(elementsOf(gap, hasClass('article-block__edit-btn'))).toHaveLength(0);
    });
  });

  describe('a check still failing shows under the line it names (spec 6.3)', () => {
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
      expect(checksIn(cardOf(tree, 'The memories sold off as the trial run surfaced'))).toEqual(viewBeats(view).find((b) => b.id === 'b6').failures);
      const [lede] = elementsOf(tree, (n) => hasClass('map__section-head')(n) && textOf(n).includes('Opens on the vote'));
      expect(checksIn(lede)).toEqual(view.sections[0].failures);
      const board = view.sections[1].photos[0];
      const [photo] = elementsOf(tree, (n) => hasClass('map__photo')(n) && labelled(n, board.labels.select));
      expect(checksIn(photo)).toEqual(board.failures);
      expect(board.failures).toEqual(['Check still failing: This photo is placed twice.']);
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
    });
  });
});

describe('1F: no tag on the page, and every aria-label names a move by its words', () => {
  const data = mapPayloadOf();
  const draft = EditLogic.addBeat(ViewLogic.mapDraftOf(data, undefined), 'closing', 'Remi walks out before the vote', 'Remi');
  const pending = ViewLogic.mapPendingSlot(data, draft);
  const view = ViewLogic.mapView(data, draft);

  it("the lines under the add line and the open editor, and beside the held buttons, name the move by its words", () => {
    const mounted = mountMap({ data, pendingEdits: pending });
    click(cardOf(mounted.render(), 'Marcus asks Quinn for a higher dose'));
    buttonOf(cardOf(mounted.render(), 'Marcus asks Quinn for a higher dose'), 'Edit the words').props.onClick();
    elementsOf(mounted.render(), (n) => n.type === 'button' && textOf(n) === '+ Add a move')[0].props.onClick();
    elementsOf(mounted.render(), hasClass('map__add-move'))[0].props.onChange({ target: { value: 'Kai counts the votes' } });
    expect(heldLines(mounted.render())).toEqual([
      'Before you add a move in another section, add or cancel the new move in "Lede".',
      'Before you edit another line, save or cancel your edit to the move "Marcus asks Quinn for a higher dose".',
      'Before you approve or send back: save or cancel your edit to the move "Marcus asks Quinn for a higher dose"; add or cancel the new move in "Lede".'
    ]);
  });

  it("names each card's controls by the move's words, as the view gives them", () => {
    const all = [...viewBeats(view), ...view.leftOut.items];
    all.forEach((beat) => expect(beat.labels).toEqual({
      fold: `What's behind it: ${beat.move}`,
      moveTo: `Move "${beat.move}" to another section`,
      // Fix B2: Leave it out and Take it out each named by the words they show, the move in place of "it".
      strike: `Leave "${beat.move}" out`,
      takeOut: `Take "${beat.move}" out`,
      bringBack: `Bring "${beat.move}" back into a section`,
      // Piece 4 (brief 4B): the card's own controls, each by the move's title.
      select: `Select the move "${beat.move}"`,
      showSummary: `Show the summary of "${beat.move}"`,
      hideSummary: `Hide the summary of "${beat.move}"`,
      moveUp: `Move "${beat.move}" up`,
      moveDown: `Move "${beat.move}" down`,
      photoBeside: `Put a photo beside "${beat.move}"`
    }));
    const mounted = mountMap({ data, pendingEdits: pending });
    const added = viewBeats(view).find((b) => b.added);
    click(cardOf(mounted.render(), added.label));
    const [detail] = elementsOf(mounted.render(), hasClass('map__card-detail'));
    [added.labels.moveUp, added.labels.moveDown, added.labels.moveTo, added.labels.photoBeside, added.labels.takeOut, added.labels.fold]
      .forEach((label) => expect([label, elementsOf(detail, (n) => n.props['aria-label'] === label).length]).toEqual([label, 1]));
    expect(added.labels.takeOut).toBe('Take "Remi walks out before the vote" out');
  });

  // Fix round 3: a move with no words is named "a move" (moveLabelsOf's fallback), never by its
  // id, and its fold's title comes from the one builder the meeting's folds use.
  it('names a move with no words "a move" in each of its labels, never by its id', () => {
    const blank = JSON.parse(JSON.stringify(ViewLogic.mapDraftOf(data, undefined)));
    const [first] = blank.sections.find((s) => s.beats.length > 0).beats;
    first.move = '   ';
    const blankBeat = viewBeats(ViewLogic.mapView(data, blank)).find((b) => b.id === first.id);
    expect(blankBeat.move.trim()).toBe('');
    expect(blankBeat.labels.fold).toBe(ViewLogic.evidenceFoldLabel('a move'));
    expect(Object.values(blankBeat.labels).filter((label) => label.includes(blankBeat.id))).toEqual([]);
  });

  it("names each photo's controls by the director's description, as the view gives them", () => {
    const [board, bar] = view.sections[1].photos;
    expect(board.labels).toEqual({
      beside: `Where "${PHOTO_DESCRIPTIONS['board.jpg']}" sits in its section`,
      moveTo: `Move "${PHOTO_DESCRIPTIONS['board.jpg']}" to the top or to another section`,
      select: `Select the photo "${PHOTO_DESCRIPTIONS['board.jpg']}"`,
      placeBeside: `Put "${PHOTO_DESCRIPTIONS['board.jpg']}" beside a move`
    });
    expect(bar.labels.moveTo).toBe(`Move "${PHOTO_DESCRIPTIONS['bar.jpg']}" to the top or to another section`);
    expect(view.topPhoto.labels).toEqual({
      moveTo: `Move the top photo "${PHOTO_DESCRIPTIONS['top.jpg']}" into a section`,
      select: `Select the top photo "${PHOTO_DESCRIPTIONS['top.jpg']}"`,
      placeBeside: `Put the top photo "${PHOTO_DESCRIPTIONS['top.jpg']}" beside a move`
    });
    const tree = mountMap({ data, pendingEdits: pending }).render();
    [board.labels.select, bar.labels.select, view.topPhoto.labels.select]
      .forEach((label) => expect(elementsOf(tree, (n) => n.props['aria-label'] === label)).toHaveLength(1));
    const bare = ViewLogic.mapView({ ...data, photoDescriptions: {} }, draft);
    expect(bare.sections[1].photos[1].labels).toMatchObject({ beside: 'Where bar.jpg sits in its section', moveTo: 'Move bar.jpg to the top or to another section', select: 'Select the photo bar.jpg' });
    expect(bare.topPhoto.labels).toMatchObject({ moveTo: 'Move the top photo top.jpg into a section', select: 'Select the top photo top.jpg' });
  });
});

describe("1F: the add line takes a move's words and its people, under `adding.move`", () => {
  const src = read('components/checkpoints/Outline.js');

  it('names its words `move` in its state, as console/unsaved-input-logic.js reads it', () => {
    expect(src).toContain("setAdding({ slot: slot, move: '', players: '' })");
    expect(src).toContain('EditLogic.addBeat(draft, adding.slot, adding.move, adding.players)');
    expect(src).not.toMatch(/material/);
  });

  it('opens in its column, holds the buttons while it holds a move, and adds `{id, move, players}` through addBeat', () => {
    const mounted = mountMap({ data: mapPayloadOf() });
    const [closing] = elementsOf(mounted.render(), (n) => n.type === 'section' && n.props['aria-label'] === 'Closing');
    elementsOf(closing, (n) => n.type === 'button' && textOf(n) === '+ Add a move')[0].props.onClick();
    const line = () => elementsOf(mounted.render(), hasClass('map__add'))[0];
    const addButton = () => elementsOf(line(), (n) => n.type === 'button' && textOf(n) === 'Add the move')[0];
    const approve = () => elementsOf(mounted.render(), (n) => n.type === 'button' && textOf(n) === ViewLogic.mapButtons('', false).approve.label)[0];
    expect([elementsOf(line(), hasClass('map__add-move'))[0].props['aria-label'], elementsOf(line(), hasClass('map__add-players'))[0].props['aria-label']])
      .toEqual([ViewLogic.MAP_CONTROLS.addLine.moveLabel, ViewLogic.MAP_CONTROLS.addLine.playersLabel]);
    expect(addButton().props.disabled).toBe(true);
    expect(approve().props.disabled).toBe(false);
    elementsOf(line(), hasClass('map__add-move'))[0].props.onChange({ target: { value: 'Remi walks out before the vote' } });
    elementsOf(line(), hasClass('map__add-players'))[0].props.onChange({ target: { value: 'Remi, Kai' } });
    expect(textOf(elementsOf(line(), hasClass('map__add-move'))[0])).toBe('Remi walks out before the vote');
    expect(addButton().props.disabled).toBe(false);
    expect(approve().props.disabled).toBe(true);
    expect(heldLines(mounted.render())).toEqual([
      'Before you add a move in another section, add or cancel the new move in "Closing".',
      'Before you approve or send back, add or cancel the new move in "Closing".'
    ]);
    addButton().props.onClick();
    expect(mounted.ops.addBeat).toHaveBeenCalledTimes(1);
    expect(mounted.saved().sections[3].beats[1]).toEqual({ id: 'b10', move: 'Remi walks out before the vote', players: ['Remi', 'Kai'] });
    expect(elementsOf(mounted.render(), hasClass('map__add'))).toHaveLength(0);
    expect(approve().props.disabled).toBe(false);
  });
});

describe("1F: the map's styles", () => {
  const css = read('console.css');
  const map = css.slice(css.indexOf('/* ── 4.9: the map ──'), css.indexOf("/* ── 4.10: the desk's marks ──"));
  const ruled = (rule) => new RegExp(`${rule.replace(/[.-]/g, '\\$&')}[\\s,{:]`).test(map);

  it("styles the card mark, a check beside its line, the photo's description and the add line's move", () => {
    ['.map__card-mark', '.map__check--beside', '.map__photo-description', '.map__add-move']
      .forEach((rule) => expect(`${rule}: ${ruled(rule)}`).toBe(`${rule}: true`));
  });

  // Fix round 3: the map's fold copied the meeting's declaration for declaration. Each of its
  // rules named both pages' classes, once, under the meeting's section. Piece 4 (brief 4D, R8): the
  // map's evidence shows on the selected card, unfolded, so the fold's rules are the meeting's alone,
  // and the pieces' rules still name both pages' classes.
  it("styles the pieces and a piece that cuts against its move in the meeting's rules, each grouped with its twin, and keeps the fold the meeting's", () => {
    const twins = [
      ['.meeting__pieces', '.map__pieces'],
      ['.meeting__piece', '.map__piece'],
      ['.meeting__piece.meeting__cuts-against', '.map__piece.map__cuts-against'],
      ['.meeting__no-evidence', '.map__no-evidence']
    ];
    twins.forEach(([meeting, ofMap]) => {
      const grouped = `${meeting},\n${ofMap} {`;
      expect(`${grouped}: ${css.split(grouped).length - 1}`).toBe(`${grouped}: 1`);
    });
    ['.meeting__fold .collapsible-section {', '.meeting__fold .collapsible-header {', '.meeting__fold .collapsible-header:hover {', '.meeting__fold .collapsible-body {']
      .forEach((rule) => expect(`${rule} ${css.split(rule).length - 1}`).toBe(`${rule} 1`));
    ['.map__fold', '.map__pieces', '.map__piece', '.map__cuts-against', '.map__no-evidence']
      .forEach((rule) => expect(`${rule}: ${ruled(rule)}`).toBe(`${rule}: false`));
    expect(css).not.toContain('.map__fold');
  });

  it('keeps no style for an id, a kind, the material or the header that held them', () => {
    ['.map__id', '.map__kind', '.map__material', '.map__add-material', '.map__beat-head'].forEach((gone) => expect(`${gone}: ${css.includes(gone)}`).toBe(`${gone}: false`));
  });
});

// Piece 4 (brief 4D; spec 4 to 7): the board's look, in the console's tokens. The columns stand side
// by side and stack on a narrow screen; the cards, the selected state, a thread followed and the drop
// targets each have a rule; each thread tone takes its colour from a token on :root; and the
// one-column page's classes went with it.
describe("4D: the board's styles", () => {
  const css = read('console.css');
  const map = css.slice(css.indexOf('/* ── 4.9: the map ──'), css.indexOf("/* ── 4.10: the desk's marks ──"));
  const ruled = (rule) => new RegExp(`${rule.replace(/[.-]/g, '\\$&')}[\\s,{:>]`).test(map);
  const src = read('components/checkpoints/Outline.js');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const body = (selector) => {
    const at = map.indexOf(`${selector} {`);
    return at === -1 ? '' : map.slice(at, map.indexOf('}', at));
  };

  // The pieces of what's behind a move are styled with the meeting's twins, above the map's section.
  it('styles every class Outline.js gives the board, the tones aside', () => {
    const anywhere = (rule) => new RegExp(`${rule.replace(/[.-]/g, '\\$&')}[\\s,{:>]`).test(css);
    const used = [...new Set([...src.matchAll(/map__[a-z][a-z-]*[a-z]/g)].map((m) => `.${m[0]}`))]
      .filter((name) => !name.startsWith('.map__dot--tone'));
    expect(used.length).toBeGreaterThan(40);
    used.forEach((name) => expect(`${name}: ${anywhere(name)}`).toBe(`${name}: true`));
  });

  it("gives each of mapView's tones, and the grey tone outside the story, a token on :root and a dot's rule that reads it", () => {
    for (let tone = 0; tone <= ViewLogic.MAP_TONES; tone += 1) {
      expect(`--map-tone-${tone} ${new RegExp(`--map-tone-${tone}:\\s*#[0-9a-f]{6};`).test(root)}`).toBe(`--map-tone-${tone} true`);
      expect(body(`.map__dot--tone-${tone}`)).toContain(`background: var(--map-tone-${tone});`);
    }
    expect(map).not.toContain(`.map__dot--tone-${ViewLogic.MAP_TONES + 1}`);
  });

  it('stands the columns side by side, and stacks them one under another on a narrow screen', () => {
    expect(body('.map__columns')).toMatch(/grid-auto-flow:\s*column/);
    const narrow = map.slice(map.indexOf('@media (max-width: 768px)'));
    expect(map.indexOf('@media (max-width: 768px)')).toBeGreaterThan(-1);
    const stacked = narrow.slice(narrow.indexOf('.map__columns {'), narrow.indexOf('}', narrow.indexOf('.map__columns {')));
    expect(stacked).toMatch(/grid-auto-flow:\s*row/);
    expect(stacked).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it('marks the selected card, a thread followed and the rest dimmed, the card dragged and each place a drag lands', () => {
    ['.map__card--selected', '.map__card--follows', '.map__card--dimmed', '.map__card--dragging',
      '.map__card--drop-before', '.map__card--drop-beside', '.map__column--drop', '.map__tray--drop', '.map__top--drop']
      .forEach((name) => expect(`${name}: ${ruled(name)}`).toBe(`${name}: true`));
    expect(src).toContain("' map__card--drop-before'");
    expect(src).toContain("' map__card--drop-beside'");
  });

  it('shows a picture that cannot load as its description, never hidden', () => {
    expect(body('.map__thumb--missing')).not.toMatch(/display:\s*none/);
  });

  it("the one-column page's classes went with it", () => {
    ['.map__beat', '.map__left-out', '.map__section ', '.map__section,', '.map__section {', '.map__move-words', '.map__photo-body']
      .forEach((gone) => expect(`${gone}: ${css.includes(gone)}`).toBe(`${gone}: false`));
    ['map__beat', 'map__left-out', "'map__section'", 'map__move-words', 'map__photo-body', 'map__fold']
      .forEach((gone) => expect(`${gone}: ${src.includes(gone)}`).toBe(`${gone}: false`));
  });
});

// Fix B1: the board's control words are the view's (MAP_CONTROLS), which Outline.js prints as they
// are, so the component decides no word of its own: a selected card's controls, a move's in the
// tray, a photo's, the add line and the move's editor.
describe("Fix B1: the board's control words come from the view", () => {
  const src = read('components/checkpoints/Outline.js');
  const CONTROLS = ViewLogic.MAP_CONTROLS;
  const wordsOf = (group) => Object.values(group);

  it('the view gives every word of the controls, and Outline.js writes none of them itself', () => {
    expect(Object.keys(CONTROLS)).toEqual(['card', 'tray', 'photo', 'addLine', 'beatEditor']);
    Object.values(CONTROLS).flatMap(wordsOf).forEach((words) => {
      expect(typeof words).toBe('string');
      expect(`${words}: ${src.includes(`'${words}'`)}`).toBe(`${words}: false`);
    });
    expect(src).toMatch(/^const CONTROLS = ViewLogic\.MAP_CONTROLS;$/m);
  });

  it("a selected card's controls, a tray move's and a photo's show the view's words", () => {
    const data = boardPayloadOf();
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    const mounted = mountMap({ data });
    click(cardOf(mounted.render(), 'Marcus asks Quinn to raise the dose'));
    const [detail] = elementsOf(mounted.render(), hasClass('map__card-detail'));
    const shown = (node) => elementsOf(node, (n) => n.type === 'button' || n.type === 'select').map((n) => (n.type === 'select' ? textOf(n.children[0]) : textOf(n)));
    expect(shown(elementsOf(detail, hasClass('map__controls'))[0])).toEqual([
      CONTROLS.card.editWords, CONTROLS.card.moveUp, CONTROLS.card.moveDown, CONTROLS.card.moveTo, CONTROLS.card.photoBeside, CONTROLS.card.leaveOut
    ]);
    click(cardOf(mounted.render(), view.leftOut.items[0].label));
    expect(shown(elementsOf(mounted.render(), hasClass('map__card-detail'))[0])).toContain(CONTROLS.tray.bringBack);
    const photo = view.sections[2].byThemselves[0];
    labelled(mounted.render(), photo.labels.select).props.onClick();
    const [panel] = elementsOf(mounted.render(), hasClass('map__photo-panel'));
    expect(shown(panel).slice(1)).toEqual([CONTROLS.photo.placeBeside, CONTROLS.photo.moveTo]);
    labelled(mounted.render(), view.topPhoto.labels.select).props.onClick();
    expect(shown(elementsOf(mounted.render(), hasClass('map__photo-panel'))[0])).toEqual([CONTROLS.photo.placeBeside, CONTROLS.photo.topMoveTo]);
  });

  it("the add line and the move's editor show the view's words", () => {
    const data = boardPayloadOf();
    const mounted = mountMap({ data });
    const open = elementsOf(mounted.render(), (n) => n.type === 'button' && textOf(n) === CONTROLS.addLine.open);
    expect(open.length).toBeGreaterThan(0);
    open[0].props.onClick();
    const [line] = elementsOf(mounted.render(), hasClass('map__add'));
    const [move, players] = elementsOf(line, (n) => n.type === 'input');
    expect([move.props.placeholder, move.props['aria-label'], players.props.placeholder, players.props['aria-label']])
      .toEqual([CONTROLS.addLine.move, CONTROLS.addLine.moveLabel, CONTROLS.addLine.players, CONTROLS.addLine.playersLabel]);
    expect(elementsOf(line, (n) => n.type === 'button').map(textOf)[0]).toBe(CONTROLS.addLine.add);
    click(cardOf(mounted.render(), 'Jess warns Sarah away'));
    buttonOf(cardOf(mounted.render(), 'Jess warns Sarah away'), CONTROLS.card.editWords).props.onClick();
    const [host] = elementsOf(mounted.render(), (n) => hasClass('map__card')(n) && hasClass('map__editing')(n));
    const [editorNode] = elementsOf(host, (n) => typeof n.type === 'function' && n.type.name === 'BeatEditor');
    const fields = elementsOf(mounted.child(editorNode).render(), (n) => typeof n.type === 'function' && n.type.name === 'TextField');
    const E = CONTROLS.beatEditor;
    expect(fields.map((f) => [f.props.label, f.props.hint])).toEqual([[E.move, E.moveHint], [E.synopsis, E.synopsisHint], [E.players, E.playersHint]]);
  });
});

// Fix B2 (WCAG 2.5.3, label in name): each control's accessible name holds the words it shows, in
// their order, with the move or the photo it acts on named in place of "it" ('Leave it out' reads
// 'Leave "<title>" out'). A select whose shown text is its placeholder is read by that text; one
// that shows its value (a photo's place in its section) shows no label to hold.
describe('Fix B2: each control on the board is named by the words it shows', () => {
  const tokens = (text) => String(text).toLowerCase().replace(/[“”"…]/g, ' ').split(/[^a-z0-9']+/).filter(Boolean);
  const shownWords = (text) => tokens(text).filter((w) => w !== 'it' && w !== 'its');
  const holds = (name, shown) => {
    const words = tokens(name);
    let at = 0;
    return shownWords(shown).every((w) => {
      const found = words.indexOf(w, at);
      if (found === -1) return false;
      at = found + 1;
      return true;
    });
  };
  /** Each named control in a tree, with the words it shows. */
  const namedControls = (tree) => elementsOf(tree, (n) => ['button', 'select', 'input'].includes(n.type) && typeof n.props['aria-label'] === 'string')
    .map((n) => {
      let shown = '';
      if (n.type === 'button') shown = textOf(n);
      // A move control's placeholder is an option of its own, before the list of places; a select
      // of places alone shows its value.
      if (n.type === 'select' && n.props.value === '' && n.children[0] && n.children[0].type === 'option') shown = textOf(n.children[0]);
      if (n.type === 'input') shown = n.props.placeholder || '';
      return { name: n.props['aria-label'], shown };
    })
    .filter((c) => /[a-z]/i.test(c.shown));
  const misnamed = (tree) => namedControls(tree).filter((c) => !holds(c.name, c.shown)).map((c) => `${c.shown} -> ${c.name}`);

  it("names a selected card's controls, a tray move's and a photo's by the words they show", () => {
    const data = boardPayloadOf();
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    const mounted = mountMap({ data });
    const seen = [];
    const look = () => { const tree = mounted.render(); seen.push(...namedControls(tree)); return misnamed(tree); };
    expect(look()).toEqual([]);
    click(cardOf(mounted.render(), 'Marcus asks Quinn to raise the dose'));
    expect(look()).toEqual([]);
    click(cardOf(mounted.render(), view.leftOut.items[0].label));
    expect(look()).toEqual([]);
    labelled(mounted.render(), view.sections[2].byThemselves[0].labels.select).props.onClick();
    expect(look()).toEqual([]);
    labelled(mounted.render(), view.topPhoto.labels.select).props.onClick();
    expect(look()).toEqual([]);
    elementsOf(mounted.render(), (n) => n.type === 'button' && textOf(n) === ViewLogic.MAP_CONTROLS.addLine.open)[0].props.onClick();
    expect(look()).toEqual([]);
    const shown = new Set(seen.map((c) => c.shown));
    [ViewLogic.MAP_CONTROLS.card.leaveOut, ViewLogic.MAP_CONTROLS.card.moveUp, ViewLogic.MAP_CONTROLS.card.moveTo, ViewLogic.MAP_CONTROLS.card.photoBeside,
      ViewLogic.MAP_CONTROLS.tray.bringBack, ViewLogic.MAP_CONTROLS.photo.placeBeside, ViewLogic.MAP_CONTROLS.photo.moveTo, ViewLogic.MAP_CONTROLS.photo.topMoveTo,
      ViewLogic.MAP_CONTROLS.addLine.move, ViewLogic.MAP_CONTROLS.addLine.players]
      .forEach((words) => expect(`${words}: ${shown.has(words)}`).toBe(`${words}: true`));
  });

  it('names Take it out on a move the director added by the words it shows', () => {
    const data = boardPayloadOf();
    const added = EditLogic.addBeat(ViewLogic.mapDraftOf(data, undefined), data.outline.sections[0].slot, 'Remi walks out before the vote', 'Remi');
    const mounted = mountMap({ data, pendingEdits: ViewLogic.mapPendingSlot(data, added) });
    click(cardOf(mounted.render(), 'Remi walks out before the vote'));
    const tree = mounted.render();
    expect(namedControls(tree).map((c) => c.shown)).toContain(ViewLogic.MAP_CONTROLS.card.takeOut);
    expect(misnamed(tree)).toEqual([]);
  });

  it('names the confirming Send back by the words it shows, and the note box by its label alone', () => {
    const data = boardPayloadOf();
    const mounted = mountMap({ data });
    elementsOf(mounted.render(), (n) => n.type === 'textarea' && n.props.id === 'map-note')[0].props.onChange({ target: { value: 'Move the vote earlier.' } });
    buttonOf(mounted.render(), 'Send back').props.onClick();
    const tree = mounted.render();
    expect(namedControls(tree).map((c) => c.shown)).toContain(ViewLogic.mapButtons('Move the vote earlier.', true).sendBack.label);
    expect(misnamed(tree)).toEqual([]);
    const [box] = elementsOf(tree, (n) => n.type === 'textarea' && n.props.id === 'map-note');
    expect(box.props['aria-label']).toBeUndefined();
    expect(elementsOf(tree, (n) => n.type === 'label' && n.props.htmlFor === 'map-note')).toHaveLength(1);
  });
});

// Fix B3: a card is a control, so it has the role of a button and a name, the view's
// `labels.select`, in a column and in the tray; as a button, Space selects it as Enter does.
describe('Fix B3: a card has a role and a name', () => {
  const data = boardPayloadOf();
  const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));

  it("each card in a column and in the tray is a button named by the view's labels.select", () => {
    const tree = mountMap({ data }).render();
    const cards = columnCards(tree);
    expect(cards.map((c) => [c.props.role, c.props['aria-label']])).toEqual(viewBeats(view).map((b) => ['button', b.labels.select]));
    const tray = elementsOf(elementsOf(tree, hasClass('map__tray'))[0], hasClass('map__card'));
    expect(tray.length).toBeGreaterThan(0);
    expect(tray.map((c) => [c.props.role, c.props['aria-label']])).toEqual(view.leftOut.items.map((b) => ['button', b.labels.select]));
  });

  it('Space selects a card that has focus, as Enter does', () => {
    const mounted = mountMap({ data });
    const title = 'Marcus asks Quinn to raise the dose';
    const card = cardOf(mounted.render(), title);
    let prevented = false;
    card.props.onKeyDown({ key: ' ', target: card, currentTarget: card, preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(true);
    expect(mapClassesOf(cardOf(mounted.render(), title))).toContain('map__card--selected');
  });
});

// Fix B4: each story tone is a saturated colour of its own hue, so no story thread's dot reads as
// the grey of a thread outside the story (tone 0). Tone 5 was a grey-green (#a8b3a0) beside it.
describe('Fix B4: each story tone stands apart from the grey and from the others', () => {
  const css = read('console.css');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const hsl = (tone) => {
    const hex = root.match(new RegExp(`--map-tone-${tone}:\\s*#([0-9a-f]{6});`))[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0 && max === r) h = 60 * (((g - b) / d) % 6);
    else if (d !== 0 && max === g) h = 60 * ((b - r) / d + 2);
    else if (d !== 0) h = 60 * ((r - g) / d + 4);
    return { h: (h + 360) % 360, s };
  };
  const tones = Array.from({ length: ViewLogic.MAP_TONES }, (_, i) => i + 1);

  it('every story tone is saturated, and each hue sits at least 25 degrees from every other', () => {
    // The old tone 5 had a saturation of 0.11; the least saturated story tone now, the green, 0.38.
    tones.forEach((tone) => expect(`${tone}: ${hsl(tone).s >= 0.35}`).toBe(`${tone}: true`));
    tones.forEach((a) => tones.filter((b) => b > a).forEach((b) => {
      const gap = Math.abs(hsl(a).h - hsl(b).h);
      expect(`${a}/${b}: ${Math.min(gap, 360 - gap) >= 25}`).toBe(`${a}/${b}: true`);
    }));
  });

  it("says in the tokens' comment that the console has no light theme", () => {
    expect(root).toMatch(/no light theme/);
  });
});
