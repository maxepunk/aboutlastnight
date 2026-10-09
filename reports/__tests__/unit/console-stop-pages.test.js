/**
 * Task 4.12c: the pages the stops log counts and the e2e harness prints (lib/stop-pages.js) show
 * what the console's components show.
 *
 * Which parts of a stop fold, and the headings the page words itself, are decided twice: in the
 * stop's component, and again in its page. A component that unfolded the trace, or reworded a
 * heading, would change what the director reads without changing the stops log's count or the
 * harness's print. The console has no DOM harness, so the two are held together here on the
 * component sources, in the style of console-trace-panel.test.js:
 * - each heading in PAGE_HEADINGS is a heading its component renders (task 4.12d: where it
 *   renders it, lib/__tests__/fixtures/component-source.js rendersHeading), and the page words no
 *   heading of its own outside that list (the rest are the view models' titles, which the
 *   component reads too);
 * - each part a page folds sits folded in its component, and at the three decision stops nothing
 *   else does;
 * - the character-IDs page cuts a card's texts where the card cuts them.
 */
const fs = require('fs');
const path = require('path');

const View = require('../../console/checkpoint-view-logic');
const { PAGE_HEADINGS, CARD_CUTS, stopPage } = require('../../lib/stop-pages');
const { meetingCheckpointData } = require('../../lib/meeting');
const { mapCheckpointData } = require('../../lib/map');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');
const { rendersHeading, loadInputReview, textOf, elementsOf } = require('../../lib/__tests__/fixtures/component-source');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const count = (haystack, needle) => haystack.split(needle).length - 1;
const clone = (v) => JSON.parse(JSON.stringify(v));

const COMPONENTS = {
  'arc-selection': 'console/components/checkpoints/ArcSelection.js',
  outline: 'console/components/checkpoints/Outline.js',
  article: 'console/components/checkpoints/Article.js',
  'input-review': 'console/components/checkpoints/InputReview.js',
  'character-ids': 'console/components/checkpoints/CharacterIds.js'
};

/** The titles of the lines a page folds, and of those it shows. */
const titles = (page, folded) => page.lines.filter((line) => line.tone === 'title' && line.folded === folded).map((line) => line.label);

const NOTE = [{ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Keep the ledger thread close to the vote.' }];
const TRACE = [{ pass: 1, round: 1, trigger: 'check', findings: { structuralIssues: ['A beat names no document.'] }, at: null, diff: null, changedScopes: ['sections'] }];

describe('4.12c: each page heads its parts in its component\'s words', () => {
  it('names a heading list for every stop with a page', () => {
    expect(Object.keys(PAGE_HEADINGS).sort()).toEqual(Object.keys(COMPONENTS).sort());
  });

  // Task 4.12d: matched where the component renders a heading, not as any quoted string in its
  // source, since an aria-label is a string the screen does not print.
  it.each(Object.entries(COMPONENTS))('the %s page\'s headings are headings its component renders', (stop, rel) => {
    const src = read(rel);
    Object.values(PAGE_HEADINGS[stop]).forEach((heading) => {
      expect([heading, rendersHeading(src, heading)]).toEqual([heading, true]);
    });
  });

  it('the pages word no heading outside PAGE_HEADINGS: every other title is a view model\'s or the card\'s own', () => {
    const src = read('lib/stop-pages.js');
    expect(src).not.toMatch(/\.title\((?:'|"|`(?!\$\{))/);
  });
});

describe('4.12c: each page folds what its component folds', () => {
  // Phase 4b (brief 1B; spec 9; piece 3, spec 2026-10-06 section 5): the meeting folds each line's
  // evidence under it and each left-out thread's line under its name, beside the standing notes.
  it('the story meeting folds the evidence under each line, each left-out thread\'s line and the standing notes', () => {
    const src = read(COMPONENTS['arc-selection']);
    expect(count(src, 'React.createElement(CollapsibleSection')).toBe(3);
    expect(src).toContain('standing.any && React.createElement(CollapsibleSection, { title: standing.title }');
    expect(src).toContain('React.createElement(CollapsibleSection, { title: view.evidenceTitle }');
    expect(src).toContain('React.createElement(CollapsibleSection, { title: thread.label }');
    const state = { ...reworkFixtureState('journalist'), meetingApproved: null };
    const data = { type: 'arc-selection', ...meetingCheckpointData(state, { evidenceIndex: {}, maxRevisions: 1 }), directorGateNotes: NOTE };
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const page = stopPage('arc-selection', data);
    expect(titles(page, true)).toEqual([
      ...view.threads.map(() => view.evidenceTitle), ...view.leftOut.threads.map((thread) => thread.label), ...view.connections.map(() => view.evidenceTitle),
      View.standingNotesView(NOTE).title
    ]);
  });

  // Phase 4b (brief 1D; spec 9): and each move's evidence, under the view's title. Piece 4 (R8;
  // brief 4D): the tray is always open, and a move's evidence shows on its card once the director
  // selects it, so the board keeps two CollapsibleSections, the standing notes and the trace. The
  // page folds the evidence still: it shows only on selection, which the page as it opens never has.
  it("the map folds each move's evidence, the standing notes and the trace, and the tray is always open", () => {
    const src = read(COMPONENTS.outline);
    expect(count(src, 'React.createElement(CollapsibleSection')).toBe(2);
    expect(src).not.toContain('CollapsibleSection, { title: view.evidenceTitle');
    expect(src).toContain("React.createElement('p', { className: 'map__label' }, view.evidenceTitle)");
    expect(src).not.toContain('CollapsibleSection, { title: view.leftOut.title');
    expect(src).toContain('standing.any && React.createElement(CollapsibleSection, { title: standing.title }');
    expect(src).toContain('trace.any && React.createElement(CollapsibleSection, { title: trace.title }');
    const state = reworkFixtureState('journalist');
    const notes = [{ ...NOTE[0], gate: 'outline' }];
    const data = { type: 'outline', ...mapCheckpointData(state, { keptPhotos: ['hero.jpg', 'p2.jpg'], evidenceIndex: {}, maxRevisions: 1 }), trace: TRACE, directorGateNotes: notes };
    const view = View.mapView(data, View.mapDraftOf(data));
    const trace = View.traceView(TRACE, 'journalist');
    const folds = (beats) => beats.filter((beat) => beat.evidence.length > 0 || beat.noEvidence).map(() => view.evidenceTitle);
    expect(titles(stopPage('outline', data), false)).toContain(view.leftOut.title);
    expect(titles(stopPage('outline', data), true)).toEqual([
      ...folds(view.sections.flatMap((section) => section.beats)), ...folds(view.leftOut.items),
      View.standingNotesView(notes).title, trace.title, ...trace.passes.map((pass) => pass.heading)
    ]);
  });

  it('the desk folds the marks the edits may have resolved, the fact check\'s list, the trace and the round\'s record, below the article', () => {
    const src = read(COMPONENTS.article);
    expect(count(src, 'React.createElement(CollapsibleSection')).toBe(4);
    ['desk.folds.resolved.any && React.createElement(CollapsibleSection, { title: desk.folds.resolved.title }',
      'desk.folds.factCheck.any && React.createElement(CollapsibleSection, { title: desk.folds.factCheck.title }',
      'trace.any && React.createElement(CollapsibleSection, { title: trace.title }',
      'React.createElement(CollapsibleSection, { title: desk.folds.rounds.title }'].forEach((fold) => expect(src).toContain(fold));
    const bundle = clone(PREVIOUS_BUNDLE);
    const data = {
      type: 'article', contentBundle: bundle, handEditReport: null, directorGateNotes: [], trace: TRACE, writerTrackerPrints: false,
      factCheck: { structuralIssues: [], advisoryWarnings: ['Roster coverage gap: Sam is never named.'], findings: [{ kind: 'roster', status: 'advisory', place: null, excerpt: '', message: 'Roster coverage gap: Sam is never named.' }] }
    };
    const desk = View.deskView(data, bundle);
    const trace = View.traceView(TRACE, 'journalist');
    const expected = [
      ...(desk.folds.resolved.any ? [desk.folds.resolved.title] : []),
      ...(desk.folds.factCheck.any ? [desk.folds.factCheck.title, ...desk.folds.factCheck.summary.groups.map((group) => group.label)] : []),
      trace.title, ...trace.passes.map((pass) => pass.heading),
      desk.folds.rounds.title
    ];
    expect(desk.folds.factCheck.any).toBe(true);
    expect(titles(stopPage('article', data), true)).toEqual(expected);
  });

  it('the input review folds the accounts, the exposed memories, the quote bank and the epilogue, each closed in its component', () => {
    const src = read(COMPONENTS['input-review']);
    const H = PAGE_HEADINGS['input-review'];
    [H.accounts, H.exposures, H.quotes, H.epilogue].forEach((heading) => {
      const fold = new RegExp(`CollapsibleSection, \\{\\s*title: '${heading} \\('[^}]*defaultOpen: false`);
      expect([heading, fold.test(src)]).toEqual([heading, true]);
    });
  });

  it('the character-IDs stop folds what a card shows only once opened, and cuts its texts where the card cuts them', () => {
    const src = read(COMPONENTS['character-ids']);
    expect(src).toContain(`isExpanded ? visual : truncate(visual, ${CARD_CUTS.visual})`);
    expect(src).toContain(`isExpanded ? desc.description : truncate(desc.description, ${CARD_CUTS.description})`);
    expect(src).toContain('isExpanded && desc.physicalMarkers');
    expect(src).toContain('isExpanded && caption');
  });
});

// ── Task 4.12d ──────────────────────────────────────────────────────────────
// The review of 4.12c (minor 7): three of the page's headings were strings their components give
// only as an aria-label, which a screen reader reads and the screen does not print, so the harness
// printed headings the console never shows. They are labels the page does not print.
describe('4.12d: a part its component names only as an aria-label is a label the page does not print', () => {
  const { PAGE_REGIONS } = require('../../lib/stop-pages');
  const { stopPrint } = require('../../scripts/lib/stop-print');

  /** The story meeting after a round that left the director's edit standing: the round's line shows. */
  const meetingAfterARound = () => ({
    type: 'arc-selection',
    ...meetingCheckpointData({ ...reworkFixtureState('journalist'), meetingApproved: null }, { evidenceIndex: {}, maxRevisions: 1 }),
    handEditReport: { checked: ['E1'], changed: [] }
  });

  /** The map in the round after a send-back: the round's label and the director's note show. */
  const mapAfterASendBack = () => ({
    type: 'outline',
    ...mapCheckpointData(reworkFixtureState('journalist'), { keptPhotos: ['hero.jpg', 'p2.jpg'], evidenceIndex: {}, maxRevisions: 1 }),
    humanRevisionCount: 1,
    previousFeedback: 'Move the vote earlier.',
    trace: []
  });

  it('names three parts, each an aria-label its component gives and no heading it renders, and none among the page\'s headings', () => {
    expect(PAGE_REGIONS).toEqual({
      'arc-selection': { round: 'Since you last looked' },
      outline: { round: 'Since you last looked', top: 'The headline, the deck and the top photo', counts: 'The counts' }
    });
    Object.entries(PAGE_REGIONS).forEach(([stop, regions]) => {
      const src = read(COMPONENTS[stop]);
      Object.values(regions).forEach((name) => {
        expect([stop, name, src.includes(`'aria-label': '${name}'`), rendersHeading(src, name)]).toEqual([stop, name, true, false]);
        expect([stop, name, Object.values(PAGE_HEADINGS[stop]).includes(name)]).toEqual([stop, name, false]);
      });
    });
  });

  it('carries each name on the lines of its part, as their region, and no title of the page or line of the harness\'s print shows it', () => {
    const meeting = meetingAfterARound();
    const meetingView = View.meetingView(meeting, View.meetingDraftOf(meeting), '');
    const meetingPage = stopPage('arc-selection', meeting);
    expect(meetingPage.lines.filter((line) => line.region === PAGE_REGIONS['arc-selection'].round).map((line) => line.text)).toEqual([meetingView.kept]);

    const map = mapAfterASendBack();
    const mapView = View.mapView(map, View.mapDraftOf(map));
    const mapPage = stopPage('outline', map);
    const R = PAGE_REGIONS.outline;
    const inRegion = (name) => mapPage.lines.filter((line) => line.region === name).map((line) => line.text || line.label);
    expect(inRegion(R.round)).toEqual([mapView.round.label, mapView.round.note]);
    expect(inRegion(R.top).slice(0, 2)).toEqual([mapView.headline.text, mapView.deck.text]);
    expect(inRegion(R.counts)).toEqual(expect.arrayContaining([mapView.tally.placed, mapView.tally.cards, mapView.tally.photos, mapView.tally.length]));

    [['arc-selection', meeting, meetingPage], ['outline', map, mapPage]].forEach(([stop, data, page]) => {
      const names = Object.values(PAGE_REGIONS[stop]);
      const titles = page.lines.filter((line) => line.tone === 'title').map((line) => line.label);
      const printed = stopPrint(stop, data).map((line) => line.text);
      names.forEach((name) => {
        expect([stop, name, titles.includes(name), printed.some((text) => text.includes(name))]).toEqual([stop, name, false, false]);
      });
    });
  });
});

// The ruling on 4.12c's minor 2: the input review's page counts the notes receipt (wordTail), so
// its words are the screen's, held here on InputReview.js run with a React that builds a tree.
describe('4.12d: the input review\'s notes receipt reads as InputReview.js renders it', () => {
  const { NOTES_RECEIPT_LABEL } = require('../../lib/stop-pages');

  it('says how many words of the director\'s notes arrived and how they end, in the screen\'s words', () => {
    const { InputReview } = loadInputReview();
    ['Done.', 'Alex and Morgan argued at the bar.', `${'Riley watched the ledger all morning. '.repeat(6)}Then the room voted.`].forEach((rawProse) => {
      const data = { type: 'input-review', directorNotes: { rawProse } };
      const screen = InputReview({ data, onApprove() {}, onReject() {}, theme: 'journalist' });
      const receipts = elementsOf(screen, (element) => element.type === 'p' && element.props.className === 'paste-receipt').map(textOf);
      const line = stopPage('input-review', data).lines.find((l) => l.label === NOTES_RECEIPT_LABEL);
      expect([rawProse, line && `${line.label}: ${line.text}`]).toEqual([rawProse, receipts[0]]);
    });
  });
});

// Phases 14 and 15, brief C (R3): the ledger's shift line, from input-review-logic.js ledgerView,
// shows on the screen right after the clock's line, as the page prints it.
describe('brief C: the ledger panel shows the shift line beside the clock\'s line', () => {
  const InputLogic = require('../../console/input-review-logic');
  const LEDGER = {
    clock: { decided: true, evening: false, firstTime: '03:50 PM' },
    adjustmentsParsed: true,
    adjustments: [{ time: '03:55 PM', loggedTime: '12:55AM', kind: 'bonus', amount: 50000, toAccount: 'Pip' }],
    accounts: [{ name: 'Pip', total: 350000, tokenCount: 1, rank: 1 }],
    mismatches: [],
    unclassified: []
  };
  const paragraphs = (ledger) => {
    const { LedgerPanel } = loadInputReview();
    return elementsOf(LedgerPanel({ ledger }), (element, folded) => element.type === 'p' && !folded).map(textOf);
  };

  it.each([
    ['a shift', { clockShift: { hours: -9, moved: 1, bonus: true } }],
    ['no shift that fits', { offClock: { rows: 3 } }]
  ])('for %s', (name, extra) => {
    const ledger = { ...LEDGER, ...extra };
    const view = InputLogic.ledgerView(ledger);
    expect(typeof view.shiftLine).toBe('string');
    expect(paragraphs(ledger).slice(0, 2)).toStrictEqual([view.clockLine, view.shiftLine]);
  });

  it('shows no line when every row is on the clock', () => {
    expect(paragraphs(LEDGER)).toStrictEqual([InputLogic.ledgerView(LEDGER).clockLine]);
  });
});

// Task 4.12e (the ruling on 4.12d's minor 3): the page printed a whiteboard region's heading in
// straight quotation marks, "SUSPECTS", where InputReview.js prints “SUSPECTS”, and nothing held the
// page's whiteboard text to the screen. It is held here on InputReview.js run with a React that
// builds a tree: each of the whiteboard's lines, as the page prints it and as the screen renders it.
describe('4.12e: the input review\'s whiteboard reads as InputReview.js renders it', () => {
  const WHITEBOARD = {
    ambiguities: ['A name under the coffee stain', { text: 'Riley?', where: 'top left' }],
    names: ['Alex', { name: 'Riley?' }],
    regions: [
      { label: 'SUSPECTS', location: 'left', entries: ['Alex', { name: 'Mel', crossedOut: true }] },
      { entries: ['BizAI'] }
    ],
    connections: [{ from: 'Alex', to: 'Marcus', label: 'partner' }, { from: 'Riley' }],
    notes: ['BizAI?', { note: 'Who paid?' }],
    structureType: 'columns'
  };
  const data = (whiteboard) => ({ type: 'input-review', directorNotes: { whiteboard } });

  /** The whiteboard's lines on the screen: the section its heading opens, each list's items and its paragraphs. */
  const screenBoard = (whiteboard) => {
    const { InputReview } = loadInputReview();
    const screen = InputReview({ data: data(whiteboard), onApprove() {}, onReject() {}, theme: 'journalist' });
    const [section] = elementsOf(screen, (element) => element.type === 'div'
      && element.children.some((child) => child && child.type === 'h4' && textOf(child) === PAGE_HEADINGS['input-review'].whiteboard));
    const keyed = (prefix) => elementsOf(section, (element) => typeof element.props.key === 'string' && element.props.key.startsWith(prefix));
    return {
      ambiguities: keyed('amb-').map(textOf),
      names: keyed('wbn-').map((badge) => badge.props.label).join(', '),
      regions: keyed('wbg-').map(textOf),
      connections: keyed('wbc-').map(textOf),
      notes: keyed('wbt-').map(textOf),
      paragraphs: elementsOf(section, (element) => element.type === 'p').map(textOf)
    };
  };

  /** The whiteboard's lines on the page, from its heading to the next: each as the screen shows it. */
  const pageBoard = (whiteboard) => {
    const lines = stopPage('input-review', data(whiteboard)).lines;
    const after = lines.slice(lines.findIndex((line) => line.tone === 'title' && line.label === PAGE_HEADINGS['input-review'].whiteboard) + 1);
    const next = after.findIndex((line) => line.tone === 'title');
    const board = next === -1 ? after : after.slice(0, next);
    const texts = (label) => board.filter((line) => line.label === label).map((line) => line.text);
    return {
      ambiguities: texts('Ambiguity the parser flagged'),
      names: texts('Names on the board').join(''),
      regions: texts('Region'),
      connections: texts('Connection drawn'),
      notes: texts('Note'),
      // The structure prints under its label, as the screen's paragraph does; the empty board's line is the page's label alone.
      paragraphs: board.filter((line) => line.label === 'Structure' || !line.text).map((line) => (line.text ? `${line.label}: ${line.text}` : line.label))
    };
  };

  it('prints each region under the heading the players wrote, in the component\'s quotation marks, and each other line as the screen shows it', () => {
    const screen = screenBoard(WHITEBOARD);
    expect(screen.regions[0]).toMatch(/^“SUSPECTS” \(left\): Alex, \{/);
    expect(screen.regions[1]).toBe('no heading: BizAI');
    expect(pageBoard(WHITEBOARD)).toEqual(screen);
  });

  it('says the board holds nothing in the screen\'s words', () => {
    const screen = screenBoard({});
    expect(screen.paragraphs).toHaveLength(1);
    expect(pageBoard({})).toEqual(screen);
  });
});
