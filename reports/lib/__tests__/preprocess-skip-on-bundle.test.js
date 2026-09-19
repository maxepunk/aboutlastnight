/**
 * preprocessEvidence skips once the bundle exists (operator gate, 2026-09-19)
 *
 * curateEvidenceBundle prunes memoryTokens, paperEvidence and preprocessedEvidence
 * to null after consuming them (ai-nodes.js "Prune" block), so on EVERY replay from
 * START — a /resume after a failure, a rollback to arc-selection, outline or article —
 * the fetch nodes re-fetched and preprocessEvidence re-ran its 16 Haiku batches
 * (~3 min) before curation skipped on the bundle it already had. The resume after
 * the assembly failure in the dry run paid exactly that. The node now treats an
 * existing evidenceBundle as "already consumed": nothing downstream needs the
 * intermediate again, and every rollback point upstream of curation clears the
 * bundle, so those replays still preprocess.
 */

const { preprocessEvidence } = require('../workflow/nodes/preprocess-nodes');

function stateWith(overrides) {
  return {
    sessionId: '0919269',
    memoryTokens: [{ id: 'tok-1', name: 'Token 1' }],
    paperEvidence: [{ notionId: 'pe-1', name: 'Evidence 1' }],
    preprocessedEvidence: null,
    ...overrides
  };
}

describe('preprocessEvidence after curation', () => {
  test('skips without calling the preprocessor when the evidence bundle already exists', async () => {
    const preprocessor = { process: jest.fn() };
    const result = await preprocessEvidence(
      stateWith({ evidenceBundle: { exposed: { tokens: [] }, buried: {}, context: {} } }),
      { configurable: { preprocessor } }
    );
    expect(preprocessor.process).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('preprocessedEvidence');
  });

  test('still preprocesses when there is no bundle yet', async () => {
    const preprocessor = { process: jest.fn().mockResolvedValue({ items: [{ id: 'tok-1' }], stats: {} }) };
    const result = await preprocessEvidence(stateWith({}), { configurable: { preprocessor } });
    expect(preprocessor.process).toHaveBeenCalledTimes(1);
    expect(result.preprocessedEvidence.items).toHaveLength(1);
  });
});
