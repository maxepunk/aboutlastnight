# Architecture Decisions Log

This document tracks significant architectural decisions and divergences from the original implementation plan (`peppy-sauteeing-thunder.md`).

## Overview

These decisions were made during implementation to improve testability, maintainability, and robustness beyond what the original plan specified.

---

## Commit 1: Schema Validation (content-bundle.schema.json + SchemaValidator)

### Decision 1.1: Strict Schema Validation
**Plan:** Basic Ajv configuration
**Implemented:** `strict: true` and `allowUnionTypes: true`

```javascript
this.ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: true,         // ADDED: Catches schema authoring errors
  allowUnionTypes: true // ADDED: Required for oneOf content blocks
});
```

**Rationale:** Strict mode catches subtle schema authoring errors early. `allowUnionTypes` is required because our content blocks use `oneOf` with different object types.

**Impact on Plan:** None. Purely additive safety.

---

### Decision 1.2: additionalProperties: false Throughout Schema
**Plan:** Not specified
**Implemented:** Every object in schema has `additionalProperties: false`

**Rationale:** Prevents LLM from adding unexpected fields that templates don't handle. Catches drift between LLM output and template expectations immediately.

**Impact on Plan:** LLM prompts must be explicit about allowed fields. No "creative additions."

---

### Decision 1.3: Enhanced Error Formatting
**Plan:** Basic error formatting
**Implemented:** Extracts `missingProperty` and `allowedValues` for specific error types

```javascript
formatErrors(errors) {
  return errors.map(err => ({
    path: err.instancePath || '/',
    message: err.message,
    keyword: err.keyword,
    params: err.params,
    ...(err.keyword === 'required' && {
      missingProperty: err.params?.missingProperty
    }),
    ...(err.keyword === 'enum' && {
      allowedValues: err.params?.allowedValues
    })
  }));
}
```

**Rationale:** When validation fails during `generateContentBundle`, we need actionable error messages to feed back to the LLM for revision. Generic errors like "must have required property" aren't useful without knowing WHICH property.

**Impact on Plan:** Commit 5's revision loop will have better error context.

---

### Decision 1.4: Utility Methods (hasSchema, getSchemaNames)
**Plan:** Only `validate()` method
**Implemented:** Added `hasSchema()` and `getSchemaNames()`

**Rationale:** Enables dynamic schema registration (future themes may add schemas) and debugging.

**Impact on Plan:** None. Future flexibility.

---

## Commit 2: Claude Client (claude-client.js)

### Decision 2.1: Retry Logic with Exponential Backoff
**Plan:** Not explicitly mentioned
**Implemented:** `maxRetries` option with exponential backoff

```javascript
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAY_BASE = 1000;

for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    return await executeClaudeProcess(options);
  } catch (error) {
    if (attempt < maxRetries) {
      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Rationale:** Claude CLI can fail transiently (rate limits, network issues). Retrying with backoff prevents single failures from blocking the pipeline.

**Semantics:** `maxRetries=2` means UP TO 3 total attempts (1 initial + 2 retries).

**Impact on Plan:** Nodes don't need their own retry logic. Client handles it.

---

### Decision 2.2: _testing Exports for Parsing Functions
**Plan:** Not mentioned
**Implemented:** Export internal parsing functions for unit testing

```javascript
module.exports = {
  callClaude,
  getModelTimeout,
  isClaudeAvailable,
  MODEL_TIMEOUTS,
  _testing: {
    parseJsonOutput,
    extractJsonFromText
  }
};
```

**Rationale:** Parsing is the only deterministic part of an LLM wrapper. By exporting these functions:
- Unit tests can verify parsing logic with fixtures (no CLI calls)
- Integration tests mock at spawn level
- Real CLI calls only in E2E tests

**Impact on Plan:** Test strategy is now: unit test parsing, integration test process orchestration, E2E test full pipeline.

---

### Decision 2.3: isClaudeAvailable() Health Check
**Plan:** Not mentioned
**Implemented:** Quick availability check via `claude --version`

```javascript
async function isClaudeAvailable() {
  return new Promise((resolve) => {
    const claude = spawn('claude', ['--version'], { windowsHide: true });
    claude.on('close', (code) => resolve(code === 0));
    claude.on('error', () => resolve(false));
    setTimeout(() => { claude.kill(); resolve(false); }, 5000);
  });
}
```

**Rationale:** Server startup should fail fast if Claude CLI isn't installed/authenticated. Prevents confusing errors deep in the pipeline.

**Impact on Plan:** Commit 8's API endpoint should call this on startup.

---

### Decision 2.4: Model Timeouts as Exported Constants
**Plan:** Timeouts mentioned inline
**Implemented:** Exported `MODEL_TIMEOUTS` constant

```javascript
const MODEL_TIMEOUTS = {
  opus: 10 * 60 * 1000,    // 10 minutes
  sonnet: 5 * 60 * 1000,   // 5 minutes
  haiku: 2 * 60 * 1000     // 2 minutes
};
```

**Rationale:** Other modules may need to know expected wait times (progress UI, integration tests).

**Impact on Plan:** Nodes can reference `MODEL_TIMEOUTS` for logging/progress.

---

### Decision 2.5: Abnormal Termination Detection
**Plan:** Not mentioned
**Implemented:** Detect when process exits with neither code nor signal

```javascript
if (code === null && signal === null) {
  reject(new Error(
    `Process terminated abnormally (no exit code or signal). ` +
    `Stdout: ${stdout.length} bytes, Stderr: ${stderr.length} bytes.`
  ));
  return;
}
```

**Rationale:** On Windows, certain crash conditions leave no trace. This catches them instead of hanging.

**Impact on Plan:** More robust error handling in production.

---

## Commit 3: LangGraph State (state.js)

### Decision 3.1: Named Reducer Functions
**Plan:** Inline arrow functions `(_, v) => v`
**Implemented:** Named, exported, documented functions

```javascript
const replaceReducer = (oldValue, newValue) => newValue ?? oldValue;
const appendReducer = (oldValue, newValue) => {
  const prev = oldValue || [];
  const next = newValue || [];
  return [...prev, ...next];
};
```

**Rationale:**
1. Testable - exported via `_testing`
2. Documented - JSDoc explains behavior
3. Consistent - same reducer reused across fields
4. Null-safe - `newValue ?? oldValue` preserves state if update is undefined

**Impact on Plan:** Nodes return partial state. If a field is `undefined`, reducer preserves old value (important for incremental updates).

---

### Decision 3.2: Default Values for ALL State Fields
**Plan:** Only 3 fields had defaults (`voiceRevisionCount`, `errors`, `awaitingApproval`)
**Implemented:** Every field has an explicit default

```javascript
sessionId: Annotation({ reducer: replaceReducer, default: () => null }),
theme: Annotation({ reducer: replaceReducer, default: () => 'journalist' }),
sessionConfig: Annotation({ reducer: replaceReducer, default: () => ({}) }),
// ... all 20 fields have defaults
```

**Rationale:**
1. `getDefaultState()` can return a complete, valid state object
2. Tests don't need to provide every field
3. Prevents undefined access errors in nodes
4. Makes state shape explicit

**Impact on Plan:** Nodes can safely access any state field without null checks.

---

### Decision 3.3: PHASES Constant
**Plan:** Phase strings used inline in nodes
**Implemented:** Centralized `PHASES` constant

```javascript
const PHASES = {
  INIT: 'init',
  LOAD_DIRECTOR_NOTES: '1.1',
  FETCH_TOKENS: '1.2',
  // ... all 14 phases
  COMPLETE: 'complete',
  ERROR: 'error'
};
```

**Rationale:**
1. Type safety - typos caught at reference time
2. Documentation - all phases visible in one place
3. Refactorable - change phase string in one place

**Impact on Plan:** Nodes import and use `PHASES.FETCH_TOKENS` instead of `'1.2'`.

---

### Decision 3.4: APPROVAL_TYPES Constant
**Plan:** Approval type strings inline
**Implemented:** Centralized constant

```javascript
const APPROVAL_TYPES = {
  EVIDENCE_BUNDLE: 'evidence-bundle',
  ARC_SELECTION: 'arc-selection',
  OUTLINE: 'outline'
};
```

**Rationale:** Same as PHASES - type safety and documentation.

**Impact on Plan:** Nodes and API use `APPROVAL_TYPES.EVIDENCE_BUNDLE`.

---

### Decision 3.5: getDefaultState() Helper
**Plan:** Not mentioned
**Implemented:** Returns complete default state object

```javascript
function getDefaultState() {
  return {
    sessionId: null,
    theme: 'journalist',
    // ... all 20 fields
  };
}
```

**Rationale:**
1. Testing - create baseline state easily
2. Initialization - can merge with initial config
3. Documentation - shows complete state shape

**Impact on Plan:** Integration tests use `getDefaultState()` as baseline.

---

### Decision 3.6: Self-Test Block
**Plan:** Not mentioned
**Implemented:** Runnable validation when file executed directly

```javascript
if (require.main === module) {
  console.log('ReportStateAnnotation Self-Test\n');
  // Test default state, reducers, etc.
}
```

**Rationale:** Quick sanity check during development: `node state.js`

**Impact on Plan:** Each module can validate itself without full test harness.

---

## Summary of Plan Impacts

| Decision | Impact on Future Commits |
|----------|-------------------------|
| additionalProperties: false | LLM prompts must be explicit (Commit 5) |
| Enhanced error formatting | Revision loop has better context (Commit 5) |
| Retry logic in client | Nodes don't need retry handling (Commits 4-5) |
| _testing exports | Consistent test strategy across modules |
| isClaudeAvailable() | API startup should check (Commit 8) |
| Named reducers | Nodes return partial state safely (Commits 4-5) |
| All fields have defaults | Nodes don't need null checks (Commits 4-5) |
| PHASES/APPROVAL_TYPES | Use constants, not strings (all commits) |
| getDefaultState() | Integration tests use for baseline (Commit 6) |

---

## Validation Strategy

Each commit includes:
1. **Unit tests** - Deterministic logic (parsing, validation, reducers)
2. **Integration tests** - Module orchestration with mocks
3. **Self-test blocks** - Quick sanity checks during development
4. **Fixture files** - Real-world test data captured from actual usage

Pattern established:
- `_testing` exports for internal functions
- Jest mocks at boundary (spawn, fetch, etc.)
- Fixtures in `__tests__/fixtures/`

---

## Commit 4: LangGraph Nodes - Data Fetching (fetch-nodes.js)

### Decision 4.1: Dependency Injection via Config
**Plan:** Direct imports
**Implemented:** `getNotionClient(config)` helper for injection

```javascript
function getNotionClient(config) {
  return config?.configurable?.notionClient || createNotionClient();
}
```

**Rationale:** Enables testing with mock clients without modifying production code. Tests inject mocks via config, production code uses defaults.

**Impact on Plan:** All nodes follow this pattern. Mock factories exported for testing.

---

### Decision 4.2: createMockNotionClient Factory
**Plan:** Not mentioned
**Implemented:** Mock factory that matches real client interface

```javascript
function createMockNotionClient(mockData = {}) {
  return {
    fetchMemoryTokens: async (tokenIds) => { /* filter by IDs */ },
    fetchPaperEvidence: async (includeAttachments) => { /* return evidence */ }
  };
}
```

**Rationale:** Tests can provide fixture data that matches real API responses. Filters work exactly like real client.

**Impact on Plan:** Consistent mock pattern for AI nodes in Commit 5.

---

## Commit 5: LangGraph Nodes - AI Processing (ai-nodes.js)

### Decision 5.1: Mock Claude Client with Call Tracking
**Plan:** Basic mocking
**Implemented:** Mock factory with prompt matching and call logging

```javascript
function createMockClaudeClient(fixtures = {}) {
  const callLog = [];

  async function mockCallClaude(options) {
    callLog.push({ ...options, timestamp: new Date().toISOString() });
    // Match prompt content to return appropriate fixture
    // ...
  }

  mockCallClaude.getCalls = () => [...callLog];
  mockCallClaude.getLastCall = () => callLog[callLog.length - 1] || null;
  mockCallClaude.clearCalls = () => { callLog.length = 0; };

  return mockCallClaude;
}
```

**Rationale:**
1. Tests verify which model was used (`getLastCall().model`)
2. Tests verify prompt content was correct
3. Tests can inspect full call history for integration tests

**Impact on Plan:** More thorough testing of AI interactions.

---

### Decision 5.2: Mock PromptBuilder for Testing
**Plan:** Not mentioned
**Implemented:** Mock builder that returns test prompts without filesystem access

```javascript
function createMockPromptBuilder() {
  return {
    theme: {
      loadTemplate: async () => '<html>{{content}}</html>',
      loadPhasePrompts: async (phase) => ({ /* test prompts */ }),
      validate: async () => ({ valid: true, missing: [] })
    },
    buildArcAnalysisPrompt: async (sessionData) => ({ systemPrompt, userPrompt }),
    // ... other build methods
  };
}
```

**Rationale:** AI node tests shouldn't require filesystem. Mock builder provides predictable prompts.

**Impact on Plan:** Tests are faster and more reliable.

---

### Decision 5.3: Smart Prompt Matching in Mock Client
**Plan:** Simple string matching
**Implemented:** Priority-based matching with schema detection

```javascript
// Schema match takes highest priority
if (jsonSchema?.$id === 'content-bundle' || /* ... */) {
  return JSON.stringify(fixtures.contentBundle || getDefaultContentBundle());
}

// Content-specific matching with conflict resolution
if (promptLower.includes('generate outline') || /* ... */) {
  return JSON.stringify(fixtures.outline || getDefaultOutline());
}
```

**Rationale:**
1. JSON schema `$id` is most reliable match
2. Prompt content matching handles edge cases
3. Order prevents ambiguity (e.g., "from outline" vs "generate outline")

**Impact on Plan:** Mock client works reliably across all test scenarios.

---

### Decision 5.4: State Values Override Generated Metadata
**Plan:** Not specified
**Implemented:** State metadata takes precedence over generated

```javascript
metadata: {
  ...generatedContent.metadata,
  sessionId: state.sessionId || generatedContent.metadata?.sessionId,
  theme: state.theme || generatedContent.metadata?.theme || 'journalist',
  generatedAt: new Date().toISOString()
}
```

**Rationale:** When resuming from checkpoint, state holds authoritative session info. Generated content may have stale or default values.

**Impact on Plan:** Checkpointing will work correctly across resumptions.

---

### Decision 5.5: Default Fixture Generators
**Plan:** Not mentioned
**Implemented:** Functions that generate minimal valid fixtures

```javascript
function getDefaultEvidenceBundle() {
  return {
    exposed: { tokens: [], paperEvidence: [] },
    buried: { transactions: [], relationships: [] },
    context: { timeline: {}, playerFocus: {}, sessionMetadata: {} },
    curatorNotes: { layerRationale: 'Default test bundle', characterCoverage: {} }
  };
}
```

**Rationale:** Tests that don't care about specific fixture content get valid defaults. Prevents null/undefined errors in tests.

**Impact on Plan:** Simpler test setup - only specify fixtures that matter for the test.

---

### Decision 5.6: Revision History Accumulation
**Plan:** Not specified
**Implemented:** ContentBundle tracks revision history

```javascript
contentBundle: {
  ...updatedBundle,
  _revisionHistory: [
    ...(state.contentBundle?._revisionHistory || []),
    {
      timestamp: new Date().toISOString(),
      fixes: revised.fixes_applied || []
    }
  ]
}
```

**Rationale:** Debugging and auditing. See what was changed in each revision pass. Helps understand voice validation issues.

**Impact on Plan:** Article output can include revision metadata for transparency.

---

### Decision 5.7: Safe JSON Parsing with Actionable Errors
**Plan:** Not specified (code review finding)
**Implemented:** `safeParseJson(response, context)` helper function

```javascript
function safeParseJson(response, context) {
  try {
    return JSON.parse(response);
  } catch (error) {
    const preview = response.length > 500
      ? response.substring(0, 500) + '... [truncated]'
      : response;
    throw new Error(
      `Failed to parse ${context}: ${error.message}\n` +
      `Response preview: ${preview}`
    );
  }
}
```

**Rationale:**
1. LLM responses can be unpredictable - silent JSON.parse failures cause debugging nightmares
2. Context string identifies which node failed (e.g., "evidence bundle from curateEvidenceBundle")
3. Response preview enables debugging without requiring logs
4. Truncation prevents massive error messages from long responses

**Impact on Plan:** Graph Assembly (Commit 6) can catch these errors and route to error handling. API endpoint (Commit 8) gets actionable error messages for clients.

---

### Decision 5.8: Template Load Warning Instead of Silent Failure
**Plan:** Not specified (code review finding)
**Implemented:** Log warning when template fails to load

```javascript
const template = await promptBuilder.theme.loadTemplate().catch(err => {
  console.warn(`[generateContentBundle] Template load failed, proceeding without template context: ${err.message}`);
  return '';
});
```

**Rationale:**
1. Article generation can proceed without template context (graceful degradation)
2. Warning enables debugging when templates are misconfigured
3. Production logs capture the issue for investigation

**Impact on Plan:** Template System (Commit 7) can rely on this pattern. Missing templates are logged but don't crash the pipeline.

---

## Summary of Commit 5 Impacts

| Decision | Impact on Future Commits |
|----------|-------------------------|
| Call tracking in mock | Integration tests can verify node interactions (Commit 6) |
| Mock PromptBuilder | Template tests won't need real skill files (Commit 7) |
| Smart prompt matching | Mock client handles complex test scenarios |
| State metadata priority | Checkpointing works correctly (Commit 6) |
| Default fixtures | Simpler test setup throughout |
| Revision history | Article output transparency (Commit 7) |
| Safe JSON parsing | Actionable errors for debugging (Commits 6, 8) |
| Template load warning | Debugging visibility without crashing (Commit 7) |
