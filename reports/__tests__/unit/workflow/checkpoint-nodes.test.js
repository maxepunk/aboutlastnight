/**
 * Checkpoint Nodes Unit Tests
 *
 * Tests checkpoint nodes that pause the workflow for human approval.
 * Focuses on correct data wiring (what state fields reach the UI).
 *
 * Bug regression tests:
 * - checkpointAwaitRoster must pass photoAnalyses (not genericPhotoAnalyses) to interrupt
 * - tagTokenDispositions must re-tag tokens even when all have existing dispositions
 */

// Mock checkpoint-helpers — captures interrupt calls so we can inspect payloads
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const {
  checkpointAwaitRoster,
  _testing: { checkpointAwaitRoster: rawCheckpointAwaitRoster, checkpointCharacterIds }
} = require('../../../lib/workflow/nodes/checkpoint-nodes');

const { checkpointInterrupt } = require('../../../lib/workflow/checkpoint-helpers');

describe('checkpoint-nodes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkpointAwaitRoster', () => {
    it('passes photoAnalyses to interrupt data (not genericPhotoAnalyses)', async () => {
      const mockPhotoAnalyses = {
        analyses: [
          { filename: 'photo1.jpg', visualContent: 'Two people talking', narrativeMoment: 'Discussion' },
          { filename: 'whiteboard.jpg', visualContent: 'Whiteboard with notes', narrativeMoment: 'Evidence' }
        ],
        stats: { totalPhotos: 2, analyzedPhotos: 2 }
      };

      const state = {
        photoAnalyses: mockPhotoAnalyses,
        genericPhotoAnalyses: null, // This orphaned field should NOT be used
        whiteboardPhotoPath: 'data/0216/photos/whiteboard.jpg',
        roster: null
      };

      await checkpointAwaitRoster(state, {});

      // checkpointInterrupt should have been called with the real photo analyses
      expect(checkpointInterrupt).toHaveBeenCalledWith(
        'await-roster',
        expect.objectContaining({
          genericPhotoAnalyses: mockPhotoAnalyses, // Keyed as genericPhotoAnalyses for UI compat
          whiteboardPhotoPath: 'data/0216/photos/whiteboard.jpg'
        }),
        null // skipCondition = null when no roster
      );
    });

    it('passes null photo analyses when no photos were analyzed', async () => {
      const state = {
        photoAnalyses: null,
        genericPhotoAnalyses: null,
        whiteboardPhotoPath: null,
        roster: null
      };

      await checkpointAwaitRoster(state, {});

      expect(checkpointInterrupt).toHaveBeenCalledWith(
        'await-roster',
        expect.objectContaining({
          genericPhotoAnalyses: null,
          whiteboardPhotoPath: null
        }),
        null
      );
    });

    it('skips interrupt when roster is already provided', async () => {
      const state = {
        photoAnalyses: { analyses: [] },
        whiteboardPhotoPath: 'some/path.jpg',
        roster: ['Alice', 'Bob', 'Charlie']
      };

      await checkpointAwaitRoster(state, {});

      // skipCondition should be the roster array (truthy = skip)
      expect(checkpointInterrupt).toHaveBeenCalledWith(
        'await-roster',
        expect.any(Object),
        ['Alice', 'Bob', 'Charlie']
      );
    });

    it('never reads from genericPhotoAnalyses state field', async () => {
      // Scenario: genericPhotoAnalyses has stale/wrong data, photoAnalyses has correct data
      const correctData = { analyses: [{ filename: 'real.jpg' }] };
      const staleData = { analyses: [{ filename: 'stale.jpg' }] };

      const state = {
        photoAnalyses: correctData,
        genericPhotoAnalyses: staleData, // Should be ignored
        whiteboardPhotoPath: 'wb.jpg',
        roster: null
      };

      await checkpointAwaitRoster(state, {});

      const interruptPayload = checkpointInterrupt.mock.calls[0][1];
      expect(interruptPayload.genericPhotoAnalyses).toBe(correctData);
      expect(interruptPayload.genericPhotoAnalyses).not.toBe(staleData);
    });
  });

  describe('checkpointCharacterIds old-graph guard (C5)', () => {
    it('throws when reached without arcs having ever been analysed', async () => {
      // A thread paused at character-ids on the PREVIOUS graph triggers this node
      // on its first Resume (a plain edge is a channel named after the TARGET, so
      // the pending write still fires it), and the node's outgoing writes then
      // follow the NEW graph: parseCharacterIds, finalizePhotoAnalyses,
      // buildArcEvidencePackages with zero arcs, then a PAID generateOutline and
      // evaluateOutline. Fail before the interrupt instead.
      await expect(checkpointCharacterIds({ photoAnalyses: { analyses: [] }, roster: ['Vic'] }, {}))
        .rejects.toThrow(/previous graph/i);
      await expect(checkpointCharacterIds({ photoAnalyses: null, roster: null }, {}))
        .rejects.toThrow(/await-full-context/);
    });

    it('does not throw on the normal path', async () => {
      const out = await checkpointCharacterIds({
        photoAnalyses: { analyses: [] }, roster: ['Vic'],
        narrativeArcs: [{ id: 'arc-1' }], selectedArcs: ['arc-1'], characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });

    it('does not throw on the human-revision-cap forward, where selectedArcs IS empty (v2 I1)', async () => {
      // routeAfterArcCheckpoint forces `forward` with an EMPTY selection once the
      // human cap is reached, and under the new edges that path runs through this
      // gate. Discriminating on selectedArcs would kill it with a message that is
      // false ("previous graph") and a recovery that is wrong ("roll back to
      // await-full-context"). narrativeArcs is the real discriminator: an
      // old-graph thread never ran analyzeArcs.
      const { REVISION_CAPS } = require('../../../lib/workflow/state');
      const out = await checkpointCharacterIds({
        photoAnalyses: { analyses: [] }, roster: ['Vic'],
        selectedArcs: [],
        narrativeArcs: [{ id: 'arc-1' }],
        humanArcRevisionCount: REVISION_CAPS.HUMAN_ARCS,
        characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });

    it('accepts _arcAnalysisCache alone, for an analysed run whose arcs were all filtered', async () => {
      // validateArcStructure drops arcs with no evidence AND no characters, and
      // routeArcValidation/routeArcEvaluation escalate the resulting 0-arc state to
      // the human gate instead of revising futilely. That run HAS analysed its arcs,
      // so it must not be told it was started on the previous graph.
      const out = await checkpointCharacterIds({
        photoAnalyses: { analyses: [] }, roster: ['Vic'],
        narrativeArcs: [], selectedArcs: [],
        _arcAnalysisCache: { synthesizedAt: '2026-09-19T00:00:00.000Z', architecture: 'split-call' },
        characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });

    it('accepts an arcs evaluation entry alone (arcs seeded, then all filtered)', async () => {
      // checkpointArcSelection is only reachable through evaluateArcs, so every
      // new-graph path to this gate carries an `arcs` entry — including a resumed
      // run whose seeded arcs were filtered away and whose evaluation was skipped
      // on that pre-seeded entry, so nothing wrote _arcAnalysisCache.
      const out = await checkpointCharacterIds({
        photoAnalyses: { analyses: [] }, roster: ['Vic'],
        narrativeArcs: [],
        evaluationHistory: [{ phase: 'arcs', ready: true }],
        characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });

    it('accepts _previousArcs alone as evidence that arcs were analysed', async () => {
      // reviseArcs stashes the prior arcs there and nulls narrativeArcs on the way
      // into a revision; a timeout can leave the state in exactly that shape.
      const out = await checkpointCharacterIds({
        photoAnalyses: null, roster: ['Vic'],
        narrativeArcs: [], _previousArcs: [{ id: 'arc-1' }], characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });
  });
});
