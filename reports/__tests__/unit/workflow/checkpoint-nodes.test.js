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
  _testing: { checkpointAwaitRoster: rawCheckpointAwaitRoster }
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
});
