/**
 * ALN Director Console - Backend Server
 * Uses Claude Code CLI (Console MAX) for AI operations
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Journalist pipeline modules
const { createNotionClient } = require('./lib/notion-client');
const { createSessionManager } = require('./lib/session-manager');
const { createThemeLoader } = require('./lib/theme-loader');
const { createPromptBuilder } = require('./lib/prompt-builder');

const app = express();
const PORT = 3001;

// Initialize journalist pipeline components
const sessionManager = createSessionManager();
let notionClient = null;  // Lazy-initialized when NOTION_TOKEN is available
let themeLoader = null;   // Lazy-initialized on first use
let promptBuilder = null; // Lazy-initialized on first use

// Helper to get or create NotionClient
function getNotionClient() {
    if (!notionClient && process.env.NOTION_TOKEN) {
        notionClient = createNotionClient();
    }
    if (!notionClient) {
        throw new Error('NOTION_TOKEN not configured');
    }
    return notionClient;
}

// Helper to get or create ThemeLoader
function getThemeLoader() {
    if (!themeLoader) {
        themeLoader = createThemeLoader();
    }
    return themeLoader;
}

// Helper to get or create PromptBuilder
function getPromptBuilder() {
    if (!promptBuilder) {
        promptBuilder = createPromptBuilder();
    }
    return promptBuilder;
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Session middleware for authentication
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // Set to true if using HTTPS only
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// Auth middleware - protects routes
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized', message: 'Please log in' });
}

// Helper: Execute Claude CLI command via stdin (bypasses command line length limits)
async function callClaude(prompt, options = {}) {
    const {
        model = 'haiku',
        outputFormat = 'text',
        maxRetries = 2,
        systemPrompt = null,
        jsonSchema = null,
        tools = null
    } = options;

    // Create isolated working directory for this Claude process
    // Prevents concurrent processes from fighting over .claude.json
    const workDir = path.join(
        os.tmpdir(),
        `claude-batch-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    try {
        fs.mkdirSync(workDir, { recursive: true });
        console.log(`[${new Date().toISOString()}] Calling Claude (${model}) in ${workDir}`);

        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await new Promise((resolve, reject) => {
                    // Build arguments array
                    const args = ['-p']; // -p flag to indicate prompt mode

                    if (outputFormat === 'json') {
                        args.push('--output-format', 'json');
                    }

                    if (model) {
                        args.push('--model', model);
                    }

                    if (systemPrompt) {
                        args.push('--system-prompt', systemPrompt);
                    }

                    if (jsonSchema) {
                        args.push('--json-schema', JSON.stringify(jsonSchema));
                    }

                    if (tools !== null) {
                        args.push('--tools', tools);
                    }

                    // Spawn Claude process in isolated directory
                    const claude = spawn('claude', args, {
                        cwd: workDir,  // KEY: Isolated working directory prevents .claude.json conflicts
                        windowsHide: true  // Don't show console window on Windows
                        // No shell option - claude.exe is found via PATH without it, avoiding command line length limits
                        // No timeout option - using manual model-specific timeout implementation below
                    });

                let stdout = '';
                let stderr = '';
                let timedOut = false;

                // Model-specific timeout (manual implementation for cross-platform reliability)
                const timeoutMs = model === 'opus' ? 600000 :      // 10 minutes for Opus
                                 model === 'sonnet' ? 300000 :     // 5 minutes for Sonnet
                                 120000;                            // 2 minutes for Haiku (default)

                const timeoutId = setTimeout(() => {
                    timedOut = true;
                    console.error(`⏱️  Process timeout after ${timeoutMs}ms (${model})`);
                    claude.kill(); // Kill the process
                }, timeoutMs);

                // Collect stdout
                claude.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                // Collect stderr
                claude.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                // Handle process completion
                claude.on('close', (code, signal) => {
                    clearTimeout(timeoutId); // Clear timeout when process closes

                    // Check if process was killed by timeout
                    if (timedOut) {
                        reject(new Error(`Process timeout after ${timeoutMs}ms (${model})`));
                        return;
                    }

                    // Detect abnormal termination (exit code null on Windows typically means killed/crashed)
                    if (code === null && signal === null) {
                        reject(new Error(
                            `Process terminated abnormally (no exit code or signal). ` +
                            `Stdout: ${stdout.length} bytes, Stderr: ${stderr.length} bytes. ` +
                            `Possible causes: external termination, crash, or EPIPE error.`
                        ));
                        return;
                    }

                    if (code !== 0) {
                        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
                    } else {
                        if (stderr && !stderr.includes('warning')) {
                            console.warn('Claude stderr:', stderr);
                        }

                        // Parse output based on format
                        let finalResult = stdout.trim();

                        if (outputFormat === 'json') {
                            try {
                                // Claude CLI --output-format json returns streaming JSON array
                                const wrapper = JSON.parse(finalResult);

                                // New format: Array of message objects
                                if (Array.isArray(wrapper)) {
                                    // Find the result message with structured_output or text content
                                    const resultMsg = wrapper.find(msg =>
                                        msg.type === 'result' && msg.subtype === 'success'
                                    );

                                    if (resultMsg) {
                                        // Check for structured_output first (from --json-schema)
                                        if (resultMsg.structured_output) {
                                            console.log('Extracting from result.structured_output');
                                            finalResult = JSON.stringify(resultMsg.structured_output);
                                        } else if (resultMsg.result) {
                                            // Fall back to result field
                                            let actualResult = resultMsg.result;
                                            // Extract JSON from markdown code fences
                                            const jsonMatch = actualResult.match(/```json\s*\n([\s\S]*?)\n```/);
                                            if (jsonMatch) {
                                                actualResult = jsonMatch[1];
                                            } else {
                                                actualResult = actualResult.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
                                            }
                                            finalResult = actualResult.trim();
                                        }
                                    } else {
                                        // Try finding assistant message with text
                                        const assistantMsg = wrapper.find(msg =>
                                            msg.type === 'assistant' && msg.message
                                        );
                                        if (assistantMsg && assistantMsg.message && assistantMsg.message.content) {
                                            const textContent = assistantMsg.message.content.find(c => c.type === 'text');
                                            if (textContent) {
                                                let actualResult = textContent.text;
                                                const jsonMatch = actualResult.match(/```json\s*\n([\s\S]*?)\n```/);
                                                if (jsonMatch) {
                                                    actualResult = jsonMatch[1];
                                                } else {
                                                    actualResult = actualResult.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
                                                }
                                                finalResult = actualResult.trim();
                                            }
                                        }
                                    }
                                }
                                // Legacy single object format
                                else if (wrapper.structured_output) {
                                    console.log('Extracting from structured_output (JSON schema validation)');
                                    finalResult = JSON.stringify(wrapper.structured_output);
                                } else {
                                    // Legacy path: Extract from result field (for non-schema requests)
                                    let actualResult = wrapper.result || finalResult;

                                    // Extract JSON from markdown code fences (more robust)
                                    const jsonMatch = actualResult.match(/```json\s*\n([\s\S]*?)\n```/);
                                    if (jsonMatch) {
                                        actualResult = jsonMatch[1];
                                    } else {
                                        // Fallback: try simple fence stripping
                                        actualResult = actualResult.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
                                    }

                                    finalResult = actualResult.trim();
                                }
                            } catch (e) {
                                console.warn('Failed to parse Claude JSON wrapper, using raw output:', e.message);
                            }
                        }

                        resolve(finalResult);
                    }
                });

                // Handle spawn errors
                claude.on('error', (err) => {
                    clearTimeout(timeoutId);
                    reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
                });

                // Handle STDIN errors (EPIPE on Windows when process closes stdin early)
                claude.stdin.on('error', (err) => {
                    if (err.code !== 'EPIPE') {
                        console.error('STDIN error:', err.code, err.message);
                    }
                    // Don't reject on EPIPE - process may have closed early but could still succeed
                });

                // Write prompt to stdin and close (with error handling for Windows EPIPE)
                try {
                    claude.stdin.write(prompt);
                    claude.stdin.end();
                } catch (err) {
                    if (err.code !== 'EPIPE') {
                        clearTimeout(timeoutId);
                        reject(new Error(`Failed to write to stdin: ${err.message}`));
                    }
                    // EPIPE is acceptable - process may have read data before closing
                }
            });

            console.log(`[${new Date().toISOString()}] Claude completed successfully`);
            return result;

            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt + 1} failed:`, error.message);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        }

        throw lastError;

    } finally {
        // Cleanup: Remove isolated temp directory
        try {
            fs.rmSync(workDir, { recursive: true, force: true });
            console.log(`[${new Date().toISOString()}] Cleaned up: ${workDir}`);
        } catch (cleanupError) {
            console.warn('Failed to cleanup temp directory:', cleanupError.message);
        }
    }
}

// ===== AUTH ENDPOINTS =====

// Login endpoint - validates password
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    const correctPassword = process.env.ACCESS_PASSWORD;

    if (!correctPassword) {
        console.warn('WARNING: ACCESS_PASSWORD not set in .env file');
        return res.status(500).json({
            success: false,
            message: 'Server configuration error'
        });
    }

    if (password === correctPassword) {
        req.session.authenticated = true;
        console.log(`[${new Date().toISOString()}] Successful login from ${req.ip}`);
        res.json({
            success: true,
            message: 'Authentication successful'
        });
    } else {
        console.warn(`[${new Date().toISOString()}] Failed login attempt from ${req.ip}`);
        res.status(401).json({
            success: false,
            message: 'Incorrect password'
        });
    }
});

// Check auth status
app.get('/api/auth/check', (req, res) => {
    res.json({
        authenticated: !!(req.session && req.session.authenticated)
    });
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({
                success: false,
                message: 'Logout failed'
            });
        }
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    });
});

// ===== API ENDPOINTS (Protected) =====

// Endpoint 1: Batch Analysis (uses Haiku for speed)
app.post('/api/analyze', requireAuth, async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Invalid items array' });
        }

        // Enforce batch size limit for reliable completion under Cloudflare timeout
        const MAX_BATCH_SIZE = 10;
        if (items.length > MAX_BATCH_SIZE) {
            return res.status(400).json({
                error: 'Batch too large',
                message: `Maximum ${MAX_BATCH_SIZE} items per batch. Received ${items.length} items.`,
                maxBatchSize: MAX_BATCH_SIZE
            });
        }

        console.log(`[${new Date().toISOString()}] Analyzing batch of ${items.length} items`);

        const prompt = `IMPORTANT: Return ONLY a JSON object. No conversational text, no explanations, no markdown. Just the raw JSON.

Analyze these evidence items and return a JSON Object with a key "results" containing an array of objects.

For each item, generate:

1. "id": The exact ID provided
2. "is_narrative": Boolean - TRUE if discoverable evidence (clues, documents, memories with narrative content), FALSE if generic prop
3. "is_background": Boolean - TRUE if this is character background information (like character sheets), FALSE if discovered evidence
4. "summary": Concise 10-15 word summary of content and significance
5. "in_world_reference": Natural detective phrasing for this evidence using Owner, Timeline, and discovery context
   - Use Owner name for attribution: "recovered from [Character Name]"
   - Use Timeline date/location for temporal context: "dated [date]" or "from [location]"
   - Memory Tokens → "memory extraction from [Character]" or "scanned memory regarding [event]"
   - Documents → "documents recovered from [Character/Location]" or "correspondence dated [date]"
   - Props → "physical evidence belonging to [Character]" or "items seized from [Location]"
   - NEVER use database names, codes, or "Character Sheet" terminology
   - NEVER reference "Memory Token #X" or item IDs
   - For character sheets: "[Character Name], a [role from logline]" (NOT "According to character sheet...")

6. "grouping": Object with primary/secondary/tertiary/timeline for UI organization
   - primary: "character:[Owner.name]" if Owner exists, otherwise "ungrouped"
   - secondary: "type:[Basic Type]" (e.g., "type:Document", "type:Memory Token - Technical")
   - tertiary: "thread:[first Narrative Thread]" if exists, otherwise "theme:General"
   - timeline: "[Timeline.date]" if exists, otherwise empty string

7. "tags": Array of 2-4 descriptive tags for filtering (e.g., ["Legal", "Corporate", "Pre-Incident"])
   - Based on content, SF_MemoryType, and narrative themes
   - Use: Legal, Technical, Personal, Corporate, Pre-Incident, Incident-Night, Post-Incident, Physical, Digital, Medical, Financial, etc.

8. "sf_group_cluster": The SF_Group value if it exists in sfFields, otherwise null

ITEMS TO ANALYZE (with enhanced context):
${JSON.stringify(items, null, 2)}

CONTEXT FIELD GUIDE:
- narrativeContent: Content for analysis (Description/Text without SF_ fields for Memory Tokens)
- desc: Full description including SF_ fields
- sfFields: Parsed SF_MemoryType, SF_ValueRating, SF_Group, SF_Summary (for Memory Tokens only)
- owner: {name, logline} - Character who owns/possesses this item
- timeline: {eventName, date, location} - Historical event this evidences
- associatedChars: Array of character names involved in timeline event
- threads: Narrative thread tags

SPECIAL HANDLING:
- Character sheets (name contains "Character Sheet"): Set is_background=true, is_narrative=false
- Character sheet in_world_reference: "[Character Name], a [profession/role from logline]"
- Memory tokens: Use SF_MemoryType to enhance type categorization (Technical/Business/Personal)
- Empty SF_ValueRating: Prioritize narrativeContent analysis over rating hint

CRITICAL: Return ONLY the JSON object. Do not include any text before or after the JSON. Start with { and end with }.`;

        // Define JSON schema to enforce structured output
        const analysisSchema = {
            type: "object",
            properties: {
                results: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "string" },
                            is_narrative: { type: "boolean" },
                            is_background: { type: "boolean" },
                            summary: { type: "string" },
                            in_world_reference: { type: "string" },
                            grouping: {
                                type: "object",
                                properties: {
                                    primary: { type: "string" },
                                    secondary: { type: "string" },
                                    tertiary: { type: "string" },
                                    timeline: { type: "string" }
                                },
                                required: ["primary", "secondary", "tertiary", "timeline"]
                            },
                            tags: {
                                type: "array",
                                items: { type: "string" }
                            },
                            sf_group_cluster: {
                                type: ["string", "null"]
                            }
                        },
                        required: ["id", "is_narrative", "is_background", "summary", "in_world_reference", "grouping", "tags", "sf_group_cluster"]
                    }
                }
            },
            required: ["results"]
        };

        const result = await callClaude(prompt, {
            model: 'haiku',
            outputFormat: 'json',
            jsonSchema: analysisSchema
        });

        // Debug: Log first 200 chars of result
        console.log('Raw result preview:', result.substring(0, 200));

        // Parse JSON output
        let parsed;
        try {
            parsed = JSON.parse(result);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError.message);
            console.error('Problematic result (first 500 chars):', result.substring(0, 500));
            console.error('Problematic result (last 200 chars):', result.substring(result.length - 200));
            throw parseError;
        }

        console.log(`[${new Date().toISOString()}] Batch complete: ${parsed.results.length} items analyzed successfully`);
        res.json(parsed);

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            error: error.message,
            details: 'Failed to analyze items. Check server logs.'
        });
    }
});

// TEMPORARY: Test endpoint for measuring single-item analysis timing
app.post('/api/test-single-item', requireAuth, async (req, res) => {
    const { item } = req.body;

    if (!item) {
        return res.status(400).json({ error: 'Item required' });
    }

    const startTime = Date.now();
    console.log('\n=== SINGLE ITEM ANALYSIS TEST ===');
    console.log('Start time:', new Date().toISOString());
    console.log('Item ID:', item.id);
    console.log('Item name:', item.name);

    try {
        // Build prompt for single item (same format as batch analysis)
        const prompt = `IMPORTANT: Return ONLY a JSON object. No conversational text, no explanations, no markdown. Just the raw JSON.

Analyze these evidence items and return a JSON Object with a key "results" containing an array of objects.

For each item, generate:

1. "id": The exact ID provided
2. "is_narrative": Boolean - TRUE if discoverable evidence (clues, documents, memories with narrative content), FALSE if generic prop
3. "is_background": Boolean - TRUE if this is character background information (like character sheets), FALSE if discovered evidence
4. "summary": Concise 10-15 word summary of content and significance
5. "in_world_reference": Natural detective phrasing for this evidence using Owner, Timeline, and discovery context
   - Use Owner name for attribution: "recovered from [Character Name]"
   - Use Timeline date/location for temporal context: "dated [date]" or "from [location]"
   - Memory Tokens → "memory extraction from [Character]" or "scanned memory regarding [event]"
   - Documents → "documents recovered from [Character/Location]" or "correspondence dated [date]"
   - Props → "physical evidence belonging to [Character]" or "items seized from [Location]"
   - NEVER use database names, codes, or "Character Sheet" terminology
   - NEVER reference "Memory Token #X" or item IDs
   - For character sheets: "[Character Name], a [role from logline]" (NOT "According to character sheet...")

6. "grouping": Object with primary/secondary/tertiary/timeline for UI organization
   - primary: "character:[Owner.name]" if Owner exists, otherwise "ungrouped"
   - secondary: "type:[Basic Type]" (e.g., "type:Document", "type:Memory Token - Technical")
   - tertiary: "thread:[first Narrative Thread]" if exists, otherwise "theme:General"
   - timeline: "[Timeline.date]" if exists, otherwise empty string

7. "tags": Array of 2-4 descriptive tags for filtering (e.g., ["Legal", "Corporate", "Pre-Incident"])
   - Based on content, SF_MemoryType, and narrative themes
   - Use: Legal, Technical, Personal, Corporate, Pre-Incident, Incident-Night, Post-Incident, Physical, Digital, Medical, Financial, etc.

8. "sf_group_cluster": The SF_Group value if it exists in sfFields, otherwise null

ITEMS TO ANALYZE (with enhanced context):
${JSON.stringify([item], null, 2)}

CONTEXT FIELD GUIDE:
- narrativeContent: Content for analysis (Description/Text without SF_ fields for Memory Tokens)
- desc: Full description including SF_ fields
- sfFields: Parsed SF_MemoryType, SF_ValueRating, SF_Group, SF_Summary (for Memory Tokens only)
- owner: {name, logline} - Character who owns/possesses this item
- timeline: {eventName, date, location} - Historical event this evidences
- associatedChars: Array of character names involved in timeline event
- threads: Narrative thread tags

SPECIAL HANDLING:
- Character sheets (name contains "Character Sheet"): Set is_background=true, is_narrative=false
- Character sheet in_world_reference: "[Character Name], a [profession/role from logline]"
- Memory tokens: Use SF_MemoryType to enhance type categorization (Technical/Business/Personal)
- Empty SF_ValueRating: Prioritize narrativeContent analysis over rating hint

CRITICAL: Return ONLY the JSON object. Do not include any text before or after the JSON. Start with { and end with }.`;

        const promptSizeBytes = Buffer.byteLength(prompt, 'utf8');
        console.log('Prompt size:', prompt.length, 'characters');
        console.log('Prompt size:', (promptSizeBytes / 1024).toFixed(2), 'KB');

        // Define JSON schema (same as batch analysis)
        const analysisSchema = {
            type: "object",
            properties: {
                results: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "string" },
                            is_narrative: { type: "boolean" },
                            is_background: { type: "boolean" },
                            summary: { type: "string" },
                            in_world_reference: { type: "string" },
                            grouping: {
                                type: "object",
                                properties: {
                                    primary: { type: "string" },
                                    secondary: { type: "string" },
                                    tertiary: { type: "string" },
                                    timeline: { type: "string" }
                                },
                                required: ["primary", "secondary", "tertiary", "timeline"]
                            },
                            tags: {
                                type: "array",
                                items: { type: "string" }
                            },
                            sf_group_cluster: {
                                type: ["string", "null"]
                            }
                        },
                        required: ["id", "is_narrative", "is_background", "summary", "in_world_reference", "grouping", "tags", "sf_group_cluster"]
                    }
                }
            },
            required: ["results"]
        };

        const result = await callClaude(prompt, {
            model: 'haiku',
            outputFormat: 'json',
            jsonSchema: analysisSchema
        });

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        const responseSizeBytes = Buffer.byteLength(result, 'utf8');

        console.log('End time:', new Date().toISOString());
        console.log('Duration:', duration.toFixed(2), 'seconds');
        console.log('Response size:', result.length, 'characters');
        console.log('Response size:', (responseSizeBytes / 1024).toFixed(2), 'KB');

        const parsed = JSON.parse(result);
        console.log('Parsed successfully:', parsed.results ? parsed.results.length : 0, 'results');
        console.log('=== TEST COMPLETE ===\n');

        res.json({
            success: true,
            duration: parseFloat(duration.toFixed(2)),
            promptSize: {
                characters: prompt.length,
                kilobytes: parseFloat((promptSizeBytes / 1024).toFixed(2))
            },
            responseSize: {
                characters: result.length,
                kilobytes: parseFloat((responseSizeBytes / 1024).toFixed(2))
            },
            result: parsed
        });

    } catch (error) {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.error('Test failed after', duration.toFixed(2), 'seconds');
        console.error('Error:', error.message);
        console.log('=== TEST FAILED ===\n');

        res.status(500).json({
            success: false,
            duration: parseFloat(duration.toFixed(2)),
            error: error.message
        });
    }
});

// Endpoint 2: Generate Report (uses user-selected model)
app.post('/api/generate', requireAuth, async (req, res) => {
    try {
        const { systemPrompt, userPrompt, model } = req.body;

        if (!systemPrompt || !userPrompt) {
            return res.status(400).json({ error: 'Both systemPrompt and userPrompt required' });
        }

        if (!['sonnet', 'opus'].includes(model)) {
            return res.status(400).json({ error: 'Invalid model. Use sonnet or opus.' });
        }

        // Define JSON schema to enforce structured output
        const reportSchema = {
            type: "object",
            properties: {
                html: {
                    type: "string",
                    description: "Complete HTML case report body content (no wrapper tags)"
                }
            },
            required: ["html"]
        };

        const result = await callClaude(userPrompt, {
            model,
            outputFormat: 'json',
            systemPrompt,
            jsonSchema: reportSchema,
            tools: '' // Disable all tools for report generation
        });

        // Debug: Log result structure
        console.log('Report generation result type:', typeof result);
        console.log('Report generation result (first 300 chars):', result.substring(0, 300));

        // Parse JSON and extract HTML
        let parsed;
        try {
            parsed = JSON.parse(result);
            console.log('Successfully parsed JSON. Keys:', Object.keys(parsed));
            console.log('Parsed object structure:', JSON.stringify(parsed, null, 2).substring(0, 500));
        } catch (parseError) {
            console.error('JSON parse error:', parseError.message);
            console.error('Raw result:', result.substring(0, 500));
            throw parseError;
        }

        // Extract HTML from response
        const htmlContent = parsed.html || parsed;

        console.log('Extracted htmlContent type:', typeof htmlContent);
        console.log('Extracted htmlContent (first 200 chars):',
            typeof htmlContent === 'string' ? htmlContent.substring(0, 200) : JSON.stringify(htmlContent).substring(0, 200));

        // VALIDATION: Ensure response is valid HTML content (single comprehensive check)
        if (typeof htmlContent !== 'string') {
            console.error('Unexpected response format. Parsed:', JSON.stringify(parsed, null, 2).substring(0, 1000));
            throw new Error('Response did not contain HTML string');
        }

        if (!htmlContent || htmlContent.trim().length === 0) {
            console.error('Generated report is empty');
            throw new Error('Generated report is empty');
        }

        // Detect conversational wrapper text (indicates schema validation failure)
        const conversationalPhrases = ['I\'ve generated', 'I have generated', 'Would you like', 'I need to', 'Let me', 'Here is'];
        const firstLine = htmlContent.substring(0, 150).toLowerCase();
        if (conversationalPhrases.some(phrase => firstLine.includes(phrase.toLowerCase()))) {
            console.error('❌ Conversational text detected instead of HTML report:');
            console.error('   First 200 chars:', htmlContent.substring(0, 200));
            throw new Error('Response contains conversational wrapper instead of HTML report. Schema validation may have failed.');
        }

        console.log('✅ Validation passed. HTML length:', htmlContent.length);
        res.send(htmlContent);

    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({
            error: error.message,
            details: 'Failed to generate report. Check server logs.'
        });
    }
});

// ===== JOURNALIST PIPELINE ENDPOINTS (Protected) =====

/**
 * GET /api/journalist/sessions
 * List all available sessions
 */
app.get('/api/journalist/sessions', requireAuth, async (req, res) => {
    try {
        const sessionIds = await sessionManager.listSessions();

        // Get state summary for each session
        const sessions = await Promise.all(
            sessionIds.map(async (id) => {
                const state = await sessionManager.getSessionState(id);
                return {
                    id,
                    phase: state?.phase || '0',
                    hasArticle: state?.hasArticle || false,
                    lastModified: state?.files?.output?.length > 0 ? 'has output' : 'in progress'
                };
            })
        );

        res.json({ sessions });
    } catch (error) {
        console.error('Error listing sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/journalist/sessions/:id
 * Get full state for a specific session
 */
app.get('/api/journalist/sessions/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const state = await sessionManager.getSessionState(id);

        if (!state) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json(state);
    } catch (error) {
        console.error('Error getting session:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/journalist/run
 * Phase router - executes the specified phase of the journalist pipeline
 *
 * Body: { phase: "1.1" | "1.2" | "1.3" | "1.4" | ... , sessionId: string, data?: object }
 */
app.post('/api/journalist/run', requireAuth, async (req, res) => {
    try {
        const { phase, sessionId, data } = req.body;

        if (!phase || !sessionId) {
            return res.status(400).json({ error: 'phase and sessionId are required' });
        }

        console.log(`[${new Date().toISOString()}] Journalist phase ${phase} for session ${sessionId}`);

        // Route to appropriate phase handler
        let result;
        switch (phase) {
            case '1.1':
                // Initialize session with config
                result = await runPhase1_1(sessionId, data);
                break;

            case '1.2':
                // Save director notes
                result = await runPhase1_2(sessionId, data);
                break;

            case '1.3':
                // Fetch memory tokens from Notion
                result = await runPhase1_3(sessionId, data);
                break;

            case '1.4':
                // Save selected paper evidence (checkpoint)
                result = await runPhase1_4(sessionId, data);
                break;

            case '1.5':
                // Download visual assets
                result = await runPhase1_5(sessionId, data);
                break;

            case '1.6':
                // Image analysis (parallel via Claude)
                result = await runPhase1_6(sessionId, data);
                break;

            case '1.7':
                // Character identification (checkpoint)
                result = await runPhase1_7(sessionId, data);
                break;

            case '1.8':
                // Build evidence bundle (checkpoint)
                result = await runPhase1_8(sessionId, data);
                break;

            case '2':
                // Arc analysis (checkpoint)
                result = await runPhase2(sessionId, data);
                break;

            case '3':
                // Outline generation (checkpoint)
                result = await runPhase3(sessionId, data);
                break;

            case '4':
                // Article generation
                result = await runPhase4(sessionId, data);
                break;

            case '5':
                // Validation
                result = await runPhase5(sessionId, data);
                break;

            default:
                return res.status(400).json({
                    error: `Phase ${phase} not yet implemented`,
                    implemented: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '2', '3', '4', '5']
                });
        }

        res.json(result);

    } catch (error) {
        console.error(`Journalist phase error:`, error);
        res.status(500).json({ error: error.message });
    }
});

// ===== PHASE HANDLERS =====

/**
 * Phase 1.1: Initialize session with configuration
 * Creates session directory and saves initial config
 */
async function runPhase1_1(sessionId, data) {
    const { roster, accusation, photosPath } = data || {};

    if (!roster || !accusation) {
        throw new Error('roster and accusation are required for phase 1.1');
    }

    // Create session structure
    await sessionManager.createSession(sessionId);

    // Save session config
    const config = {
        sessionId,
        roster,
        accusation,
        photosPath: photosPath || `sessionphotos/${sessionId}`,
        createdAt: new Date().toISOString()
    };

    await sessionManager.saveFile(sessionId, 'inputs/session-config.json', config);

    return {
        success: true,
        phase: '1.1',
        message: 'Session initialized',
        config
    };
}

/**
 * Phase 1.2: Save director notes
 * Stores observations and whiteboard data
 */
async function runPhase1_2(sessionId, data) {
    const { observations, whiteboard } = data || {};

    if (!observations) {
        throw new Error('observations are required for phase 1.2');
    }

    const directorNotes = {
        observations,
        whiteboard: whiteboard || {},
        savedAt: new Date().toISOString()
    };

    await sessionManager.saveFile(sessionId, 'inputs/director-notes.json', directorNotes);

    return {
        success: true,
        phase: '1.2',
        message: 'Director notes saved',
        directorNotes
    };
}

/**
 * Phase 1.3: Fetch memory tokens from Notion
 * Retrieves tokens, optionally filtered by IDs
 */
async function runPhase1_3(sessionId, data) {
    const { tokenIds } = data || {};

    const client = getNotionClient();

    console.log(`[${new Date().toISOString()}] Fetching tokens from Notion...`);
    const result = await client.fetchMemoryTokens(tokenIds);

    // Save to session
    await sessionManager.saveFile(sessionId, 'fetched/tokens.json', result);

    return {
        success: true,
        phase: '1.3',
        message: `Fetched ${result.totalCount} tokens`,
        totalCount: result.totalCount,
        fetchedAt: result.fetchedAt
    };
}

/**
 * Phase 1.4: Save selected paper evidence (checkpoint)
 * Saves user-selected evidence with version tracking
 */
async function runPhase1_4(sessionId, data) {
    const { selectedEvidence, action = 'created', changes = null } = data || {};

    if (!selectedEvidence) {
        throw new Error('selectedEvidence is required for phase 1.4');
    }

    // Save with version tracking (this is a checkpoint phase)
    const version = await sessionManager.saveWithVersion(
        sessionId,
        '1.4',
        'inputs/selected-paper-evidence.json',
        {
            evidence: selectedEvidence,
            selectedAt: new Date().toISOString()
        },
        action,
        changes
    );

    return {
        success: true,
        phase: '1.4',
        message: 'Paper evidence selection saved',
        version,
        evidenceCount: selectedEvidence.length
    };
}

/**
 * Phase 1.5: Download visual assets
 * Downloads attachments from selected paper evidence and copies session photos
 */
async function runPhase1_5(sessionId, data) {
    const { photosPath } = data || {};

    const client = getNotionClient();

    // Load selected evidence
    const selectedEvidence = await sessionManager.readFile(sessionId, 'inputs/selected-paper-evidence.json');
    const sessionConfig = await sessionManager.readFile(sessionId, 'inputs/session-config.json');

    const assetsDir = path.join(sessionManager.getSessionPath(sessionId), 'assets');
    const notionDir = path.join(assetsDir, 'notion');
    const photosDir = path.join(assetsDir, 'photos');

    // Ensure directories exist
    await fs.promises.mkdir(notionDir, { recursive: true });
    await fs.promises.mkdir(photosDir, { recursive: true });

    // Download Notion attachments
    console.log(`[${new Date().toISOString()}] Downloading Notion attachments...`);
    const downloadedFiles = [];

    for (const item of selectedEvidence.evidence || []) {
        if (item.files && item.files.length > 0) {
            for (const file of item.files) {
                try {
                    const localPath = await client.downloadFile(file.url, notionDir, file.name);
                    downloadedFiles.push({ name: file.name, localPath, source: 'notion' });
                } catch (err) {
                    console.error(`Failed to download ${file.name}:`, err.message);
                }
            }
        }
    }

    // Copy session photos
    const sourcePhotosPath = photosPath || sessionConfig.photosPath || `sessionphotos/${sessionId}`;
    const fullSourcePath = path.resolve(path.join(__dirname, '..', sourcePhotosPath));

    console.log(`[${new Date().toISOString()}] Copying session photos from ${fullSourcePath}...`);

    try {
        const photoFiles = await fs.promises.readdir(fullSourcePath);
        for (const photo of photoFiles) {
            if (/\.(jpg|jpeg|png|gif|webp)$/i.test(photo)) {
                const src = path.join(fullSourcePath, photo);
                const dest = path.join(photosDir, photo);
                await fs.promises.copyFile(src, dest);
                downloadedFiles.push({ name: photo, localPath: dest, source: 'photos' });
            }
        }
    } catch (err) {
        console.error(`Failed to copy photos from ${fullSourcePath}:`, err.message);
    }

    // Save download manifest
    await sessionManager.saveFile(sessionId, 'fetched/assets-manifest.json', {
        downloadedAt: new Date().toISOString(),
        files: downloadedFiles
    });

    return {
        success: true,
        phase: '1.5',
        message: `Downloaded ${downloadedFiles.length} assets`,
        notionFiles: downloadedFiles.filter(f => f.source === 'notion').length,
        photoFiles: downloadedFiles.filter(f => f.source === 'photos').length
    };
}

/**
 * Phase 1.6: Image analysis (parallel via Claude)
 * Analyzes each image for content, people, and context
 */
async function runPhase1_6(sessionId, data) {
    const assetsDir = path.join(sessionManager.getSessionPath(sessionId), 'assets');
    const photosDir = path.join(assetsDir, 'photos');

    // Get list of photos
    let photos = [];
    try {
        const files = await fs.promises.readdir(photosDir);
        photos = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    } catch (err) {
        throw new Error(`No photos found in ${photosDir}: ${err.message}`);
    }

    if (photos.length === 0) {
        throw new Error('No photos to analyze. Run phase 1.5 first.');
    }

    console.log(`[${new Date().toISOString()}] Analyzing ${photos.length} images...`);

    const analyses = [];

    // Analyze photos in parallel (batches of 3)
    const BATCH_SIZE = 3;
    for (let i = 0; i < photos.length; i += BATCH_SIZE) {
        const batch = photos.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (photo) => {
            const photoPath = path.join(photosDir, photo);
            const prompt = `Analyze this photo from a social deduction game session. Describe:
1. What is happening in the scene?
2. How many people are visible and what are they doing?
3. What is the setting/location?
4. Any notable objects, papers, or evidence visible?
5. The emotional tone or energy of the moment.

Be specific and observational. This will be used to identify characters and place the photo in a narrative article.`;

            try {
                const result = await callClaude(prompt, {
                    model: 'sonnet',
                    outputFormat: 'json',
                    jsonSchema: {
                        type: 'object',
                        properties: {
                            scene: { type: 'string' },
                            peopleCount: { type: 'number' },
                            actions: { type: 'array', items: { type: 'string' } },
                            setting: { type: 'string' },
                            visibleEvidence: { type: 'array', items: { type: 'string' } },
                            emotionalTone: { type: 'string' },
                            suggestedCaption: { type: 'string' }
                        },
                        required: ['scene', 'peopleCount', 'setting', 'emotionalTone']
                    },
                    systemPrompt: 'You are analyzing photos from a murder mystery social deduction game. Be descriptive and observational.'
                });

                return {
                    filename: photo,
                    path: photoPath,
                    analysis: typeof result === 'string' ? JSON.parse(result) : result,
                    analyzedAt: new Date().toISOString()
                };
            } catch (err) {
                console.error(`Failed to analyze ${photo}:`, err.message);
                return {
                    filename: photo,
                    path: photoPath,
                    analysis: null,
                    error: err.message
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        analyses.push(...batchResults);
    }

    // Save combined analysis
    await sessionManager.saveFile(sessionId, 'analysis/image-analyses-combined.json', {
        analyzedAt: new Date().toISOString(),
        totalPhotos: photos.length,
        analyses
    });

    return {
        success: true,
        phase: '1.6',
        message: `Analyzed ${analyses.length} images`,
        successCount: analyses.filter(a => a.analysis !== null).length,
        errorCount: analyses.filter(a => a.analysis === null).length
    };
}

/**
 * Phase 1.7: Character identification (checkpoint)
 * User identifies characters in each photo
 */
async function runPhase1_7(sessionId, data) {
    const { characterIds, action = 'created', changes = null } = data || {};

    if (!characterIds) {
        throw new Error('characterIds is required for phase 1.7');
    }

    // Load existing analysis for reference
    const imageAnalysis = await sessionManager.readFile(sessionId, 'analysis/image-analyses-combined.json');

    // Merge character IDs with analysis
    const enrichedAnalysis = {
        ...imageAnalysis,
        characterIdsAt: new Date().toISOString(),
        analyses: imageAnalysis.analyses.map(analysis => {
            const charIds = characterIds.find(c => c.filename === analysis.filename);
            return {
                ...analysis,
                identifiedCharacters: charIds?.characters || [],
                location: charIds?.location || analysis.analysis?.setting || 'Unknown'
            };
        })
    };

    // Save enriched analysis with version tracking
    const version = await sessionManager.saveWithVersion(
        sessionId,
        '1.7',
        'analysis/image-analyses-combined.json',
        enrichedAnalysis,
        action,
        changes
    );

    // Also save standalone character IDs
    await sessionManager.saveFile(sessionId, 'inputs/character-ids.json', {
        savedAt: new Date().toISOString(),
        characterIds
    });

    return {
        success: true,
        phase: '1.7',
        message: 'Character identifications saved',
        version,
        photosWithIds: characterIds.length
    };
}

/**
 * Phase 1.8: Build evidence bundle (checkpoint)
 * Curates evidence using Claude, user can review/edit
 */
async function runPhase1_8(sessionId, data) {
    const { editedBundle, action = 'created', changes = null } = data || {};

    // If user is editing an existing bundle
    if (editedBundle) {
        const version = await sessionManager.saveWithVersion(
            sessionId,
            '1.8',
            'analysis/evidence-bundle.json',
            editedBundle,
            action,
            changes
        );

        return {
            success: true,
            phase: '1.8',
            message: 'Evidence bundle updated',
            version,
            isEdit: true
        };
    }

    // Load all inputs for bundle curation
    const sessionConfig = await sessionManager.readFile(sessionId, 'inputs/session-config.json');
    const directorNotes = await sessionManager.readFile(sessionId, 'inputs/director-notes.json');
    const tokens = await sessionManager.readFile(sessionId, 'fetched/tokens.json');
    const selectedEvidence = await sessionManager.readFile(sessionId, 'inputs/selected-paper-evidence.json');
    const imageAnalysis = await sessionManager.readFile(sessionId, 'analysis/image-analyses-combined.json');

    // Get prompt builder
    const builder = getPromptBuilder();

    // Build curator prompt
    const prompt = `You are curating an evidence bundle for a NovaNews investigative article.

ROSTER: ${sessionConfig.roster.join(', ')}
ACCUSATION: ${sessionConfig.accusation}

DIRECTOR OBSERVATIONS (PRIMARY WEIGHT):
${JSON.stringify(directorNotes.observations, null, 2)}

WHITEBOARD:
${JSON.stringify(directorNotes.whiteboard, null, 2)}

MEMORY TOKENS (${tokens.totalCount} total):
${JSON.stringify(tokens.tokens?.slice(0, 20), null, 2)}
${tokens.totalCount > 20 ? `... and ${tokens.totalCount - 20} more` : ''}

SELECTED PAPER EVIDENCE:
${JSON.stringify(selectedEvidence.evidence, null, 2)}

IMAGE ANALYSES:
${JSON.stringify(imageAnalysis.analyses?.map(a => ({
    filename: a.filename,
    scene: a.analysis?.scene,
    characters: a.identifiedCharacters
})), null, 2)}

Curate this evidence into a structured bundle with:
1. EXPOSED evidence (full content visible to reporter)
2. BURIED evidence (transaction data only - amounts, accounts, not whose memories)
3. Key narrative threads connecting evidence
4. Recommended photo placements`;

    console.log(`[${new Date().toISOString()}] Curating evidence bundle...`);

    const result = await callClaude(prompt, {
        model: 'sonnet',
        outputFormat: 'json',
        jsonSchema: {
            type: 'object',
            properties: {
                exposed: {
                    type: 'object',
                    properties: {
                        tokens: { type: 'array', items: { type: 'object' } },
                        documents: { type: 'array', items: { type: 'object' } },
                        photos: { type: 'array', items: { type: 'object' } }
                    }
                },
                buried: {
                    type: 'object',
                    properties: {
                        transactions: { type: 'array', items: { type: 'object' } },
                        accounts: { type: 'array', items: { type: 'object' } }
                    }
                },
                narrativeThreads: { type: 'array', items: { type: 'string' } },
                photoRecommendations: { type: 'array', items: { type: 'object' } }
            },
            required: ['exposed', 'buried', 'narrativeThreads']
        },
        systemPrompt: 'You are a NovaNews evidence curator applying the three-layer evidence model.'
    });

    const bundle = typeof result === 'string' ? JSON.parse(result) : result;
    bundle.curatedAt = new Date().toISOString();

    // Save with version tracking
    const version = await sessionManager.saveWithVersion(
        sessionId,
        '1.8',
        'analysis/evidence-bundle.json',
        bundle,
        'created'
    );

    return {
        success: true,
        phase: '1.8',
        message: 'Evidence bundle curated',
        version,
        exposedCount: (bundle.exposed?.tokens?.length || 0) + (bundle.exposed?.documents?.length || 0),
        buriedCount: bundle.buried?.transactions?.length || 0,
        threadCount: bundle.narrativeThreads?.length || 0
    };
}

/**
 * Phase 2: Arc analysis (checkpoint)
 * Analyzes narrative arcs using Opus, user selects arcs + hero image
 */
async function runPhase2(sessionId, data) {
    const { selectedArcs, heroImage, action = 'created', changes = null } = data || {};

    // If user is selecting arcs
    if (selectedArcs) {
        const arcSelection = {
            selectedArcs,
            heroImage,
            selectedAt: new Date().toISOString()
        };

        const version = await sessionManager.saveWithVersion(
            sessionId,
            '2',
            'summaries/arc-summary.json',
            arcSelection,
            action,
            changes
        );

        return {
            success: true,
            phase: '2',
            message: 'Arc selections saved',
            version,
            arcCount: selectedArcs.length
        };
    }

    // Generate arc analysis
    const sessionConfig = await sessionManager.readFile(sessionId, 'inputs/session-config.json');
    const directorNotes = await sessionManager.readFile(sessionId, 'inputs/director-notes.json');
    const evidenceBundle = await sessionManager.readFile(sessionId, 'analysis/evidence-bundle.json');

    const builder = getPromptBuilder();
    const { systemPrompt, userPrompt } = await builder.buildArcAnalysisPrompt({
        roster: sessionConfig.roster,
        accusation: sessionConfig.accusation,
        directorNotes,
        evidenceBundle
    });

    console.log(`[${new Date().toISOString()}] Analyzing narrative arcs with Opus...`);

    const result = await callClaude(userPrompt, {
        model: 'opus',
        outputFormat: 'json',
        systemPrompt,
        jsonSchema: {
            type: 'object',
            properties: {
                narrativeArcs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            hook: { type: 'string' },
                            playerEmphasis: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
                            supportingEvidence: { type: 'array', items: { type: 'string' } },
                            characters: { type: 'array', items: { type: 'string' } }
                        }
                    }
                },
                characterPlacementOpportunities: { type: 'array', items: { type: 'object' } },
                rosterCoverage: { type: 'object' }
            },
            required: ['narrativeArcs', 'rosterCoverage']
        }
    });

    const arcAnalysis = typeof result === 'string' ? JSON.parse(result) : result;
    arcAnalysis.analyzedAt = new Date().toISOString();

    // Save analysis
    await sessionManager.saveFile(sessionId, 'analysis/arc-analysis.json', arcAnalysis);

    return {
        success: true,
        phase: '2',
        message: `Identified ${arcAnalysis.narrativeArcs?.length || 0} narrative arcs`,
        arcCount: arcAnalysis.narrativeArcs?.length || 0,
        arcAnalysis
    };
}

/**
 * Phase 3: Outline generation (checkpoint)
 * Generates article outline, user can approve/edit
 */
async function runPhase3(sessionId, data) {
    const { editedOutline, action = 'created', changes = null } = data || {};

    // If user is editing outline
    if (editedOutline) {
        const version = await sessionManager.saveWithVersion(
            sessionId,
            '3',
            'analysis/article-outline.json',
            editedOutline,
            action,
            changes
        );

        return {
            success: true,
            phase: '3',
            message: 'Outline updated',
            version,
            isEdit: true
        };
    }

    // Generate outline
    const arcAnalysis = await sessionManager.readFile(sessionId, 'analysis/arc-analysis.json');
    const arcSummary = await sessionManager.readFile(sessionId, 'summaries/arc-summary.json');
    const evidenceBundle = await sessionManager.readFile(sessionId, 'analysis/evidence-bundle.json');

    const builder = getPromptBuilder();
    const { systemPrompt, userPrompt } = await builder.buildOutlinePrompt(
        arcAnalysis,
        arcSummary.selectedArcs,
        arcSummary.heroImage,
        evidenceBundle
    );

    console.log(`[${new Date().toISOString()}] Generating article outline with Sonnet...`);

    const result = await callClaude(userPrompt, {
        model: 'sonnet',
        outputFormat: 'json',
        systemPrompt,
        jsonSchema: {
            type: 'object',
            properties: {
                lede: { type: 'object' },
                theStory: { type: 'object' },
                followTheMoney: { type: 'object' },
                thePlayers: { type: 'object' },
                whatsMissing: { type: 'object' }
            },
            required: ['lede', 'theStory', 'followTheMoney', 'thePlayers', 'whatsMissing']
        }
    });

    const outline = typeof result === 'string' ? JSON.parse(result) : result;
    outline.generatedAt = new Date().toISOString();

    // Save with version tracking
    const version = await sessionManager.saveWithVersion(
        sessionId,
        '3',
        'analysis/article-outline.json',
        outline,
        'created'
    );

    return {
        success: true,
        phase: '3',
        message: 'Outline generated',
        version,
        outline
    };
}

/**
 * Phase 4: Article generation
 * Generates full article HTML using Opus
 */
async function runPhase4(sessionId, data) {
    const outline = await sessionManager.readFile(sessionId, 'analysis/article-outline.json');
    const evidenceBundle = await sessionManager.readFile(sessionId, 'analysis/evidence-bundle.json');
    const sessionConfig = await sessionManager.readFile(sessionId, 'inputs/session-config.json');

    const builder = getPromptBuilder();
    const loader = getThemeLoader();
    const template = await loader.loadTemplate();

    const { systemPrompt, userPrompt } = await builder.buildArticlePrompt(
        outline,
        evidenceBundle,
        template
    );

    console.log(`[${new Date().toISOString()}] Generating article with Opus...`);

    const result = await callClaude(userPrompt, {
        model: 'opus',
        outputFormat: 'text',
        systemPrompt
    });

    // Extract HTML from result (may be wrapped in markdown code blocks)
    let articleHtml = result;
    const htmlMatch = result.match(/```html\n?([\s\S]*?)```/);
    if (htmlMatch) {
        articleHtml = htmlMatch[1];
    }

    // Save article
    await sessionManager.saveFile(sessionId, 'output/article.html', articleHtml, false);

    // Save metadata
    await sessionManager.saveFile(sessionId, 'output/article-metadata.json', {
        generatedAt: new Date().toISOString(),
        roster: sessionConfig.roster,
        accusation: sessionConfig.accusation,
        model: 'opus'
    });

    return {
        success: true,
        phase: '4',
        message: 'Article generated',
        articleLength: articleHtml.length
    };
}

/**
 * Phase 5: Validation
 * Checks article for anti-patterns and quality issues
 */
async function runPhase5(sessionId, data) {
    const articleHtml = await sessionManager.readFile(sessionId, 'output/article.html', false);
    const sessionConfig = await sessionManager.readFile(sessionId, 'inputs/session-config.json');

    const builder = getPromptBuilder();
    const { systemPrompt, userPrompt } = await builder.buildValidationPrompt(
        articleHtml,
        sessionConfig.roster
    );

    console.log(`[${new Date().toISOString()}] Validating article...`);

    const result = await callClaude(userPrompt, {
        model: 'sonnet',
        outputFormat: 'json',
        systemPrompt,
        jsonSchema: {
            type: 'object',
            properties: {
                passed: { type: 'boolean' },
                issues: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string' },
                            severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
                            description: { type: 'string' },
                            location: { type: 'string' },
                            suggestion: { type: 'string' }
                        }
                    }
                },
                voice_score: { type: 'number' },
                roster_coverage: {
                    type: 'object',
                    properties: {
                        mentioned: { type: 'array', items: { type: 'string' } },
                        missing: { type: 'array', items: { type: 'string' } }
                    }
                }
            },
            required: ['passed', 'issues', 'voice_score', 'roster_coverage']
        }
    });

    const validation = typeof result === 'string' ? JSON.parse(result) : result;
    validation.validatedAt = new Date().toISOString();

    // Save validation results
    await sessionManager.saveFile(sessionId, 'output/validation-results.json', validation);

    return {
        success: true,
        phase: '5',
        message: validation.passed ? 'Article passed validation' : 'Article has issues',
        passed: validation.passed,
        issueCount: validation.issues?.length || 0,
        voiceScore: validation.voice_score,
        rosterCoverage: validation.roster_coverage
    };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    // Simple health check - just verify server is running
    // Claude CLI availability is tested on actual usage
    res.json({
        status: 'ok',
        message: 'Server running',
        timestamp: new Date().toISOString(),
        endpoints: {
            analyze: '/api/analyze (POST)',
            generate: '/api/generate (POST)',
            config: '/api/config (GET)',
            journalist: {
                sessions: '/api/journalist/sessions (GET)',
                sessionState: '/api/journalist/sessions/:id (GET)',
                run: '/api/journalist/run (POST)'
            }
        }
    });
});

// Config endpoint - serves environment variables to frontend (protected)
app.get('/api/config', requireAuth, (req, res) => {
    res.json({
        notionToken: process.env.NOTION_TOKEN || ''
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'detlogv3.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         ALN Director Console - Server Running            ║
║                                                           ║
║  Local Access:    http://localhost:${PORT}                   ║
║                                                           ║
║  Share with teammates:                                    ║
║  - Local network: http://[your-ip]:${PORT}                   ║
║  - Internet:      Use cloudflared or ngrok               ║
║                                                           ║
║  Using Console MAX via Claude Code CLI                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
    console.log('Press Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully...');
    process.exit(0);
});
