/**
 * CachedNotionClient - Decorator that adds caching to NotionClient
 *
 * Wraps NotionClient without modifying it, providing:
 * - Two-phase fetch (light timestamps → selective full fetch)
 * - SQLite persistence via NotionCacheStore
 * - Graceful fallback on cache errors
 *
 * Usage:
 *   const client = createCachedNotionClient();
 *   const { tokens } = await client.fetchMemoryTokens(['alr001']);
 *
 * The singleton pattern ensures all sessions share the same cache.
 */

const path = require('path');
const { NotionClient, createNotionClient, ELEMENTS_DB_ID } = require('../notion-client');
const { NotionCacheStore } = require('./notion-cache-store');
const { FreshnessChecker } = require('./freshness-checker');
const { parseTokenPage, parseEvidencePage } = require('../notion/parse');
const { applyRelationNames } = require('../notion/relations');
const { RELATION_REGISTRY, ENTITY_RELATIONS, CHARACTERS_DB_ID, TOKEN_FILTER, EVIDENCE_FILTER } = require('../notion/databases');

// Default cache location
const DEFAULT_CACHE_PATH = path.join(__dirname, '..', '..', 'data', '.cache', 'notion-cache.db');

class CachedNotionClient {
  /**
   * @param {Object} options
   * @param {Object} [options.notionClient] - Existing NotionClient (for testing)
   * @param {Object} [options.cacheStore] - Existing NotionCacheStore (for testing)
   * @param {string} [options.dbPath] - Path to SQLite database
   * @param {boolean} [options.enabled=true] - Enable/disable caching
   */
  constructor(options = {}) {
    this.notionClient = options.notionClient || createNotionClient();
    this.cacheStore = options.cacheStore || new NotionCacheStore(
      options.dbPath || DEFAULT_CACHE_PATH
    );
    this.freshnessChecker = new FreshnessChecker(this.cacheStore);
    this.enabled = options.enabled !== false;

    // Expose the underlying request method for light fetches
    this._request = this.notionClient.request.bind(this.notionClient);
  }

  // ─────────────────────────────────────────────────────────────
  // Main API Methods (same interface as NotionClient)
  // ─────────────────────────────────────────────────────────────

  /**
   * Fetch memory tokens with caching
   * Same signature as NotionClient.fetchMemoryTokens
   *
   * @param {string[]} [tokenIds] - Optional list of token IDs to filter by
   * @returns {Promise<Object>} - { tokens, fetchedAt, totalCount, cacheStats? }
   */
  async fetchMemoryTokens(tokenIds = null) {
    if (!this.enabled) {
      return this.notionClient.fetchMemoryTokens(tokenIds);
    }

    try {
      return await this._fetchWithCache(
        'memory_token',
        TOKEN_FILTER,
        (items, ids) => this._applyTokenFilter(items, ids),
        tokenIds
      );
    } catch (error) {
      console.warn('[CachedNotionClient] Cache error, falling back:', error.message);
      return this.notionClient.fetchMemoryTokens(tokenIds);
    }
  }

  /**
   * Fetch paper evidence with caching
   * Same signature as NotionClient.fetchPaperEvidence
   *
   * @param {boolean} [includeFiles=true] - Whether to include file attachment URLs
   * @returns {Promise<Object>} - { evidence, fetchedAt, totalCount, cacheStats? }
   */
  async fetchPaperEvidence(includeFiles = true) {
    if (!this.enabled) {
      return this.notionClient.fetchPaperEvidence(includeFiles);
    }

    try {
      const result = await this._fetchWithCache(
        'paper_evidence',
        EVIDENCE_FILTER,
        null, // No post-filter needed
        null
      );

      // Strip files if not requested (matches NotionClient behavior)
      if (!includeFiles) {
        result.evidence = result.evidence.map(e => {
          const { files, ...rest } = e;
          return rest;
        });
      }

      return result;
    } catch (error) {
      console.warn('[CachedNotionClient] Cache error, falling back:', error.message);
      return this.notionClient.fetchPaperEvidence(includeFiles);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Core Caching Logic
  // ─────────────────────────────────────────────────────────────

  /**
   * Generic cached fetch implementation
   * @private
   */
  async _fetchWithCache(entityType, filter, postFilter, filterArg) {
    const startTime = Date.now();

    // 1. Light fetch: Get timestamps from Notion
    const notionTimestamps = await this._fetchTimestamps(filter);
    console.log(`[Cache:${entityType}] Notion has ${notionTimestamps.length} entities`);

    // 2. Check freshness against cache
    const freshness = this.freshnessChecker.checkFreshness(entityType, notionTimestamps);
    console.log(`[Cache:${entityType}] Fresh: ${freshness.fresh.length}, Stale: ${freshness.stale.length}, New: ${freshness.new.length}, Deleted: ${freshness.deleted.length}`);

    // 3. Get fresh entities from cache
    const cachedEntities = freshness.fresh.map(id => {
      const cached = this.cacheStore.getEntity(id);
      return cached ? cached.data : null;
    }).filter(Boolean);

    // 4. Fetch stale + new entities from Notion (full data)
    const idsToFetch = [...freshness.stale, ...freshness.new];
    let refreshedEntities = [];

    if (idsToFetch.length > 0) {
      console.log(`[Cache:${entityType}] Fetching ${idsToFetch.length} entities from Notion`);
      refreshedEntities = await this._fetchFullEntities(entityType, filter, idsToFetch);

      // Update cache with refreshed entities
      const timestampMap = new Map(notionTimestamps.map(t => [t.id, t.last_edited_time]));
      const toUpsert = refreshedEntities.map(entity => ({
        notion_id: entity.notionId,
        entity_type: entityType,
        last_edited_time: timestampMap.get(entity.notionId) || new Date().toISOString(),
        data: entity
      }));
      this.cacheStore.upsertEntities(toUpsert);
    }

    // 5. Delete entities no longer in Notion
    if (freshness.deleted.length > 0) {
      const activeIds = notionTimestamps.map(t => t.id);
      this.cacheStore.deleteStaleEntities(entityType, activeIds);
    }

    // 6. Merge results
    let allEntities = [...cachedEntities, ...refreshedEntities];

    // Resolve relation names via the freshness-checked name table (read-time join).
    allEntities = applyRelationNames(allEntities, entityType, await this._ensureNameTable(entityType));

    // 7. Apply post-filter if provided (e.g., tokenIds filter)
    if (postFilter && filterArg) {
      allEntities = postFilter(allEntities, filterArg);
    }

    // 8. Update sync metadata
    this.cacheStore.setMetadata(`${entityType}_last_sync`, new Date().toISOString());

    const elapsed = Date.now() - startTime;
    const cacheStats = {
      fromCache: cachedEntities.length,
      refreshed: refreshedEntities.length,
      deleted: freshness.deleted.length,
      elapsedMs: elapsed
    };

    console.log(`[Cache:${entityType}] Complete in ${elapsed}ms - ${cacheStats.fromCache} cached, ${cacheStats.refreshed} refreshed`);

    // Return in expected format
    const resultKey = entityType === 'memory_token' ? 'tokens' : 'evidence';
    return {
      [resultKey]: allEntities,
      fetchedAt: new Date().toISOString(),
      totalCount: allEntities.length,
      cacheStats
    };
  }

  /**
   * Light fetch: Get just IDs and timestamps from Notion
   * @private
   */
  async _fetchTimestamps(filter) {
    const timestamps = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
      const body = { page_size: 100, filter };
      if (startCursor) body.start_cursor = startCursor;

      const data = await this._request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);

      for (const page of data.results) {
        timestamps.push({
          id: page.id,
          last_edited_time: page.last_edited_time
        });
      }

      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    return timestamps;
  }

  /**
   * Full fetch: Get complete data for specific entity IDs
   * @private
   */
  async _fetchFullEntities(entityType, filter, targetIds) {
    const targetSet = new Set(targetIds);
    const entities = [];
    let hasMore = true, startCursor = undefined;
    while (hasMore) {
      const body = { page_size: 100, filter };
      if (startCursor) body.start_cursor = startCursor;
      const data = await this._request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);
      for (const page of data.results) {
        if (!targetSet.has(page.id)) continue;
        const parsed = entityType === 'memory_token'
          ? parseTokenPage(page)
          : parseEvidencePage(page, { includeFiles: true });
        if (parsed) entities.push(parsed);
      }
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    return entities; // blobs carry ownerIds; names resolved at read time
  }

  /**
   * Ensure the cached name tables for entityType's registered relations are fresh,
   * and return { [targetDb]: { [pageId]: Name } } for the read-time join.
   * The Characters table is freshness-checked against the Characters DB, so a
   * character rename invalidates only its name row — element cache untouched.
   * @private
   */
  async _ensureNameTable(entityType) {
    const relNames = ENTITY_RELATIONS[entityType] || [];
    const targets = [...new Set(relNames.map(n => ({ db: RELATION_REGISTRY[n].targetDb, type: RELATION_REGISTRY[n].cacheType })).map(t => JSON.stringify(t)))].map(s => JSON.parse(s));
    const maps = {};
    for (const { db, type } of targets) {
      // Light fetch: ids + timestamps from the target DB.
      const notionTs = [];
      let hasMore = true, cursor = undefined;
      while (hasMore) {
        const body = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        const data = await this._request(`databases/${db}/query`, 'POST', body);
        for (const p of data.results) notionTs.push({ id: p.id, last_edited_time: p.last_edited_time });
        hasMore = data.has_more; cursor = data.next_cursor;
      }
      const fresh = this.freshnessChecker.checkFreshness(type, notionTs);
      const idsToFetch = [...fresh.stale, ...fresh.new];
      if (idsToFetch.length > 0) {
        const tsMap = new Map(notionTs.map(t => [t.id, t.last_edited_time]));
        const toUpsert = [];
        for (const id of idsToFetch) {
          const page = await this._request(`pages/${id}`);
          const name = (page.properties?.Name?.title || []).map(t => t.plain_text || '').join('') || 'Unknown';
          toUpsert.push({ notion_id: id, entity_type: type, last_edited_time: tsMap.get(id) || new Date().toISOString(), data: { name } });
        }
        this.cacheStore.upsertEntities(toUpsert);
      }
      if (fresh.deleted.length > 0) this.cacheStore.deleteStaleEntities(type, notionTs.map(t => t.id));
      // Build the id->Name map from the (now fresh) cache.
      const map = {};
      for (const row of this.cacheStore.getEntitiesByType(type)) map[row.notion_id] = row.data.name;
      maps[db] = map;
    }
    return maps;
  }

  // ─────────────────────────────────────────────────────────────
  // Post-filter (query filters are imported from lib/notion/databases.js)
  // ─────────────────────────────────────────────────────────────

  _applyTokenFilter(tokens, tokenIds) {
    if (!tokenIds || !Array.isArray(tokenIds) || tokenIds.length === 0) {
      return tokens;
    }
    const filterSet = new Set(tokenIds.map(id => id.toLowerCase()));
    return tokens.filter(t => filterSet.has(t.tokenId?.toLowerCase()));
  }

  // ─────────────────────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cacheStore.getStats();
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cacheStore.clear();
  }

  /**
   * Invalidate and refetch all data
   */
  async invalidateAll() {
    this.clearCache();
    // Trigger fresh fetches
    await this.fetchMemoryTokens();
    await this.fetchPaperEvidence();
  }

  /**
   * Get underlying NotionClient for uncached operations
   */
  getUnderlyingClient() {
    return this.notionClient;
  }

  /**
   * Close database connection
   */
  close() {
    this.cacheStore.close();
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton Factory
// ─────────────────────────────────────────────────────────────

let globalCachedClient = null;

/**
 * Create or return the global CachedNotionClient singleton
 * @param {Object} [options] - Options (only used on first call)
 * @returns {CachedNotionClient}
 */
function createCachedNotionClient(options = {}) {
  if (!globalCachedClient) {
    globalCachedClient = new CachedNotionClient(options);
    console.log('[CachedNotionClient] Global singleton created');
  }
  return globalCachedClient;
}

/**
 * Reset the singleton (for testing)
 */
function resetCachedNotionClient() {
  if (globalCachedClient) {
    globalCachedClient.close();
    globalCachedClient = null;
  }
}

module.exports = {
  CachedNotionClient,
  createCachedNotionClient,
  resetCachedNotionClient,
  DEFAULT_CACHE_PATH
};

// Self-test when run directly
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

  (async () => {
    console.log('CachedNotionClient Self-Test\n');

    try {
      // Create client with test database
      const testDbPath = path.join(__dirname, '..', '..', 'data', '.cache', 'notion-cache-test.db');
      const client = new CachedNotionClient({ dbPath: testDbPath });

      console.log('Initial cache stats:', client.getStats());

      // First fetch - should hit Notion
      console.log('\n--- First fetch (cold cache) ---');
      const result1 = await client.fetchMemoryTokens();
      console.log(`Fetched ${result1.totalCount} tokens`);
      console.log('Cache stats:', result1.cacheStats);

      // Second fetch - should use cache
      console.log('\n--- Second fetch (warm cache) ---');
      const result2 = await client.fetchMemoryTokens();
      console.log(`Fetched ${result2.totalCount} tokens`);
      console.log('Cache stats:', result2.cacheStats);

      // Test paper evidence
      console.log('\n--- Paper evidence fetch ---');
      const evidence = await client.fetchPaperEvidence();
      console.log(`Fetched ${evidence.totalCount} evidence items`);
      console.log('Cache stats:', evidence.cacheStats);

      // Final stats
      console.log('\nFinal cache stats:', client.getStats());

      client.close();
      console.log('\nSelf-test passed!');

    } catch (error) {
      console.error('Self-test failed:', error);
      process.exit(1);
    }
  })();
}
