process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The leave-out box through the REAL compiled graph (phase 4, brief 4.2; spec
 * 2026-10-02 section 8).
 *
 * A thread is seeded where the photo branch reaches the character-IDs stop
 * (`updateState(..., 'detectWhiteboard')`), and the real stop, payload builders, parse,
 * finalize, map writer and map checks run until the map's stop (the outline stop). The model
 * calls go to a scripted mock routed by schema; the checkpointer is a SqliteSaver on a
 * temp file, as the server runs on, so an undeclared channel would show here: LangGraph
 * drops a write to a key that is not an Annotation.
 *
 * Round 1 ticks one photo's box. Round 2 rolls back to the character-IDs stop, where the
 * photo's analysis still carries round 1's `excluded` mark (the rollback keeps the
 * analyses, and finalizePhotoAnalyses skips once any is enriched), and the box is clear:
 * the photo comes back. The mapping decides for every photo the director saw.
 *
 * Brief 4.2b: the stop's Skip, the structured form `{characterIds: {}, leftOutPhotos}`,
 * through the same graph. Its boxes decide, and the parse reads no text, also after a
 * rollback has kept an earlier round's text in characterIdsRaw (ROLLBACK_CLEARS_EXEMPT).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { getCheckpointData, buildResumePayload } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { buildRollbackState } = require('../../lib/api-helpers');
const { characterIdCards, characterIdLeaveOutTicks, characterIdsPayload, characterIdsSkipPayload } = require('../../console/checkpoint-view-logic');
const { PARSED_CHARACTER_IDS_SCHEMA } = require('../../lib/schemas/character-ids');
const { _testing: { ENRICHED_PHOTO_SCHEMA } } = require('../../lib/workflow/nodes/photo-nodes');
const { createMockImagePromptBuilder } = require('../../lib/image-prompt-builder');
const { articleWriterInputs, generateContentBundle } = require('../../lib/workflow/nodes/ai-nodes');
// Phase 4 (brief 4.6): the map writer's schema, the theme's map shape.
const { mapSchemaFor } = require('../../lib/map');
const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));

// The parse of the director's text names hero.jpg only: p2.jpg and p3.jpg get their
// mappings from the explicit mark.
const PARSED = {
  photos: [{ filename: 'hero.jpg', characterMappings: [{ descriptionIndex: 0, characterName: 'Alex' }], exclude: false }]
};
const ENRICHED = {
  enrichedVisualContent: 'Alex and Morgan at the bar', enrichedNarrativeMoment: 'The first round',
  finalCaption: 'Alex and Morgan at the bar', identifiedCharacters: ['Alex', 'Morgan']
};

/** The <available-photos> section of a map writer's prompt, from the line that opens it. */
const availablePhotos = (prompt) => prompt.slice(prompt.indexOf('\n<available-photos>'), prompt.indexOf('</available-photos>'));

/**
 * The map a map writer returns from its prompt (phase 4, brief 4.6): the fixture's map,
 * with code's pick for the top photo as its top photo and every other photo offered placed
 * in the story, so the map checks pass and no rework runs.
 */
function mapFor(prompt) {
  const offered = [...availablePhotos(prompt).matchAll(/^\d+\. (\[hero image\] )?([^:\n]+):/gm)]
    .map((m) => ({ hero: Boolean(m[1]), filename: m[2].trim() }));
  const map = clone(OUTLINE);
  const top = offered.find((photo) => photo.hero);
  if (top) map.topPhoto = top.filename; else delete map.topPhoto;
  map.sections = map.sections.map((section) => ({ ...section, photos: [] }));
  map.sections[1].photos = offered.filter((photo) => !photo.hero).map((photo) => ({ filename: photo.filename }));
  return map;
}

/**
 * A scripted SDK, routed by the call's schema. It answers the character-ID parse with
 * `parsed`, keeps every map writer's prompt (answering with mapFor), and records each
 * call's kind in `calls` ('parse', 'enrich', 'outline'), so a test counts the parse calls.
 * Brief 4.7c: the outline judge's route went with the judge (brief 4.6; spec 5.4); no
 * model judge reads the map.
 */
function scriptedSdk(parsed = PARSED) {
  const outlinePrompts = [];
  const calls = [];
  const sdk = async (options) => {
    if (options.jsonSchema === PARSED_CHARACTER_IDS_SCHEMA) {
      calls.push('parse');
      return clone(parsed);
    }
    if (options.jsonSchema === ENRICHED_PHOTO_SCHEMA) {
      calls.push('enrich');
      return clone(ENRICHED);
    }
    if (options.jsonSchema === mapSchemaFor('journalist')) {
      calls.push('outline');
      outlinePrompts.push(options.prompt || '');
      return mapFor(options.prompt || '');
    }
    throw new Error(`scriptedSdk: unexpected call ${(options.systemPrompt || '').slice(0, 60)}`);
  };
  sdk.outlinePrompts = outlinePrompts;
  sdk.calls = calls;
  return sdk;
}

/** How many character-ID parse calls the scripted SDK has answered. */
const parseCalls = (sdk) => sdk.calls.filter((kind) => kind === 'parse').length;

/**
 * The session as the photo branch reaches the character-IDs stop: arcs analysed and
 * selected, three photos and the whiteboard analysed, nothing identified yet. p3.jpg
 * shows six people, so with no names identified anywhere it would be the hero.
 */
function atCharacterIdsStop() {
  const person = (description) => ({ description, role: 'observed' });
  return {
    ...reworkFixtureState('journalist'),
    outline: null,
    heroImage: null,
    characterIdMappings: null,
    photoDescriptions: null,
    leftOutPhotos: null,
    evaluationHistory: [{ phase: 'arcs', ready: true }],
    sessionPhotos: ['photos/hero.jpg', 'photos/p2.jpg', 'photos/p3.jpg', 'photos/whiteboard.jpg'],
    photoAnalyses: {
      analyses: [
        { filename: 'hero.jpg', visualContent: 'Two guests at the bar', characterDescriptions: [person('person in a grey coat'), person('person in red')] },
        { filename: 'p2.jpg', visualContent: 'A guest at the ledger', characterDescriptions: [person('person in a hat')] },
        { filename: 'p3.jpg', visualContent: 'Six guests around a table', characterDescriptions: [1, 2, 3, 4, 5, 6].map((n) => person(`guest ${n}`)) }
      ]
    }
  };
}


describe('the leave-out box through the real graph (phase 4, brief 4.2)', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-leave-out-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  const run = (graph, thread, input) => graph.invoke(input, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });

  /** A thread whose model calls go to `sdk`, with its session folder in the temp dir. */
  const threadFor = (threadId, sdk) => ({
    configurable: {
      thread_id: threadId, sessionId: '010126', theme: 'journalist',
      sdkClient: sdk, imagePromptBuilder: createMockImagePromptBuilder(), dataDir: dir
    }
  });

  /**
   * Answer the character-IDs stop as the console does: its cards, its ticks (`ticked` over
   * the boxes it shows), and the payload `build(cards, ticks)` makes of them. Returns what
   * the stop showed (its checkpoint data), the state at the stop and the snapshot after
   * the run.
   */
  async function answerCharacterIds(graph, thread, ticked, build) {
    const snapshot = await graph.getState(thread);
    expect(snapshot.tasks[0].interrupts[0].value.type).toBe(CHECKPOINT_TYPES.CHARACTER_IDS);
    const shown = await getCheckpointData(CHECKPOINT_TYPES.CHARACTER_IDS, snapshot.values);
    const cards = characterIdCards(snapshot.values.photoAnalyses.analyses, shown.sessionPhotos, shown.leftOutPhotos);
    const ticks = { ...characterIdLeaveOutTicks(cards, undefined), ...ticked };
    const { resume, stateUpdates, error } = buildResumePayload(build(cards, ticks), snapshot.values, 'journalist', CHECKPOINT_TYPES.CHARACTER_IDS);
    expect(error).toBeNull();
    await run(graph, thread, new Command({ resume, update: stateUpdates }));
    return { shown, atStop: snapshot.values, after: await graph.getState(thread) };
  }

  /** Submit, with the director's description of p2.jpg. */
  const approveCharacterIds = (graph, thread, ticked) => answerCharacterIds(graph, thread, ticked,
    (cards, ticks) => characterIdsPayload(cards, { 'p2.jpg': 'Alex leans over the ledger.' }, ticks));

  /** The stop's Skip (brief 4.2b): no identifications, the boxes as ticked. */
  const skipCharacterIds = (graph, thread, ticked) => answerCharacterIds(graph, thread, ticked, characterIdsSkipPayload);

  it('a ticked photo is left out of the outline writer\'s list, the hero and the article writer\'s PHOTOS; unticked after a rollback, it comes back over its stale analysis mark', async () => {
    const sdk = scriptedSdk();
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = threadFor('leave-out-test', sdk);
    await graph.updateState(thread, atCharacterIdsStop(), 'detectWhiteboard');
    await run(graph, thread, null);

    // Round 1: the director ticks p3.jpg's box.
    const round1 = await approveCharacterIds(graph, thread, { 'p3.jpg': true });
    expect(round1.shown.leftOutPhotos).toEqual([]);
    const state1 = round1.after.values;
    expect(round1.after.tasks[0].interrupts[0].value.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(state1.leftOutPhotos).toEqual(['p3.jpg']);
    expect(state1.characterIdMappings['p3.jpg'].exclude).toBe(true);
    expect(state1.characterIdMappings['p2.jpg'].exclude).toBe(false);
    expect(state1.photoAnalyses.analyses.find((a) => a.filename === 'p3.jpg').excluded).toBe(true);

    expect(sdk.outlinePrompts).toHaveLength(1);
    expect(sdk.outlinePrompts[0]).toContain('1. [hero image] hero.jpg');
    expect(availablePhotos(sdk.outlinePrompts[0])).toContain('p2.jpg');
    expect(sdk.outlinePrompts[0]).not.toContain('p3.jpg');
    expect(state1.heroImage).toBe('hero.jpg');

    const photos1 = articleWriterInputs(state1);
    expect(photos1[photos1.length - 1].photos.map((p) => p.filename)).toEqual(['hero.jpg', 'p2.jpg']);
    const articleWriter = jest.fn(async () => clone(PREVIOUS_BUNDLE));
    await generateContentBundle({ ...state1, contentBundle: null }, { configurable: { sdkClient: articleWriter, theme: 'journalist' } });
    const articlePrompt = articleWriter.mock.calls[0][0].prompt;
    expect(articlePrompt).toContain('1. [hero image] hero.jpg');
    expect(articlePrompt).not.toContain('p3.jpg');

    // Round 2: back to the character-IDs stop. The rollback clears the mappings and the
    // list, and keeps the analyses: p3.jpg's still says excluded. The box is clear now.
    await graph.updateState(thread, buildRollbackState('character-ids'), 'detectWhiteboard');
    await run(graph, thread, null);
    const round2 = await approveCharacterIds(graph, thread, {});
    expect(round2.shown.leftOutPhotos).toEqual([]);
    const state2 = round2.after.values;
    expect(state2.photoAnalyses.analyses.find((a) => a.filename === 'p3.jpg').excluded).toBe(true);   // the stale mark
    expect(state2.leftOutPhotos).toEqual([]);
    expect(state2.characterIdMappings['p3.jpg'].exclude).toBe(false);

    // p3.jpg names six people and no photo has more names now: it comes back as the hero.
    expect(sdk.outlinePrompts).toHaveLength(2);
    expect(sdk.outlinePrompts[1]).toContain('1. [hero image] p3.jpg');
    expect(state2.heroImage).toBe('p3.jpg');
    const photos2 = articleWriterInputs(state2);
    expect(photos2[photos2.length - 1].photos.map((p) => p.filename)).toEqual(['p3.jpg', 'hero.jpg', 'p2.jpg']);
  });

  /**
   * The stop's Skip (brief 4.2b) sends the structured form, `{characterIds: {}, leftOutPhotos}`.
   * The director's latest action at the stop is Skip, so the boxes decide for every photo
   * and the parse reads no text: buildResumePayload clears characterIdsRaw beside the
   * mappings, which a rollback to the stop otherwise leaves holding the earlier round's text.
   */
  describe('the stop\'s Skip (brief 4.2b)', () => {
    it('Skip with one box ticked: the list and the mapping, the outline writer\'s list and hero, and the article writer\'s PHOTOS', async () => {
      const sdk = scriptedSdk();
      const graph = createReportGraphWithCheckpointer(saver);
      const thread = threadFor('skip-test', sdk);
      await graph.updateState(thread, atCharacterIdsStop(), 'detectWhiteboard');
      await run(graph, thread, null);

      // The director ticks p3.jpg's box, the photo that would otherwise be the hero, and skips.
      const { after } = await skipCharacterIds(graph, thread, { 'p3.jpg': true });
      expect(after.tasks[0].interrupts[0].value.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      const state = after.values;
      expect(state.leftOutPhotos).toEqual(['p3.jpg']);
      expect(Object.fromEntries(Object.entries(state.characterIdMappings).map(([name, m]) => [name, m.exclude])))
        .toEqual({ 'hero.jpg': false, 'p2.jpg': false, 'p3.jpg': true });
      expect(parseCalls(sdk)).toBe(0);

      expect(sdk.outlinePrompts).toHaveLength(1);
      expect(sdk.outlinePrompts[0]).toContain('1. [hero image] hero.jpg');
      expect(availablePhotos(sdk.outlinePrompts[0])).toContain('p2.jpg');
      expect(sdk.outlinePrompts[0]).not.toContain('p3.jpg');
      expect(state.heroImage).toBe('hero.jpg');

      const photos = articleWriterInputs(state);
      expect(photos[photos.length - 1].photos.map((p) => p.filename)).toEqual(['hero.jpg', 'p2.jpg']);
    });

    it('Skip after a rollback runs no parse: an exclusion in the earlier round\'s text does not come back on a clear box', async () => {
      // The parse reads round 1's text as naming Alex in hero.jpg and leaving p2.jpg out.
      const sdk = scriptedSdk({ photos: [...PARSED.photos, { filename: 'p2.jpg', exclude: true }] });
      const graph = createReportGraphWithCheckpointer(saver);
      const thread = threadFor('skip-after-rollback-test', sdk);
      await graph.updateState(thread, atCharacterIdsStop(), 'detectWhiteboard');
      await run(graph, thread, null);

      // Round 1: the director's text leaves p2.jpg out; every box is clear.
      const round1 = await answerCharacterIds(graph, thread, {},
        (cards, ticks) => characterIdsPayload(cards, { 'p2.jpg': 'Leave this one out.' }, ticks));
      const state1 = round1.after.values;
      expect(parseCalls(sdk)).toBe(1);
      expect(state1.characterIdMappings['p2.jpg'].exclude).toBe(true);
      expect(availablePhotos(sdk.outlinePrompts[0])).not.toContain('p2.jpg');

      // Round 2: back to the stop. The rollback clears the mappings and keeps round 1's text.
      await graph.updateState(thread, buildRollbackState('character-ids'), 'detectWhiteboard');
      await run(graph, thread, null);
      const round2 = await skipCharacterIds(graph, thread, {});
      expect(round2.atStop.characterIdsRaw).toContain('Leave this one out.');
      expect(round2.after.tasks[0].interrupts[0].value.type).toBe(CHECKPOINT_TYPES.OUTLINE);

      // No parse call: round 1's is the only one, and the raw text is cleared.
      const state2 = round2.after.values;
      expect(parseCalls(sdk)).toBe(1);
      expect(state2.characterIdsRaw).toBeNull();
      expect(state2.leftOutPhotos).toEqual([]);

      // Every box is clear, so every photo is kept, p2.jpg over its stale analysis mark, and
      // no identification from round 1's text comes back in a mapping.
      expect(state2.photoAnalyses.analyses.find((a) => a.filename === 'p2.jpg').excluded).toBe(true);
      expect(Object.fromEntries(Object.entries(state2.characterIdMappings).map(([name, m]) => [name, [m.exclude, m.characterMappings]])))
        .toEqual({ 'hero.jpg': [false, []], 'p2.jpg': [false, []], 'p3.jpg': [false, []] });
      expect(sdk.outlinePrompts).toHaveLength(2);
      expect(availablePhotos(sdk.outlinePrompts[1])).toContain('p2.jpg');
      const photos2 = articleWriterInputs(state2);
      expect(photos2[photos2.length - 1].photos.map((p) => p.filename)).toContain('p2.jpg');
    });
  });

  /**
   * Task 4.3c: a kept photo's analysis carries no exclusion from an earlier round. After a
   * Skip no photo is identified, so after a rollback finalizePhotoAnalyses runs again on
   * the analyses the rollback kept, one of them still marked excluded by the round before.
   */
  describe('a kept photo\'s analysis (task 4.3c)', () => {
    it('Skip with one box ticked, a rollback, then Skip with that box clear: the analysis and the count agree with the mapping', async () => {
      const sdk = scriptedSdk();
      const graph = createReportGraphWithCheckpointer(saver);
      const thread = threadFor('stale-mark-test', sdk);
      await graph.updateState(thread, atCharacterIdsStop(), 'detectWhiteboard');
      await run(graph, thread, null);

      // Round 1: the director ticks p3.jpg's box and skips.
      const round1 = await skipCharacterIds(graph, thread, { 'p3.jpg': true });
      const state1 = round1.after.values;
      expect(state1.photoAnalyses.analyses.find((a) => a.filename === 'p3.jpg').excluded).toBe(true);
      expect(state1.photoAnalyses.enrichmentStats.excluded).toBe(1);

      // Round 2: back to the stop, which still holds round 1's mark on p3.jpg's analysis,
      // and Skip with every box clear.
      await graph.updateState(thread, buildRollbackState('character-ids'), 'detectWhiteboard');
      await run(graph, thread, null);
      const round2 = await skipCharacterIds(graph, thread, {});
      expect(round2.atStop.photoAnalyses.analyses.find((a) => a.filename === 'p3.jpg').excluded).toBe(true);
      const state2 = round2.after.values;
      expect(state2.characterIdMappings['p3.jpg'].exclude).toBe(false);
      expect(state2.photoAnalyses.analyses.map((a) => [a.filename, 'excluded' in a])).toEqual([
        ['hero.jpg', false], ['p2.jpg', false], ['p3.jpg', false]
      ]);
      expect(state2.photoAnalyses.enrichmentStats.excluded).toBe(0);
    });
  });
});
