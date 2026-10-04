/**
 * 4.10: the desk's marks (phase 4, brief 4.10; spec 6.2 and 6.3).
 *
 * Nothing sits in front of the article. A fact the judge could not fix within its budget and a
 * code check's flag are marked beside the paragraph, card or photo they are about; a concern
 * about one of the director's edits, and an edit a rework changed, beside the edit. There is no
 * score and no note on the writing. A mark whose text the director's edit removed folds below as
 * possibly resolved; one with no block sits in one line beside the approve button.
 *
 * The view models live in console/checkpoint-view-logic.js and the pieces of the page they
 * anchor on in console/article-desk-logic.js; Article.js is their thin consumer (the console has
 * no DOM harness). Every finding here is the server's own: lib/content-bundle-fact-check.js run
 * on the fixture, and every hand-edit report lib/hand-edit-diff.js's. Invented text.
 */
const ViewLogic = require('../checkpoint-view-logic');
const Desk = require('../article-desk-logic');
const { factCheckContentBundle } = require('../../lib/content-bundle-fact-check');
const handEditDiff = require('../../lib/hand-edit-diff');
const { quotedPassages, normalizeForGrounding } = require('../../lib/grounding');

const { standingAfterSendBack, carriedEdits, reportAfterPass, settleEdits, SEND_BACK_PASS, REWEAVE_PASS, DIRECTOR_EDIT_PREFIX } = handEditDiff;
const { deskMarks, deskMarksAt, deskAnchorKey, deskView, deskEcho, changedEditsToShow, changedEditLine, traceView } = ViewLogic;

const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });
const photo = (filename, caption) => ({ type: 'photo', filename, caption });
const card = (tokenId, headline, content) => ({ type: 'evidence-card', tokenId, headline, content, significance: 'critical' });

const MEMORY = 'Vic said the chair was mine once Marcus was gone. I kept my glass full and said nothing.';
const EVIDENCE = { exposed: { tokens: [{ id: 'vic001', owner: 'Vic Kingsley', fullContent: MEMORY }], paperEvidence: [] } };
const PHOTOS = ['/p/huddle.jpg', '/p/theory.jpg'];

const LEDE = 'Alex Reeves asked for the scoreboard with two minutes left in the morning.';
const STORY_1 = 'Mel built the first theory around the fight in the bathroom.';
const DASHED = 'The room weighed the fake demo—and then it weighed Alex.';
const STORY_3 = 'By the second round nobody asked who held the account.';
const MONEY_1 = 'Thirteen sales landed in one account in the last two minutes of selling.';
const CLOSE_1 = 'Whether the verdict costs Alex anything is a question for the people with money.';
const NOT_VERBATIM = 'Vic told me the job was already handed out.';

/** The article as the stop opens it: an em-dash in a paragraph, a card that is not verbatim, a photo the session never took. */
const article = () => ({
  headline: { main: 'The Room Named Alex, Five Votes to Four', deck: 'Nine players, one verdict, and an account named after the first woman they blamed.' },
  byline: { author: 'Nova', title: 'Independent Reporter' },
  heroImage: { filename: 'huddle.jpg', caption: 'The six in the huddle.' },
  sections: [
    { id: 'lede', type: 'narrative', content: [paragraph(LEDE)] },
    {
      id: 'theStory', type: 'narrative', heading: 'The Story: Eight Minutes',
      content: [paragraph(STORY_1), paragraph(DASHED), card('vic001', 'The Offer', NOT_VERBATIM), photo('nope.jpg', 'Mel at the ledger.'), paragraph(STORY_3)]
    },
    { id: 'followTheMoney', type: 'evidence-highlight', heading: 'Follow the Money', content: [paragraph(MONEY_1), photo('theory.jpg', 'Mel lays out the theory.')] },
    { id: 'closing', type: 'conclusion', heading: 'Closing', content: [paragraph(CLOSE_1)] }
  ],
  evidenceCards: [{ tokenId: 'vic001', headline: 'The offer', summary: 'Vic, in his own memory.', significance: 'critical' }]
});

/** The fact check of a bundle, as evaluateArticle runs it (Sam is on the roster and never named). */
const factCheckOf = (bundle, extra = {}) => factCheckContentBundle({
  contentBundle: bundle, evidenceBundle: EVIDENCE, roster: ['Alex', 'Mel', 'Sam'], sessionPhotos: PHOTOS,
  reportingMode: 'on-site', theme: 'journalist', ...extra
});

/** The article stop's payload for a bundle (server.js getCheckpointData's keys the desk reads). */
function payloadFor(bundle, extra = {}) {
  return {
    contentBundle: bundle,
    factCheck: factCheckOf(bundle),
    lastEvaluation: { phase: 'article', ready: true, overallScore: 0.93, structuralIssues: [], advisoryWarnings: [] },
    handEditReport: null,
    directorGateNotes: [],
    settledStory: { story: 'The room named Alex, and the money had already moved.', question: 'Will the verdict cost Alex anything?' },
    trace: [],
    revisionCount: 0,
    humanRevisionCount: 0,
    maxRevisions: 2,
    ...extra
  };
}

/** Every mark beside a piece of the page, as [anchor key, tone, the text's opening words]. */
function placed(marks) {
  return Object.keys(marks.at).sort().flatMap((key) => marks.at[key].map((m) => [key, m.tone, m.text.slice(0, 25)]));
}

const block = (section, b) => ({ kind: 'block', section, block: b });
const at = (section, b) => deskAnchorKey(block(section, b));

// ═══════════════════════════════════════════════════════════════════════════
// The pieces of the page a mark can sit beside
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10: the pieces of the page a mark sits beside (article-desk-logic.js)', () => {
  test('each piece the desk renders, in reading order, with the text it prints', () => {
    const places = Desk.printedPlaces(article());
    expect(places.map((p) => deskAnchorKey(p.anchor))).toEqual([
      'headline', 'byline', 'hero',
      'heading:0', 'block:0:0',
      'heading:1', 'block:1:0', 'block:1:1', 'block:1:2', 'block:1:3', 'block:1:4',
      'heading:2', 'block:2:0', 'block:2:1',
      'heading:3', 'block:3:0',
      'sidebar:0'
    ]);
    const of = (key) => places.find((p) => deskAnchorKey(p.anchor) === key);
    expect(of('headline').texts).toEqual(['The Room Named Alex, Five Votes to Four', 'Nine players, one verdict, and an account named after the first woman they blamed.']);
    expect(of('block:1:2').texts).toEqual(['The Offer', NOT_VERBATIM]);
    expect(of('block:1:3').texts).toEqual(['Mel at the ledger.']);
    expect(of('sidebar:0').texts).toEqual(['The offer', 'Vic, in his own memory.']);
    expect(of('block:1:1').sectionKey).toBe('theStory');
  });

  test('a block the desk does not render (no type) and a hero with no photo are no pieces', () => {
    const bundle = article();
    bundle.sections[0].content.push({ text: 'No type.' });
    delete bundle.heroImage.filename;
    const keys = Desk.printedPlaces(bundle).map((p) => deskAnchorKey(p.anchor));
    expect(keys).not.toContain('block:0:1');
    expect(keys).not.toContain('hero');
    expect(Desk.printedPlaces(null)).toEqual([expect.objectContaining({ anchor: { kind: 'headline' } }), expect.objectContaining({ anchor: { kind: 'byline' } })]);
  });

  test("the text each block prints is the server's printed fields that hold words (lib/hand-edit-diff.js PRINTED_BLOCK_FIELDS)", () => {
    const NOT_WORDS = ['type', 'tokenId', 'filename', 'ordered'];
    const server = handEditDiff.PRINTED_BLOCK_FIELDS;
    expect(Object.keys(Desk.PRINTED_TEXT_FIELDS).sort()).toEqual(Object.keys(server).sort());
    Object.keys(server).forEach((type) => {
      expect([type, Desk.PRINTED_TEXT_FIELDS[type]]).toEqual([type, server[type].filter((f) => !NOT_WORDS.includes(f))]);
    });
    expect(Desk.printedTexts({ type: 'list', items: ['One', { text: 'Two' }, 3] })).toEqual(['One', 'Two']);
    expect(Desk.printedTexts({ type: 'callout', text: 'An unknown type prints as a paragraph.' })).toEqual(['An unknown type prints as a paragraph.']);
  });

  test("a section's nth paragraph, counting paragraph blocks from 1 as the fact check's findings count them", () => {
    const blocks = article().sections[1].content;
    expect([1, 2, 3, 4].map((n) => Desk.paragraphBlockIndex(blocks, n))).toEqual([0, 1, 4, -1]);
    expect(Desk.paragraphBlockIndex(null, 1)).toBe(-1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A finding on a paragraph, a card and a photo
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10: a finding on a paragraph, a card and a photo', () => {
  const data = payloadFor(article());
  const marks = deskMarks(data, data.contentBundle);

  test('each sits beside its block on the desk the stop opened', () => {
    expect(placed(marks)).toEqual([
      [at(1, 1), 'advisory', "Em-dash in the narrator's"],
      [at(1, 2), 'structural', 'Evidence card "vic001" (i'],
      [at(1, 3), 'structural', 'Invalid photo reference "']
    ]);
    expect(marks.resolved).toEqual([]);
  });

  test("each mark carries the fact check's whole message, its label and the place in words", () => {
    const [mark] = deskMarksAt(marks, block(1, 2));
    expect(mark.text).toBe(data.factCheck.structuralIssues.find((m) => m.startsWith('Evidence card')));
    expect(mark.label).toBe('Fact check');
    expect(mark.where).toBe('The Story: Eight Minutes, block 3');
    expect(deskMarksAt(marks, block(1, 1))[0].label).toBe('Fact check, advisory');
    expect(deskMarksAt(marks, block(0, 0))).toEqual([]);
  });

  test('a finding on the headline sits beside the headline, and one on the hero beside the hero', () => {
    const bundle = article();
    bundle.headline.deck = 'Nine players—one verdict.';
    bundle.heroImage.filename = 'not-ours.jpg';
    const d = payloadFor(bundle);
    const m = deskMarks(d, d.contentBundle);
    expect(deskMarksAt(m, { kind: 'headline' }).map((x) => x.tone)).toEqual(['advisory']);
    expect(deskMarksAt(m, { kind: 'hero' }).map((x) => x.text.slice(0, 25))).toEqual(['Invalid photo reference "']);
  });

  test('a card in the sidebar sits beside its sidebar entry', () => {
    const bundle = article();
    bundle.evidenceCards.push({ tokenId: 'nope999', headline: 'A card no document backs', summary: 'Nothing.' });
    const d = payloadFor(bundle);
    expect(deskMarksAt(deskMarks(d, d.contentBundle), { kind: 'sidebar', index: 1 }).map((x) => x.tone)).toEqual(['structural']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A block moved above a finding, and an edited block anchored by excerpt
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10: the ordinal holds while nothing at or before it changed; otherwise the excerpt anchors', () => {
  const data = payloadFor(article());

  test('a block the director moved above the finding: the paragraph mark follows its text, the card and photo their identity', () => {
    const desk = Desk.moveBlock(data.contentBundle, { section: 1, block: 4 }, { section: 1, block: 0 });
    expect(Desk.untouchedThrough(Desk.deskChanges(data.contentBundle, desk), 'theStory', 1)).toBe(false);
    expect(placed(deskMarks(data, desk))).toEqual([
      [at(1, 2), 'advisory', "Em-dash in the narrator's"],
      [at(1, 3), 'structural', 'Evidence card "vic001" (i'],
      [at(1, 4), 'structural', 'Invalid photo reference "']
    ]);
  });

  test('a paragraph inserted after the finding leaves its ordinal standing', () => {
    const desk = Desk.insertBlock(data.contentBundle, 1, 5, 'paragraph');
    expect(Desk.untouchedThrough(Desk.deskChanges(data.contentBundle, desk), 'theStory', 1)).toBe(true);
    expect(deskMarksAt(deskMarks(data, desk), block(1, 1)).map((m) => m.tone)).toEqual(['advisory']);
  });

  test('an edited block before the finding: the mark finds the paragraph by its excerpt', () => {
    const desk = Desk.setBlock(data.contentBundle, 1, 0, paragraph('Mel built the first theory around a fight.'));
    expect(Desk.untouchedThrough(Desk.deskChanges(data.contentBundle, desk), 'theStory', 1)).toBe(false);
    expect(deskMarksAt(deskMarks(data, desk), block(1, 1)).map((m) => m.tone)).toEqual(['advisory']);
  });

  test('the flagged paragraph edited with its excerpt kept: the mark stays beside it', () => {
    const desk = Desk.setBlock(data.contentBundle, 1, 1, paragraph(`${DASHED} Then the room voted.`));
    expect(deskMarksAt(deskMarks(data, desk), block(1, 1)).map((m) => m.tone)).toEqual(['advisory']);
  });

  test('a paragraph moved to another section: the excerpt finds it there', () => {
    const desk = Desk.moveToSection(data.contentBundle, { section: 1, block: 1 }, 3);
    expect(deskMarksAt(deskMarks(data, desk), block(3, 1)).map((m) => m.tone)).toEqual(['advisory']);
  });

  test('a card the director moved, unchanged, takes its mark along', () => {
    const desk = Desk.moveToSection(data.contentBundle, { section: 1, block: 2 }, 3);
    expect(deskMarksAt(deskMarks(data, desk), block(3, 1)).map((m) => m.text.slice(0, 25))).toEqual(['Evidence card "vic001" (i']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A removed excerpt: possibly resolved, folded below
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10: a finding whose excerpt the director removed folds below as possibly resolved', () => {
  const data = payloadFor(article());

  test('the em-dash rewritten out of its paragraph: no mark beside it, and the fold names where it was', () => {
    const desk = Desk.setBlock(data.contentBundle, 1, 1, paragraph('The room weighed the fake demo, and then it weighed Alex.'));
    const marks = deskMarks(data, desk);
    expect(deskMarksAt(marks, block(1, 1))).toEqual([]);
    expect(marks.resolved.map((m) => [m.tone, m.where, m.text.slice(0, 25)])).toEqual([
      ['advisory', 'The Story: Eight Minutes, block 2', "Em-dash in the narrator's"]
    ]);
  });

  test('cards and photos resolve by identity: a card the director changed, a photo the director deleted', () => {
    let desk = Desk.setBlock(data.contentBundle, 1, 2, card('vic001', 'The Offer', MEMORY));
    desk = Desk.deleteBlock(desk, 1, 3);
    const marks = deskMarks(data, desk);
    expect(placed(marks).filter(([, tone]) => tone === 'structural')).toEqual([]);
    expect(marks.resolved.map((m) => [m.where, m.text.slice(0, 25)])).toEqual([
      ['The Story: Eight Minutes, block 3', 'Evidence card "vic001" (i'],
      ['The Story: Eight Minutes, block 4', 'Invalid photo reference "']
    ]);
  });

  test("a card's headline is its excerpt, and a change to its content still resolves it: identity, never the excerpt", () => {
    const desk = Desk.setBlock(data.contentBundle, 1, 2, card('vic001', 'The Offer', MEMORY));
    expect(deskMarks(data, desk).resolved.map((m) => m.tone)).toEqual(['structural']);
  });

  test('the headline field rewritten without its flagged text', () => {
    const bundle = article();
    bundle.headline.deck = 'Nine players—one verdict.';
    const d = payloadFor(bundle);
    const desk = Desk.setHeadline(d.contentBundle, { deck: 'Nine players, one verdict.' });
    const marks = deskMarks(d, desk);
    expect(deskMarksAt(marks, { kind: 'headline' })).toEqual([]);
    expect(marks.resolved.map((m) => m.where)).toEqual(['The headline']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A concern and a changed edit beside the director's edit
// ═══════════════════════════════════════════════════════════════════════════

describe("4.10: a concern and a changed edit sit beside the director's edit", () => {
  test("the fact check's concern about the card the director wrote sits beside that card", () => {
    const writers = article();
    const directors = clone(writers);
    directors.sections[1].content[2].content = 'Vic told me the job was mine.';
    const directorEdits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    const d = payloadFor(directors, { factCheck: factCheckOf(directors, { directorEdits }) });
    const [mark] = deskMarksAt(deskMarks(d, d.contentBundle), block(1, 2));
    expect(mark.tone).toBe('concern');
    expect(mark.label).toBe('Concern about your edit');
    expect(mark.text.startsWith('Evidence card "vic001"')).toBe(true);
    expect(mark.text).not.toContain(DIRECTOR_EDIT_PREFIX);
  });

  test("the judge's concern sits beside the line it quotes, and the judge's note on the writing nowhere", () => {
    const d = payloadFor(article(), {
      lastEvaluation: {
        phase: 'article', ready: true, overallScore: 0.9, structuralIssues: [],
        advisoryWarnings: [`${DIRECTOR_EDIT_PREFIX}E2: T1: "Whether the verdict costs Alex anything" states a motive as fact.`, 'C10: the lede runs long.']
      }
    });
    const marks = deskMarks(d, d.contentBundle);
    expect(deskMarksAt(marks, block(3, 0)).map((m) => [m.tone, m.text])).toEqual([
      ['concern', 'T1: "Whether the verdict costs Alex anything" states a motive as fact.']
    ]);
    expect(JSON.stringify(marks)).not.toContain('the lede runs long');
  });

  test("an edit a send-back changed sits beside the edit, with the rework's reason", () => {
    const writers = article();
    const directors = clone(writers);
    directors.sections[3].content[0].text = 'Whether the verdict costs Alex anything is still open.';
    const edits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    const rework = clone(directors);
    rework.sections[3].content[0].text = 'The people with money will decide what the verdict costs Alex.';
    const report = reportAfterPass(null, { edits, before: directors, after: rework, pass: SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asked the closing to end on the money.' }] });
    const d = payloadFor(rework, { handEditReport: report });
    expect(deskMarksAt(deskMarks(d, d.contentBundle), block(3, 0)).map((m) => [m.tone, m.label, m.text])).toEqual([[
      'changed', 'Your edit',
      'Closing, paragraph: your "Whether the verdict costs Alex anything is still open." became "The people with money will decide what the verdict costs Alex." (the rework of your send-back). Why: The note asked the closing to end on the money.'
    ]]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// One rule for which changed lines a stop shows (the integrator's ruling 8), at the desk
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10: which changed lines the desk shows beside the edit (ruling 8)', () => {
  const writers = article();
  const directors = clone(writers);
  directors.sections[3].content[0].text = 'Whether the verdict costs Alex anything is still open.';
  const edits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);

  test("an automatic pass's change code put back is not beside the edit, and stays in the folded record", () => {
    const pass = clone(directors);
    pass.sections[3].content[0].text = 'The verdict may cost Alex nothing.';
    const { output, report } = settleEdits(null, { edits, before: directors, after: pass, pass: 1 });
    expect(report.changed).toEqual([expect.objectContaining({ automatic: true, restored: true })]);
    const d = payloadFor(output, { handEditReport: report });
    expect(changedEditsToShow(report)).toEqual([]);
    expect(placed(deskMarks(d, d.contentBundle)).filter(([, tone]) => tone === 'changed')).toEqual([]);
    expect(ViewLogic.steeringView(report, []).changedEdits.map((e) => e.restored)).toEqual([true]);
  });

  test('a cut that came back is beside the text where it came back', () => {
    const cut = clone(writers);
    cut.sections[1].content.splice(4, 1);
    const cutEdits = carriedEdits(standingAfterSendBack(null, writers, cut, 'bundle'), cut);
    const pass = clone(cut);
    pass.sections[2].content.push(paragraph(STORY_3));
    const { output, report } = settleEdits(null, { edits: cutEdits, before: cut, after: pass, pass: 1 });
    const d = payloadFor(output, { handEditReport: report });
    expect(deskMarksAt(deskMarks(d, d.contentBundle), block(2, 2)).map((m) => [m.tone, m.text])).toEqual([[
      'changed', `The Story: Eight Minutes, paragraph, cut: the text you cut came back as "${STORY_3}" (automatic pass 1). It is still in the article: cut it again if it should go.`
    ]]);
  });

  test("a send-back's change is shown with its reason, and a send-back's entry is never hidden", () => {
    const entry = { id: 'E1', scope: 'section:closing', where: 'section "closing", paragraph', cut: false, removed: false, moved: false, director: 'x', became: 'y', pass: SEND_BACK_PASS, automatic: false, reason: 'Because.', restored: false };
    expect(changedEditsToShow({ checked: ['E1'], changed: [entry] })).toEqual([entry]);
    expect(changedEditsToShow({ checked: ['E1'], changed: [{ ...entry, restored: true }] })).toHaveLength(1);
    expect(changedEditsToShow(null)).toEqual([]);
    expect(changedEditsToShow({ checked: [], changed: [entry] })).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A finding with no block, a length finding, and a judge's issue at the cap
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10: a finding with no block sits in one line beside the approve button', () => {
  test('a roster gap has no block', () => {
    const data = payloadFor(article());
    const marks = deskMarks(data, data.contentBundle);
    expect(marks.apart.map((m) => [m.tone, m.where, m.text.slice(0, 26)])).toEqual([['structural', '', 'Roster coverage gap: Sam i']]);
    const view = deskView(data, data.contentBundle);
    expect(view.apart).toEqual({ any: true, title: 'Not beside any block (1)', items: marks.apart });
  });

  test('a judge issue that quotes nothing on the page, and a send-back that removed the edit, have no block', () => {
    const report = { checked: ['E1'], changed: [{ id: 'E1', scope: 'section:closing', where: 'section "closing", paragraph', cut: false, removed: false, moved: false, director: 'Kept.', became: null, pass: SEND_BACK_PASS, automatic: false, reason: null, restored: false }] };
    const data = payloadFor(article(), {
      handEditReport: report,
      lastEvaluation: { phase: 'article', ready: false, escalatedToHuman: true, overallScore: 0.4, structuralIssues: ['T5: the moneyTruth criterion failed.'], advisoryWarnings: [] }
    });
    expect(deskMarks(data, data.contentBundle).apart.map((m) => m.tone)).toEqual(['judge', 'structural', 'changed']);
  });

  test("a length finding sits on its section's heading", () => {
    const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
    const bundle = article();
    bundle.sections[1].content.push(paragraph(words(1000)));
    bundle.sections[3].content.push(paragraph(words(900)));
    const d = payloadFor(bundle);
    const marks = deskMarks(d, d.contentBundle);
    const length = (anchor) => deskMarksAt(marks, anchor).filter((m) => m.text.startsWith('Over length:'));
    expect([0, 1, 2, 3].map((s) => length({ kind: 'heading', section: s }).length)).toEqual([1, 1, 1, 1]);
    expect(length({ kind: 'heading', section: 1 })[0].where).toBe('The Story: Eight Minutes, heading');
  });
});

describe("4.10: a judge's issue left unresolved at the cap is anchored by the sentence it quotes", () => {
  const AT_CAP = (issues) => ({ phase: 'article', ready: false, escalatedToHuman: true, overallScore: 0.4, structuralIssues: issues, advisoryWarnings: [] });

  test('the issue sits beside the block that holds its quote, in any case and with curly quotes', () => {
    const issue = 'T5: “thirteen sales landed in one account” contradicts the ledger, which records eleven. Report the ledger\'s count.';
    const d = payloadFor(article(), { lastEvaluation: AT_CAP([issue]) });
    expect(deskMarksAt(deskMarks(d, d.contentBundle), block(2, 0)).map((m) => [m.tone, m.label, m.text])).toEqual([
      ['judge', 'The judge could not fix this', issue]
    ]);
  });

  test('the director rewrote the sentence: the issue folds below as possibly resolved', () => {
    const d = payloadFor(article(), { lastEvaluation: AT_CAP(['T5: "Thirteen sales landed in one account" contradicts the ledger.']) });
    const desk = Desk.setBlock(d.contentBundle, 2, 0, paragraph('Eleven sales landed in one account.'));
    const marks = deskMarks(d, desk);
    expect(placed(marks).filter(([, tone]) => tone === 'judge')).toEqual([]);
    expect(marks.resolved.map((m) => [m.tone, m.where])).toEqual([['judge', 'Follow the Money, block 1']]);
  });

  test('an evaluation that reached the stop ready carries no issue, and the fact check\'s own entry is never read as the judge\'s', () => {
    const ready = payloadFor(article(), { lastEvaluation: { ...AT_CAP(['T5: "Thirteen sales landed in one account" is wrong.']), ready: true, escalatedToHuman: false } });
    expect(placed(deskMarks(ready, ready.contentBundle)).filter(([, tone]) => tone === 'judge')).toEqual([]);
    const fromCheck = payloadFor(article(), { lastEvaluation: { ...AT_CAP(['T5: "Thirteen sales landed in one account" is wrong.']), source: 'fact-check' } });
    expect(placed(deskMarks(fromCheck, fromCheck.contentBundle)).filter(([, tone]) => tone === 'judge')).toEqual([]);
  });

  test("a quote of a section's heading locates nothing, as the server's guard reads it", () => {
    const d = payloadFor(article(), { lastEvaluation: AT_CAP(['T1: in "The Story: Eight Minutes", the claim has no source.']) });
    expect(deskMarks(d, d.contentBundle).apart.map((m) => m.tone)).toContain('judge');
  });

  test("the console reads a finding's quotes as lib/grounding.js quotedPassages does", () => {
    const corpus = [
      'T5: "Thirteen sales" contradicts the ledger.',
      'T1: “Mel’s theory” and ‘the fake demo’ both quote the page.',
      "the players' votes and 'their own account' are quoted",
      "the '90s and 'big' deals",
      "it's 'nested \"double\" quotes' here",
      "'' and \"\" are empty, ' alone is nothing",
      'an em—dash in "a quote–with dashes" stays',
      "'unclosed quote and 'closed one'",
      "'Café au lait' and été's 'ok'",
      42, null, undefined, ''
    ];
    corpus.forEach((text) => expect([text, ViewLogic.quotedPassagesOf(text)]).toEqual([text, quotedPassages(text)]));
    corpus.filter((t) => typeof t === 'string').forEach((text) => {
      expect([text, ViewLogic.groundingText(text)]).toEqual([text, normalizeForGrounding(text)]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No score at the article stop, the echo, and the folds
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10: no score at the article stop', () => {
  test('the desk carries no score, no criterion and no note on the writing', () => {
    const data = payloadFor(article(), {
      lastEvaluation: { phase: 'article', ready: true, overallScore: 0.93, structuralIssues: [], advisoryWarnings: ['C10: the lede runs long.'], criteriaScores: { voice: { score: 0.9, notes: 'Strong voice.' } } },
      trace: [{ pass: 1, round: 1, trigger: 'evaluation', findings: { structuralIssues: ['T5: x'], advisoryWarnings: [], criteriaScores: { moneyTruth: { score: 0.4, notes: 'Wrong count.' } }, revisionGuidance: 'Fix the count.' }, at: '2026-10-03T10:00:00.000Z', changedScopes: ['section:theStory'] }]
    });
    const text = JSON.stringify(deskView(data, data.contentBundle));
    ['score', 'Score', '0.93', 'Uncalibrated', 'Strong voice', 'the lede runs long'].forEach((gone) => expect(`${gone}: ${text.includes(gone)}`).toBe(`${gone}: false`));
    const [pass] = traceView(data.trace, 'journalist').passes;
    expect(pass).not.toHaveProperty('criteria');
    expect(pass).not.toHaveProperty('criteriaLabel');
    expect(JSON.stringify(pass)).not.toMatch(/0\.40|Wrong count/);
    expect(pass.mustFix.items).toEqual(['T5: x']);
  });
});

describe('4.10: the echo above the headline shows the settled story and its question', () => {
  test('the story and its question, under the labels the meeting gives them', () => {
    expect(deskEcho({ settledStory: { story: ' The room named Alex. ', question: 'Will it cost him?' } })).toEqual({
      title: 'Settled at the story meeting',
      storyLabel: 'The story', story: 'The room named Alex.',
      questionLabel: 'The question it carries', question: 'Will it cost him?'
    });
    expect(deskEcho({ settledStory: { story: 7, question: null } })).toEqual(expect.objectContaining({ story: '', question: '' }));
    expect(deskEcho({ settledStory: null })).toBeNull();
    expect(deskEcho(null)).toBeNull();
  });
});

describe('4.10: what folds below the article', () => {
  test('the possibly resolved, the fact check and the round, each under its own title', () => {
    const data = payloadFor(article(), { humanRevisionCount: 1 });
    const desk = Desk.deleteBlock(data.contentBundle, 1, 3);
    const view = deskView(data, desk);
    expect(view.folds.resolved).toEqual({
      any: true,
      title: 'Possibly resolved by your edits (1)',
      hint: 'Each was about a line, a card or a photo you have since changed or taken out.',
      items: view.marks.resolved
    });
    expect(view.folds.factCheck).toEqual({ any: true, title: 'Fact check: 3 structural, 1 advisory', summary: ViewLogic.factCheckSummary(data.factCheck) });
    expect(view.folds.rounds.title).toBe('Round 2: your notes, and what the reworks did to your edits');
    expect(view.echo).toEqual(deskEcho(data));
  });

  test('nothing to fold: no possibly resolved and no fact check', () => {
    const view = deskView({ contentBundle: { sections: [] } }, null);
    expect([view.folds.resolved.any, view.folds.factCheck.any, view.apart.any, view.echo]).toEqual([false, false, false, null]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The line every stop phrases a changed edit with (changedEditLine)
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10: the changed-edit line says what each pass did', () => {
  const MOVE = { id: 'E1', scope: 'section:s', where: 'section "s", photo p3.jpg, moved within the section', moved: true, cut: false, removed: false, director: 'filename: p3.jpg', became: 'section "t"', pass: 1, automatic: true, reason: null, restored: true };

  test('a block put back out of the order the director left it says so (4.3c inOrder)', () => {
    expect(changedEditLine({ ...MOVE, inOrder: false })).toBe(
      'E1, section "s", photo p3.jpg, moved within the section: automatic pass 1 moved the block you placed here to section "t". It was put back in its section, but not in the order you left it: move it again if the order matters.'
    );
    expect(changedEditLine({ ...MOVE, inOrder: true })).toBe(
      'E1, section "s", photo p3.jpg, moved within the section: automatic pass 1 moved the block you placed here to section "t". It was put back.'
    );
    expect(changedEditLine(MOVE)).toMatch(/It was put back\.$/);
  });

  test("a reweave's entry is the reweave's, held to the director's edits as an automatic pass is", () => {
    const CONNECTION = 'id: c2; kind: moment; joins: t2 / t4; detail: The night of the sale.';
    const struck = { id: 'E5', scope: 'connections', where: 'connection "c2", struck', struck: true, director: CONNECTION, became: CONNECTION, pass: REWEAVE_PASS, automatic: false, reason: null, restored: false };
    expect(changedEditLine(struck)).toBe('E5, connection "c2", struck: your reweave brought it back. It could not be struck again.');
    const removed = { id: 'E1', scope: 'story', where: 'story', removed: true, cut: false, moved: false, director: 'Who paid Riley?', became: 'Who gained? Who paid Riley?', pass: REWEAVE_PASS, automatic: false, reason: null, restored: false };
    expect(changedEditLine(removed, { stillIn: 'in the weave' })).toBe(
      'E1, story: a sentence you removed came back as "Who gained? Who paid Riley?" (your reweave). It is still in the weave: cut it again if it should go.'
    );
    expect(ViewLogic.REWEAVE_PASS).toBe(REWEAVE_PASS);
  });
});
