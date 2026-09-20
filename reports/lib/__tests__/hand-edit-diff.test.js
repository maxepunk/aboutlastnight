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

describe('formatHandEditsBlock', () => {
  test('empty diff → empty string', () => {
    expect(D.formatHandEditsBlock(D.diffOutline({}, {}))).toBe('');
    expect(D.formatHandEditsBlock(null)).toBe('');
  });

  test('one line per change; before trimmed to 300, after to 1,500', () => {
    const long = 'x'.repeat(2000);
    const diff = D.diffOutline({ lede: { hook: long } }, { lede: { hook: long + 'y' } });
    const block = D.formatHandEditsBlock(diff);
    expect(block).toBe(`- lede.hook: was "${'x'.repeat(300)}…" -> now "${'x'.repeat(1500)}…"`);
  });

  test('added and removed values are labelled', () => {
    const diff = D.diffBundle(bundleBefore(), (() => { const a = bundleBefore(); a.sections[0].content.pop(); a.pullQuotes.push({ text: 'Q2' }); return a; })());
    const block = D.formatHandEditsBlock(diff);
    expect(block).toContain('- sections[#intro].content[-]: removed "');
    expect(block).toContain('- pullQuotes[1]: added "');
  });

  test('the whole block is capped at 12,000 characters with a trailing count', () => {
    const before = {}; const after = {};
    for (let i = 0; i < 200; i++) { before[`s${i}`] = { f: 'a'.repeat(200) }; after[`s${i}`] = { f: 'b'.repeat(200) }; }
    const block = D.formatHandEditsBlock(D.diffOutline(before, after));
    expect(block.length).toBeLessThanOrEqual(12000 + 60);
    expect(block).toMatch(/\(… \d+ more changes not shown\)$/);
  });
});

describe('changedScopes', () => {
  const edited = (() => { const a = outlineBefore(); a.lede.hook = 'New hook'; a.closing.finalQuestion = 'Q2'; return a; })();
  const diff = D.diffOutline(outlineBefore(), edited);

  test('kept edits → nothing changed', () => {
    expect(D.changedScopes(diff, clone(edited))).toEqual([]);
  });

  test('a reverted edit names its scope', () => {
    const reverted = clone(edited); reverted.lede.hook = 'Old hook';
    expect(D.changedScopes(diff, reverted)).toEqual(['lede']);
  });

  test('partially kept: only the reverted scope is named', () => {
    const partly = clone(edited); partly.closing.finalQuestion = 'Something else';
    expect(D.changedScopes(diff, partly)).toEqual(['closing']);
  });

  test('works on a later pass: compares against the diff, not against a previous output', () => {
    const revisedTwice = clone(edited); revisedTwice.lede.keyTension = 'the reviser changed an unedited field';
    expect(D.changedScopes(diff, revisedTwice)).toEqual([]);
  });

  test('removals are not checked; an added block that survives is not a change', () => {
    const a = bundleBefore(); a.sections[0].content.pop(); a.pullQuotes.push({ text: 'Q2' });
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    expect(D.changedScopes(bundleDiff, clone(a))).toEqual([]);
    const lostTheQuote = clone(a); lostTheQuote.pullQuotes.pop();
    expect(D.changedScopes(bundleDiff, lostTheQuote)).toEqual(['pullQuotes']);
  });

  test('a section edit is found by id even when the reviser reordered sections', () => {
    const a = bundleBefore(); a.sections[0].heading = 'New H';
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    const reordered = clone(a); reordered.sections.unshift({ id: 'other', type: 'narrative', heading: 'X', content: [] });
    expect(D.changedScopes(bundleDiff, reordered)).toEqual([]);
  });

  test('an index-addressed edit survives the reviser inserting a block before it', () => {
    const a = bundleBefore(); a.sections[0].content[1].text = 'Second paragraph, rewritten.';
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    expect(bundleDiff.scopes[0].changes[0].path).toBe('sections[#intro].content[1]');
    const shifted = clone(a);
    shifted.sections[0].content.unshift({ type: 'paragraph', text: 'A new opening the reviser added.' });
    expect(D.changedScopes(bundleDiff, shifted)).toEqual([]);
  });

  test('an index-addressed edit the reviser REMOVED names its scope', () => {
    const a = bundleBefore(); a.sections[0].content[1].text = 'Second paragraph, rewritten.';
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    const dropped = clone(a); dropped.sections[0].content.splice(1, 1);
    expect(D.changedScopes(bundleDiff, dropped)).toEqual(['section:intro']);
  });

  test('an edited pull quote survives the reviser inserting a quote before it', () => {
    const a = bundleBefore(); a.pullQuotes[0].text = 'Q1 edited';
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    expect(bundleDiff.scopes[0].changes[0].path).toBe('pullQuotes[0]');
    const shifted = clone(a); shifted.pullQuotes.unshift({ text: 'Q0 the reviser added' });
    expect(D.changedScopes(bundleDiff, shifted)).toEqual([]);
  });

  test('a kept block re-emitted with a trailing newline is not a change', () => {
    const a = bundleBefore(); a.sections[0].content[1].text = 'Second paragraph, rewritten.';
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    const reemitted = clone(a);
    reemitted.sections[0].content[1].text = 'Second paragraph, rewritten.\n';
    expect(D.changedScopes(bundleDiff, reemitted)).toEqual([]);
  });

  test('a kept pull quote the reviser gave an optional field is not a change', () => {
    const a = bundleBefore(); a.pullQuotes[0].text = 'Q1 edited';
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    const enriched = clone(a); enriched.pullQuotes[0].attribution = 'Nova';
    expect(D.changedScopes(bundleDiff, enriched)).toEqual([]);
  });

  test('a kept block whose director-set field the reviser removed names its scope', () => {
    const a = bundleBefore();
    a.sections[0].content[1] = { type: 'paragraph', text: 'Second paragraph, rewritten.', emphasis: 'strong' };
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    const stripped = clone(a); delete stripped.sections[0].content[1].emphasis;
    expect(D.changedScopes(bundleDiff, stripped)).toEqual(['section:intro']);
  });

  test('a nested outline value kept with surrounding whitespace is not a change', () => {
    const after = outlineBefore(); after.lede.selectedEvidence = ['e1', 'e2'];
    const nestedDiff = D.diffOutline(outlineBefore(), after);
    expect(nestedDiff.sections[0].changes[0].path).toBe('lede.selectedEvidence');
    const revised = clone(after); revised.lede.selectedEvidence = [' e1', 'e2\n'];
    expect(D.changedScopes(nestedDiff, revised)).toEqual([]);
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
});
