/**
 * The leave-out box (phase 4, brief 4.2; spec 2026-10-02 section 8).
 *
 * The character-IDs stop shows a "leave this photo out" box on each photo, and the box
 * decides. A photo used to be left out only when the character-ID parse read an
 * exclusion in the director's free text. Two records carry the decision:
 * - the list (`leftOutPhotos`): the filenames the director left out. The stop's boxes
 *   write it, and leavePhotosOut adds to it (4.7 calls it for a photo the director
 *   deletes at the desk);
 * - each photo's mapping (`characterIdMappings[<filename>].exclude`), which
 *   isPhotoExcluded reads first for every writer's photo list, the hero, the fact check
 *   and publish.
 *
 * The parse writes an explicit `exclude` into the mapping of every photo the stop
 * showed (withExplicitExclusions), so a stale analysis mark never decides for a photo
 * the director saw.
 */

const { leavePhotosOut, leftOutPhotosOf, listAfterStopChoices, withExplicitExclusions, photoMappingOf } = require('../photo-leave-out');
const aiNodes = require('../workflow/nodes/ai-nodes');

const { isPhotoExcluded, buildAvailablePhotos, articleWriterInputs } = aiNodes;

const clone = (v) => JSON.parse(JSON.stringify(v));
const analysesOf = (...filenames) => ({ analyses: filenames.map((filename) => ({ filename })) });
const mapping = (exclude, extra = {}) => ({ characterMappings: [], additionalCharacters: [], corrections: {}, ...extra, exclude });

describe('leftOutPhotosOf', () => {
  it('reads the list as stored, each photo once, and a cleared or absent list as none', () => {
    expect(leftOutPhotosOf({ leftOutPhotos: ['a.jpg', 'A.JPG', 'b.jpg', '', 7] })).toEqual(['a.jpg', 'b.jpg']);
    expect(leftOutPhotosOf({ leftOutPhotos: null })).toEqual([]);
    expect(leftOutPhotosOf({})).toEqual([]);
    expect(leftOutPhotosOf(null)).toEqual([]);
  });
});

describe('leavePhotosOut: the one function that adds to the list', () => {
  it('on a photo with a mapping: adds it to the list and sets exclude: true in its mapping, keeping the rest of the mapping', () => {
    const state = {
      photoAnalyses: analysesOf('a.jpg', 'b.jpg'),
      characterIdMappings: {
        'a.jpg': mapping(false, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }], corrections: { location: 'by the bar' } }),
        'b.jpg': mapping(false)
      },
      leftOutPhotos: null
    };
    const before = clone(state);

    const update = leavePhotosOut(state, ['a.jpg']);

    expect(update.leftOutPhotos).toEqual(['a.jpg']);
    expect(update.characterIdMappings).toEqual({
      'a.jpg': mapping(true, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }], corrections: { location: 'by the bar' } }),
      'b.jpg': mapping(false)
    });
    expect(state).toEqual(before);   // the state it read is untouched
    expect(isPhotoExcluded({ ...state, ...update }, 'a.jpg')).toBe(true);
    expect(isPhotoExcluded({ ...state, ...update }, 'b.jpg')).toBe(false);
  });

  it('on a photo with no mapping: creates one, under the analysis\'s own filename, so the exclusion holds long after the parse', () => {
    // The parse named only a.jpg; b.jpg has no mapping, and its analysis says "kept".
    const state = {
      photoAnalyses: { analyses: [{ filename: 'a.jpg' }, { filename: 'b.jpg', excluded: false }] },
      characterIdMappings: { 'a.jpg': mapping(false) },
      leftOutPhotos: ['c.jpg']
    };

    const update = leavePhotosOut(state, ['photos/B.JPG']);

    expect(update.leftOutPhotos).toEqual(['c.jpg', 'b.jpg']);
    expect(update.characterIdMappings).toEqual({ 'a.jpg': mapping(false), 'b.jpg': mapping(true) });
    expect(isPhotoExcluded({ ...state, ...update }, 'b.jpg')).toBe(true);
  });

  it('marks every key that names the photo, whatever its case, and adds no second mapping', () => {
    const state = { photoAnalyses: analysesOf('aln (7 of 9).jpg'), characterIdMappings: { 'ALN (7 OF 9).JPG': mapping(false) } };
    const update = leavePhotosOut(state, ['aln (7 of 9).jpg']);
    expect(update.characterIdMappings).toEqual({ 'ALN (7 OF 9).JPG': mapping(true) });
  });

  it('lists each photo once, and works on a state with no mappings yet', () => {
    const update = leavePhotosOut({ photoAnalyses: analysesOf('a.jpg'), leftOutPhotos: ['a.jpg'], characterIdMappings: null }, ['A.jpg', 'a.jpg']);
    expect(update.leftOutPhotos).toEqual(['a.jpg']);
    expect(update.characterIdMappings).toEqual({ 'a.jpg': mapping(true) });
  });

  it('takes the photo out of every writer\'s list and the hero, as a photo the director deletes at the desk is (4.7)', () => {
    const state = {
      sessionPhotos: ['photos/hero.jpg', 'photos/p2.jpg', 'photos/p3.jpg'],
      photoAnalyses: { analyses: [{ filename: 'hero.jpg', identifiedCharacters: ['Alex', 'Sam'] }, { filename: 'p2.jpg', identifiedCharacters: ['Alex'] }, { filename: 'p3.jpg', identifiedCharacters: [] }] },
      characterIdMappings: { 'hero.jpg': mapping(false), 'p2.jpg': mapping(false), 'p3.jpg': mapping(false) },
      heroImage: 'hero.jpg',
      outline: {}
    };
    const after = { ...state, ...leavePhotosOut(state, ['p2.jpg', 'hero.jpg']) };

    expect(buildAvailablePhotos(after, 'hero.jpg', null).map((p) => p.filename)).toEqual(['p3.jpg']);
    const inputs = articleWriterInputs(after);
    expect(inputs[1]).toBeNull();   // the hero, left out, comes as none
    expect(inputs[inputs.length - 1].photos.map((p) => p.filename)).toEqual(['p3.jpg']);
  });

  it('refuses anything but a list of filenames', () => {
    expect(() => leavePhotosOut({}, 'a.jpg')).toThrow(/a list of photo filenames/);
    expect(() => leavePhotosOut({}, ['a.jpg', ''])).toThrow(/a list of photo filenames/);
    expect(() => leavePhotosOut({}, [null])).toThrow(/a list of photo filenames/);
  });
});

describe('listAfterStopChoices: the character-IDs stop\'s boxes', () => {
  const atStop = (leftOutPhotos) => ({ photoAnalyses: analysesOf('a.jpg', 'b.jpg', 'c.jpg'), leftOutPhotos });

  it('for every photo the stop showed, the box decides; a listed photo the stop did not show stays', () => {
    // b.jpg was listed and its box is now clear; d.jpg is no photo of this stop.
    const { list, error } = listAfterStopChoices(atStop(['b.jpg', 'd.jpg']), ['C.JPG', 'a.jpg']);
    expect(error).toBeNull();
    expect(list).toEqual(['d.jpg', 'c.jpg', 'a.jpg']);
  });

  it('every box clear leaves no photo of this stop on the list', () => {
    expect(listAfterStopChoices(atStop(['a.jpg', 'b.jpg']), [])).toEqual({ list: [], error: null });
  });

  it('refuses a choice that is not a list of filenames', () => {
    expect(listAfterStopChoices(atStop(null), 'a.jpg').error).toBe('leftOutPhotos must be a list of photo filenames');
    expect(listAfterStopChoices(atStop(null), ['a.jpg', ' ']).error).toBe('leftOutPhotos must be a list of photo filenames');
    expect(listAfterStopChoices(atStop(null), [{}]).list).toBeNull();
  });

  it('refuses a filename the stop did not show, naming it, rather than leave out nothing', () => {
    expect(listAfterStopChoices(atStop(null), ['a.jpg', 'ghost.jpg']).error)
      .toBe('leftOutPhotos names "ghost.jpg", which is not a photo at this stop');
    expect(listAfterStopChoices(atStop(null), ['x.jpg', 'y.jpg']).error)
      .toBe('leftOutPhotos names "x.jpg", "y.jpg", which are not photos at this stop');
  });
});

describe('withExplicitExclusions: the parse\'s explicit mark', () => {
  const state = {
    photoAnalyses: analysesOf('a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'),
    leftOutPhotos: ['a.jpg']
  };

  it('writes an exclude into the mapping of every photo the stop showed: the list, else the parse\'s own value, else false', () => {
    const parsed = {
      'A.JPG': mapping(false, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] }),   // ticked: the box decides
      'b.jpg': mapping(true),                                     // the director's text asked: the parse's own value
      'c.jpg': mapping(false),                                    // kept
      'not-a-photo.jpg': mapping(true)                            // a key the stop never showed stays as it is
    };
    const before = clone(parsed);

    expect(withExplicitExclusions(parsed, state)).toEqual({
      'A.JPG': mapping(true, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] }),
      'b.jpg': mapping(true),
      'c.jpg': mapping(false),
      'not-a-photo.jpg': mapping(true),
      'd.jpg': mapping(false)                                     // no mapping: one is made, kept
    });
    expect(parsed).toEqual(before);
  });

  it('starts from no mappings at all', () => {
    expect(withExplicitExclusions(null, { photoAnalyses: analysesOf('a.jpg', 'b.jpg'), leftOutPhotos: ['b.jpg'] }))
      .toEqual({ 'a.jpg': mapping(false), 'b.jpg': mapping(true) });
  });

  it('a key that holds no mapping object becomes one, so every key naming the photo agrees', () => {
    expect(withExplicitExclusions({ 'a.jpg': 'Vic' }, { photoAnalyses: analysesOf('a.jpg') }))
      .toEqual({ 'a.jpg': mapping(false) });
  });

  it('a stale analysis mark never decides for a photo the stop showed', () => {
    // After a rollback to character-ids the analyses are kept: b.jpg still carries the
    // mark from a round in which it was left out. The director's box is clear now.
    const stale = { photoAnalyses: { analyses: [{ filename: 'a.jpg' }, { filename: 'b.jpg', excluded: true }] }, leftOutPhotos: null };
    const characterIdMappings = withExplicitExclusions({}, stale);
    expect(characterIdMappings['b.jpg']).toEqual(mapping(false));
    expect(isPhotoExcluded({ ...stale, characterIdMappings }, 'b.jpg')).toBe(false);
  });
});

/**
 * One lookup for a photo's mapping (brief 4.2b, fix round 1). The parse's keys need not
 * match a filename's case, so more than one key can name a photo. photoMappingOf finds
 * the photo's mapping: the first entry whose key names the photo and that holds a
 * mapping. isPhotoExcluded reads the photo's `exclude` from it, finalizePhotoAnalyses its
 * identifications and corrections, and the parse's explicit mark the exclusion the
 * director's text asked for, so all three read the same entry.
 */
describe('photoMappingOf: the one lookup of a photo\'s mapping (brief 4.2b, fix round 1)', () => {
  const vic = mapping(false, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] });

  it('finds the first entry whose key names the photo, in any case or folder, and that holds a mapping', () => {
    const mappings = { 'A.JPG': 'Vic', 'photos/a.jpg': vic, 'a.jpg': mapping(true), 'b.jpg': mapping(true) };
    expect(photoMappingOf(mappings, 'a.jpg')).toBe(vic);
    expect(photoMappingOf(mappings, 'Photos/A.jpg')).toBe(vic);
  });

  it('passes over a key naming the photo that holds text, null or a list', () => {
    expect(photoMappingOf({ 'A.JPG': null, 'a.jpg': ['Vic'], 'Photos/A.jpg': 'Vic', 'photos/a.JPG': vic }, 'a.jpg')).toBe(vic);
  });

  it('finds none when no entry names the photo with a mapping, or there are no mappings, or no filename', () => {
    expect(photoMappingOf({ 'a.jpg': 'Vic', 'b.jpg': vic }, 'a.jpg')).toBeNull();
    expect(photoMappingOf({}, 'a.jpg')).toBeNull();
    expect(photoMappingOf(null, 'a.jpg')).toBeNull();
    expect(photoMappingOf(undefined, 'a.jpg')).toBeNull();
    expect(photoMappingOf({ '': vic }, '')).toBeNull();
  });

  it('isPhotoExcluded and the explicit mark read the entry it finds, and an analysis\'s mark decides neither', () => {
    // A key in capitals holds no mapping, and the director's mapping sits under the
    // lower-case key. b.jpg's analysis carries a stale mark from an earlier round.
    const mappings = { 'A.JPG': 'Vic', 'a.jpg': mapping(true), 'B.JPG': null, 'b.jpg': mapping(false) };
    const state = {
      photoAnalyses: { analyses: [{ filename: 'a.jpg' }, { filename: 'b.jpg', excluded: true }] },
      characterIdMappings: mappings,
      leftOutPhotos: null
    };

    expect(isPhotoExcluded(state, 'a.jpg')).toBe(true);
    expect(isPhotoExcluded(state, 'b.jpg')).toBe(false);
    // The mark writes the exclusion it read from the same entry onto every key naming the photo.
    const marked = { ...state, characterIdMappings: withExplicitExclusions(mappings, state) };
    expect(isPhotoExcluded(marked, 'a.jpg')).toBe(true);
    expect(isPhotoExcluded(marked, 'b.jpg')).toBe(false);
  });
});
