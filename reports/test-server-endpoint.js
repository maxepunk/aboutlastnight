#!/usr/bin/env node
/**
 * Test the /api/generate endpoint
 * Make sure server.js is running before running this test
 */

async function testGenerateEndpoint() {
    const testPayload = {
        systemPrompt: `You are a cynical, seasoned Detective in a near-future noir setting.
You are writing an official Case Report.

TONE: Professional, analytical, but with a distinct noir flair.
FORMAT: HTML (body content only, NO <html>, <head>, or <body> tags).
STRUCTURE:
- Use <h2> for main section headers
- Use <p> for paragraphs

Generate a brief detective report with just one section.`,

        userPrompt: `Generate a case report:

CASE METADATA:
ID: MC-2025-TEST | Date: 2025-11-22 | Location: Test Lab

GAME LOGS:
Test run of detective report generator.

EVIDENCE INVENTORY (1 Item):
---
ID: TEST-001
NAME: Test Evidence
TYPE: Document
DETAILS: A simple test document for verification.
THREADS: Testing
---`,

        model: 'claude-sonnet-4-5'
    };

    console.log('Testing /api/generate endpoint...\n');
    console.log('System prompt length:', testPayload.systemPrompt.length);
    console.log('User prompt length:', testPayload.userPrompt.length);
    console.log('Model:', testPayload.model);
    console.log('\nSending request...\n');

    try {
        const response = await fetch('http://localhost:3000/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload)
        });

        if (!response.ok) {
            const error = await response.json();
            console.log('❌ Request failed:', response.status);
            console.log('Error:', error);
            return;
        }

        const htmlContent = await response.text();

        console.log('✅ SUCCESS!\n');
        console.log('Response type:', response.headers.get('content-type'));
        console.log('Response length:', htmlContent.length, 'characters');
        console.log('\n' + '='.repeat(80));
        console.log('HTML CONTENT:');
        console.log('='.repeat(80));
        console.log(htmlContent);
        console.log('='.repeat(80));

        // Validate it's actually HTML
        if (htmlContent.includes('<h2>') && htmlContent.includes('</h2>')) {
            console.log('\n✅ Valid HTML detected (contains <h2> tags)');
        } else {
            console.log('\n⚠️ Warning: Response might not be valid HTML');
        }

        // Check for conversational text (the old bug)
        if (htmlContent.includes("I've generated") || htmlContent.includes("Would you like")) {
            console.log('⚠️ WARNING: Response contains conversational text!');
        } else {
            console.log('✅ No conversational wrapper detected');
        }

    } catch (error) {
        console.log('❌ Request failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Hint: Make sure the server is running (npm start)');
        }
    }
}

testGenerateEndpoint();
