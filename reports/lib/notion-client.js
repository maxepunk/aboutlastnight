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

// Database IDs (from existing scripts)
const ELEMENTS_DB_ID = '18c2f33d-583f-8020-91bc-d84c7dd94306';
const NOTION_VERSION = '2022-06-28';

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
  extractRichText(richTextArray) {
    if (!richTextArray || !Array.isArray(richTextArray)) return '';
    return richTextArray.map(t => t.plain_text || '').join('');
  }

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
  parseSFFields(descText) {
    const result = {
      fullDescription: '',
      tokenId: '',
      summary: '',
      valueRating: '',
      memoryType: '',
      group: ''
    };

    if (!descText) return result;

    // Find where SF_ fields begin
    const sfIndex = descText.indexOf('SF_');
    if (sfIndex > 0) {
      result.fullDescription = descText.substring(0, sfIndex).trim();
    } else if (sfIndex === -1) {
      result.fullDescription = descText.trim();
    }

    // Extract SF_ fields using regex
    const rfidMatch = descText.match(/SF_RFID:\s*\[([^\]]*)\]/i);
    if (rfidMatch) result.tokenId = rfidMatch[1].trim().toLowerCase();

    const summaryMatch = descText.match(/SF_Summary:\s*\[([^\]]*)\]/i);
    if (summaryMatch) result.summary = summaryMatch[1].trim();

    const ratingMatch = descText.match(/SF_ValueRating:\s*\[([^\]]*)\]/i);
    if (ratingMatch) result.valueRating = ratingMatch[1].trim();

    const typeMatch = descText.match(/SF_MemoryType:\s*\[([^\]]*)\]/i);
    if (typeMatch) result.memoryType = typeMatch[1].trim();

    const groupMatch = descText.match(/SF_Group:\s*\[([^\]]*)\]/i);
    if (groupMatch) result.group = groupMatch[1].trim();

    return result;
  }

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

    // Filter for memory token types (includes base 'Memory Token' and subtypes)
    const filter = {
      or: [
        { property: 'Basic Type', select: { equals: 'Memory Token' } },
        { property: 'Basic Type', select: { equals: 'Memory Token Video' } },
        { property: 'Basic Type', select: { equals: 'Memory Token Image' } },
        { property: 'Basic Type', select: { equals: 'Memory Token Audio' } }
      ]
    };

    // Paginate through all results
    while (hasMore) {
      const body = { page_size: 100, filter };
      if (startCursor) body.start_cursor = startCursor;

      const data = await this.request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);

      for (const page of data.results) {
        const props = page.properties;
        const name = this.extractRichText(props['Name']?.title);
        const descText = this.extractRichText(props['Description/Text']?.rich_text);
        const basicType = props['Basic Type']?.select?.name || '';

        const sfFields = this.parseSFFields(descText);

        const item = {
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

        // Only include items with valid token IDs
        if (item.tokenId) {
          allResults.push(item);
        }
      }

      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    // Resolve owner names
    allResults = await this.resolveRelationNames(allResults, 'ownerIds', 'owners');

    // Filter by token IDs if specified
    if (tokenIds && Array.isArray(tokenIds) && tokenIds.length > 0) {
      const filterSet = new Set(tokenIds.map(id => id.toLowerCase()));
      allResults = allResults.filter(t => filterSet.has(t.tokenId));
    }

    return {
      tokens: allResults,
      fetchedAt: new Date().toISOString(),
      totalCount: allResults.length
    };
  }

  /**
   * Fetch paper evidence from Notion Elements database
   *
   * Filters for Basic Type: Prop, Physical, Clue, Document, Set Dressing
   * AND Narrative Threads: Funding & Espionage, Marriage Troubles, Memory Drug, Underground Parties
   *
   * @param {boolean} includeFiles - Whether to include file attachment URLs
   * @returns {Promise<Object>} - { evidence: [...], fetchedAt, totalCount }
   */
  async fetchPaperEvidence(includeFiles = true) {
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;

    // Filter for relevant Basic Types AND Narrative Threads
    const filter = {
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

    while (hasMore) {
      const body = { page_size: 100, filter };
      if (startCursor) body.start_cursor = startCursor;

      const data = await this.request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);

      for (const page of data.results) {
        const props = page.properties;
        const name = this.extractRichText(props['Name']?.title);
        const descText = this.extractRichText(props['Description/Text']?.rich_text);
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

        // Extract file attachments if requested
        if (includeFiles && props['Files & media']?.files) {
          item.files = props['Files & media'].files.map(file => ({
            name: file.name,
            type: file.type,
            url: file.type === 'external' ? file.external?.url : file.file?.url
          }));
        }

        allResults.push(item);
      }

      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    // Resolve relation names
    allResults = await this.resolveRelationNames(allResults, 'ownerIds', 'owners');
    allResults = await this.resolveRelationNames(allResults, 'containerIds', 'containers');

    return {
      evidence: allResults,
      fetchedAt: new Date().toISOString(),
      totalCount: allResults.length
    };
  }

  /**
   * Resolve relation IDs to names
   *
   * @param {Array} items - Array of items with relation IDs
   * @param {string} idField - Field name containing relation IDs
   * @param {string} nameField - Field name to store resolved names
   * @returns {Promise<Array>} - Items with resolved names
   */
  async resolveRelationNames(items, idField, nameField) {
    // Collect unique IDs
    const allIds = new Set();
    items.forEach(item => {
      (item[idField] || []).forEach(id => allIds.add(id));
    });

    // Fetch names for all IDs
    const nameMap = new Map();
    for (const id of allIds) {
      try {
        const data = await this.request(`pages/${id}`);
        nameMap.set(id, this.extractRichText(data.properties?.Name?.title) || 'Unknown');
      } catch (err) {
        nameMap.set(id, 'Unknown');
      }
    }

    // Add resolved names and remove raw IDs
    items.forEach(item => {
      item[nameField] = (item[idField] || []).map(id => nameMap.get(id) || 'Unknown');
      delete item[idField];
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
