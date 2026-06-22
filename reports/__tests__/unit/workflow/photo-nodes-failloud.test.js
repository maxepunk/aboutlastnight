/**
 * Photo Nodes Fail-Loud Tests (N2)
 *
 * Covers the analyzePhotos node's total-failure behavior:
 * - When EVERY photo fails to analyze (e.g. a uniform auth/SDK outage), the node
 *   must throw rather than return an empty photoAnalyses + currentPhase: PHASES.ERROR
 *   that silently flows onward and yields mis-attributed captions.
 * - When there are NO photos (legitimate empty), the node skips cleanly.
 *
 * Per-photo degradation (analyzeSinglePhoto's placeholder for ONE failed photo among N)
 * is intentionally KEPT — it is cosmetic and already surfaced via _error + stats.failedPhotos.
 *
 * Mock pattern matches the existing passing photo-nodes.test.js: we do NOT mock
 * lib/observability (rely on the real no-op passthrough — tracing disabled by default).
 * The SDK is injected via config.configurable.sdkClient so a rejected SDK call drives
 * analyzeSinglePhoto's own catch → placeholder with _error → the new total-failure guard.
 */

// Mock checkpointInterrupt to prevent GraphInterrupt in unit tests
// Uses shared mock - see __tests__/mocks/checkpoint-helpers.mock.js
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const photoNodes = require('../../../lib/workflow/nodes/photo-nodes');
const analyzePhotos = photoNodes.analyzePhotos;
const parseCharacterIds = photoNodes.parseCharacterIds;
const { createMockImagePromptBuilder } = require('../../../lib/image-prompt-builder');

const mockImagePromptBuilder = createMockImagePromptBuilder();

describe('analyzePhotos fail-loud (N2)', () => {
  test('throws when the whole analysis batch fails (no empty-result fallthrough)', async () => {
    // sdk rejects for every photo → analyzeSinglePhoto's catch turns each into a
    // placeholder with _error → Promise.all resolves → guard sees analyzedPhotos === 0.
    const mockSdk = jest.fn().mockRejectedValue(new Error('Please run /login'));
    const state = {
      photoAnalyses: null,
      sessionPhotos: ['/tmp/a.jpg', '/tmp/b.jpg'],
      sessionId: 'TEST',
      playerFocus: {},
      sessionConfig: { roster: [] }
    };

    await expect(
      analyzePhotos(state, {
        configurable: { sdkClient: mockSdk, imagePromptBuilder: mockImagePromptBuilder }
      })
    ).rejects.toThrow(/photo analysis|login/i);

    // Confirm the SDK was actually exercised for every photo (guard reached, not an early skip)
    expect(mockSdk).toHaveBeenCalledTimes(2);
  });

  test('skips cleanly when no photos (legitimate empty)', async () => {
    const state = { photoAnalyses: null, sessionPhotos: [], sessionId: 'TEST' };

    const result = await analyzePhotos(state, { configurable: {} });

    expect(result.photoAnalyses).toBeDefined();
    expect(result.photoAnalyses.stats.totalPhotos).toBe(0);
  });
});

describe('parseCharacterIds fail-loud', () => {
  test('throws when ID parsing fails (no empty mapping fallthrough)', async () => {
    // sdk rejects → the parse catch must re-throw rather than return
    // { characterIdMappings: {}, errors:[CHARACTER_ID_PARSE_ERROR] }, which would
    // discard the director's just-approved character-ids selection.
    const mockSdk = jest.fn().mockRejectedValue(new Error('overloaded_error'));

    // State must pass all THREE legitimate early-skip guards to reach the SDK call:
    //   - characterIdsRaw truthy        → passes the no-raw-input skip (line ~603)
    //   - characterIdMappings null       → passes the structured-mappings skip (line ~611)
    //   - photoAnalyses.analyses.length  → passes the no-photos skip (line ~619)
    const state = {
      characterIdsRaw: 'Alex appears in photo a.jpg',
      characterIdMappings: null,
      _characterIdsParsed: false,
      photoAnalyses: { analyses: [{ filename: 'a.jpg' }] },
      sessionConfig: { roster: ['Alex'] },
      sessionId: 'TEST'
    };

    await expect(
      parseCharacterIds(state, {
        configurable: { sdkClient: mockSdk, imagePromptBuilder: mockImagePromptBuilder }
      })
    ).rejects.toThrow(/character id|overloaded/i);

    // Confirm the SDK was actually exercised (guard reached, not an early skip-return)
    expect(mockSdk).toHaveBeenCalledTimes(1);
  });
});
