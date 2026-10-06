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
  // Task 4.12c: the input review and the character-IDs stop have a page too. Every other stop
  // renders its payload in its component with no view model, so it has none.
  it('pages the story meeting, the map and the desk, and no stop whose component renders no view model', () => {
    expect(PAGE_STOPS).toEqual(expect.arrayContaining(['arc-selection', 'outline', 'article']));
    ['paper-evidence-selection', 'await-roster', 'await-full-context', 'pre-curation',
      'evidence-and-photos', 'photos', 'no-such-stop'].forEach((stop) => {
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
  /** A thread's line as the page prints it: its role, its name and its line (phase 4b, brief 1B). */
  const threadLine = (t) => `${t.roleLabel} · ${t.name}: ${t.line}`;

  it('shows the weave in the spec\'s order: the verdict, the story, the question, the headline, from your notes, the threads, the left-out threads by name, the connections and the convergence, the questions', () => {
    const data = meetingData();
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const page = stopPage('arc-selection', data);
    const t = (i) => view.threads[i];
    expect(inOrder(textsOf(page), [
      view.verdict.who, view.verdict.charge,
      view.story.text, view.question.text, view.headline.text,
      view.fromYourNotes.text,
      threadLine(t(0)), threadLine(t(1)), threadLine(t(2)), threadLine(t(3)),
      view.leftOut.names,
      view.connections[0].line,
      view.connections[1].line,
      view.convergence.text,
      `${view.questions[0].about}: ${view.questions[0].question}`, view.questions[0].changes
    ])).toBe('in order');
    expect(view.leftOut.names).toBe('The letter');
  });

  // Phase 4b (brief 1B; spec 9): the evidence under each line, and the left-out threads'
  // reasons, are folded, so the stops log does not count them.
  it('folds the evidence under each thread and connection, and the left-out threads\' reasons, by the view\'s titles', () => {
    const data = meetingData();
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const page = stopPage('arc-selection', data);
    const folded = textsOf(page, true);
    view.threads.concat(view.connections).forEach((line) => line.evidence.forEach((piece) => expect(folded).toContain(piece.text)));
    expect(folded).toContain('ALE003 - The sale (Alex Reeves): Marcus on the sale: "Worth it. Finally worth it."');
    expect(folded).toContain(view.leftOut.threads[0].reason);
    expect(textsOf(page)).not.toContain(view.leftOut.threads[0].reason);
    const foldedTitles = page.lines.filter((line) => line.tone === 'title' && line.folded).map((line) => line.label);
    expect(foldedTitles).toEqual([
      ...view.threads.map(() => view.evidenceTitle), view.leftOut.reasonsTitle, ...view.connections.map(() => view.evidenceTitle)
    ]);
    // The folds count for nothing: a page with more evidence under its lines shows as many words.
    const more = meetingData();
    more.weave = clone(more.weave);
    more.weave.threads[1].evidence.push({ sources: ['ledger'], shows: 'The sale on the ledger, with every figure that matters in it.', stance: 'cuts-against' });
    expect(wordsShown('arc-selection', more)).toBe(wordsShown('arc-selection', data));
  });

  // Review focus 1: a thread the director adds carries no evidence, and its fold says the map
  // writer finds it, folded as the rest of the evidence is. The page the harness prints is a
  // stop's, whose weave holds a thread the director added at an earlier look and whose payload
  // names it (`addedThreads`; fix round, fix 2).
  it('folds the line that a thread the director added, with no evidence yet, gets it from the map writer', () => {
    const data = meetingData();
    const draft = View.addMeetingThread(View.meetingDraftOf(data), 'The second ledger', 'Riley kept a second ledger.', 'grounds-it');
    const view = View.meetingView(data, draft, '');
    const added = view.threads.find((t) => t.id === 't6');
    expect(added.noEvidence).toBe(View.MEETING_NO_EVIDENCE_LINE);
    expect(stopPage('arc-selection', { ...data, weave: draft, addedThreads: ['t6'] }).lines.find((line) => line.text === View.MEETING_NO_EVIDENCE_LINE))
      .toMatchObject({ folded: true });
    expect(stopPage('arc-selection', { ...data, weave: draft }).lines.find((line) => line.text === View.MEETING_NO_EVIDENCE_LINE)).toBeUndefined();
  });

  // Spec 9: the tags leave the page. A thread carries its verdict as a label, and a connection
  // prints the names of the threads it joins above its line, as ArcSelection.js does (its
  // `label`; fix round 3); no line or label names an element by its id.
  it('labels no line with an id: the verdict\'s thread by its label, a connection by the names of the threads it joins', () => {
    const data = meetingData();
    const page = stopPage('arc-selection', data);
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const lineOf = (text) => page.lines.find((line) => line.text === text);
    expect(lineOf(threadLine(view.threads[0])).label).toBe("The room's verdict");
    const joins = page.lines.findIndex((line) => line.text === 'Joins "The overdose vote" and "The envelope"');
    expect(page.lines[joins]).toMatchObject({ tone: 'text', label: '', folded: false });
    expect(page.lines[joins + 1]).toMatchObject({ text: view.connections[0].line, label: '' });
    expect(page.lines.filter((line) => /\b[tcq]\d+\b/.test(`${line.label} ${line.text}`)).map((line) => line.label || line.text)).toEqual([]);
    // A thread renamed everywhere the weave names it, its connections' joins too (whose names the
    // page prints), shows as many words.
    const renamed = meetingData();
    renamed.weave = clone(renamed.weave);
    const old = renamed.weave.threads[0].id;
    renamed.weave.threads[0].id = 'thread-with-a-much-longer-id';
    renamed.weave.connections.forEach((connection) => {
      connection.joins = connection.joins.map((id) => (id === old ? 'thread-with-a-much-longer-id' : id));
    });
    if (renamed.weave.strongerMainThread && renamed.weave.strongerMainThread.thread === old) renamed.weave.strongerMainThread.thread = 'thread-with-a-much-longer-id';
    expect(wordsShown('arc-selection', renamed)).toBe(wordsShown('arc-selection', data));
  });

  // Fix round 3: the names of the threads a connection joins are words the director reads on the
  // page, so the meeting's count holds them, as it holds every line the page does not fold.
  it("counts the names of the threads each connection joins among the words the meeting shows", () => {
    const data = meetingData();
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const joined = view.connections.map((connection) => connection.label).filter(Boolean);
    expect(joined.length).toBeGreaterThan(0);
    const unjoined = meetingData();
    unjoined.weave = clone(unjoined.weave);
    unjoined.weave.connections.forEach((connection) => { connection.joins = []; });
    expect(wordsShown('arc-selection', data) - wordsShown('arc-selection', unjoined))
      .toBe(joined.reduce((sum, label) => sum + wordCount(label), 0));
  });

  it('puts a check still failing, a concern and a mark right after the line they sit beside', () => {
    const data = meetingData({
      checkFailures: [{ type: 'story-terms', message: 'The thread "The sale": its line holds the clock time "9:58".', place: 'threads[#t2]' }],
      concerns: [{ text: "Director's edit E1: T1: the story names a motive the record does not give.", places: [{ path: 'story' }] }],
      marks: { round: 'reweave', marks: [{ path: 'threads[#t2].line', before: 'The old line.', after: 'Marcus bragged about the BizAI sale the night he died.', where: 'thread "t2", line' }] }
    });
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const texts = textsOf(stopPage('arc-selection', data));
    const story = texts.indexOf(view.story.text);
    expect(texts[story + 1]).toBe(view.story.concerns[0]);
    const thread = texts.indexOf(threadLine(view.threads[1]));
    expect(texts.slice(thread + 1, thread + 3)).toEqual([view.threads[1].failures[0], view.threads[1].marks[0]]);
    expect(view.threads[1].failures).toEqual(['Check still failing: The thread "The sale": its line holds the clock time "9:58".']);
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
    const line = stopPage('arc-selection', data).lines.find((l) => l.text === view.connections[1].line);
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
      view.sections[0].job, view.sections[0].beats[0].move,
      section.heading, section.job, `${section.beats[0].move} ${View.MAP_CARD_MARK}`, section.beats[0].players,
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
      view.leftOut.items[0].move, 'A beat names no document.', 'Keep the money beats together.'
    ]));
    expect(textsOf(page)).not.toContain(view.leftOut.items[0].move);
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
    // Brief 4.10e: the trace's must-fix line reads past its rule ids, as traceView gives it.
    expect(folded).toContain('A fixed line.');
    expect(page.lines.filter((line) => line.folded && line.tone === 'title').map((line) => line.label))
      .toEqual(expect.arrayContaining([View.deskView(data, data.contentBundle).folds.factCheck.title]));
    // What folds is not counted: the trace adds nothing to the words shown.
    expect(wordsShown('article', data)).toBe(wordsShown('article', deskData(article(), { lastEvaluation: data.lastEvaluation })));
  });
});

// ── Task 4.12c ──────────────────────────────────────────────────────────────
// The readout counts the words at every return, not only at the three decision stops (ruling 4
// on 4.12a's minors; spec section 13). So the input review and the character-IDs stop have a
// page too, built from the view models their components render, and the desk's folded record
// and money tracker print as the desk prints them.

const fs = require('fs');
const path = require('path');
const InputLogic = require('../../console/input-review-logic');

/** console/utils.js's truncate, the cut a character-IDs card shows its texts at, read from the console's source. */
const consoleTruncate = (() => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'console', 'utils.js'), 'utf8');
  const fn = src.match(/function truncate\(str, maxLen = 80\) \{[\s\S]*?\n\}/);
  if (!fn) throw new Error('console/utils.js no longer defines truncate(str, maxLen = 80)');
  return new Function(`${fn[0]}\nreturn truncate;`)();
})();

/** The input review's payload: the keys server.js getCheckpointData sends, with the interrupt's. */
function inputReviewData(extra = {}) {
  return {
    type: 'input-review',
    sessionConfig: {
      sessionId: '100426',
      roster: ['Alex', 'Morgan', 'Riley'],
      rosterPronouns: { Alex: 'he/him', Morgan: 'she/her', Riley: 'they/them' },
      accusation: {
        accused: [], charge: 'Accidental overdose', verdictKind: 'overdose',
        notes: 'Deadlocked between Alex and Morgan, then six votes named an overdose.',
        votes: [{ option: 'Overdose', count: 6, adopted: true }, { option: 'Alex', count: 3 }]
      },
      exposures: [{ tokenId: 'ale003', exposer: 'Quinn', time: '08:10 PM', owner: 'Alex Reeves' }],
      exposedTokenCount: 1
    },
    directorNotes: {
      rawProse: 'Alex and Morgan argued at the bar. Riley watched the ledger all morning.',
      quotes: [{ speaker: 'Riley', text: 'I only kept the books', context: 'Riley watched the ledger all morning.', confidence: 'high' }],
      postInvestigationDevelopments: [{ detail: 'Following the investigation, Riley left town.' }],
      whiteboard: {
        ambiguities: ['A name under the coffee stain'],
        names: ['Alex', 'Morgan'],
        regions: [{ label: 'SUSPECTS', location: 'left', entries: ['Alex', 'Morgan'] }],
        connections: [{ from: 'Alex', to: 'Marcus', label: 'partner' }],
        notes: ['BizAI?'],
        structureType: 'columns'
      }
    },
    playerFocus: { primaryInvestigation: 'Who sold the company?' },
    enrichment: { quotes: 1, characterMentions: 0, transactionReferences: 0, fallback: null, warnings: {} },
    ledger: {
      clock: { decided: true, evening: true, firstTime: '07:50 PM' },
      adjustmentsParsed: true,
      adjustments: [{ kind: 'bonus', time: '07:55 PM', amount: 25000, toAccount: 'Melanie' }],
      accounts: [{ name: 'Melanie', total: 82500, tokenCount: 1 }],
      mismatches: [{ account: 'Melanie', computed: 100000, standings: 75000 }],
      unclassified: []
    },
    canonicalCharacters: { Alex: 'Alex Reeves', Morgan: 'Morgan Reed', Riley: 'Riley Torres' },
    ...extra
  };
}

const VISUAL = 'Six players crowd the bar under the red light while Alex leans over the ledger and Morgan points at one line of it.';
const DESCRIPTION = 'A tall man in a grey suit with a loosened tie, leaning on the bar beside the open ledger and reading it.';

/** The character-IDs stop's payload: the interrupt's analyses and roster, and getCheckpointData's photos and list. */
function characterIdsData(extra = {}) {
  return {
    type: 'character-ids',
    photoAnalyses: {
      analyses: [
        {
          filename: 'hero.jpg', visualContent: VISUAL, storyRelevance: 'critical', suggestedCaption: 'The ledger at the bar.',
          characterDescriptions: [{ role: 'CENTRAL', description: DESCRIPTION, physicalMarkers: 'grey suit, loosened tie' }]
        },
        { filename: 'p2.jpg', visualContent: 'Two players at the coat check.', characterDescriptions: [{ role: 'SUPPORTING', description: 'A woman in green.' }] }
      ]
    },
    sessionPhotos: ['/photos/hero.jpg', '/photos/p2.jpg'],
    roster: ['Alex', 'Morgan'],
    leftOutPhotos: ['p2.jpg'],
    ...extra
  };
}

describe('4.12c: the input review and the character-IDs stop have a page, so the log counts their words', () => {
  it('pages both, beside the three decision stops', () => {
    expect(PAGE_STOPS).toEqual(expect.arrayContaining(['input-review', 'character-ids']));
    [['input-review', inputReviewData()], ['character-ids', characterIdsData()]].forEach(([stop, data]) => {
      const page = stopPage(stop, data);
      expect([stop, page && page.stop]).toEqual([stop, stop]);
      expect(wordsShown(stop, data)).toBe(countOf(page));
      expect(wordsShown(stop, data)).toBeGreaterThan(0);
    });
  });

  it('pages a payload that holds nothing yet without throwing, as a stop reached early shows it', () => {
    expect(() => stopPage('input-review', { type: 'input-review' })).not.toThrow();
    expect(() => stopPage('character-ids', { type: 'character-ids' })).not.toThrow();
  });
});

describe('4.12c: the input review\'s page is the parse as its view models render it', () => {
  it('shows the verdict, the ledger and the whiteboard through the view models, in the component\'s order', () => {
    const data = inputReviewData();
    const accusation = View.accusationView(data.sessionConfig.accusation);
    const verdict = View.verdictView(data.sessionConfig.accusation);
    const votes = View.votesView(data.sessionConfig.accusation);
    const ledger = InputLogic.ledgerView(data.ledger);
    const board = View.whiteboardView(data.directorNotes.whiteboard);
    const page = stopPage('input-review', data);
    const shown = textsOf(page);
    expect(inOrder(shown, [verdict.label, accusation.charge, votes.line, accusation.notes, ledger.clockLine, ...ledger.warnings])).toBe('in order');
    const shownText = shown.join('\n');
    [board.ambiguities[0], ...board.names, ...board.regions[0].entries, board.regions[0].label, board.connections[0].to, board.notes[0], board.structureType]
      .forEach((text) => expect([text, shownText.includes(text)]).toEqual([text, true]));
    expect(shownText.indexOf(board.ambiguities[0])).toBeGreaterThan(shownText.indexOf(ledger.clockLine));
  });

  it('folds what the component folds: the accounts and adjustments, the exposed memories, the quote bank and the epilogue', () => {
    const data = inputReviewData();
    const ledger = InputLogic.ledgerView(data.ledger);
    const exposures = View.exposuresView(data.sessionConfig.exposures, data.sessionConfig.exposedTokenCount);
    const quote = InputLogic.quoteView(data.directorNotes.quotes[0]);
    const epilogue = InputLogic.epilogueItemView(data.directorNotes.postInvestigationDevelopments[0]);
    const page = stopPage('input-review', data);
    const folded = textsOf(page, true).join('\n');
    const shown = textsOf(page).join('\n');
    [ledger.accounts[0].total, ledger.adjustments[0], exposures.rows[0].exposer, quote.text, epilogue.detail].forEach((text) => {
      expect([text, folded.includes(text), shown.includes(text)]).toEqual([text, true, false]);
    });
    // A folded line is not counted: the quote bank adds nothing to the words shown.
    const noQuotes = inputReviewData();
    noQuotes.directorNotes = { ...noQuotes.directorNotes, quotes: [] };
    expect(wordsShown('input-review', noQuotes)).toBe(wordsShown('input-review', data));
  });

  it('counts the words the view models give, and the component\'s own wording as labels', () => {
    const data = inputReviewData();
    const named = inputReviewData();
    named.sessionConfig = { ...named.sessionConfig, accusation: { ...named.sessionConfig.accusation, accused: ['Alex'], verdictKind: 'culprit' } };
    // The accused, when the parse names one, is the parse's text; a verdict that names no one is the component's line.
    expect(textsOf(stopPage('input-review', named))).toContain('Alex');
    expect(textsOf(stopPage('input-review', data))).not.toContain('no one (the room named no culprit)');
    expect(stopPage('input-review', data).lines.some((line) => /no one/.test(line.label))).toBe(true);
  });
});

describe('4.12c: the character-IDs stop\'s page is characterIdCards\'', () => {
  it('shows each card under its photo\'s name, its texts cut where the card cuts them, the rest folded until the card opens', () => {
    const data = characterIdsData();
    const cards = View.characterIdCards(data.photoAnalyses.analyses, data.sessionPhotos, data.leftOutPhotos);
    const page = stopPage('character-ids', data);
    const titles = page.lines.filter((line) => line.tone === 'title').map((line) => line.label);
    expect(titles).toEqual(cards.map((card) => card.displayName));
    const shown = textsOf(page);
    const folded = textsOf(page, true);
    expect(VISUAL.length).toBeGreaterThan(100);
    expect(shown).toContain(consoleTruncate(VISUAL, 100));
    expect(shown).not.toContain(VISUAL);
    expect(folded).toContain(VISUAL);
    expect(shown).toContain(consoleTruncate(DESCRIPTION, 80));
    expect(folded).toEqual(expect.arrayContaining([DESCRIPTION, 'grey suit, loosened tie', 'The ledger at the bar.']));
    // A text short enough to show whole shows once, with nothing folded behind it.
    expect(shown).toContain('Two players at the coat check.');
    expect(folded).not.toContain('Two players at the coat check.');
  });

  it('marks a photo the server lists as left out, as its ticked box shows it, and counts no label', () => {
    const data = characterIdsData();
    const page = stopPage('character-ids', data);
    const p2 = page.lines.findIndex((line) => line.tone === 'title' && line.label === 'p2.jpg');
    const hero = page.lines.findIndex((line) => line.tone === 'title' && line.label === 'hero.jpg');
    const leftOut = (from, to) => page.lines.slice(from, to).some((line) => /left out/i.test(line.label) && !line.text);
    expect(leftOut(p2, page.lines.length)).toBe(true);
    expect(leftOut(hero, p2)).toBe(false);
    expect(wordsShown('character-ids', data)).toBe(wordsShown('character-ids', characterIdsData({ leftOutPhotos: [] })));
  });
});

describe('4.12c: the meeting\'s page shows what ArcSelection.js shows since the director last looked', () => {
  it('says the director\'s edits stand when no line shows a change to them (meetingView\'s kept), as the component does', () => {
    const data = meetingData({ handEditReport: { checked: ['E1'], changed: [] } });
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    expect(view.kept).toBe('Your edit stands.');
    const texts = textsOf(stopPage('arc-selection', data));
    expect(texts).toContain(view.kept);
    expect(texts.indexOf(view.kept)).toBeLessThan(texts.indexOf(view.verdict.who));
  });

  it('heads the edits a rework changed in the component\'s words', () => {
    const changed = {
      id: 'E1', scope: 'story', where: 'the story', cut: false, director: 'Riley kept the books.', became: 'Riley kept two sets of books.',
      pass: 'send-back', automatic: false, reason: 'The note asked for the second ledger.'
    };
    const data = meetingData({ handEditReport: { checked: ['E1'], changed: [changed] } });
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    expect(view.changedEdits).toHaveLength(1);
    const page = stopPage('arc-selection', data);
    const heading = page.lines.findIndex((line) => line.tone === 'title' && line.label === 'Your edits a rework changed');
    expect(heading).toBeGreaterThan(-1);
    expect(page.lines[heading + 1].text).toBe(view.changedEdits[0]);
  });
});

describe('4.12c: the desk\'s folded record and money tracker print as the desk prints them', () => {
  it('prints the folded record\'s line that the edits stand, as RevisionDiff prints it (steeringView\'s kept)', () => {
    const data = deskData(article(), { handEditReport: { checked: ['E1', 'E2'], changed: [] } });
    const kept = View.steeringView(data.handEditReport, []).kept;
    expect(kept).toBe('Both of your edits stand.');
    const page = stopPage('article', data);
    expect(textsOf(page, true)).toContain(kept);
    expect(page.lines.map((line) => `${line.label} ${line.text}`).join('\n')).not.toMatch(/kept all/);
  });

  it('prints the writer\'s money tracker only while writerTrackerPrints says the page prints it, under the desk\'s heading', () => {
    const bundle = article();
    bundle.financialTracker = { entries: [{ description: 'Melanie', amount: '$75,000' }], totalExposed: '$75,000' };
    const prints = stopPage('article', deskData(bundle, { writerTrackerPrints: true }));
    expect(prints.lines.filter((line) => line.tone === 'title').map((line) => line.label)).toContain('FINANCIAL TRACKER');
    expect(textsOf(prints)).toEqual(expect.arrayContaining(['Melanie $75,000', '$75,000']));
    [false, undefined].forEach((flag) => {
      const page = stopPage('article', deskData(bundle, { writerTrackerPrints: flag }));
      expect([flag, page.lines.some((line) => line.label === 'FINANCIAL TRACKER'), textsOf(page).includes('Melanie $75,000')]).toEqual([flag, false, false]);
    });
  });
});

// ── Task 4.12d ──────────────────────────────────────────────────────────────
// The review of 4.12c (minor 6): the module kept two lists of the stops with a page, PAGE_STOPS,
// which the harness prints by, and PAGES' keys, which wordsShown counts by, and nothing held them
// equal. A page added to one alone would be counted and never printed.
describe('4.12d: one list of the stops with a page, PAGE_STOPS, derived from PAGES', () => {
  const { CHECKPOINT_ORDER } = require('../../console/session-start-logic');

  it('is the five stops with a page, in the order a run reaches them, and frozen', () => {
    expect(PAGE_STOPS).toEqual(['input-review', 'arc-selection', 'character-ids', 'outline', 'article']);
    expect(CHECKPOINT_ORDER.filter((stop) => PAGE_STOPS.includes(stop))).toEqual(PAGE_STOPS);
    expect(Object.isFrozen(PAGE_STOPS)).toBe(true);
  });

  it('is the keys of PAGES, so a stop is in it exactly when it has a page', () => {
    const src = fs.readFileSync(require.resolve('../stop-pages'), 'utf8');
    expect(src).toMatch(/const PAGE_STOPS = Object\.freeze\(Object\.keys\(PAGES\)\);/);
    const payloads = {
      'input-review': inputReviewData(), 'arc-selection': meetingData(), 'character-ids': characterIdsData(), outline: mapData(), article: deskData()
    };
    [...CHECKPOINT_ORDER, 'no-such-stop'].forEach((stop) => {
      expect([stop, stopPage(stop, payloads[stop] || { type: stop }) !== null]).toEqual([stop, PAGE_STOPS.includes(stop)]);
    });
  });
});

// The ruling on 4.12c's minor 2: the input review's page counts the brief's six view models plus
// votesView, whiteboardView, enrichmentWarningLines and wordTail, and not the director's own notes,
// which are their words, not something the pipeline asks them to read. A whiteboard entry that is
// not text prints as the component prints it, in safeStringify's indented JSON.
describe('4.12d: the input review\'s page counts what the ruling counts', () => {
  const { NOTES_RECEIPT_LABEL } = require('../stop-pages');
  const { consoleSafeStringify } = require('./fixtures/component-source');
  const TEN = [
    'accusationView', 'verdictView', 'votesView', 'exposuresView', 'whiteboardView', 'wordTail',
    'ledgerView', 'quoteView', 'epilogueItemView', 'enrichmentWarningLines'
  ];
  const NOTES = `${'Alex and Morgan argued at the bar while Riley watched the ledger. '.repeat(5)}Then six votes said overdose.`;

  it('shows the notes receipt and the enricher\'s warnings, and counts them, and not the director\'s own notes', () => {
    const warnings = { droppedQuotes: 3, unrecordedSpeakers: 1, droppedEpilogueItems: 2 };
    const data = inputReviewData({
      directorNotes: { ...inputReviewData().directorNotes, rawProse: NOTES },
      enrichment: { quotes: 1, characterMentions: 0, transactionReferences: 0, fallback: null, warnings }
    });
    const receipt = View.wordTail(NOTES);
    const receiptText = `${receipt.words} words, ends with “…${receipt.tail}”`;
    const lines = InputLogic.enrichmentWarningLines(warnings);
    expect(lines).toHaveLength(2);
    const page = stopPage('input-review', data);
    const shown = textsOf(page);
    expect(shown).toContain(receiptText);
    expect(page.lines.find((line) => line.text === receiptText).label).toBe(NOTES_RECEIPT_LABEL);
    lines.forEach((line) => expect(shown).toContain(line));
    expect(page.lines.map((line) => `${line.label} ${line.text}`).join('\n')).not.toContain(NOTES);

    // The words are the receipt's and the warnings', whatever the notes' own length.
    const bare = inputReviewData({ directorNotes: { ...inputReviewData().directorNotes, rawProse: '' }, enrichment: null });
    const added = [receiptText, ...lines].reduce((sum, text) => sum + wordCount(text), 0);
    expect(wordsShown('input-review', data)).toBe(wordsShown('input-review', bare) + added);
    const longer = inputReviewData({
      directorNotes: { ...inputReviewData().directorNotes, rawProse: `${'The director wrote far more than the receipt shows. '.repeat(40)}${NOTES}` },
      enrichment: data.enrichment
    });
    expect(wordsShown('input-review', longer)).toBe(wordsShown('input-review', data));
  });

  it('prints a whiteboard entry that is not text as the console prints it: safeStringify\'s indented JSON', () => {
    const stringify = consoleSafeStringify();
    const unread = { text: 'A name under the coffee stain', where: 'top left' };
    const data = inputReviewData({
      directorNotes: {
        whiteboard: {
          ambiguities: [unread], names: ['Alex', { name: 'Riley?' }],
          regions: [{ label: 'SUSPECTS', location: 'left', entries: ['Alex', { name: 'Mel', crossedOut: true }] }],
          notes: [{ note: 'BizAI?' }]
        }
      }
    });
    const texts = stopPage('input-review', data).lines.map((line) => line.text);
    [
      stringify(unread),
      `Alex, ${stringify({ name: 'Riley?' })}`,
      // Task 4.12e: the region's heading in the component's quotation marks.
      `“SUSPECTS” (left): Alex, ${stringify({ name: 'Mel', crossedOut: true })}`,
      stringify({ note: 'BizAI?' })
    ].forEach((text) => expect([text, texts.includes(text)]).toEqual([text, true]));
    expect(stringify(unread)).toContain('\n  "where": "top left"');
  });

  it('reads the ten view models and no other, and its module doc says so, and that the director\'s own notes are not counted', () => {
    const src = fs.readFileSync(require.resolve('../stop-pages'), 'utf8');
    const section = src.slice(src.indexOf('// ── The input review'), src.indexOf('// ── The character-IDs stop'));
    const read = new Set([...section.matchAll(/\b(?:View|InputLogic)\.(\w+)\b/g)].map((match) => match[1]));
    expect([...read].sort()).toEqual([...TEN].sort());
    // The module doc as prose: its comment's line prefixes and line breaks read as spaces.
    const doc = src.slice(0, src.indexOf("'use strict'")).replace(/\n \*/g, ' ').replace(/\s+/g, ' ');
    const bullet = doc.slice(doc.indexOf('- the input review'), doc.indexOf('- the character-IDs stop'));
    TEN.forEach((name) => expect([name, bullet.includes(name)]).toEqual([name, true]));
    expect(bullet).toMatch(/ten view models/);
    expect(bullet).toMatch(/director's own notes[^.]*director's words[^.]*not counted/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14a: a connection that goes with a left-out thread says so on the page (the final review,
// ruling 1): the line meetingView gives it sits right after the connection, as ArcSelection.js
// shows it under the connection's words.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.14a: the story meeting\'s page says which connections go out with a left-out thread', () => {
  it('prints the line right after the connection it is about, and none once the thread is back in the story', () => {
    const data = meetingData();
    data.weave = clone(data.weave);
    data.weave.threads[2].role = 'left-out';
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    expect(view.connections[0].leftOut).toMatch(/^Out of the story with "The envelope"/);
    const lines = stopPage('arc-selection', data).lines;
    const at = lines.findIndex((line) => line.text === view.connections[0].line);
    expect(lines[at + 1]).toMatchObject({ text: view.connections[0].leftOut, folded: false });
    expect(textsOf(stopPage('arc-selection', meetingData()))).not.toContainEqual(expect.stringMatching(/^Out of the story/));
  });
});
