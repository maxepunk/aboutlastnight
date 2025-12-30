/**
 * FreshnessChecker - Determines which entities need refresh from Notion
 *
 * Compares Notion's last_edited_time with cached timestamps to categorize
 * entities into: stale (needs refresh), fresh (use cache), new (fetch full),
 * and deleted (remove from cache).
 *
 * Usage:
 *   const checker = new FreshnessChecker(cacheStore);
 *   const { stale, fresh, new: newIds, deleted } = checker.checkFreshness(
 *     'memory_token',
 *     [{ id: 'abc', last_edited_time: '2025-01-01T00:00:00.000Z' }, ...]
 *   );
 */

class FreshnessChecker {
  /**
   * @param {Object} cacheStore - NotionCacheStore instance
   */
  constructor(cacheStore) {
    this.cacheStore = cacheStore;
  }

  /**
   * Check freshness of entities against Notion timestamps
   *
   * @param {string} entityType - 'memory_token' | 'paper_evidence'
   * @param {Array<{id: string, last_edited_time: string}>} notionTimestamps
   *   - Light fetch results from Notion API
   * @returns {{
   *   stale: string[],    - IDs where cache is older than Notion
   *   fresh: string[],    - IDs where cache matches Notion
   *   new: string[],      - IDs not in cache (new in Notion)
   *   deleted: string[]   - IDs in cache but not in Notion (deleted)
   * }}
   */
  checkFreshness(entityType, notionTimestamps) {
    // Get cached timestamps (fast - only ID + timestamp, no data)
    const cachedTimestamps = this.cacheStore.getEntityTimestamps(entityType);

    // Build lookup maps
    const cachedMap = new Map(
      cachedTimestamps.map(e => [e.notion_id, e.last_edited_time])
    );
    const notionMap = new Map(
      notionTimestamps.map(e => [e.id, e.last_edited_time])
    );

    const stale = [];
    const fresh = [];
    const newEntities = [];
    const deleted = [];

    // Check each Notion entity against cache
    for (const [id, notionTime] of notionMap) {
      const cachedTime = cachedMap.get(id);

      if (!cachedTime) {
        // Entity not in cache - needs full fetch
        newEntities.push(id);
      } else if (this._isNewer(notionTime, cachedTime)) {
        // Notion is newer - cache is stale
        stale.push(id);
      } else {
        // Cache is current
        fresh.push(id);
      }
    }

    // Check for entities in cache but not in Notion (deleted)
    for (const id of cachedMap.keys()) {
      if (!notionMap.has(id)) {
        deleted.push(id);
      }
    }

    return { stale, fresh, new: newEntities, deleted };
  }

  /**
   * Compare ISO 8601 timestamps
   * @param {string} notionTime - Timestamp from Notion API
   * @param {string} cachedTime - Timestamp stored in cache
   * @returns {boolean} - True if Notion is newer than cache
   * @private
   */
  _isNewer(notionTime, cachedTime) {
    // ISO 8601 strings can be compared lexicographically
    // But we'll use Date parsing for safety
    const notionDate = new Date(notionTime);
    const cachedDate = new Date(cachedTime);
    return notionDate > cachedDate;
  }

  /**
   * Get summary statistics for a freshness check
   * @param {string} entityType
   * @param {Array<{id: string, last_edited_time: string}>} notionTimestamps
   * @returns {Object} - Summary with counts and percentages
   */
  getSummary(entityType, notionTimestamps) {
    const result = this.checkFreshness(entityType, notionTimestamps);
    const total = notionTimestamps.length;

    return {
      total,
      stale: result.stale.length,
      fresh: result.fresh.length,
      new: result.new.length,
      deleted: result.deleted.length,
      cacheHitRate: total > 0
        ? Math.round((result.fresh.length / total) * 100)
        : 0,
      needsRefresh: result.stale.length + result.new.length
    };
  }
}

module.exports = {
  FreshnessChecker
};

// Self-test when run directly
if (require.main === module) {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const { NotionCacheStore } = require('./notion-cache-store');

  const testDbPath = path.join(os.tmpdir(), 'freshness-test.db');

  console.log('FreshnessChecker Self-Test\n');

  try {
    // Create test store with some cached data
    const store = new NotionCacheStore(testDbPath);

    // Seed cache with test data
    store.upsertEntities([
      {
        notion_id: 'fresh-1',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T12:00:00.000Z',
        data: { name: 'Fresh Token' }
      },
      {
        notion_id: 'stale-1',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T10:00:00.000Z', // Older than Notion
        data: { name: 'Stale Token' }
      },
      {
        notion_id: 'deleted-1',
        entity_type: 'memory_token',
        last_edited_time: '2025-01-01T08:00:00.000Z',
        data: { name: 'Deleted Token' }
      }
    ]);
    console.log('Seeded cache with 3 tokens (fresh, stale, deleted)');

    // Simulate Notion response
    const notionTimestamps = [
      { id: 'fresh-1', last_edited_time: '2025-01-01T12:00:00.000Z' }, // Same
      { id: 'stale-1', last_edited_time: '2025-01-01T14:00:00.000Z' }, // Newer
      { id: 'new-1', last_edited_time: '2025-01-01T15:00:00.000Z' }    // New
      // deleted-1 is NOT in Notion response
    ];
    console.log('Notion has: fresh-1 (same), stale-1 (newer), new-1 (new)');
    console.log('Notion missing: deleted-1\n');

    // Run freshness check
    const checker = new FreshnessChecker(store);
    const result = checker.checkFreshness('memory_token', notionTimestamps);

    console.log('Freshness Check Results:');
    console.log(`  Fresh (cache valid): ${JSON.stringify(result.fresh)}`);
    console.log(`  Stale (needs refresh): ${JSON.stringify(result.stale)}`);
    console.log(`  New (not in cache): ${JSON.stringify(result.new)}`);
    console.log(`  Deleted (remove from cache): ${JSON.stringify(result.deleted)}`);

    // Verify results
    const passed =
      result.fresh.length === 1 && result.fresh[0] === 'fresh-1' &&
      result.stale.length === 1 && result.stale[0] === 'stale-1' &&
      result.new.length === 1 && result.new[0] === 'new-1' &&
      result.deleted.length === 1 && result.deleted[0] === 'deleted-1';

    // Get summary
    const summary = checker.getSummary('memory_token', notionTimestamps);
    console.log('\nSummary:', summary);

    // Cleanup
    store.close();
    fs.unlinkSync(testDbPath);
    try { fs.unlinkSync(testDbPath + '-wal'); } catch { }
    try { fs.unlinkSync(testDbPath + '-shm'); } catch { }

    if (passed) {
      console.log('\nSelf-test passed!');
    } else {
      console.error('\nSelf-test FAILED - unexpected results');
      process.exit(1);
    }
  } catch (error) {
    console.error('Self-test failed:', error.message);
    process.exit(1);
  }
}
