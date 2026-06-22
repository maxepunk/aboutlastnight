/**
 * ROLL-4 end-to-end: rolling back to await-full-context must RE-PAUSE the checkpoint.
 */
const { buildRollbackState } = require('../../api-helpers');
const { _testing } = require('../nodes/checkpoint-nodes');
// NOTE: calling interrupt() outside a running graph throws a plain Error
// ("Called interrupt() outside the context of a graph."), not GraphInterrupt,
// in this @langchain/langgraph version — so we assert a bare throw. The point
// is that the checkpoint RE-PAUSES (does not skip) after rollback.

function applyRollback(prior, patch) {
  const merged = { ...prior };
  for (const [k, v] of Object.entries(patch)) merged[k] = v; // replace semantics (null clears)
  return merged;
}

describe('ROLL-4 await-full-context re-pause', () => {
  const populated = {
    accusation: 'Players accused Marcus.',
    sessionReport: '# Session Report ...',
    directorNotesRaw: 'Notes ...',
    roster: ['Alice', 'Bob'],
    evidenceBundle: { exposed: {} }
  };

  test('before rollback: checkpointAwaitContext SKIPS (full context present)', () => {
    return expect(_testing.checkpointAwaitContext(populated, {}))
      .resolves.toMatchObject({ currentPhase: expect.any(String) });
  });

  test('after rollback: 3 channels nulled, stash carried, checkpoint RE-PAUSES', async () => {
    const patch = buildRollbackState('await-full-context');
    const rolledBack = applyRollback(populated, patch);
    expect(rolledBack.accusation).toBeNull();
    expect(rolledBack.sessionReport).toBeNull();
    expect(rolledBack.directorNotesRaw).toBeNull();
    await expect(_testing.checkpointAwaitContext(rolledBack, {})).rejects.toThrow();
  });
});
