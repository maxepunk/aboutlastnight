// Mock checkpointInterrupt to prevent GraphInterrupt in unit tests (shared mock).
// NOTE: the plan's draft also mocked '../../../lib/observability', but that partial
// mock omits createTracedSdkQuery, which lib/llm/index.js evaluates at require time
// (ai-nodes.js -> require('../../llm') -> createTracedSdkQuery(sdkQueryImpl)), so it
// crashes the suite at load. The sibling ai-nodes.test.js mocks ONLY checkpoint-helpers
// and the real observability module is a no-op passthrough when tracing is disabled.
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const { curateEvidenceBundle } = require('../../../lib/workflow/nodes/ai-nodes');

describe('curateEvidenceBundle fail-loud (N3)', () => {
  test('throws when preprocessedEvidence is empty (upstream failure masked otherwise)', async () => {
    const state = {
      evidenceBundle: null,
      preprocessedEvidence: { items: [], playerFocus: {} },
      playerFocus: {},
      sessionId: 'TEST'
    };
    await expect(curateEvidenceBundle(state, { configurable: {} }))
      .rejects.toThrow(/no preprocessed evidence|empty/i);
  });

  test('still skips cleanly when evidenceBundle already exists (resume)', async () => {
    const state = { evidenceBundle: { exposed: {} } };
    const result = await curateEvidenceBundle(state, { configurable: {} });
    expect(result.currentPhase).toBeDefined();
  });
});
