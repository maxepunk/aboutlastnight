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
 *
 * Each arc package's photos were such a list (fix round 1), built from the analyses'
 * names alone, so after that rollback a photo the director had just excluded was listed
 * again. Phase 4 (brief 4.6; R5): the arc packages went, with their photo lists.
 */

const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const aiNodes = require('../workflow/nodes/ai-nodes');
const { finalizePhotoAnalyses } = require('../workflow/nodes/photo-nodes');
const { _testing: { buildEvaluationUserPrompt, buildFactCheckArgs } } = require('../workflow/nodes/evaluator-nodes');
const { factCheckContentBundle } = require('../content-bundle-fact-check');
const { createPromptBuilder } = require('../prompt-builder');
const { buildRevisionContext } = require('../workflow/nodes/node-helpers');

const { buildAvailablePhotos, articleWriterInputs, outlineWriterInputs } = aiNodes;
const { generateOutline, reviseOutline, generateContentBundle, reviseContentBundle } = aiNodes;
const { _testing: { selectHeroImage, buildOutlineRevisionPrompt } } = aiNodes;

const clone = (v) => JSON.parse(JSON.stringify(v));
const filenames = (photos) => photos.map((p) => p.filename);

/** A model stand-in that records every call and answers with a copy of `answer`. */
const recordingSdk = (answer) => jest.fn(async () => clone(answer));
/** Each recorded call's whole prompt: its system prompt, then its user prompt. */
const promptsOf = (sdk) => sdk.mock.calls.map(([options]) => `${options.systemPrompt || ''}\n=====\n${options.prompt || ''}`);
const cfg = (sdk, theme = 'journalist') => ({ configurable: { sdkClient: sdk, theme } });

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

/**
 * photoState after the nodes a rollback to character-ids replays (graph.js: the parse,
 * finalizePhotoAnalyses, then the outline). The rollback clears the hero and the outline;
 * the parse has stored the director's new decision (photoState's mappings).
 * finalizePhotoAnalyses skips, because an analysis is already enriched (the known
 * limitation in state.js), so p3's analysis keeps its names and gets no mark.
 */
async function afterRollbackToCharacterIds(theme = 'journalist') {
  const state = photoState(theme);
  state.heroImage = null;
  state.outline = null;
  Object.assign(state, await finalizePhotoAnalyses(state, {}));
  return state;
}

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

describe('after a rollback to character-ids excludes an enriched photo', () => {
  it('the outline writer and its reworker name it nowhere in their prompts', async () => {
    const state = await afterRollbackToCharacterIds();
    // The case's premise: finalizePhotoAnalyses skipped, so p3's analysis names four
    // players and carries no mark.
    expect(state.photoAnalyses.analyses.find((a) => a.filename === 'p3.jpg'))
      .toEqual({ filename: 'p3.jpg', identifiedCharacters: ['Riley', 'Alex', 'Morgan', 'Sarah'] });
    const writer = recordingSdk(OUTLINE);
    const { heroImage } = await generateOutline(state, cfg(writer));
    const rework = recordingSdk(OUTLINE);
    await reviseOutline({ ...state, heroImage, _previousOutline: OUTLINE, outlineRevisionCount: 1, _outlineFeedback: 'Rethink it.' }, cfg(rework));
    const prompts = [...promptsOf(writer), ...promptsOf(rework)];
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      const photos = prompt.slice(prompt.indexOf('<available-photos>'), prompt.indexOf('</available-photos>'));
      expect(photos).toContain('p2.jpg: Alex');
      EXCLUDED.forEach((text) => expect(`${text}: ${prompt.includes(text)}`).toBe(`${text}: false`));
    }
  });

  it.each(['journalist', 'detective'])('the %s article writer and its reworker name it nowhere either', async (theme) => {
    const state = { ...(await afterRollbackToCharacterIds(theme)), heroImage: 'hero.jpg', outline: OUTLINE };
    const writer = recordingSdk(PREVIOUS_BUNDLE);
    await generateContentBundle({ ...state, contentBundle: null }, cfg(writer, theme));
    const rework = recordingSdk(PREVIOUS_BUNDLE);
    await reviseContentBundle({ ...state, contentBundle: null, _previousContentBundle: PREVIOUS_BUNDLE, articleRevisionCount: 1 }, cfg(rework, theme));
    const prompts = [...promptsOf(writer), ...promptsOf(rework)];
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      EXCLUDED.forEach((text) => expect(`${theme} ${text}: ${prompt.includes(text)}`).toBe(`${theme} ${text}: false`));
    }
  });
});

/**
 * Final review (rules-writers[1]; T13: the whiteboard photo is never placed). A whiteboard
 * on which the director named players at the character-IDs stop was listed under every arc
 * package with those players. Phase 4 (brief 4.6; R5): the packages went;
 * buildAvailablePhotos leaves the whiteboard out (whiteboardFilenameOf), so no writer's
 * list can name it.
 */
describe('the writers leave out the whiteboard photo, whatever names it carries', () => {
  /** The fixture with its whiteboard analysed and named: Alex and Morgan, one in each arc. */
  function namedWhiteboard() {
    const state = clone(reworkFixtureState('journalist'));
    state.heroImage = null;
    state.outline = null;
    state.photoAnalyses.analyses.push({ filename: 'whiteboard.jpg', identifiedCharacters: ['Alex', 'Morgan'] });
    return state;
  }

  it('the outline writer and its reworker name it nowhere', async () => {
    const state = namedWhiteboard();
    expect(aiNodes.whiteboardFilenameOf(state)).toBe('whiteboard.jpg');
    const writer = recordingSdk(OUTLINE);
    const { heroImage } = await generateOutline(state, cfg(writer));
    const rework = recordingSdk(OUTLINE);
    await reviseOutline({ ...state, heroImage, _previousOutline: OUTLINE, outlineRevisionCount: 1, _outlineFeedback: 'Rethink it.' }, cfg(rework));
    const prompts = [...promptsOf(writer), ...promptsOf(rework)];
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt).toContain('HERO IMAGE: hero.jpg');
      expect(prompt).not.toContain('whiteboard.jpg');
    }
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

  // Task 4c-fix (T13): the fix lines offer the kept photos without the whiteboard, which
  // these pins used to list among them.
  it('an excluded photo in print is an invalid reference, and the fix line lists only kept photos', () => {
    const state = { ...photoState(), contentBundle: bundleWith('p2.jpg', 'p3.jpg') };
    const result = factCheckContentBundle(buildFactCheckArgs(state));
    expect(result.photoReferences.invalid).toEqual(['p3.jpg']);
    const issue = result.structuralIssues.find((text) => text.startsWith('Invalid photo reference "p3.jpg"'));
    expect(issue).toMatch(/the director excluded this photo/);
    expect(issue).toContain('Use one of [hero.jpg, p2.jpg, p4.jpg] or remove the reference.');
  });

  it("a reference to no session photo is offered the kept photos only", () => {
    const state = { ...photoState(), contentBundle: bundleWith('ghost.jpg') };
    const result = factCheckContentBundle(buildFactCheckArgs(state));
    const issue = result.structuralIssues.find((text) => text.startsWith('Invalid photo reference "ghost.jpg"'));
    expect(issue).toContain("not one of this session's photos. Use one of [hero.jpg, p2.jpg, p4.jpg] or remove the reference.");
    expect(issue).not.toMatch(/p3\.jpg|p5\.jpg|whiteboard\.jpg/);
  });

  // Task 4c-fix (T13: the whiteboard is the room's working notes, and its photo stays
  // out of the article). The writers never list the whiteboard (whiteboardFilenameOf),
  // but the fact check offered it in its fix lines and accepted it in print.
  it("reads the whiteboard's filename where the writers get it, and a printed whiteboard is an invalid reference", () => {
    const state = { ...photoState(), contentBundle: bundleWith('p2.jpg', 'whiteboard.jpg') };
    const args = buildFactCheckArgs(state);
    expect(args.whiteboardPhoto).toBe(aiNodes.whiteboardFilenameOf(state));
    expect(args.whiteboardPhoto).toBe('whiteboard.jpg');
    const result = factCheckContentBundle(args);
    expect(result.photoReferences.invalid).toEqual(['whiteboard.jpg']);
    expect(result.structuralIssues.filter((text) => text.startsWith('Invalid photo reference'))).toEqual([
      "Invalid photo reference \"whiteboard.jpg\": this is the whiteboard, the room's working notes, and its photo stays out of the article. Use one of [hero.jpg, p2.jpg, p4.jpg] or remove the reference."
    ]);
  });
});

/**
 * Task 4c-fix (4b-fix review minor 1): with no kept photo there is no hero. When every
 * photo but the whiteboard was excluded, selectHeroImage fell back to the placeholder
 * 'evidence-board.png', which is no session photo. The article writer and judge then
 * listed it as the hero, the judge's photosTruth required it in print, and the fact check
 * flagged it there: a loop no rework could end.
 */
describe('with no kept photo there is no hero', () => {
  /** photoState with every photo but the whiteboard excluded (p3 and p5 already are). */
  function allExcluded() {
    const state = photoState();
    state.heroImage = null;
    state.outline = null;
    ['hero.jpg', 'p2.jpg', 'p4.jpg'].forEach((filename) => {
      state.characterIdMappings[filename] = { characterMappings: [], additionalCharacters: [], corrections: {}, exclude: true };
    });
    return state;
  }

  it('selectHeroImage picks none: every photo but the whiteboard excluded, only the whiteboard, or no photo', () => {
    expect(selectHeroImage(allExcluded())).toBeNull();
    expect(selectHeroImage({ ...photoState(), sessionPhotos: ['photos/whiteboard.jpg'] })).toBeNull();
    expect(selectHeroImage({ ...photoState(), sessionPhotos: [], photoAnalyses: { analyses: [] } })).toBeNull();
  });

  it('the outline writer is told there is none, and the article writer and judge are given no photo', async () => {
    const state = allExcluded();
    const outlineSdk = recordingSdk(OUTLINE);
    const { heroImage } = await generateOutline(state, cfg(outlineSdk));
    expect(heroImage).toBeNull();
    const [outlinePrompt] = promptsOf(outlineSdk);
    expect(outlinePrompt).toContain('\nHERO IMAGE: none\n');
    expect(outlinePrompt).toContain('No session photos available');

    const articleState = { ...state, heroImage, outline: OUTLINE };
    const inputs = articleWriterInputs(articleState);
    expect(inputs[1]).toBeNull();
    expect(inputs[inputs.length - 1].photos).toEqual([]);
    const articleSdk = recordingSdk(PREVIOUS_BUNDLE);
    await generateContentBundle({ ...articleState, contentBundle: null }, cfg(articleSdk));
    const [articlePrompt] = promptsOf(articleSdk);
    expect(articlePrompt).toContain('\nHERO IMAGE: none chosen');
    expect(articlePrompt).toContain('\nPHOTOS: none\n');
    expect(buildEvaluationUserPrompt('article', { ...articleState, contentBundle: PREVIOUS_BUNDLE }))
      .toContain('PHOTOS (the article writer was given none)');
    for (const prompt of [outlinePrompt, articlePrompt]) expect(prompt).not.toContain('evidence-board.png');
  });
});
