process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The leave-out box through the REAL compiled graph (phase 4, brief 4.2; spec
 * 2026-10-02 section 8).
 *
 * A thread is seeded where the photo branch reaches the character-IDs stop
 * (`updateState(..., 'detectWhiteboard')`), and the real stop, payload builders, parse,
 * finalize, packages, outline writer and evaluator run until the outline stop. The model
 * calls go to a scripted mock routed by schema; the checkpointer is a SqliteSaver on a
 * temp file, as the server runs on, so an undeclared channel would show here: LangGraph
 * drops a write to a key that is not an Annotation.
 *
 * Round 1 ticks one photo's box. Round 2 rolls back to the character-IDs stop, where the
 * photo's analysis still carries round 1's `excluded` mark (the rollback keeps the
 * analyses, and finalizePhotoAnalyses skips once any is enriched), and the box is clear:
 * the photo comes back. The mapping decides for every photo the director saw.
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
const { characterIdCards, characterIdLeaveOutTicks, characterIdsPayload } = require('../../console/checkpoint-view-logic');
const { PARSED_CHARACTER_IDS_SCHEMA } = require('../../lib/schemas/character-ids');
const { _testing: { ENRICHED_PHOTO_SCHEMA } } = require('../../lib/workflow/nodes/photo-nodes');
const { createMockImagePromptBuilder } = require('../../lib/image-prompt-builder');
const { articleWriterInputs, generateContentBundle } = require('../../lib/workflow/nodes/ai-nodes');
const outlineSchema = require('../../lib/schemas/outline.schema.json');
const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));

const PASSING_EVALUATION = {
  ready: true, structuralPassed: true, overallScore: 0.9,
  criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], revisionGuidance: '', confidence: 'high'
};

// The parse of the director's text names hero.jpg only: p2.jpg and p3.jpg get their
// mappings from the explicit mark.
const PARSED = {
  photos: [{ filename: 'hero.jpg', characterMappings: [{ descriptionIndex: 0, characterName: 'Alex' }], exclude: false }]
};
const ENRICHED = {
  enrichedVisualContent: 'Alex and Morgan at the bar', enrichedNarrativeMoment: 'The first round',
  finalCaption: 'Alex and Morgan at the bar', identifiedCharacters: ['Alex', 'Morgan']
};

/** A scripted SDK, routed by the call's schema; it keeps every outline writer's prompt. */
function scriptedSdk() {
  const outlinePrompts = [];
  const sdk = async (options) => {
    if (options.jsonSchema === PARSED_CHARACTER_IDS_SCHEMA) return clone(PARSED);
    if (options.jsonSchema === ENRICHED_PHOTO_SCHEMA) return clone(ENRICHED);
    if (options.jsonSchema === outlineSchema) {
      outlinePrompts.push(options.prompt || '');
      return clone(OUTLINE);
    }
    if (/Evaluator/.test(options.systemPrompt || '')) return clone(PASSING_EVALUATION);
    throw new Error(`scriptedSdk: unexpected call ${(options.systemPrompt || '').slice(0, 60)}`);
  };
  sdk.outlinePrompts = outlinePrompts;
  return sdk;
}

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
    arcEvidencePackages: null,
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

/** The <available-photos> section of an outline writer's prompt. */
const availablePhotos = (prompt) => prompt.slice(prompt.indexOf('<available-photos>'), prompt.indexOf('</available-photos>'));

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

  /** Approve the character-IDs stop as the console does: its cards, its ticks, its payload. */
  async function approveCharacterIds(graph, thread, ticked) {
    const snapshot = await graph.getState(thread);
    expect(snapshot.tasks[0].interrupts[0].value.type).toBe(CHECKPOINT_TYPES.CHARACTER_IDS);
    const shown = await getCheckpointData(CHECKPOINT_TYPES.CHARACTER_IDS, snapshot.values);
    const cards = characterIdCards(snapshot.values.photoAnalyses.analyses, shown.sessionPhotos, shown.leftOutPhotos);
    const ticks = { ...characterIdLeaveOutTicks(cards, undefined), ...ticked };
    const payload = characterIdsPayload(cards, { 'p2.jpg': 'Alex leans over the ledger.' }, ticks);
    const { resume, stateUpdates, error } = buildResumePayload(payload, snapshot.values, 'journalist', CHECKPOINT_TYPES.CHARACTER_IDS);
    expect(error).toBeNull();
    await run(graph, thread, new Command({ resume, update: stateUpdates }));
    return { shown, after: await graph.getState(thread) };
  }

  it('a ticked photo is left out of the outline writer\'s list, the hero and the article writer\'s PHOTOS; unticked after a rollback, it comes back over its stale analysis mark', async () => {
    const sdk = scriptedSdk();
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'leave-out-test', sessionId: '010126', theme: 'journalist',
        sdkClient: sdk, imagePromptBuilder: createMockImagePromptBuilder(), dataDir: dir
      }
    };
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
    expect(sdk.outlinePrompts[0]).toContain('\nHERO IMAGE: hero.jpg\n');
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
    expect(sdk.outlinePrompts[1]).toContain('\nHERO IMAGE: p3.jpg\n');
    expect(state2.heroImage).toBe('p3.jpg');
    const photos2 = articleWriterInputs(state2);
    expect(photos2[photos2.length - 1].photos.map((p) => p.filename)).toEqual(['p3.jpg', 'hero.jpg', 'p2.jpg']);
  });
});
