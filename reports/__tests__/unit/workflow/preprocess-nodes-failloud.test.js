/**
 * preprocessEvidence fail-loud (H12)
 *
 * The node used to catch a preprocessor failure and return an EMPTY result plus
 * currentPhase: ERROR. That trapped the session permanently: the skip guard then
 * saw a truthy preprocessedEvidence on every /resume, so the node never re-ran,
 * and curateEvidenceBundle threw "No preprocessed evidence" forever. Its
 * LLM_RETRY policy was dead code because the node never threw, and the director
 * was shown a pre-curation checkpoint with zero items.
 */
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const { preprocessEvidence } = require('../../../lib/workflow/nodes/preprocess-nodes');
const { PHASES } = require('../../../lib/workflow/state');

const stateWithEvidence = () => ({
  memoryTokens: [{ id: 't1' }],
  paperEvidence: [],
  sessionId: '091826',
  playerFocus: { primaryInvestigation: 'Test' }
});

describe('preprocessEvidence fail-loud (H12)', () => {
  it('REJECTS with the preprocessor error instead of writing an empty result', async () => {
    const error = new Error('overloaded_error: server is overloaded');
    const config = { configurable: { preprocessor: { process: jest.fn().mockRejectedValue(error) } } };

    await expect(preprocessEvidence(stateWithEvidence(), config)).rejects.toThrow(error);
  });

  it('writes no state at all on failure (the graph retryPolicy owns the retry)', async () => {
    const config = {
      configurable: { preprocessor: { process: jest.fn().mockRejectedValue(new Error('api timeout')) } }
    };

    const result = await preprocessEvidence(stateWithEvidence(), config).catch(() => 'threw');

    expect(result).toBe('threw');
  });

  it('does not skip when a previous run left an empty preprocessedEvidence', async () => {
    // The trap: a truthy-but-empty result made the skip guard swallow every retry.
    const process = jest.fn().mockResolvedValue({
      items: [{ id: 'fresh' }],
      preprocessedAt: new Date().toISOString(),
      sessionId: '091826',
      stats: { totalItems: 1 }
    });
    const state = { ...stateWithEvidence(), preprocessedEvidence: { items: [], stats: { totalItems: 0 } } };

    const result = await preprocessEvidence(state, { configurable: { preprocessor: { process } } });

    expect(process).toHaveBeenCalled();
    expect(result.preprocessedEvidence.items).toEqual([{ id: 'fresh' }]);
  });

  it('still skips when a previous run produced real items', async () => {
    const process = jest.fn();
    const state = { ...stateWithEvidence(), preprocessedEvidence: { items: [{ id: 'existing' }] } };

    const result = await preprocessEvidence(state, { configurable: { preprocessor: { process } } });

    expect(process).not.toHaveBeenCalled();
    expect(result.currentPhase).toBe(PHASES.PREPROCESS_EVIDENCE);
    expect(result.preprocessedEvidence).toBeUndefined();
  });
});
