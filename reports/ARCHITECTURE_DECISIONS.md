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

---

## Commit 6: Graph Assembly + Integration Tests (graph.js, template-nodes.js, nodes/index.js)

### Decision 6.1: Barrel Export Pattern for Nodes
**Plan:** Direct imports from multiple node files
**Implemented:** Single `nodes/index.js` barrel export

```javascript
// nodes/index.js
const fetchNodes = require('./fetch-nodes');
const aiNodes = require('./ai-nodes');
const templateNodes = require('./template-nodes');

module.exports = {
  // All node functions
  ...fetchNodes,
  ...aiNodes,
  ...templateNodes,

  // Mock namespace for testing
  mocks: {
    createMockNotionClient: fetchNodes.createMockNotionClient,
    createMockClaudeClient: aiNodes.createMockClaudeClient,
    createMockPromptBuilder: aiNodes.createMockPromptBuilder
  }
};
```

**Rationale:**
1. Single import point for graph.js - cleaner code
2. Mock factories grouped in `mocks` namespace
3. DRY - avoids repeating imports in tests
4. Forward-compatible - new node files automatically included

**Impact on Plan:** Graph and tests import from one location.

---

### Decision 6.2: Named Routing Functions for Conditional Edges
**Plan:** Inline arrow functions in graph
**Implemented:** Named, exported, documented routing functions

```javascript
function routeApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

function routeValidation(state) {
  const hasErrors = state.errors && state.errors.length > 0;
  return hasErrors ? 'error' : 'continue';
}

function routeVoiceValidation(state) {
  const passed = state.validationResults?.passed;
  const maxRevisions = 2;
  const atMaxRevisions = (state.voiceRevisionCount || 0) >= maxRevisions;
  if (passed || atMaxRevisions) return 'complete';
  return 'revise';
}
```

**Rationale:**
1. Testable - routing logic can be unit tested directly
2. Readable - graph assembly is clear about decision points
3. Documented - JSDoc explains routing semantics

**Impact on Plan:** Integration tests verify routing in isolation before full graph tests.

---

### Decision 6.3: Skip Logic for Resume and Testing
**Plan:** Not mentioned
**Implemented:** Nodes check if data already exists to skip processing

```javascript
// In curateEvidenceBundle:
if (state.evidenceBundle && !state.awaitingApproval) {
  return { currentPhase: PHASES.CURATE_EVIDENCE };
}

// In fetchMemoryTokens:
if (state.memoryTokens && state.memoryTokens.length > 0) {
  return { currentPhase: PHASES.FETCH_EVIDENCE };
}
```

**Rationale:**
1. Resume from checkpoint - graph can restart from any phase
2. Testing - pre-populate state to test specific nodes
3. Efficiency - don't re-fetch/re-process existing data
4. Approval pattern - awaitingApproval=false signals approval granted

**Impact on Plan:** Checkpointing and resume work correctly. Tests can isolate nodes.

---

### Decision 6.4: _arcAnalysisCache State Field
**Plan:** Not mentioned (discovered via code review)
**Implemented:** Hidden state field for inter-node data sharing

```javascript
// In state.js:
_arcAnalysisCache: Annotation({
  reducer: replaceReducer,
  default: () => null
}),

// In analyzeNarrativeArcs:
return {
  narrativeArcs: arcAnalysis.narrativeArcs,
  _arcAnalysisCache: arcAnalysis,  // Full analysis preserved
  // ...
};

// In generateOutline:
const arcAnalysis = state._arcAnalysisCache || {
  narrativeArcs: state.narrativeArcs || [],
  // reconstruct minimal structure
};
```

**Rationale:**
1. `narrativeArcs` is user-facing (for arc selection UI)
2. `_arcAnalysisCache` preserves full analysis context
3. Outline generation needs full context (characterPlacementOpportunities, rosterCoverage)
4. Underscore prefix signals "internal, not for display"

**Impact on Plan:** State has 21 fields (not 20). Tests updated accordingly.

---

### Decision 6.5: Stub assembleHtml Node
**Plan:** Full template assembly
**Implemented:** Stub that returns minimal HTML (Commit 7 will complete)

```javascript
async function assembleHtml(state, config) {
  const assembler = getTemplateAssembler(config);
  const html = await assembler.assemble(state.contentBundle);
  return {
    assembledHtml: html,
    currentPhase: PHASES.ASSEMBLE_HTML
  };
}
```

**Rationale:**
1. Graph needs all nodes to compile
2. Integration tests need full pipeline
3. Stub allows testing graph flow before templates exist
4. Mock assembler returns minimal valid HTML

**Impact on Plan:** Commit 7 replaces stub with real Handlebars implementation.

---

### Decision 6.6: Integration Test Fixture Pattern
**Plan:** Inline test data
**Implemented:** Fixtures directory with realistic test data

```
__tests__/
├── fixtures/
│   ├── sessions/
│   │   └── test-session/
│   │       └── inputs/
│   │           ├── director-notes.json
│   │           └── session-config.json
│   └── content-bundles/
│       ├── valid-journalist.json
│       └── invalid-missing-sections.json
├── integration/
│   └── workflow.test.js
```

**Rationale:**
1. Realistic data catches edge cases
2. Fixtures reused across tests
3. Easy to update when schema changes
4. Matches production file structure

**Impact on Plan:** Future commits add fixtures as needed.

---

## Summary of Commit 6 Impacts

| Decision | Impact on Future Commits |
|----------|-------------------------|
| Barrel export | All imports from single nodes/index.js |
| Named routing | Routing logic testable in isolation |
| Skip logic | Checkpointing and resume work (Commit 8 API) |
| _arcAnalysisCache | State has 21 fields, tests updated |
| Stub assembleHtml | Commit 7 completes implementation |
| Fixture pattern | Realistic test data structure |

---

## Commit 7: Template System (template-helpers.js, template-assembler.js, templates/)

### Decision 7.1: DRY Utilities for Template Helpers
**Plan:** Individual helper functions with inline logic
**Implemented:** Extracted shared utilities and constant maps

```javascript
// Internal utilities
function parseDate(dateInput) { /* shared date parsing */ }
function mapToClass(value, mappings, defaultClass) { /* generic CSS class mapper */ }
function compilePartial(handlebars, partial) { /* template compilation */ }

// Constant maps (replaces inline objects)
const SIGNIFICANCE_CLASSES = { critical: '...', supporting: '...', contextual: '...' };
const SECTION_CLASSES = { narrative: '...', 'evidence-highlight': '...', /* ... */ };
const PLACEMENT_CLASSES = { left: '...', right: '...', center: '...' };
const CONTENT_BLOCK_PARTIALS = { paragraph: '...', quote: '...', /* ... */ };
```

**Rationale:**
1. DRY - Date parsing used in 3 functions (formatDate, formatDatetime, articleId)
2. DRY - CSS class mapping pattern repeated in 4 functions
3. Testable - Utilities exported via `_testing` namespace
4. Maintainable - Class mappings centralized for easy updates

**Impact on Plan:** None. Purely internal refactoring.

---

### Decision 7.2: Lazy Initialization for TemplateAssembler
**Plan:** Initialize on construction
**Implemented:** Initialize on first `assemble()` call

```javascript
async assemble(contentBundle, options = {}) {
  await this.initialize();  // Lazy init - loads templates on first call
  // ... validation and rendering
}

async initialize() {
  if (this.initialized) return;  // Idempotent
  // Load main template, register partials and helpers
  this.initialized = true;
}
```

**Rationale:**
1. Fast construction - No async work at instantiation
2. Idempotent - Safe to call initialize() multiple times
3. Testable - Can create assembler without filesystem access
4. Fail-fast - Template errors surface at assemble time, not import time

**Impact on Plan:** Nodes can create assembler synchronously, lazy load on use.

---

### Decision 7.3: CSS/JS Paths as Theme Configuration
**Plan:** Hardcoded CSS references
**Implemented:** Theme-configurable CSS and JS paths

```javascript
const DEFAULT_CSS_PATHS = {
  journalist: {
    basePath: '/assets/css/journalist',
    files: ['variables.css', 'base.css', 'layout.css', 'sidebar.css', 'typography.css']
  }
};

const DEFAULT_JS_PATHS = {
  journalist: {
    basePath: '/assets/js',
    files: ['scroll-effects.js']
  }
};
```

**Rationale:**
1. Theme-agnostic - Each theme defines its own assets
2. Configurable - Can override via constructor options
3. Testable - Paths exported via `_testing` for verification

**Impact on Plan:** Detective theme (Commit 9) will add its own CSS/JS paths.

---

### Decision 7.4: Handlebars Helper Signature for Format Arguments
**Plan:** Not specified
**Implemented:** Correct signature for optional arguments

```javascript
// WRONG (original):
handlebars.registerHelper('formatDate', function(dateInput, options) {
  const format = typeof options === 'string' ? options : 'long';  // Never works
});

// CORRECT (implemented):
handlebars.registerHelper('formatDate', function(dateInput, format, options) {
  // When called as {{formatDate date}}: format = options object
  // When called as {{formatDate date "short"}}: format = "short"
  const actualFormat = typeof format === 'string' ? format : 'long';
  return formatDate(dateInput, actualFormat);
});
```

**Rationale:** Handlebars always passes the options hash as the LAST argument. Any explicit arguments come before it. `{{formatDate date "short"}}` passes `(date, "short", options)`.

**Impact on Plan:** Template calls with format arguments now work correctly.

---

### Decision 7.5: Diegetic Date in Templates
**Plan:** Dynamic dates everywhere
**Implemented:** Intentional hardcoded "February 22, 2027" in header

```handlebars
<time class="nn-article__date" datetime="{{formatDatetime metadata.generatedAt}}">
  February 22, 2027
</time>
```

**Rationale:** This is the diegetic game date for NovaNews fiction. The `datetime` attribute uses the real generation date (for machine parsing), but the displayed text is the in-game date when the investigation was "published."

**Impact on Plan:** Not a bug - intentional design decision per game fiction.

---

### Decision 7.6: Recursive Partial Registration
**Plan:** Flat partials directory
**Implemented:** Recursive registration with path-based names

```javascript
async registerPartialsRecursively(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await this.registerPartialsRecursively(
        path.join(dir, entry.name),
        `${prefix}${entry.name}/`
      );
    } else if (entry.name.endsWith('.hbs')) {
      const name = `${prefix}${entry.name.replace('.hbs', '')}`;
      // Register as 'content-blocks/paragraph', 'sidebar/evidence-card', etc.
    }
  }
}
```

**Rationale:**
1. Organization - Partials grouped by type (content-blocks/, sidebar/)
2. Namespacing - No name collisions between similar partials
3. Discoverability - Directory structure mirrors usage
4. Scalable - Add new categories without code changes

**Impact on Plan:** Partial references use path-style names: `{{> sidebar/evidence-card}}`.

---

### Decision 7.7: Computed Context Flags for Templates
**Plan:** Templates check array lengths inline
**Implemented:** Pre-computed boolean flags in buildContext()

```javascript
buildContext(contentBundle) {
  return {
    ...contentBundle,
    // Computed flags for conditional rendering
    hasFinancialTracker: contentBundle.financialTracker?.entries?.length > 0,
    hasPullQuotes: contentBundle.pullQuotes?.length > 0,
    hasEvidenceCards: contentBundle.evidenceCards?.length > 0,
    // Navigation built from sections
    sectionNav: contentBundle.sections?.map(s => ({
      id: s.id,
      label: s.heading || s.id,
      href: `#${s.id}`
    }))
  };
}
```

**Rationale:**
1. Clean templates - `{{#if hasPullQuotes}}` vs `{{#if pullQuotes.length}}`
2. Single source - Logic centralized in assembler
3. Testable - Context building can be unit tested

**Impact on Plan:** Templates use boolean flags, not array length checks.

---

## Summary of Commit 7 Impacts

| Decision | Impact on Future Commits |
|----------|-------------------------|
| DRY utilities | Reuse parseDate, mapToClass in future helpers |
| Lazy init | Fast assembler construction for API endpoint (Commit 8) |
| Theme CSS/JS paths | Detective theme adds its own paths (Commit 9) |
| Correct helper signature | All format-style helpers work correctly |
| Diegetic date | Not a bug - intentional game fiction |
| Recursive partials | Add new partial categories freely |
| Computed context flags | Templates stay clean and readable |

---

## Commit 8: API Endpoint + Integration Tests

### Decision 8.1: Mock Graph Factories for API Testing
**Plan:** Full graph tests in api.test.js
**Implemented:** Mock graph factories that simulate specific scenarios

```javascript
function createMockCompletedGraph() {
  return {
    invoke: async () => ({
      currentPhase: PHASES.COMPLETE,
      awaitingApproval: false,
      assembledHtml: '<html>...</html>',
      validationResults: { passed: true }
    })
  };
}

function createMockEvidenceApprovalGraph() { /* ... */ }
function createMockArcSelectionGraph() { /* ... */ }
function createMockOutlineApprovalGraph() { /* ... */ }
function createMockErrorGraph(errors) { /* ... */ }
function createMockThrowingGraph(message) { /* ... */ }
```

**Rationale:**
1. API tests focus on endpoint logic (validation, response structure)
2. Full graph testing is in workflow.test.js (separation of concerns)
3. Mock factories capture each approval checkpoint scenario
4. Error handling tested without triggering real failures

**Impact on Plan:** Clear separation between API tests and workflow tests.

---

### Decision 8.2: Handler Logic as Testable Function
**Plan:** Test via HTTP requests
**Implemented:** Extract handler logic as `handleGenerateRequest(req, graph)`

```javascript
// In api.test.js - function mirrors server.js handler
async function handleGenerateRequest(req, graph) {
  const { sessionId, theme, approvals } = req.body;
  // Validation logic
  // Graph invocation
  // Response building
  return { status: 200, json: response };
}
```

**Rationale:**
1. Unit test handler logic without HTTP server
2. Faster test execution (no network overhead)
3. Clear contract between handler and graph
4. Manual HTTP testing supplements these tests

**Impact on Plan:** Tests run faster and more reliably.

---

### Decision 8.3: Empty selectedArcs Validation
**Plan:** Not specified
**Implemented:** Explicit validation rejecting empty arc arrays

```javascript
if (approvals.selectedArcs && Array.isArray(approvals.selectedArcs)) {
  if (approvals.selectedArcs.length === 0) {
    return {
      status: 400,
      json: { error: 'selectedArcs cannot be empty. At least one arc must be selected.' }
    };
  }
  initialState.selectedArcs = approvals.selectedArcs;
}
```

**Rationale:** An empty selectedArcs array would cause outline generation to fail. Fail fast with clear error message.

**Impact on Plan:** Frontend must select at least one arc before proceeding.

---

## Summary of Commit 8 Impacts

| Decision | Impact on Future Commits |
|----------|-------------------------|
| Mock graph factories | Reuse pattern for future API tests |
| Handler as function | Other endpoints can use same pattern |
| selectedArcs validation | Frontend enforces at least one selection |

---

## Commit 8.5: Evidence Preprocessing Layer (ADDENDUM)

This commit addresses a gap discovered during Commit 8 manual validation: `curateEvidenceBundle` timed out when processing a real session with 100+ tokens. The original plan assumed all evidence could be processed in a single Claude call, but this doesn't scale.

### Decision 8.5.1: Universal Preprocessing Schema
**Plan:** Not originally specified (gap discovered during manual validation)
**Implemented:** Theme-agnostic preprocessing output

```json
{
  "$id": "preprocessed-evidence",
  "type": "object",
  "required": ["items", "preprocessedAt"],
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "required": ["id", "sourceType", "summary", "significance"],
        "properties": {
          "id": { "type": "string" },
          "sourceType": { "enum": ["memory-token", "paper-evidence"] },
          "summary": { "type": "string", "maxLength": 150 },
          "significance": { "enum": ["critical", "supporting", "contextual", "background"] },
          "characterRefs": { "type": "array", "items": { "type": "string" } },
          "timelineRef": { "type": "string" },
          "narrativeRelevance": { "type": "boolean" },
          "tags": { "type": "array", "items": { "type": "string" } },
          "groupCluster": { "type": "string" }
        }
      }
    },
    "preprocessedAt": { "type": "string", "format": "date-time" },
    "stats": { /* totalItems, batchesProcessed, processingTimeMs */ }
  }
}
```

**Rationale:**
1. All themes work with the same underlying Notion data
2. Preprocessing is about summarization, not organization
3. Theme-specific logic belongs in curation, not preprocessing
4. One schema = one batch processing implementation = DRY

**Impact on Plan:** New schema file `preprocessed-evidence.schema.json`. All themes produce identical intermediate format.

---

### Decision 8.5.2: Filter Configuration in Skill Directory
**Plan:** Hardcoded filters in notion-client.js
**Implemented:** Theme-specific config at `.claude/skills/{theme}-report/config.json`

```javascript
// notion-client.js loads config
const themeConfig = require(path.join(skillPath, 'config.json'));
const filters = themeConfig.notionFilters;
```

```json
{
  "notionFilters": {
    "memoryTokens": {
      "types": ["Memory Token Video", "Memory Token Image", "Memory Token Audio"]
    },
    "paperEvidence": {
      "types": ["Prop", "Physical", "Clue", "Document"],
      "narrativeThreads": ["Funding & Espionage", "Marriage Troubles", "Memory Drug", "Underground Parties"]
    }
  },
  "relationResolution": {
    "includeOwnerLogline": true,
    "includeTimeline": true
  }
}
```

**Rationale:**
1. Open/Closed principle - add themes without modifying NotionClient
2. Theme maintainers control their own filters
3. Same location as prompts (skill directory = theme boundary)
4. Testable - mock config for unit tests

**Impact on Plan:** NotionClient accepts `skillPath` in config, loads filters dynamically.

---

### Decision 8.5.3: Rich Relation Resolution Always Enabled
**Plan:** Minimal resolution (names only)
**Implemented:** Always fetch owner.logline and timeline.*

**Rationale:**
1. Preprocessing accuracy improves with rich context
2. Detective already uses this data; journalist can benefit too
3. Small performance cost vs. significant quality improvement
4. Future themes won't need to request additional resolution

**Impact on Plan:** NotionClient resolves all relations by default. ~10% more API calls, but preprocessing is more accurate.

---

### Decision 8.5.4: Batch Parameters from Detective Pattern
**Plan:** Not specified
**Implemented:** 8 items per batch, 4 concurrent batches

```javascript
const BATCH_SIZE = 8;
const CONCURRENCY = 4;
```

**Rationale:**
1. Proven in detective flow (150+ items in ~3 minutes)
2. Stays under Cloudflare 100-second timeout
3. Balances throughput vs. rate limiting
4. Each batch completes in ~40 seconds

**Impact on Plan:** evidence-preprocessor.js uses these constants. Tests verify batch behavior.

---

### Decision 8.5.5: Preprocessing Node Inserted Before Curation
**Plan:** `fetchSessionPhotos` → `curateEvidenceBundle`
**Implemented:** `fetchSessionPhotos` → `preprocessEvidence` → `curateEvidenceBundle`

**Rationale:**
1. Preprocessing creates the summarized input curation needs
2. Skip logic works: if preprocessedEvidence exists, skip preprocessing
3. Resume from checkpoint works correctly
4. Curation node simplified (no summarization, just organization)

**Impact on Plan:** Graph has 13 nodes (was 12). PHASES updated with new phase.

---

## Summary of Commit 8.5 Impacts

| Decision | Impact on Future Commits |
|----------|-------------------------|
| Universal preprocessing schema | All themes use same intermediate format |
| Filter config in skill directory | Themes control their own Notion filters |
| Rich relations always | More context for all themes |
| Batch parameters | Proven performance characteristics |
| Preprocessing node | Graph has additional phase |

---

## Updated State Field Count

After Commit 8.5, state has **22 fields** (was 21):

| Field | Added In | Purpose |
|-------|----------|---------|
| sessionId | Commit 3 | Session identifier |
| theme | Commit 3 | Theme name |
| sessionConfig | Commit 3 | Session configuration |
| directorNotes | Commit 3 | Director notes JSON |
| playerFocus | Commit 3 | Layer 3 drive from whiteboard |
| memoryTokens | Commit 3 | Fetched tokens |
| paperEvidence | Commit 3 | Fetched evidence |
| sessionPhotos | Commit 3 | Session photos |
| **preprocessedEvidence** | **Commit 8.5** | **Batch-summarized evidence** |
| evidenceBundle | Commit 3 | Curated evidence bundle |
| narrativeArcs | Commit 3 | Analyzed arcs |
| selectedArcs | Commit 3 | User-selected arcs |
| outline | Commit 3 | Generated outline |
| contentBundle | Commit 3 | Structured content |
| assembledHtml | Commit 3 | Final HTML |
| validationResults | Commit 3 | Validation output |
| currentPhase | Commit 3 | Current pipeline phase |
| voiceRevisionCount | Commit 3 | Revision counter |
| errors | Commit 3 | Error accumulator |
| awaitingApproval | Commit 3 | Approval checkpoint flag |
| approvalType | Commit 3 | Current approval type |
| _arcAnalysisCache | Commit 6 | Inter-node data sharing |

---

## Updated PHASES Constant

After Commit 8.5:

```javascript
const PHASES = {
  INIT: 'init',
  LOAD_DIRECTOR_NOTES: '1.1',
  FETCH_TOKENS: '1.2',
  FETCH_EVIDENCE: '1.3',
  ANALYZE_IMAGES: '1.5',
  FETCH_PHOTOS: '1.6',
  PREPROCESS_EVIDENCE: '1.7',    // NEW in Commit 8.5
  CURATE_EVIDENCE: '1.8',
  ANALYZE_ARCS: '2',
  GENERATE_OUTLINE: '3',
  GENERATE_CONTENT: '4',
  VALIDATE_CONTENT: '4.1',
  REVISE_CONTENT: '4.2',
  ASSEMBLE_HTML: '5',
  VALIDATE_ARTICLE: '5.1',
  COMPLETE: 'complete',
  ERROR: 'error'
};
```

---

## Commit 8.6: Cohesive Generative Workflow (ADDENDUM)

This commit addresses gaps discovered during Commit 8.5 validation:
1. Arc analysis still timed out with ~20KB evidenceBundle in single Sonnet call
2. Arc → Outline → Article phases were isolated rather than cohesive
3. Photo analysis needed integration with arc analysis
4. Quality gates needed per-phase evaluation

### Research Foundation

Patterns applied from established best practices:

| Pattern | Source | Application |
|---------|--------|-------------|
| Subagents for investigation | [Anthropic Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices) | Arc specialists during analysis phase |
| Scatter-gather parallelism | [LangGraph Guide](https://latenode.com/blog/langgraph-multi-agent-orchestration-complete-framework-guide-architecture-analysis-2025) | 3 parallel arc specialists → synthesizer |
| Supervisor with Command routing | [LangGraph Multi-Agent](https://blog.langchain.com/langgraph-multi-agent-workflows/) | Generation supervisor orchestrates phases |
| Evaluator-optimizer loops | [Anthropic Cookbook](https://github.com/anthropics/anthropic-cookbook) | Per-phase evaluation with revision caps |
| Human-in-the-loop via interrupt() | [LangGraph HITL](https://langchain-ai.github.io/langgraph/) | Checkpoints after evaluator approval |

---

### Decision 8.6.1: Supervisor Pattern over Subgraph
**Plan:** Considered subgraph for encapsulation
**Implemented:** Supervisor pattern with synthesis twist

**Subgraph approach:**
```
generationSubgraph (single node that expands internally)
  - Internal state, checkpoints, edges
  - Parent sees it as ONE node
  - State passes in at entry, out at exit
```

**Supervisor approach (chosen):**
```
generationSupervisor (orchestrates specialists)
  - Uses Command to route between specialists
  - Maintains "narrative compass" across phases
  - Can dynamically re-route based on feedback
```

**Rationale:**
1. Supervisor actively enforces cohesion (not just structural constraints)
2. Can catch "drift" between phases and request correction
3. Maintains narrative compass across all phases
4. More flexible routing based on quality feedback
5. Better matches the goal of "one cohesive in-world experience"

**Impact on Plan:** New `generation-supervisor.js` file. Supervisor is a node in parent graph, not a subgraph. Supervisor maintains `narrativeCompass` state field.

---

### Decision 8.6.2: Three Domain Arc Specialists (Hierarchical Synthesis)
**Plan:** Single Opus call for arc analysis
**Implemented:** 3 parallel Haiku/Sonnet specialists + 1 synthesizer

The arc analyzer spec (`.claude/agents/journalist-arc-analyzer.md`) defines 6 cross-reference analyses in Step 3.5:
1. Behavioral → Transaction Correlation
2. Account Naming Pattern Analysis
3. Victimization Analysis
4. Zero-Footprint Analysis
5. Timing Clusters
6. Self-Burial vs Other-Burial

**Grouping into 3 domain specialists:**

| Specialist | Domain | Cross-References Covered |
|------------|--------|--------------------------|
| `analyzeFinancialPatterns` | Money | Account naming, timing clusters, transaction amounts |
| `analyzeBehavioralPatterns` | People | Director observations, behavioral→transaction correlation, zero-footprint |
| `analyzeVictimizationPatterns` | Targeting | Victimization, self-burial, whose memories went where |

Then: `synthesizeArcs` combines with whiteboard/player focus to build final arcs.

**Execution pattern (scatter-gather):**
```
curateEvidenceBundle
      │
      ├──→ arcFinancialSpecialist ──┐
      ├──→ arcBehavioralSpecialist ─┼──→ arcSynthesizer
      └──→ arcVictimizationSpecialist ┘
```

**Rationale:**
1. Parallel execution cuts wall-clock time by ~3x
2. Each specialist has focused context (no 20KB payload)
3. Domains are coherent and non-overlapping
4. Synthesizer applies player focus to combine insights
5. Matches the spec's conceptual groupings

**Impact on Plan:** 4 Claude calls instead of 1, but parallel and faster. New `arc-specialist-nodes.js` file. New state field `specialistAnalyses` with merge reducer.

---

### Decision 8.6.3: Early Photo Analysis (Fetch Phase)
**Plan:** Photos analyzed parallel with arcs
**Implemented:** Photos analyzed during fetch phase, before preprocessing

**Original flow:**
```
fetchSessionPhotos → preprocessEvidence → curateEvidenceBundle → [arcs parallel with photos]
```

**Implemented flow:**
```
fetchSessionPhotos → analyzePhotos → preprocessEvidence → curateEvidenceBundle → arcs
```

**User input for character identification:**
```
[checkpoint: evidence+photos approval]
      ↓
[checkpoint: user provides character-ids.json]
      ↓
arcSpecialists (receive photo context + character IDs)
```

**Rationale:**
1. Photo context enriches arc analysis (photos inform narrative moments)
2. User provides character IDs before arc analysis begins (no generic descriptions)
3. Single checkpoint for evidence+photos approval (fewer interruptions)
4. Arc specialists receive complete picture

**Impact on Plan:** New `analyzePhotos` node between `fetchSessionPhotos` and `preprocessEvidence`. New state fields `photoAnalyses` and `characterIdMappings`. New approval type `CHARACTER_IDS`.

---

### Decision 8.6.4: Per-Phase Evaluators with DRY Factory
**Plan:** Single end-validation only
**Implemented:** 3 evaluators (arcs, outline, article) with shared factory

**Factory pattern:**
```javascript
function createEvaluator(phaseName, qualityCriteria, model = 'haiku') {
  return async function(state, config) {
    // Build evaluation prompt from qualityCriteria
    // Call Claude to evaluate
    // Return { ready, issues, revisionGuidance, confidence }
  };
}

const evaluateArcs = createEvaluator('arcs', {
  coherence: 'Do arcs tell a consistent story?',
  evidenceGrounding: 'Are arcs supported by evidence?',
  narrativePotential: 'Do arcs have emotional resonance?',
  rosterCoverage: 'Does every roster member have placement?',
  playerFocusAlignment: 'Do arcs reflect what players focused on?'
});
```

**Evaluator behavior:**
```
Phase generates output
      ↓
Evaluator checks quality criteria
      ↓
ready=true?  ──YES──→ Checkpoint (human reviews)
    │
    NO
    ↓
revisionCount < cap?
    │
  YES ↓           NO ↓
Revise with       Checkpoint with
guidance          issues visible
    │                 │
    └─────────────────┘
            ↓
Return to supervisor
```

**Key semantics:**
- `ready=true` means content is READY FOR HUMAN approval (not skip human)
- Human ALWAYS approves at checkpoint
- Auto-revisions happen only when evaluator finds fixable issues
- Revision caps prevent infinite loops

**Rationale:**
1. Catches gaps early before they propagate
2. Each phase has different quality criteria
3. DRY: `createEvaluator` factory avoids duplication
4. Revision caps prevent infinite loops
5. Human always has final approval

**Impact on Plan:** New `evaluator-nodes.js` file with factory pattern. New state field `evaluationHistory` for debugging.

---

### Decision 8.6.5: Phase-Specific Revision Caps with Human Escalation
**Plan:** Max 2 revisions across all phases
**Implemented:** Phase-specific caps (arcs: 2, outline: 3, article: 3)

```javascript
const REVISION_CAPS = {
  arcs: 2,      // Foundational - if 2 revisions don't fix it, human intervenes
  outline: 3,   // More surface area to fix
  article: 3    // Most content to polish
};
```

**Escalation behavior:**
- Under cap: auto-revise with evaluator guidance
- At cap: escalate to human checkpoint with issues visible
- Human can provide additional guidance or approve as-is

**Rationale:**
1. Arcs are foundational - if 2 revisions don't fix it, human needs to intervene
2. Outline/article have more surface area to fix, warrant 3 attempts
3. Human always sees final output regardless of revision count
4. Evaluator determines "ready for human" not "skip human"

**Impact on Plan:** Per-phase revision counters in state (`arcRevisionCount`, `outlineRevisionCount`, `articleRevisionCount`).

---

### Decision 8.6.6: Supervisor Narrative Compass
**Plan:** Not specified
**Implemented:** Running synthesis that ensures cohesion across phases

```json
{
  "coreThemes": ["Betrayal", "Corporate greed", "Hidden alliances"],
  "emotionalHook": "The moment trust shattered",
  "keyMoments": [
    { "moment": "Taylor/Diana partnership dissolved", "source": "director observation" },
    { "moment": "Kai's frantic final minutes", "source": "director observation" }
  ],
  "playerFocusAnchors": ["Victoria+Morgan collusion", "Derek's absence"],
  "coherenceNotes": [
    "Outline must connect Taylor's early Valet activity to final accusation",
    "Article must deliver emotional payoff hinted in arc analysis"
  ]
}
```

**Supervisor behavior:**
1. After arcs synthesized: Extract core themes, emotional hook, key moments
2. After arc selection: Note which arcs user chose (player focus anchors)
3. After outline: Add coherence notes about what article must deliver
4. After article: Verify emotional payoff was achieved

**Rationale:**
1. Maintains narrative vision across all phases
2. Catches "drift" when phases don't connect
3. Provides coherence guidance to generators
4. Enables quality feedback that spans phases

**Impact on Plan:** New state field `supervisorNarrativeCompass`. Supervisor updates compass after each phase.

---

## Summary of Commit 8.6 Impacts

| Decision | Impact on Future Commits |
|----------|-------------------------|
| Supervisor pattern | Central orchestration for generation phases |
| Domain arc specialists | Parallel analysis with focused context |
| Early photo analysis | Photo context available to arc analysis |
| DRY evaluator factory | Consistent quality gates across phases |
| Phase-specific revision caps | Different tolerance for different phases |
| Narrative compass | Cross-phase coherence enforcement |

---

## Updated State Field Count

After Commit 8.6, state has **30 fields** (was 22):

| Field | Added In | Purpose |
|-------|----------|---------|
| ... (previous 22 fields) | ... | ... |
| **photoAnalyses** | **Commit 8.6** | **Photo analysis results** |
| **characterIdMappings** | **Commit 8.6** | **User-provided character identifications** |
| **specialistAnalyses** | **Commit 8.6** | **Arc specialist outputs (merge reducer)** |
| **evaluationHistory** | **Commit 8.6** | **Evaluation results for debugging** |
| **arcRevisionCount** | **Commit 8.6** | **Arc phase revision counter** |
| **outlineRevisionCount** | **Commit 8.6** | **Outline phase revision counter** |
| **articleRevisionCount** | **Commit 8.6** | **Article phase revision counter** |
| **supervisorNarrativeCompass** | **Commit 8.6** | **Cross-phase coherence state** |

---

## Updated PHASES Constant

After Commit 8.6:

```javascript
const PHASES = {
  INIT: 'init',
  LOAD_DIRECTOR_NOTES: '1.1',
  FETCH_TOKENS: '1.2',
  FETCH_EVIDENCE: '1.3',
  ANALYZE_IMAGES: '1.5',
  FETCH_PHOTOS: '1.6',
  ANALYZE_PHOTOS: '1.65',          // NEW in Commit 8.6
  PREPROCESS_EVIDENCE: '1.7',
  CURATE_EVIDENCE: '1.8',
  ARC_SPECIALISTS: '2.1',          // NEW in Commit 8.6
  ARC_SYNTHESIS: '2.2',            // NEW in Commit 8.6
  ARC_EVALUATION: '2.3',           // NEW in Commit 8.6
  ANALYZE_ARCS: '2',
  OUTLINE_GENERATION: '3.1',       // NEW in Commit 8.6
  OUTLINE_EVALUATION: '3.2',       // NEW in Commit 8.6
  GENERATE_OUTLINE: '3',
  ARTICLE_GENERATION: '4.1',       // NEW in Commit 8.6
  ARTICLE_EVALUATION: '4.2',       // NEW in Commit 8.6
  GENERATE_CONTENT: '4',
  VALIDATE_CONTENT: '4.3',
  REVISE_CONTENT: '4.4',
  ASSEMBLE_HTML: '5',
  VALIDATE_ARTICLE: '5.1',
  COMPLETE: 'complete',
  ERROR: 'error'
};
```

---

## Updated APPROVAL_TYPES Constant

After Commit 8.6:

```javascript
const APPROVAL_TYPES = {
  EVIDENCE_BUNDLE: 'evidence-bundle',
  EVIDENCE_AND_PHOTOS: 'evidence-and-photos',  // NEW in Commit 8.6
  CHARACTER_IDS: 'character-ids',               // NEW in Commit 8.6
  ARC_SELECTION: 'arc-selection',
  OUTLINE: 'outline',
  ARTICLE: 'article'                            // NEW in Commit 8.6
};
```

---

## Commit 8.7: Claude Agent SDK Migration (MAJOR REFACTOR)

This commit replaces the subprocess-based Claude CLI architecture with the Claude Agent SDK.

### Decision 8.7.1: SDK Client Replaces Subprocess Wrapper
**Plan:** Replace `claude-client.js` subprocess spawning with SDK
**Implemented:** New `sdk-client.js` using `@anthropic-ai/claude-agent-sdk`

**Old architecture (DELETED):**
```javascript
// claude-client.js (DELETED)
const claude = spawn('claude', args, { cwd: workDir });
claude.stdin.write(prompt);
claude.stdin.end();
```

**New architecture:**
```javascript
// sdk-client.js
const { query } = require('@anthropic-ai/claude-agent-sdk');

async function sdkQuery({ prompt, systemPrompt, model, jsonSchema }) {
  for await (const msg of query({ prompt, options })) {
    if (msg.type === 'result' && msg.subtype === 'success') {
      return jsonSchema ? msg.structured_output : msg.result;
    }
  }
}
```

**Rationale:**
1. Direct SDK calls eliminate subprocess overhead
2. Native structured output (no JSON extraction from code fences)
3. Built-in retry and error handling
4. Uses Claude Code authentication (no separate API key)
5. Cleaner async/await patterns

**Impact:** Deleted `claude-client.js`, created `sdk-client.js`. All nodes updated to use SDK.

---

### Decision 8.7.2: Server.js Cleanup - DELETE All Subprocess Code
**Plan:** Remove subprocess code from server.js
**Implemented:** Complete deletion of ~1600 lines

**DELETED from server.js:**
- `callClaude()` function (~240 lines) - subprocess wrapper
- All `runPhase*` handler functions (~870 lines) - 12 phase handlers
- `/api/analyze` endpoint - batch analysis via subprocess
- `/api/test-single-item` endpoint - test subprocess
- `/api/journalist/*` endpoints - manual phase control
- All temp directory management for subprocess isolation

**KEPT in server.js:**
- Auth endpoints (`/api/auth/login`, `/api/auth/check`, `/api/auth/logout`)
- `/api/generate` - LangGraph workflow orchestration
- `/api/config` - Notion token serving
- `/api/health` - Server health check
- Static file serving

**Rationale:**
1. LangGraph workflow handles all phases via `/api/generate`
2. Manual phase endpoints were only for debugging subprocess approach
3. Batch analysis handled by preprocessing nodes, not separate endpoint
4. No backwards compatibility - clean deletion

**Impact:** server.js reduced from ~1900 lines to ~300 lines.

---

### Decision 8.7.3: SDK Health Check Replaces CLI Check
**Plan:** Not specified
**Implemented:** `isClaudeAvailable()` now tests SDK, not CLI

**Old approach (REPLACED):**
```javascript
// Tested CLI availability
const claude = spawn('claude', ['--version']);
```

**New approach:**
```javascript
// Tests SDK availability via minimal query
async function isClaudeAvailable() {
  try {
    await sdkQuery({
      prompt: 'Respond with exactly: ok',
      model: 'haiku',
      systemPrompt: 'Respond with exactly one word: ok'
    });
    return true;
  } catch (error) {
    return false;
  }
}
```

**Rationale:**
1. Tests actual SDK path used by application
2. Verifies Claude Code authentication works
3. Catches network connectivity issues
4. More accurate health check

---

### Decision 8.7.4: Delete session-manager.js
**Plan:** Not specified
**Implemented:** Deleted unused module

`session-manager.js` was only used by the old phase handlers in server.js. With phase handlers deleted, this module had no consumers.

**Deleted files:**
- `lib/session-manager.js`
- `lib/__tests__/session-manager.test.js`

**Rationale:** No backwards compatibility, clean deletion of unused code.

---

## Summary of Commit 8.7 Impacts

| Change | Before | After |
|--------|--------|-------|
| AI calls | `spawn('claude', ...)` subprocess | `sdkQuery()` direct SDK |
| server.js | ~1900 lines | ~300 lines |
| API endpoints | 15+ endpoints | 6 endpoints |
| claude-client.js | Active | DELETED |
| session-manager.js | Active | DELETED |
| Health check | CLI version check | SDK query test |

**Deleted Endpoints:**
- `/api/analyze`
- `/api/test-single-item`
- `/api/journalist/1_6`
- `/api/journalist/1_8`
- `/api/journalist/2`
- `/api/journalist/3`
- `/api/journalist/4`

**Active Endpoints:**
- `/api/auth/login`
- `/api/auth/check`
- `/api/auth/logout`
- `/api/generate`
- `/api/config`
- `/api/health`

---

### Documentation Updates (Commit 8.7)

Updated to reflect SDK architecture:
- `CLAUDE.md` - Full rewrite of architecture sections
- `CONCURRENT_BATCHING.md` - Added deprecation notice
- `ARCHITECTURE_DECISIONS.md` - Added Commit 8.7 section (this document)

---

## Commit 8.9: Input Layer + File-Based Specialists + Character IDs

This commit completes the user input layer for the workflow, addressing gaps in how raw session data enters the pipeline and how users interact with photo analysis.

### Decision 8.9.1: Raw Input Parsing Node
**Gap:** Workflow expected pre-populated JSON files in `data/{sessionId}/inputs/`
**Implemented:** `parseRawInput` node accepts unstructured text and generates structured JSON

**Flow:**
```
START → [conditional: hasRawInput?]
           ↓ YES                    ↓ NO
    parseRawInput              initializeSession
           ↓                        ↓
    [checkpoint: input-review]      (skip parsing)
           ↓
    finalizeInput
           ↓
    initializeSession
```

**Input format (rawSessionInput):**
```javascript
{
  roster: "Victoria Blackwood, James Harrison, Morgan Wells...",
  accusation: "The players ultimately accused Victoria of being The Valet...",
  sessionReport: "Free-form text with tokens, shell accounts...",
  directorNotes: "Director observations during gameplay...",
  photosPath: "path/to/session/photos",
  whiteboardPhotoPath: "path/to/whiteboard.jpg"
}
```

**Rationale:**
1. Directors copy/paste from notes rather than manually creating JSON
2. Claude parses structure (roster extraction, accusation parsing)
3. Whiteboard photo analyzed for player focus (Layer 3)
4. User reviews/edits parsed input before proceeding

**Impact:** New `input-nodes.js` file. New phases `PARSE_INPUT` (0.1) and `REVIEW_INPUT` (0.2). New approval type `INPUT_REVIEW`.

---

### Decision 8.9.2: Native File-Based Specialist Agents
**Gap:** Specialist prompts in `subagents.js` were hardcoded inline, disconnected from reference docs
**Implemented:** Native Claude Code agent files in `.claude/agents/`

**Created agents:**
- `.claude/agents/journalist-financial-specialist.md` - Transaction patterns, account naming
- `.claude/agents/journalist-behavioral-specialist.md` - Director observations, behavioral patterns
- `.claude/agents/journalist-victimization-specialist.md` - Targeting patterns, memory manipulation

**Agent pattern:**
```markdown
---
name: journalist-financial-specialist
description: Analyzes financial patterns in ALN session evidence
tools: Read
model: sonnet
---

# Financial Patterns Specialist

## First: Load Reference Files
Read these before proceeding:
- `.claude/skills/journalist-report/references/prompts/character-voice.md`
- `.claude/skills/journalist-report/references/prompts/evidence-boundaries.md`
- `.claude/skills/journalist-report/references/prompts/anti-patterns.md`

## Your Domain
[Domain-specific instructions...]
```

**Rationale:**
1. Single source of truth (agent definitions in `.claude/agents/`)
2. Reference docs loaded via Read tool at runtime
3. Specialists evolve without touching Node.js code
4. Consistent with established Claude Code agent patterns

**Impact:** Deleted hardcoded specialists from `subagents.js`. Orchestrator invokes file-based agents via Task tool.

---

### Decision 8.9.3: Rollback and State Overrides
**Gap:** No way to re-run from a checkpoint with modified guidance
**Implemented:** `rollbackTo` and `stateOverrides` API parameters

**Rollback configuration:**
```javascript
const ROLLBACK_CLEARS = {
  'input-review': [...],           // Clears everything
  'paper-evidence-selection': [...],
  'character-ids': [...],
  'evidence-bundle': [...],
  'arc-selection': [...],          // Most common - regenerate arcs with new focus
  'outline': [...],
  'article': [...]
};
```

**Usage example:**
```javascript
POST /api/generate
{
  sessionId: "1220",
  theme: "journalist",
  rollbackTo: "arc-selection",
  stateOverrides: {
    playerFocus: { primaryInvestigation: "New angle to explore" }
  }
}
```

**Rationale:**
1. Directors can adjust player focus and regenerate arcs
2. Each rollback point clears downstream state, triggering regeneration
3. Revision counters reset for fresh attempts
4. State overrides applied after rollback, before resuming

**Impact:** New constants `ROLLBACK_CLEARS`, `ROLLBACK_COUNTER_RESETS`, `VALID_ROLLBACK_POINTS` in state.js.

---

### Decision 8.9.4: Paper Evidence Selection Checkpoint
**Gap:** No way for user to indicate which paper evidence was actually unlocked
**Implemented:** Checkpoint after `fetchPaperEvidence` for user selection

**Flow:**
```
fetchPaperEvidence → setPaperEvidenceCheckpoint → [user selects] → fetchSessionPhotos
```

**API response at checkpoint:**
```javascript
{
  approvalType: 'paper-evidence-selection',
  paperEvidence: [/* all available items */]
}
```

**User input:**
```javascript
{
  approvals: {
    selectedPaperEvidence: [
      { title: "Victoria Voice Memo" },
      { title: "Shell Company Documents" }
    ]
  }
}
```

**Rationale:**
1. Not all evidence is unlocked in every session
2. User selects what was actually found
3. Only selected evidence proceeds to curation
4. Enables session-specific evidence bundles

**Impact:** New phase `SELECT_PAPER_EVIDENCE` (1.35). New state field `selectedPaperEvidence`. New approval type `PAPER_EVIDENCE_SELECTION`.

---

### Decision 8.9.5: Character ID Input with LLM-Powered Enrichment
**Gap:** Photo analyses had generic descriptions ("person in red dress"), no character names
**Implemented:** Checkpoint for character identification + LLM-powered enrichment

**Flow:**
```
analyzePhotos → setCharacterIdCheckpoint → [user provides IDs] → finalizePhotoAnalyses → preprocessEvidence
```

**API response at checkpoint:**
```javascript
{
  approvalType: 'character-ids',
  sessionPhotos: [...],
  photoAnalyses: {
    analyses: [{
      filename: 'photo1.jpg',
      visualContent: 'Group gathered around table',
      characterDescriptions: [
        { description: 'person in red dress', role: 'pointing accusingly' }
      ]
    }]
  },
  sessionConfig: { roster: ['Victoria Blackwood', 'James Harrison', ...] }
}
```

**User input format:**
```javascript
{
  approvals: {
    characterIds: {
      "photo1.jpg": {
        characterMappings: [
          { descriptionIndex: 0, characterName: "Victoria Blackwood" }
        ],
        additionalCharacters: [
          { description: "person on left edge", characterName: "The Valet (NPC)", role: "observing" }
        ],
        corrections: {
          location: "Actually the study, not the living room",
          context: "This is the final accusation scene",
          other: null
        },
        exclude: false
      }
    }
  }
}
```

**LLM-powered enrichment (finalizePhotoAnalyses):**
```javascript
// For each photo with mappings/corrections:
const enrichment = await sdk({
  systemPrompt: 'Enrich photo analyses for NovaNews article...',
  prompt: buildEnrichmentPrompt(analysis, userInput),
  model: 'haiku',
  jsonSchema: ENRICHED_PHOTO_SCHEMA
});

// Output:
{
  enrichedVisualContent: "Victoria Blackwood and James Harrison gathered around table...",
  enrichedNarrativeMoment: "The final accusation in the study...",
  finalCaption: "Victoria confronts James with the evidence",
  identifiedCharacters: ["Victoria Blackwood", "James Harrison", "The Valet (NPC)"]
}
```

**Key features:**
1. User maps Haiku's descriptions to character names via dropdown (from roster)
2. User can add characters Haiku missed (NPCs, partial visibility)
3. User can provide corrections to location/context
4. User can exclude photos that aren't useful
5. LLM rewrites visual content with character names naturally integrated
6. Enriched photos flow to arc analysis for visual storytelling

**Rationale:**
1. Photos are critical anchors for visual storytelling
2. Director knows WHO is in photos (Haiku only describes WHAT)
3. LLM makes rewrites natural, not mechanical find/replace
4. Enriched data informs arc selection and outline generation

**Impact:** New phases `CHARACTER_ID_CHECKPOINT` (1.66) and `FINALIZE_PHOTOS` (1.67). `finalizePhotoAnalyses` is LLM-powered. Approval type `CHARACTER_IDS` already existed but now fully implemented.

---

## Summary of Commit 8.9 Impacts

| Decision | Impact |
|----------|--------|
| Raw input parsing | Directors paste notes, Claude structures |
| File-based specialists | Agent definitions in `.claude/agents/` |
| Rollback mechanism | Re-run from any checkpoint with modified guidance |
| Paper evidence selection | Session-specific evidence bundles |
| Character ID enrichment | Photos become visual storytelling anchors |

---

## Updated State Field Count

After Commit 8.9, state has **33 fields** (was 30):

| Field | Added In | Purpose |
|-------|----------|---------|
| ... (previous 30 fields) | ... | ... |
| **rawSessionInput** | **Commit 8.9** | **Unstructured user input** |
| **selectedPaperEvidence** | **Commit 8.9** | **User-selected paper evidence** |
| **_parsedInput** | **Commit 8.9** | **Internal: parsed input for review** |

---

## Updated PHASES Constant

After Commit 8.9:

```javascript
const PHASES = {
  INIT: 'init',
  // Phase 0: Input parsing (Commit 8.9)
  PARSE_INPUT: '0.1',
  REVIEW_INPUT: '0.2',
  // Phase 1: Data acquisition
  LOAD_DIRECTOR_NOTES: '1.1',
  FETCH_TOKENS: '1.2',
  FETCH_EVIDENCE: '1.3',
  SELECT_PAPER_EVIDENCE: '1.35',     // Commit 8.9.4
  FETCH_PHOTOS: '1.4',
  ANALYZE_PHOTOS: '1.65',
  CHARACTER_ID_CHECKPOINT: '1.66',   // Commit 8.9.5
  FINALIZE_PHOTOS: '1.67',           // Commit 8.9.5
  PREPROCESS_EVIDENCE: '1.7',
  CURATE_EVIDENCE: '1.8',
  // ... remaining phases unchanged
};
```

---

## Updated APPROVAL_TYPES Constant

After Commit 8.9:

```javascript
const APPROVAL_TYPES = {
  INPUT_REVIEW: 'input-review',                    // Commit 8.9.1
  PAPER_EVIDENCE_SELECTION: 'paper-evidence-selection', // Commit 8.9.4
  CHARACTER_IDS: 'character-ids',                  // Commit 8.9.5 (fully implemented)
  EVIDENCE_AND_PHOTOS: 'evidence-and-photos',
  EVIDENCE_BUNDLE: 'evidence-bundle',
  ARC_SELECTION: 'arc-selection',
  OUTLINE: 'outline',
  ARTICLE: 'article'
};
