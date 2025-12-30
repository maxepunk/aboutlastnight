/**
 * Cache Layer - Barrel export
 *
 * Provides global Notion caching with SQLite persistence.
 *
 * Usage:
 *   const { createCachedNotionClient } = require('./cache');
 *   const client = createCachedNotionClient();
 *   const { tokens } = await client.fetchMemoryTokens();
 */

const {
  CachedNotionClient,
  createCachedNotionClient,
  resetCachedNotionClient,
  DEFAULT_CACHE_PATH
} = require('./cached-notion-client');

const { NotionCacheStore, SCHEMA_VERSION } = require('./notion-cache-store');
const { FreshnessChecker } = require('./freshness-checker');

module.exports = {
  // Main exports
  CachedNotionClient,
  createCachedNotionClient,
  resetCachedNotionClient,
  DEFAULT_CACHE_PATH,

  // Lower-level exports (for testing/advanced use)
  NotionCacheStore,
  FreshnessChecker,
  SCHEMA_VERSION
};
