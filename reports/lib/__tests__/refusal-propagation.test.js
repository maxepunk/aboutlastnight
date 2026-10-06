/**
 * A declined request keeps its name past the nodes (brief 2.0).
 *
 * The wrapper throws SdkRefusalError (lib/llm/client.js, cases in
 * lib/llm/__tests__/client-contract.test.js). Four nodes re-wrap SDK errors into plain
 * Errors, and three paths swallow them into state (the interweaving call, a fourth,
 * went in phase 4, brief 4.4). After each, the failure the director sees must still say
 * "declined" with the category, and the retry classifier must still call it permanent.
 *
 * Kept out of client-contract.test.js on purpose: these load the workflow nodes, and
 * photo-nodes needs the native `sharp` binary.
 *
 * The SDK client is injected through config.configurable.sdkClient. One case drives the
 * real wrapper (sdkQueryImpl over the Jest SDK mock) end to end; the others reject with
 * the error class the wrapper throws.
 */

jest.mock('../workflow/checkpoint-helpers', () => require('../../__tests__/mocks/checkpoint-helpers.mock'));

const os = require('os');
const { setMockQuery, clearMockQuery } = require('@anthropic-ai/claude-agent-sdk');
const { sdkQueryImpl } = require('../llm/client');
const { isTransientError } = require('../llm/retry');
const { SdkRefusalError, refusalOf } = require('../llm/refusal');
const { getDefaultWeave } = require('../../__tests__/mocks/llm-client.mock');

const declined = (category = 'bio') =>
  new SdkRefusalError({ category, explanation: null, model: 'claude-opus-5-5', label: 'test call' });

/** The director reads the message; the classifier reads the error. */
function expectNamedPermanent(err, category = 'bio') {
  expect(err.message).toMatch(/declined the request/);
  expect(err.message).toMatch(new RegExp(`category: ${category}`));
  expect(refusalOf(err)).toEqual(expect.objectContaining({ category }));
  expect(isTransientError(err)).toBe(false);
}

const arcState = () => ({
  weave: null,
  evidenceBundle: {
    exposed: { tokens: [{ id: 't1', summary: 'test', fullDescription: 'test desc' }], paperEvidence: [] },
    buried: { transactions: [], relationships: [] }
  },
  playerFocus: { accusation: { accused: ['Alex'], charge: 'embezzlement' }, whiteboardContext: {} },
  sessionConfig: { roster: ['Alex'] },
  canonicalCharacters: {},
  sessionId: 'TEST'
});

afterEach(() => clearMockQuery());

describe('the four re-wrapping nodes keep the refusal as the cause', () => {
  test('arc analysis, end to end through the real wrapper', async () => {
    const { analyzeArcsPlayerFocusGuided } = require('../workflow/nodes/arc-specialist-nodes');
    setMockQuery(() => (async function* () {
      yield { type: 'assistant', parent_tool_use_id: null, message: { content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio', explanation: null } } };
      yield { type: 'result', subtype: 'success', is_error: false, stop_reason: 'refusal', result: '' };
    })());

    let thrown;
    try {
      await analyzeArcsPlayerFocusGuided(arcState(), { configurable: { sdkClient: sdkQueryImpl } });
    } catch (e) { thrown = e; }

    expect(thrown).toBeDefined();
    expect(thrown.message).toMatch(/^Arc analysis failed: SDK refusal/);
    expect(thrown.cause).toBeInstanceOf(SdkRefusalError);
    expectNamedPermanent(thrown);
  });

  test('character data extraction', async () => {
    const { extractCharacterData } = require('../workflow/nodes/character-data-nodes')._testing;
    const state = {
      characterData: null,
      paperEvidence: [{ name: 'Doc', description: 'text', owners: ['Mel'] }],
      memoryTokens: [],
      sessionConfig: { roster: ['Mel'] }
    };
    const sdk = jest.fn().mockRejectedValue(declined('cyber'));

    let thrown;
    try { await extractCharacterData(state, { configurable: { sdkClient: sdk } }); } catch (e) { thrown = e; }

    expect(thrown.message).toMatch(/^Failed to extract character data: SDK refusal/);
    expect(thrown.cause).toBeInstanceOf(SdkRefusalError);
    expectNamedPermanent(thrown, 'cyber');
  });

  test('the whiteboard parse', async () => {
    const { parseRawInput } = require('../workflow/nodes/input-nodes');
    const prose = 'Director notes prose...';
    const sdk = jest.fn()
      .mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' })   // step 1 config
      .mockResolvedValueOnce({ exposedTokens: [], buriedTokens: [], shellAccounts: [],            // step 2 report
        exposedCount: 0, buriedCount: 0, totalBuried: 0 })
      .mockResolvedValueOnce({ rawProse: prose, characterMentions: {}, quotes: [],                 // step 3 enrichment
        transactionReferences: [], postInvestigationDevelopments: [] })
      .mockRejectedValueOnce(declined('bio'));                                                     // step 4 whiteboard
    const state = {
      accusation: 'Players accused Marcus.',
      sessionReport: '# Session Report\n...',
      directorNotesRaw: prose,
      sessionConfig: {},
      rawSessionInput: { photosPath: 'data/x/photos', whiteboardPhotoPath: '/tmp/whiteboard.jpg' }
    };

    let thrown;
    try {
      await parseRawInput(state, { configurable: { sdkClient: sdk, dataDir: os.tmpdir(), sessionId: 'TEST' } });
    } catch (e) { thrown = e; }

    expect(thrown.message).toMatch(/^Failed to analyze whiteboard: SDK refusal/);
    expect(thrown.cause).toBeInstanceOf(SdkRefusalError);
    expectNamedPermanent(thrown);
  });

  test('photo analysis, when every photo is declined', async () => {
    // Required here, not at the top: photo-nodes loads the native `sharp` binary.
    const { analyzePhotos } = require('../workflow/nodes/photo-nodes');
    const { createMockImagePromptBuilder } = require('../image-prompt-builder');
    const sdk = jest.fn().mockRejectedValue(declined('bio'));
    const state = {
      photoAnalyses: null,
      sessionPhotos: ['/tmp/a.jpg', '/tmp/b.jpg'],
      sessionId: 'TEST',
      playerFocus: {},
      sessionConfig: { roster: [] }
    };

    let thrown;
    try {
      await analyzePhotos(state, { configurable: { sdkClient: sdk, imagePromptBuilder: createMockImagePromptBuilder() } });
    } catch (e) { thrown = e; }

    // Each photo keeps only the text in its placeholder; the marker carries the name.
    expect(thrown.message).toMatch(/^Photo analysis failed: /);
    expect(thrown.cause).toBeInstanceOf(Error);
    expectNamedPermanent(thrown);
  });
});

describe('the paths that swallow errors into state keep "declined" and the category', () => {
  test('an evaluator records the refusal in evaluation history and errors', async () => {
    const { evaluateArcs } = require('../workflow/nodes/evaluator-nodes');
    const sdk = jest.fn().mockRejectedValue(declined('reasoning_extraction'));
    const state = {
      weave: getDefaultWeave(),
      evaluationHistory: [],
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } },
      arcRevisionCount: 0,
      playerFocus: {},
      sessionConfig: { roster: [] }
    };

    const result = await evaluateArcs(state, { configurable: { sdkClient: sdk } });

    expect(sdk).toHaveBeenCalled();
    expect(result.evaluationHistory._error).toMatch(/declined the request/);
    expect(result.evaluationHistory._error).toMatch(/category: reasoning_extraction/);
    expect(result.errors[0].message).toMatch(/declined the request/);
    expect(result.errors[0].message).toMatch(/category: reasoning_extraction/);
  });

  test('reviseArcs records it, and never takes it for the free timeout retry', async () => {
    const { reviseArcs } = require('../workflow/nodes/arc-specialist-nodes');
    // An explanation that happens to contain both words the timeout sniff looks for.
    const err = new SdkRefusalError({ category: 'cyber', explanation: 'timeout limit', model: 'claude-opus-5-5', label: 'Arc revision 1' });
    const sdk = jest.fn().mockRejectedValueOnce(err);
    const state = {
      weave: getDefaultWeave(),
      arcRevisionCount: 1,
      humanArcRevisionCount: 1,
      _arcFeedback: 'fix it',
      _arcReworkTimeout: null,
      validationResults: {},
      playerFocus: { accusation: { accused: ['Test'], charge: 'test' } },
      sessionConfig: { roster: ['Alex'] },
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } },
      theme: 'journalist'
    };

    const result = await reviseArcs(state, { configurable: { sdkClient: sdk } });

    // Phase 4 (brief 4.4): the timeout bookkeeping has its own channel, and the rework
    // leaves the weave where it was.
    expect(result._arcReworkTimeout).toBeNull();
    expect(result).not.toHaveProperty('weave');
    expect(result.errors[0].message).toMatch(/declined the request/);
    expect(result.errors[0].message).toMatch(/category: cyber/);
  });

  test('the director-notes enricher puts the refusal in its fallback reason (the input-review banner)', async () => {
    const { enrichDirectorNotes } = require('../director-enricher');
    const sdk = jest.fn().mockRejectedValue(declined('cyber'));

    const result = await enrichDirectorNotes({
      rawProse: 'Vic was working the room.', roster: ['Vic'], accusation: { accused: ['Morgan'], charge: 'Murder' },
      npcs: [], shellAccounts: [], detectiveEvidenceLog: [], scoringTimeline: []
    }, sdk);

    expect(result._enrichmentFallback.reason).toMatch(/declined the request/);
    expect(result._enrichmentFallback.reason).toMatch(/category: cyber/);
  });
});
