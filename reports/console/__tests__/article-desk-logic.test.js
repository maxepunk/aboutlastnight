/**
 * article-desk-logic — the article stop is the director's desk (spec 2026-10-02 section
 * 6.3; task 4.3).
 *
 * The desk's block operations, its checks and its change report are pure, so they are
 * pinned here in node-env (reports/CLAUDE.md: the console has no DOM harness). Every
 * operation returns a new bundle and leaves the one it was given as it was; every check
 * returns a list of problems; the report says, section by section, which blocks the
 * director inserted, deleted, moved or edited since the stop opened, which the desk's
 * marks (task 4.10) anchor on.
 *
 * The bundles are in a real session's shape with invented text: the repo is public.
 */
const fs = require('fs');
const path = require('path');
const Desk = require('../article-desk-logic');
const { SchemaValidator } = require('../../lib/schema-validator');

const clone = (v) => JSON.parse(JSON.stringify(v));

/** Freeze a value all the way down, so an operation that mutates its input throws. */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const paragraph = (text) => ({ type: 'paragraph', text });
const photo = (filename, caption) => ({ type: 'photo', filename, caption });
const card = (tokenId, headline, content) => ({ type: 'evidence-card', tokenId, headline, content, significance: 'critical' });

const LEDE = 'Alex Reeves asked for the scoreboard with two minutes left in the morning.';
const STORY_1 = 'Mel built the first theory around the fight in the bathroom and the fake demo.';
const STORY_2 = 'By the second round the room had stopped asking who held the account.';
const MONEY_1 = 'Thirteen sales landed in one account in the last two minutes of selling.';
const CLOSE_1 = 'Whether the verdict costs Alex anything is a question for the people with money.';

/** A journalist article as the desk opens it. */
const journalistBundle = () => ({
  metadata: { sessionId: '0926262', theme: 'journalist', generatedAt: '2026-10-02T17:09:31.000Z' },
  headline: {
    main: 'The Room Named Alex, Five Votes to Four',
    kicker: 'NovaNews',
    deck: 'Nine players, one verdict, and an account named after the woman they blamed first.'
  },
  byline: { author: 'Nova', title: 'Independent Reporter', location: 'Fremont', date: 'Sunday', guestReporter: 'Remi Vale | Field Reporter' },
  heroImage: { filename: 'huddle.jpg', caption: 'The six in the huddle.' },
  sections: [
    { id: 'lede', type: 'narrative', content: [paragraph(LEDE)] },
    {
      id: 'the-story', type: 'narrative', heading: 'The Story: Eight Minutes',
      content: [
        paragraph(STORY_1),
        photo('theory.jpg', 'Mel lays out the theory.'),
        card('jes002', 'You can have him.', 'You can have him. I never wanted the money anyway.'),
        paragraph(STORY_2)
      ]
    },
    {
      id: 'follow-the-money', type: 'evidence-highlight', heading: 'Follow the Money',
      content: [paragraph(MONEY_1), { type: 'quote', text: 'More than double the second.', attribution: 'Alex Reeves' }]
    },
    { id: 'closing', type: 'conclusion', heading: 'Closing', content: [paragraph(CLOSE_1)] }
  ],
  pullQuotes: [{ type: 'verbatim', text: 'Reality is negotiable.', attribution: 'Taylor' }],
  evidenceCards: [{ tokenId: 'jes002', headline: 'You can have him', summary: 'Jess, in her own memory.', significance: 'critical' }],
  financialTracker: { entries: [{ description: 'JessKane', amount: '$3,235,000' }], totalExposed: '$10,650,000' },
  photos: [{ filename: 'huddle.jpg', caption: 'The huddle' }]
});

/** A detective case file as the desk opens it: sections only, no sidebar. */
const detectiveBundle = () => ({
  metadata: { sessionId: '0926262', theme: 'detective', generatedAt: '2026-10-02T17:09:31.000Z' },
  headline: { main: 'Case Report: The Blackwood Death' },
  sections: [
    {
      id: 'case-summary', type: 'case-summary', heading: 'Case Summary',
      content: [paragraph('The victim was found at the gallery at dawn.'), paragraph('Nine people were in the room.')]
    },
    {
      id: 'evidence', type: 'evidence-highlight', heading: 'Evidence Locker',
      content: [card('vic001', 'The replacement plan', 'He is out. You are in.'), photo('safe.jpg', 'The dictionary safe.')]
    },
    { id: 'findings', type: 'conclusion', heading: 'Findings', content: [paragraph('The room named a suspect by five votes to four.')] }
  ]
});

const THEMES = [['journalist', journalistBundle], ['detective', detectiveBundle]];

/** The blocks of one section, as their types. */
const typesIn = (bundle, s) => bundle.sections[s].content.map((b) => b.type);

describe('every operation returns a new bundle and leaves its input as it was', () => {
  test.each(THEMES)('%s', (_theme, make) => {
    const opened = deepFreeze(make());
    const snapshot = clone(opened);
    const results = [
      Desk.insertBlock(opened, 0, 0, 'paragraph'),
      Desk.insertBlock(opened, 1, 1, 'quote'),
      Desk.moveBlock(opened, { section: 1, block: 0 }, { section: 1, block: 1 }),
      Desk.moveBlock(opened, { section: 1, block: 1 }, { section: 2, block: 0 }),
      Desk.moveToSection(opened, { section: 1, block: 0 }, 0),
      Desk.deleteBlock(opened, 1, 0),
      Desk.setBlock(opened, 0, 0, paragraph('A sentence the director wrote at the desk.')),
      Desk.setSectionHeading(opened, 1, 'A Heading the Director Chose'),
      Desk.setHeadline(opened, { main: 'A Headline the Director Typed In' }),
      Desk.setByline(opened, { author: 'Nova, at the desk' })
    ];
    expect(opened).toEqual(snapshot);
    results.forEach((result) => {
      expect(result).not.toBe(opened);
      expect(result).not.toEqual(snapshot);
    });
  });
});

describe('insertBlock: a paragraph or a quote, empty, where the director asks', () => {
  test.each(THEMES)('%s', (_theme, make) => {
    const opened = make();
    const withParagraph = Desk.insertBlock(opened, 1, 1, 'paragraph');
    expect(withParagraph.sections[1].content[1]).toEqual({ type: 'paragraph', text: '' });
    expect(withParagraph.sections[1].content).toHaveLength(opened.sections[1].content.length + 1);

    const atEnd = Desk.insertBlock(opened, 2, opened.sections[2].content.length, 'quote');
    expect(atEnd.sections[2].content[atEnd.sections[2].content.length - 1]).toEqual({ type: 'quote', text: '' });
  });

  test('only paragraphs and quotes are inserted: photos and cards come from the record', () => {
    expect(Desk.INSERTABLE_TYPES).toEqual(['paragraph', 'quote']);
    expect(() => Desk.insertBlock(journalistBundle(), 0, 0, 'photo')).toThrow(/paragraph or a quote/);
    expect(() => Desk.newBlock('evidence-card')).toThrow(/paragraph or a quote/);
  });

  test('an address the bundle does not have throws', () => {
    expect(() => Desk.insertBlock(journalistBundle(), 9, 0, 'paragraph')).toThrow(/section 9/);
    expect(() => Desk.insertBlock(journalistBundle(), 0, 5, 'paragraph')).toThrow(/block 5/);
  });
});

describe('moveBlock: any block, within a section or across sections', () => {
  test('down and up within a section', () => {
    const opened = journalistBundle();
    const down = Desk.moveBlock(opened, { section: 1, block: 1 }, { section: 1, block: 2 });
    expect(typesIn(down, 1)).toEqual(['paragraph', 'evidence-card', 'photo', 'paragraph']);
    const up = Desk.moveBlock(opened, { section: 1, block: 2 }, { section: 1, block: 0 });
    expect(typesIn(up, 1)).toEqual(['evidence-card', 'paragraph', 'photo', 'paragraph']);
  });

  test.each(THEMES)('across sections, %s', (_theme, make) => {
    const opened = make();
    const moved = Desk.moveBlock(opened, { section: 1, block: 1 }, { section: 2, block: 0 });
    expect(moved.sections[2].content[0]).toEqual(opened.sections[1].content[1]);
    expect(moved.sections[1].content).toHaveLength(opened.sections[1].content.length - 1);
  });

  test('moveToSection puts the block at the end of the section the director picks', () => {
    const opened = journalistBundle();
    const moved = Desk.moveToSection(opened, { section: 1, block: 1 }, 3);
    expect(moved.sections[3].content.map((b) => b.type)).toEqual(['paragraph', 'photo']);
    const ownEnd = Desk.moveToSection(opened, { section: 1, block: 0 }, 1);
    expect(ownEnd.sections[1].content[3]).toEqual(paragraph(STORY_1));
  });

  test('stepTarget: one place up or down, crossing into the next section at an end, none past the article', () => {
    const opened = journalistBundle();
    expect(Desk.stepTarget(opened, 1, 1, 'up')).toEqual({ section: 1, block: 0 });
    expect(Desk.stepTarget(opened, 1, 1, 'down')).toEqual({ section: 1, block: 2 });
    expect(Desk.stepTarget(opened, 1, 0, 'up')).toEqual({ section: 0, block: 1 });
    expect(Desk.stepTarget(opened, 1, 3, 'down')).toEqual({ section: 2, block: 0 });
    expect(Desk.stepTarget(opened, 0, 0, 'up')).toBeNull();
    expect(Desk.stepTarget(opened, 3, 0, 'down')).toBeNull();
    // Each target is an address moveBlock takes.
    const crossed = Desk.moveBlock(opened, { section: 1, block: 0 }, Desk.stepTarget(opened, 1, 0, 'up'));
    expect(crossed.sections[0].content).toEqual([paragraph(LEDE), paragraph(STORY_1)]);
  });

  test('a move to a place the section does not have throws', () => {
    expect(() => Desk.moveBlock(journalistBundle(), { section: 1, block: 0 }, { section: 1, block: 4 })).toThrow(/block 4/);
    expect(() => Desk.moveBlock(journalistBundle(), { section: 1, block: 7 }, { section: 1, block: 0 })).toThrow(/block 7/);
  });
});

describe('deleteBlock: any block', () => {
  test.each(THEMES)('%s', (_theme, make) => {
    const opened = make();
    const deleted = Desk.deleteBlock(opened, 1, 0);
    expect(deleted.sections[1].content).toEqual(opened.sections[1].content.slice(1));
    expect(() => Desk.deleteBlock(opened, 1, 9)).toThrow(/block 9/);
  });
});

describe('the edits in place', () => {
  test('a block, a section heading (a blank one prints none), the headline, the hero, a sidebar card, a tracker row', () => {
    const opened = journalistBundle();
    expect(Desk.setBlock(opened, 3, 0, paragraph('The director\'s closing.')).sections[3].content[0]).toEqual(paragraph('The director\'s closing.'));
    expect(Desk.setSectionHeading(opened, 0, 'The Lede').sections[0].heading).toBe('The Lede');
    expect('heading' in Desk.setSectionHeading(opened, 1, '   ').sections[1]).toBe(false);
    expect(Desk.setHeadline(opened, { deck: 'A new deck.' }).headline)
      .toEqual({ main: opened.headline.main, kicker: opened.headline.kicker, deck: 'A new deck.' });
    expect(Desk.setHero(opened, { caption: 'Six at the huddle.' }).heroImage).toEqual({ filename: 'huddle.jpg', caption: 'Six at the huddle.' });
    expect(Desk.setSidebarCard(opened, 0, { tokenId: 'jes002', headline: 'Hers', summary: 'S' }).evidenceCards[0])
      .toEqual({ tokenId: 'jes002', headline: 'Hers', summary: 'S' });
    expect(Desk.setTrackerEntry(opened, 0, { description: 'JessKane', amount: '$3,235,000', category: 'shell-account' }).financialTracker.entries[0])
      .toEqual({ description: 'JessKane', amount: '$3,235,000', category: 'shell-account' });
  });

  test('an editor saves only the fields the director changed, a cleared one included', () => {
    const headline = { main: 'The Room Named Alex', kicker: 'NovaNews' };
    expect(Desk.changedFields(headline, { main: 'The Room Named Alex', kicker: 'NovaNews', deck: '' })).toEqual({});
    expect(Desk.changedFields(headline, { main: 'The Room Named Alex Reeves', kicker: '', deck: '' }))
      .toEqual({ main: 'The Room Named Alex Reeves', kicker: '' });
    expect(Desk.changedFields(undefined, { author: 'Nova' })).toEqual({ author: 'Nova' });
  });

  // The page prints the guest reporter's credit beside the byline. The old byline editor
  // saved four fields over the whole byline, and the credit was lost from the article.
  test('the byline edit keeps the guest reporter, and every field it does not change', () => {
    const opened = journalistBundle();
    const edited = Desk.setByline(opened, { author: 'Nova', title: 'Reporter at Large' });
    expect(edited.byline).toEqual({
      author: 'Nova', title: 'Reporter at Large', location: 'Fremont', date: 'Sunday', guestReporter: 'Remi Vale | Field Reporter'
    });
    expect(Desk.setByline(opened, { guestReporter: 'Remi Vale | Guest Reporter' }).byline.guestReporter).toBe('Remi Vale | Guest Reporter');
  });
});

describe('emptyBlocks: an empty block is caught before the director approves or sends back', () => {
  test('a blank text, whitespace only included, in every type the desk can empty', () => {
    const b = journalistBundle();
    b.sections[1].content.push(
      paragraph(''),
      paragraph('  \n '),
      { type: 'quote', text: '\t' },
      { type: 'list', items: [] },
      { type: 'list', items: ['  '] },
      { type: 'evidence-card', tokenId: 'jes002', headline: 'You can have him.', content: ' ' },
      { type: 'photo', filename: '' },
      { type: 'evidence-reference', tokenId: ' ' }
    );
    const found = Desk.emptyBlocks(b);
    expect(found.map((p) => [p.section, p.block])).toEqual([[1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10], [1, 11]]);
    expect(found.map((p) => p.path)).toEqual([4, 5, 6, 7, 8, 9, 10, 11].map((j) => '/sections/1/content/' + j));
    // Each names the block by where it sits, as the director reads the desk.
    expect(found[0].message).toBe('Section "The Story: Eight Minutes", block 5: the paragraph is empty. Write it or delete it.');
    expect(found[2].message).toBe('Section "The Story: Eight Minutes", block 7: the quote is empty. Write it or delete it.');
    expect(found[3].message).toBe('Section "The Story: Eight Minutes", block 8: the list has no items. Add one or delete it.');
    expect(found[5].message).toBe('Section "The Story: Eight Minutes", block 10: the card has no text. Delete it, or put the document\'s text back.');
    expect(found[6].message).toBe('Section "The Story: Eight Minutes", block 11: the photo names no file. Delete it.');
  });

  test('a section with no heading is named by its id', () => {
    const b = journalistBundle();
    b.sections[0].content.push(paragraph(''));
    expect(Desk.emptyBlocks(b)[0].message).toBe('Section "lede", block 2: the paragraph is empty. Write it or delete it.');
  });

  test.each(THEMES)('the checks on an untouched %s draft: a clean one has none, a writer\'s empty paragraph is named', (_theme, make) => {
    expect(Desk.deskProblems(make())).toEqual([]);
    const draft = make();
    draft.sections[0].content.splice(1, 0, paragraph(' '));
    expect(Desk.deskProblems(draft).map((p) => p.path)).toEqual(['/sections/0/content/1']);
  });

  test('an inserted paragraph is empty until the director writes it', () => {
    const inserted = Desk.insertBlock(journalistBundle(), 2, 1, 'paragraph');
    expect(Desk.emptyBlocks(inserted).map((p) => p.path)).toEqual(['/sections/2/content/1']);
    expect(Desk.emptyBlocks(Desk.setBlock(inserted, 2, 1, paragraph('Taylor approached Sam at 9:40.')))).toEqual([]);
  });

  test('a malformed bundle has no blocks to check, and never throws', () => {
    expect(Desk.emptyBlocks(null)).toEqual([]);
    expect(Desk.emptyBlocks({ sections: 'x' })).toEqual([]);
    expect(Desk.emptyBlocks({ sections: [null, { content: 'x' }, { content: [null] }] })).toEqual([]);
  });
});

describe('headlineProblems: the limits the schema sets', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'schemas', 'content-bundle.schema.json'), 'utf8'));

  test('the console\'s copy of the limits is the schema\'s', () => {
    const h = schema.properties.headline.properties;
    expect(Desk.HEADLINE_LIMITS).toEqual({
      main: { min: h.main.minLength, max: h.main.maxLength },
      kicker: { max: h.kicker.maxLength },
      deck: { max: h.deck.maxLength }
    });
  });

  test('a headline too short or too long, a kicker and a deck too long, a headline missing', () => {
    const b = journalistBundle();
    b.headline = { main: 'Too short', kicker: 'k'.repeat(101), deck: 'd'.repeat(301) };
    expect(Desk.headlineProblems(b)).toEqual([
      { path: '/headline/main', field: 'main', message: 'The headline has 9 characters; it needs at least 10.' },
      { path: '/headline/kicker', field: 'kicker', message: 'The kicker has 101 characters; the most it can have is 100.' },
      { path: '/headline/deck', field: 'deck', message: 'The deck has 301 characters; the most it can have is 300.' }
    ]);
    b.headline = { main: 'h'.repeat(201) };
    expect(Desk.headlineProblems(b).map((p) => p.message)).toEqual(['The headline has 201 characters; the most it can have is 200.']);
    b.headline = {};
    expect(Desk.headlineProblems(b).map((p) => p.message)).toEqual(['The headline is missing.']);
  });

  // The check exists to catch at the desk what the server's schema gate would refuse
  // after the click, so it agrees with the schema on every length, counting characters
  // as the schema does (an emoji is one).
  test('agrees with the schema gate on every length it checks', () => {
    const validator = new SchemaValidator();
    const cases = [
      ['main', 'a'.repeat(9)], ['main', 'a'.repeat(10)], ['main', 'a'.repeat(200)], ['main', 'a'.repeat(201)],
      ['main', 'a'.repeat(8) + '\u{1F3B2}'], ['main', 'a'.repeat(9) + '\u{1F3B2}'], ['main', ' '.repeat(10)],
      ['kicker', 'k'.repeat(100)], ['kicker', 'k'.repeat(101)], ['deck', 'd'.repeat(300)], ['deck', 'd'.repeat(299) + '\u{1F3B2}'], ['deck', 'd'.repeat(301)]
    ];
    cases.forEach(([field, text]) => {
      const b = journalistBundle();
      b.headline[field] = text;
      const schemaAccepts = validator.validate('content-bundle', b).valid;
      expect([field, text.length, Desk.headlineProblems(b).length === 0]).toEqual([field, text.length, schemaAccepts]);
    });
  });
});

describe('deskChanges: what the director inserted, deleted, moved or edited, section by section', () => {
  const untouched = (bundle) => bundle.sections.map((s, i) => ({
    section: Desk.sectionKey(s, i), inserted: [], deleted: [], moved: [], edited: [], unchanged: s.content.length
  }));

  test.each(THEMES)('an untouched %s draft: nothing, and every block keeps its place', (_theme, make) => {
    expect(Desk.deskChanges(make(), make())).toEqual(untouched(make()));
  });

  test('after an insert', () => {
    const opened = journalistBundle();
    const report = Desk.deskChanges(opened, Desk.insertBlock(opened, 1, 2, 'paragraph'));
    expect(report[1]).toEqual({ section: 'the-story', inserted: [2], deleted: [], moved: [], edited: [], unchanged: 2 });
    expect(report.filter((r, i) => i !== 1)).toEqual(untouched(opened).filter((r, i) => i !== 1));
  });

  test('after a delete', () => {
    const opened = journalistBundle();
    const report = Desk.deskChanges(opened, Desk.deleteBlock(opened, 1, 2));
    expect(report[1]).toEqual({ section: 'the-story', inserted: [], deleted: [2], moved: [], edited: [], unchanged: 2 });
  });

  test('after a move within a section: the block the director moved, not the ones it passed', () => {
    const opened = journalistBundle();
    const report = Desk.deskChanges(opened, Desk.moveBlock(opened, { section: 1, block: 1 }, { section: 1, block: 3 }));
    expect(report[1]).toEqual({
      section: 'the-story', inserted: [], deleted: [], edited: [], unchanged: 1,
      moved: [{ from: { section: 'the-story', block: 1 }, to: { section: 'the-story', block: 3 } }]
    });
  });

  test('after a move across sections: both sections list it', () => {
    const opened = journalistBundle();
    const report = Desk.deskChanges(opened, Desk.moveToSection(opened, { section: 1, block: 1 }, 3));
    const move = { from: { section: 'the-story', block: 1 }, to: { section: 'closing', block: 1 } };
    expect(report[1]).toEqual({ section: 'the-story', inserted: [], deleted: [], moved: [move], edited: [], unchanged: 1 });
    expect(report[3]).toEqual({ section: 'closing', inserted: [], deleted: [], moved: [move], edited: [], unchanged: 1 });
  });

  // A block the director moved and changed is a cut and an addition in the standing edits
  // (lib/hand-edit-diff.js), so the desk names it deleted where it was and inserted where it
  // went: one naming rule (task 4.3b).
  test('after an edit in place, and an edit to a block the director then moved', () => {
    const opened = journalistBundle();
    const edited = Desk.setBlock(opened, 2, 0, paragraph('Thirteen sales landed in one account in the final two minutes.'));
    expect(Desk.deskChanges(opened, edited)[2]).toEqual({
      section: 'follow-the-money', inserted: [], deleted: [], moved: [], unchanged: 0,
      edited: [{ from: { section: 'follow-the-money', block: 0 }, to: { section: 'follow-the-money', block: 0 } }]
    });
    const recaptioned = Desk.setBlock(opened, 1, 1, photo('theory.jpg', 'Mel at the whiteboard.'));
    const movedToo = Desk.moveToSection(recaptioned, { section: 1, block: 1 }, 2);
    const report = Desk.deskChanges(opened, movedToo);
    expect(report[1]).toEqual({ section: 'the-story', inserted: [], deleted: [1], moved: [], edited: [], unchanged: 1 });
    expect(report[2]).toEqual({ section: 'follow-the-money', inserted: [2], deleted: [], moved: [], edited: [], unchanged: 2 });
  });

  test('untouchedThrough: the ordinal anchor holds for a block only while no block at or before it changed', () => {
    const opened = journalistBundle();
    const report = Desk.deskChanges(opened, Desk.insertBlock(opened, 1, 2, 'quote'));
    expect([0, 1, 2, 3].map((i) => Desk.untouchedThrough(report, 'the-story', i))).toEqual([true, true, false, false]);
    expect(Desk.untouchedThrough(report, 'closing', 0)).toBe(true);
    expect(Desk.untouchedThrough(report, 'no-such-section', 0)).toBe(false);
  });

  test('a malformed version reports nothing, and never throws', () => {
    expect(Desk.deskChanges(null, journalistBundle())).toEqual([]);
    expect(Desk.deskChanges(journalistBundle(), { sections: 'x' })).toEqual([]);
  });
});

describe('what the desk shows', () => {
  test('the word count reads the bundle as edited', () => {
    const opened = journalistBundle();
    const before = Desk.wordCount(opened);
    expect(before).toBe([LEDE, STORY_1, STORY_2, MONEY_1, CLOSE_1].join(' ').split(/\s+/).length);
    const inserted = Desk.setBlock(Desk.insertBlock(opened, 3, 1, 'paragraph'), 3, 1, paragraph('Four more words here.'));
    expect(Desk.wordCount(inserted)).toBe(before + 4);
    expect(Desk.wordCount(Desk.deleteBlock(opened, 0, 0))).toBe(before - LEDE.split(/\s+/).length);
  });

  test('stripScripts takes every script out of the page the preview shows', () => {
    const html = '<html><head><base href="/"><script src="x.js"></script><script>alert(1)</script></head><body><p>Text</p><script type="module" /></body></html>';
    expect(Desk.stripScripts(html)).toBe('<html><head><base href="/"></head><body><p>Text</p></body></html>');
    expect(Desk.stripScripts(null)).toBe('');
  });

  test('previewRequest posts the bundle on the desk to the preview route, logged in', () => {
    const bundle = journalistBundle();
    const request = Desk.previewRequest('0926262', bundle);
    expect(request.url).toBe('/api/session/0926262/article/preview');
    expect(request.init).toEqual({
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentBundle: bundle })
    });
  });
});

// The desk's report and the director's standing edits (lib/hand-edit-diff.js) name the same
// blocks as moved: the server's diff requires this module and calls its rule (task 4.3b),
// as server.js requires console/outline-edit-logic.js.
describe('the desk and the server\'s diff decide moves by one rule', () => {
  const D = require('../../lib/hand-edit-diff');

  test('the server\'s diff pairs a section\'s blocks and picks the ones that stay with the desk\'s own functions', () => {
    expect(D._testing.matchBlocks).toBe(Desk.pairSectionBlocks);
    expect(D._testing.stayingInSection).toBe(Desk.stayingInSection);
    expect(D.sectionKey).toBe(Desk.sectionKey);
  });

  // The rule weighs a pair as changed by the equality the standing edits use, so a block
  // the rule names moved is the block the edits record as a move.
  test('a changed block is changed by the same equality the standing edits use: keys sorted, every string trimmed', () => {
    const cases = [
      [paragraph(STORY_1), paragraph(STORY_1)],
      [paragraph(STORY_1), paragraph(STORY_1 + '  ')],
      [{ type: 'quote', text: 'More.', attribution: 'Alex' }, { attribution: 'Alex', text: ' More.', type: 'quote' }],
      [photo('theory.jpg', 'Mel lays out the theory.'), photo('theory.jpg', 'Mel at the whiteboard.')],
      [{ type: 'list', items: ['One', 'Two'] }, { type: 'list', items: ['One ', 'Two'] }],
      [{ type: 'photo', filename: 'a.jpg' }, { type: 'photo', filename: 'a.jpg', caption: undefined }],
      [paragraph(STORY_1), { type: 'quote', text: STORY_1 }]
    ];
    cases.forEach(([a, b]) => expect([a, b, Desk.sameBlock(a, b)]).toEqual([a, b, D._testing.same(a, b)]));
  });

  test('the desk\'s report and the standing edits agree on the blocks moved, deleted and inserted', () => {
    const opened = journalistBundle();
    let desk = Desk.moveBlock(opened, { section: 1, block: 1 }, { section: 1, block: 3 });   // the photo, within THE STORY
    desk = Desk.moveToSection(desk, { section: 2, block: 1 }, 3);                              // the quote, to the closing
    desk = Desk.deleteBlock(desk, 1, 1);                                                       // the card
    desk = Desk.setBlock(Desk.insertBlock(desk, 0, 1, 'paragraph'), 0, 1, paragraph('Then the scoreboard went up on the wall.'));

    const report = Desk.deskChanges(opened, desk);
    const { edits } = D.standingAfterSendBack(null, opened, desk, 'bundle');
    const fromEdits = edits.map((e) => [e.scope.replace('section:', ''), e.from ? 'moved' : (e.after === null ? 'deleted' : 'inserted')]).sort();
    const fromReport = [];
    report.forEach((r) => {
      r.inserted.forEach(() => fromReport.push([r.section, 'inserted']));
      r.deleted.forEach(() => fromReport.push([r.section, 'deleted']));
      r.moved.filter((m) => m.to.section === r.section).forEach(() => fromReport.push([r.section, 'moved']));
    });
    expect(fromReport.sort()).toEqual(fromEdits);
    expect(fromEdits).toEqual([['closing', 'moved'], ['lede', 'inserted'], ['the-story', 'deleted'], ['the-story', 'moved']]);
  });

  test('in a swap, the desk and the standing edits name the same block as moved: the photo or card, not the text it passed', () => {
    const opened = journalistBundle();
    [
      Desk.moveBlock(opened, { section: 1, block: 1 }, { section: 1, block: 0 }),   // the photo up past a paragraph
      Desk.moveBlock(opened, { section: 1, block: 3 }, { section: 1, block: 2 }),   // a paragraph up past the card
      Desk.moveBlock(opened, { section: 2, block: 0 }, { section: 2, block: 1 })    // a paragraph down past a quote
    ].forEach((desk) => {
      const movedByDesk = Desk.deskChanges(opened, desk).flatMap((r) => r.moved.map((m) => desk.sections[1 + (m.to.section === 'follow-the-money' ? 1 : 0)].content[m.to.block]));
      const movedByEdits = D.standingAfterSendBack(null, opened, desk, 'bundle').edits.map((e) => e.after);
      expect(movedByDesk).toHaveLength(1);
      expect(movedByDesk).toEqual(movedByEdits);
    });
  });

  /** A block as a test names it: its type, then its file, its document or its first words. */
  const label = (block) => block.type + ':' + (block.filename || block.tokenId || String(block.text).slice(0, 20).trim());
  /** The blocks of the section `key` names in `bundle`. */
  const contentAt = (bundle, key) => bundle.sections.find((s, i) => Desk.sectionKey(s, i) === key).content;

  /** Each block the desk's report names, by section: moved, edited, inserted or deleted. */
  function namedByDesk(opened, desk) {
    const named = [];
    Desk.deskChanges(opened, desk).forEach((r) => {
      r.moved.filter((m) => m.to.section === r.section).forEach((m) => named.push([r.section, 'moved', label(contentAt(desk, r.section)[m.to.block])]));
      r.edited.forEach((m) => named.push([r.section, 'edited', label(contentAt(desk, r.section)[m.to.block])]));
      r.inserted.forEach((j) => named.push([r.section, 'inserted', label(contentAt(desk, r.section)[j])]));
      r.deleted.forEach((j) => named.push([r.section, 'deleted', label(contentAt(opened, r.section)[j])]));
    });
    return named.sort();
  }

  /** Each block the standing edits name, by section: a move, a block a field edit is on, an addition, a cut. */
  function namedByEdits(opened, desk) {
    const named = [];
    D.standingAfterSendBack(null, opened, desk, 'bundle').edits.forEach((e) => {
      const section = e.scope.replace('section:', '');
      const blockPath = e.path.replace(/(\.content\[\d+\]).+$/, '$1');
      if (e.from) named.push([section, 'moved', label(e.after)]);
      else if (e.after === null) named.push([section, 'deleted', label(e.before)]);
      else if (e.before === null && blockPath === e.path) named.push([section, 'inserted', label(e.after)]);
      else named.push([section, 'edited', label(D.readAtPath(desk, blockPath))]);
    });
    return named.filter((n, i) => named.findIndex((m) => m.join() === n.join()) === i).sort();
  }

  test('a photo moved and recaptioned: the desk\'s report and the standing edits name it the same way', () => {
    const opened = journalistBundle();
    const recaptioned = photo('theory.jpg', 'Six people around the whiteboard, late.');
    // Up past the paragraph before it: the recaptioned photo keeps its place among the blocks
    // that kept their order, and the paragraph it passed is the block named moved.
    const up = Desk.setBlock(Desk.moveBlock(opened, { section: 1, block: 1 }, { section: 1, block: 0 }), 1, 0, recaptioned);
    // To the end of its section, and to another section: a cut and an addition.
    const down = Desk.setBlock(Desk.moveBlock(opened, { section: 1, block: 1 }, { section: 1, block: 3 }), 1, 3, recaptioned);
    const across = Desk.setBlock(Desk.moveToSection(opened, { section: 1, block: 1 }, 2), 2, 2, recaptioned);
    expect(namedByDesk(opened, up)).toEqual([['the-story', 'edited', 'photo:theory.jpg'], ['the-story', 'moved', 'paragraph:Mel built the first']]);
    expect(namedByDesk(opened, down)).toEqual([['the-story', 'deleted', 'photo:theory.jpg'], ['the-story', 'inserted', 'photo:theory.jpg']]);
    expect(namedByDesk(opened, across)).toEqual([['follow-the-money', 'inserted', 'photo:theory.jpg'], ['the-story', 'deleted', 'photo:theory.jpg']]);
    [up, down, across].forEach((desk) => expect(namedByDesk(opened, desk)).toEqual(namedByEdits(opened, desk)));
  });
});

// Task 4.3b: the desk knows from the stop's payload whether the page prints the writer's money
// tracker (getCheckpointData's writerTrackerPrints, from TemplateAssembler's one predicate), and
// each preview keeps it current. Until one of them says, the desk shows neither the ledger's
// note nor the tracker's editor, either of which could misstate what prints.
describe('the writer\'s money tracker on the desk: unknown, prints, does not print (task 4.3b)', () => {
  test('the stop\'s payload or a preview\'s answer sets the state; an answer that says nothing keeps it', () => {
    expect(Desk.writerTrackerState(true)).toBe('prints');
    expect(Desk.writerTrackerState(false)).toBe('does-not-print');
    [undefined, null, 'true', 1].forEach((flag) => expect([flag, Desk.writerTrackerState(flag)]).toEqual([flag, 'unknown']));
    expect(Desk.writerTrackerState(undefined, 'prints')).toBe('prints');
    expect(Desk.writerTrackerState(undefined, 'does-not-print')).toBe('does-not-print');
    expect(Desk.writerTrackerState(false, 'prints')).toBe('does-not-print');
    expect(Desk.writerTrackerState(true, 'unknown')).toBe('prints');
  });

  test('the editor while the writer\'s tracker prints, the ledger\'s note while the ledger\'s prints in its place, neither while unknown', () => {
    const withRows = journalistBundle();
    expect(Desk.writerTrackerDisplay('prints', withRows)).toBe('editor');
    expect(Desk.writerTrackerDisplay('does-not-print', withRows)).toBe('ledger-note');
    expect(Desk.writerTrackerDisplay('unknown', withRows)).toBe('none');
    // With no row of the writer's, nothing prints in its place to speak of.
    const noRows = { ...journalistBundle(), financialTracker: { entries: [] } };
    expect(['prints', 'does-not-print', 'unknown'].map((state) => Desk.writerTrackerDisplay(state, noRows))).toEqual(['editor', 'none', 'none']);
    expect(Desk.writerTrackerDisplay('does-not-print', detectiveBundle())).toBe('none');
  });

  // The ledger's note stands only where the writer's tracker would print but for the ledger,
  // so the desk counts the writer's rows by the server's own predicate.
  test('the desk counts the writer\'s rows as the server\'s predicate counts its entries', () => {
    const { writerTrackerPrints } = require('../../lib/template-assembler');
    [[{ description: 'JessKane', amount: '$5' }], ['$5 to the account'], [null], [{ description: 'JessKane', amount: '$5' }, 'x'], [], undefined]
      .forEach((entries) => {
        const bundle = { ...journalistBundle(), financialTracker: { entries } };
        const printsWithoutLedger = writerTrackerPrints(bundle.financialTracker, []);
        expect([entries, Desk.writerTrackerDisplay('does-not-print', bundle)]).toEqual([entries, printsWithoutLedger ? 'ledger-note' : 'none']);
      });
  });
});

// Task 4.3b: the desk's byline line is built by the rule the page's header partial prints it
// by (templates/journalist/partials/header.hbs): the title and the guest reporter's credit
// print only with an author.
describe('the byline as the page prints it (task 4.3b)', () => {
  const Handlebars = require('handlebars');
  const { registerHelpers } = require('../../lib/template-helpers');
  const handlebars = Handlebars.create();
  registerHelpers(handlebars);
  const header = handlebars.compile(fs.readFileSync(path.join(__dirname, '..', '..', 'templates', 'journalist', 'partials', 'header.hbs'), 'utf8'));
  /** The byline the partial prints: the text of its byline and guest-reporter spans, spaces folded. */
  const printed = (byline) => (header({
    headline: { main: 'The Room Voted Five to Four' },
    byline,
    metadata: { sessionId: '0926262', generatedAt: '2026-10-02T17:09:31.000Z' }
  }).match(/<span class="nn-article__(?:byline|guest-reporter)">[\s\S]*?<\/span>/g) || [])
    .map((span) => span.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim();

  test.each([
    ['the author blank', { author: '', title: 'Independent Reporter', guestReporter: 'Remi Vale | Field Reporter' }, ''],
    ['an author with a title', { author: 'Nova', title: 'Independent Reporter', location: 'Fremont' }, 'Nova | Independent Reporter'],
    ['a guest reporter', { author: 'Nova', guestReporter: 'Remi Vale | Field Reporter' }, 'Nova || Remi Vale | Field Reporter']
  ])('%s', (_case, byline, line) => {
    expect(printed(byline)).toBe(line);
    expect(Desk.bylineLine(byline)).toBe(line);
  });

  test('the desk\'s label is the line the page prints, or says the page prints none without an author', () => {
    expect(Desk.bylineLabel({ author: 'Nova', title: 'Independent Reporter', guestReporter: 'Remi Vale | Field Reporter' }))
      .toBe('Nova | Independent Reporter || Remi Vale | Field Reporter');
    [{ title: 'Independent Reporter' }, { author: '' }, {}, undefined].forEach((byline) => {
      expect([byline, Desk.bylineLabel(byline)]).toEqual([byline, 'No byline: the page prints one only with an author.']);
    });
  });
});

// Task 4.3b: a preview that could not be reached says why (an expired login, a gateway page
// that is not JSON, a dropped connection), so the director can tell one failure from another.
test('a failed preview says why, in the error\'s own words (task 4.3b)', () => {
  expect(Desk.previewFailure(new TypeError('Failed to fetch'))).toBe('The preview could not be reached (Failed to fetch).');
  expect(Desk.previewFailure(new SyntaxError('Unexpected token < in JSON at position 0')))
    .toBe('The preview could not be reached (Unexpected token < in JSON at position 0).');
  [undefined, null, new Error(''), {}].forEach((error) => expect(Desk.previewFailure(error)).toBe('The preview could not be reached.'));
});

// Task 4.3c: the naming rule's last pass, by place, paired two blocks at one index whatever
// their types. A photo moved to another section, with a paragraph inserted where it stood,
// then read as the photo edited into the paragraph, in the desk's report and in the standing
// edits alike, and a pass that took the photo back was neither restored nor reported. The
// pass pairs only blocks of one type now, so a block retyped through the JSON editor reads as
// a cut and an addition.
describe('4.3c: blocks pair by place only with blocks of their own type', () => {
  const D = require('../../lib/hand-edit-diff');

  test('pairSectionBlocks pairs two blocks by their place only when they are of one type', () => {
    // A photo and a paragraph at one index stay apart.
    expect(Desk.pairSectionBlocks([photo('theory.jpg', 'Mel lays out the theory.'), paragraph(STORY_2)], [paragraph(LEDE), paragraph(STORY_2)]))
      .toEqual({ pairs: [{ bi: 1, ai: 1 }], removed: [0], added: [0] });
    // Two paragraphs at one index pair, their opening words rewritten.
    expect(Desk.pairSectionBlocks([paragraph(STORY_1), paragraph(STORY_2)], [paragraph(LEDE), paragraph(STORY_2)]))
      .toEqual({ pairs: [{ bi: 1, ai: 1 }, { bi: 0, ai: 0 }], removed: [], added: [] });
  });

  test('a photo moved to another section with a paragraph inserted where it stood: the desk names it moved, and the paragraph inserted, as the standing edits do', () => {
    const opened = journalistBundle();
    let desk = Desk.moveToSection(opened, { section: 1, block: 1 }, 3);
    desk = Desk.setBlock(Desk.insertBlock(desk, 1, 1, 'paragraph'), 1, 1, paragraph('Then the scoreboard went up on the wall.'));
    const report = Desk.deskChanges(opened, desk);
    const move = { from: { section: 'the-story', block: 1 }, to: { section: 'closing', block: 1 } };
    expect(report[1]).toEqual({ section: 'the-story', inserted: [1], deleted: [], moved: [move], edited: [], unchanged: 1 });
    expect(report[3]).toEqual({ section: 'closing', inserted: [], deleted: [], moved: [move], edited: [], unchanged: 1 });
    const { edits } = D.standingAfterSendBack(null, opened, desk, 'bundle');
    expect(edits.map((e) => [e.scope, e.from || null, e.after.type])).toEqual([
      ['section:the-story', null, 'paragraph'],
      ['section:closing', 'the-story', 'photo']
    ]);
  });

  test('a block retyped through the JSON editor is a cut and an addition: the desk names it deleted and inserted, as the standing edits record it', () => {
    const opened = journalistBundle();
    const desk = Desk.setBlock(opened, 2, 0, { type: 'quote', text: MONEY_1, attribution: 'Nova' });
    expect(Desk.deskChanges(opened, desk)[2]).toEqual({
      section: 'follow-the-money', inserted: [0], deleted: [0], moved: [], edited: [], unchanged: 0
    });
    const { edits } = D.standingAfterSendBack(null, opened, desk, 'bundle');
    expect(edits.map((e) => [e.path, e.after === null ? 'cut' : 'addition'])).toEqual([
      ['sections[#follow-the-money].content[-]', 'cut'],
      ['sections[#follow-the-money].content[0]', 'addition']
    ]);
  });
});

// Task 4.3c: the sidebar card's editor saved its three fields whether or not the director
// changed them, a significance the card never had included.
describe('4.3c: the sidebar card\'s editor saves only what changed', () => {
  test('the sidebar card\'s editor saves only the fields the director changed', () => {
    // A card the writer gave no significance: the page prints its badge empty.
    const sidebarCard = { tokenId: 'jes002', headline: 'You can have him', summary: 'Jess, in her own memory.', placement: 'sidebar' };
    const form = Desk.sidebarCardForm(sidebarCard);
    expect(form).toEqual({ headline: 'You can have him', summary: 'Jess, in her own memory.', significance: '' });
    // Saved untouched, it changes nothing: no significance the card never had.
    expect(Desk.changedFields(sidebarCard, form)).toEqual({});
    const edited = { ...form, headline: 'Hers, in her own words' };
    expect(Object.assign({}, sidebarCard, Desk.changedFields(sidebarCard, edited))).toEqual({ ...sidebarCard, headline: 'Hers, in her own words' });
    expect(Desk.sidebarCardForm({ tokenId: 'x', headline: 'H', significance: 'critical' }).significance).toBe('critical');

    // The editor seeds its form there and saves through changedFields, as the other editors do.
    const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'checkpoints', 'Article.js'), 'utf8');
    const editor = src.slice(src.indexOf('function SidebarEvidenceCardEditor('), src.indexOf('function FinancialEntryEditor('));
    expect(editor).toContain('DeskLogic.sidebarCardForm(card)');
    expect(editor).toContain('onSave(idx, Object.assign({}, original, DeskLogic.changedFields(original, local)))');
    expect(editor).not.toContain('Object.assign({}, original, local)');
  });
});
