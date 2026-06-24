#!/usr/bin/env node
/**
 * fetch-paper-evidence.js
 *
 * Fetches paper evidence from Notion Elements database.
 * Filters for elements with:
 * - Basic Type: Prop, Physical, Clue, Document, or Set Dressing
 * - Narrative Threads: Funding & Espionage, Marriage Troubles, Memory Drug, or Underground Parties
 *
 * These are physical evidence items unlocked during gameplay but not tracked by orchestrator.
 *
 * Usage:
 *   node fetch-paper-evidence.js                              # Output JSON to stdout
 *   node fetch-paper-evidence.js --pretty                     # Pretty-printed JSON
 *   node fetch-paper-evidence.js --with-files                 # Include file attachment URLs
 *   node fetch-paper-evidence.js --output=./data/evidence.json  # Write to file (recommended)
 *   node fetch-paper-evidence.js --download --output-dir=./assets/images/notion
 *                                                             # Download files to directory
 *
 * Environment:
 *   NOTION_TOKEN - Notion integration token (required)
 *
 * Output structure:
 *   {
 *     evidence: [{
 *       notionId: "uuid",
 *       name: "Cease & Desist Letter",
 *       basicType: "Prop",
 *       description: "The narrative content describing this evidence",
 *       owners: ["Alex"],
 *       narrativeThreads: ["IP Theft", "Legal"],
 *       files: [{
 *         name: "document.png",
 *         url: "https://...",
 *         localPath: "./assets/images/notion/document.png"  // If --download used
 *       }]
 *     }, ...],
 *     fetchedAt: "ISO timestamp",
 *     totalCount: 50,
 *     downloads: { new: 3, replaced: 1, cached: 1, total: 5 },  // If --download used
 *     outputDirectory: "./assets/images/notion",                 // If --download used
 *     downloadErrors: [...]                                       // If --download used and errors occurred
 *   }
 *
 * Note: Use --output flag to avoid stdout truncation in CLI environments.
 */

const fs = require('fs');
const path = require('path');

// Load NOTION_TOKEN from environment or .env file
let NOTION_TOKEN = process.env.NOTION_TOKEN;

if (!NOTION_TOKEN) {
    // Try reports/.env first
    let envPath = path.resolve(__dirname, '../../../../reports/.env');
    if (!fs.existsSync(envPath)) {
        // Try relative to skill directory
        envPath = path.resolve(__dirname, '../../../reports/.env');
    }
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/NOTION_TOKEN=(.+)/);
        if (match) {
            NOTION_TOKEN = match[1].trim();
        }
    }
}

const { NotionClient } = require(path.join(__dirname, '..', '..', '..', '..', 'lib', 'notion-client'));

// Parse command line arguments
const args = process.argv.slice(2);
const prettyPrint = args.includes('--pretty');
const includeFiles = args.includes('--with-files') || args.includes('--download');
const downloadFiles = args.includes('--download');

// Parse --output-dir=<path> for downloaded files
let outputDir = './assets/images/notion';
const outputDirArg = args.find(a => a.startsWith('--output-dir='));
if (outputDirArg) {
    outputDir = outputDirArg.split('=')[1];
}

// Parse --output=<path> for JSON output (avoids truncation)
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
        const result = await client.fetchPaperEvidence(includeFiles); // { evidence, fetchedAt, totalCount }

        if (downloadFiles) {
            console.error(`\nDownloading files to: ${outputDir}`);
            const stats = await client.downloadAttachments(result.evidence, outputDir); // mutates files[].localPath
            console.error(`\nDownload complete:`);
            console.error(`  New: ${stats.newFiles}`);
            console.error(`  Replaced: ${stats.replacedFiles}`);
            console.error(`  Cached: ${stats.cachedFiles}`);
            if (stats.errors && stats.errors.length > 0) console.error(`  Errors: ${stats.errors.length}`);
            result.downloads = {
                new: stats.newFiles,
                replaced: stats.replacedFiles,
                cached: stats.cachedFiles,
                total: stats.newFiles + stats.replacedFiles + stats.cachedFiles
            };
            result.outputDirectory = outputDir;
            if (stats.errors && stats.errors.length > 0) result.downloadErrors = stats.errors;
        }

        const output = result;

        // Format JSON
        const jsonString = prettyPrint
            ? JSON.stringify(output, null, 2)
            : JSON.stringify(output);

        // Output to file or stdout
        if (outputPath) {
            // Ensure output directory exists
            const jsonOutputDir = path.dirname(outputPath);
            if (!fs.existsSync(jsonOutputDir)) {
                fs.mkdirSync(jsonOutputDir, { recursive: true });
            }
            fs.writeFileSync(outputPath, jsonString);
            // Summary to stderr so caller knows what happened
            console.error(`Wrote ${output.evidence.length} evidence items to ${outputPath}`);
        } else {
            console.log(jsonString);
        }

    } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}

main();
