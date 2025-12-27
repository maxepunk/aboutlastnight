/**
 * Tests for BackgroundPipelineManager - Background pipeline orchestration
 */

const {
  BackgroundPipelineManager,
  getBackgroundResultOrWait,
  STATUS,
  RESULT_TYPES
} = require('../background-pipeline-manager');

describe('BackgroundPipelineManager', () => {
  let manager;

  beforeEach(() => {
    manager = new BackgroundPipelineManager();
  });

  afterEach(() => {
    // Cleanup any test sessions
    manager.cleanup('test-session');
  });

  describe('result storage', () => {
    it('should store and retrieve results', () => {
      const testData = [{ id: 'token-1', name: 'Test Token' }];
      manager._setResult('test-session', RESULT_TYPES.TOKENS, testData);

      const result = manager.getResult('test-session', RESULT_TYPES.TOKENS);
      expect(result).toEqual(testData);
    });

    it('should return null for non-existent results', () => {
      const result = manager.getResult('non-existent', RESULT_TYPES.TOKENS);
      expect(result).toBeNull();
    });

    it('should store results for different types', () => {
      manager._setResult('test-session', RESULT_TYPES.TOKENS, [{ id: 'token' }]);
      manager._setResult('test-session', RESULT_TYPES.PHOTOS, [{ id: 'photo' }]);

      expect(manager.getResult('test-session', RESULT_TYPES.TOKENS)).toEqual([{ id: 'token' }]);
      expect(manager.getResult('test-session', RESULT_TYPES.PHOTOS)).toEqual([{ id: 'photo' }]);
    });

    it('should store results for different sessions', () => {
      manager._setResult('session-1', RESULT_TYPES.TOKENS, [{ id: 'tokens-1' }]);
      manager._setResult('session-2', RESULT_TYPES.TOKENS, [{ id: 'tokens-2' }]);

      expect(manager.getResult('session-1', RESULT_TYPES.TOKENS)).toEqual([{ id: 'tokens-1' }]);
      expect(manager.getResult('session-2', RESULT_TYPES.TOKENS)).toEqual([{ id: 'tokens-2' }]);
    });

    it('should correctly handle empty arrays (not convert to null)', () => {
      // This is a critical edge case - sessions with no tokens should return []
      // not null, otherwise awaitResult will timeout
      manager._setResult('test-session', RESULT_TYPES.TOKENS, []);
      manager._setResult('test-session', RESULT_TYPES.PHOTOS, []);

      const tokens = manager.getResult('test-session', RESULT_TYPES.TOKENS);
      const photos = manager.getResult('test-session', RESULT_TYPES.PHOTOS);

      expect(tokens).toEqual([]);
      expect(tokens).not.toBeNull();
      expect(photos).toEqual([]);
      expect(photos).not.toBeNull();
    });
  });

  describe('status tracking', () => {
    it('should return NONE for unknown sessions', () => {
      expect(manager.getStatus('unknown', 'evidence')).toBe(STATUS.NONE);
    });

    it('should track pipeline status', () => {
      manager.pipelines.set('test-session', {
        evidence: { status: STATUS.RUNNING, error: null },
        photos: { status: STATUS.COMPLETED, error: null }
      });

      expect(manager.getStatus('test-session', 'evidence')).toBe(STATUS.RUNNING);
      expect(manager.getStatus('test-session', 'photos')).toBe(STATUS.COMPLETED);
    });

    it('should return full status with results', () => {
      manager.pipelines.set('test-session', {
        evidence: { status: STATUS.COMPLETED, error: null },
        photos: { status: STATUS.FAILED, error: 'Test error' }
      });
      manager._setResult('test-session', RESULT_TYPES.TOKENS, []);

      const fullStatus = manager.getFullStatus('test-session');

      expect(fullStatus.evidence.status).toBe(STATUS.COMPLETED);
      expect(fullStatus.photos.status).toBe(STATUS.FAILED);
      expect(fullStatus.photos.error).toBe('Test error');
      expect(fullStatus.results.tokens).toBe(true);
      expect(fullStatus.results.paperEvidence).toBe(false);
    });
  });

  describe('isRunning', () => {
    it('should return false for unknown sessions', () => {
      expect(manager.isRunning('unknown')).toBe(false);
    });

    it('should return true if any pipeline is running', () => {
      manager.pipelines.set('test-session', {
        evidence: { status: STATUS.RUNNING, error: null },
        photos: { status: STATUS.COMPLETED, error: null }
      });

      expect(manager.isRunning('test-session')).toBe(true);
    });

    it('should return false if all pipelines completed', () => {
      manager.pipelines.set('test-session', {
        evidence: { status: STATUS.COMPLETED, error: null },
        photos: { status: STATUS.COMPLETED, error: null }
      });

      expect(manager.isRunning('test-session')).toBe(false);
    });
  });

  describe('_getPipelineForResult', () => {
    it('should map evidence result types to evidence pipeline', () => {
      expect(manager._getPipelineForResult(RESULT_TYPES.RAW_TOKENS)).toBe('evidence');
      expect(manager._getPipelineForResult(RESULT_TYPES.TOKENS)).toBe('evidence');
      expect(manager._getPipelineForResult(RESULT_TYPES.PAPER_EVIDENCE)).toBe('evidence');
      expect(manager._getPipelineForResult(RESULT_TYPES.PREPROCESSED_PAPER)).toBe('evidence');
      expect(manager._getPipelineForResult(RESULT_TYPES.PREPROCESSED)).toBe('evidence');
    });

    it('should map photo result types to photos pipeline', () => {
      expect(manager._getPipelineForResult(RESULT_TYPES.PHOTOS)).toBe('photos');
      expect(manager._getPipelineForResult(RESULT_TYPES.PHOTO_ANALYSES)).toBe('photos');
    });

    it('should default to photos for unknown types', () => {
      expect(manager._getPipelineForResult('unknownType')).toBe('photos');
    });
  });

  describe('isPipelineRunningForResult', () => {
    it('should return false for unknown sessions', () => {
      expect(manager.isPipelineRunningForResult('unknown', RESULT_TYPES.TOKENS)).toBe(false);
    });

    it('should return true only if the relevant pipeline is running', () => {
      // Evidence running, photos completed
      manager.pipelines.set('test-session', {
        evidence: { status: STATUS.RUNNING, error: null },
        photos: { status: STATUS.COMPLETED, error: null }
      });

      // Evidence result types should return true (evidence is running)
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.RAW_TOKENS)).toBe(true);
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.TOKENS)).toBe(true);
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.PAPER_EVIDENCE)).toBe(true);

      // Photo result types should return false (photos is completed)
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.PHOTOS)).toBe(false);
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.PHOTO_ANALYSES)).toBe(false);
    });

    it('should return false for evidence results when only photos is running (Phase 4d fix)', () => {
      // This is the exact bug scenario: evidence completed, photos still running
      // Nodes requesting evidence results should NOT wait
      manager.pipelines.set('test-session', {
        evidence: { status: STATUS.COMPLETED, error: null },
        photos: { status: STATUS.RUNNING, error: null }
      });

      // Evidence result types should return false (evidence is completed)
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.RAW_TOKENS)).toBe(false);
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.TOKENS)).toBe(false);
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.PREPROCESSED_PAPER)).toBe(false);

      // Photo result types should return true (photos is running)
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.PHOTOS)).toBe(true);
      expect(manager.isPipelineRunningForResult('test-session', RESULT_TYPES.PHOTO_ANALYSES)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove all data for a session', () => {
      manager.pipelines.set('test-session', {
        evidence: { status: STATUS.RUNNING, error: null },
        photos: { status: STATUS.RUNNING, error: null }
      });
      manager._setResult('test-session', RESULT_TYPES.TOKENS, []);
      manager._setResult('test-session', RESULT_TYPES.PHOTOS, []);

      manager.cleanup('test-session');

      expect(manager.pipelines.has('test-session')).toBe(false);
      expect(manager.getResult('test-session', RESULT_TYPES.TOKENS)).toBeNull();
      expect(manager.getResult('test-session', RESULT_TYPES.PHOTOS)).toBeNull();
    });

    it('should not affect other sessions', () => {
      manager._setResult('session-1', RESULT_TYPES.TOKENS, [{ id: 'keep' }]);
      manager._setResult('session-2', RESULT_TYPES.TOKENS, [{ id: 'remove' }]);

      manager.cleanup('session-2');

      expect(manager.getResult('session-1', RESULT_TYPES.TOKENS)).toEqual([{ id: 'keep' }]);
      expect(manager.getResult('session-2', RESULT_TYPES.TOKENS)).toBeNull();
    });
  });

  describe('awaitResult', () => {
    it('should return immediately if result exists', async () => {
      manager._setResult('test-session', RESULT_TYPES.TOKENS, [{ id: 'existing' }]);

      const result = await manager.awaitResult('test-session', RESULT_TYPES.TOKENS, 1000);

      expect(result).toEqual([{ id: 'existing' }]);
    });

    it('should wait for result to become available', async () => {
      // Simulate result arriving after 100ms
      setTimeout(() => {
        manager._setResult('test-session', RESULT_TYPES.TOKENS, [{ id: 'delayed' }]);
      }, 100);

      const result = await manager.awaitResult('test-session', RESULT_TYPES.TOKENS, 2000);

      expect(result).toEqual([{ id: 'delayed' }]);
    });

    it('should return null on timeout', async () => {
      const result = await manager.awaitResult('test-session', RESULT_TYPES.TOKENS, 100);

      expect(result).toBeNull();
    });

    it('should return null if pipeline failed', async () => {
      manager.pipelines.set('test-session', {
        evidence: { status: STATUS.FAILED, error: 'Test failure' },
        photos: { status: STATUS.NONE, error: null }
      });

      const result = await manager.awaitResult('test-session', RESULT_TYPES.TOKENS, 1000);

      expect(result).toBeNull();
    });
  });
});

describe('getBackgroundResultOrWait helper', () => {
  let manager;

  beforeEach(() => {
    // Get the singleton instance (we'll set results on it)
    const { backgroundPipelineManager } = require('../background-pipeline-manager');
    manager = backgroundPipelineManager;
  });

  afterEach(() => {
    manager.cleanup('helper-test');
  });

  it('should skip check if notionClient is injected (testing mode)', async () => {
    // Injected mock client indicates testing - skip background check
    const config = { configurable: { notionClient: {} } };

    const result = await getBackgroundResultOrWait('helper-test', RESULT_TYPES.TOKENS, config);

    expect(result).toBeNull();
  });

  it('should skip check if skipBackgroundCheck is set', async () => {
    const config = { configurable: { skipBackgroundCheck: true } };

    const result = await getBackgroundResultOrWait('helper-test', RESULT_TYPES.TOKENS, config);

    expect(result).toBeNull();
  });

  it('should return cached result if available', async () => {
    manager._setResult('helper-test', RESULT_TYPES.TOKENS, [{ id: 'cached' }]);
    const config = { configurable: {} };

    const result = await getBackgroundResultOrWait('helper-test', RESULT_TYPES.TOKENS, config);

    expect(result).toEqual([{ id: 'cached' }]);
  });

  it('should return null if no result and pipeline not running', async () => {
    const config = { configurable: {} };

    const result = await getBackgroundResultOrWait('helper-test', RESULT_TYPES.TOKENS, config, 100);

    expect(result).toBeNull();
  });

  it('should NOT wait when requesting evidence results while only photos pipeline is running (Phase 4d fix)', async () => {
    // This is the exact bug that was fixed in Phase 4d
    // Before: isRunning() returned true (photos running), caused 120s wait for evidence results
    // After: isPipelineRunningForResult() returns false (evidence not running), returns immediately

    // Setup: evidence completed, photos running
    manager.pipelines.set('helper-test', {
      evidence: { status: STATUS.COMPLETED, error: null },
      photos: { status: STATUS.RUNNING, error: null }
    });

    const config = { configurable: {} };
    const startTime = Date.now();

    // Request evidence result - should return null immediately (not wait 100ms)
    const result = await getBackgroundResultOrWait('helper-test', RESULT_TYPES.RAW_TOKENS, config, 100);

    const elapsed = Date.now() - startTime;

    expect(result).toBeNull();
    // Should return in < 50ms, not wait the full 100ms timeout
    expect(elapsed).toBeLessThan(50);
  });

  it('should wait when requesting results from a running pipeline', async () => {
    // Setup: evidence running
    manager.pipelines.set('helper-test', {
      evidence: { status: STATUS.RUNNING, error: null },
      photos: { status: STATUS.COMPLETED, error: null }
    });

    // Simulate result arriving after 50ms
    setTimeout(() => {
      manager._setResult('helper-test', RESULT_TYPES.RAW_TOKENS, [{ id: 'delayed' }]);
    }, 50);

    const config = { configurable: {} };

    // Request evidence result - should wait and get the result
    const result = await getBackgroundResultOrWait('helper-test', RESULT_TYPES.RAW_TOKENS, config, 2000);

    expect(result).toEqual([{ id: 'delayed' }]);
  });
});

describe('RESULT_TYPES', () => {
  it('should have all expected result types', () => {
    expect(RESULT_TYPES.RAW_TOKENS).toBe('rawTokens');
    expect(RESULT_TYPES.TOKENS).toBe('tokens');
    expect(RESULT_TYPES.PAPER_EVIDENCE).toBe('paperEvidence');
    expect(RESULT_TYPES.PREPROCESSED_PAPER).toBe('preprocessedPaperEvidence');
    expect(RESULT_TYPES.PREPROCESSED).toBe('preprocessedEvidence');
    expect(RESULT_TYPES.PHOTOS).toBe('sessionPhotos');
    expect(RESULT_TYPES.PHOTO_ANALYSES).toBe('photoAnalyses');
  });

  it('should map PREPROCESSED_PAPER to evidence pipeline', () => {
    // Verify _getResultStatus correctly maps PREPROCESSED_PAPER to evidence pipeline
    // This is critical for awaitResult to check the correct pipeline status
    const manager = new BackgroundPipelineManager();
    manager.pipelines.set('test-session', {
      evidence: { status: STATUS.FAILED, error: 'Test error' },
      photos: { status: STATUS.COMPLETED, error: null }
    });

    // Access private method via prototype for testing
    const status = manager._getResultStatus('test-session', RESULT_TYPES.PREPROCESSED_PAPER);

    // Should return evidence pipeline status (FAILED), not photos (COMPLETED)
    expect(status).toBe(STATUS.FAILED);
    manager.cleanup('test-session');
  });
});

describe('STATUS', () => {
  it('should have all expected status values', () => {
    expect(STATUS.NONE).toBe('none');
    expect(STATUS.RUNNING).toBe('running');
    expect(STATUS.COMPLETED).toBe('completed');
    expect(STATUS.FAILED).toBe('failed');
  });
});
