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

// Brief 4.10b: a fact-check mark reads as its finding's line, these its opening words as `placed` prints them.
const DASH_MARK = 'This paragraph has an em-';
const CARD_MARK = "This card's text does not";
const PHOTO_MARK = 'This photo, nope.jpg, is ';

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
      [at(1, 1), 'advisory', DASH_MARK],
      [at(1, 2), 'structural', CARD_MARK],
      [at(1, 3), 'structural', PHOTO_MARK]
    ]);
    expect(marks.resolved).toEqual([]);
  });

  test("each mark carries its finding's line for that place (4.10b), its label and the place in words", () => {
    const [mark] = deskMarksAt(marks, block(1, 2));
    expect(mark.text).toBe("This card's text does not match the document it cites word for word.");
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
    expect(deskMarksAt(m, { kind: 'hero' }).map((x) => x.text)).toEqual(["This photo, not-ours.jpg, is not one of the session's photos."]);
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
      [at(1, 2), 'advisory', DASH_MARK],
      [at(1, 3), 'structural', CARD_MARK],
      [at(1, 4), 'structural', PHOTO_MARK]
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
    expect(deskMarksAt(deskMarks(data, desk), block(3, 1)).map((m) => m.text.slice(0, 25))).toEqual([CARD_MARK]);
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
      ['advisory', 'The Story: Eight Minutes, block 2', DASH_MARK]
    ]);
  });

  test('cards and photos resolve by identity: a card the director changed, a photo the director deleted', () => {
    let desk = Desk.setBlock(data.contentBundle, 1, 2, card('vic001', 'The Offer', MEMORY));
    desk = Desk.deleteBlock(desk, 1, 3);
    const marks = deskMarks(data, desk);
    expect(placed(marks).filter(([, tone]) => tone === 'structural')).toEqual([]);
    expect(marks.resolved.map((m) => [m.where, m.text.slice(0, 25)])).toEqual([
      ['The Story: Eight Minutes, block 3', CARD_MARK],
      ['The Story: Eight Minutes, block 4', PHOTO_MARK]
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
    expect(mark.text).toBe("This card's text does not match the document it cites word for word.");
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
    // 4.10c: the concern reads past its prefix and ids, and past its rule ids too.
    expect(deskMarksAt(marks, block(3, 0)).map((m) => [m.tone, m.text])).toEqual([
      ['concern', '"Whether the verdict costs Alex anything" states a motive as fact.']
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
    expect(marks.apart.map((m) => [m.tone, m.where, m.text])).toEqual([['structural', '', 'Sam is on the roster but never named in the article.']]);
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
    const length = (anchor) => deskMarksAt(marks, anchor).filter((m) => m.text.startsWith('This section has '));
    expect([0, 1, 2, 3].map((s) => length({ kind: 'heading', section: s }).length)).toEqual([1, 1, 1, 1]);
    expect(length({ kind: 'heading', section: 1 })[0].where).toBe('The Story: Eight Minutes, heading');
  });
});

describe("4.10: a judge's issue left unresolved at the cap is anchored by the sentence it quotes", () => {
  const AT_CAP = (issues) => ({ phase: 'article', ready: false, escalatedToHuman: true, overallScore: 0.4, structuralIssues: issues, advisoryWarnings: [] });

  test('the issue sits beside the block that holds its quote, in any case and with curly quotes', () => {
    const issue = 'T5: “thirteen sales landed in one account” contradicts the ledger, which records eleven. Report the ledger\'s count.';
    const d = payloadFor(article(), { lastEvaluation: AT_CAP([issue]) });
    // 4.10c: the mark reads past the issue's rule ids.
    expect(deskMarksAt(deskMarks(d, d.contentBundle), block(2, 0)).map((m) => [m.tone, m.label, m.text])).toEqual([
      ['judge', 'The judge could not fix this', issue.slice('T5: '.length)]
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
// The desk's copies of the server's rules, which the browser cannot import
// ═══════════════════════════════════════════════════════════════════════════

describe("4.10: the desk's copies of the server's rules are held to the server's", () => {
  const { locateQuotedText, _testing: { MIN_LOCATING_WORDS } } = handEditDiff;

  test('a quoted passage locates with as few words as lib/hand-edit-diff.js MIN_LOCATING_WORDS', () => {
    expect(ViewLogic.MIN_QUOTE_WORDS).toBe(MIN_LOCATING_WORDS);
  });

  /** An article that prints its section ids and headings and nothing else. */
  const HEADED = {
    sections: [
      { id: 'theStory', heading: 'The Story: Eight Minutes', content: [] },
      { id: 'followTheMoney', heading: 'Follow the Money', content: [] },
      { id: 'closing', heading: 'Money—and Where It Went', content: [] }
    ]
  };

  /** Findings that quote the page: each elision form, the word count's edges, single and curly quotes, and the headings. */
  const FINDINGS = [
    'T5: "eleven sales landed ... in the last two minutes" contradicts the ledger.',
    'T1: "the vote was close…and Alex lost it" has no source.',
    'T6: "Vic held the chair [...] until the money moved" names no one.',
    'T6: "Alex sold early [ … ] then sold again" is not in the ledger.',
    'T2: "... the room named Alex" and "the room named Alex ..." quote the verdict.',
    'T5: "four dots here....and more words here" runs on.',
    'T1: "one two ... three four five ... six" is mostly short.',
    'T5: "rock-and-roll forever" and "self—made man" hold two words each.',
    'T9: "Vic\'s chair stayed" and "don\'t stop" quote the page.',
    'T5: "1,500 words" and "$4.5M moved" count their digits.',
    'T1: "Alex – then Mel" stands alone.',
    'T1: “Café au lait” and “thirteen sales landed in one account” are in curly quotes.',
    "T1: 'the money moved ... before the vote' and the players' 'own account here'",
    "T1: it's 'nested \"double\" quotes' here",
    'T1: in "The Story: Eight Minutes", the claim has no source.',
    'T5: in "follow the money" the sums disagree.',
    'T5: under "Money-and where it went" the figure is wrong.',
    'T5: "Follow the Money ... and then the vote" runs two passages together.',
    'T5: the moneyTruth criterion failed.',
    // 4.10b: an accented letter inside a word. "naïve plan" is two words to the server, which
    // reads any letter; a letter test that reads only A to Z splits "naïve" and counts three.
    'T1: "naïve plan" and "résumé gap here" quote the page.'
  ];

  /** A text as the guard and the desk both look for a quote in it: grounding's reading, in lower case. */
  const folded = (text) => ViewLogic.groundingText(text).toLowerCase();

  /** Does the desk read one of `passages` in `text`? */
  const deskReadsIn = (passages, text) => passages.some((p) => folded(text).includes(folded(p)));

  /**
   * Does the server's guard read a passage of `finding` in `text`? locateQuotedText locates an
   * edit whose text is `text` exactly when a passage the guard reads is in that text.
   */
  const guardReadsIn = (finding, text) => {
    const edit = { id: 'E1', scope: 'headline', path: 'headline.main', at: [{ key: 'headline' }, { key: 'main' }], before: 'An old headline.', after: text };
    return locateQuotedText(finding, [edit], HEADED).editIds.length === 1;
  };

  /**
   * The texts both are asked about: every run of whole words of each passage the finding
   * quotes, and each passage the desk reads, whole and less its first or its last character.
   */
  const candidatesOf = (finding, passages) => {
    const runs = quotedPassages(finding).flatMap((quoted) => {
      const words = quoted.split(' ');
      return words.flatMap((_, from) => words.slice(from).map((__, n) => words.slice(from, from + n + 1).join(' ')));
    });
    return [...new Set([...runs, ...passages.flatMap((p) => [p, p.slice(1), p.slice(0, -1)])])];
  };

  test("the passages that locate a finding are lib/hand-edit-diff.js locateQuotedText's: split at an elision, three words or more, never a heading", () => {
    const headings = ViewLogic.headingsOf(HEADED);
    const disagreements = [];
    const answers = new Set();
    FINDINGS.forEach((finding) => {
      const passages = ViewLogic.locatingPassages(finding, headings);
      candidatesOf(finding, passages).forEach((text) => {
        const guard = guardReadsIn(finding, text);
        answers.add(guard);
        if (guard !== deskReadsIn(passages, text)) disagreements.push({ finding, text, guard });
      });
    });
    expect(disagreements).toEqual([]);
    // The corpus asks about texts the guard reads a passage in, and texts it reads none in.
    expect([...answers].sort()).toEqual([false, true]);
    // The article prints only its ids and headings: a heading the finding quotes is where the problem is, and locates nothing.
    expect(FINDINGS.filter((finding) => locateQuotedText(finding, [], HEADED).writer)).toEqual([]);
  });

  test("a finding names its section by the section's id as the desk reads it: trimmed, and none for a blank, missing or non-string id (lib/content-bundle-fact-check.js sectionIdOf)", () => {
    const sections = [
      { id: 'lede', content: [paragraph('The lede—under a plain id.')] },
      { id: '  theStory  ', heading: 'The Story', content: [paragraph('The story—under an id with spaces round it.'), card('nope1', 'No document', 'Nothing.'), photo('nope1.jpg', 'Nobody.')] },
      { id: '\tfollowTheMoney\n', heading: 'Follow the Money', content: [paragraph('The money—under an id with a tab and a newline.')] },
      { id: '   ', heading: 'Blank', content: [paragraph('A blank id—spaces only.'), card('nope3', 'No document', 'Nothing.'), photo('nope3.jpg', 'Nobody.')] },
      { heading: 'Without', content: [paragraph('No id—at all.')] },
      { id: 7, heading: 'A number', content: [paragraph('A number—for an id.')] }
    ];
    /** Does a section hold the block a finding is about: its card, its photo, or the paragraph that prints its excerpt? */
    const holds = (section, { place, excerpt }) => section.content.some((b) => (
      typeof place.tokenId === 'string' ? b.tokenId === place.tokenId
        : typeof place.filename === 'string' ? b.filename === place.filename
          : b.type === 'paragraph' && b.text.includes(excerpt)));
    const named = factCheckOf({ ...article(), sections }).findings
      .filter((f) => f.place && Object.prototype.hasOwnProperty.call(f.place, 'section'))
      .map((f) => ({ section: sections.findIndex((s) => holds(s, f)), kind: f.kind, id: f.place.section }));
    expect(named.map((n) => n.id)).toEqual(named.map((n) => ViewLogic.findingSectionId(sections[n.section])));
    expect(Object.fromEntries(named.map((n) => [n.section, n.id]))).toEqual({ 0: 'lede', 1: 'theStory', 2: 'followTheMoney', 3: null, 4: null, 5: null });
    // A paragraph's, a card's and a photo's place, in the padded section and in the blank one.
    const kindsIn = (s) => named.filter((n) => n.section === s).map((n) => n.kind).sort();
    expect([kindsIn(1), kindsIn(3)]).toEqual([['cardFidelity', 'emDash', 'photoReferences'], ['cardFidelity', 'emDash', 'photoReferences']]);
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
    // Brief 4.10e: the must-fix line reads past its rule ids, as the desk's marks do.
    expect(pass.mustFix.items).toEqual(['X']);
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

// ═══════════════════════════════════════════════════════════════════════════
// 4.10b: the stops' lines, follow-ups (the integrator's ruling 1 on 4.10's minors and
// hand-offs). Each mark at the desk says what is wrong in the article and where, in the
// director's words: the fact check's line for the finding's place
// (lib/content-bundle-fact-check.js, each finding's `line`), with a card's document named
// through the stop's evidenceIndex as the story meeting names a receipt (receiptView). The
// fact check's message, which the rework reads, stays as it is, and a finding marked at
// several places reads once at each, with that place's part.
// ═══════════════════════════════════════════════════════════════════════════

/** The fixture's document as server.js buildEvidenceIndex keys it for a stop's payload. */
const INDEX = { vic001: { name: 'VIC001 - The offer', owner: 'Vic Kingsley', type: 'memory', firstLine: MEMORY } };

describe("4.10b: each mark says what is wrong in the article and where, in the director's words", () => {
  const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  /** The article, with two em-dashes in a paragraph of Follow the Money, and The Story and the closing long enough to run over. */
  const longArticle = () => {
    const bundle = article();
    bundle.sections[2].content.push(paragraph('The money moved—fast—before the vote.'));
    bundle.sections[1].content.push(paragraph(words(1000)));
    bundle.sections[3].content.push(paragraph(words(900)));
    return bundle;
  };
  const data = payloadFor(longArticle(), { evidenceIndex: INDEX });
  const marks = deskMarks(data, data.contentBundle);
  const textsAt = (anchor) => deskMarksAt(marks, anchor).map((m) => m.text);

  test('a card: its text against the document it cites, named as the story meeting names a receipt', () => {
    expect(textsAt(block(1, 2))).toEqual(["This card's text does not match VIC001 - The offer (Vic Kingsley) word for word."]);
  });

  test("the console's copy of the words that stand for the card's document is the fact check's", () => {
    const server = require('../../lib/content-bundle-fact-check').DOCUMENT_SLOT;
    expect(typeof server).toBe('string');
    expect(ViewLogic.DOCUMENT_SLOT).toBe(server);
  });

  test('a card whose document the stop cannot name: the document it cites, and never its id alone', () => {
    const bare = payloadFor(article());
    expect(deskMarksAt(deskMarks(bare, bare.contentBundle), block(1, 2)).map((m) => m.text))
      .toEqual(["This card's text does not match the document it cites word for word."]);
  });

  test('a photo', () => {
    expect(textsAt(block(1, 3))).toEqual(["This photo, nope.jpg, is not one of the session's photos."]);
  });

  // 4.10c: the em-dashes counted are the ones outside quoted speech, and the words the article's words of prose.
  test("a paragraph: each paragraph carries its own part of a finding that sits at several", () => {
    expect(textsAt(block(1, 1))).toEqual(['This paragraph has an em-dash outside quoted speech; house style uses none.']);
    expect(textsAt(block(2, 2))).toEqual(['This paragraph has 2 em-dashes outside quoted speech; house style uses none.']);
  });

  test("the length at two sections: each heading carries its own section's words, once", () => {
    expect(textsAt({ kind: 'heading', section: 1 })).toEqual(["This section has 1,031 of the article's 1,998 words of prose; the article aims at about 1,500."]);
    expect(textsAt({ kind: 'heading', section: 3 })).toEqual(["This section has 914 of the article's 1,998 words of prose; the article aims at about 1,500."]);
  });

  test('a finding with no block: one line beside the approve button, naming the player', () => {
    expect(marks.apart.map((m) => [m.tone, m.text])).toEqual([['structural', 'Sam is on the roster but never named in the article.']]);
  });

  test("no mark carries the rework's message or a pipeline term, and each message stays the rework's", () => {
    const all = [...Object.values(marks.at).flat(), ...marks.apart, ...marks.resolved];
    const messages = data.factCheck.findings.map((f) => f.message);
    // One mark for each finding: a card, a photo, two em-dashes, the length at four headings, a roster gap.
    expect(all).toHaveLength(data.factCheck.findings.length);
    expect(all).toHaveLength(9);
    all.forEach((m) => {
      expect([m.text, messages.includes(m.text)]).toEqual([m.text, false]);
      expect([m.text, /<RECORD>|section "|\b[TC]\d+\b|narrator|Evidence card "|\bvic001\b/.test(m.text)]).toEqual([m.text, false]);
    });
    expect(data.factCheck.structuralIssues.map((m) => m.split(':')[0])).toEqual([
      'Evidence card "vic001" (in section "theStory") is not verbatim', 'Roster coverage gap', 'Invalid photo reference "nope.jpg"'
    ]);
  });
});

describe("4.10b: a block code put back out of the director's order sits beside its edit", () => {
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const C = paragraph('Charlie paragraph closes the section with a long first line.');
  const T = paragraph('Tango paragraph sits alone in the second section of the article.');
  const P = photo('theory.jpg', 'Mel lays out the theory at the whiteboard.');
  const P2 = { ...P, caption: 'Six people around the whiteboard, late.' };
  /** An article whose section "s" (The Sale) holds `s` and whose section "t" (The Vote) holds `t`. */
  const twoSections = (s, t = [T]) => ({
    headline: { main: 'The Room Voted Five to Four' },
    sections: [
      { id: 's', type: 'narrative', heading: 'The Sale', content: s.map(clone) },
      { id: 't', type: 'narrative', heading: 'The Vote', content: t.map(clone) }
    ],
    evidenceCards: []
  });

  test("the director moved a photo within its section, then recaptioned it; a pass took it away and swapped its neighbours; code put it back out of the director's order", () => {
    const roundOne = standingAfterSendBack(null, twoSections([P, A, B, C]), twoSections([A, P, B, C]), 'bundle');
    const sentBack = twoSections([A, P2, B, C]);
    const roundTwo = standingAfterSendBack(roundOne, twoSections([A, P, B, C]), sentBack, 'bundle');
    const { output, report } = settleEdits(null, { edits: carriedEdits(roundTwo, sentBack), before: sentBack, after: twoSections([B, A, C], [T, P]), pass: 1 });
    expect(report.changed).toEqual([
      expect.objectContaining({ id: 'E1', moved: true, restored: true, inOrder: false }),
      expect.objectContaining({ id: 'E2', restored: true })
    ]);
    // Its line asks the director to act, so it is shown; the caption code put back asks nothing.
    expect(changedEditsToShow(report).map((e) => e.id)).toEqual(['E1']);
    const d = payloadFor(output, { handEditReport: report });
    const at = output.sections[0].content.findIndex((b) => b.type === 'photo');
    expect(deskMarksAt(deskMarks(d, d.contentBundle), block(0, at)).filter((m) => m.tone === 'changed').map((m) => m.text)).toEqual([
      'The Sale, photo theory.jpg, moved within the section: automatic pass 1 moved the block you placed here to The Vote. It was put back in its section, but not in the order you left it: move it again if the order matters.'
    ]);
    // Put back in the director's order, it asks nothing.
    expect(changedEditsToShow({ ...report, changed: report.changed.map((e) => ({ ...e, inOrder: true })) })).toEqual([]);
  });
});

describe('4.10b: a mark found by its words sits beside a block of the kind its line names', () => {
  const quote = (text) => ({ type: 'quote', text, attribution: 'Mel' });

  test('an example line in a quote block sits beside the quote, not beside a card above it that holds the same words', () => {
    const bundle = article();
    bundle.sections[1].content.splice(3, 0, card('vic001', 'The Job', 'The job is yours.'), quote('The job is yours, Vic.'));
    const d = payloadFor(bundle);
    const quoteAt = bundle.sections[1].content.findIndex((b) => b.type === 'quote');
    expect(deskMarksAt(deskMarks(d, d.contentBundle), block(1, quoteAt)).map((m) => m.text)).toEqual([
      'This quote holds "The job is yours", an example line from the writer\'s instructions; check that someone in the session said it.'
    ]);
  });

  test("a paragraph's finding found by its words, once the ordinal no longer holds, sits beside a paragraph, never a quote that holds them too", () => {
    const bundle = article();
    bundle.sections[1].content.splice(1, 0, quote('Then I voted with the room, Mel said.'));
    bundle.sections[1].content.push(paragraph('Then I voted with the room.'));
    const d = payloadFor(bundle);
    const desk = Desk.setBlock(d.contentBundle, 1, 0, paragraph('Mel built the first theory around a fight.'));
    const marks = deskMarks(d, desk);
    const last = desk.sections[1].content.length - 1;
    expect(deskMarksAt(marks, block(1, 1))).toEqual([]);
    expect(deskMarksAt(marks, block(1, last)).map((m) => m.text)).toEqual([
      '"I voted" makes the reporter one of the room: the reporter never votes, joins the room\'s accusation or exposes a memory.'
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10c: the desk's last lines (the integrator's ruling 2 on 4.10b's minors). The judge's marks
// read without their rule ids, since the director reads the line, not the rule; and a finding
// stored before the fact check wrote lines reads as its message.
// ═══════════════════════════════════════════════════════════════════════════

describe("4.10c: the judge's marks read without their rule ids", () => {
  const AT_CAP = (issues, advisories = []) => ({ phase: 'article', ready: false, escalatedToHuman: true, overallScore: 0.4, structuralIssues: issues, advisoryWarnings: advisories });

  test("an issue the judge could not fix at the cap, and its concern about the director's edit, each past its leading rule ids", () => {
    const issue = 'T4, T6: “thirteen sales landed in one account” names who sold; the ledger names only the account. Report the account.';
    const concern = `${DIRECTOR_EDIT_PREFIX}E2: T1: "Whether the verdict costs Alex anything" states a motive as fact.`;
    const d = payloadFor(article(), { lastEvaluation: AT_CAP([issue], [concern]) });
    const marks = deskMarks(d, d.contentBundle);
    expect(deskMarksAt(marks, block(2, 0)).map((m) => [m.tone, m.text])).toEqual([
      ['judge', '“thirteen sales landed in one account” names who sold; the ledger names only the account. Report the account.']
    ]);
    expect(deskMarksAt(marks, block(3, 0)).map((m) => [m.tone, m.text])).toEqual([
      ['concern', '"Whether the verdict costs Alex anything" states a motive as fact.']
    ]);
  });

  test('the rule ids taken off are the ones lib/workflow/nodes/node-helpers.js leadingRuleIds reads, with the colon after them; a finding that opens with none reads as written', () => {
    const { leadingRuleIds } = require('../../lib/workflow/nodes/node-helpers');
    // [the judge's finding, the mark's text]: a finding that quotes nothing on the page sits apart.
    const CORPUS = [
      ['T5: the ledger records eleven sales.', 'The ledger records eleven sales.'],
      ['T4, T6: the account names no one by itself.', 'The account names no one by itself.'],
      ['T4 and T6: the money went to one account.', 'The money went to one account.'],
      ['T4/T6 : the vote count is wrong.', 'The vote count is wrong.'],
      ['T4 & T12:the exposure names no one.', 'The exposure names no one.'],
      ["T5,: the total is the ledger's.", "The total is the ledger's."],
      ['The ledger records twelve sales (T5).', 'The ledger records twelve sales (T5).'],
      ['T5 is breached: the ledger records thirteen sales.', 'T5 is breached: the ledger records thirteen sales.'],
      ['t5: a lower-case id is no rule id.', 't5: a lower-case id is no rule id.']
    ];
    const d = payloadFor(article(), { lastEvaluation: AT_CAP(CORPUS.map(([finding]) => finding)) });
    expect(deskMarks(d, d.contentBundle).apart.filter((m) => m.tone === 'judge').map((m) => m.text)).toEqual(CORPUS.map(([, shown]) => shown));
    CORPUS.forEach(([finding, shown]) => {
      const cut = finding.slice(0, finding.length - shown.length);
      expect([finding, cut.match(/T\d{1,2}/g) || []]).toEqual([finding, cut ? leadingRuleIds(finding) : []]);
    });
  });
});

describe('4.10c: a finding stored before the fact check wrote lines reads as its message', () => {
  test('a plain finding reads as its message, and a concern as its message past the prefix and the ids', () => {
    const writers = article();
    const directors = clone(writers);
    directors.sections[1].content[2].content = 'Vic told me the job was mine.';
    const directorEdits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    const fresh = factCheckOf(directors, { directorEdits });
    const stored = { ...fresh, findings: fresh.findings.map(({ line, ...rest }) => rest) };
    const d = payloadFor(directors, { factCheck: stored });
    const marks = deskMarks(d, d.contentBundle);
    const photoFinding = fresh.findings.find((f) => f.kind === 'photoReferences');
    const cardFinding = fresh.findings.find((f) => f.kind === 'cardFidelity');
    expect([photoFinding.editId, cardFinding.editId]).toEqual([undefined, 'E1']);
    expect(deskMarksAt(marks, block(1, 3)).map((m) => [m.tone, m.text])).toEqual([['structural', photoFinding.message]]);
    expect(deskMarksAt(marks, block(1, 2)).map((m) => [m.tone, m.text])).toEqual([['concern', handEditDiff.concernFinding(cardFinding.message)]]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10c: a caption the director wrote on a photo the article cannot print reads as such (ruling 6
// on 4.5e's findings), and the folded record says the director's edits stand, as the map and the
// meeting do.
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10c: a caption the director wrote on a photo the article cannot print reads as such', () => {
  const CAPTION = 'Mel bent over the ledger, late in the evening.';
  const LINE = `photo nope.jpg, caption: automatic pass 1 took out the photo, which the article cannot print, so your "${CAPTION}" was not put back.`;
  /** The director captions the photo the session does not hold and sends back; an automatic pass fixes the photo. */
  const settled = (fix) => {
    const writers = article();
    const directors = clone(writers);
    directors.sections[1].content[3].caption = CAPTION;
    const edits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    const pass = clone(directors);
    fix(pass.sections[1].content);
    return settleEdits(null, { edits, before: directors, after: pass, pass: 1, photos: ['huddle.jpg', 'theory.jpg'] });
  };

  test('an automatic pass took the photo out: code left the caption out with it, and the line says why, beside no block and in the folded record', () => {
    const { output, report } = settled((content) => content.splice(3, 1));
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', became: null, restored: false, unprintable: true })]);
    const d = payloadFor(output, { handEditReport: report });
    expect(deskMarks(d, d.contentBundle).apart.filter((m) => m.tone === 'changed').map((m) => m.text)).toEqual([`The Story: Eight Minutes, ${LINE}`]);
    expect(ViewLogic.steeringView(report, []).changedEdits.map((e) => e.line)).toEqual([`E1, section "theStory", ${LINE}`]);
  });

  test('an automatic pass put a photo the session holds in its place, with the words of the caption: the same line, which never says the words are gone', () => {
    const { output, report } = settled((content) => { content[3].filename = 'theory.jpg'; });
    expect(output.sections[1].content[3]).toEqual(photo('theory.jpg', CAPTION));
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', became: null, restored: false, unprintable: true })]);
    const d = payloadFor(output, { handEditReport: report });
    expect(deskMarks(d, d.contentBundle).apart.filter((m) => m.tone === 'changed').map((m) => m.text)).toEqual([`The Story: Eight Minutes, ${LINE}`]);
  });
});

describe('4.10c: the folded record says the edits stand, as the map and the meeting do', () => {
  const writers = article();
  const directors = clone(writers);
  directors.sections[3].content[0].text = 'Whether the verdict costs Alex anything is still open.';
  const edits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);

  test("a round whose change code put back: the record lists the restore and says the edit stands, in editsStandLine's words", () => {
    const pass = clone(directors);
    pass.sections[3].content[0].text = 'The verdict may cost Alex nothing.';
    const { report } = settleEdits(null, { edits, before: directors, after: pass, pass: 1 });
    const record = ViewLogic.steeringView(report, []);
    expect(record.changedEdits.map((e) => e.restored)).toEqual([true]);
    expect(record.kept).toBe('Your edit stands.');
    expect(record.kept).toBe(ViewLogic.editsStandLine(report));
  });

  test('a round that changed none of two edits, or of three; a change still to show, and no report, say nothing of the kind', () => {
    expect(ViewLogic.steeringView({ checked: ['E1', 'E2'], changed: [] }, []).kept).toBe('Both of your edits stand.');
    expect(ViewLogic.steeringView({ checked: ['E1', 'E2', 'E3'], changed: [] }, []).kept).toBe('All 3 of your edits stand.');
    const sendBack = { id: 'E1', scope: 'section:closing', where: 'section "closing", paragraph', cut: false, removed: false, moved: false, director: 'a', became: 'b', pass: SEND_BACK_PASS, automatic: false, reason: null, restored: false };
    expect(ViewLogic.steeringView({ checked: ['E1'], changed: [sendBack] }, []).kept).toBe('');
    expect(ViewLogic.steeringView(null, []).kept).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5g: each stop says what happened to a photo the article cannot print (the integrator's
// ruling 1 on 4.5f's findings, progress.md 2026-10-04). The restore leaves such a photo out only
// where the pass took it out of print, so an entry reads in one of three forms:
// - a caption left out with its photo (`unprintable`, not restored), in 4.10c's line;
// - a whole element that came back without its photo (`unprintable` and `restored`), shown beside
//   the edits because it asks the director for a photo the article can print;
// - an edit whose photo still prints, an ordinary change.
// Every report here is lib/hand-edit-diff.js settleEdits', given the kept photos as the article's
// rework gives them.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.5g: each stop says what happened to a photo the article cannot print', () => {
  const KEPT = ['huddle.jpg', 'theory.jpg'];
  const CAPTION = 'Mel bent over the ledger, late in the evening.';
  const AFTERMATH = 'The morning after, the account was still open.';
  /** The fixture as the director sent it back (`direct`), then an automatic pass's version of that (`pass`), settled with the kept photos. */
  const settled = (direct, pass) => {
    const writers = article();
    const directors = clone(writers);
    direct(directors);
    const edits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    const after = clone(directors);
    pass(after);
    return settleEdits(null, { edits, before: directors, after, pass: 1, photos: KEPT });
  };
  /** The desk's marks of the round's changes: beside no piece, and beside a piece. */
  const changedMarks = (output, report) => {
    const d = payloadFor(output, { handEditReport: report });
    const marks = deskMarks(d, d.contentBundle);
    return {
      apart: marks.apart.filter((m) => m.tone === 'changed').map((m) => m.text),
      at: Object.keys(marks.at).flatMap((key) => marks.at[key]).filter((m) => m.tone === 'changed').map((m) => m.text)
    };
  };

  test("a caption the director wrote on a photo a pass took out of print: left out with its photo, and shown, in 4.10c's line", () => {
    const { output, report } = settled((v) => { v.sections[1].content[3].caption = CAPTION; }, (v) => { v.sections[1].content.splice(3, 1); });
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: false, unprintable: true })]);
    expect(changedEditsToShow(report)).toEqual(report.changed);
    expect(changedMarks(output, report)).toEqual({
      apart: [`The Story: Eight Minutes, photo nope.jpg, caption: automatic pass 1 took out the photo, which the article cannot print, so your "${CAPTION}" was not put back.`],
      at: []
    });
  });

  test('a section the director added whole, which came back without the photo a pass took out of print: shown beside the edits, saying so, so the edits do not all stand', () => {
    const { output, report } = settled(
      (v) => { v.sections.push({ id: 'aftermath', type: 'narrative', heading: 'Aftermath', content: [paragraph(AFTERMATH), photo('lost.jpg', CAPTION)] }); },
      (v) => { v.sections[4].content.splice(1, 1); }
    );
    expect(output.sections[4].content).toEqual([paragraph(AFTERMATH)]);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', where: 'section "aftermath"', restored: true, unprintable: true })]);
    expect(changedEditsToShow(report)).toEqual(report.changed);
    const LINE = 'automatic pass 1 took out a photo you placed here, which the article cannot print. The rest of your edit stands: place a photo the article can print here if it should have one.';
    // Brief 4.10e: the mark sits on the section's heading (4.5g's minor 4), where it sat apart.
    expect(changedMarks(output, report)).toEqual({ apart: [], at: [`Aftermath: ${LINE}`] });
    const record = ViewLogic.steeringView(report, []);
    expect(record.changedEdits.map((e) => e.line)).toEqual([`E1, section "aftermath": ${LINE}`]);
    expect(record.kept).toBe('');
  });

  test('a caption the director wrote on a photo a pass moved and recaptioned, which still prints: put back, it reads as an ordinary change in the folded record, and the edit stands', () => {
    const { output, report } = settled(
      (v) => { v.sections[1].content[3].caption = CAPTION; },
      (v) => {
        const [moved] = v.sections[1].content.splice(3, 1);
        v.sections[2].content.push({ ...moved, caption: 'A caption the pass wrote.' });
      }
    );
    expect(output.sections[1].content[3]).toEqual(photo('nope.jpg', CAPTION));
    expect(output.sections[2].content).toEqual(article().sections[2].content);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    expect(report.changed[0]).not.toHaveProperty('unprintable');
    expect(changedEditsToShow(report)).toEqual([]);
    expect(changedMarks(output, report)).toEqual({ apart: [], at: [] });
    const record = ViewLogic.steeringView(report, []);
    expect(record.changedEdits.map((e) => e.line)).toEqual([`E1, section "theStory", photo nope.jpg, caption: automatic pass 1 removed your "${CAPTION}". Your text was put back.`]);
    expect(record.kept).toBe('Your edit stands.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10e: the folded trace reads past its rule ids (the integrator's ruling 2 on the fifth wave's
// findings, 4.10d's minor 7). The trace at the map and the desk printed each pass's must-fix lines
// as stored, "T5: …", the one place left where rule ids reached the director. They read past
// their rule ids, as the desk's marks do (judgeMarkText).
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10e: the folded trace reads past its rule ids', () => {
  test("each pass's must-fix lines read past their leading rule ids, as the desk's marks do; a line with none reads as stored", () => {
    const trace = [{
      pass: 1, round: 1, trigger: 'evaluation', at: '2026-10-03T10:00:00.000Z', changedScopes: ['section:theStory'],
      findings: {
        structuralIssues: [
          'T5: The judge found a fault in the money and gave no detail.',
          'T4, T6: "Kai sold the memory" names a seller the ledger never shows.',
          'Reporter-mode violation: "i voted". Nova reports on the room from outside its choices.'
        ],
        advisoryWarnings: ["Em-dash in the narrator's prose: 1 em-dash (in section \"theStory\", paragraph 2)."]
      }
    }];
    const [pass] = traceView(trace, 'journalist').passes;
    expect(pass.mustFix).toEqual({
      label: 'Must fix (3)',
      items: [
        'The judge found a fault in the money and gave no detail.',
        '"Kai sold the memory" names a seller the ledger never shows.',
        'Reporter-mode violation: "i voted". Nova reports on the room from outside its choices.'
      ]
    });
    expect(pass.shouldConsider.items).toEqual(trace[0].findings.advisoryWarnings);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10e: a section code put back without its photo is marked at the section (the integrator's
// ruling 1 on the fifth wave's findings, 4.5g's minor 4). The mark for a section the director put
// in whole that code put back without a photo the article cannot print (4.5g's form (ii)) sat
// apart, because no piece of the desk prints a whole section's text. The mark for an entry about
// a whole section sits on that section's heading, where the line's "here" is.
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10e: a section code put back without its photo is marked at its heading', () => {
  const KEPT = ['huddle.jpg', 'theory.jpg'];
  const AFTERMATH = 'The morning after, the account was still open.';
  const LINE = 'automatic pass 1 took out a photo you placed here, which the article cannot print. The rest of your edit stands: place a photo the article can print here if it should have one.';
  const HEADING = { kind: 'heading', section: 4 };
  /** The fixture with a section the director added whole, holding a photo the session never took. */
  const withAftermath = () => {
    const directors = article();
    directors.sections.push({ id: 'aftermath', type: 'narrative', heading: 'Aftermath', content: [paragraph(AFTERMATH), photo('lost.jpg', 'Six people at the bar.')] });
    return directors;
  };
  const editsOf = (directors) => carriedEdits(standingAfterSendBack(null, article(), directors, 'bundle'), directors);
  /** The changed marks as [where the mark sits, its tone, where it says it is, its text]. */
  const changedMarks = (marks) => [
    ...Object.keys(marks.at).flatMap((key) => marks.at[key].map((m) => [key, m.tone, m.where, m.text])),
    ...marks.apart.map((m) => ['apart', m.tone, m.where, m.text])
  ].filter(([, tone]) => tone === 'changed');

  test("the mark sits on the section's heading and names it as its place; none sits apart", () => {
    const directors = withAftermath();
    const after = clone(directors);
    after.sections[4].content.splice(1, 1);
    const { output, report } = settleEdits(null, { edits: editsOf(directors), before: directors, after, pass: 1, photos: KEPT });
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', where: 'section "aftermath"', restored: true, unprintable: true })]);
    const d = payloadFor(output, { handEditReport: report });
    const marks = deskMarks(d, d.contentBundle);
    expect(changedMarks(marks)).toEqual([[deskAnchorKey(HEADING), 'changed', 'Aftermath, heading', `Aftermath: ${LINE}`]]);
    expect(deskMarksAt(marks, HEADING).map((m) => m.tone)).toEqual(['changed']);
  });

  test("a send-back's rework that changed the section sits on its heading; one that took the section out sits beside no piece", () => {
    const directors = withAftermath();
    const reason = [{ id: 'E1', reason: 'The note asked the aftermath to open on the account.' }];
    const changed = clone(directors);
    changed.sections[4].content[0].text = 'The account was still open the morning after.';
    const changedReport = reportAfterPass(null, { edits: editsOf(directors), before: directors, after: changed, pass: SEND_BACK_PASS, reasons: reason });
    const atHeading = payloadFor(changed, { handEditReport: changedReport });
    expect(changedMarks(deskMarks(atHeading, atHeading.contentBundle)).map(([key, , where]) => [key, where])).toEqual([[deskAnchorKey(HEADING), 'Aftermath, heading']]);

    const gone = clone(directors);
    gone.sections.splice(4, 1);
    const goneReport = reportAfterPass(null, { edits: editsOf(directors), before: directors, after: gone, pass: SEND_BACK_PASS, reasons: reason });
    const apart = payloadFor(gone, { handEditReport: goneReport });
    expect(changedMarks(deskMarks(apart, apart.contentBundle)).map(([key, , where]) => [key, where])).toEqual([['apart', '']]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 4.14c: the desk's last defects (the final review's desk 1 to 3). The desk's marks sit only
// where something needs them: beside the director's paragraph when code cannot tell which block
// is a pass's version of it, never for text the article no longer holds, and beside a Key
// Evidence entry a rework moved. Every report here is lib/hand-edit-diff.js settleEdits'.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.14c: the desk says what each pass did, and only what still holds', () => {
  const changedAt = (d) => {
    const marks = deskMarks(d, d.contentBundle);
    return [
      ...Object.keys(marks.at).sort().flatMap((key) => marks.at[key].filter((m) => m.tone === 'changed').map((m) => [key, m.text])),
      ...marks.apart.filter((m) => m.tone === 'changed').map((m) => ['apart', m.text])
    ];
  };

  test("where code cannot tell which block is the pass's version of the director's paragraph, the line sits beside the paragraph code put back", () => {
    const DIRECTORS = 'Thirteen sales landed in one account, and the room never asked whose account it was.';
    // About three in four of the director's words: a rewrite of theirs, or a paragraph of the pass's own.
    const REWRITE = 'Thirteen sales landed in a single account, and nobody in the room asked who held it.';
    const directors = clone(article());
    directors.sections[2].content[0] = paragraph(DIRECTORS);
    const edits = carriedEdits(standingAfterSendBack(null, article(), directors, 'bundle'), directors);
    // The pass moved the photo up and rewrote the paragraph under it.
    const pass = clone(directors);
    pass.sections[2].content = [photo('theory.jpg', 'Mel lays out the theory.'), paragraph(REWRITE)];
    const { output, report } = settleEdits(null, { edits, before: directors, after: pass, pass: 1 });
    expect(output.sections[2].content.map((b) => b.text || b.filename)).toEqual([DIRECTORS, 'theory.jpg', REWRITE]);
    expect(changedEditsToShow(report)).toHaveLength(1);
    const d = payloadFor(output, { handEditReport: report });
    expect(changedAt(d)).toEqual([[at(2, 0),
      `Follow the Money, paragraph: automatic pass 1 took out your "${DIRECTORS}". Your text was put back. "${REWRITE}" may be the pass's version of it: delete that block if your text now prints twice.`]]);
  });

  test("fix round 2: where two blocks may be the pass's version of the director's paragraph, the line beside it names both", () => {
    const DIRECTORS = 'Thirteen sales landed in one account, and the room never asked whose account it was.';
    // In its place: about two in three of the director's words, both ways.
    const REWRITE = 'Thirteen sales landed in a single account, and nobody in the room asked who held it.';
    // Below the photo, where nothing pairs it: fourteen of the director's fifteen words, which hold two in three of its own.
    const CLOSER = 'The room never once asked whose account it was, though thirteen sales landed in one account in the last two minutes.';
    const directors = clone(article());
    directors.sections[2].content[0] = paragraph(DIRECTORS);
    const edits = carriedEdits(standingAfterSendBack(null, article(), directors, 'bundle'), directors);
    const pass = clone(directors);
    pass.sections[2].content = [paragraph(REWRITE), photo('theory.jpg', 'Mel lays out the theory.'), paragraph(CLOSER)];
    const { output, report } = settleEdits(null, { edits, before: directors, after: pass, pass: 1 });
    expect(output.sections[2].content.map((b) => b.text || b.filename)).toEqual([DIRECTORS, REWRITE, 'theory.jpg', CLOSER]);
    const d = payloadFor(output, { handEditReport: report });
    expect(changedAt(d)).toEqual([[at(2, 0),
      `Follow the Money, paragraph: automatic pass 1 took out your "${DIRECTORS}". Your text was put back. "${CLOSER}" and "${REWRITE}" may each be the pass's version of it: delete each block that repeats your text.`]]);
  });

  test("a cut that came back in one pass and left in the next shows no line, and the record says the edit stands", () => {
    const writers = article();
    const cut = clone(writers);
    cut.sections[1].content.splice(4, 1);   // STORY_3 cut at the desk
    const edits = carriedEdits(standingAfterSendBack(null, writers, cut, 'bundle'), cut);
    const back = clone(cut);
    back.sections[2].content.push(paragraph(STORY_3));
    const one = settleEdits(null, { edits, before: cut, after: back, pass: 1 });
    expect(changedEditsToShow(one.report)).toHaveLength(1);
    const two = settleEdits(one.report, { edits: carriedEdits(standingAfterSendBack(null, writers, cut, 'bundle'), one.output), before: one.output, after: clone(cut), pass: 2 });
    const d = payloadFor(two.output, { handEditReport: two.report });
    expect(changedAt(d)).toEqual([]);
    expect(ViewLogic.steeringView(two.report, []).kept).toBe('Your edit stands.');
  });

  test('a Key Evidence entry a rework moved: a send-back\'s move sits beside the entry with its reason, and an automatic pass\'s, which code put back, folds below', () => {
    const entry = (tokenId, headline) => ({ tokenId, headline, summary: `${headline}, in the record.`, significance: 'supporting' });
    const withSidebar = (...ids) => {
      const b = article();
      b.evidenceCards = ids.map((id) => entry(id, `Entry ${id}`));
      return b;
    };
    const edits = carriedEdits(standingAfterSendBack(null, withSidebar('a001', 'b001', 'c001', 'vic001'), withSidebar('vic001', 'a001', 'b001', 'c001'), 'bundle'), withSidebar('vic001', 'a001', 'b001', 'c001'));
    const before = withSidebar('vic001', 'a001', 'b001', 'c001');
    const sendBack = settleEdits(null, { edits, before, after: withSidebar('a001', 'b001', 'c001', 'vic001'), pass: SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note puts Vic last.' }] });
    const d = payloadFor(sendBack.output, { handEditReport: sendBack.report });
    expect(changedAt(d)).toEqual([[deskAnchorKey({ kind: 'sidebar', index: 3 }),
      'Sidebar card vic001, moved within the sidebar: the rework of your send-back moved the entry you placed here to another place in the sidebar. Why: The note puts Vic last.']]);

    const automatic = settleEdits(null, { edits, before, after: withSidebar('a001', 'b001', 'c001', 'vic001'), pass: 1 });
    expect(automatic.output.evidenceCards.map((c) => c.tokenId)).toEqual(['vic001', 'a001', 'b001', 'c001']);
    expect(changedEditsToShow(automatic.report)).toEqual([]);
    expect(ViewLogic.steeringView(automatic.report, []).changedEdits.map((e) => e.line)).toEqual([
      'E1, sidebar card vic001, moved within the sidebar: automatic pass 1 moved the entry you placed here to another place in the sidebar. It was put back.'
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 4.14f (the integrator's ruling 1 on run 8's last tasks): a Key Evidence entry the director
// deleted stays deleted. Any entry of its tokenId a pass puts back, in any words, is the entry:
// after an automatic pass code took it out again, and the round's record says so, as the map does
// for a struck beat that comes back; after a send-back it stays, and its line sits beside it with
// the rework's reason. A sentence a rewrite removed that stays back through two passes gives one
// line. Every report here is lib/hand-edit-diff.js settleEdits'.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.14f: the desk says once what came of a deleted Key Evidence entry or a removed sentence', () => {
  const changedAt = (d) => {
    const marks = deskMarks(d, d.contentBundle);
    return [
      ...Object.keys(marks.at).sort().flatMap((key) => marks.at[key].filter((m) => m.tone === 'changed').map((m) => [key, m.text])),
      ...marks.apart.filter((m) => m.tone === 'changed').map((m) => ['apart', m.text])
    ];
  };
  /** The desk: the director deleted the Key Evidence entry and kept the card inline. */
  const deleted = () => ({ ...article(), evidenceCards: [] });
  const edits = () => carriedEdits(standingAfterSendBack(null, article(), deleted(), 'bundle'), deleted());
  /** The pass's output: the entry back under its tokenId, in new words. */
  const putBack = () => ({
    ...deleted(),
    evidenceCards: [{ tokenId: 'vic001', headline: 'The chair was promised', summary: 'Vic expected the company once Marcus was gone.', significance: 'critical' }]
  });

  test("after an automatic pass the entry is out again: no mark beside any piece, and the round's record says the pass put it back and code took it out", () => {
    const { output, report } = settleEdits(null, { edits: edits(), before: deleted(), after: putBack(), pass: 1 });
    expect(output.evidenceCards).toEqual([]);
    expect(changedAt(payloadFor(output, { handEditReport: report }))).toEqual([]);
    const record = ViewLogic.steeringView(report, []);
    expect(record.changedEdits.map((e) => e.line)).toEqual(['E1, sidebar card vic001, cut: automatic pass 1 put back the entry you deleted. It was taken out again.']);
    expect(record.kept).toBe('Your edit stands.');
  });

  test('after a send-back it stays, and its line sits beside it under Key Evidence, with the reason', () => {
    const after = putBack();
    const { output, report } = settleEdits(null, {
      edits: edits(), before: deleted(), after, pass: SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asks for every inline card in Key Evidence.' }]
    });
    expect(output).toBe(after);
    expect(changedAt(payloadFor(output, { handEditReport: report }))).toEqual([[deskAnchorKey({ kind: 'sidebar', index: 0 }),
      'Sidebar card vic001, cut: the rework of your send-back put back the entry you deleted. Why: The note asks for every inline card in Key Evidence.']]);
  });

  test('a sentence a rewrite removed that came back in pass 1 and stayed through pass 2 gives one line, beside where it is now', () => {
    const EXTRA = 'Nobody in the room asked about the second ledger.';
    const shown = article();
    shown.sections[1].content[0] = paragraph(`${STORY_1} ${EXTRA}`);
    const desk = article();
    const standing = standingAfterSendBack(null, shown, desk, 'bundle');
    const back = clone(desk);
    back.sections[3].content.push(paragraph(EXTRA));
    const one = settleEdits(null, { edits: carriedEdits(standing, desk), before: desk, after: back, pass: 1 });
    const two = settleEdits(one.report, { edits: carriedEdits(standing, one.output), before: one.output, after: clone(back), pass: 2 });
    expect(changedAt(payloadFor(two.output, { handEditReport: two.report }))).toEqual([[at(3, 1),
      `The Story: Eight Minutes, paragraph: a sentence you removed came back as "${EXTRA}" (automatic pass 1). It is still in the article: cut it again if it should go.`]]);
  });
});
