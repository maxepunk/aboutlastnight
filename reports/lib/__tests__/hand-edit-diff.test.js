/**
 * lib/hand-edit-diff.js — the director's hand edits as a diff the reviser can read
 * and code can verify (spec 2026-09-19 §4.2).
 */
const D = require('../hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));

const outlineBefore = () => ({
  lede: { hook: 'Old hook', keyTension: 'T', primaryArc: 'A', selectedEvidence: ['e1'] },
  closing: { finalQuestion: 'Q' }
});

const bundleBefore = () => ({
  metadata: { generatedAt: '1' },
  headline: { main: 'Old', kicker: 'K', deck: 'D' },
  byline: { name: 'Nova' },
  sections: [{
    id: 'intro', type: 'narrative', heading: 'H',
    content: [
      { type: 'paragraph', text: 'First paragraph about the vote.' },
      { type: 'paragraph', text: 'Second paragraph about the money.' }
    ]
  }],
  evidenceCards: [{ tokenId: 'alr001', headline: 'Card', content: 'C' }],
  pullQuotes: [{ text: 'Q1' }],
  photos: [],
  heroImage: 'a.jpg'
});

describe('diffOutline', () => {
  test('one changed field → one section with one change at a dotted path', () => {
    const after = outlineBefore(); after.lede.hook = 'New hook';
    expect(D.diffOutline(outlineBefore(), after)).toEqual({
      kind: 'outline',
      sections: [{ key: 'lede', changes: [{ path: 'lede.hook', before: 'Old hook', after: 'New hook' }] }]
    });
  });

  test('a nested array change is ONE change at the field path', () => {
    const after = outlineBefore(); after.lede.selectedEvidence = ['e1', 'e2'];
    const { sections } = D.diffOutline(outlineBefore(), after);
    expect(sections).toHaveLength(1);
    expect(sections[0].changes).toEqual([{ path: 'lede.selectedEvidence', before: ['e1'], after: ['e1', 'e2'] }]);
  });

  test('trailing whitespace is not a change', () => {
    const after = outlineBefore(); after.lede.hook = 'Old hook  ';
    expect(D.isEmpty(D.diffOutline(outlineBefore(), after))).toBe(true);
  });

  test('a section that is not an object on one side is one whole-section change', () => {
    const after = outlineBefore(); delete after.closing;
    const { sections } = D.diffOutline(outlineBefore(), after);
    expect(sections).toEqual([{ key: 'closing', changes: [{ path: 'closing', before: { finalQuestion: 'Q' }, after: undefined }] }]);
  });

  test('detective sections diff by their own keys', () => {
    const b = { executiveSummary: { summary: 'a' }, evidenceLocker: { groups: [] } };
    const a = { executiveSummary: { summary: 'b' }, evidenceLocker: { groups: [] } };
    expect(D.scopeKeys(D.diffOutline(b, a))).toEqual(['executiveSummary']);
  });

  test('identical → empty; malformed → empty, never throws', () => {
    expect(D.isEmpty(D.diffOutline(outlineBefore(), outlineBefore()))).toBe(true);
    expect(D.diffOutline(null, {})).toEqual({ kind: 'outline', sections: [] });
    expect(D.diffOutline('x', 3)).toEqual({ kind: 'outline', sections: [] });
    expect(D.diffOutline(undefined, undefined)).toEqual({ kind: 'outline', sections: [] });
  });
});

describe('diffBundle', () => {
  test('headline field change is scoped to headline', () => {
    const after = bundleBefore(); after.headline.main = 'New';
    expect(D.diffBundle(bundleBefore(), after).scopes).toEqual([
      { key: 'headline', changes: [{ path: 'headline.main', before: 'Old', after: 'New' }] }
    ]);
  });

  test('metadata, voice_self_check and _revisionHistory are ignored', () => {
    const after = bundleBefore(); after.metadata.generatedAt = '2'; after._revisionHistory = [{ x: 1 }]; after.voice_self_check = 'ok';
    expect(D.isEmpty(D.diffBundle(bundleBefore(), after))).toBe(true);
  });

  test('a section is matched by id; an edited paragraph is one change at its after-index', () => {
    const after = bundleBefore(); after.sections[0].content[1].text = 'Second paragraph, rewritten.';
    const { scopes } = D.diffBundle(bundleBefore(), after);
    expect(scopes).toHaveLength(1);
    expect(scopes[0].key).toBe('section:intro');
    expect(scopes[0].changes).toEqual([{
      path: 'sections[#intro].content[1]',
      before: { type: 'paragraph', text: 'Second paragraph about the money.' },
      after: { type: 'paragraph', text: 'Second paragraph, rewritten.' }
    }]);
  });

  test('an inserted paragraph does not flood: later blocks still match by type + text prefix', () => {
    const after = bundleBefore(); after.sections[0].content.splice(1, 0, { type: 'paragraph', text: 'Inserted.' });
    const { scopes } = D.diffBundle(bundleBefore(), after);
    expect(scopes[0].changes).toEqual([{ path: 'sections[#intro].content[1]', before: null, after: { type: 'paragraph', text: 'Inserted.' } }]);
  });

  test('a removed block is one removed change', () => {
    const after = bundleBefore(); after.sections[0].content.pop();
    const { scopes } = D.diffBundle(bundleBefore(), after);
    expect(scopes[0].changes).toEqual([{ path: 'sections[#intro].content[-]', before: { type: 'paragraph', text: 'Second paragraph about the money.' }, after: null }]);
  });

  test('a section heading change and a removed section', () => {
    const a1 = bundleBefore(); a1.sections[0].heading = 'New H';
    expect(D.diffBundle(bundleBefore(), a1).scopes[0].changes).toEqual([{ path: 'sections[#intro].heading', before: 'H', after: 'New H' }]);
    const a2 = bundleBefore(); a2.sections = [];
    expect(D.diffBundle(bundleBefore(), a2).scopes).toEqual([{ key: 'section:intro', changes: [{ path: 'sections[#intro]', before: bundleBefore().sections[0], after: null }] }]);
  });

  test('evidence cards match by tokenId; pull quotes and photos by index', () => {
    const after = bundleBefore();
    after.evidenceCards[0].content = 'C2';
    after.evidenceCards.push({ tokenId: 'alr002', headline: 'New card', content: 'N' });
    after.pullQuotes[0].text = 'Q1 edited';
    after.photos.push({ filename: 'p.jpg', caption: 'cap' });
    const { scopes } = D.diffBundle(bundleBefore(), after);
    const byKey = Object.fromEntries(scopes.map((s) => [s.key, s.changes]));
    expect(byKey.evidenceCards).toEqual([
      { path: 'evidenceCards[#alr001]', before: { tokenId: 'alr001', headline: 'Card', content: 'C' }, after: { tokenId: 'alr001', headline: 'Card', content: 'C2' } },
      { path: 'evidenceCards[#alr002]', before: null, after: { tokenId: 'alr002', headline: 'New card', content: 'N' } }
    ]);
    expect(byKey.pullQuotes).toEqual([{ path: 'pullQuotes[0]', before: { text: 'Q1' }, after: { text: 'Q1 edited' } }]);
    expect(byKey.photos).toEqual([{ path: 'photos[0]', before: null, after: { filename: 'p.jpg', caption: 'cap' } }]);
  });

  test('heroImage and financialTracker', () => {
    const after = bundleBefore(); after.heroImage = 'b.jpg'; after.financialTracker = { title: 'Money' };
    const keys = D.scopeKeys(D.diffBundle(bundleBefore(), after)).sort();
    expect(keys).toEqual(['financialTracker', 'heroImage']);
  });

  test('malformed → empty, never throws', () => {
    expect(D.diffBundle(null, bundleBefore())).toEqual({ kind: 'bundle', scopes: [] });
    expect(D.diffBundle({ sections: 'nope' }, { sections: 5 })).toEqual({ kind: 'bundle', scopes: [] });
  });
});


// ─── The director's edits are final (before phase 4, F1; spec section 7) ─────────

const paragraph = (text) => ({ type: 'paragraph', text });

const CLOSING_EDIT = 'Alex wanted Marcus out of the company, and the January demand says so.';
const CUT_THEORY = 'The room also weighed whether Vic would replace Marcus, not kill him.';
const SARAH_LINE = 'Sarah pointed the room at the baby mama, and the vote followed.';

/** An article as the stop shows it: the writer's text throughout. */
const articleAtStop = () => ({
  metadata: { generatedAt: '1' },
  headline: { main: 'The Room Voted', kicker: 'NovaNews', deck: 'Nine players, one verdict' },
  sections: [
    { id: 'lede', type: 'narrative', content: [paragraph('Alex had Blake pull up the scoreboard at the last minute.')] },
    {
      id: 'the-story', type: 'narrative', heading: 'The Story',
      content: [paragraph('Mel built the first theory around the fight and the fraud.'), paragraph(CUT_THEORY), paragraph(SARAH_LINE)]
    },
    { id: 'closing', type: 'narrative', heading: 'Closing', content: [paragraph('Whether the verdict costs Alex anything is still open.')] }
  ]
});

/** The director's version: the closing rewritten, the debated theory cut. */
const directorsVersion = () => {
  const a = articleAtStop();
  a.sections[2].content[0] = paragraph(CLOSING_EDIT);
  a.sections[1].content.splice(1, 1);
  return a;
};

const roundOne = () => D.standingAfterSendBack(null, articleAtStop(), directorsVersion(), 'bundle');

describe('standing edits (F1)', () => {
  test('a send-back with edits gives each change an id, its scope and path, the text before and the director\'s text', () => {
    expect(roundOne()).toEqual({
      kind: 'bundle',
      issued: 2,
      edits: [
        // A cut records its pieces: each sentence of the text it removed that the
        // director's version no longer held (fix round 1, finding 3).
        {
          id: 'E1', scope: 'section:the-story', path: 'sections[#the-story].content[-]', before: paragraph(CUT_THEORY), after: null,
          pieces: ['The room also weighed whether Vic would replace Marcus, not kill him']
        },
        { id: 'E2', scope: 'section:closing', path: 'sections[#closing].content[0]', before: paragraph('Whether the verdict costs Alex anything is still open.'), after: paragraph(CLOSING_EDIT) }
      ]
    });
  });

  test('an earlier round\'s edit stands after a send-back without edits when the stop showed its text', () => {
    const shown = directorsVersion();
    shown.sections[0].content.push({ type: 'photo', filename: 'p1.jpg', caption: 'The huddle' });   // the rework moved a photo
    expect(D.standingAfterSendBack(roundOne(), shown, shown, 'bundle')).toEqual(roundOne());
  });

  test('an earlier edit drops when the version the stop showed changed it', () => {
    const shown = directorsVersion();
    shown.sections[2].content[0] = paragraph('Alex may yet pay for the verdict.');
    const next = D.standingAfterSendBack(roundOne(), shown, shown, 'bundle');
    expect(next.edits.map((e) => e.id)).toEqual(['E1']);
    expect(next.issued).toBe(2);
  });

  test('a cut stands while its text stays absent, and drops when the text came back', () => {
    expect(D.standingAfterSendBack(roundOne(), directorsVersion(), directorsVersion(), 'bundle').edits.map((e) => e.id)).toEqual(['E1', 'E2']);
    const back = directorsVersion();
    back.sections[0].content.push(paragraph(CUT_THEORY));   // a rework put it back, in another section
    expect(D.standingAfterSendBack(roundOne(), back, back, 'bundle').edits.map((e) => e.id)).toEqual(['E2']);
  });

  test('ids are stable across rounds, and a new edit takes the next number', () => {
    const shown = directorsVersion();
    shown.sections[2].content[0] = paragraph('Alex may yet pay for the verdict.');   // the rework changed E2
    const sentBack = JSON.parse(JSON.stringify(shown));
    sentBack.headline.main = 'Alex Reeves Pointed the Room at Jess Kane';
    const two = D.standingAfterSendBack(roundOne(), shown, sentBack, 'bundle');
    expect(two.edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#the-story].content[-]'], ['E3', 'headline.main']]);
    expect(two.issued).toBe(3);

    const thirdSentBack = JSON.parse(JSON.stringify(sentBack));
    thirdSentBack.headline.deck = 'The room named Alex, five votes to four';
    const three = D.standingAfterSendBack(two, sentBack, thirdSentBack, 'bundle');
    expect(three.edits.map((e) => e.id)).toEqual(['E1', 'E3', 'E4']);
    expect(three.issued).toBe(4);
  });

  test('a director who rewrites their own edit replaces it: the old id drops and the new text takes the next one', () => {
    const shown = directorsVersion();
    const sentBack = directorsVersion();
    sentBack.sections[2].content[0] = paragraph('Alex wanted Marcus out. The January demand is in writing.');
    const next = D.standingAfterSendBack(roundOne(), shown, sentBack, 'bundle');
    expect(next.edits.map((e) => [e.id, e.after ? e.after.text : null])).toEqual([['E1', null], ['E3', 'Alex wanted Marcus out. The January demand is in writing.']]);
  });

  test('the outline\'s edits stand the same way', () => {
    const shown = outlineBefore();
    const sentBack = outlineBefore(); sentBack.lede.hook = 'A sharper hook.';
    const one = D.standingAfterSendBack(null, shown, sentBack, 'outline');
    expect(one).toEqual({ kind: 'outline', issued: 1, edits: [{ id: 'E1', scope: 'lede', path: 'lede.hook', before: 'Old hook', after: 'A sharper hook.' }] });
    expect(D.standingAfterSendBack(one, sentBack, sentBack, 'outline')).toEqual(one);
  });

  test('nothing standing and nothing issued is null; earlier ids keep the counter', () => {
    expect(D.standingAfterSendBack(null, articleAtStop(), articleAtStop(), 'bundle')).toBeNull();
    const shown = articleAtStop();   // the rework undid both: the closing is the writer's again and the theory is back
    expect(D.standingAfterSendBack(roundOne(), shown, shown, 'bundle')).toEqual({ kind: 'bundle', issued: 2, edits: [] });
  });

  test('a diff stored before the edits had ids reads as standing edits, numbered in order', () => {
    // A diff from before F1 recorded no pieces for its cuts: every sentence of a cut's
    // text then locates its return.
    const withoutPieces = (standing) => ({ ...standing, edits: standing.edits.map(({ pieces, ...edit }) => edit) });
    const legacy = D.standingEditsOf(D.diffBundle(articleAtStop(), directorsVersion()));
    expect(legacy).toEqual(withoutPieces(roundOne()));
    expect(D.carriedEdits(legacy, directorsVersion()).map((e) => e.id)).toEqual(['E1', 'E2']);
    const back = directorsVersion();
    back.sections[0].content.push(paragraph(CUT_THEORY));
    expect(D.carriedEdits(legacy, back).map((e) => e.id)).toEqual(['E2']);
    expect(D.standingEditsOf(D.diffOutline({}, {}))).toBeNull();
    expect(D.standingEditsOf(null)).toBeNull();
    expect(D.standingEditsOf('nope')).toBeNull();
  });
});

// Fix round 1, finding 3: a cut comes back when any sentence of it does, word for word,
// counting only the sentences the director's version no longer held.
describe('a cut that partly came back (F1, fix round 1)', () => {
  const OPEN_QUESTIONS = 'Some in the room thought Vic would replace Marcus. Others thought Phil had done it. Nobody settled it before the vote.';
  const writers = () => ({
    headline: { main: 'H', kicker: 'K', deck: 'D' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Mel built the first theory.')] },
      { id: 'story', type: 'narrative', content: [paragraph('Mel kept the count.'), paragraph(OPEN_QUESTIONS), paragraph('Sarah pointed the room at Jess.')] }
    ]
  });
  const cutFrom = (article) => { const a = clone(article); a.sections[1].content.splice(1, 1); return a; };
  const withParagraph = (article, text) => { const a = clone(article); a.sections[1].content.splice(1, 0, paragraph(text)); return a; };

  test('the cut records each sentence of the text it removed', () => {
    const standing = D.standingAfterSendBack(null, writers(), cutFrom(writers()), 'bundle');
    expect(standing.edits).toHaveLength(1);
    expect(standing.edits[0].pieces).toEqual([
      'Some in the room thought Vic would replace Marcus',
      'Others thought Phil had done it',
      'Nobody settled it before the vote'
    ]);
  });

  test('a rework that brings back one sentence word for word voids the cut at the next send-back', () => {
    const directors = cutFrom(writers());
    const standing = D.standingAfterSendBack(null, writers(), directors, 'bundle');
    const shown = withParagraph(directors, 'Others thought Phil had done it.');
    expect(D.carriedEdits(standing, shown)).toEqual([]);
    expect(D.standingAfterSendBack(standing, shown, shown, 'bundle')).toEqual({ kind: 'bundle', issued: 1, edits: [] });
  });

  test('a sentence brought back inside a longer one, in any case, counts; a sentence cut short does not', () => {
    const directors = cutFrom(writers());
    const standing = D.standingAfterSendBack(null, writers(), directors, 'bundle');
    expect(D.carriedEdits(standing, withParagraph(directors, 'By noon, others thought Phil had done it, and Mel agreed.'))).toEqual([]);
    expect(D.carriedEdits(standing, withParagraph(directors, 'NOBODY SETTLED IT BEFORE THE VOTE!'))).toEqual([]);
    expect(D.carriedEdits(standing, withParagraph(directors, 'Nobody settled it before the voters left.')).map((e) => e.id)).toEqual(['E1']);
  });

  test('a sentence the director\'s version still held elsewhere is not a piece, so it does not void the cut', () => {
    const article = writers();
    article.sections[0].content.push(paragraph('Others thought Phil had done it.'));
    const directors = cutFrom(article);
    const standing = D.standingAfterSendBack(null, article, directors, 'bundle');
    expect(standing.edits[0].pieces).toEqual(['Some in the room thought Vic would replace Marcus', 'Nobody settled it before the vote']);
    expect(D.standingAfterSendBack(standing, directors, directors, 'bundle').edits.map((e) => e.id)).toEqual(['E1']);
    expect(D.carriedEdits(standing, withParagraph(directors, 'Nobody settled it before the vote.'))).toEqual([]);
  });

  test('a cut of a paragraph the director\'s version still prints elsewhere stands', () => {
    const article = writers();
    article.sections[0].content.push(paragraph(OPEN_QUESTIONS));   // the writer printed it twice
    const directors = cutFrom(article);
    const standing = D.standingAfterSendBack(null, article, directors, 'bundle');
    expect(standing.edits[0].pieces).toEqual([]);
    expect(D.standingAfterSendBack(standing, directors, directors, 'bundle').edits.map((e) => e.id)).toEqual(['E1']);
  });

  test('the report counts a partial return as a change, with the text where it came back', () => {
    const directors = cutFrom(writers());
    const standing = D.standingAfterSendBack(null, writers(), directors, 'bundle');
    const after = withParagraph(directors, 'Others thought Phil had done it.');
    const report = D.reportAfterPass(null, { edits: D.carriedEdits(standing, directors), before: directors, after, pass: 1 });
    expect(report).toEqual({
      checked: ['E1'],
      changed: [{
        id: 'E1', scope: 'section:story', cut: true, director: OPEN_QUESTIONS,
        became: 'Others thought Phil had done it.', pass: 1, automatic: true, reason: null
      }]
    });
  });
});

describe('carriedEdits (F1)', () => {
  let standing;
  beforeEach(() => { standing = roundOne(); });

  test('the version the director sent back carries every edit', () => {
    expect(D.carriedEdits(standing, directorsVersion()).map((e) => e.id)).toEqual(['E1', 'E2']);
  });

  test('a block the rework moved to another section is still the director\'s', () => {
    const moved = directorsVersion();
    moved.sections[2].content = [];
    moved.sections[0].content.push(paragraph(CLOSING_EDIT));
    expect(D.carriedEdits(standing, moved).map((e) => e.id)).toEqual(['E1', 'E2']);
  });

  test('an edit the rework changed, and a cut the rework brought back, are not carried', () => {
    const changed = directorsVersion();
    changed.sections[2].content[0] = paragraph('Alex may yet pay for the verdict.');
    changed.headline.deck = CUT_THEORY;
    expect(D.carriedEdits(standing, changed)).toEqual([]);
  });

  test('takes standing edits, a list of edits or a diff stored before the edits had ids', () => {
    expect(D.carriedEdits(standing.edits, directorsVersion()).map((e) => e.id)).toEqual(['E1', 'E2']);
    expect(D.carriedEdits(D.diffBundle(articleAtStop(), directorsVersion()), directorsVersion()).map((e) => e.id)).toEqual(['E1', 'E2']);
    expect(D.carriedEdits(null, directorsVersion())).toEqual([]);
    expect(D.carriedEdits(standing, null)).toEqual([]);
  });

  // The survival rules of the report before F1 (changedScopes), kept for the edits.
  test('an outline field is carried while the version keeps the director\'s value', () => {
    const sentBack = outlineBefore(); sentBack.lede.hook = 'New hook'; sentBack.closing.finalQuestion = 'Q2';
    const outlineStanding = D.standingAfterSendBack(null, outlineBefore(), sentBack, 'outline');
    expect(D.carriedEdits(outlineStanding, clone(sentBack)).map((e) => e.path)).toEqual(['lede.hook', 'closing.finalQuestion']);
    const reverted = clone(sentBack); reverted.lede.hook = 'Old hook';
    expect(D.carriedEdits(outlineStanding, reverted).map((e) => e.path)).toEqual(['closing.finalQuestion']);
    const elsewhere = clone(sentBack); elsewhere.lede.keyTension = 'the rework changed an unedited field';
    expect(D.carriedEdits(outlineStanding, elsewhere)).toHaveLength(2);
  });

  test('an edited block survives a block inserted before it, a trailing newline and an optional field the rework added', () => {
    const sentBack = bundleBefore(); sentBack.sections[0].content[1].text = 'Second paragraph, rewritten.'; sentBack.pullQuotes[0].text = 'Q1 edited';
    const s = D.standingAfterSendBack(null, bundleBefore(), sentBack, 'bundle');
    const shifted = clone(sentBack);
    shifted.sections[0].content.unshift(paragraph('A new opening the rework added.'));
    shifted.sections[0].content[2].text = 'Second paragraph, rewritten.\n';
    shifted.pullQuotes.unshift({ text: 'Q0 the rework added' });
    shifted.pullQuotes[1].attribution = 'Nova';
    expect(D.carriedEdits(s, shifted)).toHaveLength(2);
  });

  test('a block whose director-set field the rework removed is not carried', () => {
    const sentBack = bundleBefore();
    sentBack.sections[0].content[1] = { type: 'quote', text: 'Second paragraph, rewritten.', attribution: 'Vic' };
    const s = D.standingAfterSendBack(null, bundleBefore(), sentBack, 'bundle');
    const stripped = clone(sentBack); delete stripped.sections[0].content[1].attribution;
    expect(D.carriedEdits(s, stripped)).toEqual([]);
  });

  test('a nested outline value kept with surrounding whitespace is carried', () => {
    const sentBack = outlineBefore(); sentBack.lede.selectedEvidence = ['e1', 'e2'];
    const s = D.standingAfterSendBack(null, outlineBefore(), sentBack, 'outline');
    const revised = clone(sentBack); revised.lede.selectedEvidence = [' e1', 'e2\n'];
    expect(D.carriedEdits(s, revised)).toHaveLength(1);
  });
});

describe('formatEditLines (F1): each edit by id and section, with the director\'s text as written', () => {
  test('a paragraph prints its text, and a cut says so', () => {
    expect(D.formatEditLines(roundOne().edits)).toBe([
      `E1 (section "the-story", paragraph, cut): "${CUT_THEORY}"`,
      `E2 (section "closing", paragraph): "${CLOSING_EDIT}"`
    ].join('\n'));
  });

  test('a field prints its path within its scope; a structured value prints whole, as JSON', () => {
    const sentBack = articleAtStop();
    sentBack.headline.main = 'Alex Reeves Pointed the Room at Jess Kane';
    sentBack.sections[1].content.push({ type: 'evidence-card', tokenId: 'jes002', headline: 'Two cards', content: 'You can have him.' });
    const lines = D.formatEditLines(D.standingAfterSendBack(null, articleAtStop(), sentBack, 'bundle').edits).split('\n');
    expect(lines).toEqual([
      'E1 (headline, main): "Alex Reeves Pointed the Room at Jess Kane"',
      'E2 (section "the-story", evidence-card): {"content":"You can have him.","headline":"Two cards","tokenId":"jes002","type":"evidence-card"}'
    ]);
    const outline = outlineBefore(); outline.lede.hook = 'A sharper hook.';
    expect(D.formatEditLines(D.standingAfterSendBack(null, outlineBefore(), outline, 'outline').edits)).toBe('E1 (lede, hook): "A sharper hook."');
  });

  test('the director\'s text is never shortened', () => {
    const long = `${'The room argued for an hour. '.repeat(120)}`.trim();
    const sentBack = articleAtStop(); sentBack.sections[2].content[0] = paragraph(long);
    expect(D.formatEditLines(D.standingAfterSendBack(null, articleAtStop(), sentBack, 'bundle').edits)).toContain(long);
  });
});

describe('locateQuotedText (F1): whose text an issue quotes', () => {
  const output = directorsVersion();
  let edits;
  beforeEach(() => { edits = D.carriedEdits(roundOne(), output); });

  test('a quote of the director\'s edit names the edit', () => {
    expect(D.locateQuotedText(`T1: "${CLOSING_EDIT}" states a motive as fact.`, edits, output)).toEqual({ editIds: ['E2'], writer: false });
  });

  test('a quote of the text the director cut names the cut', () => {
    expect(D.locateQuotedText('T2: the room\'s theory "Vic would replace Marcus, not kill him" goes unreported.', edits, output))
      .toEqual({ editIds: ['E1'], writer: false });
  });

  test('a quote of the writer\'s text is the writer\'s', () => {
    expect(D.locateQuotedText(`T12: "${SARAH_LINE}" puts the line in the wrong mouth.`, edits, output)).toEqual({ editIds: [], writer: true });
  });

  test('an issue that quotes both is the writer\'s too', () => {
    expect(D.locateQuotedText(`T1: "${CLOSING_EDIT}" repeats "${SARAH_LINE}"`, edits, output)).toEqual({ editIds: ['E2'], writer: true });
  });

  test('a passage the writer\'s text also holds is the writer\'s', () => {
    const copied = directorsVersion();
    copied.sections[0].content.push(paragraph(`As the closing says: ${CLOSING_EDIT}`));
    expect(D.locateQuotedText(`T1: "${CLOSING_EDIT}"`, D.carriedEdits(roundOne(), copied), copied)).toEqual({ editIds: [], writer: true });
  });

  test('a quote matches across case and an ellipsis; a passage under three words locates nothing', () => {
    expect(D.locateQuotedText('T1: "alex wanted Marcus out ... the January demand says so"', edits, output)).toEqual({ editIds: ['E2'], writer: false });
    expect(D.locateQuotedText('T9: "Alex" and "the vote" are named.', edits, output)).toEqual({ editIds: [], writer: false });
    expect(D.locateQuotedText('T1: the closing states a motive.', edits, output)).toEqual({ editIds: [], writer: false });
  });
});

describe('directorEditConcern (F1)', () => {
  test('opens with the one prefix and the edit\'s id, then the finding', () => {
    expect(D.DIRECTOR_EDIT_PREFIX).toBe("Director's edit ");
    expect(D.directorEditConcern(['E2'], 'T1: the closing states a motive.')).toBe("Director's edit E2: T1: the closing states a motive.");
    expect(D.directorEditConcern(['E1', 'E3'], 'T2: x')).toBe("Director's edit E1, E3: T2: x");
    expect(D.directorEditConcern(['E2'], "Director's edit E2: T1: already filed")).toBe("Director's edit E2: T1: already filed");
  });
});

describe('reportAfterPass (F1): what each pass did to the director\'s edits', () => {
  let standing;
  beforeEach(() => { standing = roundOne(); });
  const sendBackOutput = () => {
    const a = directorsVersion();
    a.sections[2].content[0] = paragraph('Alex wanted Marcus gone, and nobody asked why.');
    return a;
  };
  /** One pass: the edits the version it started from carries, and the version it returned. */
  const pass = (before, after, extra) => ({ edits: D.carriedEdits(standing, before), before, after, ...extra });

  test('accumulates across the send-back\'s rework and an automatic pass, with the pass and the reason', () => {
    const one = D.reportAfterPass(null, pass(directorsVersion(), sendBackOutput(), {
      pass: D.SEND_BACK_PASS,
      reasons: [{ id: 'E2', reason: 'The note asked the closing to end on the open question.' }]
    }));
    expect(one).toEqual({
      checked: ['E1', 'E2'],
      changed: [{
        id: 'E2', scope: 'section:closing', cut: false, director: CLOSING_EDIT,
        became: 'Alex wanted Marcus gone, and nobody asked why.',
        pass: 'send-back', automatic: false, reason: 'The note asked the closing to end on the open question.'
      }]
    });

    // Automatic pass 1 starts from the send-back's output, which carries E1 alone, and
    // brings the cut theory back: a cut that came back counts as changed, and flagged.
    const back = sendBackOutput();
    back.sections[1].content.splice(1, 0, paragraph(CUT_THEORY));
    const two = D.reportAfterPass(one, pass(sendBackOutput(), back, { pass: 1 }));
    expect(two.checked).toEqual(['E1', 'E2']);
    expect(two.changed).toEqual([
      one.changed[0],
      { id: 'E1', scope: 'section:the-story', cut: true, director: CUT_THEORY, became: CUT_THEORY, pass: 1, automatic: true, reason: null }
    ]);
  });

  test('an edit that is gone says so; a pass that keeps every edit adds nothing', () => {
    const gone = directorsVersion(); gone.sections[2].content = [];
    const report = D.reportAfterPass(null, pass(directorsVersion(), gone, { pass: 2 }));
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E2', became: null, automatic: true, pass: 2, reason: null })]);
    expect(D.reportAfterPass(null, pass(directorsVersion(), directorsVersion(), { pass: 1 }))).toEqual({ checked: ['E1', 'E2'], changed: [] });
  });

  test('a reason the rework gives for an edit it kept is not a change', () => {
    const report = D.reportAfterPass(null, pass(directorsVersion(), directorsVersion(), {
      pass: D.SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'Kept as written.' }]
    }));
    expect(report.changed).toEqual([]);
  });

  test('with no edit carried, the report stays as it was', () => {
    expect(D.reportAfterPass(null, { edits: [], before: directorsVersion(), after: directorsVersion(), pass: 1 })).toBeNull();
    const kept = { checked: ['E1'], changed: [] };
    expect(D.reportAfterPass(kept, { edits: [], before: directorsVersion(), after: directorsVersion(), pass: 2 })).toBe(kept);
  });

  test('handEditReportOf passes the report on and reads a report from before F1 as none', () => {
    const report = D.reportAfterPass(null, pass(directorsVersion(), directorsVersion(), { pass: 1 }));
    expect(D.handEditReportOf(report)).toEqual(report);
    expect(D.handEditReportOf({ checked: ['lede'], changed: ['lede'] })).toBeNull();
    expect(D.handEditReportOf(null)).toBeNull();
  });
});

test('readAtPath resolves ids, indexes and missing segments', () => {
  const b = bundleBefore();
  expect(D.readAtPath(b, 'sections[#intro].content[1].text')).toBe('Second paragraph about the money.');
  expect(D.readAtPath(b, 'evidenceCards[#alr001].content')).toBe('C');
  expect(D.readAtPath(b, 'pullQuotes[0].text')).toBe('Q1');
  expect(D.readAtPath(b, 'sections[#nope].heading')).toBeUndefined();
  expect(D.readAtPath(b, 'sections[#intro].content[-]')).toBeUndefined();
  expect(D.readAtPath(null, 'x')).toBeUndefined();
});
