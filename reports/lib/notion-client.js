/**
 * NotionClient - Server-side Notion API wrapper
 *
 * Provides secure server-side access to Notion databases.
 * Patterns extracted from existing fetch-notion-tokens.js and fetch-paper-evidence.js
 *
 * Usage:
 *   const client = new NotionClient(process.env.NOTION_TOKEN);
 *   const tokens = await client.fetchMemoryTokens(['alr001', 'jam001']);
 *   const evidence = await client.fetchPaperEvidence();
 */

const fs = require('fs').promises;
const path = require('path');
const notionParse = require('./notion/parse');
const { parseTokenPage, parseEvidencePage } = notionParse;
const { collectRelationIds, applyRelationNames } = require('./notion/relations');
const { ELEMENTS_DB_ID, NOTION_VERSION, TOKEN_FILTER, EVIDENCE_FILTER } = require('./notion/databases');

class NotionClient {
  /**
   * @param {string} token - Notion integration token
   */
  constructor(token) {
    if (!token) {
      throw new Error('NOTION_TOKEN is required');
    }
    this.token = token;
    this.baseUrl = 'https://api.notion.com/v1';
  }

  /**
   * Make authenticated request to Notion API
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {string} method - HTTP method
   * @param {Object} body - Request body (for POST)
   * @returns {Promise<Object>} - Parsed JSON response
   */
  async request(endpoint, method = 'GET', body = null) {
    const url = `${this.baseUrl}/${endpoint}`;

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Notion API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Extract plain text from Notion rich text array
   * @param {Array} richTextArray - Notion rich text array
   * @returns {string} - Plain text
   */
  extractRichText(richTextArray) { return notionParse.extractRichText(richTextArray); }

  /**
   * Parse SF_ fields from memory token description
   *
   * Format:
   *   "The memory shows James entering the lab...
   *    SF_RFID: [jam001]
   *    SF_Summary: [James enters lab]
   *    SF_ValueRating: [4]
   *    SF_MemoryType: [Incriminating]
   *    SF_Group: [Lab Access]"
   *
   * @param {string} descText - Full description text
   * @returns {Object} - Parsed fields
   */
  parseSFFields(descText) { return notionParse.parseSFFields(descText); }

  /**
   * Fetch memory tokens from Notion Elements database
   *
   * @param {string[]} tokenIds - Optional list of token IDs to filter by
   * @returns {Promise<Object>} - { tokens: [...], fetchedAt, totalCount }
   */
  async fetchMemoryTokens(tokenIds = null) {
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;
    while (hasMore) {
      const body = { page_size: 100, filter: TOKEN_FILTER };
      if (startCursor) body.start_cursor = startCursor;
      const data = await this.request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);
      for (const page of data.results) {
        const item = parseTokenPage(page);
        if (item) allResults.push(item);
      }
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    allResults = applyRelationNames(allResults, 'memory_token', await this._buildNameMaps(allResults, 'memory_token'));
    if (tokenIds && Array.isArray(tokenIds) && tokenIds.length > 0) {
      const filterSet = new Set(tokenIds.map(id => id.toLowerCase()));
      allResults = allResults.filter(t => filterSet.has(t.tokenId));
    }
    return { tokens: allResults, fetchedAt: new Date().toISOString(), totalCount: allResults.length };
  }

  /**
   * Fetch paper evidence from Notion Elements database
   *
   * Filters for Basic Type: Prop, Document, Set Dressing
   * AND Narrative Threads: Funding & Espionage, Marriage Troubles, Memory Drug, Underground Parties
   *
   * @param {boolean} includeFiles - Whether to include file attachment URLs
   * @returns {Promise<Object>} - { evidence: [...], fetchedAt, totalCount }
   */
  async fetchPaperEvidence(includeFiles = true) {
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;
    while (hasMore) {
      const body = { page_size: 100, filter: EVIDENCE_FILTER };
      if (startCursor) body.start_cursor = startCursor;
      const data = await this.request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);
      for (const page of data.results) allResults.push(parseEvidencePage(page, { includeFiles }));
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    allResults = applyRelationNames(allResults, 'paper_evidence', await this._buildNameMaps(allResults, 'paper_evidence'));
    return { evidence: allResults, fetchedAt: new Date().toISOString(), totalCount: allResults.length };
  }

  /** Fetch a related page's Name title (-> 'Unknown' on failure). @private */
  async _fetchPageName(id) {
    try {
      const data = await this.request(`pages/${id}`);
      return notionParse.extractRichText(data.properties?.Name?.title) || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  /** Build { [targetDb]: { [id]: Name } } for the registered relations of entityType. @private */
  async _buildNameMaps(elements, entityType) {
    const idsByDb = collectRelationIds(elements, entityType);
    const maps = {};
    for (const [db, ids] of Object.entries(idsByDb)) {
      const map = {};
      for (const id of ids) map[id] = await this._fetchPageName(id);
      maps[db] = map;
    }
    return maps;
  }

  /**
   * Legacy relation resolver (retained for backward-compat + tests): mutates
   * `items`, setting items[nameField] from items[idField] and deleting idField.
   */
  async resolveRelationNames(items, idField, nameField) {
    const ids = new Set();
    items.forEach(it => (it[idField] || []).forEach(id => ids.add(id)));
    const nameMap = new Map();
    for (const id of ids) nameMap.set(id, await this._fetchPageName(id));
    items.forEach(it => {
      it[nameField] = (it[idField] || []).map(id => nameMap.get(id) || 'Unknown');
      delete it[idField];
    });
    return items;
  }

  /**
   * Download file from URL to local path
   *
   * @param {string} url - File URL (Notion URLs expire in ~1 hour)
   * @param {string} localPath - Local file path
   * @returns {Promise<string>} - Local path
   */
  async downloadFile(url, localPath) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Ensure directory exists
    const dir = path.dirname(localPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(localPath, buffer);
    return localPath;
  }

  /**
   * Download all file attachments from evidence items
   *
   * @param {Array} evidence - Evidence items with files arrays
   * @param {string} outputDir - Directory to save files
   * @returns {Promise<Object>} - Download statistics
   */
  async downloadAttachments(evidence, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });

    const stats = {
      newFiles: 0,
      replacedFiles: 0,
      cachedFiles: 0,
      errors: []
    };

    for (const item of evidence) {
      if (!item.files || item.files.length === 0) continue;

      for (const file of item.files) {
        if (!file.url) continue;

        // Sanitize filename
        const safeName = file.name.replace(/\s+/g, '_');
        const localPath = path.join(outputDir, safeName);

        try {
          // Check if file exists
          let existingSize = 0;
          try {
            const stat = await fs.stat(localPath);
            existingSize = stat.size;
          } catch {
            // File doesn't exist
          }

          // Download file
          const response = await fetch(file.url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const buffer = Buffer.from(await response.arrayBuffer());

          // Write file
          await fs.writeFile(localPath, buffer);
          file.localPath = localPath;

          if (existingSize === 0) {
            stats.newFiles++;
          } else if (existingSize !== buffer.length) {
            stats.replacedFiles++;
          } else {
            stats.cachedFiles++;
          }

        } catch (err) {
          // If download fails but file exists locally, use existing
          try {
            await fs.access(localPath);
            file.localPath = localPath;
            stats.cachedFiles++;
          } catch {
            stats.errors.push({ file: file.name, error: err.message });
          }
        }
      }
    }

    return stats;
  }
}

/**
 * Factory function for creating NotionClient with environment token
 * @returns {NotionClient}
 */
function createNotionClient() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error('NOTION_TOKEN environment variable is not set');
  }
  return new NotionClient(token);
}

module.exports = {
  NotionClient,
  createNotionClient,
  ELEMENTS_DB_ID
};

// Self-test when run directly
if (require.main === module) {
  (async () => {
    console.log('NotionClient Self-Test\n');

    try {
      // Load from .env if not set
      if (!process.env.NOTION_TOKEN) {
        require('dotenv').config();
      }

      const client = createNotionClient();
      console.log('Client created successfully.\n');

      // Test fetching a few tokens
      console.log('Fetching memory tokens...');
      const tokensResult = await client.fetchMemoryTokens(['alr001', 'jam001']);
      console.log(`Found ${tokensResult.totalCount} tokens matching filter.`);
      if (tokensResult.tokens.length > 0) {
        console.log('First token:', tokensResult.tokens[0].tokenId, '-', tokensResult.tokens[0].name);
      }

      // Test fetching paper evidence
      console.log('\nFetching paper evidence...');
      const evidenceResult = await client.fetchPaperEvidence(false);
      console.log(`Found ${evidenceResult.totalCount} evidence items.`);
      if (evidenceResult.evidence.length > 0) {
        console.log('First item:', evidenceResult.evidence[0].name);
      }

      console.log('\nSelf-test complete.');

    } catch (error) {
      console.error('Self-test failed:', error.message);
      process.exit(1);
    }
  })();
}
