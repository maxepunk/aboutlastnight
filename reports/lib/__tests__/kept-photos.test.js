/**
 * One rule decides a kept photo (phase 3, the 4b fix batch; T13: every photo the
 * director has not excluded appears, and an excluded photo never does; the
 * integrator's ruling of 2026-10-02).
 *
 * The director excludes a photo at the character-IDs stop. The parse stores the
 * decision as characterIdMappings[<filename>].exclude, and finalizePhotoAnalyses then
 * marks the photo's analysis `excluded: true`. 3.9 made the article side read the mark
 * and nothing else, while the outline writer, its reworker, the outline judge, the hero
 * choice and the fact check read neither: an outline could plan an excluded photo, the
 * hero could be one, and the fact check offered one as a usable reference.
 *
 * Now one predicate, isPhotoExcluded, decides for every list a writer or judge may
 * place from, the hero choice and the fact check. It reads the director's own decision
 * first and the analysis's mark as the fallback: after a rollback to character-ids the
 * analyses are kept and the mappings parsed again, so the mark can be stale.
 */

const { reworkFixtureState } = require('./fixtures/rework-state');
const aiNodes = require('../workflow/nodes/ai-nodes');
const { _testing: { buildEvaluationUserPrompt, buildFactCheckArgs } } = require('../workflow/nodes/evaluator-nodes');
const { factCheckContentBundle } = require('../content-bundle-fact-check');
const { createPromptBuilder } = require('../prompt-builder');
const { buildRevisionContext } = require('../workflow/nodes/node-helpers');

const { buildAvailablePhotos, articleWriterInputs, outlineWriterInputs } = aiNodes;
const { _testing: { selectHeroImage, buildOutlineRevisionPrompt } } = aiNodes;

const clone = (v) => JSON.parse(JSON.stringify(v));
const filenames = (photos) => photos.map((p) => p.filename);

/**
 * The fixture with three more photos:
 * - p3.jpg: the director excluded it at the character-IDs stop. Its analysis was
 *   finalized before that decision (a rollback to character-ids keeps the analyses), so
 *   it carries no mark, and it names the most players. The parse's key is in capitals.
 * - p4.jpg: excluded once, then kept by the director after a rollback; its mark is stale.
 * - p5.jpg: marked excluded, and no mapping names it (mapping keys can fail to match
 *   the filenames): the mark decides. Its analysis has the most character descriptions.
 */
function photoState(theme = 'journalist') {
  const state = clone(reworkFixtureState(theme));
  state.heroImage = 'hero.jpg';
  state.sessionPhotos = [...state.sessionPhotos, 'photos/p3.jpg', 'photos/p4.jpg', 'photos/p5.jpg'];
  state.photoAnalyses.analyses = [
    ...state.photoAnalyses.analyses,
    { filename: 'p3.jpg', identifiedCharacters: ['Riley', 'Alex', 'Morgan', 'Sarah'] },
    { filename: 'p4.jpg', excluded: true, identifiedCharacters: [] },
    { filename: 'p5.jpg', excluded: true, identifiedCharacters: [], characterDescriptions: [1, 2, 3, 4, 5, 6].map((n) => ({ description: `person ${n}` })) }
  ];
  state.characterIdMappings = {
    'P3.JPG': { characterMappings: [], additionalCharacters: [], corrections: {}, exclude: true },
    'p4.jpg': { characterMappings: [], additionalCharacters: [], corrections: {}, exclude: false }
  };
  state.photoDescriptions = {
    ...state.photoDescriptions,
    'p3.jpg': 'P3-DESCRIPTION Riley mid-sentence, eyes half shut.',
    'p4.jpg': 'P4-DESCRIPTION Morgan at the ledger.',
    'p5.jpg': 'P5-DESCRIPTION the back of a head.'
  };
  return state;
}

const EXCLUDED = ['p3.jpg', 'p5.jpg', 'P3-DESCRIPTION', 'P5-DESCRIPTION'];

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('the predicate', () => {
  it("reads the director's decision first and the analysis's mark as the fallback, by basename whatever the case", () => {
    const state = photoState();
    expect(aiNodes.isPhotoExcluded(state, 'photos/p3.jpg')).toBe(true);
    expect(aiNodes.isPhotoExcluded(state, 'p4.jpg')).toBe(false);
    expect(aiNodes.isPhotoExcluded(state, 'P5.jpg')).toBe(true);
    expect(aiNodes.isPhotoExcluded(state, 'p2.jpg')).toBe(false);
    expect(aiNodes.isPhotoExcluded(state, 'not-a-session-photo.jpg')).toBe(false);
    expect(aiNodes.isPhotoExcluded({}, 'p2.jpg')).toBe(false);
  });
});

describe('every list a writer or judge may place from', () => {
  it('buildAvailablePhotos leaves out every photo the director excluded', () => {
    const state = photoState();
    expect(filenames(buildAvailablePhotos(state, 'hero.jpg', 'whiteboard.jpg'))).toEqual(['p2.jpg', 'p4.jpg']);
  });

  it('the outline writer and its reworker list only the kept photos', async () => {
    const state = photoState();
    const builder = createPromptBuilder({
      theme: 'journalist', sessionConfig: state.sessionConfig, canonicalCharacters: state.canonicalCharacters,
      characterData: state.characterData.characters
    });
    const { userPrompt } = await builder.buildOutlinePrompt(...outlineWriterInputs(state, selectHeroImage(state)));
    const { contextSection, previousOutputSection } = buildRevisionContext({
      phase: 'outline', revisionCount: 1, previousOutput: state.outline, humanFeedback: 'Rethink it.',
      validationResults: { phase: 'outline', passed: true }
    });
    const rework = await buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, builder);
    for (const prompt of [userPrompt, rework]) {
      const photos = prompt.slice(prompt.indexOf('<available-photos>'), prompt.indexOf('</available-photos>'));
      expect(photos).toContain('p2.jpg: Alex');
      expect(photos).toContain('p4.jpg: Unknown');
      EXCLUDED.forEach((text) => expect(`${text}: ${photos.includes(text)}`).toBe(`${text}: false`));
    }
  });

  it('the outline judge lists the hero and the kept photos, in both themes', () => {
    for (const theme of ['journalist', 'detective']) {
      const prompt = buildEvaluationUserPrompt('outline', photoState(theme));
      const photos = prompt.slice(prompt.indexOf('PHOTOS (all'), prompt.indexOf('SESSION ROSTER ('));
      expect(photos).toContain('PHOTOS (all 3 photos the outline could place');
      expect([...photos.matchAll(/^\d+\. (?:\[hero image\] )?(.+?): .*$/gm)].map((m) => m[1])).toEqual(['hero.jpg', 'p2.jpg', 'p4.jpg']);
      EXCLUDED.forEach((text) => expect(`${theme} ${text}: ${photos.includes(text)}`).toBe(`${theme} ${text}: false`));
    }
  });

  it("the article writer's set follows the director's decision too, over a stale mark", () => {
    const state = photoState();
    const inputs = articleWriterInputs(state);
    expect(filenames(inputs[inputs.length - 1].photos)).toEqual(['hero.jpg', 'p2.jpg', 'p4.jpg']);
  });

  it('the hero is never a photo the director excluded', () => {
    const state = photoState();
    delete state.heroImage;
    expect(selectHeroImage(state)).toBe('hero.jpg');
    // With the kept photos gone, the hero falls back to a kept photo, never an excluded one.
    state.characterIdMappings['hero.jpg'] = { characterMappings: [], exclude: true };
    state.characterIdMappings['p2.jpg'] = { characterMappings: [], exclude: true };
    expect(selectHeroImage(state)).toBe('p4.jpg');
  });
});

describe('the hero entry', () => {
  it('is built once, by its filename, with the names identified in it; an excluded hero has none', () => {
    const state = photoState();
    expect(aiNodes.heroPhotoEntry(state, 'hero.jpg')).toEqual({ filename: 'hero.jpg', identifiedCharacters: ['Alex', 'Morgan', 'Sarah'], hero: true });
    expect(aiNodes.heroPhotoEntry(state, 'photos/HERO.JPG')).toEqual({ filename: 'photos/HERO.JPG', identifiedCharacters: ['Alex', 'Morgan', 'Sarah'], hero: true });
    expect(aiNodes.heroPhotoEntry(state, 'p3.jpg')).toBeNull();
    expect(aiNodes.heroPhotoEntry(state, null)).toBeNull();
  });
});

describe('the fact check reads an excluded photo as not a usable reference', () => {
  const bundleWith = (...photos) => ({
    sections: [{ id: 'the-story', type: 'narrative', content: photos.map((filename) => ({ type: 'photo', filename, caption: 'c' })) }],
    evidenceCards: [],
    heroImage: { filename: 'hero.jpg', caption: 'h' }
  });

  it('an excluded photo in print is an invalid reference, and the fix line lists only kept photos', () => {
    const state = { ...photoState(), contentBundle: bundleWith('p2.jpg', 'p3.jpg') };
    const result = factCheckContentBundle(buildFactCheckArgs(state));
    expect(result.photoReferences.invalid).toEqual(['p3.jpg']);
    const issue = result.structuralIssues.find((text) => text.startsWith('Invalid photo reference "p3.jpg"'));
    expect(issue).toMatch(/the director excluded this photo/);
    expect(issue).toContain('Use one of [hero.jpg, p2.jpg, whiteboard.jpg, p4.jpg]');
  });

  it("a reference to no session photo is offered the kept photos only", () => {
    const state = { ...photoState(), contentBundle: bundleWith('ghost.jpg') };
    const result = factCheckContentBundle(buildFactCheckArgs(state));
    const issue = result.structuralIssues.find((text) => text.startsWith('Invalid photo reference "ghost.jpg"'));
    expect(issue).toContain("not one of this session's photos. Use one of [hero.jpg, p2.jpg, whiteboard.jpg, p4.jpg]");
    expect(issue).not.toMatch(/p3\.jpg|p5\.jpg/);
  });
});
