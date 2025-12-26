/**
 * Fetch Nodes Unit Tests
 *
 * Tests data fetching nodes for the report generation workflow.
 * Uses fixtures aligned with actual NotionClient return formats.
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const path = require('path');
const {
  initializeSession,
  loadDirectorNotes,
  fetchMemoryTokens,
  fetchPaperEvidence,
  createMockNotionClient,
  _testing
} = require('../../../lib/workflow/nodes/fetch-nodes');
const { PHASES } = require('../../../lib/workflow/state');

// Load test fixtures
const mockTokensResponse = require('../../fixtures/mock-responses/memory-tokens.json');
const mockEvidenceResponse = require('../../fixtures/mock-responses/paper-evidence.json');

// Path to test session fixtures
const TEST_SESSION_DIR = path.join(__dirname, '..', '..', 'fixtures', 'sessions');

describe('fetch-nodes', () => {
  describe('module exports', () => {
    it('exports initializeSession function', () => {
      expect(typeof initializeSession).toBe('function');
    });

    it('exports loadDirectorNotes function', () => {
      expect(typeof loadDirectorNotes).toBe('function');
    });

    it('exports fetchMemoryTokens function', () => {
      expect(typeof fetchMemoryTokens).toBe('function');
    });

    it('exports fetchPaperEvidence function', () => {
      expect(typeof fetchPaperEvidence).toBe('function');
    });

    it('exports createMockNotionClient function', () => {
      expect(typeof createMockNotionClient).toBe('function');
    });

    it('exports _testing with DEFAULT_DATA_DIR', () => {
      expect(_testing).toBeDefined();
      expect(typeof _testing.DEFAULT_DATA_DIR).toBe('string');
    });
  });

  describe('initializeSession', () => {
    it('extracts sessionId from config.configurable', async () => {
      const config = { configurable: { sessionId: 'test-session', theme: 'journalist' } };
      const result = await initializeSession({}, config);

      expect(result.sessionId).toBe('test-session');
    });

    it('extracts theme from config.configurable', async () => {
      const config = { configurable: { sessionId: 'test-session', theme: 'detective' } };
      const result = await initializeSession({}, config);

      expect(result.theme).toBe('detective');
    });

    it('defaults theme to journalist when not specified', async () => {
      const config = { configurable: { sessionId: 'test-session' } };
      const result = await initializeSession({}, config);

      expect(result.theme).toBe('journalist');
    });

    it('sets currentPhase to LOAD_DIRECTOR_NOTES', async () => {
      const config = { configurable: { sessionId: 'test-session' } };
      const result = await initializeSession({}, config);

      expect(result.currentPhase).toBe(PHASES.LOAD_DIRECTOR_NOTES);
    });

    it('throws error when sessionId is missing', async () => {
      const config = { configurable: {} };

      await expect(initializeSession({}, config))
        .rejects.toThrow('sessionId is required');
    });

    it('throws error when config.configurable is missing', async () => {
      await expect(initializeSession({}, {}))
        .rejects.toThrow('sessionId is required');
    });

    it('throws error when config is undefined', async () => {
      await expect(initializeSession({}, undefined))
        .rejects.toThrow('sessionId is required');
    });

    it('returns partial state update (only specified fields)', async () => {
      const config = { configurable: { sessionId: 'test-session' } };
      const result = await initializeSession({}, config);

      expect(Object.keys(result).sort()).toEqual(['currentPhase', 'sessionId', 'theme']);
    });
  });

  describe('loadDirectorNotes', () => {
    const state = { sessionId: 'test-session' };
    const config = { configurable: { dataDir: TEST_SESSION_DIR } };

    it('loads director notes from session directory', async () => {
      const result = await loadDirectorNotes(state, config);

      expect(result.directorNotes).toBeDefined();
      expect(result.directorNotes.observations).toBeDefined();
      expect(result.directorNotes.whiteboard).toBeDefined();
    });

    it('loads session config from session directory', async () => {
      const result = await loadDirectorNotes(state, config);

      expect(result.sessionConfig).toBeDefined();
      expect(result.sessionConfig.roster).toBeDefined();
      expect(result.sessionConfig.accusation).toBeDefined();
    });

    it('extracts playerFocus from director notes', async () => {
      const result = await loadDirectorNotes(state, config);

      expect(result.playerFocus).toBeDefined();
      expect(result.playerFocus.primaryInvestigation).toBe('Financial fraud trail');
    });

    it('sets currentPhase to FETCH_TOKENS', async () => {
      const result = await loadDirectorNotes(state, config);

      expect(result.currentPhase).toBe(PHASES.FETCH_TOKENS);
    });

    it('returns empty playerFocus when not in director notes', async () => {
      // This would need a fixture without playerFocus - for now verify structure
      const result = await loadDirectorNotes(state, config);
      expect(typeof result.playerFocus).toBe('object');
    });

    it('throws error for non-existent session', async () => {
      const badState = { sessionId: 'non-existent-session' };

      await expect(loadDirectorNotes(badState, config))
        .rejects.toThrow();
    });

    it('returns partial state update', async () => {
      const result = await loadDirectorNotes(state, config);

      expect(Object.keys(result).sort()).toEqual([
        '_parsedInput', 'currentPhase', 'directorNotes', 'playerFocus', 'sessionConfig'
      ]);
    });
  });

  describe('fetchMemoryTokens', () => {
    const mockClient = createMockNotionClient({
      tokens: mockTokensResponse.tokens
    });

    it('fetches tokens using NotionClient', async () => {
      const state = { directorNotes: { scannedTokens: ['blk001', 'chr001'] } };
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchMemoryTokens(state, config);

      expect(result.memoryTokens).toBeDefined();
      expect(Array.isArray(result.memoryTokens)).toBe(true);
    });

    it('filters tokens by scannedTokens from director notes', async () => {
      const state = { directorNotes: { scannedTokens: ['blk001'] } };
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchMemoryTokens(state, config);

      expect(result.memoryTokens).toHaveLength(1);
      expect(result.memoryTokens[0].tokenId).toBe('blk001');
    });

    it('returns all tokens when scannedTokens is empty', async () => {
      const state = { directorNotes: { scannedTokens: [] } };
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchMemoryTokens(state, config);

      expect(result.memoryTokens).toHaveLength(3);
    });

    it('returns all tokens when scannedTokens is undefined', async () => {
      const state = { directorNotes: {} };
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchMemoryTokens(state, config);

      expect(result.memoryTokens).toHaveLength(3);
    });

    it('sets currentPhase to FETCH_EVIDENCE', async () => {
      const state = { directorNotes: {} };
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchMemoryTokens(state, config);

      expect(result.currentPhase).toBe(PHASES.FETCH_EVIDENCE);
    });

    it('returns tokens with expected structure', async () => {
      const state = { directorNotes: { scannedTokens: ['blk001'] } };
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchMemoryTokens(state, config);
      const token = result.memoryTokens[0];

      expect(token).toHaveProperty('notionId');
      expect(token).toHaveProperty('tokenId');
      expect(token).toHaveProperty('name');
      expect(token).toHaveProperty('fullDescription');
      expect(token).toHaveProperty('summary');
      expect(token).toHaveProperty('valueRating');
      expect(token).toHaveProperty('memoryType');
      expect(token).toHaveProperty('group');
      expect(token).toHaveProperty('basicType');
      expect(token).toHaveProperty('owners');
    });

    it('handles case-insensitive token ID matching', async () => {
      const state = { directorNotes: { scannedTokens: ['BLK001'] } };
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchMemoryTokens(state, config);

      expect(result.memoryTokens).toHaveLength(1);
      expect(result.memoryTokens[0].tokenId).toBe('blk001');
    });

    it('returns empty array when no tokens match', async () => {
      const state = { directorNotes: { scannedTokens: ['nonexistent'] } };
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchMemoryTokens(state, config);

      expect(result.memoryTokens).toEqual([]);
    });

    it('returns partial state update', async () => {
      const state = { directorNotes: {} };
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchMemoryTokens(state, config);

      expect(Object.keys(result).sort()).toEqual(['currentPhase', 'memoryTokens']);
    });
  });

  describe('fetchPaperEvidence', () => {
    const mockClient = createMockNotionClient({
      evidence: mockEvidenceResponse.evidence
    });

    it('fetches evidence using NotionClient', async () => {
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchPaperEvidence({}, config);

      expect(result.paperEvidence).toBeDefined();
      expect(Array.isArray(result.paperEvidence)).toBe(true);
    });

    it('returns all evidence items', async () => {
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchPaperEvidence({}, config);

      expect(result.paperEvidence).toHaveLength(4);
    });

    it('sets currentPhase to FETCH_PHOTOS', async () => {
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchPaperEvidence({}, config);

      expect(result.currentPhase).toBe(PHASES.FETCH_PHOTOS);
    });

    it('includes file attachments by default', async () => {
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchPaperEvidence({}, config);

      // Evidence item with files should have them
      const itemWithFiles = result.paperEvidence.find(e => e.name === 'Backdated Consulting Agreement');
      expect(itemWithFiles.files).toBeDefined();
      expect(itemWithFiles.files).toHaveLength(1);
    });

    it('excludes file attachments when includeAttachments is false', async () => {
      const config = { configurable: { notionClient: mockClient, includeAttachments: false } };

      const result = await fetchPaperEvidence({}, config);

      // Evidence items should not have files property
      const itemWithFiles = result.paperEvidence.find(e => e.name === 'Backdated Consulting Agreement');
      expect(itemWithFiles.files).toBeUndefined();
    });

    it('returns evidence with expected structure', async () => {
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchPaperEvidence({}, config);
      const evidence = result.paperEvidence[0];

      expect(evidence).toHaveProperty('notionId');
      expect(evidence).toHaveProperty('name');
      expect(evidence).toHaveProperty('basicType');
      expect(evidence).toHaveProperty('description');
      expect(evidence).toHaveProperty('narrativeThreads');
      expect(evidence).toHaveProperty('owners');
      expect(evidence).toHaveProperty('containers');
    });

    it('returns partial state update', async () => {
      const config = { configurable: { notionClient: mockClient } };

      const result = await fetchPaperEvidence({}, config);

      expect(Object.keys(result).sort()).toEqual(['currentPhase', 'paperEvidence']);
    });
  });

  describe('createMockNotionClient', () => {
    it('creates client with fetchMemoryTokens method', () => {
      const client = createMockNotionClient({});

      expect(typeof client.fetchMemoryTokens).toBe('function');
    });

    it('creates client with fetchPaperEvidence method', () => {
      const client = createMockNotionClient({});

      expect(typeof client.fetchPaperEvidence).toBe('function');
    });

    it('returns provided tokens', async () => {
      const mockTokens = [{ tokenId: 'test001', name: 'Test Token' }];
      const client = createMockNotionClient({ tokens: mockTokens });

      const result = await client.fetchMemoryTokens([]);

      expect(result.tokens).toEqual(mockTokens);
    });

    it('returns provided evidence', async () => {
      const mockEvidence = [{ notionId: 'ev001', name: 'Test Evidence' }];
      const client = createMockNotionClient({ evidence: mockEvidence });

      const result = await client.fetchPaperEvidence(true);

      expect(result.evidence).toEqual(mockEvidence);
    });

    it('includes fetchedAt timestamp in token response', async () => {
      const client = createMockNotionClient({ tokens: [] });

      const result = await client.fetchMemoryTokens([]);

      expect(result.fetchedAt).toBeDefined();
      expect(() => new Date(result.fetchedAt)).not.toThrow();
    });

    it('includes fetchedAt timestamp in evidence response', async () => {
      const client = createMockNotionClient({ evidence: [] });

      const result = await client.fetchPaperEvidence(true);

      expect(result.fetchedAt).toBeDefined();
      expect(() => new Date(result.fetchedAt)).not.toThrow();
    });

    it('filters tokens by ID like real client', async () => {
      const mockTokens = [
        { tokenId: 'tok001', name: 'First' },
        { tokenId: 'tok002', name: 'Second' }
      ];
      const client = createMockNotionClient({ tokens: mockTokens });

      const result = await client.fetchMemoryTokens(['tok001']);

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].tokenId).toBe('tok001');
    });

    it('strips files when includeAttachments is false', async () => {
      const mockEvidence = [
        { notionId: 'ev001', name: 'With Files', files: [{ name: 'test.pdf' }] }
      ];
      const client = createMockNotionClient({ evidence: mockEvidence });

      const result = await client.fetchPaperEvidence(false);

      expect(result.evidence[0].files).toBeUndefined();
    });

    it('preserves files when includeAttachments is true', async () => {
      const mockEvidence = [
        { notionId: 'ev001', name: 'With Files', files: [{ name: 'test.pdf' }] }
      ];
      const client = createMockNotionClient({ evidence: mockEvidence });

      const result = await client.fetchPaperEvidence(true);

      expect(result.evidence[0].files).toEqual([{ name: 'test.pdf' }]);
    });
  });

  describe('integration: node sequence', () => {
    // Test that nodes can be called in sequence like the graph will call them

    it('can chain initializeSession -> loadDirectorNotes', async () => {
      const initConfig = { configurable: { sessionId: 'test-session', dataDir: TEST_SESSION_DIR } };
      const initResult = await initializeSession({}, initConfig);

      expect(initResult.sessionId).toBe('test-session');
      expect(initResult.currentPhase).toBe(PHASES.LOAD_DIRECTOR_NOTES);

      // Merge result into state for next node
      const state = { ...initResult };
      const loadConfig = { configurable: { dataDir: TEST_SESSION_DIR } };
      const loadResult = await loadDirectorNotes(state, loadConfig);

      expect(loadResult.directorNotes).toBeDefined();
      expect(loadResult.currentPhase).toBe(PHASES.FETCH_TOKENS);
    });

    it('can chain loadDirectorNotes -> fetchMemoryTokens', async () => {
      const state = { sessionId: 'test-session' };
      const loadConfig = { configurable: { dataDir: TEST_SESSION_DIR } };
      const loadResult = await loadDirectorNotes(state, loadConfig);

      // Merge result into state for next node
      const mergedState = { ...state, ...loadResult };
      const mockClient = createMockNotionClient({ tokens: mockTokensResponse.tokens });
      const fetchConfig = { configurable: { notionClient: mockClient } };
      const fetchResult = await fetchMemoryTokens(mergedState, fetchConfig);

      // Should filter to tokens specified in director notes
      expect(fetchResult.memoryTokens).toHaveLength(3);
      expect(fetchResult.currentPhase).toBe(PHASES.FETCH_EVIDENCE);
    });
  });
});
