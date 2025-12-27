/**
 * Tests for FreshnessChecker - Timestamp comparison logic
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { NotionCacheStore } = require('../../cache/notion-cache-store');
const { FreshnessChecker } = require('../../cache/freshness-checker');

describe('FreshnessChecker', () => {
  let store;
  let checker;
  let testDbPath;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `freshness-test-${Date.now()}.db`);
    store = new NotionCacheStore(testDbPath);
    checker = new FreshnessChecker(store);
  });

  afterEach(() => {
    store.close();
    try { fs.unlinkSync(testDbPath); } catch { }
    try { fs.unlinkSync(testDbPath + '-wal'); } catch { }
    try { fs.unlinkSync(testDbPath + '-shm'); } catch { }
  });

  describe('checkFreshness', () => {
    it('should identify fresh entities (same timestamp)', () => {
      store.upsertEntity({
        notion_id: 'fresh-1',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T12:00:00.000Z',
        data: {}
      });

      const result = checker.checkFreshness('memory_token', [
        { id: 'fresh-1', last_edited_time: '2025-01-01T12:00:00.000Z' }
      ]);

      expect(result.fresh).toEqual(['fresh-1']);
      expect(result.stale).toEqual([]);
      expect(result.new).toEqual([]);
      expect(result.deleted).toEqual([]);
    });

    it('should identify stale entities (Notion newer)', () => {
      store.upsertEntity({
        notion_id: 'stale-1',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T10:00:00.000Z', // Older
        data: {}
      });

      const result = checker.checkFreshness('memory_token', [
        { id: 'stale-1', last_edited_time: '2025-01-01T14:00:00.000Z' } // Newer
      ]);

      expect(result.fresh).toEqual([]);
      expect(result.stale).toEqual(['stale-1']);
    });

    it('should identify new entities (not in cache)', () => {
      const result = checker.checkFreshness('memory_token', [
        { id: 'new-1', last_edited_time: '2025-01-01T12:00:00.000Z' }
      ]);

      expect(result.fresh).toEqual([]);
      expect(result.stale).toEqual([]);
      expect(result.new).toEqual(['new-1']);
    });

    it('should identify deleted entities (in cache but not Notion)', () => {
      store.upsertEntity({
        notion_id: 'deleted-1',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T12:00:00.000Z',
        data: {}
      });

      const result = checker.checkFreshness('memory_token', []);

      expect(result.deleted).toEqual(['deleted-1']);
    });

    it('should handle mixed scenarios', () => {
      store.upsertEntities([
        { notion_id: 'fresh-1', entity_type: 'memory_token', last_edited_time: '2025-01-01T12:00:00.000Z', data: {} },
        { notion_id: 'stale-1', entity_type: 'memory_token', last_edited_time: '2025-01-01T10:00:00.000Z', data: {} },
        { notion_id: 'deleted-1', entity_type: 'memory_token', last_edited_time: '2025-01-01T08:00:00.000Z', data: {} }
      ]);

      const result = checker.checkFreshness('memory_token', [
        { id: 'fresh-1', last_edited_time: '2025-01-01T12:00:00.000Z' },
        { id: 'stale-1', last_edited_time: '2025-01-01T14:00:00.000Z' },
        { id: 'new-1', last_edited_time: '2025-01-01T15:00:00.000Z' }
      ]);

      expect(result.fresh).toEqual(['fresh-1']);
      expect(result.stale).toEqual(['stale-1']);
      expect(result.new).toEqual(['new-1']);
      expect(result.deleted).toEqual(['deleted-1']);
    });

    it('should only check entities of specified type', () => {
      store.upsertEntities([
        { notion_id: 'token-1', entity_type: 'memory_token', last_edited_time: '2025-01-01T12:00:00.000Z', data: {} },
        { notion_id: 'evidence-1', entity_type: 'paper_evidence', last_edited_time: '2025-01-01T12:00:00.000Z', data: {} }
      ]);

      const result = checker.checkFreshness('memory_token', [
        { id: 'token-1', last_edited_time: '2025-01-01T12:00:00.000Z' }
      ]);

      // evidence-1 should not appear in deleted because we're checking memory_token type
      expect(result.deleted).toEqual([]);
      expect(result.fresh).toEqual(['token-1']);
    });
  });

  describe('getSummary', () => {
    it('should return summary statistics', () => {
      store.upsertEntities([
        { notion_id: 'fresh-1', entity_type: 'memory_token', last_edited_time: '2025-01-01T12:00:00.000Z', data: {} },
        { notion_id: 'fresh-2', entity_type: 'memory_token', last_edited_time: '2025-01-01T12:00:00.000Z', data: {} },
        { notion_id: 'stale-1', entity_type: 'memory_token', last_edited_time: '2025-01-01T10:00:00.000Z', data: {} }
      ]);

      const summary = checker.getSummary('memory_token', [
        { id: 'fresh-1', last_edited_time: '2025-01-01T12:00:00.000Z' },
        { id: 'fresh-2', last_edited_time: '2025-01-01T12:00:00.000Z' },
        { id: 'stale-1', last_edited_time: '2025-01-01T14:00:00.000Z' },
        { id: 'new-1', last_edited_time: '2025-01-01T15:00:00.000Z' }
      ]);

      expect(summary.total).toBe(4);
      expect(summary.fresh).toBe(2);
      expect(summary.stale).toBe(1);
      expect(summary.new).toBe(1);
      expect(summary.deleted).toBe(0);
      expect(summary.cacheHitRate).toBe(50); // 2/4 = 50%
      expect(summary.needsRefresh).toBe(2); // stale + new
    });

    it('should handle empty results', () => {
      const summary = checker.getSummary('memory_token', []);

      expect(summary.total).toBe(0);
      expect(summary.cacheHitRate).toBe(0);
    });
  });

  describe('timestamp comparison edge cases', () => {
    it('should handle timestamps with different precision', () => {
      store.upsertEntity({
        notion_id: 'test-1',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T12:00:00.000Z', // With milliseconds
        data: {}
      });

      const result = checker.checkFreshness('memory_token', [
        { id: 'test-1', last_edited_time: '2025-01-01T12:00:00Z' } // Without milliseconds
      ]);

      expect(result.fresh).toEqual(['test-1']);
    });

    it('should detect one-second difference as stale', () => {
      store.upsertEntity({
        notion_id: 'test-1',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T12:00:00.000Z',
        data: {}
      });

      const result = checker.checkFreshness('memory_token', [
        { id: 'test-1', last_edited_time: '2025-01-01T12:00:01.000Z' } // 1 second later
      ]);

      expect(result.stale).toEqual(['test-1']);
    });
  });
});
