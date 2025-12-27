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
        this._getTokenFilter(),
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
        this._getEvidenceFilter(),
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
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
      const body = { page_size: 100, filter };
      if (startCursor) body.start_cursor = startCursor;

      const data = await this._request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);

      for (const page of data.results) {
        if (!targetSet.has(page.id)) continue;

        const parsed = entityType === 'memory_token'
          ? this._parseTokenPage(page)
          : this._parseEvidencePage(page);

        if (parsed) {
          entities.push(parsed);
        }
      }

      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    // Resolve owner/container relations
    if (entityType === 'memory_token') {
      return await this.notionClient.resolveRelationNames(entities, 'ownerIds', 'owners');
    } else {
      let result = await this.notionClient.resolveRelationNames(entities, 'ownerIds', 'owners');
      result = await this.notionClient.resolveRelationNames(result, 'containerIds', 'containers');
      return result;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Page Parsing (mirrors NotionClient logic)
  // ─────────────────────────────────────────────────────────────

  /**
   * Parse memory token page
   * @private
   */
  _parseTokenPage(page) {
    const props = page.properties;
    const name = this._extractRichText(props['Name']?.title);
    const descText = this._extractRichText(props['Description/Text']?.rich_text);
    const basicType = props['Basic Type']?.select?.name || '';

    const sfFields = this.notionClient.parseSFFields(descText);

    // Only include items with valid token IDs
    if (!sfFields.tokenId) return null;

    return {
      notionId: page.id,
      tokenId: sfFields.tokenId,
      name: name,
      fullDescription: sfFields.fullDescription,
      summary: sfFields.summary,
      valueRating: sfFields.valueRating,
      memoryType: sfFields.memoryType,
      group: sfFields.group,
      basicType: basicType,
      ownerIds: props['Owner']?.relation?.map(r => r.id) || []
    };
  }

  /**
   * Parse paper evidence page
   * @private
   */
  _parseEvidencePage(page) {
    const props = page.properties;
    const name = this._extractRichText(props['Name']?.title);
    const descText = this._extractRichText(props['Description/Text']?.rich_text);
    const basicType = props['Basic Type']?.select?.name || '';
    const narrativeThreads = props['Narrative Threads']?.multi_select?.map(s => s.name) || [];

    const item = {
      notionId: page.id,
      name: name,
      basicType: basicType,
      description: descText,
      narrativeThreads: narrativeThreads,
      ownerIds: props['Owner']?.relation?.map(r => r.id) || [],
      containerIds: props['Container']?.relation?.map(r => r.id) || []
    };

    // Extract file attachments
    if (props['Files & media']?.files) {
      item.files = props['Files & media'].files.map(file => ({
        name: file.name,
        type: file.type,
        url: file.type === 'external' ? file.external?.url : file.file?.url
      }));
    }

    return item;
  }

  /**
   * Extract plain text from Notion rich text array
   * @private
   */
  _extractRichText(richTextArray) {
    if (!richTextArray || !Array.isArray(richTextArray)) return '';
    return richTextArray.map(t => t.plain_text || '').join('');
  }

  // ─────────────────────────────────────────────────────────────
  // Filters (mirrors NotionClient logic)
  // ─────────────────────────────────────────────────────────────

  _getTokenFilter() {
    return {
      or: [
        { property: 'Basic Type', select: { equals: 'Memory Token Video' } },
        { property: 'Basic Type', select: { equals: 'Memory Token Image' } },
        { property: 'Basic Type', select: { equals: 'Memory Token Audio' } }
      ]
    };
  }

  _getEvidenceFilter() {
    return {
      and: [
        {
          or: [
            { property: 'Basic Type', select: { equals: 'Prop' } },
            { property: 'Basic Type', select: { equals: 'Physical' } },
            { property: 'Basic Type', select: { equals: 'Clue' } },
            { property: 'Basic Type', select: { equals: 'Document' } },
            { property: 'Basic Type', select: { equals: 'Set Dressing' } }
          ]
        },
        {
          or: [
            { property: 'Narrative Threads', multi_select: { contains: 'Funding & Espionage' } },
            { property: 'Narrative Threads', multi_select: { contains: 'Marriage Troubles' } },
            { property: 'Narrative Threads', multi_select: { contains: 'Memory Drug' } },
            { property: 'Narrative Threads', multi_select: { contains: 'Underground Parties' } }
          ]
        }
      ]
    };
  }

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
