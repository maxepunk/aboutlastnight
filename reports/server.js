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

const app = express();
const PORT = 3000;

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
                                // Claude CLI --output-format json returns wrapper object
                                const wrapper = JSON.parse(finalResult);

                                // When using --json-schema, Claude returns validated data in structured_output
                                if (wrapper.structured_output) {
                                    console.log('Extracting from structured_output (JSON schema validation)');
                                    // Return the validated structured output as JSON string
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
            config: '/api/config (GET)'
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
