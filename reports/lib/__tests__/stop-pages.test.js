/**
 * 4.12a: the pages the three decision stops show (phase 4, brief 4.12a; spec section 13).
 *
 * The story meeting, the map and the desk each show a page built from the console's view
 * models (console/checkpoint-view-logic.js meetingView, mapView and deskView, with
 * console/article-desk-logic.js for the desk's pieces). lib/stop-pages.js turns each page into
 * lines: the e2e harness prints them in step mode, and the stops log counts the words the
 * director reads at a return over them. A line's text is the view models' own; its label (an
 * id, the page's own heading for a line) and anything the page folds away are not counted.
 *
 * Each payload here is the server's own builder's (lib/meeting.js meetingCheckpointData,
 * lib/map.js mapCheckpointData, and for the desk the keys server.js getCheckpointData sends),
 * on the shared fixture's invented session.
 */
const View = require('../../console/checkpoint-view-logic');
const Desk = require('../../console/article-desk-logic');
const { wordCount } = require('../word-count');
const { meetingCheckpointData } = require('../meeting');
const { mapCheckpointData } = require('../map');
const { factCheckContentBundle } = require('../content-bundle-fact-check');
const { reworkFixtureState } = require('./fixtures/rework-state');
const { PAGE_STOPS, stopPage, wordsShown } = require('../stop-pages');

const clone = (v) => JSON.parse(JSON.stringify(v));

/** The texts of a page's lines, unfolded or folded. */
const textsOf = (page, folded = false) => page.lines.filter((line) => line.folded === folded && line.text).map((line) => line.text);

/** Whether `expected` appears in `texts` in order, each after the one before it. */
function inOrder(texts, expected) {
  let at = 0;
  for (const text of expected) {
    const found = texts.indexOf(text, at);
    if (found === -1) return `"${text}" is missing, or out of order`;
    at = found + 1;
  }
  return 'in order';
}

/** The words the page shows: lib/word-count.js's count of every unfolded line's text. */
const countOf = (page) => page.lines.filter((line) => !line.folded).reduce((sum, line) => sum + wordCount(line.text), 0);

const INDEX = { ale003: { name: 'ALE003 - The sale', owner: 'Alex Reeves', type: 'memory', firstLine: 'Marcus brags.' } };

/** The story meeting's payload, as the server sends it for a thread paused at the meeting. */
function meetingData(extra = {}) {
  const state = { ...reworkFixtureState('journalist'), meetingApproved: null };
  return { type: 'arc-selection', ...meetingCheckpointData(state, { evidenceIndex: INDEX, maxRevisions: 1 }), ...extra };
}

/** The map's payload, as the server sends it for a thread paused at the map. */
function mapData(extra = {}) {
  const state = reworkFixtureState('journalist');
  return {
    type: 'outline',
    ...mapCheckpointData(state, { keptPhotos: ['hero.jpg', 'p2.jpg'], evidenceIndex: INDEX, maxRevisions: 1 }),
    trace: [],
    ...extra
  };
}

const paragraph = (text) => ({ type: 'paragraph', text });
const MEMORY = 'Vic said the chair was mine once Marcus was gone. I kept my glass full and said nothing.';
const EVIDENCE = { exposed: { tokens: [{ id: 'vic001', owner: 'Vic Kingsley', fullContent: MEMORY }], paperEvidence: [] } };
const LEDE = 'Alex Reeves asked for the scoreboard with two minutes left in the morning.';
const DASHED = 'The room weighed the fake demo—and then it weighed Alex.';
const CLOSE = 'Whether the verdict costs Alex anything is a question for the people with money.';

/** The article as the desk opens it: an em-dash in a paragraph, a card that is not verbatim. */
function article() {
  return {
    headline: { main: 'The Room Named Alex, Five Votes to Four', deck: 'Nine players and one verdict.' },
    byline: { author: 'Nova', title: 'Independent Reporter' },
    heroImage: { filename: 'huddle.jpg', caption: 'The six in the huddle.' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph(LEDE)] },
      {
        id: 'theStory', type: 'narrative', heading: 'The Story: Eight Minutes',
        content: [
          paragraph(DASHED),
          { type: 'evidence-card', tokenId: 'vic001', headline: 'The Offer', content: 'Vic told me the job was already handed out.', significance: 'critical' },
          { type: 'photo', filename: 'huddle.jpg', caption: 'Mel lays out the theory.' }
        ]
      },
      { id: 'closing', type: 'conclusion', heading: 'Closing', content: [paragraph(CLOSE)] }
    ],
    evidenceCards: [{ tokenId: 'vic001', headline: 'The offer', summary: 'Vic, in his own memory.', significance: 'critical' }]
  };
}

/** The desk's payload: the keys server.js getCheckpointData sends at the article stop. */
function deskData(bundle = article(), extra = {}) {
  return {
    type: 'article',
    contentBundle: bundle,
    factCheck: factCheckContentBundle({
      contentBundle: bundle, evidenceBundle: EVIDENCE, roster: ['Alex', 'Mel', 'Sam'], sessionPhotos: ['/p/huddle.jpg'],
      reportingMode: 'on-site', theme: 'journalist'
    }),
    lastEvaluation: { phase: 'article', ready: true, overallScore: 0.93, structuralIssues: [], advisoryWarnings: [] },
    handEditReport: null,
    directorGateNotes: [],
    settledStory: { story: 'The room named Alex, and the money had already moved.', question: 'Will the verdict cost Alex anything?' },
    trace: [],
    writerTrackerPrints: false,
    revisionCount: 0,
    humanRevisionCount: 0,
    maxRevisions: 2,
    ...extra
  };
}

describe('4.12a: the pages the decision stops show (lib/stop-pages.js)', () => {
  it('pages the story meeting, the map and the desk, and no other stop', () => {
    expect(PAGE_STOPS).toEqual(['arc-selection', 'outline', 'article']);
    ['input-review', 'paper-evidence-selection', 'await-roster', 'await-full-context', 'pre-curation',
      'evidence-and-photos', 'photos', 'character-ids', 'no-such-stop'].forEach((stop) => {
      expect([stop, stopPage(stop, {})]).toEqual([stop, null]);
      expect([stop, wordsShown(stop, {})]).toEqual([stop, null]);
    });
  });

  it('counts the words of every line the page does not fold, by lib/word-count.js, at each stop', () => {
    [['arc-selection', meetingData()], ['outline', mapData()], ['article', deskData()]].forEach(([stop, data]) => {
      const page = stopPage(stop, data);
      expect(page.stop).toBe(stop);
      expect(wordsShown(stop, data)).toBe(countOf(page));
      expect(wordsShown(stop, data)).toBeGreaterThan(0);
    });
  });

  it('fails loud on a decision stop whose payload holds nothing to page', () => {
    expect(() => stopPage('arc-selection', { type: 'arc-selection' })).toThrow(/story meeting.*weave/);
    expect(() => stopPage('outline', { type: 'outline' })).toThrow(/map/);
    expect(() => stopPage('article', { type: 'article' })).toThrow(/desk.*article/);
  });
});

describe('4.12a: the story meeting\'s page is meetingView\'s', () => {
  it('shows the weave in the spec\'s order: the verdict, the story, the question, the headline, from your notes, the threads, the connections and the convergence, the questions', () => {
    const data = meetingData();
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const page = stopPage('arc-selection', data);
    const t = (i) => view.threads[i];
    expect(inOrder(textsOf(page), [
      view.verdict.who, view.verdict.charge,
      view.story.text, view.question.text, view.headline.text,
      view.fromYourNotes.text,
      `${t(0).roleLabel} · ${t(0).claim}`, t(0).receipt.label,
      `${t(1).roleLabel} · ${t(1).claim}`, t(1).receipt.label,
      `${t(4).roleLabel} · ${t(4).claim}`, t(4).receipt.label, t(4).reason,
      `${view.connections[0].kindLabel} · ${view.connections[0].detail}`,
      `${view.connections[1].kindLabel} · ${view.connections[1].detail}`,
      view.convergence.text,
      `${view.questions[0].about}: ${view.questions[0].question}`, view.questions[0].changes
    ])).toBe('in order');
    // A receipt is named through the stop's evidence index, as the meeting names it.
    expect(textsOf(page)).toContain('ALE003 - The sale (Alex Reeves)');
  });

  it('labels each thread and connection with its id, which is not counted', () => {
    const data = meetingData();
    const page = stopPage('arc-selection', data);
    const lineOf = (text) => page.lines.find((line) => line.text === text);
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    expect(lineOf(`${view.threads[0].roleLabel} · ${view.threads[0].claim}`).label).toMatch(/^t1\b/);
    expect(lineOf(`${view.connections[0].kindLabel} · ${view.connections[0].detail}`).label).toMatch(/^c1\b/);
    const renamed = meetingData();
    renamed.weave = clone(renamed.weave);
    renamed.weave.threads[0].id = 'thread-with-a-much-longer-id';
    expect(wordsShown('arc-selection', renamed)).toBe(wordsShown('arc-selection', data));
  });

  it('puts a concern and a mark right after the line they sit beside', () => {
    const data = meetingData({
      concerns: [{ text: "Director's edit E1: T1: the story names a motive the record does not give.", places: [{ path: 'story' }] }],
      marks: { round: 'reweave', marks: [{ path: 'threads[#t2].claim', before: 'The old claim.', after: 'Marcus bragged about the BizAI sale the night he died.', where: 'thread "t2", claim' }] }
    });
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const texts = textsOf(stopPage('arc-selection', data));
    const story = texts.indexOf(view.story.text);
    expect(texts[story + 1]).toBe(view.story.concerns[0]);
    const thread = texts.indexOf(`${view.threads[1].roleLabel} · ${view.threads[1].claim}`);
    expect(texts.slice(thread, thread + 4)).toContain(view.threads[1].marks[0]);
    // The round's banner sits above the page, where the meeting shows what changed since the director last looked.
    expect(texts.indexOf(view.marked)).toBeLessThan(texts.indexOf(view.verdict.who));
  });

  it('folds the standing notes, and a folded line is not counted', () => {
    const plain = meetingData();
    const noted = meetingData({ directorGateNotes: [{ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Keep the ledger thread close to the vote.' }] });
    const page = stopPage('arc-selection', noted);
    expect(textsOf(page, true)).toContain('Keep the ledger thread close to the vote.');
    expect(textsOf(page)).not.toContain('Keep the ledger thread close to the vote.');
    expect(wordsShown('arc-selection', noted)).toBe(wordsShown('arc-selection', plain));
  });

  it('shows a struck connection struck, still on the page', () => {
    const data = meetingData();
    data.weave = clone(data.weave);
    data.weave.connections[1].struck = true;
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const line = stopPage('arc-selection', data).lines.find((l) => l.text === `${view.connections[1].kindLabel} · ${view.connections[1].detail}`);
    expect(line.tone).toBe('struck');
    expect(line.folded).toBe(false);
  });
});

describe('4.12a: the map\'s page is mapView\'s', () => {
  it('shows the settled story, the headline and deck, each section\'s job and beats under its slot\'s label, what was dropped, and the counts', () => {
    const data = mapData();
    const view = View.mapView(data, View.mapDraftOf(data));
    const page = stopPage('outline', data);
    const section = view.sections[1];
    expect(inOrder(textsOf(page), [
      view.settledStory.story, view.settledStory.question,
      view.headline.text, view.deck.text,
      view.sections[0].job, view.sections[0].beats[0].materialText,
      section.heading, section.job, section.beats[0].materialText, section.beats[0].players,
      view.dropped[0].reason,
      view.tally.everyone, view.tally.cards, view.tally.photos, view.tally.length
    ])).toBe('in order');
    expect(page.lines.find((line) => line.tone === 'title' && line.label === section.label)).toBeTruthy();
  });

  it('folds left out unless a concern opens it, and folds the trace and the standing notes', () => {
    const data = mapData({
      trace: [{ pass: 1, round: 1, trigger: 'check', findings: { structuralIssues: ['A beat names no document.'] }, at: null, diff: null, changedScopes: ['sections'] }],
      directorGateNotes: [{ gate: 'outline', kind: 'approval', round: 1, text: 'Keep the money beats together.' }]
    });
    const view = View.mapView(data, View.mapDraftOf(data));
    expect(view.leftOut.open).toBe(false);
    const page = stopPage('outline', data);
    expect(textsOf(page, true)).toEqual(expect.arrayContaining([
      view.leftOut.items[0].materialText, 'A beat names no document.', 'Keep the money beats together.'
    ]));
    expect(textsOf(page)).not.toContain(view.leftOut.items[0].materialText);
    expect(wordsShown('outline', data)).toBe(wordsShown('outline', mapData()));
  });
});

describe('4.12a: the desk\'s page is deskView\'s, with the article as it will print', () => {
  it('shows the echo, then every piece the article prints in reading order, each mark beside its piece', () => {
    const data = deskData();
    const view = View.deskView(data, data.contentBundle);
    const page = stopPage('article', data);
    expect(inOrder(textsOf(page), [
      view.echo.story, view.echo.question,
      'The Room Named Alex, Five Votes to Four', 'The six in the huddle.', LEDE,
      'The Story: Eight Minutes', DASHED, 'The Offer', 'Mel lays out the theory.', CLOSE, 'Vic, in his own memory.'
    ])).toBe('in order');
    // Each piece's lines carry its key (deskAnchorKey), and the marks deskMarksAt gives it sit
    // right after the piece's own lines, with nothing between.
    const places = Desk.printedPlaces(data.contentBundle);
    const marked = places.filter((piece) => View.deskMarksAt(view.marks, piece.anchor).length > 0);
    expect(marked.length).toBeGreaterThan(0);
    marked.forEach((piece) => {
      const key = View.deskAnchorKey(piece.anchor);
      const lines = page.lines.filter((line) => line.piece === key);
      expect([key, lines.filter((line) => line.beside).map((line) => line.text)])
        .toEqual([key, View.deskMarksAt(view.marks, piece.anchor).map((mark) => mark.text)]);
      const first = page.lines.indexOf(lines[0]);
      expect(page.lines.slice(first, first + lines.length)).toEqual(lines);
      expect(lines.findIndex((line) => line.beside)).toBe(lines.filter((line) => !line.beside).length);
    });
  });

  it('lists the desk\'s problems, which the console would refuse, and the marks beside no piece', () => {
    const bundle = article();
    bundle.sections[0].content.push(paragraph(' '));
    const data = deskData(bundle);
    const view = View.deskView(data, data.contentBundle);
    const texts = textsOf(stopPage('article', data));
    Desk.deskProblems(bundle).forEach((problem) => expect(texts).toContain(problem.message));
    expect(view.apart.items.length).toBeGreaterThan(0);
    view.apart.items.forEach((mark) => expect(texts).toContain(mark.text));
  });

  it('shows no score, and folds the fact check\'s list, the trace and the round\'s record below the article', () => {
    const data = deskData(article(), {
      lastEvaluation: { phase: 'article', ready: false, escalatedToHuman: true, overallScore: 0.41, structuralIssues: [], advisoryWarnings: [] },
      trace: [{ pass: 1, round: 1, trigger: 'evaluation', findings: { structuralIssues: ['T1: a fixed line.'] }, at: null, diff: null, changedScopes: ['headline'] }]
    });
    const page = stopPage('article', data);
    const all = page.lines.map((line) => `${line.label} ${line.text}`).join('\n');
    expect(all).not.toMatch(/\b0\.41\b|\bscores?\b/i);
    const folded = textsOf(page, true);
    expect(folded).toContain('T1: a fixed line.');
    expect(page.lines.filter((line) => line.folded && line.tone === 'title').map((line) => line.label))
      .toEqual(expect.arrayContaining([View.deskView(data, data.contentBundle).folds.factCheck.title]));
    // What folds is not counted: the trace adds nothing to the words shown.
    expect(wordsShown('article', data)).toBe(wordsShown('article', deskData(article(), { lastEvaluation: data.lastEvaluation })));
  });
});
