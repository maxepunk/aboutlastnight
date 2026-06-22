/**
 * ROLL-1 end-to-end: rolling back to await-roster must RE-PAUSE the checkpoint.
 *
 * checkpointAwaitRoster skips (returns without interrupting) when
 * state.roster?.length > 0. buildRollbackState('await-roster') must null roster so
 * the merged post-rollback state causes the checkpoint to interrupt again.
 *
 * We don't run the full graph; we apply the rollback patch to a populated state the
 * way LangGraph's replaceReducer would (null overwrites prior value) and assert the
 * checkpoint node interrupts.
 *
 * NOTE: calling interrupt() outside a running graph throws a plain Error
 * ("Called interrupt() outside the context of a graph."), not GraphInterrupt,
 * in this @langchain/langgraph version — so we assert a bare throw (mirrors the
 * sibling await-full-context-rollback.test.js). The point is that the checkpoint
 * RE-PAUSES (does not skip) after rollback.
 */

const { buildRollbackState } = require('../../api-helpers');
const { _testing } = require('../nodes/checkpoint-nodes');

// Apply a rollback patch onto a prior state using replace semantics (null clears),
// mirroring how the checkpointer merges buildRollbackState output on resume.
function applyRollback(priorState, patch) {
  const merged = { ...priorState };
  for (const [k, v] of Object.entries(patch)) {
    merged[k] = v; // replaceReducer: explicit value (incl. null) overwrites
  }
  return merged;
}

describe('ROLL-1 await-roster re-pause', () => {
  const populated = {
    roster: ['Alice', 'Bob'],
    rosterPronouns: { Alice: 'she/her', Bob: 'he/him' },
    photoAnalyses: { analyses: [] },
    whiteboardPhotoPath: '/tmp/wb.jpg',
    evidenceBundle: { exposed: {} },
    selectedArcs: ['arc-1']
  };

  test('before rollback: checkpointAwaitRoster SKIPS (roster present)', () => {
    // skip path returns a plain object, does NOT interrupt
    return expect(
      _testing.checkpointAwaitRoster(populated, {})
    ).resolves.toMatchObject({ currentPhase: expect.any(String) });
  });

  test('after rollback patch: roster is nulled so checkpoint RE-PAUSES (interrupts)', async () => {
    const patch = buildRollbackState('await-roster');
    const rolledBack = applyRollback(populated, patch);

    expect(rolledBack.roster).toBeNull();
    expect(rolledBack.rosterPronouns).toBeNull();

    // With roster null, skipCondition is falsy -> checkpointInterrupt calls interrupt(),
    // which throws (re-pausing) instead of returning the skip object.
    await expect(
      _testing.checkpointAwaitRoster(rolledBack, {})
    ).rejects.toThrow();
  });
});
