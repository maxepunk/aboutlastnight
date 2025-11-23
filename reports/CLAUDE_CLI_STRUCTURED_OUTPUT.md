# Claude CLI Structured Output - Technical Reference

## Summary

This document explains how to properly use Claude CLI's `--json-schema` flag for structured output validation, based on debugging the ALN Director Console report generator.

## The Problem (Before Fix)

When using `--json-schema`, the server was extracting conversational text ("I've generated a brief detective report...") instead of the actual HTML report.

**Symptom:** Report generation returned meta-commentary instead of content.

## Root Cause

Claude CLI returns **two separate fields** when using `--json-schema`:

```json
{
  "result": "I've generated a brief detective report...",  // Conversational wrapper
  "structured_output": {                                   // ✅ Validated structured data
    "html": "<h2>Executive Summary</h2>..."
  },
  "session_id": "...",
  "total_cost_usd": 0.123,
  ...other metadata...
}
```

**The bug:** Code was extracting `wrapper.result` (conversational) instead of `wrapper.structured_output` (actual data).

## The Solution

### Updated `callClaude()` Function (server.js)

```javascript
if (outputFormat === 'json') {
    try {
        const wrapper = JSON.parse(finalResult);

        // When using --json-schema, Claude returns validated data in structured_output
        if (wrapper.structured_output) {
            console.log('Extracting from structured_output (JSON schema validation)');
            // Return the validated structured output as JSON string
            finalResult = JSON.stringify(wrapper.structured_output);
        } else {
            // Legacy path: Extract from result field (for non-schema requests)
            let actualResult = wrapper.result || finalResult;
            // ... existing markdown fence parsing ...
            finalResult = actualResult.trim();
        }
    } catch (e) {
        console.warn('Failed to parse Claude JSON wrapper, using raw output:', e.message);
    }
}

resolve(finalResult);
```

### Data Flow

1. **Client Request** → `/api/generate` with `systemPrompt` and `userPrompt`
2. **Server Calls** → `callClaude(userPrompt, { jsonSchema, systemPrompt, ... })`
3. **Claude CLI Returns** → `{result: "...", structured_output: {html: "..."}, ...}`
4. **Server Extracts** → `wrapper.structured_output` → `{html: "..."}`
5. **Server Stringifies** → `JSON.stringify(...)` → `'{"html": "..."}'`
6. **Endpoint Receives** → `result` variable contains `'{"html": "..."}'`
7. **Endpoint Parses** → `JSON.parse(result)` → `{html: "..."}`
8. **Endpoint Extracts** → `parsed.html` → `"<h2>Report...</h2>"`
9. **Client Receives** → Clean HTML content

## Claude CLI Flags Reference

### Flags We Use

| Flag | Purpose | Example |
|------|---------|---------|
| `-p`, `--print` | Non-interactive mode | `claude -p "prompt"` |
| `--output-format json` | Return structured wrapper | `--output-format json` |
| `--json-schema <schema>` | Validate output structure | `--json-schema '{"type":"object",...}'` |
| `--system-prompt <text>` | Set system instructions | `--system-prompt "You are a detective"` |
| `--tools <tools>` | Control tool access | `--tools ""` (disable all) |
| `--model <model>` | Choose model | `--model claude-sonnet-4-5` |

### Response Structure Differences

**Without `--json-schema`:**
```json
{
  "result": "{\"html\": \"<h2>...</h2>\"}",  // May contain markdown fences
  "session_id": "...",
  ...
}
```

**With `--json-schema`:**
```json
{
  "result": "I've generated a report...",      // Conversational wrapper
  "structured_output": {                       // ✅ Validated against schema
    "html": "<h2>...</h2>"
  },
  "session_id": "...",
  ...
}
```

## Best Practices

### 1. Use `structured_output` When Available

Always check for `wrapper.structured_output` first when using `--json-schema`:

```javascript
const wrapper = JSON.parse(claudeOutput);

if (wrapper.structured_output) {
    // Schema validation was used - this is validated data
    return wrapper.structured_output;
} else {
    // No schema - extract from result field
    return parseResult(wrapper.result);
}
```

### 2. Schema Design

Keep schemas simple and focused:

```javascript
// ✅ Good: Single field for content
{
    type: "object",
    properties: {
        html: {
            type: "string",
            description: "Complete HTML case report body content"
        }
    },
    required: ["html"]
}

// ❌ Too complex: Multiple nested fields
{
    type: "object",
    properties: {
        report: {
            type: "object",
            properties: {
                sections: {
                    type: "array",
                    items: { ... }
                }
            }
        }
    }
}
```

### 3. System Prompt Strategy

**Split responsibilities:**
- **System Prompt**: Character, tone, formatting instructions
- **User Prompt**: Data, facts, content to analyze

```javascript
const systemPrompt = `You are a detective. Use noir tone.
FORMAT: Return JSON with "html" field containing HTML body content.`;

const userPrompt = `Generate a case report:
CASE METADATA: ...
EVIDENCE: ...`;

await callClaude(userPrompt, { systemPrompt, jsonSchema });
```

### 4. Tool Control

When generating structured output, disable tools to prevent interruptions:

```javascript
await callClaude(prompt, {
    jsonSchema: reportSchema,
    tools: ''  // Disable all tools - just generate content
});
```

## Testing

### Test Suite

Run diagnostics:
```bash
node test-claude-cli.js       # Test all flag combinations
node test-actual-response.js  # Inspect response structure
node test-server-endpoint.js  # Test full integration
```

### Verification Checklist

- [ ] `structured_output` field present in response
- [ ] HTML validates (contains expected tags)
- [ ] No conversational wrappers in final output
- [ ] Proper detective noir tone maintained
- [ ] Schema validation enforced (malformed responses rejected)

## Common Issues

### "Response did not contain HTML string"

**Cause:** Extracting from wrong field (probably `result` instead of `structured_output`)

**Fix:** Check `wrapper.structured_output` first

### Process exits with code null

**Cause (Original Report):** Previous session claimed this, but testing showed all flags work correctly. Likely causes:
- Prompt too large (>100K tokens)
- Network timeout
- Memory limit exceeded

**Fix:** Reduce prompt size, increase timeout, or simplify schema

### Conversational text in output

**Cause:** Using `wrapper.result` when `wrapper.structured_output` is available

**Fix:** Implement structured_output extraction path

## Performance Notes

- Analysis (Haiku): ~4-5s per batch of 15 items
- Report Generation (Sonnet): ~15-20s for full report
- Report Generation (Opus): ~30-45s for highest quality

## Architecture Comparison

### Gemini Approach (detlogv2.html)
```javascript
// Single unified prompt, no JSON schema
const response = await fetch(geminiAPI, {
    body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.7 }  // No JSON enforcement
    })
});

// Get HTML directly from result
const html = data.candidates[0].content.parts[0].text;
```

### Claude Approach (detlogv3.html - Fixed)
```javascript
// Split prompt + JSON schema validation
await callClaude(userPrompt, {
    systemPrompt: characterInstructions,
    jsonSchema: { type: "object", properties: { html: {...} } },
    outputFormat: 'json',
    tools: ''
});

// Extract from structured_output
const parsed = JSON.parse(result);
const html = parsed.html;  // Validated against schema
```

**Trade-offs:**
- **Gemini:** Simpler, faster, but less enforcement
- **Claude:** More robust validation, structured output guaranteed, but more complex parsing

## Credits

Fixed by Claude Code during debugging session 2025-11-22.
Issue discovered through systematic testing of CLI flags and response structure analysis.
