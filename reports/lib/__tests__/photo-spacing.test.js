/**
 * Never two photos in a row (spec 2026-10-02 section 9; briefs F3 and FB).
 *
 * Three photos in a row across THE PLAYERS and WHAT'S MISSING were the director's only
 * reason for sending 0926262's article back. Assembly spaces the photos of what
 * prints: it reads the blocks in the writer's order across sections, a heading
 * separating nothing. Only a photo that would follow a photo moves: one directly after
 * another photo, or the first block under the journalist hero. Every other photo stays
 * where the writer put it, even while an earlier photo waits, because a reader notices
 * a photo beside the wrong section, not the order of the photos. A moving photo waits
 * for the next paragraph the writer did not follow with a photo. A photo still waiting
 * at the end goes under the last paragraph with no photo after it, else under the last
 * other block with none, else at the end, and the waiting photos fill those places in
 * the writer's order. So two photos print together only when the photos outnumber the
 * blocks that can separate them. A section with no blocks does not print, whether the
 * spacing emptied it or it came empty (task 4.14c).
 */

const { isDeepStrictEqual } = require('util');
const { spacePhotos } = require('../photo-spacing');
const { sectionsFrom, notationOf, adjacentPhotos } = require('./fixtures/photo-runs');

const clone = (value) => JSON.parse(JSON.stringify(value));

// 0926262's first draft from THE PLAYERS on, with the hero printed above the lede.
const DRAFT = '[the-players] P PH1 P P PH2 PH3 [whats-missing] PH4 P [closing] P quote PH5 P P P';
const SPACED = '[the-players] P PH1 P P PH2 [whats-missing] P PH3 [closing] P PH4 quote PH5 P P P';
// 0926262's whole first draft, block for block (the hero, printed above the lede, is not
// a block). Its only run is the one above.
const WHOLE_DRAFT = '[lede] P P P [the-story] P card PH1 P P PH2 P card P P card P PH3 P P card PH4 ' +
  '[follow-the-money] P PH5 P P P [the-players] P PH6 P P PH7 PH8 [whats-missing] PH9 P ' +
  '[closing] P quote PH10 P P P';
const WHOLE_SPACED = '[lede] P P P [the-story] P card PH1 P P PH2 P card P P card P PH3 P P card PH4 ' +
  '[follow-the-money] P PH5 P P P [the-players] P PH6 P P PH7 [whats-missing] P PH8 ' +
  '[closing] P PH9 quote PH10 P P P';
const HERO = { photoAboveFirstBlock: true };

/** Every block but the photos, in reading order, each with its section. */
const otherBlocks = (sections) => sections.flatMap((section) =>
  section.content.filter((block) => block.type !== 'photo').map((block) => ({ section: section.id, block })));
/** Every photo's file, sorted: what prints, whatever the order. */
const photoFiles = (sections) => sections.flatMap((section) =>
  section.content.filter((block) => block.type === 'photo').map((block) => block.filename)).sort();

describe('spacePhotos', () => {
  it("spaces 0926262's draft: each photo of the run waits for the next paragraph, crossing the headings", () => {
    const spaced = spacePhotos(sectionsFrom(DRAFT), HERO);
    expect(notationOf(spaced)).toBe(SPACED);
    expect(adjacentPhotos(spaced, HERO)).toEqual([]);
  });

  it("prints 0926262's whole first draft exactly as before: only the run's two photos move", () => {
    const spaced = spacePhotos(sectionsFrom(WHOLE_DRAFT), HERO);
    expect(notationOf(spaced)).toBe(WHOLE_SPACED);
    expect(adjacentPhotos(spaced, HERO)).toEqual([]);
  });

  it('moves only photos, and prints every photo once', () => {
    const draft = sectionsFrom(WHOLE_DRAFT);
    const spaced = spacePhotos(draft, HERO);
    expect(otherBlocks(spaced)).toEqual(otherBlocks(draft));
    expect(photoFiles(spaced)).toEqual(photoFiles(draft));
  });

  it('moves a photo that opens the lede under its first paragraph, because the hero prints just above it', () => {
    const lede = sectionsFrom('[lede] PH1 P P [the-story] P');
    expect(notationOf(spacePhotos(lede, HERO))).toBe('[lede] P PH1 P [the-story] P');
    // With no photo printed above the article, a photo may open it.
    expect(notationOf(spacePhotos(lede))).toBe('[lede] PH1 P P [the-story] P');
  });

  describe('a photo that follows no photo stays where the writer put it, even while an earlier photo waits', () => {
    it("keeps the photo under WHAT'S MISSING's quote there while the run's second photo waits", () => {
      // The final review's case: keeping the photos in order printed PH4 in the closing.
      const spaced = spacePhotos(sectionsFrom('[the-players] P PH2 PH3 [whats-missing] quote PH4 P [closing] P P'), HERO);
      expect(notationOf(spaced)).toBe('[the-players] P PH2 [whats-missing] quote PH4 P PH3 [closing] P P');
    });

    it('moves only the two photos of the run at the end, where keeping order moved five of six', () => {
      const writer = '[lede] P P [the-story] P PH1 P P PH2 [the-players] P PH3 [closing] P PH4 PH5 PH6';
      const spaced = spacePhotos(sectionsFrom(writer), HERO);
      expect(notationOf(spaced)).toBe('[lede] P P PH5 [the-story] P PH1 P PH6 P PH2 [the-players] P PH3 [closing] P PH4');
      expect(adjacentPhotos(spaced, HERO)).toEqual([]);
    });

    it('keeps a photo the writer put under a quote, so the waiting photo takes the next paragraph', () => {
      expect(notationOf(spacePhotos(sectionsFrom('[closing] P PH1 PH2 quote PH3 P'))))
        .toBe('[closing] P PH1 quote PH3 P PH2');
    });

    it('passes over a paragraph the writer followed with a photo, so that photo keeps its section', () => {
      expect(notationOf(spacePhotos(sectionsFrom('[the-story] P PH1 PH2 [the-players] P PH3 [closing] P'))))
        .toBe('[the-story] P PH1 [the-players] P PH3 [closing] P PH2');
    });
  });

  describe('the end of the article', () => {
    it('with a free paragraph: a photo still waiting goes under the last paragraph with no photo after it', () => {
      expect(notationOf(spacePhotos(sectionsFrom('[closing] P P PH1 PH2 quote'))))
        .toBe('[closing] P PH2 P PH1 quote');
      expect(notationOf(spacePhotos(sectionsFrom('[the-players] P PH1 P [closing] P quote P PH2 PH3'))))
        .toBe('[the-players] P PH1 P [closing] P PH3 quote P PH2');
    });

    it('fills the places it opens with the waiting photos in their order, leaving the photo that followed no photo', () => {
      expect(notationOf(spacePhotos(sectionsFrom('[closing] P P P PH1 PH2 PH3'))))
        .toBe('[closing] P PH2 P PH3 P PH1');
    });

    it('with no free paragraph: a photo still waiting goes under the last other block with no photo after it', () => {
      expect(notationOf(spacePhotos(sectionsFrom('[the-players] P PH1 [closing] quote P PH2 PH3'))))
        .toBe('[the-players] P PH1 [closing] quote PH3 P PH2');
      expect(notationOf(spacePhotos(sectionsFrom('[closing] quote P PH1 PH2'))))
        .toBe('[closing] quote PH2 P PH1');
      expect(notationOf(spacePhotos(sectionsFrom('[closing] P PH1 PH2 quote'))))
        .toBe('[closing] P PH1 quote PH2');
    });

    it('prints two photos together only when they outnumber the blocks that can separate them, never dropping one', () => {
      expect(notationOf(spacePhotos(sectionsFrom('[lede] P PH1 [closing] PH2'))))
        .toBe('[lede] P PH1 [closing] PH2');
      expect(notationOf(spacePhotos(sectionsFrom('[closing] quote PH1 PH2 PH3 P'))))
        .toBe('[closing] quote PH1 P PH2 PH3');
    });
  });

  describe('a section the spacing empties', () => {
    it('does not print', () => {
      const spaced = spacePhotos(sectionsFrom('[the-story] P PH1 [whats-missing] PH2 [closing] P P'), HERO);
      expect(notationOf(spaced)).toBe('[the-story] P PH1 [closing] P PH2 P');
    });

    // Task 4.14c (the final review's desk 6): the director cuts a whole section at the desk by
    // deleting its blocks, and the page printed its heading over nothing. One rule now: a
    // section with no blocks does not print, whether the spacing emptied it or it came empty.
    it('nor does a section that came with no blocks, such as one the director emptied at the desk (4.14c)', () => {
      const sections = sectionsFrom('[lede] P PH1 [aside] [closing] P');
      expect(notationOf(spacePhotos(sections, HERO))).toBe('[lede] P PH1 [closing] P');
      expect(notationOf(spacePhotos(sectionsFrom('[lede] P [aside] [closing] P')))).toBe('[lede] P [closing] P');
    });
  });

  it('leaves a bundle with no photos unchanged', () => {
    const sections = sectionsFrom('[lede] P P [the-story] P quote card P [closing] P list');
    expect(spacePhotos(sections, HERO)).toEqual(sections);
  });

  it('leaves a bundle already spaced unchanged, so spacing twice changes nothing', () => {
    const spaced = sectionsFrom(SPACED);
    expect(spacePhotos(spaced, HERO)).toEqual(spaced);
    const once = spacePhotos(sectionsFrom(DRAFT), HERO);
    expect(spacePhotos(once, HERO)).toEqual(once);
  });

  it('mutates nothing it is given', () => {
    const draft = sectionsFrom(DRAFT);
    const given = clone(draft);
    spacePhotos(draft, HERO);
    expect(draft).toEqual(given);
  });

  it('passes through sections it cannot read', () => {
    expect(spacePhotos(undefined)).toBeUndefined();
    const sections = [{ id: 'notes', type: 'narrative', content: null }, ...sectionsFrom('[closing] P PH1 PH2 P')];
    const spaced = spacePhotos(sections);
    expect(spaced[0]).toEqual(sections[0]);
    expect(notationOf(spaced.slice(1))).toBe('[closing] P PH1 P PH2');
  });
});

// The rule over many writers' shapes. The generator is seeded, so a failure names its
// shape and a rerun draws the same shapes.
describe('spacePhotos over random shapes', () => {
  const SHAPES = 3000;

  function generator(seed) {
    let state = seed;
    return () => {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomShape(random) {
    const tokens = [];
    let photo = 0;
    const sections = 1 + Math.floor(random() * 6);
    for (let s = 0; s < sections; s += 1) {
      tokens.push(`[s${s}]`);
      const blocks = Math.floor(random() * 8);
      for (let b = 0; b < blocks; b += 1) {
        const r = random();
        tokens.push(r < 0.5 ? 'P' : r < 0.8 ? `PH${photo += 1}` : r < 0.88 ? 'quote' : r < 0.95 ? 'card' : 'list');
      }
    }
    return { notation: tokens.join(' '), hero: random() < 0.5 };
  }

  /** Where each photo prints: its section, and how many other blocks print before it. */
  function placeOfEachPhoto(sections) {
    const places = {};
    let before = 0;
    for (const section of sections) {
      for (const block of section.content) {
        if (block.type === 'photo') places[block.filename] = `${section.id} after ${before}`;
        else before += 1;
      }
    }
    return places;
  }

  /** The photos the writer put directly after a block that is not a photo. */
  function photosFollowingNoPhoto(sections, hero) {
    const blocks = sections.flatMap((section) => section.content);
    return blocks
      .filter((block, i) => block.type === 'photo' && !(i === 0 ? hero : blocks[i - 1].type === 'photo'))
      .map((block) => block.filename);
  }

  it('holds the rule and its invariants on every shape', () => {
    const random = generator(20261002);
    for (let n = 0; n < SHAPES; n += 1) {
      const { notation, hero } = randomShape(random);
      const options = { photoAboveFirstBlock: hero };
      const sections = sectionsFrom(notation);
      const given = clone(sections);
      const spaced = spacePhotos(sections, options);
      const shape = `${notation}${hero ? ' (hero)' : ''}`;

      expect({ shape, mutated: !isDeepStrictEqual(sections, given) }).toEqual({ shape, mutated: false });
      expect({ shape, blocks: otherBlocks(spaced) }).toEqual({ shape, blocks: otherBlocks(sections) });
      expect({ shape, photos: photoFiles(spaced) }).toEqual({ shape, photos: photoFiles(sections) });

      const before = placeOfEachPhoto(sections);
      const after = placeOfEachPhoto(spaced);
      const moved = photosFollowingNoPhoto(sections, hero).filter((file) => before[file] !== after[file]);
      expect({ shape, moved }).toEqual({ shape, moved: [] });

      if (photoFiles(sections).length <= otherBlocks(sections).length) {
        expect({ shape, together: adjacentPhotos(spaced, options) }).toEqual({ shape, together: [] });
      }

      const emptied = spaced.filter((section) => section.content.length === 0 &&
        sections.find((original) => original.id === section.id).content.length > 0);
      expect({ shape, emptied: emptied.map((section) => section.id) }).toEqual({ shape, emptied: [] });

      expect({ shape, twice: notationOf(spacePhotos(spaced, options)) }).toEqual({ shape, twice: notationOf(spaced) });
    }
  });
});
