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


// ─── The director's edits are final (before phase 4, F1, completed by FA; spec section 7) ───

const paragraph = (text) => ({ type: 'paragraph', text });
/** An edit without its steps: the parts most tests read. */
const bare = ({ at, ...edit }) => edit;

const CLOSING_EDIT = 'Alex wanted Marcus out of the company, and the January demand says so.';
const WRITERS_CLOSING = 'Whether the verdict costs Alex anything is still open.';
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
    { id: 'closing', type: 'narrative', heading: 'Closing', content: [paragraph(WRITERS_CLOSING)] }
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
  test('a send-back with edits records each field the director changed: its id, scope, path, steps, the text before and the director\'s text', () => {
    expect(roundOne()).toEqual({
      kind: 'bundle',
      issued: 2,
      edits: [
        // A cut records its pieces: each sentence of the text it removed that the
        // director's version no longer held (fix round 1, finding 3).
        {
          id: 'E1', scope: 'section:the-story', path: 'sections[#the-story].content[-]',
          at: [{ key: 'sections' }, { index: null, match: { id: 'the-story' } }, { key: 'content' }, { index: null, match: { type: 'paragraph', text: CUT_THEORY } }],
          before: paragraph(CUT_THEORY), after: null,
          pieces: ['The room also weighed whether Vic would replace Marcus, not kill him']
        },
        // FA (requirements 2 and 3): the paragraph's text is the field the director
        // changed, and the sentence the rewrite dropped is removed text.
        {
          id: 'E2', scope: 'section:closing', path: 'sections[#closing].content[0].text',
          at: [{ key: 'sections' }, { index: null, match: { id: 'closing' } }, { key: 'content' }, { index: 0, match: { type: 'paragraph', text: CLOSING_EDIT } }, { key: 'text' }],
          before: WRITERS_CLOSING, after: CLOSING_EDIT,
          removed: [WRITERS_CLOSING]
        }
      ]
    });
  });

  test('an earlier round\'s edit stands after a send-back without edits when the stop showed its text', () => {
    const shown = directorsVersion();
    shown.sections[0].content.push({ type: 'photo', filename: 'p1.jpg', caption: 'The huddle' });   // the rework placed a photo
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
    expect(next.edits.map((e) => [e.id, e.after])).toEqual([['E1', null], ['E3', 'Alex wanted Marcus out. The January demand is in writing.']]);
  });

  test('the outline\'s edits stand the same way', () => {
    const shown = outlineBefore();
    const sentBack = outlineBefore(); sentBack.lede.hook = 'A sharper hook.';
    const one = D.standingAfterSendBack(null, shown, sentBack, 'outline');
    expect(one).toEqual({
      kind: 'outline', issued: 1,
      edits: [{ id: 'E1', scope: 'lede', path: 'lede.hook', at: [{ key: 'lede' }, { key: 'hook' }], before: 'Old hook', after: 'A sharper hook.' }]
    });
    expect(D.standingAfterSendBack(one, sentBack, sentBack, 'outline')).toEqual(one);
  });

  test('nothing standing and nothing issued is null; earlier ids keep the counter', () => {
    expect(D.standingAfterSendBack(null, articleAtStop(), articleAtStop(), 'bundle')).toBeNull();
    const shown = articleAtStop();   // the rework undid both: the closing is the writer's again and the theory is back
    expect(D.standingAfterSendBack(roundOne(), shown, shown, 'bundle')).toEqual({ kind: 'bundle', issued: 2, edits: [] });
  });

  test('a diff stored before the edits had ids reads as the same field-level edits, numbered in order', () => {
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

// FA, requirement 2: an edit records the element and the field the director changed.
// F1 recorded a whole field or block (one arc's photo purpose made all of
// `theStory.arcs` the director's), so the writer's untouched text inside it read as
// the director's (final review, finding 4).
describe('an edit is the field the director changed (FA)', () => {
  const ARC_PURPOSE = 'The huddle where the case began.';
  const BREACH = 'Shows that Alex poisoned Marcus at midnight.';
  const outlineWithArcs = () => ({
    lede: { hook: 'Marcus died with a sale on his lips.' },
    theStory: {
      arcs: [
        { name: 'The case against Jess', paragraphCount: 3, photoPlacement: { filename: 'p1.jpg', afterParagraph: 1, purpose: ARC_PURPOSE } },
        { name: 'The money', paragraphCount: 2, photoPlacement: { filename: 'p2.jpg', afterParagraph: 1, purpose: BREACH } }
      ]
    },
    followTheMoney: {
      shellAccounts: [{ name: 'JessKane', total: 3235000, inference: 'A name put on top of the board.' }, { name: 'Banana', total: 2505000 }]
    },
    thePlayers: { characterHighlights: { Sarah: 'Sarah pointed the room at the baby mama.', Kai: 'Kai worked the dictionary safe.' } },
    closing: { arcResolutions: [{ arcName: 'The case against Jess', resolution: 'The case went off in the hands of Alex.' }] }
  });
  const editsFor = (shown, sentBack, kind) => D.standingAfterSendBack(null, shown, sentBack, kind).edits;

  test('one arc\'s photo purpose is one edit at that arc\'s field, and a finding about another arc quotes the writer', () => {
    const sentBack = outlineWithArcs();
    sentBack.theStory.arcs[0].photoPlacement.purpose = 'Jess at the bar, before anyone named her.';
    const edits = editsFor(outlineWithArcs(), sentBack, 'outline');
    expect(edits.map(bare)).toEqual([{
      id: 'E1', scope: 'theStory', path: 'theStory.arcs[0].photoPlacement.purpose',
      before: ARC_PURPOSE, after: 'Jess at the bar, before anyone named her.', removed: [ARC_PURPOSE]
    }]);
    expect(D.locateQuotedText(`T1: "${BREACH.slice(0, -1)}" states a poisoning as fact.`, D.carriedEdits(edits, sentBack), sentBack))
      .toEqual({ editIds: [], writer: true });
    expect(D.formatEditLines(edits)).toBe([
      'E1 (theStory, arcs "The case against Jess", photoPlacement, purpose): "Jess at the bar, before anyone named her."',
      `  removed: "${ARC_PURPOSE}"`
    ].join('\n'));
  });

  test('an account, a character highlight and an arc resolution are each one field', () => {
    const sentBack = outlineWithArcs();
    sentBack.followTheMoney.shellAccounts[0].inference = 'The room heard it as more than double the second.';
    sentBack.thePlayers.characterHighlights.Sarah = 'Sarah named the baby mama, and the room turned.';
    sentBack.closing.arcResolutions[0].resolution = 'The case against Jess failed in the room.';
    expect(editsFor(outlineWithArcs(), sentBack, 'outline').map((e) => [e.id, e.path, e.after])).toEqual([
      ['E1', 'followTheMoney.shellAccounts[0].inference', 'The room heard it as more than double the second.'],
      ['E2', 'thePlayers.characterHighlights.Sarah', 'Sarah named the baby mama, and the room turned.'],
      ['E3', 'closing.arcResolutions[0].resolution', 'The case against Jess failed in the room.']
    ]);
  });

  test('one tracker entry\'s amount is one edit, printed as its text', () => {
    const withTracker = () => ({
      ...articleAtStop(),
      financialTracker: { entries: [{ description: 'Banana', amount: '$2,505,000' }, { description: 'JessKane', amount: '$3,235,000' }], totalExposed: '$5,740,000' }
    });
    const sentBack = withTracker();
    sentBack.financialTracker.entries[1].amount = '$3,200,000';
    const edits = editsFor(withTracker(), sentBack, 'bundle');
    expect(edits.map(bare)).toEqual([{
      id: 'E1', scope: 'financialTracker', path: 'financialTracker.entries[1].amount', before: '$3,235,000', after: '$3,200,000',
      removed: ['$3,235,000']
    }]);
    expect(D.formatEditLines(edits)).toBe([
      'E1 (financial tracker, entry "JessKane", amount): "$3,200,000"',
      '  removed: "$3,235,000"'
    ].join('\n'));
  });

  test('an inline card\'s headline or significance is its own field; the card\'s content stays the writer\'s', () => {
    const CONTENT = 'You can have him. I never wanted the money.';
    const withCard = (over) => {
      const a = articleAtStop();
      a.sections[1].content.push({ type: 'evidence-card', tokenId: 'jes002', headline: 'Two cards', content: CONTENT, owner: 'Jess Kane', significance: 'critical', ...over });
      return a;
    };
    const sentBack = withCard({ headline: 'Two cards, one baby', significance: 'supporting' });
    const edits = editsFor(withCard(), sentBack, 'bundle');
    expect(edits.map((e) => [e.id, e.path, e.after])).toEqual([
      ['E1', 'sections[#the-story].content[3].headline', 'Two cards, one baby'],
      ['E2', 'sections[#the-story].content[3].significance', 'supporting']
    ]);
    expect(D.locateQuotedText(`T12: "${CONTENT}" is not the memory's text.`, D.carriedEdits(edits, sentBack), sentBack))
      .toEqual({ editIds: [], writer: true });
    expect(D.formatEditLines(edits)).toBe([
      'E1 (section "the-story", evidence-card jes002, headline): "Two cards, one baby"',
      'E2 (section "the-story", evidence-card jes002, significance): "supporting"'
    ].join('\n'));
  });

  test('a photo\'s caption is the director\'s apart from its filename', () => {
    const withPhoto = (caption) => {
      const a = articleAtStop();
      a.sections[1].content.push({ type: 'photo', filename: 'p1.jpg', caption });
      return a;
    };
    const sentBack = withPhoto('Mel lays out the theory, and the room leans in.');
    const edits = D.carriedEdits(editsFor(withPhoto('The huddle'), sentBack, 'bundle'), sentBack);
    const photo = sentBack.sections[1].content[3];
    const locator = D.editLocator(sentBack, edits);
    expect(locator.blockField('the-story', photo, 'caption')).toBe('E1');
    expect(locator.blockField('the-story', photo, 'filename')).toBeNull();
  });

  test('an added block prints its fields, never JSON', () => {
    const sentBack = articleAtStop();
    sentBack.sections[1].content.push({ type: 'evidence-card', tokenId: 'jes002', headline: 'Two cards', content: 'You can have him.' });
    expect(D.formatEditLines(editsFor(articleAtStop(), sentBack, 'bundle')))
      .toBe('E1 (section "the-story", evidence-card jes002): tokenId "jes002"; headline "Two cards"; content "You can have him."');
  });
});

// FA, requirement 3: a rewrite records the sentences of the old text the director's
// version no longer holds. On 0926262 the director's rewrite of WHAT'S MISSING dropped
// the Phil theory, and F1 recorded only the new text (final review, finding 2).
describe('text the director removed in a rewrite (FA)', () => {
  const OPEN = 'Nobody asked who signed the transfer. And the Kowalski theory Mel called boring is still open: the IOU names a man nobody could place. The vote went ahead anyway.';
  const REWRITE = 'Nobody asked who signed the transfer. The vote went ahead anyway.';
  const DROPPED = 'And the Kowalski theory Mel called boring is still open: the IOU names a man nobody could place.';
  const withMissing = (text) => {
    const a = articleAtStop();
    a.sections.splice(2, 0, { id: 'whats-missing', type: 'narrative', heading: "What's Missing", content: [paragraph(text)] });
    return a;
  };
  const standing = () => D.standingAfterSendBack(null, withMissing(OPEN), withMissing(REWRITE), 'bundle');

  test('a rewrite records the sentences of the old text that the director\'s version no longer holds', () => {
    const [edit] = standing().edits;
    expect(edit.path).toBe('sections[#whats-missing].content[0].text');
    expect(edit.after).toBe(REWRITE);
    expect(edit.removed).toEqual([DROPPED]);
  });

  test('a sentence the director\'s version still prints elsewhere is not removed text', () => {
    const shown = withMissing(OPEN);
    const sentBack = withMissing(REWRITE);
    sentBack.sections[3].content.push(paragraph(DROPPED));   // the director moved it to the closing
    const [edit] = D.standingAfterSendBack(null, shown, sentBack, 'bundle').edits.filter((e) => e.scope === 'section:whats-missing');
    expect(edit.removed).toBeUndefined();
  });

  test('the judges and the reworks read it under the edit, as removed', () => {
    expect(D.formatEditLines(standing().edits)).toBe([
      `E1 (section "whats-missing", paragraph): "${REWRITE}"`,
      `  removed: "${DROPPED}"`
    ].join('\n'));
  });

  test('a finding that quotes it locates the edit, whatever else it quotes', () => {
    const output = withMissing(REWRITE);
    const finding = `T2: In "What's Missing", the debated "Kowalski theory Mel called boring" is no longer reported; put it after "${SARAH_LINE.slice(0, 39)}".`;
    expect(D.locateQuotedText(finding, D.carriedEdits(standing(), output), output)).toEqual({ editIds: ['E1'], writer: true });
  });

  test('a removed sentence that comes back is flagged in the report, and the text stays', () => {
    const before = withMissing(REWRITE);
    const after = withMissing(REWRITE);
    after.sections[1].content.push(paragraph(DROPPED));   // an automatic pass added it back
    const { output, report } = D.settleEdits(null, { edits: D.carriedEdits(standing(), before), before, after, pass: 1 });
    expect(output.sections[1].content[3]).toEqual(paragraph(DROPPED));
    expect(report).toEqual({
      checked: ['E1'],
      changed: [{
        id: 'E1', scope: 'section:whats-missing', where: 'section "whats-missing", paragraph', cut: false, removed: true, moved: false,
        director: DROPPED, became: DROPPED, pass: 1, automatic: true, reason: null, restored: false
      }]
    });
  });

  test('a removed sentence the director saw back at the stop, and left, is no longer removed text', () => {
    const shown = withMissing(REWRITE);
    shown.sections[1].content.push(paragraph(DROPPED));
    const next = D.standingAfterSendBack(standing(), shown, shown, 'bundle');
    expect(next.edits.map((e) => [e.id, e.removed])).toEqual([['E1', undefined]]);
  });
});

// FA, requirement 4: a block that leaves one section and arrives unchanged in another
// is a move. F1 read it as a cut with no pieces, which never ended, plus an addition
// (final review, finding 8).
describe('a block moved across sections (FA)', () => {
  const PHOTO = { type: 'photo', filename: 'p3.jpg', caption: 'Vic, Remi and Alex' };
  const withPhotoIn = (sectionIndex) => {
    const a = directorsVersion();
    a.sections[sectionIndex].content.push(clone(PHOTO));
    return a;
  };

  test('is one edit, not a cut and an addition', () => {
    const { edits } = D.standingAfterSendBack(null, withPhotoIn(1), withPhotoIn(2), 'bundle');
    expect(edits.map(bare)).toEqual([{ id: 'E1', scope: 'section:closing', path: 'sections[#closing].content[1]', before: null, after: PHOTO, from: 'the-story' }]);
    expect(D.formatEditLines(edits)).toBe('E1 (section "closing", photo p3.jpg, moved from section "the-story")');
  });

  test('stands while the block sits in the section the director put it in', () => {
    const { edits } = D.standingAfterSendBack(null, withPhotoIn(1), withPhotoIn(2), 'bundle');
    expect(D.carriedEdits(edits, withPhotoIn(2)).map((e) => e.id)).toEqual(['E1']);
    expect(D.carriedEdits(edits, withPhotoIn(1))).toEqual([]);
  });

  test('an automatic pass that moves it back has it put back in the director\'s section', () => {
    const { edits } = D.standingAfterSendBack(null, withPhotoIn(1), withPhotoIn(2), 'bundle');
    const { output, report } = D.settleEdits(null, { edits, before: withPhotoIn(2), after: withPhotoIn(1), pass: 1 });
    expect(output.sections[1].content.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
    expect(output.sections[2].content[1]).toEqual(PHOTO);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, became: 'section "the-story"', restored: true, automatic: true })]);
  });

  // FA fix round 1, finding 1: a move is found by its block's identity (its type with its
  // filename, tokenId or text), and its fields are the writer's, so a pass may change
  // them. F1's whole-block match read a changed caption as the block gone, and the
  // restore printed the photo twice while the report said it was put back.
  const recaptioned = (sectionIndex) => {
    const a = withPhotoIn(sectionIndex);
    a.sections[sectionIndex].content[a.sections[sectionIndex].content.length - 1].caption = 'Vic, Remi and Alex at the bar';
    return a;
  };
  const photosIn = (output) => output.sections.map((s) => s.content.filter((b) => b.type === 'photo').map((b) => b.caption));
  const settled = (after, pass = 1) => {
    const { edits } = D.standingAfterSendBack(null, withPhotoIn(1), withPhotoIn(2), 'bundle');
    return D.settleEdits(null, { edits: D.carriedEdits(edits, withPhotoIn(2)), before: withPhotoIn(2), after, pass });
  };

  test('stands while a block of its identity sits in the director\'s section, whatever its other fields', () => {
    const standing = D.standingAfterSendBack(null, withPhotoIn(1), withPhotoIn(2), 'bundle');
    expect(D.carriedEdits(standing, recaptioned(2)).map((e) => e.id)).toEqual(['E1']);
    expect(D.standingAfterSendBack(standing, recaptioned(2), recaptioned(2), 'bundle').edits.map((e) => e.id)).toEqual(['E1']);
  });

  test('a pass that changes only the moved photo\'s caption keeps it in place, once, with the pass\'s caption', () => {
    const after = recaptioned(2);
    const { output, report } = settled(after);
    expect(output).toBe(after);
    expect(photosIn(output)).toEqual([[], [], ['Vic, Remi and Alex at the bar']]);
    expect(report).toEqual({ checked: ['E1'], changed: [] });
  });

  test('a pass that changes its caption and moves it back has it moved back once, as the pass left it', () => {
    const { output, report } = settled(recaptioned(1));
    expect(photosIn(output)).toEqual([[], [], ['Vic, Remi and Alex at the bar']]);
    expect(output.sections[2].content[1]).toEqual({ ...PHOTO, caption: 'Vic, Remi and Alex at the bar' });
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, became: 'section "the-story"', restored: true, automatic: true })]);
  });

  test('a pass that removes the moved block leaves it out, and the report says so: only its place was the director\'s', () => {
    const after = directorsVersion();
    const { output, report } = settled(after);
    expect(output).toBe(after);
    expect(photosIn(output)).toEqual([[], [], []]);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, became: null, restored: false, automatic: true })]);
  });

  test('a pass that removed the director\'s section, which a field edit puts back whole, leaves the moved block once', () => {
    const shown = articleAtStop();
    shown.sections[1].content.push(clone(PHOTO));
    const sentBack = withPhotoIn(2);   // the closing rewritten, the theory cut, the photo moved to the closing
    const standing = D.standingAfterSendBack(null, shown, sentBack, 'bundle');
    expect(standing.edits.map((e) => [e.path, e.from])).toEqual([
      ['sections[#the-story].content[-]', undefined],
      ['sections[#closing].content[0].text', undefined],
      ['sections[#closing].content[1]', 'the-story']
    ]);
    const after = clone(sentBack);
    after.sections.splice(2, 1);
    after.sections[1].content.push({ ...PHOTO, caption: 'Vic, Remi and Alex at the bar' });
    const { output, report } = D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack), before: sentBack, after, pass: 1 });
    expect(output.sections.map((s) => s.id)).toEqual(['lede', 'the-story', 'closing']);
    expect(output.sections[2].content).toEqual([paragraph(CLOSING_EDIT), PHOTO]);
    expect(photosIn(output)).toEqual([[], [], ['Vic, Remi and Alex']]);
    expect(report.changed).toEqual([
      expect.objectContaining({ id: 'E2', restored: true }),
      expect.objectContaining({ id: 'E3', moved: true, became: 'section "the-story"', restored: true })
    ]);
  });

  test('a paragraph the director moved and a pass rewrote in place is still in the director\'s place', () => {
    const LINE = 'Sarah told the room she had seen Jess at the bar with the cash.';
    const withLineIn = (sectionIndex, text = LINE) => {
      const a = directorsVersion();
      a.sections[sectionIndex].content.push(paragraph(text));
      return a;
    };
    const { edits } = D.standingAfterSendBack(null, withLineIn(1), withLineIn(2), 'bundle');
    const after = withLineIn(2, 'Sarah said she had seen Jess at the bar.');
    const { output, report } = D.settleEdits(null, { edits: D.carriedEdits(edits, withLineIn(2)), before: withLineIn(2), after, pass: 1 });
    expect(output).toBe(after);
    expect(report).toEqual({ checked: ['E1'], changed: [] });
  });

  test('a paragraph rewritten in place stays in the director\'s place when the same pass takes a photo out of that section', () => {
    const LINE = 'Sarah told the room she had seen Jess at the bar with the cash.';
    const shown = directorsVersion();
    shown.sections[1].content.push(clone(PHOTO), paragraph(LINE));
    const sentBack = directorsVersion();
    sentBack.sections[2].content.push(clone(PHOTO), paragraph(LINE));   // both moved to the closing
    const standing = D.standingAfterSendBack(null, shown, sentBack, 'bundle');
    expect(standing.edits.map((e) => [e.id, e.from])).toEqual([['E1', 'the-story'], ['E2', 'the-story']]);
    const after = clone(sentBack);
    after.sections[2].content = [paragraph(CLOSING_EDIT), paragraph('Sarah said she had seen Jess at the bar.')];
    after.sections[1].content.push(clone(PHOTO));   // the photo went back to THE STORY
    const { output, report } = D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack), before: sentBack, after, pass: 1 });
    expect(output.sections[2].content).toEqual([paragraph(CLOSING_EDIT), PHOTO, paragraph('Sarah said she had seen Jess at the bar.')]);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, became: 'section "the-story"', restored: true })]);
  });

  test('the rework of a send-back that moves it back is reported with its reason, and left as it is', () => {
    const after = recaptioned(1);
    const { edits } = D.standingAfterSendBack(null, withPhotoIn(1), withPhotoIn(2), 'bundle');
    const { output, report } = D.settleEdits(null, {
      edits, before: withPhotoIn(2), after, pass: D.SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note put every photo in THE STORY.' }]
    });
    expect(output).toBe(after);
    expect(report.changed).toEqual([expect.objectContaining({
      id: 'E1', moved: true, became: 'section "the-story"', automatic: false, restored: false, reason: 'The note put every photo in THE STORY.'
    })]);
  });
});

// Task 4.3 (phase 4): the director's moves at the desk are standing edits. The diff paired
// every block of a section where it stood, so a block the director moved inside its section
// changed nothing it could see. It is a move now, recorded as a move across sections is, and
// its place is its order in the section: after the block it follows and before the block it
// precedes in the director's version, among the blocks that kept their order.
describe('a block moved within its section (task 4.3)', () => {
  const PHOTO = { type: 'photo', filename: 'p3.jpg', caption: 'Vic, Remi and Alex' };
  const MEL = 'Mel built the first theory around the fight and the fraud.';
  /** THE STORY as articleAtStop has it, [MEL, CUT_THEORY, SARAH_LINE], with the photo at `index`. */
  const withPhotoAt = (index) => {
    const a = articleAtStop();
    a.sections[1].content.splice(index, 0, clone(PHOTO));
    return a;
  };
  const storyOf = (output) => output.sections[1].content.map((b) => (b.type === 'photo' ? 'PHOTO' : b.text));
  const standing = () => D.standingAfterSendBack(null, withPhotoAt(0), withPhotoAt(2), 'bundle');

  test('is one edit, a move, which the trace sees as a change to the section', () => {
    expect(D.scopeKeys(D.diffBundle(withPhotoAt(0), withPhotoAt(2)))).toEqual(['section:the-story']);
    expect(standing().edits.map(bare)).toEqual([{
      id: 'E1', scope: 'section:the-story', path: 'sections[#the-story].content[2]', before: null, after: PHOTO, from: 'the-story',
      between: { follows: paragraph(CUT_THEORY), precedes: paragraph(SARAH_LINE) }
    }]);
  });

  test('its line names the block and says it moved within the section', () => {
    expect(D.formatEditLines(standing().edits)).toBe('E1 (section "the-story", photo p3.jpg, moved within the section)');
  });

  test('stands while the block keeps the director\'s order, whatever else changes around it', () => {
    const { edits } = standing();
    expect(D.carriedEdits(edits, withPhotoAt(2)).map((e) => e.id)).toEqual(['E1']);
    // Put back where the writer had it, or past the block it preceded: not the director's place.
    expect(D.carriedEdits(edits, withPhotoAt(0))).toEqual([]);
    expect(D.carriedEdits(edits, withPhotoAt(3))).toEqual([]);
    // A paragraph a pass added beside it, or a neighbour a pass rewrote, leaves its order as it was.
    const added = withPhotoAt(2);
    added.sections[1].content.splice(2, 0, paragraph('Nobody settled it before the vote.'));
    expect(D.carriedEdits(edits, added).map((e) => e.id)).toEqual(['E1']);
    const rewritten = withPhotoAt(2);
    rewritten.sections[1].content[3] = paragraph('Sarah pointed the room at Jess.');
    expect(D.carriedEdits(edits, rewritten).map((e) => e.id)).toEqual(['E1']);
  });

  test('an automatic pass that puts it back where the writer had it has it put back in the director\'s place', () => {
    const { output, report } = D.settleEdits(null, { edits: standing().edits, before: withPhotoAt(2), after: withPhotoAt(0), pass: 1 });
    expect(storyOf(output)).toEqual([MEL, CUT_THEORY, 'PHOTO', SARAH_LINE]);
    expect(report.changed).toEqual([expect.objectContaining({
      id: 'E1', moved: true, became: 'another place in section "the-story"', restored: true, automatic: true
    })]);
  });

  test('an automatic pass that takes it to another section has it put back in the director\'s place', () => {
    const after = withPhotoAt(0);
    after.sections[1].content.shift();
    after.sections[2].content.push(clone(PHOTO));
    const { output, report } = D.settleEdits(null, { edits: standing().edits, before: withPhotoAt(2), after, pass: 1 });
    expect(storyOf(output)).toEqual([MEL, CUT_THEORY, 'PHOTO', SARAH_LINE]);
    expect(output.sections[2].content).toEqual([paragraph(WRITERS_CLOSING)]);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, became: 'section "closing"', restored: true })]);
  });

  test('the rework of a send-back that moves it is reported with its reason, and left as it is', () => {
    const after = withPhotoAt(0);
    const { output, report } = D.settleEdits(null, {
      edits: standing().edits, before: withPhotoAt(2), after, pass: D.SEND_BACK_PASS,
      reasons: [{ id: 'E1', reason: 'The note opens THE STORY on the photo.' }]
    });
    expect(output).toBe(after);
    expect(report.changed).toEqual([expect.objectContaining({
      id: 'E1', moved: true, became: 'another place in section "the-story"', automatic: false, restored: false,
      reason: 'The note opens THE STORY on the photo.'
    })]);
  });

  test('in a swap, the photo or card the director moved is the block named, not the paragraph it passed', () => {
    const { edits } = D.standingAfterSendBack(null, withPhotoAt(1), withPhotoAt(0), 'bundle');
    expect(edits.map(bare)).toEqual([{
      id: 'E1', scope: 'section:the-story', path: 'sections[#the-story].content[0]', before: null, after: PHOTO, from: 'the-story',
      between: { follows: null, precedes: paragraph(MEL) }
    }]);
  });

  test('a paragraph the director moved is the writer\'s text in the director\'s place', () => {
    const shown = articleAtStop();
    const sentBack = articleAtStop();
    sentBack.sections[1].content.push(sentBack.sections[1].content.shift());   // MEL to the end of THE STORY
    const edits = D.carriedEdits(D.standingAfterSendBack(null, shown, sentBack, 'bundle'), sentBack);
    expect(edits.map((e) => [e.id, e.from, e.between])).toEqual([['E1', 'the-story', { follows: paragraph(SARAH_LINE), precedes: null }]]);
    expect(D.formatEditLines(edits)).toBe('E1 (section "the-story", paragraph, moved within the section): begins "Mel built the first theory around the fight…"');
    expect(D.locateQuotedText(`T12: "${MEL}" names no source.`, edits, sentBack)).toEqual({ editIds: [], writer: true });
  });

  test('a block the director moved and changed is a cut and an addition, as across sections', () => {
    const shown = articleAtStop();
    const sentBack = articleAtStop();
    const sarah = sentBack.sections[1].content.pop();
    sentBack.sections[1].content.unshift(paragraph(sarah.text.replace('and the vote followed', 'and then the vote followed')));
    const { edits } = D.standingAfterSendBack(null, shown, sentBack, 'bundle');
    expect(edits.map((e) => [e.path, e.from, e.after === null ? 'cut' : 'added'])).toEqual([
      ['sections[#the-story].content[-]', undefined, 'cut'],
      ['sections[#the-story].content[0]', undefined, 'added']
    ]);
  });

  test('a block moved within one section and another moved across sections are each one move', () => {
    const shown = withPhotoAt(0);
    shown.sections[2].content.push(card('jes002', 'You can have him.', 'You can have him. I never wanted the money.'));
    const sentBack = clone(shown);
    sentBack.sections[1].content.splice(2, 0, sentBack.sections[1].content.shift());   // the photo after CUT_THEORY
    sentBack.sections[1].content.push(sentBack.sections[2].content.pop());              // the card to THE STORY
    const { edits } = D.standingAfterSendBack(null, shown, sentBack, 'bundle');
    expect(edits.map((e) => [e.path, e.from, Boolean(e.between)])).toEqual([
      ['sections[#the-story].content[2]', 'the-story', true],
      ['sections[#the-story].content[4]', 'closing', false]
    ]);
  });
});

/** An inline evidence card, for the moves above. */
function card(tokenId, headline, content) {
  return { type: 'evidence-card', tokenId, headline, content, significance: 'critical' };
}

// FA fix round 1, finding 2: a move is the block's place only. The director moved the
// block without changing it, so its text is still the writer's: a finding that quotes
// it quotes the writer, the fact check finds no field of it the director wrote, and its
// line names the block and its place, never its text as the director's.
describe('a moved block is the writer\'s, in the director\'s place (FA, fix round 1)', () => {
  const LINE = 'Sarah told the room she had seen Jess at the bar with the cash.';
  const PHOTO = { type: 'photo', filename: 'p3.jpg', caption: 'Vic, Remi and Alex' };
  const withIn = (block, sectionIndex) => {
    const a = directorsVersion();
    a.sections[sectionIndex].content.push(clone(block));
    return a;
  };
  /** The director moved `block` from THE STORY to the closing, unchanged. */
  const moved = (block) => {
    const output = withIn(block, 2);
    return { output, edits: D.carriedEdits(D.standingAfterSendBack(null, withIn(block, 1), output, 'bundle'), output) };
  };

  test('a finding that quotes the moved block\'s text quotes the writer', () => {
    const { output, edits } = moved(paragraph(LINE));
    expect(edits.map((e) => [e.id, e.from])).toEqual([['E1', 'the-story']]);
    expect(D.locateQuotedText(`T12: "${LINE}" puts a line in Sarah's mouth that no note gives her.`, edits, output))
      .toEqual({ editIds: [], writer: true });
  });

  test('the fact check finds no field of a moved block that the director wrote', () => {
    const { output, edits } = moved(PHOTO);
    const locator = D.editLocator(output, edits);
    const block = output.sections[2].content[1];
    expect(locator.blockField('closing', block, 'filename')).toBeNull();
    expect(locator.blockField('closing', block, 'caption')).toBeNull();
    expect(locator.blockEdited('closing', block)).toBeNull();
  });

  test('its line names the block and where the director moved it, and a block its text names by the words it begins with', () => {
    expect(D.formatEditLines(moved(PHOTO).edits)).toBe('E1 (section "closing", photo p3.jpg, moved from section "the-story")');
    expect(D.formatEditLines(moved(paragraph(LINE)).edits))
      .toBe('E1 (section "closing", paragraph, moved from section "the-story"): begins "Sarah told the room she had seen Jess…"');
  });

  test('the guide to the lines says a moved block\'s text is still the writer\'s', () => {
    expect(D.EDIT_LINES_GUIDE).toContain('A line marked moved names a block the director moved to that place without changing it: the place is the director\'s, and the block\'s text is still the writer\'s.');
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

  test('a sentence of six words or more brought back inside a longer one, in any case, counts; a sentence cut short does not', () => {
    const directors = cutFrom(writers());
    const standing = D.standingAfterSendBack(null, writers(), directors, 'bundle');
    expect(D.carriedEdits(standing, withParagraph(directors, 'By noon, nobody settled it before the vote, and Mel agreed.'))).toEqual([]);
    expect(D.carriedEdits(standing, withParagraph(directors, 'NOBODY SETTLED IT BEFORE THE VOTE!'))).toEqual([]);
    expect(D.carriedEdits(standing, withParagraph(directors, 'Nobody settled it before the voters left.')).map((e) => e.id)).toEqual(['E1']);
  });

  // FA, known item 4: a piece of three to five words recurs inside the writer's prose,
  // and F1 then reported the cut as brought back.
  test('a piece under six words counts as come back only as a whole sentence of the version', () => {
    const article = writers();
    article.sections[1].content.push(paragraph('Phil had done it. The room argued about the IOU for an hour.'));
    const directors = clone(article);
    directors.sections[1].content.pop();
    const standing = D.standingAfterSendBack(null, article, directors, 'bundle');
    // 'Others thought Phil had done it.' holds the short piece, but not as a whole sentence.
    expect(standing.edits[0].pieces).toEqual(['Phil had done it', 'The room argued about the IOU for an hour']);
    expect(D.carriedEdits(standing, withParagraph(directors, 'Mel said Phil had done it with Vic.')).map((e) => e.id)).toEqual(['E1']);
    expect(D.carriedEdits(standing, withParagraph(directors, 'Mel shrugged. Phil had done it!'))).toEqual([]);
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

  // FA, known item 6: the survival check reads printed fields only.
  test('text that comes back only in fields the page never prints leaves the cut standing', () => {
    const directors = cutFrom(writers());
    const standing = D.standingAfterSendBack(null, writers(), directors, 'bundle');
    const unprinted = clone(directors);
    unprinted.pullQuotes = [{ text: 'Others thought Phil had done it.' }];
    unprinted.photos = [{ filename: 'x.jpg', caption: 'Others thought Phil had done it.' }];
    unprinted.evidenceCards = [{ tokenId: 'phi001', headline: 'Phil', summary: 'An IOU', content: 'Others thought Phil had done it.', owner: 'Others thought Phil had done it.' }];
    unprinted.sections[0].content.push({ type: 'photo', filename: 'y.jpg', caption: 'Mel', characters: ['Others thought Phil had done it.'] });
    expect(D.carriedEdits(standing, unprinted).map((e) => e.id)).toEqual(['E1']);
  });

  test('the report counts a partial return as a change, with the text where it came back', () => {
    const directors = cutFrom(writers());
    const standing = D.standingAfterSendBack(null, writers(), directors, 'bundle');
    const after = withParagraph(directors, 'Others thought Phil had done it.');
    const report = D.reportAfterPass(null, { edits: D.carriedEdits(standing, directors), before: directors, after, pass: 1 });
    expect(report).toEqual({
      checked: ['E1'],
      changed: [{
        id: 'E1', scope: 'section:story', where: 'section "story", paragraph, cut', cut: true, removed: false, moved: false,
        director: OPEN_QUESTIONS, became: 'Others thought Phil had done it.', pass: 1, automatic: true, reason: null, restored: false
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

  // Task 4.3c: a block the director added carries its fields. The test used to retype the
  // paragraph into the quote, which is a cut and an addition now, and the cut stays carried.
  test('a field of the director\'s that the rework removed is not carried', () => {
    const sentBack = bundleBefore();
    sentBack.sections[0].content.push({ type: 'quote', text: 'Second paragraph, rewritten.', attribution: 'Vic' });
    const s = D.standingAfterSendBack(null, bundleBefore(), sentBack, 'bundle');
    const stripped = clone(sentBack); delete stripped.sections[0].content[2].attribution;
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
  test('a paragraph prints its text and the sentence it removed, and a cut says so', () => {
    expect(D.formatEditLines(roundOne().edits)).toBe([
      `E1 (section "the-story", paragraph, cut): "${CUT_THEORY}"`,
      `E2 (section "closing", paragraph): "${CLOSING_EDIT}"`,
      `  removed: "${WRITERS_CLOSING}"`
    ].join('\n'));
  });

  test('a field prints its path within its scope', () => {
    const sentBack = articleAtStop();
    sentBack.headline.main = 'Alex Reeves Pointed the Room at Jess Kane';
    expect(D.formatEditLines(D.standingAfterSendBack(null, articleAtStop(), sentBack, 'bundle').edits))
      .toBe('E1 (headline, main): "Alex Reeves Pointed the Room at Jess Kane"\n  removed: "The Room Voted"');
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

  test('a quote of the text the director removed in a rewrite names the rewrite', () => {
    expect(D.locateQuotedText('T2: the open question "Whether the verdict costs Alex anything" is gone.', edits, output))
      .toEqual({ editIds: ['E2'], writer: false });
  });

  test('a quote of the writer\'s text is the writer\'s', () => {
    expect(D.locateQuotedText(`T12: "${SARAH_LINE}" puts the line in the wrong mouth.`, edits, output)).toEqual({ editIds: [], writer: true });
  });

  test('an issue that quotes both names the edit, and says the writer\'s text is quoted too', () => {
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

  // FA, known item 3: 0926262's T2 issue quotes the heading "The Story: Eight Minutes"
  // as where the problem sits.
  test('a quoted section heading is a location, never the text at fault', () => {
    const sentBack = directorsVersion();
    sentBack.sections[1].heading = 'The Story: Eight Minutes';
    const headingEdits = D.carriedEdits(D.standingAfterSendBack(roundOne(), directorsVersion(), sentBack, 'bundle'), sentBack);
    expect(headingEdits.map((e) => e.path)).toContain('sections[#the-story].heading');
    expect(D.locateQuotedText(`T12: In "The Story: Eight Minutes", "${SARAH_LINE}" puts the line in her mouth.`, headingEdits, sentBack))
      .toEqual({ editIds: [], writer: true });
  });

  // FA, known item 6: the writer-text test reads printed fields only.
  test('text that only an unprinted field repeats is not the writer\'s', () => {
    const unprinted = directorsVersion();
    unprinted.pullQuotes = [{ text: CLOSING_EDIT }];
    unprinted.sections[0].content.push({ type: 'photo', filename: 'p1.jpg', caption: 'The huddle', characters: [CLOSING_EDIT] });
    expect(D.locateQuotedText(`T1: "${CLOSING_EDIT}" states a motive.`, D.carriedEdits(roundOne(), unprinted), unprinted))
      .toEqual({ editIds: ['E2'], writer: false });
  });

  // Fix round 1, finding 2, narrowed by FA (known item 5): an evidence card prints its
  // document word for word, so a record passage inside a writer's card is the record
  // cited. A quote block's attribution is the writer's, so a record passage there is the
  // writer's text.
  describe('the record a finding cites', () => {
    const DEMAND = 'Marcus out by the end of January, and Alex as CTO.';
    const RECORD = [`<RECORD>\n<document id="alr004" kind="memory">ALR004 - 9:40PM - Alex reads the term sheet aloud. ${DEMAND} Marcus laughs.</document>\n</RECORD>`];
    const withCard = () => {
      const a = directorsVersion();
      a.sections[1].content.push({ type: 'evidence-card', tokenId: 'alr004', headline: "Alex's demand", content: DEMAND });
      return a;
    };
    const FINDING = `T1: "${CLOSING_EDIT}" states a motive as fact; the record holds only the January demand, "${DEMAND}"`;

    test('a record passage a writer\'s card prints is a citation: the finding is about the director\'s line alone', () => {
      const article = withCard();
      const carried = D.carriedEdits(roundOne(), article);
      expect(D.locateQuotedText(FINDING, carried, article, { record: RECORD })).toEqual({ editIds: ['E2'], writer: false });
      // Without the record, the card's text reads as the writer's, as before.
      expect(D.locateQuotedText(FINDING, carried, article)).toEqual({ editIds: ['E2'], writer: true });
    });

    test('a record passage in a writer\'s quote block is the writer\'s text', () => {
      const article = directorsVersion();
      article.sections[1].content.push({ type: 'quote', text: DEMAND, attribution: 'Sarah' });
      expect(D.locateQuotedText(`T12: "${DEMAND}" is put in Sarah's mouth.`, D.carriedEdits(roundOne(), article), article, { record: RECORD }))
        .toEqual({ editIds: [], writer: true });
    });

    test('a citation the director\'s edit also holds locates the edit', () => {
      const article = withCard();
      article.sections[2].content[0] = paragraph(`Alex demanded it in January: ${DEMAND}`);
      const sentBackStanding = D.standingAfterSendBack(null, withCard(), article, 'bundle');
      expect(D.locateQuotedText(`T1: the closing's "${DEMAND}" is read as a motive.`, D.carriedEdits(sentBackStanding, article), article, { record: RECORD }))
        .toEqual({ editIds: ['E1'], writer: false });
    });

    test('the writer\'s own words stay the writer\'s beside a record citation', () => {
      const article = withCard();
      const finding = `T12: "${SARAH_LINE}" is in no document; the record holds "${DEMAND}"`;
      expect(D.locateQuotedText(finding, D.carriedEdits(roundOne(), article), article, { record: RECORD })).toEqual({ editIds: [], writer: true });
    });

    test('a passage the director\'s edit holds is the edit\'s, even when the record holds it too', () => {
      const notes = [`The director's notes: ${CLOSING_EDIT}`];
      expect(D.locateQuotedText(`T1: "${CLOSING_EDIT}" states a motive.`, edits, output, { record: notes })).toEqual({ editIds: ['E2'], writer: false });
    });

    test('a record passage that only the record holds locates nothing', () => {
      expect(D.locateQuotedText(`T1: the record holds only "${DEMAND}"`, edits, output, { record: RECORD })).toEqual({ editIds: [], writer: false });
    });
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

// FA, requirement 9: a roster gap is blamed on the director only for a name the
// director's version no longer held when the director sent it back (final review,
// finding 5: a later pass removed the other mention, and the cut took the blame).
describe('the roster names a cut or a rewrite removed (FA)', () => {
  const story = (...texts) => ({ headline: { main: 'H' }, sections: [{ id: 'story', type: 'narrative', content: texts.map(paragraph) }] });

  test('a cut records the roster names the director\'s version no longer names', () => {
    const standing = D.standingAfterSendBack(null, story('Kai said nothing all night.', 'Vic leaned in at the bar.'), story('Vic leaned in at the bar.'), 'bundle', { names: ['Vic', 'Kai', 'Ashe'] });
    expect(standing.edits[0].names).toEqual(['Kai']);
  });

  test('a cut of one of two mentions records none, so no later gap is blamed on it', () => {
    const writers = story('Sarah kept the count.', 'Sarah left early.', 'Vic leaned in at the bar.');
    const directors = story('Sarah left early.', 'Vic leaned in at the bar.');
    const standing = D.standingAfterSendBack(null, writers, directors, 'bundle', { names: ['Sarah', 'Vic'] });
    expect(standing.edits[0].names).toEqual([]);
    const later = story('Vic leaned in at the bar.');   // a rework dropped the other mention
    expect(D.editLocator(later, D.carriedEdits(standing, later)).cutNaming('Sarah')).toBeNull();
  });

  test('a rewrite that removed the only mention records it', () => {
    const standing = D.standingAfterSendBack(null, story('Kai worked the safe. Vic leaned in at the bar.'), story('Vic leaned in at the bar.'), 'bundle', { names: ['Vic', 'Kai'] });
    expect(standing.edits[0]).toMatchObject({ removed: ['Kai worked the safe.'], names: ['Kai'] });
    expect(D.editLocator(story('Vic leaned in at the bar.'), standing.edits).cutNaming('Kai')).toBe('E1');
  });

  test('namesPerson is the roster coverage test', () => {
    expect(D.namesPerson('Kai worked the safe.', 'kai')).toBe(true);
    expect(D.namesPerson('Kaiser worked the safe.', 'Kai')).toBe(false);
  });
});

// FA, requirement 8: after an automatic pass, code puts back any standing edit the pass
// changed, field by field. A cut or removed text that came back is flagged, not removed.
// A send-back's rework is not restored: the note may change an edit, and it says why.
describe('code puts back what an automatic pass changed (FA)', () => {
  const settle = (standing, before, after, pass = 1, reasons = []) =>
    D.settleEdits(null, { edits: D.carriedEdits(standing, before), before, after, pass, reasons });

  test('a paragraph the pass rewrote gets the director\'s text back; the pass\'s other changes stay; the report records the restore', () => {
    const before = directorsVersion();
    const after = directorsVersion();
    after.sections[2].content[0] = paragraph('Alex may have wanted Marcus out of the company.');
    after.headline.deck = 'The room named Alex';
    const { output, report } = settle(roundOne(), before, after);
    expect(output.sections[2].content[0]).toEqual(paragraph(CLOSING_EDIT));
    expect(output.headline.deck).toBe('The room named Alex');
    expect(after.sections[2].content[0].text).toBe('Alex may have wanted Marcus out of the company.');   // the input is not changed
    expect(report).toEqual({
      checked: ['E1', 'E2'],
      changed: [{
        id: 'E2', scope: 'section:closing', where: 'section "closing", paragraph', cut: false, removed: false, moved: false,
        director: CLOSING_EDIT, became: 'Alex may have wanted Marcus out of the company.', pass: 1, automatic: true, reason: null, restored: true
      }]
    });
    expect(D.carriedEdits(roundOne(), output).map((e) => e.id)).toEqual(['E1', 'E2']);
  });

  test('a card\'s headline is put back field by field, and the pass\'s fix to the card\'s content stays', () => {
    const withCard = (headline, content) => {
      const a = directorsVersion();
      a.sections[1].content.push({ type: 'evidence-card', tokenId: 'jes002', headline, content, significance: 'critical' });
      return a;
    };
    const standing = D.standingAfterSendBack(null, withCard('Two cards', 'Made up.'), withCard('Two cards, one baby', 'Made up.'), 'bundle');
    const after = withCard('The cards', 'You can have him.');
    const { output, report } = settle(standing, withCard('Two cards, one baby', 'Made up.'), after);
    expect(output.sections[1].content[2]).toEqual({ type: 'evidence-card', tokenId: 'jes002', headline: 'Two cards, one baby', content: 'You can have him.', significance: 'critical' });
    expect(report.changed.map((c) => [c.id, c.restored])).toEqual([['E1', true]]);
  });

  test('a block the pass removed is put back where it sat', () => {
    const after = directorsVersion();
    after.sections[2].content = [];
    const { output } = settle(roundOne(), directorsVersion(), after);
    expect(output.sections[2].content).toEqual([paragraph(CLOSING_EDIT)]);
  });

  test('an outline field is put back', () => {
    const shown = outlineBefore();
    const sentBack = outlineBefore(); sentBack.lede.hook = 'A sharper hook.';
    const standing = D.standingAfterSendBack(null, shown, sentBack, 'outline');
    const after = clone(sentBack); after.lede.hook = 'A softer hook.'; after.closing.finalQuestion = 'Q, fixed';
    const { output, report } = settle(standing, sentBack, after);
    expect(output).toEqual({ ...after, lede: { ...after.lede, hook: 'A sharper hook.' } });
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', where: 'lede, hook', director: 'A sharper hook.', became: 'A softer hook.', restored: true })]);
  });

  test('a send-back\'s rework is not restored, and keeps its reason', () => {
    const after = directorsVersion();
    after.sections[2].content[0] = paragraph('Whether the January demand costs Alex anything is still open.');
    const { output, report } = settle(roundOne(), directorsVersion(), after, D.SEND_BACK_PASS,
      [{ id: 'E2', reason: 'The note asked the closing to end on the open question.' }]);
    expect(output).toBe(after);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E2', automatic: false, restored: false, reason: 'The note asked the closing to end on the open question.' })]);
  });

  test('a cut that came back is flagged, and the text stays', () => {
    const after = directorsVersion();
    after.sections[0].content.push(paragraph(CUT_THEORY));
    const { output, report } = settle(roundOne(), directorsVersion(), after);
    expect(output.sections[0].content[1]).toEqual(paragraph(CUT_THEORY));
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', cut: true, became: CUT_THEORY, restored: false, automatic: true })]);
  });

  test('a pass that keeps every edit changes nothing and reports nothing changed', () => {
    const after = directorsVersion();
    const { output, report } = settle(roundOne(), directorsVersion(), after);
    expect(output).toBe(after);
    expect(report).toEqual({ checked: ['E1', 'E2'], changed: [] });
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
        id: 'E2', scope: 'section:closing', where: 'section "closing", paragraph', cut: false, removed: false, moved: false,
        director: CLOSING_EDIT, became: 'Alex wanted Marcus gone, and nobody asked why.',
        pass: 'send-back', automatic: false, reason: 'The note asked the closing to end on the open question.', restored: false
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
      {
        id: 'E1', scope: 'section:the-story', where: 'section "the-story", paragraph, cut', cut: true, removed: false, moved: false,
        director: CUT_THEORY, became: CUT_THEORY, pass: 1, automatic: true, reason: null, restored: false
      }
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

  test('handEditReportOf passes the report on, and reads a report from before F1 or one that checked nothing as none', () => {
    const report = D.reportAfterPass(null, pass(directorsVersion(), directorsVersion(), { pass: 1 }));
    expect(D.handEditReportOf(report)).toEqual(report);
    expect(D.handEditReportOf({ checked: ['lede'], changed: ['lede'] })).toBeNull();
    expect(D.handEditReportOf({ checked: [], changed: [] })).toBeNull();
    expect(D.handEditReportOf(null)).toBeNull();
  });
});

// FA, known item 7: one rule for a section's key, which the fact check reads too.
test('sectionKey is the section\'s id, else its index, as the edits address it', () => {
  expect(D.sectionKey({ id: 'intro' }, 0)).toBe('intro');
  expect(D.sectionKey({ id: 7 }, 0)).toBe('7');
  expect(D.sectionKey({}, 2)).toBe('index-2');
  expect(D.sectionKey(null, 3)).toBe('index-3');
  [{ id: 'intro' }, { id: 0 }, {}, null, [], 'text'].forEach((section, i) => {
    expect(D.sectionKey(section, i)).toBe(D._testing.idOf(section, 'id', i));
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

// Task 4.3b (the review of 4.3, findings 2 and 3). A move within a section recorded its
// place as the blocks it followed and preceded, and stood only while both kept their order
// around it, so the director's own later move of a neighbour dropped it, and a pass that
// then moved the block was neither undone nor reported. And when a pass also swapped those
// two blocks, the restore put the block after the first of them: an order that was neither
// the pass's nor the director's, under a report that said the block was not put back.
describe('4.3b: a move within a section, across the director\'s rounds and an automatic pass', () => {
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const C = paragraph('Charlie paragraph closes the section with a long first line.');
  const P = { type: 'photo', filename: 'whiteboard.jpg', caption: 'Mel lays out the theory at the whiteboard.' };
  const OTHER = paragraph('Delta paragraph sits alone in the second section of the article.');
  /** An article whose section "s" holds `blocks`, and whose section "t" holds OTHER, then `extra`. */
  const article = (blocks, extra = []) => ({
    metadata: { sessionId: '0926262' },
    headline: { main: 'The Room Voted Five to Four' },
    sections: [
      { id: 's', type: 'narrative', content: blocks.map(clone) },
      { id: 't', type: 'narrative', content: [clone(OTHER), ...extra.map(clone)] }
    ]
  });
  /** Section "s" as letters: P for the photo, else each paragraph's first letter. */
  const order = (output) => output.sections[0].content.map((b) => (b.type === 'photo' ? 'P' : b.text[0])).join('');
  /** Round 1: the director moves the photo from the top to between A and B. */
  const roundOne = () => D.standingAfterSendBack(null, article([P, A, B, C]), article([A, P, B, C]), 'bundle');

  test('two send-backs: a move stays while its block sits in the director\'s section, and a pass that then moves the block has it put back and reported', () => {
    expect(roundOne().edits.map((e) => [e.id, e.between])).toEqual([['E1', { follows: A, precedes: B }]]);
    // The rework kept the director's order. Round 2: the director moves B to the top, and
    // the photo still follows A. The move takes the blocks it sits between in that version.
    const sentBack = article([B, A, P, C]);
    const roundTwo = D.standingAfterSendBack(roundOne(), article([A, P, B, C]), sentBack, 'bundle');
    expect(roundTwo.edits.map((e) => [e.id, e.path, e.after, e.between])).toEqual([
      ['E1', 'sections[#s].content[2]', P, { follows: A, precedes: C }],
      ['E2', 'sections[#s].content[0]', B, { follows: null, precedes: A }]
    ]);
    // An automatic pass puts the photo first.
    const { output, report } = D.settleEdits(null, {
      edits: D.carriedEdits(roundTwo, sentBack), before: sentBack, after: article([P, B, A, C]), pass: 1
    });
    expect(order(output)).toBe('BAPC');
    expect(report.changed).toEqual([expect.objectContaining({
      id: 'E1', moved: true, became: 'another place in section "s"', restored: true, automatic: true
    })]);
  });

  test('the director moving the block again replaces its move, and an order that still holds keeps the move as recorded', () => {
    // Round 2: the director moves the photo itself, after B. Its new move is its place now.
    const again = D.standingAfterSendBack(roundOne(), article([A, P, B, C]), article([A, B, P, C]), 'bundle');
    expect(again.edits.map((e) => [e.id, e.after, e.between])).toEqual([['E2', P, { follows: B, precedes: C }]]);
    // Round 2: the director moves C to the other section; the photo still sits between A and B.
    const held = D.standingAfterSendBack(roundOne(), article([A, P, B, C]), article([A, P, B], [C]), 'bundle');
    expect(held.edits.map((e) => [e.id, e.from, e.between || null])).toEqual([
      ['E1', 's', { follows: A, precedes: B }],
      ['E2', 's', null]
    ]);
  });

  test('a pass that swaps the blocks the moved block sat between leaves the pass\'s order, and the report says it was not put back', () => {
    const director = article([A, P, B, C]);
    const { edits } = roundOne();
    const after = article([P, B, A, C]);
    const { output, report } = D.settleEdits(null, { edits, before: director, after, pass: 1 });
    expect(order(output)).toBe('PBAC');
    expect(report.changed).toEqual([expect.objectContaining({
      id: 'E1', moved: true, became: 'another place in section "s"', restored: false, automatic: true
    })]);
    // The stored version and the report agree: it does not carry the move.
    expect(D.carriedEdits(edits, output)).toEqual([]);
  });

  test('a pass that keeps those blocks in the director\'s order has the block put back there, and the report says so', () => {
    const director = article([A, P, B, C]);
    const { edits } = roundOne();
    const { output, report } = D.settleEdits(null, { edits, before: director, after: article([C, P, A, B]), pass: 1 });
    expect(order(output)).toBe('CAPB');
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, restored: true })]);
    expect(D.carriedEdits(edits, output).map((e) => e.id)).toEqual(['E1']);
  });

  test('a pass that takes the block to another section and swaps the blocks it sat between leaves it there, reported as not put back', () => {
    const director = article([A, P, B, C]);
    const { edits } = roundOne();
    const after = article([B, A, C], [P]);
    const { output, report } = D.settleEdits(null, { edits, before: director, after, pass: 1 });
    expect(output).toEqual(after);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, became: 'section "t"', restored: false })]);
  });

  // Fix round 1: the order guard returned before the step that takes out the copy outside
  // the director's section, so the page printed the photo twice whenever that section
  // already held it, whether a restore of its caption had put it back or the pass had left it.
  const RECAPTIONED = { ...P, caption: 'Six people around the whiteboard, late.' };
  /** Round 2: the director recaptions the photo where round 1 put it. */
  const roundTwoRecaptioned = () => D.standingAfterSendBack(roundOne(), article([A, P, B, C]), article([A, RECAPTIONED, B, C]), 'bundle');
  /** Each photo the version prints, as [section id, caption]. */
  const photosOf = (output) => output.sections.flatMap((s) => s.content.filter((b) => b.type === 'photo').map((b) => [s.id, b.caption]));

  test('a move, a later caption edit, then a pass that takes the photo to another section with the writer\'s caption and swaps its neighbours: the page prints it once, and the report matches the stored version', () => {
    const sentBack = article([A, RECAPTIONED, B, C]);
    const roundTwo = roundTwoRecaptioned();
    expect(roundTwo.edits.map((e) => [e.id, e.path, Boolean(e.between)])).toEqual([
      ['E1', 'sections[#s].content[1]', true],
      ['E2', 'sections[#s].content[1].caption', false]
    ]);
    const edits = D.carriedEdits(roundTwo, sentBack);
    const { output, report } = D.settleEdits(null, { edits, before: sentBack, after: article([B, A, C], [P]), pass: 1 });
    // The caption's restore puts the photo back where it sat, and the copy in "t" goes.
    expect(photosOf(output)).toEqual([['s', RECAPTIONED.caption]]);
    expect(order(output)).toBe('BPAC');
    // Task 4.3c: the move's entry says what the stored version holds: the photo back in the
    // director's section, and, since no place keeps A before B, out of their order there.
    // The caption is put back, and no sentence of the writer's caption comes back from a
    // second copy.
    expect(report.changed).toEqual([
      expect.objectContaining({ id: 'E1', moved: true, became: 'section "t"', restored: true, inOrder: false }),
      expect.objectContaining({ id: 'E2', moved: false, removed: false, restored: true })
    ]);
    // Out of the director's order, the stored version does not carry the move.
    expect(D.carriedEdits(edits, output).map((e) => e.id)).toEqual(['E2']);
  });

  test('the same pass with the photo\'s neighbours left in order puts the photo back in the director\'s place, once, with the director\'s caption', () => {
    const sentBack = article([A, RECAPTIONED, B, C]);
    const edits = D.carriedEdits(roundTwoRecaptioned(), sentBack);
    const { output, report } = D.settleEdits(null, { edits, before: sentBack, after: article([A, B, C], [P]), pass: 1 });
    expect(photosOf(output)).toEqual([['s', RECAPTIONED.caption]]);
    expect(order(output)).toBe('APBC');
    expect(report.changed).toEqual([
      expect.objectContaining({ id: 'E1', moved: true, became: 'section "t"', restored: true }),
      expect.objectContaining({ id: 'E2', moved: false, removed: false, restored: true })
    ]);
    expect(D.carriedEdits(edits, output).map((e) => e.id)).toEqual(['E1', 'E2']);
  });

  test('a pass that leaves the photo in the director\'s section out of order and copies it into another section: the page prints it once, in the pass\'s order, reported as not put back', () => {
    const director = article([A, P, B, C]);
    const { edits } = roundOne();
    const { output, report } = D.settleEdits(null, { edits, before: director, after: article([B, P, A, C], [P]), pass: 1 });
    expect(photosOf(output)).toEqual([['s', P.caption]]);
    expect(order(output)).toBe('BPAC');
    expect(report.changed).toEqual([expect.objectContaining({
      id: 'E1', moved: true, became: 'another place in section "s"', restored: false
    })]);
    expect(D.carriedEdits(edits, output)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5: the meeting's edits (spec 4.4 and section 7; R11)
// ═══════════════════════════════════════════════════════════════════════════
//
// The director's changes at the story meeting are edits, through the fixes' machinery:
// code keeps the writer's last weave as the baseline and, at every approve, reweave and
// send-back, diffs the director's version against it. The edits stand past approve, by
// id; an automatic pass or a reweave is held to them (a line put back, a struck
// connection struck again by id); a send-back may change one, with its reason. The
// answers are the director's words, kept by their own rule, and are no edit.
describe('4.5: the meeting\'s edits', () => {
  /** The writer's weave as the meeting showed it. Invented text. */
  const writers = () => ({
    story: 'The room built a case against Rowan and it landed on Ellis.',
    question: 'Will the verdict cost Ellis anything?',
    headline: 'Ellis Pointed the Room at Rowan',
    convergence: 'The retainer and the empty chair meet the old sign-off.',
    threads: [
      { id: 't1', claim: 'The case against Rowan held at four votes.', role: 'main-thread', receipt: 'ledger', verdict: true },
      { id: 't2', claim: 'The RowanVale account took the last two minutes of selling.', role: 'grounds-it', receipt: 'ledger' },
      { id: 't3', claim: 'Two allies split over the same secret.', role: 'complicates-it', receipt: 'row001' }
    ],
    connections: [
      { id: 'c1', kind: 'person', joins: ['t1', 't3'], detail: 'Sloane turned the room against Rowan.' },
      { id: 'c2', kind: 'moment', joins: ['t1', 't2'], detail: 'The scoreboard brought the money into the vote.' }
    ],
    questions: [
      { id: 'q1', kind: 'player', about: 'Kai', question: 'The record holds nothing Kai did: what did Kai do?', changes: 'Where Kai appears.' }
    ]
  });
  const ADDED = { id: 't7', claim: 'The guest list was rewritten that morning.', role: 'grounds-it' };
  /** The director's version: the story rewritten, t3 re-roled, a thread added, c2 struck, q1 answered. */
  const directors = () => {
    const weave = writers();
    weave.story = 'Someone built the case against Rowan, and it failed in the room.';
    weave.threads[2].role = 'mirrors-it';
    weave.threads.push({ ...ADDED });
    weave.connections[1].struck = true;
    weave.questions[0].answer = 'Kai ran the coat check all morning.';
    return weave;
  };
  const byPath = (edits) => Object.fromEntries(edits.map((e) => [e.path, e]));

  describe('weaveEditsBetween: one change per place', () => {
    it('a field rewritten, a role changed, a thread added whole and a connection struck whole; the answer is no edit', () => {
      const changes = D.weaveEditsBetween(writers(), directors());
      expect(changes.map((c) => D._testing.pathOf(c.at))).toEqual(['story', 'threads[#t3].role', 'threads[#t7]', 'connections[#c2]']);
      const [story, role, added, struck] = changes;
      expect(story).toMatchObject({ scope: 'story', before: writers().story, after: directors().story });
      expect(role).toMatchObject({ scope: 'threads', before: 'complicates-it', after: 'mirrors-it' });
      expect(added).toMatchObject({ scope: 'threads', before: null, after: ADDED });
      expect(struck).toMatchObject({ scope: 'connections', struck: true, before: writers().connections[1], after: directors().connections[1] });
    });

    // Brief 4.5c (the ledger's ruling on 4.5b's minor 5): bringing a struck connection back is
    // the director's change, one change of the whole connection, marked unstruck. It was no
    // change until then, so a reweave carrying only it was refused as empty.
    it('a connection unstruck puts the writer\'s connection back, one change of the whole connection, marked unstruck', () => {
      expect(D.weaveEditsBetween(directors(), { ...directors(), connections: writers().connections })).toEqual([
        expect.objectContaining({ scope: 'connections', before: directors().connections[1], after: writers().connections[1], unstruck: true })
      ]);
    });

    it('a thread removed is a cut; the questions are read only when asked for, never their answers', () => {
      const less = { ...writers(), threads: writers().threads.slice(0, 2) };
      const cut = D.weaveEditsBetween(writers(), less);
      expect(cut).toHaveLength(1);
      expect(cut[0]).toMatchObject({ scope: 'threads', before: writers().threads[2], after: null });
      const asked = { ...writers(), questions: [...writers().questions, { id: 'q2', kind: 'pronoun', about: 'Sloane', question: 'Which pronoun?', changes: 'A pronoun.' }] };
      expect(D.weaveEditsBetween(writers(), asked)).toEqual([]);
      expect(D.weaveEditsBetween(writers(), asked, { questions: true }).map((c) => D._testing.pathOf(c.at))).toEqual(['questions[#q2]']);
      const answered = { ...writers(), questions: [{ ...writers().questions[0], answer: 'Kai left early.' }] };
      expect(D.weaveEditsBetween(writers(), answered, { questions: true })).toEqual([]);
    });
  });

  describe('standingAtMeeting: the director\'s version against the writer\'s last weave', () => {
    it('gives each change an id, and records what a rewrite removed', () => {
      const standing = D.standingAtMeeting(null, writers(), directors());
      expect(standing.kind).toBe('weave');
      expect(standing.issued).toBe(4);
      expect(standing.edits.map((e) => [e.id, e.path])).toEqual([
        ['E1', 'story'], ['E2', 'threads[#t3].role'], ['E3', 'threads[#t7]'], ['E4', 'connections[#c2]']
      ]);
      expect(standing.edits[0].removed).toEqual([writers().story]);
      expect(standing.edits[3]).toMatchObject({ struck: true });
      expect(standing.edits[3]).not.toHaveProperty('removed');
    });

    it('stands past approve with its ids: a later action keeps each edit the director\'s version still carries and numbers on', () => {
      const first = D.standingAtMeeting(null, writers(), directors());
      const later = { ...directors(), headline: 'Ellis Pointed the Room at Rowan. It Named Him.' };
      const second = D.standingAtMeeting(first, writers(), later);
      expect(second.edits.map((e) => [e.id, e.path])).toEqual([
        ['E1', 'story'], ['E2', 'threads[#t3].role'], ['E3', 'threads[#t7]'], ['E4', 'connections[#c2]'], ['E5', 'headline']
      ]);
      expect(second.issued).toBe(5);
    });

    it('drops an edit the director undid, and adds none for it', () => {
      const first = D.standingAtMeeting(null, writers(), directors());
      const undone = directors();
      undone.threads[2].role = 'complicates-it';
      const second = D.standingAtMeeting(first, writers(), undone);
      expect(second.edits.map((e) => e.id)).toEqual(['E1', 'E3', 'E4']);
      expect(second.issued).toBe(4);
    });

    it('after a reweave the baseline is the reweave\'s weave, which carries the director\'s lines; the edits stand and only a new change is added', () => {
      const first = D.standingAtMeeting(null, writers(), directors());
      const rewoven = { ...directors(), convergence: 'The reweave moved the convergence.' };
      const next = { ...clone(rewoven), question: 'Who pays for the frame?' };
      const second = D.standingAtMeeting(first, rewoven, next);
      expect(second.edits.map((e) => [e.id, e.path])).toEqual([
        ['E1', 'story'], ['E2', 'threads[#t3].role'], ['E3', 'threads[#t7]'], ['E4', 'connections[#c2]'], ['E5', 'question']
      ]);
    });

    it('is null when nothing changed and no id was ever given', () => {
      expect(D.standingAtMeeting(null, writers(), writers())).toBeNull();
    });
  });

  it("weaveDirectorsShare reads the director's share of the weave from the edits", () => {
    const edits = D.standingAtMeeting(null, writers(), { ...directors(), threads: directors().threads.map((t) => (t.id === 't2' ? { ...t, receipt: 'zzz999' } : t)) }).edits;
    expect(D.weaveDirectorsShare(edits)).toEqual({
      addedThreads: { t7: 'E4' },
      reroledThreads: { t3: 'E3' },
      fields: { story: 'E1' },
      threadFields: { 't2.receipt': 'E2' }
    });
    expect(D.weaveDirectorsShare(null)).toEqual({ addedThreads: {}, reroledThreads: {}, fields: {}, threadFields: {} });
  });

  it('carriedEdits: a weave carries each edit whose place holds the director\'s value', () => {
    const standing = D.standingAtMeeting(null, writers(), directors());
    expect(D.carriedEdits(standing, directors()).map((e) => e.id)).toEqual(['E1', 'E2', 'E3', 'E4']);
    const rewritten = { ...directors(), story: 'A paraphrase of the director\'s story.' };
    rewritten.connections = writers().connections;
    expect(D.carriedEdits(standing, rewritten).map((e) => e.id)).toEqual(['E2', 'E3']);
  });

  it('formatEditLines names each change by its place, an added thread as added and a struck connection as struck', () => {
    const lines = D.formatEditLines(D.standingAtMeeting(null, writers(), directors()).edits).split('\n');
    expect(lines).toEqual([
      `E1 (story): "${directors().story}"`,
      `  removed: "${writers().story}"`,
      'E2 (thread "t3", role): "mirrors-it"',
      `E3 (thread "t7", added): id "t7"; claim "${ADDED.claim}"; role "grounds-it"`,
      'E4 (connection "c2", struck): kind "moment"; joins "t1" / "t2"; detail "The scoreboard brought the money into the vote."'
    ]);
  });

  describe('a reweave is held to the edits as an automatic pass is (R11)', () => {
    const standing = () => D.standingAtMeeting(null, writers(), directors());
    const rework = () => {
      const weave = directors();
      weave.story = 'A reweave that paraphrased the director\'s story.';
      weave.threads = weave.threads.filter((t) => t.id !== 't7');
      delete weave.connections[1].struck;
      weave.headline = 'A headline the reweave wrote.';
      return weave;
    };

    it('puts back the paraphrased line and the dropped thread, strikes the connection again by id, and keeps the writer\'s new headline', () => {
      const edits = D.carriedEdits(standing(), directors());
      const { output, report } = D.settleEdits(null, { edits, before: directors(), after: rework(), pass: D.REWEAVE_PASS });
      expect(output.story).toBe(directors().story);
      expect(output.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't7']);
      expect(output.connections[1]).toEqual(directors().connections[1]);
      expect(output.headline).toBe('A headline the reweave wrote.');
      expect(report.changed.map((c) => [c.id, c.restored, c.automatic])).toEqual([['E1', true, false], ['E3', true, false], ['E4', true, false]]);
      expect(report.changed.find((c) => c.id === 'E4')).toMatchObject({ struck: true, where: 'connection "c2", struck' });
    });

    it('a send-back is left as it is, with the rework\'s reasons', () => {
      const edits = D.carriedEdits(standing(), directors());
      const { output, report } = D.settleEdits(null, {
        edits, before: directors(), after: rework(), pass: D.SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asked for a new story.' }]
      });
      expect(output.story).toBe('A reweave that paraphrased the director\'s story.');
      expect(report.changed.find((c) => c.id === 'E1')).toMatchObject({ reason: 'The note asked for a new story.', restored: false, automatic: false });
    });
  });

  it("locateQuotedText: a finding that quotes the director's line is about their edit; one that quotes the writer's is the writer's", () => {
    const standing = D.standingAtMeeting(null, writers(), directors());
    const edits = D.carriedEdits(standing, directors());
    expect(D.locateQuotedText(`T1: "${directors().story}" states a motive.`, edits, directors())).toEqual({ editIds: ['E1'], writer: false });
    expect(D.locateQuotedText(`T3: "${writers().threads[1].claim}" names a buried memory's owner.`, edits, directors())).toEqual({ editIds: [], writer: true });
    expect(D.locateQuotedText('T1: "The scoreboard brought the money into the vote" is a false cause.', edits, directors()).editIds).toEqual(['E4']);
  });

  it('weaveMarks: what the rework changed, from the director\'s version; nothing for the lines code kept', () => {
    const rewoven = directors();
    rewoven.headline = 'A headline the reweave wrote.';
    rewoven.questions.push({ id: 'q2', kind: 'pronoun', about: 'Sloane', question: 'Which pronoun for Sloane?', changes: "Sloane's pronoun." });
    expect(D.weaveMarks(directors(), rewoven)).toEqual([
      { path: 'headline', where: 'headline', before: directors().headline, after: 'A headline the reweave wrote.' },
      { path: 'questions[#q2]', where: 'question "q2", added', before: '', after: expect.stringContaining('Which pronoun for Sloane?') }
    ]);
    expect(D.weaveMarks(directors(), directors())).toEqual([]);
  });

  // Fix round 1, finding 1: a thread the director added is one edit, the whole thread.
  // After a reweave kept it, the baseline holds it, so a later change the director makes
  // to part of it must stay part of that edit: split into a field edit against the
  // baseline, the rest of the thread would be protected by nothing and checked as the
  // writer's.
  describe('fix round 1: a whole element the director put in stays one edit when they change part of it', () => {
    /** The meeting after a reweave that kept every line of the director's: its weave is the baseline. */
    const rewoven = () => directors();
    const withT7 = (change) => {
      const weave = directors();
      weave.threads = weave.threads.map((t) => (t.id === 't7' ? change(t) : t));
      return weave;
    };

    it.each([
      ['its role', (t) => ({ ...t, role: 'mirrors-it' })],
      ['its claim', (t) => ({ ...t, claim: 'The guest list was rewritten twice that morning.' })],
      ['a receipt typed into it', (t) => ({ ...t, receipt: 'zzz999' })]
    ])('a thread they added, changed in %s: one added edit under its id, the whole thread as they left it', (_name, change) => {
      const first = D.standingAtMeeting(null, writers(), directors());
      const left = withT7(change);
      const second = D.standingAtMeeting(first, rewoven(), left, { shown: rewoven() });
      expect(second.edits.map((e) => [e.id, e.path])).toEqual([
        ['E1', 'story'], ['E2', 'threads[#t3].role'], ['E3', 'threads[#t7]'], ['E4', 'connections[#c2]']
      ]);
      expect(second.issued).toBe(4);
      expect(byPath(second.edits)['threads[#t7]']).toMatchObject({ before: null, after: left.threads.find((t) => t.id === 't7') });
      expect(D.weaveDirectorsShare(second.edits).addedThreads).toEqual({ t7: 'E3' });
      expect(D.carriedEdits(second, left).map((e) => e.id)).toEqual(['E1', 'E2', 'E3', 'E4']);
    });

    it('a reweave that then paraphrases the thread gets it put back whole, still marked added', () => {
      const first = D.standingAtMeeting(null, writers(), directors());
      const left = withT7((t) => ({ ...t, role: 'mirrors-it' }));
      const second = D.standingAtMeeting(first, rewoven(), left, { shown: rewoven() });
      const rework = clone(left);
      rework.threads = rework.threads.map((t) => (t.id === 't7' ? { ...t, claim: 'The guest list may have changed.' } : t));
      const { output, report } = D.settleEdits(null, { edits: D.carriedEdits(second, left), before: left, after: rework, pass: D.REWEAVE_PASS });
      expect(output.threads.find((t) => t.id === 't7')).toEqual(left.threads.find((t) => t.id === 't7'));
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E3', where: 'thread "t7", added', restored: true, pass: 'reweave' })]);
    });

    it('a connection they struck stays one strike when they change its detail, and goes when they unstrike it', () => {
      const first = D.standingAtMeeting(null, writers(), directors());
      const detailed = directors();
      detailed.connections[1].detail = 'The scoreboard, which the director struck.';
      const second = D.standingAtMeeting(first, rewoven(), detailed, { shown: rewoven() });
      expect(second.edits.map((e) => [e.id, e.path])).toEqual([
        ['E1', 'story'], ['E2', 'threads[#t3].role'], ['E3', 'threads[#t7]'], ['E4', 'connections[#c2]']
      ]);
      expect(byPath(second.edits)['connections[#c2]']).toMatchObject({ struck: true, after: detailed.connections[1] });
      const unstruck = directors();
      delete unstruck.connections[1].struck;
      // Brief 4.5c: the strike goes, and bringing the connection back is the next edit.
      expect(D.standingAtMeeting(first, rewoven(), unstruck, { shown: rewoven() }).edits.map((e) => [e.id, e.path, e.unstruck === true]))
        .toEqual([['E1', 'story', false], ['E2', 'threads[#t3].role', false], ['E3', 'threads[#t7]', false], ['E5', 'connections[#c2]', true]]);
    });

    it("a thread a send-back's rework changed, which the director leaves as the meeting showed it, is the writer's again", () => {
      const first = D.standingAtMeeting(null, writers(), directors());
      const reworked = withT7((t) => ({ ...t, claim: 'The rework rewrote the thread the director added.', receipt: 'row001' }));
      const second = D.standingAtMeeting(first, reworked, clone(reworked), { shown: reworked });
      expect(second.edits.map((e) => e.path)).toEqual(['story', 'threads[#t3].role', 'connections[#c2]']);
      expect(D.weaveDirectorsShare(second.edits).addedThreads).toEqual({});
    });

    it("a thread a send-back's rework changed, which the director then changes again: their change is a field edit, and the rest stays the writer's", () => {
      const first = D.standingAtMeeting(null, writers(), directors());
      const reworked = withT7((t) => ({ ...t, claim: 'The rework rewrote the thread the director added.', receipt: 'row001' }));
      const left = clone(reworked);
      left.threads = left.threads.map((t) => (t.id === 't7' ? { ...t, role: 'mirrors-it' } : t));
      const second = D.standingAtMeeting(first, reworked, left, { shown: reworked });
      expect(second.edits.map((e) => [e.id, e.path])).toEqual([
        ['E1', 'story'], ['E2', 'threads[#t3].role'], ['E4', 'connections[#c2]'], ['E5', 'threads[#t7].role']
      ]);
      expect(D.weaveDirectorsShare(second.edits)).toMatchObject({ addedThreads: {}, reroledThreads: { t3: 'E2', t7: 'E5' } });
    });
  });

  // Fix round 1, finding 3: the diff reads an id as the meeting's gate and the checks do
  // (lib/weave.js weaveIdOf) and a repeated id by the same rule (repeatedIds). It pairs the
  // elements under a repeated id in order and flags each change under one, so none is
  // dropped; an edit there could find no element by its id, so standingAtMeeting refuses
  // one, which the meeting's gate refuses first.
  describe('fix round 1: an id the weave repeats', () => {
    const doubledT7 = () => {
      const weave = directors();
      weave.threads.push({ id: 't7 ', claim: 'The guest list was burned that night.', role: 'grounds-it' });
      return weave;
    };

    it('reads "t7" and "t7 " as one id: both threads are in the diff, in order, each flagged', () => {
      const added = D.weaveEditsBetween(writers(), doubledT7()).filter((c) => c.before === null);
      expect(added.map((c) => [D._testing.pathOf(c.at), c.after.claim, c.repeatedId])).toEqual([
        ['threads[#t7]', ADDED.claim, true],
        ['threads[#t7]', 'The guest list was burned that night.', true]
      ]);
    });

    it("pairs a writer's repeated id in order: a change to the second element is flagged, and elements left as they were are no change", () => {
      const repeated = writers();
      repeated.threads.push({ ...repeated.threads[1], claim: 'A second thread the writer put under t2.' });
      expect(D.weaveEditsBetween(repeated, clone(repeated))).toEqual([]);
      const changed = clone(repeated);
      changed.threads[3].role = 'mirrors-it';
      expect(D.weaveEditsBetween(repeated, changed)).toEqual([
        expect.objectContaining({ scope: 'threads', before: 'grounds-it', after: 'mirrors-it', repeatedId: true })
      ]);
      // An id no version repeats carries no flag.
      expect(D.weaveEditsBetween(writers(), directors()).some((c) => 'repeatedId' in c)).toBe(false);
    });

    it("standingAtMeeting refuses to make an edit under a repeated id, which no id can find; the meeting's gate refuses that change first", () => {
      expect(() => D.standingAtMeeting(null, writers(), doubledT7())).toThrow(/thread "t7".*repeats.*lib\/meeting\.js directorWeaveProblems/);
    });

    it('weaveMarks keeps the flag, so the meeting can say a mark sits under a repeated id', () => {
      const rewoven = directors();
      rewoven.threads.push({ ...rewoven.threads[1], claim: 'A thread the reweave added under t2.' });
      expect(D.weaveMarks(directors(), rewoven)).toEqual([
        { path: 'threads[#t2]', where: 'thread "t2", added', before: '', after: expect.stringContaining('A thread the reweave added under t2.'), repeatedId: true }
      ]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5b, fix round 1 (finding 2): one rule for an element's place under its id
// ═══════════════════════════════════════════════════════════════════════════
//
// The diff pairs the elements under an id in order (elementsById), and the questions' carry
// reads a question's place by lib/weave.js occurrenceKeys. Two copies of one rule can drift
// apart; the diff calls occurrenceKeys itself (the 4.5b merge), and this holds the pairing.
describe('4.5b: the diff pairs the elements under an id as lib/weave.js occurrenceKeys places them', () => {
  const { occurrenceKeys } = require('../weave');
  /** Threads under these ids, each claim naming its version and its index. */
  const threads = (version, ids) => ids.map((id, i) => ({ id, claim: `${version}${i}`, role: 'grounds-it', receipt: 'ledger' }));
  /** For each thread of `after`, the index of the thread of `before` the diff pairs it with; null for one it added. */
  function diffPairs(before, after) {
    const changes = D.weaveEditsBetween({ threads: before }, { threads: after });
    return after.map((_thread, index) => {
      const change = changes.find((c) => c.at[1].index === index && (c.before === null || (c.at[2] && c.at[2].key === 'claim')));
      if (!change || change.before === null) return null;
      return before.findIndex((thread) => thread.claim === change.before);
    });
  }
  /** The same pairing read from occurrenceKeys: the thread of `before` in the same place, or null. */
  function placePairs(before, after) {
    const places = occurrenceKeys(before);
    return occurrenceKeys(after).map((place) => (places.includes(place) ? places.indexOf(place) : null));
  }

  it.each([
    ['a repeated id, in order', ['t1', 't2', 't2', 't3'], ['t1', 't2', 't2', 't3']],
    ['a repeated id, with another thread moved between its occurrences', ['t2', 't1', 't2'], ['t1', 't2', 't2']],
    ['a third occurrence added', ['t2', 't2'], ['t2', 't2', 't2']],
    ['an occurrence gone', ['t2', 't2', 't2'], ['t2', 't2']],
    ['an id read trimmed', ['t2', 't2 '], [' t2', 't2']]
  ])('%s', (_case, beforeIds, afterIds) => {
    const before = threads('b', beforeIds);
    const after = threads('a', afterIds);
    const pairs = diffPairs(before, after);
    expect(pairs.some((index) => index !== null)).toBe(true);
    expect(pairs).toEqual(placePairs(before, after));
  });
});

describe('4.6: the map\'s edits', () => {
  /** The writer's map as the stop showed it. Invented text. */
  const writers = () => ({
    headline: 'Ellis Reeve Pointed the Room at Rowan',
    deck: 'Money moved into an account named for a player in the last two minutes of selling.',
    topPhoto: 'huddle.jpg',
    sections: [
      {
        slot: 'lede', heading: '', job: 'Open on the vote and ask what it will cost.',
        beats: [
          { id: 'b1', kind: 'scene', material: 'The scoreboard goes up on the screen', players: ['Ellis', 'Rowan'] },
          { id: 'b2', kind: 'line', material: 'Rowan: "Someone is framing me"', players: ['Rowan'], connection: 'c1' }
        ],
        photos: []
      },
      {
        slot: 'theStory', heading: 'The Story', job: 'How the room built its case.',
        beats: [
          { id: 'b3', kind: 'receipt', material: 'row001, the fight in the hall', players: ['Sloane'], card: 'row001' },
          { id: 'b4', kind: 'scene', material: 'The first vote, six to four', players: ['Mira', 'Vale'] }
        ],
        photos: [{ filename: 'theory.jpg', beat: 'b4' }, { filename: 'cards.jpg' }]
      }
    ],
    dropped: [{ slot: 'thePlayers', reason: 'Everyone appears above.' }],
    leftOut: [{ id: 'b9', kind: 'scene', material: 'Kai at the coat check', players: ['Kai'] }],
    expectedLength: 1200,
    weaveChanges: []
  });
  const pathsOf = (changes) => changes.map((c) => D._testing.pathOf(c.at));
  const ADDED = { id: 'b10', kind: 'line', material: 'Kai: "I took every coat that morning"', players: ['Kai'] };

  describe('mapEditsBetween: one change per place, each beat by its id and each photo by its filename', () => {
    it("a beat's material rewritten is one field edit, wherever the beat sits", () => {
      const left = writers();
      left.sections[1].beats[1].material = 'The two rounds, six to four and five to four';
      const changes = D.mapEditsBetween(writers(), left);
      expect(pathsOf(changes)).toEqual(['sections[#theStory].beats[#b4].material']);
      expect(changes[0]).toMatchObject({ scope: 'map', before: 'The first vote, six to four', after: 'The two rounds, six to four and five to four' });
    });

    it('a beat moved to another section is one move, from the section it left', () => {
      const left = writers();
      left.sections[0].beats.push(left.sections[1].beats.pop());
      const changes = D.mapEditsBetween(writers(), left);
      expect(pathsOf(changes)).toEqual(['sections[#lede].beats[#b4]']);
      expect(changes[0]).toMatchObject({ before: null, after: writers().sections[1].beats[1], from: 'theStory' });
      expect(changes[0]).not.toHaveProperty('struck');
    });

    it('a struck beat is a move into leftOut, marked struck; a beat brought back is a move from leftOut', () => {
      const struck = writers();
      struck.leftOut.push(struck.sections[0].beats.pop());
      expect(D.mapEditsBetween(writers(), struck)).toEqual([
        expect.objectContaining({ at: [{ key: 'leftOut' }, { index: 1, match: { id: 'b2' } }], from: 'lede', struck: true })
      ]);
      const back = writers();
      back.sections[1].beats.push(back.leftOut.pop());
      expect(D.mapEditsBetween(writers(), back)).toEqual([
        expect.objectContaining({ at: [{ key: 'sections' }, { index: 1, match: { slot: 'theStory' } }, { key: 'beats' }, { index: 2, match: { id: 'b9' } }], from: 'leftOut' })
      ]);
    });

    it('a beat the director added is placed from none, whole; a beat moved and rewritten is a move and a field edit at its new place', () => {
      const added = writers();
      added.sections[1].beats.push({ ...ADDED });
      expect(D.mapEditsBetween(writers(), added)).toEqual([
        expect.objectContaining({ before: null, after: ADDED, from: 'none' })
      ]);
      const both = writers();
      const moved = both.sections[1].beats.pop();
      both.sections[0].beats.push({ ...moved, material: 'The vote that named Ellis' });
      expect(pathsOf(D.mapEditsBetween(writers(), both))).toEqual(['sections[#lede].beats[#b4]', 'sections[#lede].beats[#b4].material']);
    });

    it('a photo moved to another section is one move; the top photo the director chose moves the new one up and the old one down', () => {
      const moved = writers();
      moved.sections[0].photos.push(moved.sections[1].photos.pop());
      const [photo] = D.mapEditsBetween(writers(), moved);
      expect(D._testing.pathOf(photo.at)).toBe('sections[#lede].photos[#cards.jpg]');
      expect(photo).toMatchObject({ from: 'theStory', after: { filename: 'cards.jpg' } });
      const swapped = writers();
      swapped.topPhoto = 'cards.jpg';
      swapped.sections[1].photos[1] = { filename: 'huddle.jpg' };
      const changes = D.mapEditsBetween(writers(), swapped);
      expect(changes.map((c) => [D._testing.pathOf(c.at), c.from])).toEqual([
        ['topPhoto', 'theStory'],
        ['sections[#theStory].photos[#huddle.jpg]', 'topPhoto']
      ]);
    });

    it("the headline, a section's job and a dropped slot's reason are field edits; a section's beat order is no change", () => {
      const left = writers();
      left.headline = 'Ellis Reeve Pointed the Room at Rowan. It Named Him.';
      left.sections[1].job = 'How the room built its case, and lost it.';
      left.dropped[0].reason = 'The players appear in the story.';
      left.sections[1].beats.reverse();
      expect(pathsOf(D.mapEditsBetween(writers(), left))).toEqual(['headline', 'dropped[#thePlayers].reason', 'sections[#theStory].job']);
    });
  });

  describe('standingOnMap: the edits stand past approve, against the writer\'s last map', () => {
    const directors = () => {
      const map = writers();
      map.headline = 'The Room Named Ellis Reeve Instead';
      map.leftOut.push(map.sections[0].beats.pop());
      map.sections[1].beats.push({ ...ADDED });
      return map;
    };

    it('gives each change an id, and records what a rewrite removed', () => {
      const standing = D.standingOnMap(null, writers(), directors());
      expect(standing.kind).toBe('map');
      expect(standing.edits.map((e) => [e.id, e.path])).toEqual([
        ['E1', 'headline'], ['E2', 'sections[#theStory].beats[#b10]'], ['E3', 'leftOut[#b2]']
      ]);
      expect(standing.edits[0].removed).toEqual([writers().headline]);
      expect(standing.edits[2]).toMatchObject({ struck: true, from: 'lede' });
    });

    it('a later approve of the same map gives no new id; a change undone drops its edit and a new one takes the next id', () => {
      const first = D.standingOnMap(null, writers(), directors());
      expect(D.standingOnMap(first, writers(), directors())).toEqual(first);
      const later = directors();
      later.headline = writers().headline;
      later.deck = 'The account was named for a player who never sold a thing.';
      const second = D.standingOnMap(first, writers(), later);
      expect(second.edits.map((e) => [e.id, e.path])).toEqual([
        ['E2', 'sections[#theStory].beats[#b10]'], ['E3', 'leftOut[#b2]'], ['E4', 'deck']
      ]);
    });

    it('a field edit stands where the beat sits now, and is not given a second id when the director moves the beat', () => {
      const rewritten = writers();
      rewritten.sections[1].beats[1].material = 'The two rounds, six to four and five to four';
      const first = D.standingOnMap(null, writers(), rewritten);
      const moved = clone(rewritten);
      moved.sections[0].beats.push(moved.sections[1].beats.pop());
      const second = D.standingOnMap(first, writers(), moved);
      expect(second.edits.map((e) => [e.id, e.path])).toEqual([
        ['E1', 'sections[#lede].beats[#b4].material'], ['E2', 'sections[#lede].beats[#b4]']
      ]);
    });
  });

  describe('settleEdits on the map: an automatic pass is held to the edits', () => {
    const directors = () => {
      const map = writers();
      map.sections[1].beats[1].material = 'The two rounds, six to four and five to four';
      map.leftOut.push(map.sections[0].beats.pop());
      map.sections[0].photos.push(map.sections[1].photos.pop());
      map.sections[1].beats.push({ ...ADDED });
      return map;
    };
    const editsOf = (map) => D.carriedEdits(D.standingOnMap(null, writers(), map), map);

    it("puts back a rewritten line by the beat's id, strikes again a struck beat the pass brought back, moves back a moved photo and restores an added beat, each recorded", () => {
      const before = directors();
      const edits = editsOf(before);
      expect(edits.map((e) => e.path)).toEqual([
        'sections[#theStory].beats[#b4].material', 'sections[#theStory].beats[#b10]', 'leftOut[#b2]', 'sections[#lede].photos[#cards.jpg]'
      ]);
      const pass = clone(before);
      pass.sections[1].beats[1].material = 'The first vote';                  // the director's line rewritten
      pass.sections[0].beats.push(pass.leftOut.pop());                        // the struck beat brought back
      pass.sections[1].photos.push(pass.sections[0].photos.pop());            // the moved photo moved back
      pass.sections[1].beats = pass.sections[1].beats.filter((b) => b.id !== 'b10');   // the added beat removed
      const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
      expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(edits.map((e) => e.id));
      expect(settled.output.sections[0].beats.map((b) => b.id)).toEqual(['b1']);
      expect(settled.output.leftOut.map((b) => b.id)).toEqual(['b9', 'b2']);
      expect(settled.output.sections[0].photos).toEqual([{ filename: 'cards.jpg' }]);
      expect(settled.output.sections[1].photos).toEqual([{ filename: 'theory.jpg', beat: 'b4' }]);
      expect(settled.output.sections[1].beats.find((b) => b.id === 'b10')).toEqual(ADDED);
      expect(settled.report.changed.map((c) => [c.id, c.restored, c.moved])).toEqual([
        ['E1', true, false], ['E2', true, true], ['E3', true, true], ['E4', true, true]
      ]);
      expect(settled.report.changed[2]).toMatchObject({ struck: true, where: 'left out, beat "b2", struck from section "lede"', became: 'section "lede"' });
    });

    it('a field edit is put back on the beat where the pass moved it, printed once', () => {
      const before = directors();
      const edits = editsOf(before);
      const pass = clone(before);
      const b4 = pass.sections[1].beats.splice(1, 1)[0];
      pass.sections[0].beats.push({ ...b4, material: 'The first vote' });
      const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
      const all = settled.output.sections.flatMap((s) => s.beats).filter((b) => b.id === 'b4');
      expect(all).toEqual([{ ...b4, material: 'The two rounds, six to four and five to four' }]);
    });

    it('the top photo the director chose is put back', () => {
      const chosen = writers();
      chosen.topPhoto = 'cards.jpg';
      chosen.sections[1].photos[1] = { filename: 'huddle.jpg' };
      const edits = editsOf(chosen);
      const pass = clone(chosen);
      pass.topPhoto = 'huddle.jpg';
      pass.sections[1].photos[1] = { filename: 'cards.jpg' };
      const settled = D.settleEdits(null, { edits, before: chosen, after: pass, pass: 1 });
      expect(settled.output.topPhoto).toBe('cards.jpg');
      expect(settled.output.sections[1].photos.map((p) => p.filename)).toEqual(['theory.jpg', 'huddle.jpg']);
      expect(D.carriedEdits(edits, settled.output)).toHaveLength(2);
    });

    it('a beat the director moved between sections, which the pass removed, stays out and is reported', () => {
      const moved = writers();
      moved.sections[0].beats.push(moved.sections[1].beats.pop());
      const edits = editsOf(moved);
      const pass = clone(moved);
      pass.sections[0].beats.pop();
      const settled = D.settleEdits(null, { edits, before: moved, after: pass, pass: 1 });
      expect(settled.output).toEqual(pass);
      expect(settled.report.changed).toEqual([
        expect.objectContaining({ id: 'E1', moved: true, became: null, restored: false, where: 'section "lede", beat "b4", moved from section "theStory"' })
      ]);
    });

    it("a send-back's rework is left as it is", () => {
      const before = directors();
      const edits = editsOf(before);
      const pass = clone(before);
      pass.sections[0].beats.push(pass.leftOut.pop());
      const settled = D.settleEdits(null, { edits, before, after: pass, pass: D.SEND_BACK_PASS });
      expect(settled.output).toEqual(pass);
      expect(settled.report.changed.map((c) => [c.id, c.restored])).toEqual([['E3', false]]);
    });
  });

  describe('reading the map\'s edits', () => {
    it("formatEditLines names each edit by its id and place; a moved or struck beat by its id alone, its text the writer's", () => {
      const map = writers();
      map.headline = 'The Room Named Ellis Reeve Instead';
      map.leftOut.push(map.sections[0].beats.pop());
      map.sections[1].beats.push({ ...ADDED });
      expect(D.formatEditLines(D.standingOnMap(null, writers(), map).edits)).toBe([
        'E1 (headline): "The Room Named Ellis Reeve Instead"',
        '  removed: "Ellis Reeve Pointed the Room at Rowan"',
        'E2 (section "theStory", beat "b10", added): id "b10"; kind "line"; material "Kai: "I took every coat that morning""; players "Kai"',
        'E3 (left out, beat "b2", struck from section "lede")'
      ].join('\n'));
      expect(D.MAP_EDIT_LINES_GUIDE).toMatch(/struck/);
    });

    it("diffOutline gives the map's changes by scope", () => {
      const left = writers();
      left.deck = 'A new deck for the map.';
      left.sections[0].beats.push(left.sections[1].beats.pop());
      expect(D.scopeKeys(D.diffOutline(writers(), left))).toEqual(['deck', 'section:lede']);
    });
  });

  // Fix round 1, finding 1: an edit of a whole beat or photo is carried only while the beat
  // or photo sits where the director put it and nowhere else. A copy a pass put in another
  // place is taken out by code, as the director's strike or placement is put back.
  describe('fix round 1: a beat or a photo the director placed sits there and nowhere else', () => {
    const editsOf = (map) => D.carriedEdits(D.standingOnMap(null, writers(), map), map);
    const storyIds = (map) => map.sections.flatMap((s) => s.beats.map((b) => b.id));
    const photosBySection = (map) => map.sections.map((s) => s.photos.map((p) => p.filename));

    it('a struck beat a pass copies back into a section, leaving it in leftOut, is struck again by id, and the report says where the copy was', () => {
      const struck = writers();
      struck.leftOut.push(struck.sections[0].beats.pop());
      const edits = editsOf(struck);
      expect(edits.map((e) => e.path)).toEqual(['leftOut[#b2]']);
      const pass = clone(struck);
      pass.sections[1].beats.push(clone(pass.leftOut[1]));
      expect(D.carriedEdits(edits, pass)).toEqual([]);

      const settled = D.settleEdits(null, { edits, before: struck, after: pass, pass: 1 });
      expect(storyIds(settled.output)).toEqual(['b1', 'b3', 'b4']);
      expect(settled.output.leftOut.map((b) => b.id)).toEqual(['b9', 'b2']);
      expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1']);
      expect(settled.report.changed).toEqual([expect.objectContaining({
        id: 'E1', struck: true, moved: true, automatic: true, pass: 1, restored: true,
        where: 'left out, beat "b2", struck from section "lede"', became: 'section "theStory"'
      })]);
    });

    it('a photo the director moved, which a pass also places in another section, is taken out of that section and recorded', () => {
      const moved = writers();
      moved.sections[0].photos.push(moved.sections[1].photos.pop());
      const edits = editsOf(moved);
      expect(edits.map((e) => e.path)).toEqual(['sections[#lede].photos[#cards.jpg]']);
      const pass = clone(moved);
      pass.sections[1].photos.push({ filename: 'cards.jpg' });
      expect(D.carriedEdits(edits, pass)).toEqual([]);

      const settled = D.settleEdits(null, { edits, before: moved, after: pass, pass: 1 });
      expect(photosBySection(settled.output)).toEqual([['cards.jpg'], ['theory.jpg']]);
      expect(settled.report.changed).toEqual([expect.objectContaining({
        id: 'E1', moved: true, automatic: true, restored: true,
        where: 'section "lede", photo "cards.jpg", moved from section "theStory"', became: 'section "theStory"'
      })]);
    });

    it('the top photo the director chose, which a pass also places in a section, prints once, at the top', () => {
      const chosen = writers();
      chosen.topPhoto = 'cards.jpg';
      chosen.sections[1].photos[1] = { filename: 'huddle.jpg' };
      const edits = editsOf(chosen);
      const pass = clone(chosen);
      pass.sections[0].photos.push({ filename: 'CARDS.JPG' });

      const settled = D.settleEdits(null, { edits, before: chosen, after: pass, pass: 1 });
      expect(settled.output.topPhoto).toBe('cards.jpg');
      expect(photosBySection(settled.output)).toEqual([[], ['theory.jpg', 'huddle.jpg']]);
      expect(D.carriedEdits(edits, settled.output)).toHaveLength(2);
      expect(settled.report.changed).toEqual([expect.objectContaining({ where: expect.stringMatching(/^the top photo, photo "cards\.jpg"/), restored: true, became: 'section "lede"' })]);
    });

    it('a beat the director added, which a pass copies into another section, prints once, where they put it, as they wrote it', () => {
      const added = writers();
      added.sections[1].beats.push({ ...ADDED });
      const edits = editsOf(added);
      const pass = clone(added);
      pass.sections[0].beats.push({ ...ADDED, material: 'Kai took the coats' });

      const settled = D.settleEdits(null, { edits, before: added, after: pass, pass: 1 });
      expect(settled.output.sections.map((s) => s.beats.map((b) => b.id))).toEqual([['b1', 'b2'], ['b3', 'b4', 'b10']]);
      expect(settled.output.sections[1].beats[2]).toEqual(ADDED);
      expect(settled.report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true, became: 'section "lede"' })]);
    });

    it('a line the director wrote on a struck beat, held only by the copy code takes out, goes back on the beat it keeps', () => {
      const struck = writers();
      const b2 = struck.sections[0].beats.pop();
      const line = 'Rowan: "Somebody framed me, and I know who"';
      struck.leftOut.push({ ...b2, material: line });
      const edits = editsOf(struck);
      expect(edits.map((e) => e.path)).toEqual(['leftOut[#b2]', 'leftOut[#b2].material']);
      const pass = clone(struck);
      pass.sections[1].beats.push(clone(pass.leftOut[1]));
      pass.leftOut[1].material = 'Rowan says someone framed him';

      const settled = D.settleEdits(null, { edits, before: struck, after: pass, pass: 1 });
      expect(storyIds(settled.output)).not.toContain('b2');
      expect(settled.output.leftOut[1]).toEqual({ ...b2, material: line });
      expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1', 'E2']);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.3c: what code restores prints once, and the report says where it is
// ═══════════════════════════════════════════════════════════════════════════
//
// A field edit's restore puts back a block an automatic pass removed from its section,
// where it sat. When the pass had moved the block to another section, the pass's copy
// stayed there, so the page printed the photo twice, with two captions (scratch
// fieldonly.js). And when a field restore put back a block the director had moved within
// its section, the move's entry still said the block went to the other section and could
// not be put back, while the stored version held it in the director's section
// (duplicate2.js).
describe('4.3c: a restored block prints once, and the report says where it is', () => {
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const C = paragraph('Charlie paragraph closes the section with a long first line.');
  const T = paragraph('Tango paragraph sits alone in the second section of the article.');
  const P = { type: 'photo', filename: 'whiteboard.jpg', caption: 'Mel lays out the theory at the whiteboard.' };
  const P2 = { ...P, caption: 'Six people around the whiteboard, late.' };
  /** An article whose section "s" holds `s` and whose section "t" holds `t`. */
  const article = (s, t = [T]) => ({
    metadata: { sessionId: '0926262' },
    headline: { main: 'The Room Voted Five to Four' },
    sections: [
      { id: 's', type: 'narrative', content: s.map(clone) },
      { id: 't', type: 'narrative', content: t.map(clone) }
    ]
  });
  /** A section's blocks as letters: P for the photo, else each block's first letter. */
  const letters = (output, i) => output.sections[i].content.map((b) => (b.type === 'photo' ? 'P' : (b.text || b.headline)[0])).join('');
  /** Each photo the version prints, as [section id, caption]. */
  const photosOf = (output) => output.sections.flatMap((s) => s.content.filter((b) => b.type === 'photo').map((b) => [s.id, b.caption]));
  const settle = (standing, sentBack, after) => D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack), before: sentBack, after, pass: 1 });

  describe('a restore that puts a block back takes out the copy a pass left in another section', () => {
    test('a caption edit, then a pass that moves the photo with the writer\'s caption: one photo, with the director\'s caption, and a report that matches the stored version', () => {
      const sentBack = article([A, P2, B, C]);
      const standing = D.standingAfterSendBack(null, article([A, P, B, C]), sentBack, 'bundle');
      expect(standing.edits.map((e) => e.path)).toEqual(['sections[#s].content[1].caption']);
      const { output, report } = settle(standing, sentBack, article([A, B, C], [T, P]));

      expect(photosOf(output)).toEqual([['s', P2.caption]]);
      expect([letters(output, 0), letters(output, 1)]).toEqual(['APBC', 'T']);
      // The report says the caption was put back, and says nothing of the writer's caption
      // coming back, which the stored version no longer prints.
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', removed: false, restored: true })]);
      expect(JSON.stringify(output)).not.toContain(P.caption);
      expect(D.carriedEdits(standing, output).map((e) => e.id)).toEqual(['E1']);
    });

    test('a copy the version the pass started from held in another section stays', () => {
      // The writer cited one card in both sections, and the director kept both, rewriting
      // the headline of the one in "s". A pass takes that one out.
      const card = (headline) => ({ type: 'evidence-card', tokenId: 'jes002', headline, content: 'You can have him.' });
      const shown = article([A, card('You can have him'), B], [T, card('You can have him')]);
      const sentBack = article([A, card('Jess gave him up'), B], [T, card('You can have him')]);
      const standing = D.standingAfterSendBack(null, shown, sentBack, 'bundle');
      expect(standing.edits.map((e) => e.path)).toEqual(['sections[#s].content[1].headline']);
      const { output, report } = settle(standing, sentBack, article([A, B], [T, card('You can have him')]));

      expect(output.sections.map((s) => s.content.filter((b) => b.type === 'evidence-card').map((b) => b.headline)))
        .toEqual([['Jess gave him up'], ['You can have him']]);
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    });

    test('a section put back whole takes out the copy a pass left elsewhere of each of its blocks', () => {
      // The director rewrote the closing's paragraph. A pass drops the closing and moves its
      // photo, recaptioned, into "the-story".
      const shown = articleAtStop();
      shown.sections[2].content.push(clone(P));
      const sentBack = directorsVersion();
      sentBack.sections[2].content.push(clone(P));
      const standing = D.standingAfterSendBack(null, shown, sentBack, 'bundle');
      expect(standing.edits.map((e) => e.path)).toEqual(['sections[#the-story].content[-]', 'sections[#closing].content[0].text']);
      const after = clone(sentBack);
      after.sections.splice(2, 1);
      after.sections[1].content.push({ ...P, caption: 'The theory, drawn up.' });
      const { output, report } = settle(standing, sentBack, after);

      expect(output.sections.map((s) => s.id)).toEqual(['lede', 'the-story', 'closing']);
      expect(output.sections[2].content).toEqual([paragraph(CLOSING_EDIT), P]);
      expect(photosOf(output)).toEqual([['closing', P.caption]]);
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E2', restored: true })]);
    });
  });

  describe('a move\'s entry says where the stored version holds the block', () => {
    /** Round 1 moves the photo between A and B; round 2 recaptions it there. */
    const recaptioned = () => {
      const roundOne = D.standingAfterSendBack(null, article([P, A, B, C]), article([A, P, B, C]), 'bundle');
      return D.standingAfterSendBack(roundOne, article([A, P, B, C]), article([A, P2, B, C]), 'bundle');
    };
    /**
     * Whether each move's entry agrees with the stored version: `restored` while the stored
     * version holds the block in the director's section, and `inOrder` beside it, whether
     * that is in the director's order, which is what carries the move.
     */
    const agrees = (standing, output, report) => report.changed.filter((c) => c.moved).every((c) => {
      const edit = standing.edits.find((e) => e.id === c.id);
      const inSection = output.sections.find((s) => s.id === edit.from).content.some((b) => b.filename === edit.after.filename);
      const carried = D.carriedEdits([edit], output).length === 1;
      return c.restored === inSection && (!c.restored || c.inOrder === carried);
    });

    test('a field restore puts the photo back after a pass took it to another section and swapped its neighbours: back in the director\'s section, out of their order', () => {
      const sentBack = article([A, P2, B, C]);
      const standing = recaptioned();
      const { output, report } = settle(standing, sentBack, article([B, A, C], [T, P]));
      expect([letters(output, 0), letters(output, 1)]).toEqual(['BPAC', 'T']);
      expect(photosOf(output)).toEqual([['s', P2.caption]]);
      expect(report.changed).toEqual([
        expect.objectContaining({ id: 'E1', moved: true, became: 'section "t"', restored: true, inOrder: false }),
        expect.objectContaining({ id: 'E2', restored: true })
      ]);
      expect(D.carriedEdits(standing, output).map((e) => e.id)).toEqual(['E2']);
      expect(agrees(standing, output, report)).toBe(true);
    });

    test('the same pass with the neighbours left in order: back in the director\'s place, in their order', () => {
      const sentBack = article([A, P2, B, C]);
      const standing = recaptioned();
      const { output, report } = settle(standing, sentBack, article([A, B, C], [T, P]));
      expect(letters(output, 0)).toBe('APBC');
      expect(report.changed[0]).toEqual(expect.objectContaining({ id: 'E1', moved: true, restored: true, inOrder: true }));
      expect(D.carriedEdits(standing, output).map((e) => e.id)).toEqual(['E1', 'E2']);
      expect(agrees(standing, output, report)).toBe(true);
    });

    test('a pass that removes the photo and swaps its neighbours: the field restore puts it back, and the entry says so', () => {
      const sentBack = article([A, P2, B, C]);
      const standing = recaptioned();
      const { output, report } = settle(standing, sentBack, article([B, A, C]));
      expect([letters(output, 0), letters(output, 1)]).toEqual(['BPAC', 'T']);
      expect(report.changed[0]).toEqual(expect.objectContaining({ id: 'E1', moved: true, became: null, restored: true, inOrder: false }));
      expect(agrees(standing, output, report)).toBe(true);
    });

    test('a photo the pass left in the director\'s section out of order is not back: it never left, and code did not move it', () => {
      const director = article([A, P, B, C]);
      const standing = D.standingAfterSendBack(null, article([P, A, B, C]), director, 'bundle');
      const { output, report } = settle(standing, director, article([B, P, A, C], [T, P]));
      expect([letters(output, 0), letters(output, 1)]).toEqual(['BPAC', 'T']);
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', became: 'another place in section "s"', restored: false })]);
      expect(report.changed[0]).not.toHaveProperty('inOrder');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.3c: a section's blocks pair by place only with blocks of their own type
// ═══════════════════════════════════════════════════════════════════════════
//
// The naming rule's last pass, by place, paired blocks of any two types, so a photo moved to
// another section, with a paragraph inserted where it stood, was a retype and an addition,
// and a pass that took the photo back was neither restored nor reported (scratch
// crosstype.js).
describe('4.3c: blocks pair by place only with blocks of their own type', () => {
  const T = paragraph('Tango paragraph sits alone in the second section of the article.');
  const P = { type: 'photo', filename: 'whiteboard.jpg', caption: 'Mel lays out the theory at the whiteboard.' };
  const X = paragraph('Xray paragraph opens the section with a long first line here.');
  const Y = paragraph('Yankee paragraph follows with another long first line of text.');
  const Z = paragraph('Zulu paragraph the director wrote at the top of the section.');
  /** An article whose section "s" holds `s` and whose section "t" holds `t`. */
  const article = (s, t = [T]) => ({
    metadata: { sessionId: '0926262' },
    headline: { main: 'The Room Voted Five to Four' },
    sections: [
      { id: 's', type: 'narrative', content: s.map(clone) },
      { id: 't', type: 'narrative', content: t.map(clone) }
    ]
  });
  /** A section's blocks as letters: P for the photo, else each block's first letter. */
  const letters = (output, i) => output.sections[i].content.map((b) => (b.type === 'photo' ? 'P' : b.text[0])).join('');

  test('a photo moved to another section, with a paragraph inserted where it stood, is a move; a pass that takes it back has it restored and reported', () => {
    const opened = article([P, X, Y]);
    const desk = article([Z, X, Y], [T, P]);
    const standing = D.standingAfterSendBack(null, opened, desk, 'bundle');
    expect(standing.edits.map((e) => [e.path, e.from || null, e.after.type])).toEqual([
      ['sections[#s].content[0]', null, 'paragraph'],
      ['sections[#t].content[1]', 's', 'photo']
    ]);

    const { output, report } = D.settleEdits(null, { edits: D.carriedEdits(standing, desk), before: desk, after: article([P, Z, X, Y]), pass: 1 });
    expect([letters(output, 0), letters(output, 1)]).toEqual(['ZXY', 'TP']);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E2', moved: true, became: 'section "s"', restored: true })]);
  });

  test('a block retyped through the JSON editor is a cut and an addition', () => {
    const opened = article([X, Y]);
    const desk = article([{ type: 'quote', text: X.text, attribution: 'Mel' }, Y]);
    const { edits } = D.standingAfterSendBack(null, opened, desk, 'bundle');
    expect(edits.map((e) => [e.path, e.before && e.before.type, e.after && e.after.type])).toEqual([
      ['sections[#s].content[-]', 'paragraph', null],
      ['sections[#s].content[0]', null, 'quote']
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.3c fix round 1: one rule finds the copy a pass left in another section
// ═══════════════════════════════════════════════════════════════════════════
//
// A block can print in two sections: a card the writer cited twice, which the director
// kept in both. Two rules said which copy outside the director's section was the pass's. A
// field's restore counted the copies against the version the pass started from; a move's
// restore took the first copy it found outside, and the report named that copy's section.
// So once a field's restore had taken out the pass's copy, the move's restore took out the
// card the director kept, in every order of the sections (scratch 4.3c-review/keptcopy.js),
// and a move's restore could take back the kept card in place of the pass's (known item 2).
describe('4.3c fix round 1: one rule finds the copy a pass left in another section', () => {
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const C = paragraph('Charlie paragraph closes the section with a long first line.');
  const T = paragraph('Tango paragraph sits alone in the second section of the article.');
  const U = paragraph('Uniform paragraph sits in the third section of the article.');
  const card = (headline) => ({ type: 'evidence-card', tokenId: 'jes002', headline, content: 'You can have him.' });
  const K = card('You can have him');
  const K2 = card('Jess gave him up');
  /**
   * An article of sections "s", "t" and "u", in that order, or with "u" before "t". By
   * default "t" holds T, and "u" holds U and the card the director keeps there.
   */
  const article = ({ s, t = [T], u = [U, K] }, uFirst) => {
    const content = { s, t, u };
    return {
      metadata: { sessionId: '0926262' },
      headline: { main: 'The Room Voted Five to Four' },
      sections: (uFirst ? ['s', 'u', 't'] : ['s', 't', 'u']).map((id) => ({ id, type: 'narrative', content: content[id].map(clone) }))
    };
  };
  /** A section's blocks as letters: K for the card, else each paragraph's first letter. */
  const letters = (output, id) => output.sections.find((sec) => sec.id === id).content
    .map((b) => (b.type === 'evidence-card' ? 'K' : b.text[0])).join('');
  /** Each card the version prints, as [section id, headline], in the order of the sections. */
  const cardsOf = (output) => output.sections.flatMap((sec) => sec.content
    .filter((b) => b.type === 'evidence-card').map((b) => [sec.id, b.headline]));
  const settle = (standing, sentBack, after) => D.settleEdits(null, {
    edits: D.carriedEdits(standing, sentBack), before: sentBack, after, pass: 1
  });

  describe.each([['"t" before "u"', false], ['"u" before "t"', true]])('with %s', (_order, uFirst) => {
    /** Round 1 moves the card in "s" between A and B; round 2 rewrites its headline there. */
    const moveThenHeadline = () => {
      const roundOne = D.standingAfterSendBack(null, article({ s: [K, A, B, C] }, uFirst), article({ s: [A, K, B, C] }, uFirst), 'bundle');
      return D.standingAfterSendBack(roundOne, article({ s: [A, K, B, C] }, uFirst), article({ s: [A, K2, B, C] }, uFirst), 'bundle');
    };

    test('a pass that takes the card in "s" to "t" and swaps its neighbours: the card the director kept in "u" stays', () => {
      const sentBack = article({ s: [A, K2, B, C] }, uFirst);
      const standing = moveThenHeadline();
      expect(standing.edits.map((e) => [e.id, e.path, Boolean(e.between)])).toEqual([
        ['E1', 'sections[#s].content[1]', true],
        ['E2', 'sections[#s].content[1].headline', false]
      ]);
      const { output, report } = settle(standing, sentBack, article({ s: [B, A, C], t: [T, K] }, uFirst));
      expect(letters(output, 's')).toBe('BKAC');
      expect(cardsOf(output)).toEqual([['s', 'Jess gave him up'], ['u', 'You can have him']]);
      expect(report.changed).toEqual([
        expect.objectContaining({ id: 'E1', moved: true, became: 'section "t"', restored: true, inOrder: false }),
        expect.objectContaining({ id: 'E2', restored: true })
      ]);
    });

    test('the same pass with the neighbours left in order: the card goes back in the director\'s place, and the one in "u" stays', () => {
      const sentBack = article({ s: [A, K2, B, C] }, uFirst);
      const standing = moveThenHeadline();
      const { output, report } = settle(standing, sentBack, article({ s: [A, B, C], t: [T, K] }, uFirst));
      expect(letters(output, 's')).toBe('AKBC');
      expect(cardsOf(output)).toEqual([['s', 'Jess gave him up'], ['u', 'You can have him']]);
      expect(report.changed[0]).toEqual(expect.objectContaining({ id: 'E1', moved: true, became: 'section "t"', restored: true, inOrder: true }));
      expect(D.carriedEdits(standing, output).map((e) => e.id)).toEqual(['E1', 'E2']);
    });

    test('a pass that only reorders "s": the card the director kept in "u" stays', () => {
      const sentBack = article({ s: [A, K, B, C] }, uFirst);
      const standing = D.standingAfterSendBack(null, article({ s: [K, A, B, C] }, uFirst), sentBack, 'bundle');
      // The pass swaps the blocks the card sat between: no place keeps the director's order.
      const swapped = settle(standing, sentBack, article({ s: [B, K, A, C] }, uFirst));
      expect(letters(swapped.output, 's')).toBe('BKAC');
      expect(letters(swapped.output, 'u')).toBe('UK');
      expect(swapped.report.changed).toEqual([expect.objectContaining({
        id: 'E1', moved: true, became: 'another place in section "s"', restored: false
      })]);
      // The pass moves the card to the end and keeps A before B: it goes back between them.
      const moved = settle(standing, sentBack, article({ s: [A, B, C, K] }, uFirst));
      expect(letters(moved.output, 's')).toBe('AKBC');
      expect(letters(moved.output, 'u')).toBe('UK');
      expect(moved.report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, restored: true })]);
    });

    test('a pass that removes the card the director moved: it stays out, the card in "u" stays where the director kept it, and the entry says the pass removed it', () => {
      const sentBack = article({ s: [A, K, B, C] }, uFirst);
      const standing = D.standingAfterSendBack(null, article({ s: [K, A, B, C] }, uFirst), sentBack, 'bundle');
      const { output, report } = settle(standing, sentBack, article({ s: [A, B, C] }, uFirst));
      expect(letters(output, 's')).toBe('ABC');
      expect(cardsOf(output)).toEqual([['u', 'You can have him']]);
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, became: null, restored: false })]);
    });

    test('a card the director moved from "t" to "s", which a pass takes back to "t": the restore takes back the pass\'s copy, not the one in "u"', () => {
      const shown = article({ s: [A, B, C], t: [T, K] }, uFirst);
      const sentBack = article({ s: [A, K, B, C] }, uFirst);
      const standing = D.standingAfterSendBack(null, shown, sentBack, 'bundle');
      expect(standing.edits.map((e) => [e.id, e.path, e.from])).toEqual([['E1', 'sections[#s].content[1]', 't']]);
      const { output, report } = settle(standing, sentBack, article({ s: [A, B, C], t: [T, K] }, uFirst));
      expect(letters(output, 's')).toBe('AKBC');
      expect(letters(output, 't')).toBe('T');
      expect(letters(output, 'u')).toBe('UK');
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', moved: true, became: 'section "t"', restored: true })]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5c: an un-strike is the director's change, and the marks pair questions as the carry does
// ═══════════════════════════════════════════════════════════════════════════
//
// The ledger's ruling on 4.5b's minor 5: bringing back a connection the director struck is
// their change at the meeting, an edit that stands like any other, so a reweave whose only
// change it is has something to fit in. And the meeting's marks read a question across two
// versions by the carry's rule of sameness (lib/writer-questions.js pairWeaveQuestions), so a
// question a rework only renumbered shows as unchanged. Invented text.
describe('4.5c: the meeting\'s un-strike, and the marks\' questions', () => {
  const { WEAVE } = require('./fixtures/rework-state');
  const { carriedWeaveQuestions } = require('../writer-questions');
  const C2 = WEAVE.connections[1];
  /** The writer's weave with c2 struck by the director. */
  const struck = () => {
    const weave = clone(WEAVE);
    weave.connections[1].struck = true;
    return weave;
  };
  /** The director's strike of c2 against the writer's weave: E1. */
  const strike = () => D.standingAtMeeting(null, clone(WEAVE), struck());
  const idsOf = (standing) => standing.edits.map((e) => [e.id, e.path, e.struck === true ? 'struck' : (e.unstruck === true ? 'brought back' : '')]);

  it('weaveEditsBetween reads a connection struck before and live after as one change of the whole connection, marked unstruck', () => {
    expect(D.weaveEditsBetween(struck(), clone(WEAVE))).toEqual([{
      scope: 'connections', at: [{ key: 'connections' }, { index: 1, match: { id: 'c2' } }], before: struck().connections[1], after: C2, unstruck: true
    }]);
    // A connection struck on both sides, or live on both, is no change.
    expect(D.weaveEditsBetween(struck(), struck())).toEqual([]);
    expect(D.weaveEditsBetween(clone(WEAVE), clone(WEAVE))).toEqual([]);
  });

  describe("bringing back a connection they struck is the director's edit", () => {
    it('after a round, whose weave holds the strike: the strike goes, and the un-strike is the next edit, which the weave carries', () => {
      const standing = D.standingAtMeeting(strike(), struck(), clone(WEAVE));
      expect(idsOf(standing)).toEqual([['E2', 'connections[#c2]', 'brought back']]);
      expect(standing.issued).toBe(2);
      expect(D.carriedEdits(standing, clone(WEAVE)).map((e) => e.id)).toEqual(['E2']);
    });

    it('with no round since the strike (an approve, then back to the meeting; a round that did not run): the meeting showed it struck, so bringing it back is their edit too', () => {
      const standing = D.standingAtMeeting(strike(), clone(WEAVE), clone(WEAVE), { shown: struck() });
      expect(idsOf(standing)).toEqual([['E2', 'connections[#c2]', 'brought back']]);
      expect(D.carriedEdits(standing, clone(WEAVE)).map((e) => e.id)).toEqual(['E2']);
    });

    it('stands while the connection is in the story, and goes when they strike it again, which is a strike again', () => {
      const unstrike = D.standingAtMeeting(strike(), struck(), clone(WEAVE));
      // A later look, after a round that kept the connection: the un-strike stands by its id.
      expect(idsOf(D.standingAtMeeting(unstrike, clone(WEAVE), clone(WEAVE)))).toEqual([['E2', 'connections[#c2]', 'brought back']]);
      // A weave holding the connection struck carries no un-strike of it.
      expect(D.carriedEdits(unstrike, struck())).toEqual([]);
      const again = D.standingAtMeeting(unstrike, clone(WEAVE), struck(), { shown: clone(WEAVE) });
      expect(idsOf(again)).toEqual([['E3', 'connections[#c2]', 'struck']]);
      expect(again.issued).toBe(3);
    });

    it('a reweave is held to it: a pass that drops the connection gets it back, and the report says so', () => {
      const edits = D.carriedEdits(D.standingAtMeeting(strike(), struck(), clone(WEAVE)), clone(WEAVE));
      const rework = clone(WEAVE);
      rework.connections.splice(1, 1);
      const { output, report } = D.settleEdits(null, { edits, before: clone(WEAVE), after: rework, pass: D.REWEAVE_PASS });
      expect(output.connections).toEqual(WEAVE.connections);
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E2', where: 'connection "c2", brought back', restored: true, pass: 'reweave', automatic: false })]);
      // A pass that keeps it changes no edit.
      expect(D.settleEdits(null, { edits, before: clone(WEAVE), after: clone(WEAVE), pass: D.REWEAVE_PASS }).report.changed).toEqual([]);
    });

    // Task 4.5d (the integrator's ruling 2) changed what this test pinned: the un-strike is the
    // connection's place alone, as a moved block is at the desk, so its line names the place,
    // and its words, and a finding that quotes them, are the writer's.
    it("its line names the connection by its place, marked brought back; the guide says what such a line is; a finding that quotes its words is the writer's", () => {
      const edits = D.standingAtMeeting(strike(), struck(), clone(WEAVE)).edits;
      expect(D.formatEditLines(edits)).toBe('E2 (connection "c2", brought back)');
      expect(D.WEAVE_EDIT_LINES_GUIDE).toContain('A line marked brought back names a connection they struck at an earlier look and brought back');
      expect(D.locateQuotedText(`T1: "${C2.detail}" is a false cause.`, edits, clone(WEAVE))).toEqual({ editIds: [], writer: true });
    });
  });

  describe('weaveMarks reads the questions as the carry pairs them', () => {
    const pronoun = (id, who) => ({ id, kind: 'pronoun', about: who, question: 'Which pronoun does the article use?', changes: `${who}'s pronoun in print.` });
    const withQuestions = (questions) => ({ ...clone(WEAVE), questions });

    it("after a rework that gives the director's answered question's id to a new one, the answered question is unchanged and the new one is new", () => {
      const left = withQuestions([{ ...pronoun('q1', 'Riley'), answer: 'she/her' }]);
      const after = withQuestions(carriedWeaveQuestions([pronoun('q1', 'Jordan')], left.questions));
      expect(after.questions.map((q) => `${q.id}:${q.about}`)).toEqual(['q2:Riley', 'q1:Jordan']);
      expect(D.weaveMarks(left, after)).toEqual([
        { path: 'questions[#q1]', where: 'question "q1", added', before: '', after: expect.stringContaining('about: Jordan') }
      ]);
    });

    it('a question only renumbered is no change; one reworded in its new place is a change at its new id', () => {
      const left = withQuestions([pronoun('q1', 'Riley'), pronoun('q2', 'Sam')]);
      expect(D.weaveMarks(left, withQuestions([pronoun('q3', 'Riley'), pronoun('q2', 'Sam')]))).toEqual([]);
      const reworded = withQuestions([{ ...pronoun('q3', 'Riley'), question: 'Is Riley he or she?' }, pronoun('q2', 'Sam')]);
      expect(D.weaveMarks(left, reworded)).toEqual([
        { path: 'questions[#q3].question', where: 'question "q3", question', before: 'Which pronoun does the article use?', after: 'Is Riley he or she?' }
      ]);
    });

    it("a connection the round brought back is no mark: the send-back's report says it, with its reason", () => {
      expect(D.weaveMarks(struck(), clone(WEAVE))).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5c fix round 1: a look reads the director's version against what the meeting showed
// ═══════════════════════════════════════════════════════════════════════════
//
// Review of 4.5c, finding 2. With no pass since the last look (an approve, then back to the
// meeting; a round that did not run), the writer's last weave can hold the director's own
// earlier line where the meeting showed a later edit of theirs. Read against the writer's
// last weave alone, setting that place back to what it holds was no edit: a connection
// struck again after it was brought back, or a role or a field set again. The console
// offered Reweave, the gate refused it as empty, and the change stood unprotected. Every
// place a standing edit is carried in the weave the meeting showed is now read against what
// the meeting showed there, as it is after a pass. Invented text.
describe('4.5c fix round 1: a look reads the director\'s version against what the meeting showed', () => {
  const { WEAVE } = require('./fixtures/rework-state');
  const STORY = 'The room voted overdose, and the ledger kept a sale on the books.';
  const withC2 = (struck) => {
    const weave = clone(WEAVE);
    if (struck) weave.connections[1].struck = true;
    return weave;
  };
  const withRole = (role) => {
    const weave = clone(WEAVE);
    weave.threads[2].role = role;
    return weave;
  };
  const withStory = (story) => ({ ...clone(WEAVE), story });
  const edits = (standing) => standing.edits.map((e) => [e.id, e.path, e.before, e.after]);
  const kinds = (standing) => standing.edits.map((e) => [e.id, e.path, e.struck === true ? 'struck' : (e.unstruck === true ? 'brought back' : '')]);

  it('a strike a round kept, brought back at an approve, then struck again with no round since: the strike is an edit, which the weave carries', () => {
    const first = D.standingAtMeeting(null, clone(WEAVE), withC2(true));
    // The round kept the strike: the writer's last weave holds it, and the meeting shows it.
    const kept = withC2(true);
    const back = D.standingAtMeeting(first, kept, withC2(false), { shown: kept });
    expect(kinds(back)).toEqual([['E2', 'connections[#c2]', 'brought back']]);
    // Back at the meeting with no pass since: it shows the connection live, and the director strikes it.
    const again = D.standingAtMeeting(back, kept, withC2(true), { shown: withC2(false) });
    expect(kinds(again)).toEqual([['E3', 'connections[#c2]', 'struck']]);
    expect(again.issued).toBe(3);
    expect(D.carriedEdits(again, withC2(true)).map((e) => e.id)).toEqual(['E3']);
  });

  it('a role a round kept, set back at an approve, then set again with no round since: the role is an edit, read from the role the meeting showed', () => {
    const first = D.standingAtMeeting(null, clone(WEAVE), withRole('mirrors-it'));
    const kept = withRole('mirrors-it');
    const back = D.standingAtMeeting(first, kept, clone(WEAVE), { shown: kept });
    expect(edits(back)).toEqual([['E2', 'threads[#t3].role', 'mirrors-it', 'complicates-it']]);
    const again = D.standingAtMeeting(back, kept, withRole('mirrors-it'), { shown: clone(WEAVE) });
    expect(edits(again)).toEqual([['E3', 'threads[#t3].role', 'complicates-it', 'mirrors-it']]);
  });

  it('a field the same way: the story set again is the director\'s line, which a reweave that paraphrases it gets back', () => {
    const first = D.standingAtMeeting(null, clone(WEAVE), withStory(STORY));
    const kept = withStory(STORY);
    const back = D.standingAtMeeting(first, kept, clone(WEAVE), { shown: kept });
    const again = D.standingAtMeeting(back, kept, withStory(STORY), { shown: clone(WEAVE) });
    expect(edits(again)).toEqual([['E3', 'story', WEAVE.story, STORY]]);
    const { output, report } = D.settleEdits(null, {
      edits: D.carriedEdits(again, withStory(STORY)), before: withStory(STORY), after: withStory('A reweave that paraphrased the story.'), pass: D.REWEAVE_PASS
    });
    expect(output.story).toBe(STORY);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E3', restored: true })]);
  });

  it('with no round since an edit, setting its place back to the writer\'s last weave is the director\'s change, the same edit as after a round', () => {
    const first = D.standingAtMeeting(null, clone(WEAVE), withRole('mirrors-it'));
    // An approve, then back: the writer's last weave is the writer's, and the meeting shows the re-role.
    const noRound = D.standingAtMeeting(first, clone(WEAVE), clone(WEAVE), { shown: withRole('mirrors-it') });
    // A round that kept the re-role: the writer's last weave holds it, and the meeting shows it.
    const afterRound = D.standingAtMeeting(first, withRole('mirrors-it'), clone(WEAVE));
    expect(edits(noRound)).toEqual([['E2', 'threads[#t3].role', 'mirrors-it', 'complicates-it']]);
    expect(edits(noRound)).toEqual(edits(afterRound));
  });

  it('a thread added at an approve and changed at the next look with no round since stays one added edit, as after a round', () => {
    const added = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { id: 't6', claim: 'Riley kept a second ledger.', role: 'grounds-it' }] };
    const first = D.standingAtMeeting(null, clone(WEAVE), added);
    const changed = clone(added);
    changed.threads[5].role = 'mirrors-it';
    const noRound = D.standingAtMeeting(first, clone(WEAVE), changed, { shown: added });
    expect(edits(noRound)).toEqual([['E1', 'threads[#t6]', null, changed.threads[5]]]);
    expect(noRound.issued).toBe(1);
  });

  it('places with no standing edit, and an edit the meeting did not show, are read against the writer\'s last weave as before', () => {
    // A send-back's rework changed the director's re-role: the meeting shows the rework's role, and the edit goes.
    const first = D.standingAtMeeting(null, clone(WEAVE), withRole('mirrors-it'));
    const reworked = withRole('grounds-it');
    expect(edits(D.standingAtMeeting(first, reworked, clone(reworked), { shown: reworked }))).toEqual([]);
    // A change where no edit stands is one edit against the writer's last weave.
    const headline = { ...withRole('mirrors-it'), headline: 'The Ledger Kept Talking.' };
    expect(edits(D.standingAtMeeting(first, clone(WEAVE), headline, { shown: withRole('mirrors-it') })))
      .toEqual([['E1', 'threads[#t3].role', 'complicates-it', 'mirrors-it'], ['E2', 'headline', WEAVE.headline, 'The Ledger Kept Talking.']]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5d: a connection the director brought back, and a swap is two moves
// ═══════════════════════════════════════════════════════════════════════════
//
// The integrator's rulings 2 and 4 on run 4's follow-ups (progress.md, 2026-10-03).
// - A connection the director struck and later brought back is theirs by its place in the
//   weave, and its words are the writer's, as a block moved at the desk is. It was one edit
//   of the whole connection held as the director's text, so code undid a pass's rewording of
//   a false link in it, a pass that dropped it had it written over the connection the pass
//   put at its index, and a finding that quoted it was filed as a concern on the director's
//   edit (scratch 4.5d/brought-back-probe.js).
// - Two photos with different filenames, or two cards with different tokenIds, never pair:
//   a swap is two moves, each keeping its own caption or text. The by-place pass paired them
//   by their index, so a desk swap recorded the writer's captions as the director's, and a
//   restore after a pass that swapped two photos wrote the director's caption under the
//   other photo, against T13 (scratch 4.3c-review/swap.js and sametype.js).
// Invented text.
describe("4.5d: a connection the director brought back is theirs by its place, and its words are the writer's", () => {
  const { WEAVE } = require('./fixtures/rework-state');
  const C1 = WEAVE.connections[0];
  const C2 = WEAVE.connections[1];
  const C3 = { id: 'c3', kind: 'person', joins: ['t3', 't4'], detail: 'Sarah sat at the bar for both conversations that morning.' };
  const C4 = { id: 'c4', kind: 'line', joins: ['t1', 't4'], detail: 'A line the pass wrote between the vote and the heir.' };
  const REWORDED = 'The result came back on the night Marcus made the sale.';
  /** The writer's weave, with a third connection after c2. */
  const writers = () => ({ ...clone(WEAVE), connections: [clone(C1), clone(C2), clone(C3)] });
  /** `writers()` with its connections as `connections` gives them. */
  const withConnections = (connections) => ({ ...writers(), connections: connections.map(clone) });
  const reworded = () => withConnections([C1, { ...C2, detail: REWORDED }, C3]);
  /** The director struck c2 at one look (E1) and brought it back at the next (E2). */
  const broughtBack = () => {
    const struck = withConnections([C1, { ...C2, struck: true }, C3]);
    return D.standingAtMeeting(D.standingAtMeeting(null, writers(), struck), struck, writers());
  };
  const edits = () => D.carriedEdits(broughtBack(), writers());
  const settle = (after, pass, { before = writers(), reasons = [] } = {}) => D.settleEdits(null, {
    edits: D.carriedEdits(broughtBack(), before), before, after, pass, reasons
  });
  const ids = (weave) => weave.connections.map((c) => c.id);
  const standingIds = (standing) => standing.edits.map((e) => [e.id, e.path, e.unstruck === true]);

  it('is one edit, E2, marked brought back', () => {
    expect(standingIds(broughtBack())).toEqual([['E2', 'connections[#c2]', true]]);
    expect(edits().map((e) => e.id)).toEqual(['E2']);
  });

  it("a pass that rewords it keeps the connection and the pass's wording, and changes no edit of the director's", () => {
    [1, D.REWEAVE_PASS].forEach((pass) => {
      const { output, report } = settle(reworded(), pass);
      expect([pass, output.connections]).toEqual([pass, reworded().connections]);
      expect([pass, report.changed]).toEqual([pass, []]);
      expect([pass, D.carriedEdits(broughtBack(), output).map((e) => e.id)]).toEqual([pass, ['E2']]);
    });
    // At the next look it stands on the connection as the pass reworded it.
    expect(standingIds(D.standingAtMeeting(broughtBack(), reworded(), reworded()))).toEqual([['E2', 'connections[#c2]', true]]);
  });

  it('a pass that drops it has it put back where it sat, as the version the pass started from holds it, beside the connection the pass put in its place', () => {
    [1, D.REWEAVE_PASS].forEach((pass) => {
      const { output, report } = settle(withConnections([C1, C4]), pass);
      expect([pass, output.connections]).toEqual([pass, [C1, C2, C4]]);
      expect([pass, report.changed]).toEqual([pass, [expect.objectContaining({
        id: 'E2', where: 'connection "c2", brought back', became: null, restored: true
      })]]);
    });
    // Dropped after an earlier pass of the round reworded it: back as that pass left it. Task
    // 4.5f (the integrator's ruling 3 on 4.5e's findings) changed what this line pinned, the
    // words the meeting showed, which undid the earlier pass's fix of a false link.
    expect(settle(withConnections([C1, C3]), 2, { before: reworded() }).output.connections).toEqual([C1, { ...C2, detail: REWORDED }, C3]);
  });

  it("a finding that quotes it is the writer's, as the pass reworded it too", () => {
    expect(D.locateQuotedText(`T1: "${C2.detail}" states a cause the record does not show.`, edits(), writers()))
      .toEqual({ editIds: [], writer: true });
    expect(D.locateQuotedText(`T1: "${REWORDED}" states a cause.`, D.carriedEdits(broughtBack(), reworded()), reworded()))
      .toEqual({ editIds: [], writer: true });
  });

  it("a send-back's rework may take it out, saying why: it stays out, and the report keeps the reason; one that rewords it changes no edit", () => {
    const reason = 'The note asks for the money thread alone, and c2 ties the heir to it.';
    const { output, report } = settle(withConnections([C1, C3]), D.SEND_BACK_PASS, { reasons: [{ id: 'E2', reason }] });
    expect(ids(output)).toEqual(['c1', 'c3']);
    expect(report.changed).toEqual([expect.objectContaining({
      id: 'E2', where: 'connection "c2", brought back', became: null, reason, restored: false, automatic: false, pass: 'send-back'
    })]);
    expect(settle(reworded(), D.SEND_BACK_PASS).report.changed).toEqual([]);
  });

  it("its line names the connection by its place, and the guide says its place is the director's and its wording the writer's", () => {
    expect(D.formatEditLines(edits())).toBe('E2 (connection "c2", brought back)');
    expect(D.WEAVE_EDIT_LINES_GUIDE).toContain("A line marked brought back names a connection they struck at an earlier look and brought back: its place in the story is the director's, and its wording, as the weave holds it, is still the writer's.");
  });
});

describe('4.5d: two photos or two cards swapped are two moves, each keeping its own caption or text', () => {
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const T = paragraph('Tango paragraph sits alone in the second section of the article.');
  const X = { type: 'photo', filename: 'x.jpg', caption: 'Mel lays out the theory at the whiteboard.' };
  const Y = { type: 'photo', filename: 'y.jpg', caption: 'Taylor and Sam talk at the bar, early.' };
  const X2 = { ...X, caption: 'Six people around the whiteboard, late.' };
  const K = { type: 'evidence-card', tokenId: 'jes002', headline: 'Jess lets him go', content: 'You can have him. I never wanted the money anyway.' };
  const L = { type: 'evidence-card', tokenId: 'vic001', headline: 'The replacement plan', content: 'He is out. You are in.' };
  const K2 = { ...K, headline: 'Jess gave him up' };
  /** An article whose section "s" holds `s` and whose section "t" holds `t`. */
  const article = (s, t) => ({
    metadata: { sessionId: '0926262' },
    headline: { main: 'The Room Voted Five to Four' },
    sections: [
      { id: 's', type: 'narrative', content: s.map(clone) },
      { id: 't', type: 'narrative', content: t.map(clone) }
    ]
  });
  /** Each photo and card a version prints, as [section id, its filename or tokenId, its caption or headline]. */
  const named = (output) => output.sections.flatMap((s) => s.content
    .filter((b) => b.filename || b.tokenId)
    .map((b) => [s.id, b.filename || b.tokenId, b.caption || b.headline]));
  const nameOf = (block) => block.filename || block.tokenId;

  test.each([
    ['photos', X, Y, 'photo'],
    ['cards', K, L, 'evidence-card']
  ])('a desk swap of two %s across sections is two moves, each with its own caption or text', (_kind, P, Q, type) => {
    const { edits } = D.standingAfterSendBack(null, article([A, P, B], [T, Q]), article([A, Q, B], [T, P]), 'bundle');
    expect(edits.map((e) => [e.id, e.path, e.from, e.after])).toEqual([
      ['E1', 'sections[#s].content[1]', 't', Q],
      ['E2', 'sections[#t].content[1]', 's', P]
    ]);
    expect(D.formatEditLines(edits)).toBe([
      `E1 (section "s", ${type} ${nameOf(Q)}, moved from section "t")`,
      `E2 (section "t", ${type} ${nameOf(P)}, moved from section "s")`
    ].join('\n'));
  });

  test.each([
    ['photos', X, X2, Y, 'caption'],
    ['cards', K, K2, L, 'headline']
  ])("a pass that swaps two %s: the director's field goes back on its own block, and the other block keeps its own", (_kind, P, P2, Q, field) => {
    const sentBack = article([A, P2, B], [T, Q]);
    const standing = D.standingAfterSendBack(null, article([A, P, B], [T, Q]), sentBack, 'bundle');
    expect(standing.edits.map((e) => e.path)).toEqual([`sections[#s].content[1].${field}`]);
    const { output, report } = D.settleEdits(null, {
      edits: D.carriedEdits(standing, sentBack), before: sentBack, after: article([A, Q, B], [T, P]), pass: 1
    });
    // Each prints once, under its own name: the director's line on theirs, the writer's on the other.
    expect(named(output)).toEqual([['s', nameOf(P), P2[field]], ['s', nameOf(Q), Q[field]]]);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    expect(JSON.stringify(report)).not.toContain(Q[field]);
  });

  test('a field the director changed on a thread a pass dropped goes back on that thread, never on the thread the pass put in its place', () => {
    const { WEAVE } = require('./fixtures/rework-state');
    const left = clone(WEAVE);
    left.threads[2].role = 'mirrors-it';
    const standing = D.standingAtMeeting(null, clone(WEAVE), left);
    expect(standing.edits.map((e) => e.path)).toEqual(['threads[#t3].role']);
    const after = clone(left);
    after.threads[2] = { id: 't6', claim: 'A thread the pass wrote in its place.', role: 'grounds-it', receipt: 'ledger' };
    const { output, report } = D.settleEdits(null, { edits: D.carriedEdits(standing, left), before: left, after, pass: 1 });
    expect(output.threads.map((t) => `${t.id}:${t.role}`))
      .toEqual(['t1:main-thread', 't2:grounds-it', 't3:mirrors-it', 't6:grounds-it', 't4:carries-it-forward', 't5:left-out']);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5e: the director's edits, second follow-ups
// ═══════════════════════════════════════════════════════════════════════════
//
// The integrator's ruling 4 on run 5's follow-ups (progress.md, 2026-10-04), from the review
// of 4.5d (scratch 4.5d-review/stale-after.js, rename-probe.js and sidebar-probe.js):
// - a connection the director brought back goes back as the meeting last showed it: a later
//   look refreshes its words, so a pass that drops it after a round reworded a false link in
//   it never undoes that fix;
// - the restore never puts back a photo the article cannot print, so an automatic pass that
//   fixed an invalid photo the director captioned keeps its fix, and the report says so;
// - one rule names an element: nameOf derives from identityOf;
// - a sidebar card's field goes back on its own card, beside the card a pass put at its index.
// Invented text.
describe('4.5e: a connection the director brought back goes back as the meeting last showed it', () => {
  const { WEAVE } = require('./fixtures/rework-state');
  const C1 = WEAVE.connections[0];
  const FIXED = 'The result came back weeks after the sale, by the ledger.';
  const writers = () => clone(WEAVE);
  const struck = () => {
    const weave = writers();
    weave.connections[1].struck = true;
    return weave;
  };
  /** The writer's weave with c2's words as a fix pass reworded them. */
  const reworded = () => {
    const weave = writers();
    weave.connections[1].detail = FIXED;
    return weave;
  };
  /** Look 1 strikes c2 (E1), and look 2 brings it back (E2). */
  const broughtBack = () => D.standingAtMeeting(D.standingAtMeeting(null, writers(), struck()), struck(), writers());

  it('a later look takes its words from the connection the meeting showed, so a pass that drops it after a round reworded it puts back the rewording', () => {
    // Round A: the fix rewords c2, a false cause in the writer's words, and code keeps the words.
    const roundA = D.settleEdits(null, { edits: D.carriedEdits(broughtBack(), writers()), before: writers(), after: reworded(), pass: 1 });
    expect(roundA.output.connections[1].detail).toBe(FIXED);
    // Look 3: the meeting shows the rewording; the director changes the headline and reweaves.
    const left = { ...reworded(), headline: 'The Ledger Kept a Second Book.' };
    const look3 = D.standingAtMeeting(broughtBack(), reworded(), left, { shown: reworded() });
    expect(look3.edits.map((e) => [e.id, e.path, e.unstruck === true])).toEqual([['E2', 'connections[#c2]', true], ['E3', 'headline', false]]);
    expect(look3.edits[0].after).toEqual(reworded().connections[1]);
    // Round B: the reweave drops c2, and code puts it back with the words the meeting last showed.
    const dropped = { ...clone(left), connections: [clone(C1)] };
    const roundB = D.settleEdits(null, { edits: D.carriedEdits(look3, left), before: left, after: dropped, pass: D.REWEAVE_PASS });
    expect(roundB.output.connections).toEqual([C1, reworded().connections[1]]);
    expect(roundB.report.changed).toEqual([expect.objectContaining({
      id: 'E2', director: expect.stringContaining(FIXED), became: null, restored: true
    })]);
  });
});

describe('4.5e: the restore never puts back a photo the article cannot print', () => {
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const T = { id: 't', type: 'narrative', content: [paragraph('Tango paragraph sits alone in the second section of the article.')] };
  const photo = (filename, caption) => ({ type: 'photo', filename, caption });
  const WRITERS_CAPTION = 'The huddle at the bar.';
  const CAPTION = 'Six people huddle at the bar, late in the evening.';
  /** The photos the article can print: the photos the session kept. */
  const PHOTOS = ['a.jpg', 'b.jpg'];
  /** An article whose section "s" holds `content`, and section "t" after it. */
  const article = (content) => ({
    metadata: { sessionId: '0926262' },
    headline: { main: 'The Room Voted Five to Four' },
    sections: [{ id: 's', type: 'narrative', content: content.map(clone) }, clone(T)]
  });
  /** The director captions the writer's photo at the desk and sends back: E1, the caption. */
  const settle = (filename, after, options = {}) => {
    const sentBack = article([A, photo(filename, CAPTION), B]);
    const standing = D.standingAfterSendBack(null, article([A, photo(filename, WRITERS_CAPTION), B]), sentBack, 'bundle');
    return D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack), before: sentBack, after, pass: 1, photos: PHOTOS, ...options });
  };

  it.each([
    ['renames it to a kept photo', article([A, photo('a.jpg', CAPTION), B])],
    ['takes it out', article([A, B])]
  ])("an automatic pass that %s keeps its fix: code leaves out the photo the session does not hold, and the report says the caption was on a photo the article cannot print", (_name, after) => {
    const { output, report } = settle('not-ours.jpg', after);
    expect(output.sections).toEqual(after.sections);
    expect(report.changed).toEqual([expect.objectContaining({
      id: 'E1', where: 'section "s", photo not-ours.jpg, caption', director: CAPTION, became: null, restored: false, unprintable: true
    })]);
  });

  it("a photo the session holds goes back as before; so does every photo with no list, and a send-back's rework is left as it is", () => {
    const held = settle('b.jpg', article([A, B]));
    expect(held.output.sections[0].content).toEqual([A, photo('b.jpg', CAPTION), B]);
    expect(held.report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    const noList = settle('not-ours.jpg', article([A, B]), { photos: undefined });
    expect(noList.output.sections[0].content).toEqual([A, photo('not-ours.jpg', CAPTION), B]);
    const sendBack = settle('not-ours.jpg', article([A, B]), { pass: D.SEND_BACK_PASS });
    expect(sendBack.output.sections[0].content).toEqual([A, B]);
    [held, noList, sendBack].forEach(({ report }) => expect(report.changed[0]).not.toHaveProperty('unprintable'));
  });

  it('a section put back whole for an edit in it comes back without its photos the article cannot print', () => {
    const A2 = paragraph('Alpha paragraph, as the director rewrote it at the desk, opens the section.');
    const sentBack = article([A2, photo('not-ours.jpg', WRITERS_CAPTION), B]);
    const standing = D.standingAfterSendBack(null, article([A, photo('not-ours.jpg', WRITERS_CAPTION), B]), sentBack, 'bundle');
    expect(standing.edits.map((e) => e.path)).toEqual(['sections[#s].content[0].text']);
    const { output, report } = D.settleEdits(null, {
      edits: D.carriedEdits(standing, sentBack), before: sentBack, after: { ...clone(sentBack), sections: [clone(T)] }, pass: 1, photos: PHOTOS
    });
    expect(output.sections).toEqual([{ id: 's', type: 'narrative', content: [A2, B] }, T]);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
  });

  // The fact check imports photoBasename (task 4.5f), so the two read a photo's name by one
  // rule; this holds the restore's rule for the kept photos to the fact check's.
  it('given the kept photos, the restore refuses exactly the photos the fact check reads as invalid references', () => {
    const { factCheckContentBundle } = require('../content-bundle-fact-check');
    const { printableBlock } = D._testing;
    const filenames = ['a.jpg', 'photos/a.jpg', 'A.jpg', 'sub\\b.jpg', 'not-ours.jpg', 'a.jpeg', 'c.jpg', 'wb.jpg', ''];
    const result = factCheckContentBundle({
      contentBundle: { sections: [{ id: 's', type: 'narrative', content: filenames.map((filename) => photo(filename, CAPTION)) }], evidenceCards: [] },
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] } },
      roster: [],
      sessionPhotos: ['/data/0926262/photos/a.jpg', 'C:\\data\\0926262\\photos\\b.jpg', 'photos/c.jpg', 'photos/wb.jpg'],
      excludedPhotos: ['photos/c.jpg'],
      whiteboardPhoto: 'wb.jpg',
      reportingMode: 'on-site'
    });
    // The kept photos: the session's, less the one the director left out and the whiteboard.
    const refused = filenames.filter((filename) => !printableBlock(photo(filename, CAPTION), ['a.jpg', 'b.jpg']));
    expect(refused).toEqual(['A.jpg', 'not-ours.jpg', 'a.jpeg', 'c.jpg', 'wb.jpg']);
    expect(refused).toEqual(result.photoReferences.invalid);
  });
});

describe('4.5e: one rule names an element', () => {
  const { nameOf, identityOf, canon } = D._testing;
  /** Elements of a collection, named by `key`: a name twice (once padded), another, a number, the number as text, an empty name and none. */
  const corpus = (key) => [{ [key]: 'x1' }, { [key]: ' x1 ' }, { [key]: 'x2' }, { [key]: 3 }, { [key]: '3' }, { [key]: '' }, { other: 'no name' }];
  const alike = (collection, a, b) => {
    const [x, y] = [identityOf(collection, a), identityOf(collection, b)];
    return x !== null && y !== null && canon(x) === canon(y);
  };

  it.each([
    ['evidenceCards', 'tokenId'], ['threads', 'id'], ['connections', 'id'], ['questions', 'id']
  ])('%s: an element has a name exactly when identityOf finds it by one, and two share a name exactly when identityOf finds them alike', (collection, key) => {
    const elements = corpus(key);
    elements.forEach((a) => {
      expect([a, nameOf(collection, a) !== null]).toEqual([a, identityOf(collection, a) !== null]);
      elements.forEach((b) => {
        expect([a, b, nameOf(collection, a) !== null && nameOf(collection, a) === nameOf(collection, b)]).toEqual([a, b, alike(collection, a, b)]);
      });
    });
  });

  it("names nothing in another collection: a section, a section's block and a pull quote go by their own rules", () => {
    expect(nameOf('sections', { id: 's' })).toBeNull();
    expect(nameOf('content', { type: 'photo', filename: 'a.jpg' })).toBeNull();
    expect(nameOf('pullQuotes', { text: 'A line from the room.' })).toBeNull();
  });
});

describe("4.5e: a sidebar card's field goes back on its own card", () => {
  const card = (tokenId, headline) => ({ tokenId, headline, summary: `What ${tokenId} holds, in one line.`, significance: 'supporting' });
  const bundle = (cards) => ({ metadata: { sessionId: '0926262' }, headline: { main: 'The Room Voted Five to Four' }, sections: [], evidenceCards: cards.map(clone) });

  it("a pass that puts another card at its index: the director's headline goes back on its own card, beside the other", () => {
    const sentBack = bundle([card('jes002', 'Jess gave him up, in her own words'), card('vic001', 'The replacement plan')]);
    const standing = D.standingAfterSendBack(null, bundle([card('jes002', 'Jess lets him go'), card('vic001', 'The replacement plan')]), sentBack, 'bundle');
    expect(standing.edits.map((e) => e.path)).toEqual(['evidenceCards[#jes002].headline']);
    const after = bundle([card('kai003', 'Kai at the safe'), card('vic001', 'The replacement plan')]);
    const { output, report } = D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack), before: sentBack, after, pass: 1 });
    expect(output.evidenceCards).toEqual([sentBack.evidenceCards[0], after.evidenceCards[0], after.evidenceCards[1]]);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', where: 'sidebar card jes002, headline', became: null, restored: true })]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5f: the director's edits, third follow-ups
// ═══════════════════════════════════════════════════════════════════════════
//
// The integrator's rulings on 4.5e's findings (progress.md, 2026-10-04), from the review of
// 4.5e (scratch 4.5e-review/). Invented text.
//
// Ruling 1, the photo rule wired (photo-cases.js and photo-merge.js):
// - an empty list of the photos the article can print refuses every photo, as the fact check
//   reads every printed photo as invalid when the session holds photos and the director kept
//   none; with no list every photo goes back, as the fact check checks none when the session
//   holds no photos;
// - a section the director added whole comes back without a photo the article cannot print,
//   whichever path restores it, and the report reads the same on both paths: the section
//   carried apart from that photo (`restored`), and `unprintable`;
// - an edit whose photo still prints, where a pass moved it, carries no `unprintable`.
describe('4.5f: an empty list of the photos the article can print refuses every photo, and no list refuses none', () => {
  const { printableBlock } = D._testing;
  const CAPTION = 'Six people huddle at the bar, late in the evening.';
  const photo = (filename, caption = 'The huddle at the bar.') => ({ type: 'photo', filename, caption });

  it('printableBlock: an empty list refuses a photo by any path; no list, a block that is no photo and a photo with no filename refuse nothing', () => {
    expect(printableBlock(photo('a.jpg'), [])).toBe(false);
    expect(printableBlock(photo('photos/a.jpg'), [])).toBe(false);
    expect(printableBlock(photo('a.jpg'), undefined)).toBe(true);
    expect(printableBlock(paragraph('Alpha paragraph opens the section.'), [])).toBe(true);
    expect(printableBlock(photo(''), [])).toBe(true);
  });

  it('the session holds photos and the director kept none: the restore refuses exactly the photos the fact check reads as invalid references', () => {
    const { factCheckContentBundle } = require('../content-bundle-fact-check');
    const filenames = ['a.jpg', 'photos/b.jpg', 'wb.jpg', 'not-ours.jpg', ''];
    const result = factCheckContentBundle({
      contentBundle: { sections: [{ id: 's', type: 'narrative', content: filenames.map((filename) => photo(filename)) }], evidenceCards: [] },
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] } },
      roster: [],
      sessionPhotos: ['photos/a.jpg', 'photos/b.jpg', 'photos/wb.jpg'],
      excludedPhotos: ['photos/a.jpg', 'photos/b.jpg'],
      whiteboardPhoto: 'wb.jpg',
      reportingMode: 'on-site'
    });
    const refused = filenames.filter((filename) => !printableBlock(photo(filename), []));
    expect(refused).toEqual(['a.jpg', 'photos/b.jpg', 'wb.jpg', 'not-ours.jpg']);
    expect(refused).toEqual(result.photoReferences.invalid);
  });

  it("settleEdits: given an empty list, the director's caption leaves with the photo a pass took out; given none, the photo goes back with it", () => {
    const A = paragraph('Alpha paragraph opens the section with a long first line here.');
    const B = paragraph('Bravo paragraph follows with another long first line of text.');
    const article = (content) => ({ metadata: { sessionId: '0926262' }, headline: { main: 'The Room Voted Five to Four' }, sections: [{ id: 's', type: 'narrative', content: content.map(clone) }] });
    const sentBack = article([A, photo('a.jpg', CAPTION), B]);
    const standing = D.standingAfterSendBack(null, article([A, photo('a.jpg'), B]), sentBack, 'bundle');
    const settle = (photos) => D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack), before: sentBack, after: article([A, B]), pass: 1, photos });
    const none = settle([]);
    expect(none.output.sections[0].content).toEqual([A, B]);
    expect(none.report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: false, unprintable: true })]);
    const noList = settle(undefined);
    expect(noList.output.sections[0].content).toEqual([A, photo('a.jpg', CAPTION), B]);
    expect(noList.report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    expect(noList.report.changed[0]).not.toHaveProperty('unprintable');
  });
});

describe('4.5f: a section the director added whole comes back without a photo the article cannot print, whichever path restores it', () => {
  const S = { id: 's', type: 'narrative', content: [paragraph('Alpha paragraph opens the section with a long first line here.')] };
  const P = paragraph('A paragraph the director wrote for a new section here.');
  const photo = (filename) => ({ type: 'photo', filename, caption: 'Six people huddle at the bar, late in the evening.' });
  const added = (filename) => ({ id: 'added', type: 'narrative', heading: 'Added', content: [clone(P), photo(filename)] });
  const article = (sections) => ({ metadata: { sessionId: '0926262' }, headline: { main: 'The Room Voted Five to Four' }, sections: sections.map(clone) });
  /** The director adds section "added" whole (the desk's JSON editor), holding a photo the session does not hold, and sends back: E1. */
  const sentBack = () => article([S, added('not-ours.jpg')]);
  const settle = (after) => {
    const standing = D.standingAfterSendBack(null, article([S]), sentBack(), 'bundle');
    expect(standing.edits.map((e) => e.path)).toEqual(['sections[#added]']);
    return D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack()), before: sentBack(), after, pass: 1, photos: ['a.jpg'] });
  };

  it.each([
    ['takes the section out, and the restore puts it back where it sat', article([S])],
    ["keeps the section and renames the photo, and the restore merges the director's section onto it", article([S, added('a.jpg')])]
  ])('a pass that %s: the section comes back without the photo, and the report reads restored and unprintable', (_name, after) => {
    const { output, report } = settle(after);
    expect(output.sections).toEqual([S, { ...added('not-ours.jpg'), content: [P] }]);
    expect(report.changed.map((c) => [c.id, c.restored, c.unprintable])).toEqual([['E1', true, true]]);
  });
});

describe('4.5f: an edit whose photo still prints carries no `unprintable`', () => {
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const T = paragraph('Tango paragraph sits alone in the second section of the article.');
  const CAPTION = 'Six people huddle at the bar, late in the evening.';
  const photo = (caption) => ({ type: 'photo', filename: 'not-ours.jpg', caption });
  const article = (s, t) => ({
    metadata: { sessionId: '0926262' },
    headline: { main: 'The Room Voted Five to Four' },
    sections: [{ id: 's', type: 'narrative', content: s.map(clone) }, { id: 't', type: 'narrative', content: t.map(clone) }]
  });
  /** The director captions the writer's photo, which the session does not hold, and sends back: E1, the caption. */
  const settle = (after) => {
    const sentBack = article([A, photo(CAPTION), B], [T]);
    const standing = D.standingAfterSendBack(null, article([A, photo('The huddle at the bar.'), B], [T]), sentBack, 'bundle');
    return D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack), before: sentBack, after, pass: 1, photos: ['a.jpg'] });
  };

  // 4.5g (the integrator's ruling 1 on 4.5f's findings) changed what this test pinned: code put
  // nothing back, and the director's caption was gone while the photo printed. The pass kept the
  // photo, so the restore puts it back into the director's section with the director's caption,
  // and the pass's copy goes.
  it("a pass that moves the photo to another section and recaptions it: code puts it back into the director's section with the director's caption, the pass's copy goes, and the photo, still printing, marks nothing unprintable", () => {
    const after = article([A, B], [T, photo('A caption the pass wrote.')]);
    const { output, report } = settle(after);
    expect(output.sections).toEqual(article([A, photo(CAPTION), B], [T]).sections);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    expect(report.changed[0]).not.toHaveProperty('unprintable');
  });

  it("a pass that recaptions the photo where it is: the director's caption goes back on it, and nothing is unprintable", () => {
    const { output, report } = settle(article([A, photo('A caption the pass wrote.'), B], [T]));
    expect(output.sections[0].content).toEqual([A, photo(CAPTION), B]);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    expect(report.changed[0]).not.toHaveProperty('unprintable');
  });
});

// Ruling 3 (within-round.js): a connection the director brought back goes back as the version
// the pass started from holds it, so a reweave's rewording of it stands within a round as
// across looks.
describe('4.5f: a connection the director brought back goes back as the version the pass started from holds it', () => {
  const { WEAVE } = require('./fixtures/rework-state');
  const C1 = WEAVE.connections[0];
  const REWOVEN = 'The result came back weeks after the sale, by the ledger.';
  const writers = () => clone(WEAVE);
  const struck = () => {
    const weave = writers();
    weave.connections[1].struck = true;
    return weave;
  };

  it("a reweave rewords it and the round's one fix drops it, with no look between: it goes back with the reweave's words", () => {
    // Look 1 strikes c2; look 2 brings it back, changes the headline, and asks for a reweave.
    const look1 = D.standingAtMeeting(null, writers(), struck());
    const left = { ...writers(), headline: 'A Director Headline For The Round.' };
    const look2 = D.standingAtMeeting(look1, struck(), left, { shown: struck() });
    expect(look2.edits.map((e) => [e.id, e.path, e.unstruck === true])).toEqual([['E2', 'headline', false], ['E3', 'connections[#c2]', true]]);
    // The reweave rewords c2, the fix of a false link in the writer's words, and code keeps the words.
    const rewoven = clone(left);
    rewoven.connections[1].detail = REWOVEN;
    const reweave = D.settleEdits(null, { edits: D.carriedEdits(look2, left), before: left, after: rewoven, pass: D.REWEAVE_PASS });
    expect(reweave.output.connections[1].detail).toBe(REWOVEN);
    expect(reweave.report.changed).toEqual([]);
    // The fact check's one fix drops c2: code puts it back as the reweave left it.
    const dropped = { ...clone(reweave.output), connections: [clone(C1)] };
    const fix = D.settleEdits(reweave.report, { edits: D.carriedEdits(look2, reweave.output), before: reweave.output, after: dropped, pass: 1 });
    expect(fix.output.connections).toEqual([C1, { ...WEAVE.connections[1], detail: REWOVEN }]);
    expect(fix.report.changed).toEqual([expect.objectContaining({ id: 'E3', became: null, restored: true })]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5g: the restore's photo rule, where the pass dropped the photo
// ═══════════════════════════════════════════════════════════════════════════
//
// The integrator's ruling 1 on 4.5f's findings (progress.md, 2026-10-04), from the review of
// 4.5f (scratch 4.5f-review/merge-cases.js). Invented text.
// - The restore leaves out a photo the article cannot print only where the version the pass
//   returned prints it nowhere, because the pass removed or renamed it: a photo the director
//   placed or captioned that the pass kept goes back as the director left it (R11), and a
//   caption on a photo the pass took out of print stays out with it (spec section 7; T13).
// - The whiteboard stays out with no list, as the fact check reads it whatever the session holds.
// - The session's photo names are one rule, which the fact check and the article's rework read.
// - A brought-back connection's entry names the words the restore puts back.
describe('4.5g: the restore leaves out a photo the article cannot print only where the pass took it out of print', () => {
  const S = { id: 's', type: 'narrative', content: [paragraph('Alpha paragraph opens the section with a long first line here.')] };
  const P = paragraph('A paragraph the director wrote for a new section here.');
  const P2 = paragraph('A paragraph a pass rewrote inside the section the director added.');
  const CAPTION = 'Six people huddle at the bar, late in the evening.';
  const photo = (filename, caption = CAPTION) => ({ type: 'photo', filename, caption });
  const article = (sections) => ({ metadata: { sessionId: '0926262' }, headline: { main: 'The Room Voted Five to Four' }, sections: sections.map(clone) });
  const added = (content) => ({ id: 'added', type: 'narrative', heading: 'Added', content });
  /** The director's version of `shown`, sent back, then an automatic pass that returns `after`, given the kept photos. */
  const settle = (shown, sentBack, after) => {
    const standing = D.standingAfterSendBack(null, shown, sentBack, 'bundle');
    return D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack), before: sentBack, after, pass: 1, photos: ['a.jpg'] });
  };

  it('(a) a section the director added whole, holding a photo the session does not have: a pass that rewrites only its paragraph and keeps the photo has the section put back as the director left it', () => {
    const sentBack = article([S, added([P, photo('not-ours.jpg')])]);
    const { output, report } = settle(article([S]), sentBack, article([S, added([P2, photo('not-ours.jpg')])]));
    expect(output.sections).toEqual(sentBack.sections);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', where: 'section "added"', restored: true })]);
    expect(report.changed[0]).not.toHaveProperty('unprintable');
  });

  it("(b) a whole photo block the director put in, which the session does not have: a pass that recaptions it in place has the director's block put back", () => {
    const sentBack = article([{ ...S, content: [...S.content, photo('not-ours.jpg')] }]);
    const after = article([{ ...S, content: [...S.content, photo('not-ours.jpg', 'A caption the pass wrote.')] }]);
    const { output, report } = settle(article([S]), sentBack, after);
    expect(output.sections).toEqual(sentBack.sections);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', where: 'section "s", photo not-ours.jpg', restored: true })]);
    expect(report.changed[0]).not.toHaveProperty('unprintable');
  });

  it("a pass that took the photo out of print, by removing or renaming it, keeps its fix: the director's block stays out with its photo", () => {
    const sentBack = article([{ ...S, content: [...S.content, photo('not-ours.jpg')] }]);
    [article([S]), article([{ ...S, content: [...S.content, photo('a.jpg', 'A caption the pass wrote.')] }])].forEach((after) => {
      const { output, report } = settle(article([S]), sentBack, after);
      expect(output.sections).toEqual(after.sections);
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: false, unprintable: true })]);
    });
  });
});

describe('4.5g: the whiteboard stays out with no list, as the fact check reads it', () => {
  const { factCheckContentBundle } = require('../content-bundle-fact-check');
  const { printableBlock } = D._testing;
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const CAPTION = "The whiteboard, covered in the room's theories by midnight.";
  const photo = (filename, caption = 'The board.') => ({ type: 'photo', filename, caption });
  const article = (content) => ({ metadata: { sessionId: '0926262' }, headline: { main: 'The Room Voted Five to Four' }, sections: [{ id: 's', type: 'narrative', content: content.map(clone) }] });

  it('printableBlock: with no list, it refuses exactly the photos the fact check reads as invalid references when the session holds no photos, the whiteboard by any path', () => {
    const filenames = ['a.jpg', 'photos/wb.jpg', 'wb.jpg', 'WB.jpg', 'not-ours.jpg'];
    const result = factCheckContentBundle({
      contentBundle: { sections: [{ id: 's', type: 'narrative', content: filenames.map((filename) => photo(filename)) }], evidenceCards: [] },
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] } },
      roster: [],
      sessionPhotos: [],
      excludedPhotos: [],
      whiteboardPhoto: 'photos/wb.jpg',
      reportingMode: 'on-site'
    });
    const refused = filenames.filter((filename) => !printableBlock(photo(filename), undefined, 'photos/wb.jpg'));
    expect(refused).toEqual(['photos/wb.jpg', 'wb.jpg']);
    expect(refused).toEqual(result.photoReferences.invalid);
    // No whiteboard and no list refuse nothing; a list refuses the whiteboard even when it names it.
    expect(filenames.filter((filename) => !printableBlock(photo(filename), undefined, null))).toEqual([]);
    expect(printableBlock(photo('wb.jpg'), ['a.jpg', 'wb.jpg'], 'wb.jpg')).toBe(false);
  });

  it("settleEdits: with no list, the director's caption on the whiteboard's photo, which a pass took out, stays out with it; another photo goes back", () => {
    const settle = (filename) => {
      const sentBack = article([A, photo(filename, CAPTION), B]);
      const standing = D.standingAfterSendBack(null, article([A, photo(filename), B]), sentBack, 'bundle');
      return D.settleEdits(null, { edits: D.carriedEdits(standing, sentBack), before: sentBack, after: article([A, B]), pass: 1, whiteboard: 'photos/wb.jpg' });
    };
    const board = settle('wb.jpg');
    expect(board.output.sections[0].content).toEqual([A, B]);
    expect(board.report.changed).toEqual([expect.objectContaining({ id: 'E1', where: 'section "s", photo wb.jpg, caption', restored: false, unprintable: true })]);
    const other = settle('a.jpg');
    expect(other.output.sections[0].content).toEqual([A, photo('a.jpg', CAPTION), B]);
    expect(other.report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    expect(other.report.changed[0]).not.toHaveProperty('unprintable');
  });
});

describe("4.5g: the session's photo names", () => {
  it("are the basename of each of the session's photos (photoBasename), the empty ones left out", () => {
    expect(D.sessionPhotoNames(['/data/0926262/photos/a.jpg', 'C:\\data\\0926262\\photos\\b.jpg', 'c.jpg', '', '/', null])).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    [[], undefined, null, 'photos/a.jpg'].forEach((none) => expect(D.sessionPhotoNames(none)).toEqual([]));
  });
});

describe('4.5g: a connection the director brought back goes back with the words of the version the pass started from, and its entry names them', () => {
  const { WEAVE } = require('./fixtures/rework-state');
  const C1 = WEAVE.connections[0];
  const REWOVEN = 'The result came back weeks after the sale, by the ledger.';
  const writers = () => clone(WEAVE);
  const struck = () => {
    const weave = writers();
    weave.connections[1].struck = true;
    return weave;
  };

  it("a reweave rewords it and the round's one fix drops it: the entry's director text is the reweave's words, which code put back, not the words the meeting last showed", () => {
    const look1 = D.standingAtMeeting(null, writers(), struck());
    const left = { ...writers(), headline: 'A Director Headline For The Round.' };
    const look2 = D.standingAtMeeting(look1, struck(), left, { shown: struck() });
    const rewoven = clone(left);
    rewoven.connections[1].detail = REWOVEN;
    const reweave = D.settleEdits(null, { edits: D.carriedEdits(look2, left), before: left, after: rewoven, pass: D.REWEAVE_PASS });
    const dropped = { ...clone(reweave.output), connections: [clone(C1)] };
    const fix = D.settleEdits(reweave.report, { edits: D.carriedEdits(look2, reweave.output), before: reweave.output, after: dropped, pass: 1 });
    expect(fix.output.connections[1].detail).toBe(REWOVEN);
    expect(fix.report.changed).toEqual([expect.objectContaining({ id: 'E3', became: null, restored: true })]);
    expect(fix.report.changed[0].director).toContain(REWOVEN);
    expect(fix.report.changed[0].director).not.toContain(WEAVE.connections[1].detail);
  });
});
