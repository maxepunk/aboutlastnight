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
const { NotionClient } = require(path.join(__dirname, '..', '..', '..', '..', 'lib', 'notion-client'));

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

// Parse command line arguments
const args = process.argv.slice(2);
const prettyPrint = args.includes('--pretty');
const tokenIdArg = args.find(a => a.startsWith('--token-ids='));
const filterTokenIds = tokenIdArg ? tokenIdArg.split('=')[1].split(',').map(id => id.trim().toLowerCase()) : null;

// Parse --output=<path> for file output (avoids truncation)
const outputArg = args.find(a => a.startsWith('--output='));
const outputPath = outputArg ? outputArg.split('=')[1] : null;

/**
 * Main execution
 */
async function main() {
    if (!NOTION_TOKEN) {
        console.error(JSON.stringify({ error: 'NOTION_TOKEN not set' }));
        process.exit(1);
    }

    try {
        const client = new NotionClient(NOTION_TOKEN);
        const result = await client.fetchMemoryTokens(filterTokenIds);

        // result is already { tokens, fetchedAt, totalCount } with owners resolved
        const output = result;

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
            console.error(`Wrote ${output.tokens.length} tokens to ${outputPath}`);
        } else {
            console.log(jsonString);
        }

    } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}

main();
