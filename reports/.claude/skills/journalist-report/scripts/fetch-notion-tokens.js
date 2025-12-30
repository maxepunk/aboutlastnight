#!/usr/bin/env node
/**
 * fetch-notion-tokens.js
 *
 * Fetches memory token data from Notion Elements database.
 * Parses Description/Text field to extract narrative content and SF_ metadata.
 *
 * Usage:
 *   node fetch-notion-tokens.js                              # Output JSON to stdout
 *   node fetch-notion-tokens.js --pretty                     # Pretty-printed JSON
 *   node fetch-notion-tokens.js --token-ids id1,id2,id3      # Filter by token IDs
 *   node fetch-notion-tokens.js --output=./data/tokens.json  # Write to file (recommended)
 *
 * Environment:
 *   NOTION_TOKEN - Notion integration token (required)
 *
 * Output structure:
 *   {
 *     tokens: [{
 *       notionId: "uuid",
 *       tokenId: "abc001",
 *       name: "Token Name",
 *       fullDescription: "The narrative content before SF_ fields",
 *       summary: "Brief summary from SF_Summary",
 *       valueRating: "3",
 *       memoryType: "Incriminating",
 *       group: "Group name",
 *       owners: ["Character Name", ...],
 *       basicType: "Memory Token Video"
 *     }, ...],
 *     fetchedAt: "ISO timestamp",
 *     totalCount: 48
 *   }
 *
 * Note: Use --output flag to avoid stdout truncation in CLI environments.
 */

const fs = require('fs');
const path = require('path');

// Load NOTION_TOKEN from environment or .env file
let NOTION_TOKEN = process.env.NOTION_TOKEN;

if (!NOTION_TOKEN) {
    // Try to load from reports/.env
    const envPath = path.resolve(__dirname, '../../../../reports/.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/NOTION_TOKEN=(.+)/);
        if (match) {
            NOTION_TOKEN = match[1].trim();
        }
    }
}
const ELEMENTS_DB_ID = "18c2f33d-583f-8020-91bc-d84c7dd94306";
const NOTION_VERSION = "2022-06-28";

// Parse command line arguments
const args = process.argv.slice(2);
const prettyPrint = args.includes('--pretty');
const tokenIdArg = args.find(a => a.startsWith('--token-ids='));
const filterTokenIds = tokenIdArg ? tokenIdArg.split('=')[1].split(',').map(id => id.trim().toLowerCase()) : null;

// Parse --output=<path> for file output (avoids truncation)
const outputArg = args.find(a => a.startsWith('--output='));
const outputPath = outputArg ? outputArg.split('=')[1] : null;

/**
 * Fetch from Notion API
 */
async function fetchFromNotion(endpoint, method = 'GET', body = null) {
    const url = `https://api.notion.com/v1/${endpoint}`;

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${NOTION_TOKEN}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

/**
 * Parse SF_ fields from Description/Text field
 *
 * The Description/Text field contains:
 * 1. Full narrative description (the actual memory content)
 * 2. SF_ metadata fields at the end
 *
 * Format example:
 *   "The memory shows James entering the lab at 3:15 AM. He appears nervous...
 *    SF_RFID: [jam001]
 *    SF_Summary: [James enters lab nervously]
 *    SF_ValueRating: [4]
 *    SF_MemoryType: [Incriminating]
 *    SF_Group: [Lab Access]"
 */
function parseSFFields(descText) {
    const result = {
        fullDescription: '',
        tokenId: '',
        summary: '',
        valueRating: '',
        memoryType: '',
        group: ''
    };

    if (!descText) return result;

    // Find where SF_ fields begin - split on first SF_ occurrence
    const sfIndex = descText.indexOf('SF_');
    if (sfIndex > 0) {
        // Everything before SF_ is the narrative description
        result.fullDescription = descText.substring(0, sfIndex).trim();
    } else if (sfIndex === -1) {
        // No SF_ fields - entire text is description
        result.fullDescription = descText.trim();
    }
    // If sfIndex === 0, description is empty (edge case)

    // Extract SF_ fields using regex
    // Format: SF_FieldName: [value] or SF_FieldName:[value]
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
 * Fetch all memory tokens from Notion
 */
async function fetchMemoryTokens() {
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;

    // Filter for memory token types
    const filter = {
        or: [
            { property: 'Basic Type', select: { equals: 'Memory Token Video' } },
            { property: 'Basic Type', select: { equals: 'Memory Token Image' } },
            { property: 'Basic Type', select: { equals: 'Memory Token Audio' } }
        ]
    };

    while (hasMore) {
        const body = { page_size: 100, filter };
        if (startCursor) body.start_cursor = startCursor;

        const data = await fetchFromNotion(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);

        for (const page of data.results) {
            const props = page.properties;
            const name = props['Name']?.title?.[0]?.plain_text || '';
            const descText = props['Description/Text']?.rich_text?.map(r => r.plain_text).join('') || '';
            const basicType = props['Basic Type']?.select?.name || '';

            // Parse SF_ fields from description
            const sfFields = parseSFFields(descText);

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

    return allResults;
}

/**
 * Resolve character names from Owner relation IDs
 */
async function resolveOwners(tokens) {
    // Collect unique owner IDs
    const ownerIds = new Set();
    tokens.forEach(item => {
        item.ownerIds.forEach(id => ownerIds.add(id));
    });

    // Fetch owner names
    const ownerMap = new Map();
    for (const ownerId of ownerIds) {
        try {
            const data = await fetchFromNotion(`pages/${ownerId}`);
            ownerMap.set(ownerId, data.properties?.Name?.title?.[0]?.plain_text || 'Unknown');
        } catch (err) {
            console.error(`Failed to fetch owner ${ownerId}:`, err.message);
        }
    }

    // Add resolved names to tokens
    tokens.forEach(item => {
        item.owners = item.ownerIds.map(id => ownerMap.get(id) || 'Unknown');
        delete item.ownerIds; // Remove raw IDs from output
    });

    return tokens;
}

/**
 * Main execution
 */
async function main() {
    if (!NOTION_TOKEN) {
        console.error(JSON.stringify({ error: 'NOTION_TOKEN not set' }));
        process.exit(1);
    }

    try {
        // Fetch all memory tokens
        let tokens = await fetchMemoryTokens();

        // Resolve owner names
        tokens = await resolveOwners(tokens);

        // Filter by token IDs if specified
        if (filterTokenIds) {
            tokens = tokens.filter(t => filterTokenIds.includes(t.tokenId));
        }

        // Build output
        const output = {
            tokens: tokens,
            fetchedAt: new Date().toISOString(),
            totalCount: tokens.length
        };

        // Format JSON
        const jsonString = prettyPrint
            ? JSON.stringify(output, null, 2)
            : JSON.stringify(output);

        // Output to file or stdout
        if (outputPath) {
            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            fs.writeFileSync(outputPath, jsonString);
            // Summary to stderr so caller knows what happened
            console.error(`Wrote ${tokens.length} tokens to ${outputPath}`);
        } else {
            console.log(jsonString);
        }

    } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}

main();
