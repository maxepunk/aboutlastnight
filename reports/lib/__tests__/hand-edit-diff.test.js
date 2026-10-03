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
    expect(D.formatEditLines(edits)).toBe('E1 (section "closing", photo p3.jpg, moved from section "the-story"): filename "p3.jpg"; caption "Vic, Remi and Alex"');
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

  test('a field of the director\'s that the rework removed is not carried', () => {
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
