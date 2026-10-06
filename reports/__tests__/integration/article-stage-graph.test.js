process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The article stage through the REAL compiled graph (phase 4, brief 4.7b; spec 6.1, 6.3,
 * section 8; R7).
 *
 * Each run seeds a thread past the story meeting and the photo branch
 * (`updateState(..., 'finalizePhotoAnalyses')`) and runs the real map writer, map checks,
 * stops, article writer, stamp, fact check, judge, increment and rework, with the real
 * PromptBuilder. The director acts through the server's own functions, as the console's
 * request would: buildResumePayload turns each action into the resume and the update, and
 * getCheckpointData shows the stop. The model calls go to a scripted stand-in: the map
 * writer by its schema, the article writer by the bundle's schema, its rework by its label,
 * and every other call (the article judge) a clean verdict. The checkpointer is a
 * SqliteSaver on a temp file, as the server runs on.
 *
 * Invented text throughout: the repo is public.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { getCheckpointData, buildResumePayload } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { factCheckContentBundle } = require('../../lib/content-bundle-fact-check');
const { _testing: { buildFactCheckArgs } } = require('../../lib/workflow/nodes/evaluator-nodes');
const { printedPhotos } = require('../../lib/publish-photos');
const Desk = require('../../console/article-desk-logic');
const { articleReviewPayload } = require('../../console/checkpoint-view-logic');
const { reworkFixtureState, MAP, WEAVE, DOCUMENT_TEXT } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });

const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };
const DIRECTORS_HEADLINE = 'Six Votes Said Overdose. The Ledger Said Sale.';
const P2 = { type: 'photo', filename: 'p2.jpg', caption: 'Alex leans over the ledger and points at a line.' };

/**
 * The article writer's first draft: every roster player named, its card copied from the
 * record, both kept photos placed, so the fact check finds nothing to send back.
 */
function writersDraft() {
  return {
    metadata: { sessionId: '100326', theme: 'journalist', generatedAt: '2026-10-03T10:00:00.000Z' },
    headline: { main: "The Writer's Own Headline", kicker: 'NovaNews', deck: "The writer's own deck." },
    heroImage: { filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Alex and Morgan deadlocked, and six votes named an accidental overdose.')] },
      {
        id: 'theStory', type: 'narrative', heading: 'The Story',
        content: [
          paragraph('Marcus bragged about the sale the night he died.'),
          { type: 'evidence-card', tokenId: 'ale003', headline: 'The brag', content: DOCUMENT_TEXT.ale003, owner: 'Alex Reeves', significance: 'critical' },
          clone(P2),
          paragraph('Morgan handed Riley an envelope by the bar, and a paternity result named Sarah as the heir.')
        ]
      },
      { id: 'closing', type: 'conclusion', content: [paragraph('Riley says they only kept the books.')] }
    ]
  };
}

/**
 * A scripted SDK: the map writer by the map's schema, the article writer by the bundle's,
 * its rework by its label (the version it started from, unchanged), and every other call a
 * clean verdict. Every call's options are kept.
 */
function scriptedSdk() {
  const sent = [];
  const sdk = async (options) => {
    const label = options.label || '';
    const schemaId = options.jsonSchema && options.jsonSchema.$id;
    sent.push({ who: label || schemaId || 'judge', options });
    if (/^Article revision/.test(label)) return clone(sdk.reworkReturns);
    if (schemaId === 'outline') return clone(MAP);
    if (schemaId === 'content-bundle') return writersDraft();
    return clone(CLEAN);
  };
  sdk.sent = sent;
  sdk.prompts = (who) => sent.filter((call) => call.who === who).map((call) => call.options.prompt);
  return sdk;
}

/** The block between a tag's opening line and its closing line. */
function block(text, tag) {
  const open = text.indexOf(`\n<${tag}>\n`);
  const close = text.indexOf(`\n</${tag}>`, open);
  expect(open).toBeGreaterThanOrEqual(0);
  return text.slice(open, close);
}

describe('the article stage through the real graph (phase 4, brief 4.7b)', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-article-'));
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

  /** The director's action at the stop the thread is paused at, through the server's payload builder. */
  async function act(graph, thread, approvals) {
    const snapshot = await graph.getState(thread);
    const type = snapshot.tasks[0].interrupts[0].value.type;
    const { resume, stateUpdates, error } = buildResumePayload(approvals, snapshot.values, 'journalist', type);
    expect(error).toBeNull();
    await run(graph, thread, new Command({ resume, update: stateUpdates }));
    const next = await graph.getState(thread);
    const nextType = next.tasks[0].interrupts[0].value.type;
    return { type: nextType, values: next.values, data: await getCheckpointData(nextType, next.values) };
  }

  /** The thread past the photo branch, run to the map's stop, with the director's headline on the map approved. */
  async function toArticle(sdk) {
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = { configurable: { thread_id: 'article-test', sessionId: '100326', theme: 'journalist', sdkClient: sdk, dataDir: dir } };
    const { outline: _o, _mapBaseline: _b, ...state } = reworkFixtureState('journalist');
    await graph.updateState(thread, { ...state, sessionId: '100326', evaluationHistory: [] }, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    const left = clone(MAP);
    left.headline = DIRECTORS_HEADLINE;
    const stop = await act(graph, thread, { outline: 'approve', map: left });
    return { graph, thread, stop };
  }

  it("the first draft carries the map's headline the director wrote, as their line, from a prompt that read the weave and then the map", async () => {
    const sdk = scriptedSdk();
    const { stop } = await toArticle(sdk);
    expect(stop.type).toBe(CHECKPOINT_TYPES.ARTICLE);

    const [writerPrompt] = sdk.prompts('content-bundle');
    expect(writerPrompt.startsWith('<SETTLED_WEAVE>\n')).toBe(true);
    expect(block(writerPrompt, 'STORY_MAP')).toContain(`"headline": "${DIRECTORS_HEADLINE}"`);

    expect(stop.values.contentBundle.headline).toEqual({ main: DIRECTORS_HEADLINE, kicker: 'NovaNews', deck: MAP.deck });
    expect(stop.values.contentBundle.heroImage.filename).toBe('hero.jpg');
    expect(stop.values._articleHandEdits.edits).toEqual([
      expect.objectContaining({ id: 'E1', path: 'headline.main', after: DIRECTORS_HEADLINE })
    ]);

    // The stop shows the story the director settled at the meeting, as the map's stop did.
    expect(stop.data.settledStory).toEqual({ story: WEAVE.angles[0].story, question: WEAVE.angles[0].question });
    expect(stop.data).not.toHaveProperty('outlineThesis');
  });

  it('a photo deleted at the desk, then a send-back: it stays out of PHOTOS, the map the rework reads, the judge and print', async () => {
    const sdk = scriptedSdk();
    const { graph, thread, stop } = await toArticle(sdk);

    // The director deletes the photo beside the brag and sends the article back.
    const story = stop.values.contentBundle.sections.findIndex((s) => s.id === 'theStory');
    const at = stop.values.contentBundle.sections[story].content.findIndex((b) => b.type === 'photo');
    const desk = Desk.deleteBlock(stop.values.contentBundle, story, at);
    sdk.reworkReturns = desk;
    const next = await act(graph, thread, articleReviewPayload(desk, 'Tighten the story.', 'send-back'));
    expect(next.type).toBe(CHECKPOINT_TYPES.ARTICLE);

    // The leave-out list holds it, and the photo's mapping excludes it.
    expect(next.values.leftOutPhotos).toEqual(['p2.jpg']);
    expect(next.values.characterIdMappings['p2.jpg'].exclude).toBe(true);

    // The rework's PHOTOS and the map it reads leave it out; its place on the map is gone.
    const [rework] = sdk.prompts('Article revision 0');
    expect(block(rework, 'DATA_CONTEXT')).not.toContain('p2.jpg');
    expect(block(rework, 'STORY_MAP')).not.toContain('p2.jpg');

    // The judge's PHOTOS leaves it out.
    const judge = sdk.prompts('judge').pop();
    expect(judge).toContain('PHOTOS (the 1 photos the article writer was given');
    expect(judge.slice(judge.indexOf('PHOTOS (the 1 photos'))).not.toMatch(/^\d+\. .*p2\.jpg/m);

    // A rework that brought it back would fail the photo check, and the page prints none of it.
    const back = clone(next.values.contentBundle);
    back.sections[story].content.push(clone(P2));
    const factCheck = factCheckContentBundle(buildFactCheckArgs({ ...next.values, contentBundle: back }));
    expect(factCheck.photoReferences.invalid).toContain('p2.jpg');
    expect(printedPhotos(next.values.contentBundle, 'journalist')).toEqual(['hero.jpg']);

    // The stamp's line stands beside the director's cut.
    expect(next.values.contentBundle.headline.main).toBe(DIRECTORS_HEADLINE);
    expect(next.values._articleHandEdits.edits.map((e) => [e.id, e.path])).toEqual([
      ['E1', 'headline.main'],
      ['E2', 'sections[#theStory].content[-]']
    ]);
  });
});
