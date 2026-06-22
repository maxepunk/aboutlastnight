/**
 * State pruning tests
 *
 * Verifies that consumed state fields are set to null after phase completion
 * to reduce state size and prevent LangGraph queue overflow on rollback.
 */

// Mock LLM module
jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn()
}));

// Mock observability
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { finalizeInput } = require('../workflow/nodes/input-nodes');

describe('state pruning - finalizeInput', () => {
  test('prunes rawSessionInput on approval', async () => {
    const state = {
      rawSessionInput: 'a very long input string that takes up space',
      sessionConfig: { roster: ['Alex'] }
    };
    const result = await finalizeInput(state, { configurable: {} });
    expect(result.rawSessionInput).toBeNull();
  });

  test('prunes rawSessionInput on approval with edits', async () => {
    const os = require('os');
    const fs = require('fs/promises');
    const path = require('path');
    const tmpDir = path.join(os.tmpdir(), 'state-pruning-test-' + Date.now());
    await fs.mkdir(path.join(tmpDir, 'test-session', 'inputs'), { recursive: true });

    const state = {
      rawSessionInput: 'long input',
      sessionConfig: { roster: ['Alex'] },
      sessionId: 'test-session'
    };
    const config = {
      configurable: {
        dataDir: tmpDir,
        approvals: {
          inputReview: {
            approved: false,
            sessionConfig: { roster: ['Alex', 'Sarah'] },
            directorNotes: { observations: {} },
            playerFocus: { accusation: {} }
          }
        }
      }
    };
    const result = await finalizeInput(state, config);
    expect(result.rawSessionInput).toBeNull();

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

describe('state pruning - curateEvidenceBundle (empty evidence now throws)', () => {
  // N3 fail-loud (P3.4): empty preprocessedEvidence.items means an upstream
  // fetch/preprocess failure, NOT a legitimate empty session. The node now THROWS
  // instead of pruning fields and returning a polished empty three-layer bundle.
  // (Previously asserted the now-removed empty-bundle prune path.)
  test('throws on empty preprocessedEvidence instead of pruning to an empty bundle', async () => {
    const { curateEvidenceBundle } = require('../workflow/nodes/ai-nodes');

    const state = {
      evidenceBundle: null,
      memoryTokens: [{ id: 't1', disposition: 'exposed', ownerLogline: 'Alex', summary: 'test' }],
      paperEvidence: [{ id: 'p1', name: 'Paper 1' }],
      preprocessedEvidence: { items: [] },  // Empty items now triggers a fail-loud throw
      sessionConfig: { roster: ['Alex'] },
      directorNotes: {},
      playerFocus: { accusation: {} },
      selectedPaperEvidence: null,
      sessionId: 'test'
    };
    const config = { configurable: {} };

    await expect(curateEvidenceBundle(state, config))
      .rejects.toThrow(/no preprocessed evidence|empty/i);
  });

  test('does NOT prune on skip path (evidenceBundle already exists)', async () => {
    const { curateEvidenceBundle } = require('../workflow/nodes/ai-nodes');
    const state = { evidenceBundle: { exposed: {}, buried: {} } };
    const result = await curateEvidenceBundle(state, { configurable: {} });
    expect(result.memoryTokens).toBeUndefined();
    expect(result.paperEvidence).toBeUndefined();
    expect(result.preprocessedEvidence).toBeUndefined();
  });
});
