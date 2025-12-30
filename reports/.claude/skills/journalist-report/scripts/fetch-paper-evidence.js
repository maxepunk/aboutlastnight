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
 *       }],
 *       containers: ["Alex's shoulder bag"]
 *     }, ...],
 *     fetchedAt: "ISO timestamp",
 *     totalCount: 50,
 *     downloadedFiles: 5  // If --download used
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

const ELEMENTS_DB_ID = "18c2f33d-583f-8020-91bc-d84c7dd94306";
const NOTION_VERSION = "2022-06-28";

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
 * Extract rich text to plain string
 */
function extractRichText(richTextArray) {
    if (!richTextArray || !Array.isArray(richTextArray)) return '';
    return richTextArray.map(t => t.plain_text || '').join('');
}

/**
 * Fetch paper evidence from Notion
 *
 * Filters for elements that are:
 * - Basic Type: Prop, Physical, Clue, Document, or Set Dressing
 * - AND have Narrative Threads: Funding & Espionage, Marriage Troubles, Memory Drug, or Underground Parties
 */
async function fetchPaperEvidence() {
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;

    // Filter for relevant Basic Types AND relevant Narrative Threads
    const filter = {
        and: [
            // Basic Type must be one of these
            {
                or: [
                    { property: 'Basic Type', select: { equals: 'Prop' } },
                    { property: 'Basic Type', select: { equals: 'Physical' } },
                    { property: 'Basic Type', select: { equals: 'Clue' } },
                    { property: 'Basic Type', select: { equals: 'Document' } },
                    { property: 'Basic Type', select: { equals: 'Set Dressing' } }
                ]
            },
            // AND Narrative Threads must include at least one of these
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

        const data = await fetchFromNotion(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);

        for (const page of data.results) {
            const props = page.properties;
            const name = extractRichText(props['Name']?.title);
            const descText = extractRichText(props['Description/Text']?.rich_text);
            const basicType = props['Basic Type']?.select?.name || '';
            const narrativeThreads = props['Narrative Threads']?.multi_select?.map(s => s.name) || [];

            // Extract file attachments if present
            const files = [];
            if (includeFiles && props['Files & media']?.files) {
                for (const file of props['Files & media'].files) {
                    files.push({
                        name: file.name,
                        type: file.type,
                        url: file.type === 'external' ? file.external?.url : file.file?.url
                    });
                }
            }

            const item = {
                notionId: page.id,
                name: name,
                basicType: basicType,
                description: descText,
                narrativeThreads: narrativeThreads,
                ownerIds: props['Owner']?.relation?.map(r => r.id) || [],
                containerIds: props['Container']?.relation?.map(r => r.id) || []
            };

            if (includeFiles && files.length > 0) {
                item.files = files;
            }

            allResults.push(item);
        }

        hasMore = data.has_more;
        startCursor = data.next_cursor;
    }

    return allResults;
}

/**
 * Resolve character/element names from relation IDs
 */
async function resolveRelations(evidence) {
    // Collect unique relation IDs
    const allIds = new Set();
    evidence.forEach(item => {
        item.ownerIds.forEach(id => allIds.add(id));
        item.containerIds.forEach(id => allIds.add(id));
    });

    // Fetch names for all IDs
    const nameMap = new Map();
    for (const id of allIds) {
        try {
            const data = await fetchFromNotion(`pages/${id}`);
            nameMap.set(id, extractRichText(data.properties?.Name?.title) || 'Unknown');
        } catch (err) {
            // Silently skip failed lookups
            nameMap.set(id, 'Unknown');
        }
    }

    // Add resolved names to evidence items
    evidence.forEach(item => {
        item.owners = item.ownerIds.map(id => nameMap.get(id) || 'Unknown');
        item.containers = item.containerIds.map(id => nameMap.get(id) || 'Unknown');
        delete item.ownerIds;
        delete item.containerIds;
    });

    return evidence;
}

/**
 * Download a file from URL to local path
 */
async function downloadFile(url, localPath) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    return localPath;
}

/**
 * Download all file attachments from evidence items
 */
async function downloadAllFiles(evidence, outputDirectory) {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, { recursive: true });
    }

    let downloadCount = 0;
    let skippedCount = 0;
    let replacedCount = 0;
    const errors = [];

    for (const item of evidence) {
        if (!item.files || item.files.length === 0) continue;

        for (const file of item.files) {
            if (!file.url) continue;

            // Sanitize filename (replace spaces with underscores)
            const safeName = file.name.replace(/\s+/g, '_');
            const localPath = path.join(outputDirectory, safeName);

            // Check if file already exists
            const fileExists = fs.existsSync(localPath);
            let existingSize = 0;
            if (fileExists) {
                existingSize = fs.statSync(localPath).size;
            }

            try {
                // Always download fresh (Notion URLs expire, can't compare by URL)
                const response = await fetch(file.url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const buffer = Buffer.from(await response.arrayBuffer());

                // Compare sizes to detect changes
                if (fileExists && buffer.length === existingSize) {
                    // Same size, likely same content - still update to be safe
                    fs.writeFileSync(localPath, buffer);
                    file.localPath = localPath;
                    replacedCount++;
                    console.error(`Refreshed: ${safeName} (same size: ${buffer.length} bytes)`);
                } else if (fileExists) {
                    // Different size - content changed
                    fs.writeFileSync(localPath, buffer);
                    file.localPath = localPath;
                    replacedCount++;
                    console.error(`Updated: ${safeName} (${existingSize} → ${buffer.length} bytes)`);
                } else {
                    // New file
                    fs.writeFileSync(localPath, buffer);
                    file.localPath = localPath;
                    downloadCount++;
                    console.error(`Downloaded: ${safeName} (${buffer.length} bytes)`);
                }
            } catch (err) {
                // If download fails but file exists locally, use existing
                if (fileExists) {
                    file.localPath = localPath;
                    skippedCount++;
                    console.error(`Using cached: ${safeName} (download failed: ${err.message})`);
                } else {
                    errors.push({ file: file.name, error: err.message });
                    console.error(`Failed: ${safeName} - ${err.message}`);
                }
            }
        }
    }

    return { downloadCount, replacedCount, skippedCount, errors };
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
        // Fetch all paper evidence
        let evidence = await fetchPaperEvidence();

        // Resolve relation names
        evidence = await resolveRelations(evidence);

        // Download files if requested
        let downloadStats = null;
        if (downloadFiles) {
            console.error(`\nDownloading files to: ${outputDir}`);
            downloadStats = await downloadAllFiles(evidence, outputDir);
            console.error(`\nDownload complete:`);
            console.error(`  New: ${downloadStats.downloadCount}`);
            console.error(`  Replaced/Refreshed: ${downloadStats.replacedCount}`);
            console.error(`  Using cached: ${downloadStats.skippedCount}`);
            if (downloadStats.errors.length > 0) {
                console.error(`  Errors: ${downloadStats.errors.length}`);
            }
        }

        // Build output
        const output = {
            evidence: evidence,
            fetchedAt: new Date().toISOString(),
            totalCount: evidence.length
        };

        // Add download stats if files were downloaded
        if (downloadStats) {
            output.downloads = {
                new: downloadStats.downloadCount,
                replaced: downloadStats.replacedCount,
                cached: downloadStats.skippedCount,
                total: downloadStats.downloadCount + downloadStats.replacedCount + downloadStats.skippedCount
            };
            output.outputDirectory = outputDir;
            if (downloadStats.errors.length > 0) {
                output.downloadErrors = downloadStats.errors;
            }
        }

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
            console.error(`Wrote ${evidence.length} evidence items to ${outputPath}`);
        } else {
            console.log(jsonString);
        }

    } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}

main();
