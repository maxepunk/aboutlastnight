# System Prompt Architecture Fix

**Date:** 2025-11-22
**Issue:** Claude responding conversationally ("Would you like me to save this?") instead of generating report directly

## Root Cause

Mixing **system-level instructions** with **user-level data** in a single prompt caused Claude to treat the interaction as a conversation, not a task.

**Old approach:**
```javascript
const prompt = `You are Detective Anondono... [instructions]
Here's the evidence: [data]`;

callClaude(prompt) // Everything in user message
```

**Result:** Claude responded: "I've drafted a complete report... Would you like me to save this?"

---

## The Fix: Proper CLI Tooling

### Claude Code CLI Features Utilized

1. **`--system-prompt`** - Separates character/instructions from data
2. **`--json-schema`** - Enforces structured output format
3. **`--output-format json`** - Returns parseable JSON
4. **`--tools ""`** - Disables file operations (report gen doesn't need tools)

### New Architecture

**server.js:**
```javascript
// Define schema to enforce output structure
const reportSchema = {
    type: "object",
    properties: {
        html: {
            type: "string",
            description: "Complete HTML case report body"
        }
    },
    required: ["html"]
};

callClaude(userPrompt, {
    model: 'claude-sonnet-4-5',
    outputFormat: 'json',
    systemPrompt,      // ← Character + instructions
    jsonSchema: reportSchema,  // ← Force JSON structure
    tools: ''          // ← Disable file tools
});
```

**detlogv3.html (frontend):**
```javascript
// SYSTEM PROMPT: WHO you are and HOW to respond
const systemPromptFinal = `${systemPrompt}

DETECTIVE VOICE / STYLE GUIDE:
...voice samples...

OUTPUT FORMAT:
Return JSON with "html" field containing report.
Do NOT include conversational text.`;

// USER PROMPT: WHAT to analyze
const userPromptFinal = `Generate case report using:

CASE METADATA: ...
EVIDENCE INVENTORY: ...`;

// Send separately
fetch('/api/generate', {
    body: JSON.stringify({
        systemPrompt: systemPromptFinal,
        userPrompt: userPromptFinal,
        model: reportModelId
    })
});
```

---

## Changes Made

### 1. Backend (server.js)

**Added to `callClaude()` function:**
- `systemPrompt` parameter
- `jsonSchema` parameter
- `tools` parameter

**Updated `/api/generate` endpoint:**
- Now accepts `systemPrompt` and `userPrompt` (not single `prompt`)
- Enforces JSON schema for structured output
- Disables tools with `--tools ""`
- Extracts HTML from `parsed.html` field

### 2. Frontend (detlogv3.html)

**Split prompt construction:**
- System prompt = character + instructions + output format
- User prompt = case data + evidence only

**Updated fetch call:**
- Sends both `systemPrompt` and `userPrompt`
- Backend handles JSON extraction

---

## Why This Works

### Before:
```
User Message: "You are a detective. Write a report. Here's evidence: ..."
```
→ Claude interprets as conversation
→ Responds conversationally: "I've drafted... Would you like...?"

### After:
```
System Message: "You are a detective. Output JSON with 'html' field. No conversation."
User Message: "Here's evidence: ..."
JSON Schema: { required: ["html"] }
```
→ Claude interprets as structured task
→ Must output valid JSON matching schema
→ Cannot add conversational text (schema violation)

---

## Testing

**Restart server and test:**
```bash
Ctrl+C
start.bat
```

**Expected behavior:**
1. Generate report button clicked
2. Server logs show:
   - `Report generation result (first 200 chars): {"html":"<h2>Executive...`
   - `Parsed keys: [ 'html' ]`
   - `Extracted HTML length: 12543`
3. Report renders immediately (no conversational response)

**If still seeing issues:**
- Check server console for logged result structure
- Verify JSON schema is being enforced
- Ensure system prompt includes "no conversational text" instruction

---

## Benefits

1. ✅ **Eliminates conversational responses** - Schema enforcement prevents chatty output
2. ✅ **Cleaner separation of concerns** - System vs user messages
3. ✅ **Better error handling** - JSON parsing catches malformed responses
4. ✅ **Tool isolation** - Report generation doesn't need file access
5. ✅ **Scalable pattern** - Can apply to other endpoints

---

## Rollback

If issues arise:
```bash
git diff server.js detlogv3.html
git checkout HEAD -- server.js detlogv3.html
```

Or restore from backup files in git history.
