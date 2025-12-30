/**
 * NotionCacheStore - SQLite persistence layer for Notion entities
 *
 * Provides CRUD operations for cached Notion data with:
 * - WAL mode for concurrent read performance
 * - Batch upsert for efficient updates
 * - Entity timestamps for freshness checking
 *
 * Schema:
 * - notion_entities: Stores parsed entity data with last_edited_time
 * - cache_metadata: Stores sync timestamps and schema version
 *
 * Usage:
 *   const store = new NotionCacheStore('./data/.cache/notion-cache.db');
 *   store.upsertEntities([{ notion_id, entity_type, last_edited_time, data_json }]);
 *   const entities = store.getEntitiesByType('memory_token');
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = '1';

class NotionCacheStore {
  /**
   * @param {string} dbPath - Path to SQLite database file
   */
  constructor(dbPath) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.dbPath = dbPath;
    this.db = new Database(dbPath);

    // WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');

    this._ensureSchema();
  }

  /**
   * Create tables if they don't exist
   * @private
   */
  _ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notion_entities (
        notion_id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        last_edited_time TEXT NOT NULL,
        data_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_entity_type
        ON notion_entities(entity_type);

      CREATE INDEX IF NOT EXISTS idx_last_edited
        ON notion_entities(last_edited_time);

      CREATE TABLE IF NOT EXISTS cache_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Set schema version if not exists
    const version = this.getMetadata('schema_version');
    if (!version) {
      this.setMetadata('schema_version', SCHEMA_VERSION);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Entity Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Get a single entity by Notion ID
   * @param {string} notionId - Notion page UUID
   * @returns {Object|null} - Entity with parsed data_json, or null
   */
  getEntity(notionId) {
    const stmt = this.db.prepare(`
      SELECT notion_id, entity_type, last_edited_time, data_json, fetched_at
      FROM notion_entities
      WHERE notion_id = ?
    `);
    const row = stmt.get(notionId);
    if (!row) return null;

    return {
      ...row,
      data: JSON.parse(row.data_json)
    };
  }

  /**
   * Get all entities of a specific type
   * @param {string} entityType - 'memory_token' | 'paper_evidence'
   * @returns {Array<Object>} - Entities with parsed data
   */
  getEntitiesByType(entityType) {
    const stmt = this.db.prepare(`
      SELECT notion_id, entity_type, last_edited_time, data_json, fetched_at
      FROM notion_entities
      WHERE entity_type = ?
    `);
    const rows = stmt.all(entityType);

    return rows.map(row => ({
      ...row,
      data: JSON.parse(row.data_json)
    }));
  }

  /**
   * Get just the IDs and timestamps for freshness checking
   * This is much faster than loading full entity data
   * @param {string} entityType - 'memory_token' | 'paper_evidence'
   * @returns {Array<{notion_id: string, last_edited_time: string}>}
   */
  getEntityTimestamps(entityType) {
    const stmt = this.db.prepare(`
      SELECT notion_id, last_edited_time
      FROM notion_entities
      WHERE entity_type = ?
    `);
    return stmt.all(entityType);
  }

  /**
   * Upsert a single entity
   * @param {Object} entity
   * @param {string} entity.notion_id
   * @param {string} entity.entity_type
   * @param {string} entity.last_edited_time
   * @param {Object|string} entity.data - Will be JSON stringified if object
   * @param {string} [entity.fetched_at] - Defaults to now
   */
  upsertEntity(entity) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO notion_entities
        (notion_id, entity_type, last_edited_time, data_json, fetched_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const dataJson = typeof entity.data === 'string'
      ? entity.data
      : JSON.stringify(entity.data);

    stmt.run(
      entity.notion_id,
      entity.entity_type,
      entity.last_edited_time,
      dataJson,
      entity.fetched_at || new Date().toISOString()
    );
  }

  /**
   * Batch upsert entities (much faster than individual upserts)
   * @param {Array<Object>} entities - Array of entity objects
   */
  upsertEntities(entities) {
    if (!entities || entities.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO notion_entities
        (notion_id, entity_type, last_edited_time, data_json, fetched_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items) => {
      for (const entity of items) {
        const dataJson = typeof entity.data === 'string'
          ? entity.data
          : JSON.stringify(entity.data);

        stmt.run(
          entity.notion_id,
          entity.entity_type,
          entity.last_edited_time,
          dataJson,
          entity.fetched_at || new Date().toISOString()
        );
      }
    });

    insertMany(entities);
  }

  /**
   * Delete a single entity
   * @param {string} notionId
   */
  deleteEntity(notionId) {
    const stmt = this.db.prepare(`
      DELETE FROM notion_entities WHERE notion_id = ?
    `);
    stmt.run(notionId);
  }

  /**
   * Delete entities that are no longer in Notion
   * @param {string} entityType - 'memory_token' | 'paper_evidence'
   * @param {Array<string>} activeIds - IDs that still exist in Notion
   * @returns {number} - Number of deleted entities
   */
  deleteStaleEntities(entityType, activeIds) {
    if (!activeIds || activeIds.length === 0) {
      // If no active IDs, delete all of this type
      const stmt = this.db.prepare(`
        DELETE FROM notion_entities WHERE entity_type = ?
      `);
      const result = stmt.run(entityType);
      return result.changes;
    }

    // Delete entities not in the active list
    const placeholders = activeIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      DELETE FROM notion_entities
      WHERE entity_type = ? AND notion_id NOT IN (${placeholders})
    `);
    const result = stmt.run(entityType, ...activeIds);
    return result.changes;
  }

  /**
   * Get count of entities by type
   * @param {string} entityType
   * @returns {number}
   */
  getEntityCount(entityType) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM notion_entities WHERE entity_type = ?
    `);
    return stmt.get(entityType).count;
  }

  // ─────────────────────────────────────────────────────────────
  // Metadata Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Get metadata value
   * @param {string} key
   * @returns {string|null}
   */
  getMetadata(key) {
    const stmt = this.db.prepare(`
      SELECT value FROM cache_metadata WHERE key = ?
    `);
    const row = stmt.get(key);
    return row ? row.value : null;
  }

  /**
   * Set metadata value
   * @param {string} key
   * @param {string} value
   */
  setMetadata(key, value) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache_metadata (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(key, value);
  }

  // ─────────────────────────────────────────────────────────────
  // Lifecycle & Stats
  // ─────────────────────────────────────────────────────────────

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const tokenCount = this.getEntityCount('memory_token');
    const evidenceCount = this.getEntityCount('paper_evidence');
    const schemaVersion = this.getMetadata('schema_version');
    const lastTokenSync = this.getMetadata('tokens_last_sync');
    const lastEvidenceSync = this.getMetadata('evidence_last_sync');

    return {
      tokenCount,
      evidenceCount,
      totalEntities: tokenCount + evidenceCount,
      schemaVersion,
      lastTokenSync,
      lastEvidenceSync,
      dbPath: this.dbPath
    };
  }

  /**
   * Clear all cached data (keeps schema)
   */
  clear() {
    this.db.exec(`
      DELETE FROM notion_entities;
      DELETE FROM cache_metadata WHERE key != 'schema_version';
    `);
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = {
  NotionCacheStore,
  SCHEMA_VERSION
};

// Self-test when run directly
if (require.main === module) {
  const os = require('os');
  const testDbPath = path.join(os.tmpdir(), 'notion-cache-test.db');

  console.log('NotionCacheStore Self-Test\n');
  console.log(`Test DB path: ${testDbPath}\n`);

  try {
    // Create store
    const store = new NotionCacheStore(testDbPath);
    console.log('Created store successfully');

    // Test upsert
    store.upsertEntity({
      notion_id: 'test-123',
      entity_type: 'memory_token',
      last_edited_time: '2025-01-01T00:00:00.000Z',
      data: { tokenId: 'alr001', name: 'Test Token' }
    });
    console.log('Upserted single entity');

    // Test batch upsert
    store.upsertEntities([
      {
        notion_id: 'test-456',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-02T00:00:00.000Z',
        data: { tokenId: 'jam001', name: 'Another Token' }
      },
      {
        notion_id: 'test-789',
        entity_type: 'paper_evidence',
        last_edited_time: '2025-01-03T00:00:00.000Z',
        data: { name: 'Test Evidence' }
      }
    ]);
    console.log('Batch upserted 2 entities');

    // Test retrieval
    const entity = store.getEntity('test-123');
    console.log(`Retrieved entity: ${entity?.data?.name}`);

    // Test getEntitiesByType
    const tokens = store.getEntitiesByType('memory_token');
    console.log(`Memory tokens: ${tokens.length}`);

    // Test timestamps
    const timestamps = store.getEntityTimestamps('memory_token');
    console.log(`Token timestamps: ${timestamps.length}`);

    // Test stats
    const stats = store.getStats();
    console.log(`Stats:`, stats);

    // Test stale deletion
    const deleted = store.deleteStaleEntities('memory_token', ['test-123']);
    console.log(`Deleted stale entities: ${deleted}`);

    // Cleanup
    store.close();
    fs.unlinkSync(testDbPath);
    // Remove WAL and SHM files if they exist
    try { fs.unlinkSync(testDbPath + '-wal'); } catch { }
    try { fs.unlinkSync(testDbPath + '-shm'); } catch { }

    console.log('\nSelf-test passed!');
  } catch (error) {
    console.error('Self-test failed:', error.message);
    process.exit(1);
  }
}
