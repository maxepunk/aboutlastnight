#!/usr/bin/env node
/**
 * Test script to diagnose Claude CLI issues
 * Run with: node test-claude-cli.js
 */

const { spawn } = require('child_process');

// Test 1: Basic prompt with JSON output
async function test1_BasicJSON() {
    console.log('\n=== TEST 1: Basic JSON Output ===');
    return runTest(['-p', '--output-format', 'json', '--model', 'claude-haiku-4-5'],
        'Return a JSON object with a single field "message" containing "Hello World"');
}

// Test 2: JSON output with system prompt
async function test2_WithSystemPrompt() {
    console.log('\n=== TEST 2: JSON Output + System Prompt ===');
    return runTest([
        '-p',
        '--output-format', 'json',
        '--model', 'claude-haiku-4-5',
        '--system-prompt', 'You are a helpful assistant. Always return valid JSON.'
    ], 'Return a JSON object with field "message": "Test successful"');
}

// Test 3: JSON schema validation (the suspected culprit)
async function test3_JSONSchema() {
    console.log('\n=== TEST 3: JSON Schema Validation ===');
    const schema = {
        type: "object",
        properties: {
            message: { type: "string" }
        },
        required: ["message"]
    };

    return runTest([
        '-p',
        '--output-format', 'json',
        '--model', 'claude-haiku-4-5',
        '--json-schema', JSON.stringify(schema)
    ], 'Say hello');
}

// Test 4: All flags combined (matches production code)
async function test4_AllFlags() {
    console.log('\n=== TEST 4: All Flags Combined (Production Config) ===');
    const schema = {
        type: "object",
        properties: {
            html: { type: "string", description: "HTML content" }
        },
        required: ["html"]
    };

    return runTest([
        '-p',
        '--output-format', 'json',
        '--model', 'claude-sonnet-4-5',
        '--system-prompt', 'You are a detective. Return JSON with an "html" field containing HTML.',
        '--json-schema', JSON.stringify(schema),
        '--tools', ''
    ], 'Generate a simple HTML heading: <h2>Test Report</h2>');
}

// Test 5: Large prompt (similar to production size)
async function test5_LargePrompt() {
    console.log('\n=== TEST 5: Large Prompt (Production Size) ===');
    const largePrompt = `
SYSTEM INSTRUCTIONS:
${'You are a detective writing case reports. '.repeat(10)}

EVIDENCE LIST:
${Array.from({length: 20}, (_, i) => `
---
ID: ITEM-${i}
NAME: Evidence Item ${i}
TYPE: Document
DESCRIPTION: ${'Lorem ipsum dolor sit amet. '.repeat(20)}
THREADS: Investigation, Suspects
---
`).join('\n')}

Generate an HTML report with <h2>Executive Summary</h2> and a brief paragraph.
    `.trim();

    return runTest([
        '-p',
        '--output-format', 'json',
        '--model', 'claude-haiku-4-5'
    ], largePrompt);
}

// Helper function to run a test
function runTest(args, prompt) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        console.log(`Args: ${args.join(' ')}`);
        console.log(`Prompt length: ${prompt.length} characters`);

        const claude = spawn('claude', args, { timeout: 60000 });

        let stdout = '';
        let stderr = '';

        claude.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        claude.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        claude.on('close', (code, signal) => {
            const duration = Date.now() - startTime;

            if (code === 0) {
                console.log(`✅ SUCCESS (${duration}ms)`);
                console.log(`Output length: ${stdout.length} chars`);

                // Try to parse if JSON
                if (args.includes('json')) {
                    try {
                        const parsed = JSON.parse(stdout);
                        console.log(`Parsed JSON keys: ${Object.keys(parsed).join(', ')}`);
                    } catch (e) {
                        console.log(`⚠️ JSON parse failed: ${e.message}`);
                        console.log(`First 200 chars: ${stdout.substring(0, 200)}`);
                    }
                }

                resolve({ success: true, code, duration, stdout, stderr });
            } else {
                console.log(`❌ FAILED`);
                console.log(`Exit code: ${code}`);
                console.log(`Signal: ${signal}`);
                console.log(`Duration: ${duration}ms`);
                if (stderr) console.log(`Stderr: ${stderr.substring(0, 500)}`);
                if (stdout) console.log(`Stdout: ${stdout.substring(0, 500)}`);

                resolve({ success: false, code, signal, duration, stdout, stderr });
            }
        });

        claude.on('error', (err) => {
            console.log(`❌ SPAWN ERROR: ${err.message}`);
            resolve({ success: false, error: err.message });
        });

        // Write prompt to stdin
        claude.stdin.write(prompt);
        claude.stdin.end();
    });
}

// Run all tests
(async () => {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   Claude CLI Diagnostic Test Suite                    ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    const results = {
        test1: await test1_BasicJSON(),
        test2: await test2_WithSystemPrompt(),
        test3: await test3_JSONSchema(),
        test4: await test4_AllFlags(),
        test5: await test5_LargePrompt()
    };

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    Object.entries(results).forEach(([name, result]) => {
        const status = result.success ? '✅ PASS' : '❌ FAIL';
        const detail = result.success
            ? `(${result.duration}ms)`
            : result.code !== undefined
                ? `(code: ${result.code}, signal: ${result.signal})`
                : `(error: ${result.error})`;
        console.log(`${status} ${name} ${detail}`);
    });

    console.log('\nRecommendations:');
    if (!results.test3.success) {
        console.log('⚠️ JSON Schema validation is failing - consider alternative approach');
    }
    if (!results.test4.success) {
        console.log('⚠️ Flag combination is problematic - simplify configuration');
    }
    if (!results.test5.success) {
        console.log('⚠️ Large prompts failing - may need to reduce size or use streaming');
    }
    if (results.test1.success && !results.test3.success) {
        console.log('💡 Basic JSON works - use prompt-based approach like Gemini version');
    }
})();
