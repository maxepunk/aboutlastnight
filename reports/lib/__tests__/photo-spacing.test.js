/**
 * Never two photos in a row (spec 2026-10-02 section 9; brief F3).
 *
 * Three photos in a row across THE PLAYERS and WHAT'S MISSING were the director's only
 * reason for sending 0926262's article back. Assembly spaces the photos of what
 * prints: it reads the blocks in order across sections, a heading separating nothing.
 * A photo that would follow a photo waits, and the waiting photos are placed in their
 * order, one directly after each later paragraph. On the journalist page the hero is a
 * photo just above the first block. A photo still waiting at the end of the article
 * goes under the last paragraph with no photo after it. Only photos move, in their
 * order, and a placed photo belongs to the section of the paragraph it follows.
 */

const { spacePhotos } = require('../photo-spacing');
const { sectionsFrom, notationOf, adjacentPhotos } = require('./fixtures/photo-runs');

const clone = (value) => JSON.parse(JSON.stringify(value));

// 0926262's first draft from THE PLAYERS on, with the hero printed above the lede.
const DRAFT = '[the-players] P PH1 P P PH2 PH3 [whats-missing] PH4 P [closing] P quote PH5 P P P';
const SPACED = '[the-players] P PH1 P P PH2 [whats-missing] P PH3 [closing] P PH4 quote PH5 P P P';
const HERO = { photoAboveFirstBlock: true };

/** Every block but the photos, in reading order, each with its section. */
const otherBlocks = (sections) => sections.flatMap((section) =>
  section.content.filter((block) => block.type !== 'photo').map((block) => ({ section: section.id, block })));
/** Every photo, in reading order. */
const photosOf = (sections) => sections.flatMap((section) =>
  section.content.filter((block) => block.type === 'photo'));

describe('spacePhotos', () => {
  it("spaces 0926262's draft: each photo of the run waits for the next paragraph, crossing the headings", () => {
    const spaced = spacePhotos(sectionsFrom(DRAFT), HERO);
    expect(notationOf(spaced)).toBe(SPACED);
    expect(adjacentPhotos(spaced, HERO)).toEqual([]);
  });

  it('moves only photos, and prints every photo once, in the order the writer gave', () => {
    const draft = sectionsFrom(DRAFT);
    const spaced = spacePhotos(draft, HERO);
    expect(otherBlocks(spaced)).toEqual(otherBlocks(draft));
    expect(photosOf(spaced)).toEqual(photosOf(draft));
  });

  it('moves a photo that opens the lede under its first paragraph, because the hero prints just above it', () => {
    const lede = sectionsFrom('[lede] PH1 P P [the-story] P');
    expect(notationOf(spacePhotos(lede, HERO))).toBe('[lede] P PH1 P [the-story] P');
    // With no photo printed above the article, a photo may open it.
    expect(notationOf(spacePhotos(lede))).toBe('[lede] PH1 P P [the-story] P');
  });

  describe('a run with no paragraph after it', () => {
    it('opens a place under the last paragraph with no photo after it, and the photos keep their order', () => {
      const spaced = spacePhotos(sectionsFrom('[the-players] P PH1 P [closing] P quote P PH2 PH3'));
      expect(notationOf(spaced)).toBe('[the-players] P PH1 P [closing] P PH2 quote P PH3');
      expect(notationOf(spacePhotos(sectionsFrom('[closing] P P PH1 PH2 quote'))))
        .toBe('[closing] P PH1 P PH2 quote');
    });

    it('prints a photo with no paragraph left to stand under at the end of the article, never dropping it', () => {
      expect(notationOf(spacePhotos(sectionsFrom('[lede] P PH1 [closing] PH2'))))
        .toBe('[lede] P PH1 [closing] PH2');
      expect(notationOf(spacePhotos(sectionsFrom('[closing] P PH1 PH2 quote'))))
        .toBe('[closing] P PH1 quote PH2');
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
