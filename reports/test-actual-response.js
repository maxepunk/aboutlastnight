#!/usr/bin/env node
/**
 * Test to see the ACTUAL response structure with JSON schema
 */

const { spawn } = require('child_process');

async function testWithSchema() {
    console.log('Testing with JSON schema...\n');

    const schema = {
        type: "object",
        properties: {
            html: {
                type: "string",
                description: "HTML content"
            }
        },
        required: ["html"]
    };

    const args = [
        '-p',
        '--output-format', 'json',
        '--model', 'claude-haiku-4-5',
        '--system-prompt', 'You are a detective. Return JSON with an "html" field containing HTML report body.',
        '--json-schema', JSON.stringify(schema),
        '--tools', ''
    ];

    const prompt = 'Generate a brief detective report in HTML format. Use <h2>Executive Summary</h2> and one paragraph.';

    return new Promise((resolve) => {
        const claude = spawn('claude', args);

        let stdout = '';
        let stderr = '';

        claude.stdout.on('data', (data) => stdout += data.toString());
        claude.stderr.on('data', (data) => stderr += data.toString());

        claude.on('close', (code) => {
            if (code !== 0) {
                console.log(`❌ Failed with code ${code}`);
                console.log('Stderr:', stderr);
                return;
            }

            console.log('✅ Success!\n');
            console.log('RAW OUTPUT:');
            console.log('='.repeat(80));
            console.log(stdout);
            console.log('='.repeat(80));

            try {
                const parsed = JSON.parse(stdout);
                console.log('\nPARSED STRUCTURE:');
                console.log('Top-level keys:', Object.keys(parsed).join(', '));

                if (parsed.structured_output) {
                    console.log('\n📦 structured_output present!');
                    console.log('Type:', typeof parsed.structured_output);
                    if (typeof parsed.structured_output === 'string') {
                        console.log('Content (first 200 chars):', parsed.structured_output.substring(0, 200));
                        // Try parsing if it's a string
                        try {
                            const innerParsed = JSON.parse(parsed.structured_output);
                            console.log('Inner parsed keys:', Object.keys(innerParsed).join(', '));
                            console.log('HTML field present:', 'html' in innerParsed);
                            if (innerParsed.html) {
                                console.log('HTML content (first 150 chars):', innerParsed.html.substring(0, 150));
                            }
                        } catch (e) {
                            console.log('Not parseable as JSON');
                        }
                    } else {
                        console.log('structured_output is object:', parsed.structured_output);
                    }
                }

                if (parsed.result) {
                    console.log('\n📄 result field:');
                    console.log('Type:', typeof parsed.result);
                    console.log('Content (first 200 chars):', parsed.result.substring(0, 200));
                }

                console.log('\n💡 EXTRACTION LOGIC FOR server.js:');
                console.log('━'.repeat(80));

                if (parsed.structured_output) {
                    const structuredData = typeof parsed.structured_output === 'string'
                        ? JSON.parse(parsed.structured_output)
                        : parsed.structured_output;

                    if (structuredData.html) {
                        console.log('✅ Extract HTML from: parsed.structured_output.html');
                        console.log('Preview:', structuredData.html.substring(0, 100));
                    }
                } else if (parsed.result) {
                    console.log('⚠️ No structured_output - falling back to result field');
                }

            } catch (e) {
                console.log('❌ Parse error:', e.message);
            }
        });

        claude.stdin.write(prompt);
        claude.stdin.end();
    });
}

testWithSchema();
