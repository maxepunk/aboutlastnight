/**
 * Task 4.12c: the pages the stops log counts and the e2e harness prints (lib/stop-pages.js) show
 * what the console's components show.
 *
 * Which parts of a stop fold, and the headings the page words itself, are decided twice: in the
 * stop's component, and again in its page. A component that unfolded the trace, or reworded a
 * heading, would change what the director reads without changing the stops log's count or the
 * harness's print. The console has no DOM harness, so the two are held together here on the
 * component sources, in the style of console-trace-panel.test.js:
 * - each heading in PAGE_HEADINGS is a string its component renders, and the page words no
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

  it.each(Object.entries(COMPONENTS))('the %s page\'s headings are strings its component renders', (stop, rel) => {
    const src = read(rel);
    Object.values(PAGE_HEADINGS[stop]).forEach((heading) => {
      expect([heading, src.includes(`'${heading}`)]).toEqual([heading, true]);
    });
  });

  it('the pages word no heading outside PAGE_HEADINGS: every other title is a view model\'s or the card\'s own', () => {
    const src = read('lib/stop-pages.js');
    expect(src).not.toMatch(/\.title\((?:'|"|`(?!\$\{))/);
  });
});

describe('4.12c: each page folds what its component folds', () => {
  it('the story meeting folds the standing notes alone', () => {
    const src = read(COMPONENTS['arc-selection']);
    expect(count(src, 'React.createElement(CollapsibleSection')).toBe(1);
    expect(src).toContain('standing.any && React.createElement(CollapsibleSection, { title: standing.title }');
    const state = { ...reworkFixtureState('journalist'), meetingApproved: null };
    const data = { type: 'arc-selection', ...meetingCheckpointData(state, { evidenceIndex: {}, maxRevisions: 1 }), directorGateNotes: NOTE };
    const page = stopPage('arc-selection', data);
    expect(titles(page, true)).toEqual([View.standingNotesView(NOTE).title]);
  });

  it('the map folds left out (unless a concern opens it), the standing notes and the trace', () => {
    const src = read(COMPONENTS.outline);
    expect(count(src, 'React.createElement(CollapsibleSection')).toBe(3);
    expect(src).toContain('React.createElement(CollapsibleSection, { title: view.leftOut.title, defaultOpen: view.leftOut.open }');
    expect(src).toContain('standing.any && React.createElement(CollapsibleSection, { title: standing.title }');
    expect(src).toContain('trace.any && React.createElement(CollapsibleSection, { title: trace.title }');
    const state = reworkFixtureState('journalist');
    const notes = [{ ...NOTE[0], gate: 'outline' }];
    const data = { type: 'outline', ...mapCheckpointData(state, { keptPhotos: ['hero.jpg', 'p2.jpg'], evidenceIndex: {}, maxRevisions: 1 }), trace: TRACE, directorGateNotes: notes };
    const view = View.mapView(data, View.mapDraftOf(data));
    expect(view.leftOut.open).toBe(false);
    const trace = View.traceView(TRACE, 'journalist');
    expect(titles(stopPage('outline', data), true)).toEqual([view.leftOut.title, View.standingNotesView(notes).title, trace.title, ...trace.passes.map((pass) => pass.heading)]);
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
