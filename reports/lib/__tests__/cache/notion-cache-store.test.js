/**
 * Tests for NotionCacheStore - SQLite persistence layer
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { NotionCacheStore, SCHEMA_VERSION } = require('../../cache/notion-cache-store');

describe('NotionCacheStore', () => {
  let store;
  let testDbPath;

  beforeEach(() => {
    // Create unique test database for each test
    testDbPath = path.join(os.tmpdir(), `notion-cache-test-${Date.now()}.db`);
    store = new NotionCacheStore(testDbPath);
  });

  afterEach(() => {
    store.close();
    // Cleanup test database files
    try { fs.unlinkSync(testDbPath); } catch { }
    try { fs.unlinkSync(testDbPath + '-wal'); } catch { }
    try { fs.unlinkSync(testDbPath + '-shm'); } catch { }
  });

  describe('constructor', () => {
    it('should create database file', () => {
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should set schema version', () => {
      expect(store.getMetadata('schema_version')).toBe(SCHEMA_VERSION);
    });

    it('should create directories if needed', () => {
      const nestedPath = path.join(os.tmpdir(), 'nested', 'cache', `test-${Date.now()}.db`);
      const nestedStore = new NotionCacheStore(nestedPath);
      expect(fs.existsSync(nestedPath)).toBe(true);
      nestedStore.close();
      // Cleanup
      try { fs.unlinkSync(nestedPath); } catch { }
      try { fs.rmdirSync(path.dirname(nestedPath)); } catch { }
      try { fs.rmdirSync(path.dirname(path.dirname(nestedPath))); } catch { }
    });
  });

  describe('upsertEntity / getEntity', () => {
    it('should store and retrieve entity', () => {
      store.upsertEntity({
        notion_id: 'test-123',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T12:00:00.000Z',
        data: { tokenId: 'alr001', name: 'Test Token' }
      });

      const entity = store.getEntity('test-123');
      expect(entity).not.toBeNull();
      expect(entity.notion_id).toBe('test-123');
      expect(entity.entity_type).toBe('memory_token');
      expect(entity.data.tokenId).toBe('alr001');
      expect(entity.data.name).toBe('Test Token');
    });

    it('should update existing entity', () => {
      store.upsertEntity({
        notion_id: 'test-123',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T12:00:00.000Z',
        data: { name: 'Original' }
      });

      store.upsertEntity({
        notion_id: 'test-123',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-02T12:00:00.000Z',
        data: { name: 'Updated' }
      });

      const entity = store.getEntity('test-123');
      expect(entity.data.name).toBe('Updated');
      expect(entity.last_edited_time).toBe('2025-01-02T12:00:00.000Z');
    });

    it('should return null for non-existent entity', () => {
      expect(store.getEntity('non-existent')).toBeNull();
    });

    it('should handle string data_json', () => {
      store.upsertEntity({
        notion_id: 'test-123',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T12:00:00.000Z',
        data: '{"name":"String Data"}'
      });

      const entity = store.getEntity('test-123');
      expect(entity.data.name).toBe('String Data');
    });
  });

  describe('upsertEntities (batch)', () => {
    it('should batch insert multiple entities', () => {
      store.upsertEntities([
        {
          notion_id: 'test-1',
          entity_type: 'memory_token',
          last_edited_time: '2025-01-01T12:00:00.000Z',
          data: { name: 'Token 1' }
        },
        {
          notion_id: 'test-2',
          entity_type: 'memory_token',
          last_edited_time: '2025-01-01T12:00:00.000Z',
          data: { name: 'Token 2' }
        },
        {
          notion_id: 'test-3',
          entity_type: 'paper_evidence',
          last_edited_time: '2025-01-01T12:00:00.000Z',
          data: { name: 'Evidence 1' }
        }
      ]);

      expect(store.getEntityCount('memory_token')).toBe(2);
      expect(store.getEntityCount('paper_evidence')).toBe(1);
    });

    it('should handle empty array', () => {
      expect(() => store.upsertEntities([])).not.toThrow();
    });
  });

  describe('getEntitiesByType', () => {
    beforeEach(() => {
      store.upsertEntities([
        { notion_id: 't1', entity_type: 'memory_token', last_edited_time: '2025-01-01T00:00:00Z', data: { name: 'T1' } },
        { notion_id: 't2', entity_type: 'memory_token', last_edited_time: '2025-01-01T00:00:00Z', data: { name: 'T2' } },
        { notion_id: 'e1', entity_type: 'paper_evidence', last_edited_time: '2025-01-01T00:00:00Z', data: { name: 'E1' } }
      ]);
    });

    it('should return only entities of specified type', () => {
      const tokens = store.getEntitiesByType('memory_token');
      expect(tokens.length).toBe(2);
      expect(tokens.every(t => t.entity_type === 'memory_token')).toBe(true);
    });

    it('should parse data_json for each entity', () => {
      const tokens = store.getEntitiesByType('memory_token');
      expect(tokens[0].data.name).toBeDefined();
    });

    it('should return empty array for no matches', () => {
      const empty = store.getEntitiesByType('non_existent_type');
      expect(empty).toEqual([]);
    });
  });

  describe('getEntityTimestamps', () => {
    beforeEach(() => {
      store.upsertEntities([
        { notion_id: 't1', entity_type: 'memory_token', last_edited_time: '2025-01-01T10:00:00Z', data: {} },
        { notion_id: 't2', entity_type: 'memory_token', last_edited_time: '2025-01-01T12:00:00Z', data: {} }
      ]);
    });

    it('should return only id and timestamp', () => {
      const timestamps = store.getEntityTimestamps('memory_token');
      expect(timestamps.length).toBe(2);
      expect(timestamps[0]).toHaveProperty('notion_id');
      expect(timestamps[0]).toHaveProperty('last_edited_time');
      expect(timestamps[0]).not.toHaveProperty('data_json');
    });
  });

  describe('deleteEntity', () => {
    it('should delete single entity', () => {
      store.upsertEntity({
        notion_id: 'to-delete',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T00:00:00Z',
        data: {}
      });

      expect(store.getEntity('to-delete')).not.toBeNull();
      store.deleteEntity('to-delete');
      expect(store.getEntity('to-delete')).toBeNull();
    });
  });

  describe('deleteStaleEntities', () => {
    beforeEach(() => {
      store.upsertEntities([
        { notion_id: 'keep-1', entity_type: 'memory_token', last_edited_time: '2025-01-01T00:00:00Z', data: {} },
        { notion_id: 'keep-2', entity_type: 'memory_token', last_edited_time: '2025-01-01T00:00:00Z', data: {} },
        { notion_id: 'delete-1', entity_type: 'memory_token', last_edited_time: '2025-01-01T00:00:00Z', data: {} },
        { notion_id: 'evidence-1', entity_type: 'paper_evidence', last_edited_time: '2025-01-01T00:00:00Z', data: {} }
      ]);
    });

    it('should delete entities not in active list', () => {
      const deleted = store.deleteStaleEntities('memory_token', ['keep-1', 'keep-2']);
      expect(deleted).toBe(1);
      expect(store.getEntity('keep-1')).not.toBeNull();
      expect(store.getEntity('keep-2')).not.toBeNull();
      expect(store.getEntity('delete-1')).toBeNull();
    });

    it('should not affect other entity types', () => {
      store.deleteStaleEntities('memory_token', ['keep-1']);
      expect(store.getEntity('evidence-1')).not.toBeNull();
    });

    it('should delete all if empty active list', () => {
      const deleted = store.deleteStaleEntities('memory_token', []);
      expect(deleted).toBe(3);
      expect(store.getEntityCount('memory_token')).toBe(0);
    });
  });

  describe('metadata operations', () => {
    it('should get and set metadata', () => {
      store.setMetadata('test_key', 'test_value');
      expect(store.getMetadata('test_key')).toBe('test_value');
    });

    it('should update existing metadata', () => {
      store.setMetadata('key', 'value1');
      store.setMetadata('key', 'value2');
      expect(store.getMetadata('key')).toBe('value2');
    });

    it('should return null for missing metadata', () => {
      expect(store.getMetadata('non_existent')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      store.upsertEntities([
        { notion_id: 't1', entity_type: 'memory_token', last_edited_time: '2025-01-01T00:00:00Z', data: {} },
        { notion_id: 'e1', entity_type: 'paper_evidence', last_edited_time: '2025-01-01T00:00:00Z', data: {} }
      ]);

      const stats = store.getStats();
      expect(stats.tokenCount).toBe(1);
      expect(stats.evidenceCount).toBe(1);
      expect(stats.totalEntities).toBe(2);
      expect(stats.schemaVersion).toBe(SCHEMA_VERSION);
    });
  });

  describe('clear', () => {
    it('should delete all entities', () => {
      store.upsertEntities([
        { notion_id: 't1', entity_type: 'memory_token', last_edited_time: '2025-01-01T00:00:00Z', data: {} },
        { notion_id: 'e1', entity_type: 'paper_evidence', last_edited_time: '2025-01-01T00:00:00Z', data: {} }
      ]);
      store.setMetadata('test_key', 'value');

      store.clear();

      expect(store.getEntityCount('memory_token')).toBe(0);
      expect(store.getEntityCount('paper_evidence')).toBe(0);
      expect(store.getMetadata('test_key')).toBeNull();
      // Schema version should be preserved
      expect(store.getMetadata('schema_version')).toBe(SCHEMA_VERSION);
    });
  });
});
