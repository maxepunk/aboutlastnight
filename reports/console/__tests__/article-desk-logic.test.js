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
    const where = { from: { section: 'the-story', block: 1 }, to: { section: 'follow-the-money', block: 2 } };
    expect(report[1]).toMatchObject({ moved: [where], edited: [where], unchanged: 1 });
    expect(report[2]).toMatchObject({ moved: [where], edited: [where], unchanged: 2 });
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
// block as moved: the console cannot load the server's module, so it keeps its own copy of
// the rule, and these hold the two equal.
describe('the desk and the server\'s diff decide moves by one rule', () => {
  const D = require('../../lib/hand-edit-diff');

  /** Every ordering of 0..n-1. */
  function permutations(n) {
    if (n === 0) return [[]];
    return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_x, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
  }

  test('stayingPairs: the same run stays for every ordering of up to six blocks, whatever their weights', () => {
    const weightings = [[0, 0, 0, 0, 0, 0], [1, 0, 1, 0, 1, 0], [0, 1, 3, 0, 2, 1], [3, 3, 0, 1, 0, 2]];
    for (let n = 1; n <= 6; n += 1) {
      permutations(n).forEach((order) => {
        weightings.forEach((w) => {
          const pairs = order.map((opened, i) => ({ opened, weight: w[i] }));
          expect(Desk.stayingPairs(pairs)).toEqual(D._testing.stayingPairs(pairs));
        });
      });
    }
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
});
