/**
 * Tool gating at the SDK call sites (H21).
 *
 * `allowedTools` is a permission auto-ALLOW list in this SDK, not a restriction,
 * and under permissionMode: 'bypassPermissions' it is a no-op. Eight calls
 * passed only `allowedTools` (or nothing) and therefore ran with the full tool
 * set -- Bash, Write, Edit -- able to write into reports/ and
 * data/<other-session>/ with no prompt. Every call site must now declare either
 * `disableTools: true` (pure text/structured output) or an explicit `tools`
 * allowlist (the two image calls that genuinely need Read).
 */
// Flatten tracing so nodes run directly; keep createTracedSdkQuery a passthrough
// because lib/llm/index.js wraps sdkQueryImpl with it at require time.
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  createTracedSdkQuery: (fn) => fn,
  progressEmitter: { emit: jest.fn(), subscribe: jest.fn(), emitComplete: jest.fn() }
}));

const os = require('os');
const path = require('path');
const fs = require('fs');

/** An sdk stub that records every options object it is handed. */
function makeCapturingSdk(responder) {
  const calls = [];
  const fn = async (options) => {
    calls.push(options);
    return responder ? responder(options, calls.length - 1) : {};
  };
  fn.calls = calls;
  return fn;
}

/** Assert a captured call runs with no tools at all. */
function expectNoTools(call, label) {
  expect({ label, disableTools: call.disableTools }).toEqual({ label, disableTools: true });
}

describe('parseRawInput SDK calls (H21)', () => {
  const { parseRawInput } = require('../workflow/nodes/input-nodes');

  const RESPONSES = [
    { sessionId: '091826', roster: ['Alex'], reportingMode: 'on-site' },                     // step 1 config
    { exposedTokens: [], buriedTokens: [], shellAccounts: [],                                 // step 2 report
      exposedCount: 0, buriedCount: 0, totalBuried: 0 },
    { characterMentions: {}, quotes: [], transactionReferences: [],                            // step 3 enrichment
      postInvestigationDevelopments: [] },
    { suspects: [], keyPhrases: [], evidenceConnections: [], factsEstablished: [] }            // step 4 whiteboard
  ];

  async function run() {
    const sdk = makeCapturingSdk((_options, index) => RESPONSES[index]);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-tool-gating-'));
    await parseRawInput(
      {
        sessionId: '091826',
        accusation: 'Players accused Marcus.',
        sessionReport: '# Session Report',
        directorNotesRaw: 'Director notes prose...',
        sessionConfig: {},
        rawSessionInput: { photosPath: 'data/x/photos', whiteboardPhotoPath: '/tmp/whiteboard.jpg' }
      },
      { configurable: { sdkClient: sdk, dataDir, sessionId: '091826' } }
    );
    return sdk.calls;
  }

  it('runs the session-config and session-report parses with no tools', async () => {
    const calls = await run();
    expectNoTools(calls[0], 'step1 session-config parse');
    expectNoTools(calls[1], 'step2 session-report parse');
  });

  it('restricts the whiteboard image call to Read', async () => {
    const calls = await run();
    expect(calls[3].tools).toEqual(['Read']);
    expect(calls[3].allowedTools).toEqual(['Read']);   // permission auto-allow retained
  });
});

describe('photo-nodes SDK calls (H21)', () => {
  const { _testing, parseCharacterIds, finalizePhotoAnalyses } = require('../workflow/nodes/photo-nodes');

  it('restricts the photo-analysis image call to Read', async () => {
    const sdk = makeCapturingSdk((options) => ({
      filename: options.label || 'unknown.jpg',
      visualContent: 'mock', narrativeMoment: 'mock', suggestedCaption: 'mock',
      characterDescriptions: [], emotionalTone: 'neutral', storyRelevance: 'supporting'
    }));

    await _testing.analyzeSinglePhoto({
      sdk,
      imagePromptBuilder: { buildPhotoAnalysisPrompt: async () => ({ systemPrompt: 's', userPrompt: 'u' }) },
      playerFocus: {}, roster: [],
      processedPath: '/tmp/test.jpg',
      originalFilename: 'test.jpg'
    });

    expect(sdk.calls[0].tools).toEqual(['Read']);
    expect(sdk.calls[0].allowedTools).toEqual(['Read']);
  });

  it('runs the character-ID text parse with no tools', async () => {
    const sdk = makeCapturingSdk(() => ({ mappings: [] }));
    const state = {
      characterIdsRaw: 'photo1.jpg: Vic',
      photoAnalyses: { analyses: [{ filename: 'photo1.jpg', characterDescriptions: ['tall'] }] },
      sessionConfig: { roster: ['Vic'] }
    };

    await parseCharacterIds(state, {
      configurable: {
        sdkClient: sdk,
        imagePromptBuilder: { buildCharacterIdParsingPrompt: async () => ({ systemPrompt: 's', userPrompt: 'u' }) }
      }
    });

    expect(sdk.calls).toHaveLength(1);
    expectNoTools(sdk.calls[0], 'parseCharacterIds');
  });

  it('runs the photo-enrichment text call with no tools', async () => {
    const sdk = makeCapturingSdk(() => ({ identifiedCharacters: ['Vic'] }));
    const state = {
      photoAnalyses: { analyses: [{ filename: 'photo1.jpg', characterDescriptions: ['tall'], identifiedCharacters: [] }] },
      characterIdMappings: { 'photo1.jpg': { characterMappings: [{ description: 'tall', name: 'Vic' }] } },
      sessionConfig: { roster: ['Vic'] }
    };

    await finalizePhotoAnalyses(state, {
      configurable: {
        sdkClient: sdk,
        imagePromptBuilder: { buildPhotoEnrichmentPrompt: async () => ({ systemPrompt: 's', userPrompt: 'u' }) }
      }
    });

    expect(sdk.calls.length).toBeGreaterThan(0);
    expectNoTools(sdk.calls[0], 'finalizePhotoAnalyses enrichment');
  });
});

describe('evidence-preprocessor batch call (H21)', () => {
  const { _testing } = require('../evidence-preprocessor');

  it('runs the batch summarization with no tools', async () => {
    const sdk = makeCapturingSdk(() => ({ items: [] }));
    const batch = [{ id: 'tok-1', rawData: { name: 'Token', description: 'A description.', tags: [] } }];

    await _testing.processBatch(batch, sdk, 0);

    expect(sdk.calls).toHaveLength(1);
    expectNoTools(sdk.calls[0], 'evidence preprocessing batch');
  });
});

describe('arc interweaving call (H21)', () => {
  const { _testing } = require('../workflow/nodes/arc-specialist-nodes');

  it('runs the Opus interweaving enrichment with no tools', async () => {
    const sdk = makeCapturingSdk(() => ({ arcInterweaving: [], interweavingPlan: {} }));
    const coreArcs = [{ id: 'arc-1', title: 'A', summary: 's' }];

    await _testing.enrichWithInterweaving(coreArcs, ['Vic'], { configurable: { sdkClient: sdk } });

    expect(sdk.calls).toHaveLength(1);
    expectNoTools(sdk.calls[0], 'arc interweaving enrichment');
  });
});
