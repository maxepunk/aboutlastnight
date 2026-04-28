# Pipeline Integrity Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate five concrete pipeline failure modes (silent SDK contract violations, skill autoloading leakage, paper-evidence content stripping, batch-timeout silent data loss, and observability state bloat) that have been silently degrading every report and occasionally producing visible crashes.

**Architecture:** Five surgical interventions across three layers. Layer 1 (`lib/llm/`): wrap the SDK with a structured-output contract that recovers from the documented `success`-without-`structured_output` SDK bug (#277) and a per-call `loadProjectSettings` flag using the documented `settingSources: []` mechanism. Layer 2 (`lib/evidence-preprocessor.js`, `lib/workflow/nodes/ai-nodes.js`): preserve `rawData` and `fullContent` through the curate→score→bundle merge so evidence cards have content. Layer 3 (workflow nodes + console UI): one retry on scoring batch timeouts, drop the 60s extractCharacterData override, distinguish scoring errors in the rescue UI, and add explicit state pruning after arc package build.

**Tech Stack:** Node.js, Claude Agent SDK 0.2.119, LangGraph 1.0, Jest 30, ajv 8 (already a dep), React 18 (CDN, no build), Express.

---

## File Structure

**New files:**
- `lib/llm/structured-output-extractor.js` — JSON-from-text extraction + ajv schema validation. Pure, no SDK deps. One responsibility: turn `{maybeText, schema}` into `{result | throw}`.
- `lib/llm/__tests__/structured-output-extractor.test.js` — unit tests for extractor (markdown fence, bare JSON, invalid JSON, schema-invalid).
- `lib/llm/__tests__/client-contract.test.js` — integration-style tests for `sdkQueryImpl` contract behavior using a fake `query()` async-iterator.
- `lib/__tests__/evidence-content-preservation.test.js` — end-to-end test for `fullContent` preservation through preprocess→score→bundle.

**Modified files:**
- `lib/llm/client.js` — wire extractor into result handling; add `loadProjectSettings` option that maps to `settingSources: []` when false.
- `lib/observability/progress-bridge.js` — nullish-safe stringify on llm_complete (defense-in-depth).
- `lib/evidence-preprocessor.js` — preserve `rawData` in merged item output (both happy and fallback paths).
- `lib/workflow/nodes/ai-nodes.js` — one retry on `scorePaperEvidence` batch timeout; preserve `original.fullContent` in merge; assert evidence content non-empty in `buildArcEvidencePackages`; prune `preprocessedEvidence` and `photoAnalyses.analyses` post-bundle.
- `lib/workflow/nodes/photo-nodes.js` — pass `loadProjectSettings: false` on photo SDK calls.
- `lib/workflow/nodes/character-data-nodes.js` — remove 60s override; pass `loadProjectSettings: false`.
- `lib/workflow/nodes/input-nodes.js` — pass `loadProjectSettings: false` on parse calls (steps 1, 2, 4 only — step 3 director enrichment keeps default for now).
- `lib/workflow/nodes/arc-specialist-nodes.js` — keep `loadProjectSettings` default (narrative gen needs project context). No edits to behavior.
- `console/components/checkpoints/EvidenceBundle.js` — distinct badge for `excludeReason === 'scoringError'` (uses existing `--accent-amber`).
- `__tests__/mocks/anthropic-sdk.mock.js` — extend with `setMockQuery`/`clearMockQuery` to allow per-test SDK behavior overrides (needed because `jest.config.js`'s `moduleNameMapper` prevents per-file `jest.mock()` overrides).

**Out of scope:**
- Arc analysis revision loop changes (separate concern).
- Photo enrichment retry logic (`finalizePhotoAnalyses` already has per-photo fallback).
- Schema-as-text fallback for `generateContentBundle` (consider after Control 1 measured impact).

---

## Pre-Plan Verification

- [ ] **Step 0: Confirm baseline tests pass**

Run: `cd C:/Users/spide/documents/claudecode/aboutlastnight/reports && npm test`
Expected: All existing tests pass. Note any pre-existing failures so they aren't attributed to this work.

---

## Task 1: Structured Output Extractor (C1 helper)

**Files:**
- Create: `lib/llm/structured-output-extractor.js`
- Create: `lib/llm/__tests__/structured-output-extractor.test.js`

- [ ] **Step 1: Write the failing test**

Create `lib/llm/__tests__/structured-output-extractor.test.js`:

```javascript
const { extractStructuredOutput, StructuredOutputExtractionError } = require('../structured-output-extractor');

const SIMPLE_SCHEMA = {
  type: 'object',
  required: ['name', 'count'],
  properties: {
    name: { type: 'string' },
    count: { type: 'integer' }
  }
};

describe('extractStructuredOutput', () => {
  test('returns valid structured output unchanged', () => {
    const result = extractStructuredOutput({
      structuredOutput: { name: 'foo', count: 3 },
      resultText: 'ignored',
      schema: SIMPLE_SCHEMA
    });
    expect(result).toEqual({ name: 'foo', count: 3 });
  });

  test('extracts JSON from a markdown fence in resultText when structuredOutput missing', () => {
    const text = 'Here is the answer:\n```json\n{"name": "bar", "count": 7}\n```\nDone.';
    const result = extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    });
    expect(result).toEqual({ name: 'bar', count: 7 });
  });

  test('extracts a bare JSON object from resultText when no fence is present', () => {
    const text = 'Some preamble. {"name": "baz", "count": 0} Some trailing prose.';
    const result = extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    });
    expect(result).toEqual({ name: 'baz', count: 0 });
  });

  test('throws StructuredOutputExtractionError when text contains no JSON', () => {
    expect(() => extractStructuredOutput({
      structuredOutput: undefined,
      resultText: 'no json here at all',
      schema: SIMPLE_SCHEMA
    })).toThrow(StructuredOutputExtractionError);
  });

  test('throws StructuredOutputExtractionError when JSON does not match schema', () => {
    const text = '```json\n{"name": "missing-count"}\n```';
    expect(() => extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    })).toThrow(/schema/i);
  });

  test('error includes diagnostic context (model label, schemaErrors)', () => {
    try {
      extractStructuredOutput({
        structuredOutput: undefined,
        resultText: '```json\n{"name": 42}\n```',
        schema: SIMPLE_SCHEMA,
        label: 'test-call',
        model: 'opus'
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(StructuredOutputExtractionError);
      expect(err.label).toBe('test-call');
      expect(err.model).toBe('opus');
      expect(Array.isArray(err.schemaErrors)).toBe(true);
    }
  });

  test('prefers structuredOutput when both are present and valid', () => {
    const result = extractStructuredOutput({
      structuredOutput: { name: 'from-structured', count: 1 },
      resultText: '```json\n{"name": "from-text", "count": 2}\n```',
      schema: SIMPLE_SCHEMA
    });
    expect(result).toEqual({ name: 'from-structured', count: 1 });
  });

  test('falls back to resultText when structuredOutput exists but is schema-invalid', () => {
    const result = extractStructuredOutput({
      structuredOutput: { name: 42 }, // wrong type
      resultText: '```json\n{"name": "valid", "count": 1}\n```',
      schema: SIMPLE_SCHEMA
    });
    expect(result).toEqual({ name: 'valid', count: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/llm/__tests__/structured-output-extractor.test.js -v`
Expected: FAIL with "Cannot find module '../structured-output-extractor'"

- [ ] **Step 3: Implement the extractor**

Create `lib/llm/structured-output-extractor.js`:

```javascript
/**
 * Structured Output Extractor
 *
 * Recovers structured output from SDK responses when the SDK's outputFormat
 * mechanism silently fails (see anthropics/claude-agent-sdk-typescript#277).
 *
 * Strategy:
 * 1. If structuredOutput is present and schema-valid → return it
 * 2. Else extract JSON from resultText (markdown fence, then bare object)
 * 3. Validate against schema with ajv
 * 4. Return on success, throw with diagnostic context on failure
 *
 * @module llm/structured-output-extractor
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

class StructuredOutputExtractionError extends Error {
  constructor(message, { schemaErrors = [], label, model, lastText } = {}) {
    super(message);
    this.name = 'StructuredOutputExtractionError';
    this.schemaErrors = schemaErrors;
    this.label = label;
    this.model = model;
    this.lastText = lastText;
  }
}

/**
 * Extract a JSON object from text, handling markdown fences and bare objects.
 *
 * @param {string} text
 * @returns {Object|null} Parsed object or null if no JSON found
 */
function tryExtractJson(text) {
  if (typeof text !== 'string' || text.length === 0) return null;

  // Try markdown fences first (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {
      // Fall through to bare-object scan
    }
  }

  // Scan for the first balanced top-level JSON object
  // (Greedy substring between first { and last } — works for flat outputs;
  // for our use case the model emits a single top-level object.)
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      // Not valid JSON
    }
  }

  return null;
}

/**
 * Extract validated structured output, with fallback to resultText parsing.
 *
 * @param {Object} args
 * @param {*} args.structuredOutput - SDK-provided structured_output (may be undefined)
 * @param {string} args.resultText - SDK-provided result text (may be empty)
 * @param {Object} args.schema - JSON schema to validate against
 * @param {string} [args.label] - Call label for diagnostics
 * @param {string} [args.model] - Model name for diagnostics
 * @returns {Object} Schema-valid object
 * @throws {StructuredOutputExtractionError} When no schema-valid object can be produced
 */
function extractStructuredOutput({ structuredOutput, resultText, schema, label, model }) {
  const validate = ajv.compile(schema);

  // Path 1: SDK-provided structured output is valid
  if (structuredOutput !== undefined && structuredOutput !== null) {
    if (validate(structuredOutput)) {
      return structuredOutput;
    }
    // Fall through to text-extraction; SDK output was schema-invalid
  }

  // Path 2: Extract from resultText
  const extracted = tryExtractJson(resultText);
  if (extracted === null) {
    throw new StructuredOutputExtractionError(
      `No JSON object found in result text (length=${(resultText || '').length})`,
      { label, model, lastText: resultText }
    );
  }

  if (!validate(extracted)) {
    throw new StructuredOutputExtractionError(
      `Extracted JSON does not match schema: ${ajv.errorsText(validate.errors)}`,
      { schemaErrors: validate.errors || [], label, model, lastText: resultText }
    );
  }

  return extracted;
}

module.exports = {
  extractStructuredOutput,
  tryExtractJson,
  StructuredOutputExtractionError
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/llm/__tests__/structured-output-extractor.test.js -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/llm/structured-output-extractor.js lib/llm/__tests__/structured-output-extractor.test.js
git commit -m "feat(llm): add structured output extractor with text fallback

Recovers from SDK bug #277 where outputFormat returns success without
populating structured_output. Falls back to parsing JSON from resultText
(markdown fence or bare object), validates with ajv, throws diagnostic
error on failure."
```

---

## Task 2: Wire Extractor into client.js (C1 main + C2 setup)

**Files:**
- Modify: `lib/llm/client.js:80-284` (sdkQueryImpl)
- Modify: `__tests__/mocks/anthropic-sdk.mock.js` (add per-test override hook)
- Create: `lib/llm/__tests__/client-contract.test.js`

> **Important — Jest mock infrastructure:** `jest.config.js:5-7` declares
> `moduleNameMapper` mapping `@anthropic-ai/claude-agent-sdk` to
> `__tests__/mocks/anthropic-sdk.mock.js`. `moduleNameMapper` resolves BEFORE
> `jest.mock()` and cannot be overridden per-file. So instead of trying to
> remock the SDK package, we extend the existing mock with a `setMockQuery`
> hook that tests can use to install custom behavior for one test.

- [ ] **Step 1a: Extend the SDK mock with a per-test override**

In `__tests__/mocks/anthropic-sdk.mock.js`, replace the entire file with:

```javascript
/**
 * Jest Mock for @anthropic-ai/claude-agent-sdk
 *
 * The real SDK is ESM (.mjs) which Jest cannot parse in CommonJS mode.
 * For unit tests that need to control SDK responses, use setMockQuery()
 * to install a custom async-iterator implementation for one test.
 *
 * For workflow node tests that just need a simulated client, prefer
 * dependency injection via config.configurable.sdkClient.
 */

let customQueryImpl = null;

function setMockQuery(fn) { customQueryImpl = fn; }
function clearMockQuery() { customQueryImpl = null; }

async function* defaultMockQueryGenerator(options) {
  yield {
    type: 'result',
    subtype: 'success',
    result: JSON.stringify({ success: true }),
    structured_output: options.options?.outputFormat?.schema ? {} : undefined
  };
}

function query(options) {
  if (customQueryImpl) return customQueryImpl(options);
  return defaultMockQueryGenerator(options);
}

module.exports = { query, setMockQuery, clearMockQuery };
```

- [ ] **Step 1b: Write the failing test**

Create `lib/llm/__tests__/client-contract.test.js`:

```javascript
const { StructuredOutputExtractionError } = require('../structured-output-extractor');
const { setMockQuery, clearMockQuery } = require('@anthropic-ai/claude-agent-sdk');
const { sdkQueryImpl } = require('../client');

const SIMPLE_SCHEMA = {
  type: 'object',
  required: ['ok'],
  properties: { ok: { type: 'boolean' } }
};

function makeAsyncIterable(messages) {
  return (async function* () {
    for (const m of messages) yield m;
  })();
}

describe('sdkQueryImpl contract', () => {
  afterEach(() => {
    clearMockQuery();
  });

  test('returns structured_output when present and schema-valid', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: '{"ok":true}', structured_output: { ok: true } }
    ]));

    const result = await sdkQueryImpl({
      prompt: 'test',
      jsonSchema: SIMPLE_SCHEMA,
      model: 'haiku'
    });

    expect(result).toEqual({ ok: true });
  });

  test('falls back to text extraction when structured_output missing on success', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: '```json\n{"ok":true}\n```' }
      // no structured_output field — reproduces SDK bug #277
    ]));

    const result = await sdkQueryImpl({
      prompt: 'test',
      jsonSchema: SIMPLE_SCHEMA,
      model: 'haiku'
    });

    expect(result).toEqual({ ok: true });
  });

  test('throws StructuredOutputExtractionError when both paths fail', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: 'no json here' }
    ]));

    await expect(sdkQueryImpl({
      prompt: 'test',
      jsonSchema: SIMPLE_SCHEMA,
      model: 'haiku',
      label: 'contract-test'
    })).rejects.toThrow(StructuredOutputExtractionError);
  });

  test('passes through non-schema text result unchanged', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: 'plain text response' }
    ]));

    const result = await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku'
      // no jsonSchema
    });

    expect(result).toBe('plain text response');
  });

  test('settingSources: [] is set when loadProjectSettings is false', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([
        { type: 'result', subtype: 'success', result: 'ok' }
      ]);
    });

    await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku',
      loadProjectSettings: false
    });

    expect(capturedOptions.settingSources).toEqual([]);
  });

  test('settingSources is omitted when loadProjectSettings is true (SDK default)', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([
        { type: 'result', subtype: 'success', result: 'ok' }
      ]);
    });

    await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku',
      loadProjectSettings: true
    });

    expect(capturedOptions.settingSources).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/llm/__tests__/client-contract.test.js -v`
Expected: FAIL — text-extraction fallback test fails because `client.js` currently returns `msg.structured_output` directly (which is undefined); `loadProjectSettings` tests fail because the option is unrecognized. The mock-infrastructure update from Step 1a may also produce one-time changes to other tests if they rely on the old behavior — sanity-check `npm test` after Step 1a alone and reconcile if any unrelated test fails (none should, since the default codepath is preserved).

- [ ] **Step 3: Implement the contract layer in client.js**

In `lib/llm/client.js`, at the top of the file after line 17 (`const { query } = require('@anthropic-ai/claude-agent-sdk');`), add:

```javascript
const { extractStructuredOutput, StructuredOutputExtractionError } = require('./structured-output-extractor');
```

Modify the function signature at line 80-93 to add `loadProjectSettings`:

```javascript
async function sdkQueryImpl({
  prompt,
  systemPrompt,
  model = 'sonnet',
  jsonSchema,
  allowedTools = [],
  agents,
  cwd,
  effort,
  timeoutMs,
  onProgress,
  label,
  disableTools = false,
  loadProjectSettings = true
}) {
```

Modify the options-assembly block (around lines 105-152). After the `permissionMode` setup, add:

```javascript
  // Control 2: scope filesystem-loaded skills/settings per call.
  // Default true preserves SDK behavior (loads .claude/skills/ from cwd).
  // Pass false on utility calls (photo, normalization) to avoid auto-loading
  // unrelated skill prompts that pollute system context.
  if (loadProjectSettings === false) {
    options.settingSources = [];
  }
```

Modify the success-result handling at lines 239-253. Replace:

```javascript
      // Handle successful result
      if (msg.type === 'result' && msg.subtype === 'success') {
        clearTimeout(timeoutId);
        const finalResult = jsonSchema ? msg.structured_output : msg.result;

        // Emit llm_complete event with FULL response (no truncation)
        if (onProgress) {
          onProgress({
            type: 'llm_complete',
            elapsed: (Date.now() - startTime) / 1000,
            result: finalResult,
            jsonSchema
          });
        }

        return finalResult;
      }
```

With:

```javascript
      // Handle successful result
      if (msg.type === 'result' && msg.subtype === 'success') {
        clearTimeout(timeoutId);

        let finalResult;
        if (jsonSchema) {
          // Control 1: SDK contract enforcement.
          // Per SDK bug #277, subtype='success' can arrive without structured_output.
          // The extractor falls back to parsing JSON from msg.result text.
          finalResult = extractStructuredOutput({
            structuredOutput: msg.structured_output,
            resultText: msg.result,
            schema: jsonSchema,
            label: progressLabel,
            model: resolvedModel
          });
        } else {
          finalResult = msg.result;
        }

        // Emit llm_complete event with FULL response (no truncation)
        if (onProgress) {
          onProgress({
            type: 'llm_complete',
            elapsed: (Date.now() - startTime) / 1000,
            result: finalResult,
            jsonSchema
          });
        }

        return finalResult;
      }
```

Note: when `extractStructuredOutput` throws, the existing catch block at line 273 will surface it with timeout context (and re-throw if not abort). Since we want the diagnostic info preserved, we need to update the catch to NOT wrap StructuredOutputExtractionError. Update lines 273-283:

```javascript
  } catch (error) {
    clearTimeout(timeoutId);

    // Preserve structured-output extraction errors as-is (they carry diagnostics)
    if (error instanceof StructuredOutputExtractionError) {
      throw error;
    }

    // Check if it was an abort/timeout
    if (error.name === 'AbortError' || abortController.signal.aborted) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      throw new Error(`SDK timeout after ${elapsed}s (limit: ${effectiveTimeout / 1000}s) - ${progressLabel}`);
    }

    throw error;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/llm/__tests__/client-contract.test.js -v`
Expected: PASS (6 tests)

Run: `npx jest lib/llm/ -v`
Expected: All llm tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/llm/client.js lib/llm/__tests__/client-contract.test.js
git commit -m "feat(llm): enforce structured output contract; add loadProjectSettings

When jsonSchema is provided, sdkQueryImpl now validates the SDK response
and falls back to parsing JSON from msg.result text on the documented
SDK bug #277 path. Failures throw StructuredOutputExtractionError with
diagnostic context instead of returning undefined.

Adds loadProjectSettings option (default true). When false, sets
settingSources: [] to prevent auto-loading .claude/skills/ from cwd.
Used for utility calls that don't need narrative-gen context."
```

---

## Task 3: Defense-in-Depth on Progress Bridge (C1 cleanup)

**Files:**
- Modify: `lib/observability/progress-bridge.js:150-153`

- [ ] **Step 1: Write the failing test**

Create `lib/observability/__tests__/progress-bridge-undefined-result.test.js`:

```javascript
const { createProgressFromTrace } = require('../progress-bridge');

// Force progress enabled for the test
process.env.SDK_PROGRESS = 'true';

describe('progress-bridge llm_complete with undefined result', () => {
  test('does not throw on undefined result (defense-in-depth)', () => {
    const logger = createProgressFromTrace('test-context', null);
    expect(() => logger({
      type: 'llm_complete',
      elapsed: 1.5,
      result: undefined,
      jsonSchema: { type: 'object' }
    })).not.toThrow();
  });

  test('does not throw on null result', () => {
    const logger = createProgressFromTrace('test-context', null);
    expect(() => logger({
      type: 'llm_complete',
      elapsed: 1.5,
      result: null
    })).not.toThrow();
  });

  test('logs character count when result is a valid object', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createProgressFromTrace('test-context', null);
    logger({
      type: 'llm_complete',
      elapsed: 1.5,
      result: { hello: 'world' }
    });
    const lastCall = logSpy.mock.calls[logSpy.mock.calls.length - 1][0];
    expect(lastCall).toMatch(/Completed \(\d+ chars\)/);
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/observability/__tests__/progress-bridge-undefined-result.test.js -v`
Expected: FAIL — first test throws "Cannot read properties of undefined (reading 'length')".

- [ ] **Step 3: Patch progress-bridge.js**

In `lib/observability/progress-bridge.js`, find lines 150-153:

```javascript
    if (msg.type === 'llm_complete') {
      const responseStr = JSON.stringify(msg.result);
      const logLine = `[${context}] [${msg.elapsed?.toFixed(1) || '?'}s] ${PROGRESS_ICONS.llm_complete} Completed (${responseStr.length} chars)`;
      console.log(logLine);
```

Replace with:

```javascript
    if (msg.type === 'llm_complete') {
      const responseStr = msg.result === undefined || msg.result === null
        ? '<empty>'
        : JSON.stringify(msg.result);
      const charCount = responseStr === '<empty>' ? 0 : responseStr.length;
      const logLine = `[${context}] [${msg.elapsed?.toFixed(1) || '?'}s] ${PROGRESS_ICONS.llm_complete} Completed (${charCount} chars)`;
      console.log(logLine);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/observability/__tests__/progress-bridge-undefined-result.test.js -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/observability/progress-bridge.js lib/observability/__tests__/progress-bridge-undefined-result.test.js
git commit -m "fix(observability): defense-in-depth for undefined llm_complete result

Belt-and-suspenders patch alongside the contract layer in client.js.
If a future SDK regression returns undefined again, we log <empty>
instead of crashing on .length."
```

---

## Task 4: Apply loadProjectSettings to Photo Nodes (C2 application)

**Files:**
- Modify: `lib/workflow/nodes/photo-nodes.js:249-259` (analyzeSinglePhoto)
- Modify: `lib/workflow/nodes/photo-nodes.js` (finalizePhotoAnalyses — find with grep)

- [ ] **Step 1: Write the failing test**

Create `lib/workflow/nodes/__tests__/photo-nodes-skill-isolation.test.js`:

```javascript
const { _testing } = require('../photo-nodes');

// We test by capturing the SDK call options
function makeCapturingSdk() {
  const calls = [];
  const fn = async (options) => {
    calls.push(options);
    return {
      filename: options.label || 'unknown.jpg',
      visualContent: 'mock content',
      narrativeMoment: 'mock moment',
      suggestedCaption: 'mock caption',
      characterDescriptions: [],
      emotionalTone: 'neutral',
      storyRelevance: 'supporting'
    };
  };
  fn.calls = calls;
  return fn;
}

describe('photo-nodes skill isolation', () => {
  test('analyzeSinglePhoto passes loadProjectSettings: false to sdk', async () => {
    if (!_testing?.analyzeSinglePhoto) {
      // Module doesn't expose internals; test via behavior elsewhere
      return;
    }
    const sdk = makeCapturingSdk();
    const promptBuilder = {
      buildPhotoAnalysisPrompt: async () => ({ systemPrompt: 'sys', userPrompt: 'user' })
    };

    await _testing.analyzeSinglePhoto({
      sdk,
      imagePromptBuilder: promptBuilder,
      playerFocus: {},
      roster: [],
      processedPath: '/tmp/test.jpg',
      originalFilename: 'test.jpg',
      timeoutMs: 60000
    });

    expect(sdk.calls[0].loadProjectSettings).toBe(false);
  });
});
```

- [ ] **Step 2: Verify `_testing.analyzeSinglePhoto` already exists (no edit needed)**

Run: `grep -n "_testing\|analyzeSinglePhoto" lib/workflow/nodes/photo-nodes.js | tail -5`

Expected: shows `_testing: {` block around line 1022 with `analyzeSinglePhoto` already inside (line 1023). No code change needed; proceed to Step 3.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest lib/workflow/nodes/__tests__/photo-nodes-skill-isolation.test.js -v`
Expected: FAIL — `loadProjectSettings` is undefined in the captured call.

- [ ] **Step 4: Add the option to photo SDK calls**

In `lib/workflow/nodes/photo-nodes.js`, find the `sdk()` call inside `analyzeSinglePhoto` (around line 249-259). It currently looks like:

```javascript
    const analysis = await sdk({
      systemPrompt,
      prompt: userPrompt,
      model: 'haiku',
      jsonSchema: PHOTO_ANALYSIS_SCHEMA,
      allowedTools: ['Read'],
      timeoutMs,
      label: originalFilename
    });
```

Change to:

```javascript
    const analysis = await sdk({
      systemPrompt,
      prompt: userPrompt,
      model: 'haiku',
      jsonSchema: PHOTO_ANALYSIS_SCHEMA,
      allowedTools: ['Read'],
      timeoutMs,
      label: originalFilename,
      loadProjectSettings: false
    });
```

Now find the SDK call inside `finalizePhotoAnalyses` (it processes per-photo enrichment with concurrency).

Run: `grep -n "await sdk" lib/workflow/nodes/photo-nodes.js`

For each `sdk()` call inside `finalizePhotoAnalyses` per-photo enrichment, add `loadProjectSettings: false`. Example (the call near line 880 in photo-nodes.js, inside the per-photo enrichment block):

```javascript
    const enrichedAnalysis = await sdk({
      systemPrompt: enrichmentSystemPrompt,
      prompt: enrichmentPrompt,
      model: 'haiku',
      jsonSchema: ENRICHED_PHOTO_ANALYSIS_SCHEMA,
      allowedTools: [],
      label: `enrich:${analysis.filename}`,
      loadProjectSettings: false
    });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/workflow/nodes/__tests__/photo-nodes-skill-isolation.test.js -v`
Expected: PASS

Run: `npx jest lib/workflow/nodes/ -v`
Expected: All workflow node tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add lib/workflow/nodes/photo-nodes.js lib/workflow/nodes/__tests__/photo-nodes-skill-isolation.test.js
git commit -m "fix(photo-nodes): isolate from project skills via loadProjectSettings

Photo analysis and enrichment don't need .claude/skills/journalist-report/SKILL.md
loaded into context. Setting loadProjectSettings: false stops the model from
attempting Skill('journalist-image-analyzer') which doesn't exist in this
SDK environment, eliminating 5-15s of waste per photo per call."
```

---

## Task 5: Apply loadProjectSettings to Normalization Nodes (C2 application)

**Files:**
- Modify: `lib/workflow/nodes/character-data-nodes.js:101-109`
- Modify: `lib/evidence-preprocessor.js` (processBatch SDK call)
- Modify: `lib/workflow/nodes/ai-nodes.js:200-208` (scorePaperEvidence batch)
- Modify: `lib/workflow/nodes/input-nodes.js` (parseRawInput steps 1, 2, 4)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/normalization-skill-isolation.test.js`:

```javascript
const { extractCharacterData } = require('../workflow/nodes/character-data-nodes')._testing;

function makeCapturingSdk(returnValue = { characters: {} }) {
  const calls = [];
  const fn = async (options) => {
    calls.push(options);
    return returnValue;
  };
  fn.calls = calls;
  return fn;
}

describe('normalization nodes skill isolation', () => {
  test('extractCharacterData passes loadProjectSettings: false', async () => {
    const sdk = makeCapturingSdk({ characters: {} });
    const state = {
      sessionId: 'test',
      paperEvidence: [],
      memoryTokens: [],
      sessionConfig: { roster: [] }
    };
    const config = { configurable: { sdkClient: sdk } };
    await extractCharacterData(state, config);
    expect(sdk.calls[0].loadProjectSettings).toBe(false);
  });

  test('extractCharacterData no longer overrides timeoutMs to 60s', async () => {
    const sdk = makeCapturingSdk({ characters: {} });
    const state = {
      sessionId: 'test',
      paperEvidence: [],
      memoryTokens: [],
      sessionConfig: { roster: [] }
    };
    const config = { configurable: { sdkClient: sdk } };
    await extractCharacterData(state, config);
    // The 60s override is removed; timeoutMs should be undefined (inherits Haiku 120s default)
    expect(sdk.calls[0].timeoutMs).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/normalization-skill-isolation.test.js -v`
Expected: FAIL — `loadProjectSettings` undefined; `timeoutMs` is 60000.

- [ ] **Step 3: Update character-data-nodes.js (also addresses C4b)**

In `lib/workflow/nodes/character-data-nodes.js`, find the `sdk()` call around line 101-109:

```javascript
    const result = await sdk({
      prompt,
      systemPrompt: 'You extract structured character data from narrative evidence. Be factual and precise. Only report what the evidence explicitly states.',
      model: 'haiku',
      jsonSchema: CHARACTER_EXTRACTION_SCHEMA,
      timeoutMs: 60000,
      disableTools: true,
      label: 'Character data extraction'
    });
```

Change to:

```javascript
    const result = await sdk({
      prompt,
      systemPrompt: 'You extract structured character data from narrative evidence. Be factual and precise. Only report what the evidence explicitly states.',
      model: 'haiku',
      jsonSchema: CHARACTER_EXTRACTION_SCHEMA,
      // Removed timeoutMs: 60000 — inherits Haiku 120s default to avoid
      // spurious timeouts on 16K-token inputs (Control 4b).
      disableTools: true,
      label: 'Character data extraction',
      loadProjectSettings: false
    });
```

- [ ] **Step 4: Update evidence-preprocessor.js**

Run: `grep -n "await sdkClient" lib/evidence-preprocessor.js`

Find the call (around line 313 per earlier read). It looks like:

```javascript
    const parsed = await sdkClient({
      prompt: userPrompt,
      systemPrompt: SYSTEM_PROMPT,
      model: 'haiku',
      jsonSchema: BATCH_RESPONSE_SCHEMA
    });
```

Change to:

```javascript
    const parsed = await sdkClient({
      prompt: userPrompt,
      systemPrompt: SYSTEM_PROMPT,
      model: 'haiku',
      jsonSchema: BATCH_RESPONSE_SCHEMA,
      loadProjectSettings: false
    });
```

- [ ] **Step 5: Update ai-nodes.js (scorePaperEvidence)**

In `lib/workflow/nodes/ai-nodes.js` around line 200-208:

```javascript
      const response = await sdk({
        prompt,
        systemPrompt: PAPER_SCORING_PROMPT,
        model: 'sonnet',
        timeoutMs: 2 * 60 * 1000,
        jsonSchema: PAPER_SCORING_SCHEMA,
        disableTools: true,
        label: `Paper evidence batch ${batchIdx + 1}/${batches.length}`
      });
```

Change to:

```javascript
      const response = await sdk({
        prompt,
        systemPrompt: PAPER_SCORING_PROMPT,
        model: 'sonnet',
        timeoutMs: 2 * 60 * 1000,
        jsonSchema: PAPER_SCORING_SCHEMA,
        disableTools: true,
        label: `Paper evidence batch ${batchIdx + 1}/${batches.length}`,
        loadProjectSettings: false
      });
```

- [ ] **Step 6: Update input-nodes.js (parseRawInput steps 1, 2, 4)**

Run: `grep -n "await sdkClient\|await sdk(" lib/workflow/nodes/input-nodes.js`

For each `sdk()` call in `parseRawInput` (steps that parse session data — NOT the step 3 director enrichment which is narrative-context-heavy and may benefit from project settings), add `loadProjectSettings: false`. Example pattern:

Find the step 1 (roster/accusation parsing) call. It will look similar to:

```javascript
    const result = await sdk({
      prompt: ...,
      systemPrompt: ...,
      model: 'haiku',
      jsonSchema: ROSTER_ACCUSATION_SCHEMA,
      label: 'Parse roster and accusation'
    });
```

Add `loadProjectSettings: false` to each of: step 1 (roster parsing), step 2 (session report parsing), step 4 (whiteboard analysis). Skip step 3 (director enrichment) — leave default.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest lib/__tests__/normalization-skill-isolation.test.js -v`
Expected: PASS

Run: `npm test -- --testPathPattern="character-data|evidence-preprocessor|input-nodes"`
Expected: All pass (no regressions).

- [ ] **Step 8: Commit**

```bash
git add lib/workflow/nodes/character-data-nodes.js lib/evidence-preprocessor.js lib/workflow/nodes/ai-nodes.js lib/workflow/nodes/input-nodes.js lib/__tests__/normalization-skill-isolation.test.js
git commit -m "fix(workflow): isolate normalization calls from project skills

Pure normalization (preprocess, score, extract, parse) doesn't need
narrative skill context. loadProjectSettings: false skips .claude/skills/
autoload, reducing per-call overhead and prompt-context pollution.

Also removes the 60s timeoutMs override on extractCharacterData
(Control 4b): inheriting the Haiku 120s default eliminates spurious
timeouts on 16K-token inputs. The override was based on an outdated
'Haiku handles the volume easily' assumption that the production logs
disprove."
```

---

## Task 6: Preserve rawData in Evidence Preprocessor Output (C3 part A)

**Files:**
- Modify: `lib/evidence-preprocessor.js:336-354` (happy-path merge)
- Modify: `lib/evidence-preprocessor.js:376-395` (fallback merge)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/evidence-content-preservation.test.js`:

```javascript
// IMPORTANT: input shape note. The preprocessor wraps the entire input item as
// `rawData: token` (memory tokens) or `rawData: evidence` (paper evidence) at
// `lib/evidence-preprocessor.js:197-219`. Pass FLAT fields in test input — do
// NOT wrap them in a `rawData` key, or the internal rawData will be
// double-nested and the fullContent extraction at line 328-333 will fail.

const { createEvidencePreprocessor } = require('../evidence-preprocessor');

describe('evidence preprocessor preserves rawData', () => {
  test('happy-path: rawData is carried through to output items (paper evidence)', async () => {
    const fakeSdk = async () => ({
      items: [{
        id: 'p1',
        sourceType: 'paper-evidence',
        disposition: 'exposed',
        summary: 'A short summary',
        characterRefs: [],
        ownerLogline: 'Owner X',
        tags: ['t1']
      }]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: fakeSdk });
    const input = {
      memoryTokens: [],
      paperEvidence: [{
        // Flat fields — preprocessor wraps the whole object as rawData internally.
        notionId: 'p1',
        name: 'Important Document',
        description: 'Full description text we must preserve',
        content: 'Actual full content body',
        owners: ['Owner X'],
        narrativeThreads: ['thread-a']
      }],
      sessionId: 'test'
    };

    const result = await preprocessor.process(input);
    const item = result.items[0];

    // rawData must be carried through and contain the original flat fields
    expect(item.rawData).toBeDefined();
    expect(item.rawData.name).toBe('Important Document');
    expect(item.rawData.content).toBe('Actual full content body');
    expect(item.rawData.narrativeThreads).toEqual(['thread-a']);
  });

  test('fallback path (SDK error): rawData is still preserved', async () => {
    const failingSdk = async () => { throw new Error('SDK timeout'); };

    const preprocessor = createEvidencePreprocessor({ sdkClient: failingSdk });
    const input = {
      memoryTokens: [],
      paperEvidence: [{
        notionId: 'p1',
        name: 'Important Doc',
        description: 'Full description',
        content: 'Content body'
      }],
      sessionId: 'test'
    };

    const result = await preprocessor.process(input);
    const item = result.items[0];

    expect(item.rawData).toBeDefined();
    expect(item.rawData.content).toBe('Content body');
  });

  test('exposed paper item retains fullContent extracted from rawData', async () => {
    const fakeSdk = async () => ({
      items: [{
        id: 'p1', sourceType: 'paper-evidence', disposition: 'exposed',
        summary: 'short', characterRefs: [], tags: []
      }]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: fakeSdk });
    const input = {
      memoryTokens: [],
      paperEvidence: [{
        notionId: 'p1',
        name: 'Doc',
        content: 'Verbatim content for quoting'
      }],
      sessionId: 'test'
    };

    const result = await preprocessor.process(input);
    expect(result.items[0].fullContent).toBe('Verbatim content for quoting');
  });

  // C3 ⊕ buried-data-leak boundary:
  // Buried memory tokens MUST NOT carry their content forward. The existing
  // test at `lib/__tests__/evidence-preprocessor-buried.test.js:51` enforces
  // `fullContent === undefined` for buried; we extend the same rule to rawData.
  test('buried memory tokens do NOT carry rawData with content', async () => {
    const fakeSdk = async () => ({
      items: [{
        id: 'b1',
        sourceType: 'memory-token',
        disposition: 'buried',
        summary: 'A buried token',
        characterRefs: [],
        tags: [],
        ownerLogline: null,
        narrativeTimelineRef: null,
        sfFields: {}
      }]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: fakeSdk });
    const result = await preprocessor.process({
      memoryTokens: [{
        tokenId: 'b1',
        disposition: 'buried',
        fullDescription: 'SECRET buried memory content',
        name: 'Buried Token',
        shellAccount: 'Cayman',
        transactionAmount: 150000
      }],
      paperEvidence: [],
      sessionId: 'test'
    });

    const item = result.items[0];
    expect(item.disposition).toBe('buried');
    expect(item.fullContent).toBeUndefined();              // existing invariant
    expect(item.rawData).toBeUndefined();                  // C3 new invariant
    // Transaction metadata is still preserved at the top level (per merge logic)
    expect(item.shellAccount).toBe('Cayman');
    expect(item.transactionAmount).toBe(150000);
  });

  test('exposed memory tokens DO carry rawData (with fullDescription)', async () => {
    const fakeSdk = async () => ({
      items: [{
        id: 'e1',
        sourceType: 'memory-token',
        disposition: 'exposed',
        summary: 'An exposed token',
        characterRefs: [],
        tags: [],
        ownerLogline: 'Riley',
        narrativeTimelineRef: null,
        sfFields: {}
      }]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: fakeSdk });
    const result = await preprocessor.process({
      memoryTokens: [{
        tokenId: 'e1',
        disposition: 'exposed',
        fullDescription: 'Visible exposed content',
        name: 'Exposed Token'
      }],
      paperEvidence: [],
      sessionId: 'test'
    });

    const item = result.items[0];
    expect(item.disposition).toBe('exposed');
    expect(item.rawData).toBeDefined();
    expect(item.rawData.fullDescription).toBe('Visible exposed content');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/evidence-content-preservation.test.js -v`
Expected: FAIL — `rawData` is undefined on output items.

- [ ] **Step 3: Patch the happy-path merge**

In `lib/evidence-preprocessor.js` lines 336-354, the merge currently spreads `item` and selected fields. Add `rawData` GATED BY DISPOSITION (matching the existing `fullContent` gate). For buried items, rawData would expose `fullDescription` and violate the buried-data-leak invariant — so we strip it the same way fullContent is stripped.

The happy-path return becomes:

```javascript
        return {
          ...item,
          // CRITICAL: Always use ORIGINAL disposition from fetchMemoryTokens
          // Never let Claude override - disposition is authoritative from orchestrator-parsed.json
          disposition: original.disposition || item.disposition || 'buried',
          // C3: preserve rawData for non-buried items so downstream nodes can
          // access content/description/notionId/owners. Buried items must NOT
          // carry rawData because it contains fullDescription (boundary violation).
          ...(original.disposition !== 'buried' ? { rawData: original.rawData } : {}),
          // Preserve full content for EXPOSED items only (defense-in-depth)
          // Buried items must not carry narrative content — only transaction metadata
          ...(original.disposition !== 'buried' ? { fullContent: rawFullContent } : {}),
          ownerLogline: item.ownerLogline || original.ownerLogline,
          narrativeTimelineContext: item.narrativeTimelineContext || original.timelineContext,
          sfFields: item.sfFields || original.sfFields,
          // Preserve transaction metadata for buried tokens
          shellAccount: item.shellAccount || original.rawData?.shellAccount || null,
          transactionAmount: item.transactionAmount || original.rawData?.transactionAmount || null,
          sessionTransactionTime: item.sessionTransactionTime || original.rawData?.sessionTransactionTime || null
        };
```

- [ ] **Step 4: Patch the fallback-path merge**

In the same file, the fallback `fallbackItems` mapping (around lines 376-395) currently returns:

```javascript
      return {
        id: item.id,
        sourceType: item.sourceType,
        originalType: item.originalType,
        disposition: item.disposition || 'buried',
        summary: `${item.sourceType}: ${item.rawData.name || item.rawData.title || 'Unknown'}`.substring(0, 150),
        ...(item.disposition !== 'buried' ? { fullContent: rawFullContent } : {}),
        characterRefs: [],
        ownerLogline: item.ownerLogline,
        narrativeTimelineRef: null,
        narrativeTimelineContext: item.timelineContext,
        shellAccount: item.rawData?.shellAccount || null,
        transactionAmount: item.rawData?.transactionAmount || null,
        sessionTransactionTime: item.rawData?.sessionTransactionTime || null,
        tags: [],
        groupCluster: null,
        sfFields: item.sfFields
      };
```

Add gated rawData. Replace with:

```javascript
      return {
        id: item.id,
        sourceType: item.sourceType,
        originalType: item.originalType,
        disposition: item.disposition || 'buried',
        summary: `${item.sourceType}: ${item.rawData.name || item.rawData.title || 'Unknown'}`.substring(0, 150),
        // C3: same disposition gate as fullContent
        ...(item.disposition !== 'buried' ? { rawData: item.rawData } : {}),
        ...(item.disposition !== 'buried' ? { fullContent: rawFullContent } : {}),
        characterRefs: [],
        ownerLogline: item.ownerLogline,
        narrativeTimelineRef: null,
        narrativeTimelineContext: item.timelineContext,
        shellAccount: item.rawData?.shellAccount || null,
        transactionAmount: item.rawData?.transactionAmount || null,
        sessionTransactionTime: item.rawData?.sessionTransactionTime || null,
        tags: [],
        groupCluster: null,
        sfFields: item.sfFields
      };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/__tests__/evidence-content-preservation.test.js -v`
Expected: PASS (3 tests)

Run: `npx jest lib/__tests__/buried-data-leak.test.js lib/__tests__/evidence-preprocessor-buried.test.js -v`
Expected: PASS — buried-data-leak boundary still enforced (rawData on buried items shouldn't leak to consumers; that's enforced at routeTokensByDisposition, which only emits transaction metadata for buried — verify no regression).

- [ ] **Step 6: Commit**

```bash
git add lib/evidence-preprocessor.js lib/__tests__/evidence-content-preservation.test.js
git commit -m "fix(evidence-preprocessor): preserve rawData through merge

Both happy-path and fallback merges now carry the original rawData
field through to the output. Without this, downstream nodes that
look up content via rawData.content/rawData.description (most notably
scorePaperEvidence and the curated paperEvidence bundle build) get
undefined, causing evidence cards in articles to render with no
quotable content.

The buried-data-leak boundary remains enforced at routeTokensByDisposition
which emits only transaction metadata for buried items."
```

---

## Task 7: Preserve fullContent in scorePaperEvidence Merge (C3 part B)

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:232-242`

- [ ] **Step 1: Extend the test**

Append to `lib/__tests__/evidence-content-preservation.test.js`:

```javascript
const { _testing } = require('../workflow/nodes/ai-nodes');

describe('scorePaperEvidence preserves fullContent through merge', () => {
  // Skip if _testing not exposed
  const fn = _testing?.scorePaperEvidence;
  if (!fn) {
    test.skip('scorePaperEvidence not exposed for testing', () => {});
    return;
  }

  test('merged result carries original.fullContent and original.rawData', async () => {
    const sdk = async () => ({
      items: [
        { id: 'p1', name: 'Doc1', score: 3, include: true, criteriaMatched: ['ROSTER'] }
      ]
    });

    const paperItems = [{
      id: 'p1',
      fullContent: 'Original full content body',
      rawData: { name: 'Doc1', content: 'Original full content body', narrativeThreads: ['t1'] }
    }];

    const merged = await fn(paperItems, {
      roster: ['Alice'],
      suspects: [],
      exposedTokenSummaries: [],
      playerFocus: {}
    }, sdk);

    expect(merged[0].rawData).toBeDefined();
    expect(merged[0].fullContent).toBe('Original full content body');
  });
});
```

- [ ] **Step 2: Verify `_testing.scorePaperEvidence` already exported (no edit needed)**

Run: `grep -n "scorePaperEvidence" lib/workflow/nodes/ai-nodes.js | tail -5`

Expected: shows the function declaration around line 150 AND `scorePaperEvidence,` inside the existing `_testing` block at line 1606. No code change needed; proceed to Step 3.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest lib/__tests__/evidence-content-preservation.test.js -v`
Expected: FAIL — `merged[0].fullContent` is undefined.

- [ ] **Step 4: Patch the merge**

In `lib/workflow/nodes/ai-nodes.js` lines 232-242, the merge currently is:

```javascript
  const mergedResults = flatResults.map(scored => {
    const original = paperItems.find(p => p.id === scored.id);
    if (!original) {
      console.warn(`[scorePaperEvidence] Scored item ID "${scored.id}" not found in original items - rawData may be missing`);
    }
    return {
      ...scored,
      rawData: original?.rawData,
      narrativeThreads: original?.rawData?.narrativeThreads || original?.narrativeThreads
    };
  });
```

Replace with:

```javascript
  const mergedResults = flatResults.map(scored => {
    const original = paperItems.find(p => p.id === scored.id);
    if (!original) {
      console.warn(`[scorePaperEvidence] Scored item ID "${scored.id}" not found in original items - rawData may be missing`);
    }
    return {
      ...scored,
      rawData: original?.rawData,
      // C3: preserve fullContent set by preprocessor for non-buried items.
      // Without this, evidenceBundle.exposed.paperEvidence ends up with empty
      // fullContent and arc evidence cards render with no quotable content.
      fullContent: original?.fullContent,
      narrativeThreads: original?.rawData?.narrativeThreads || original?.narrativeThreads
    };
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/__tests__/evidence-content-preservation.test.js -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/workflow/nodes/ai-nodes.js lib/__tests__/evidence-content-preservation.test.js
git commit -m "fix(curate): preserve fullContent through scorePaperEvidence merge

The merge that combined scored output with original input items dropped
the preprocessor-set fullContent field. As a result, paper-evidence
items in evidenceBundle.exposed.paperEvidence had no quotable content
and arc evidence cards rendered with empty bodies (or were silently
fabricated by the model)."
```

---

## Task 8: Boundary Assertion in buildArcEvidencePackages (C3 enforcement)

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:691-770`

> Note: `buildArcEvidencePackages` is exported via `traceNode(buildArcEvidencePackages, ...)` at line 1581. When `LANGSMITH_TRACING=true`, the export is a `traceable` wrapper. Tests should run with tracing OFF (default — `LANGSMITH_API_KEY` not set in jest test env). If you see LangSmith warnings during the test, verify your `.env.test` has `LANGSMITH_TRACING=false` or the variable is unset.

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/evidence-content-preservation.test.js`:

```javascript
const { buildArcEvidencePackages } = require('../workflow/nodes/ai-nodes');

describe('buildArcEvidencePackages content invariant', () => {
  test('logs error count when items lack fullContent', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const state = {
      selectedArcs: ['arc-1'],
      narrativeArcs: [{
        id: 'arc-1',
        title: 'Test Arc',
        keyEvidence: ['p1', 'p2'],
        characterPlacements: {}
      }],
      evidenceBundle: {
        exposed: {
          tokens: [],
          paperEvidence: [
            { id: 'p1', fullContent: 'Has content here', rawData: { name: 'Doc1' } },
            { id: 'p2', fullContent: '', rawData: { name: 'Doc2' } } // empty!
          ]
        }
      },
      photoAnalyses: { analyses: [] }
    };

    return buildArcEvidencePackages(state, {}).then(() => {
      const errorCalls = errorSpy.mock.calls.flat().join('\n');
      expect(errorCalls).toMatch(/INVARIANT.*fullContent/i);
      errorSpy.mockRestore();
    });
  });

  test('does not error when all items have fullContent', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const state = {
      selectedArcs: ['arc-1'],
      narrativeArcs: [{
        id: 'arc-1',
        title: 'Test Arc',
        keyEvidence: ['p1'],
        characterPlacements: {}
      }],
      evidenceBundle: {
        exposed: {
          tokens: [],
          paperEvidence: [
            { id: 'p1', fullContent: 'Has content', rawData: { name: 'Doc1' } }
          ]
        }
      },
      photoAnalyses: { analyses: [] }
    };

    return buildArcEvidencePackages(state, {}).then(() => {
      const errorCalls = errorSpy.mock.calls.flat().join('\n');
      expect(errorCalls).not.toMatch(/INVARIANT/);
      errorSpy.mockRestore();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/evidence-content-preservation.test.js -v`
Expected: FAIL — first test does not see "INVARIANT" error.

- [ ] **Step 3: Add the invariant log**

In `lib/workflow/nodes/ai-nodes.js`, find the end of `buildArcEvidencePackages` (around line 766 — the `console.log('[buildArcEvidencePackages] Built ...')` line). Just before that line, add:

```javascript
  // C3 invariant: every evidence item routed to an arc package should have
  // fullContent populated. If any are empty, surface loudly so we can trace
  // back to which preserve-merge point failed.
  let emptyContentCount = 0;
  for (const pkg of packages) {
    for (const item of pkg.evidenceItems || []) {
      if (!item.fullContent || item.fullContent.length === 0) {
        emptyContentCount++;
      }
    }
  }
  if (emptyContentCount > 0) {
    console.error(
      `[buildArcEvidencePackages] INVARIANT VIOLATION: ${emptyContentCount} evidence items routed to arcs lack fullContent. ` +
      `Evidence cards will render empty. Check preprocessor and scorePaperEvidence merge for field stripping.`
    );
  }

```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/evidence-content-preservation.test.js -v`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add lib/workflow/nodes/ai-nodes.js lib/__tests__/evidence-content-preservation.test.js
git commit -m "feat(curate): assert fullContent invariant at arc packaging boundary

If any evidence item routed to an arc package has empty fullContent,
log a loud error referencing the likely upstream cause. Prevents the
silent-corruption regressions that motivated Tasks 6 and 7 from
recurring without visibility."
```

---

## Task 9: One Retry on scorePaperEvidence Batch Timeout (C4a)

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:199-225`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/score-paper-evidence-retry.test.js`:

```javascript
const { _testing } = require('../workflow/nodes/ai-nodes');

describe('scorePaperEvidence batch retry on timeout', () => {
  const fn = _testing?.scorePaperEvidence;
  if (!fn) {
    test.skip('scorePaperEvidence not exposed', () => {});
    return;
  }

  test('retries batch once on timeout error and returns success', async () => {
    let callCount = 0;
    const sdk = async (options) => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('SDK timeout after 120.0s (limit: 120s) - Paper evidence batch 1/1');
        throw err;
      }
      return {
        items: [{ id: 'p1', name: 'Doc1', score: 3, include: true, criteriaMatched: ['ROSTER'] }]
      };
    };

    const paperItems = [{
      id: 'p1',
      fullContent: 'content',
      rawData: { name: 'Doc1', content: 'content' }
    }];

    const merged = await fn(paperItems, {
      roster: [],
      suspects: [],
      exposedTokenSummaries: [],
      playerFocus: {}
    }, sdk);

    expect(callCount).toBe(2); // initial + 1 retry
    expect(merged[0].include).toBe(true);
    expect(merged[0].excludeReason).toBeUndefined();
  });

  test('after one retry failure, falls through to fallback (rescuable scoringError)', async () => {
    let callCount = 0;
    const sdk = async () => {
      callCount++;
      throw new Error('SDK timeout after 120.0s');
    };

    const paperItems = [{
      id: 'p1',
      fullContent: 'content',
      rawData: { name: 'Doc1', content: 'content' }
    }];

    const merged = await fn(paperItems, {
      roster: [],
      suspects: [],
      exposedTokenSummaries: [],
      playerFocus: {}
    }, sdk);

    expect(callCount).toBe(2); // initial + 1 retry
    expect(merged[0].include).toBe(false);
    expect(merged[0].excludeReason).toBe('scoringError');
    expect(merged[0].rescuable).toBe(true);
  });

  test('does not retry on non-timeout errors (e.g. schema extraction failure)', async () => {
    let callCount = 0;
    const sdk = async () => {
      callCount++;
      throw new Error('Schema validation failed');
    };

    const paperItems = [{ id: 'p1', fullContent: 'c', rawData: { name: 'D' } }];

    const merged = await fn(paperItems, {
      roster: [], suspects: [], exposedTokenSummaries: [], playerFocus: {}
    }, sdk);

    expect(callCount).toBe(1); // no retry
    expect(merged[0].excludeReason).toBe('scoringError');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/score-paper-evidence-retry.test.js -v`
Expected: FAIL — first test expects callCount=2, currently equals 1; first test expects `include: true`, currently `false` (item went to fallback after first failure).

- [ ] **Step 3: Add retry logic to the batch lambda**

In `lib/workflow/nodes/ai-nodes.js`, find the `processWithConcurrency` block at lines 161-226. The catch at line 211 currently goes straight to fallback. Wrap the SDK call in a small retry helper.

Replace lines 199-225 (the `try/catch` block inside the batch lambda) with:

```javascript
    // C4a: One retry on timeout to recover from transient throttling.
    // Without this, half-batched timeout patterns silently flag up to N items
    // as scoringError on a single SDK hiccup.
    async function attemptBatch() {
      return await sdk({
        prompt,
        systemPrompt: PAPER_SCORING_PROMPT,
        model: 'sonnet',
        timeoutMs: 2 * 60 * 1000,
        jsonSchema: PAPER_SCORING_SCHEMA,
        disableTools: true,
        label: `Paper evidence batch ${batchIdx + 1}/${batches.length}`,
        loadProjectSettings: false
      });
    }

    function isTimeoutError(err) {
      return err && typeof err.message === 'string' && /SDK timeout after/.test(err.message);
    }

    try {
      let response;
      try {
        response = await attemptBatch();
      } catch (firstErr) {
        if (isTimeoutError(firstErr)) {
          console.warn(`[scorePaperEvidence] Batch ${batchIdx + 1} timed out, retrying once`);
          response = await attemptBatch(); // single retry
        } else {
          throw firstErr;
        }
      }
      return response.items || [];
    } catch (error) {
      console.error(`[scorePaperEvidence] Batch ${batchIdx + 1} failed: ${error.message}`);
      // Return items as excluded on error (recoverable at checkpoint)
      return batch.map(p => ({
        id: p.id,
        // Fallback chain for name to prevent undefined
        name: p.name || p.rawData?.name || p.id || 'Unknown Item',
        score: 0,
        include: false,
        criteriaMatched: [],
        excludeReason: 'scoringError',
        excludeNote: `Scoring failed: ${error.message}`,
        rescuable: true
      }));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/score-paper-evidence-retry.test.js -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/workflow/nodes/ai-nodes.js lib/__tests__/score-paper-evidence-retry.test.js
git commit -m "fix(curate): retry paper-evidence scoring batch once on timeout

Half-batched timeouts (3 of 6 batches) had been silently flagging up
to ~24 paper-evidence items per affected run as scoringError, where
'never evaluated' was indistinguishable from 'model rejected' in the
checkpoint UI. One retry on timeout recovers transient throttling
without doubling latency in the happy path."
```

---

## Task 10: Distinguish scoringError in Checkpoint UI (C4c)

**Files:**
- Modify: `console/components/checkpoints/EvidenceBundle.js:248-285` (excluded items header and per-item render)

> Note: `--accent-amber` is already defined in `console/console.css:14` (value `#d4a853`) and used in 50+ places. No CSS changes needed.

- [ ] **Step 1: Read the existing render block**

Run: `grep -n "rescuable\|excludeReason\|scoringError" console/components/checkpoints/EvidenceBundle.js`

Identify the current rescuable/excluded badge render (around line 255-285 per earlier grep).

- [ ] **Step 2: Write a behavioral note**

This is a UI change without easy unit-test coverage (no React testing infrastructure exists in the project). We'll verify by grep-checking that the new branch is present.

- [ ] **Step 3: Implement the badge differentiation**

In `console/components/checkpoints/EvidenceBundle.js`, find the block that renders the excluded items badge (around line 277-280):

```javascript
                  ? React.createElement(Badge, { label: 'rescuable', color: 'var(--accent-green)' })
                  : React.createElement(Badge, { label: 'excluded', color: 'var(--accent-red)' }),
```

Replace with:

```javascript
                  ? (item.excludeReason === 'scoringError'
                      ? React.createElement(Badge, { label: 'never evaluated — recommend rescue', color: 'var(--accent-amber, var(--accent-green))' })
                      : React.createElement(Badge, { label: 'rescuable', color: 'var(--accent-green)' }))
                  : React.createElement(Badge, { label: 'excluded', color: 'var(--accent-red)' }),
```

Also update the section header summary count. Find the line (around 248-251):

```javascript
        React.createElement(Badge, {
          label: excluded.length + ' excluded' + (rescuableCount > 0 ? ', ' + rescuableCount + ' rescuable' : ''),
          color: 'var(--layer-excluded)'
```

Replace with:

```javascript
        React.createElement(Badge, {
          label: (function () {
            const scoringErrorCount = excluded.filter(function (it) { return it.excludeReason === 'scoringError'; }).length;
            const otherRescuableCount = rescuableCount - scoringErrorCount;
            const parts = [excluded.length + ' excluded'];
            if (scoringErrorCount > 0) parts.push(scoringErrorCount + ' never evaluated');
            if (otherRescuableCount > 0) parts.push(otherRescuableCount + ' rescuable');
            return parts.join(', ');
          })(),
          color: 'var(--layer-excluded)'
```

- [ ] **Step 4: Verify CSS variable already exists (no edit needed)**

Run: `grep -n "accent-amber" console/console.css | head -3`

Expected: shows `--accent-amber: #d4a853;` already defined at `:root` around line 14, and dozens of usages elsewhere. Do NOT add a new declaration — that would create a duplicate that overrides the existing color and visually regresses unrelated UI. The badge already references it via `var(--accent-amber, var(--accent-green))` (with green as fallback if the variable somehow goes missing in the future), so no CSS changes needed.

- [ ] **Step 5: Verify by grep**

Run: `grep -n "never evaluated" console/components/checkpoints/EvidenceBundle.js`
Expected: Two matches (header + per-item badge).

- [ ] **Step 6: Commit**

```bash
git add console/components/checkpoints/EvidenceBundle.js
git commit -m "feat(console): distinguish never-evaluated items in evidence checkpoint

Items excluded with excludeReason='scoringError' (the SDK timed out
before scoring) now render with a distinct amber badge labeled
'never evaluated — recommend rescue'. The section header also breaks
out the count so operators don't blanket-approve away unevaluated
evidence."
```

---

## Task 11: State Pruning After Arc Package Build (C5)

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:768-770` (buildArcEvidencePackages return)

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/evidence-content-preservation.test.js`:

```javascript
describe('buildArcEvidencePackages prunes consumed state', () => {
  test('returns null for preprocessedEvidence after arc packages built', async () => {
    const state = {
      selectedArcs: ['arc-1'],
      narrativeArcs: [{
        id: 'arc-1', title: 'T', keyEvidence: [], characterPlacements: {}
      }],
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] } },
      photoAnalyses: { analyses: [] },
      preprocessedEvidence: { items: [{ id: 'x' }] }
    };

    const result = await buildArcEvidencePackages(state, {});
    expect(result.preprocessedEvidence).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/evidence-content-preservation.test.js -v`
Expected: FAIL — `result.preprocessedEvidence` is undefined (not explicitly set to null).

- [ ] **Step 3: Add prune step to return**

In `lib/workflow/nodes/ai-nodes.js` around lines 766-770, the return looks like:

```javascript
  console.log(`[buildArcEvidencePackages] Built ${packages.length} arc evidence packages`);

  return {
    arcEvidencePackages: packages,
```

Find the closing of this return object and add prune fields. The full return becomes:

```javascript
  console.log(`[buildArcEvidencePackages] Built ${packages.length} arc evidence packages`);

  return {
    arcEvidencePackages: packages,
    // C5: prune consumed state to reduce checkpoint size and LangSmith trace pressure.
    // preprocessedEvidence is consumed by curateEvidenceBundle (already pruned there)
    // but we re-prune defensively in case state was rehydrated from an older checkpoint.
    preprocessedEvidence: null,
    currentPhase: PHASES.BUILD_ARC_PACKAGES
  };
```

(Keep `currentPhase` if it was already there; this exact line may differ — match the existing pattern.)

Run: `grep -n "BUILD_ARC_PACKAGES\|currentPhase" lib/workflow/nodes/ai-nodes.js | head -5`

If `currentPhase: PHASES.BUILD_ARC_PACKAGES` is the existing return shape, keep it; just add `preprocessedEvidence: null` alongside.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/evidence-content-preservation.test.js -v`
Expected: PASS

Run: `npm test -- --testPathPattern="ai-nodes|evidence|arc"`
Expected: PASS — no regressions.

- [ ] **Step 5: Commit**

```bash
git add lib/workflow/nodes/ai-nodes.js lib/__tests__/evidence-content-preservation.test.js
git commit -m "perf(state): prune preprocessedEvidence after arc packaging

Reduces LangGraph state size and LangSmith trace payload after the
preprocessing artifacts are consumed. State bloat was hitting the
26MB LangSmith span limit and breaking observability mid-run."
```

---

## Task 12: Full Suite Verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Spot-check critical existing tests are unaffected**

Run: `npx jest lib/__tests__/buried-data-leak.test.js lib/__tests__/evidence-curation-srp.test.js lib/__tests__/character-data-extraction.test.js -v`
Expected: PASS — boundary and SRP invariants intact.

- [ ] **Step 3: Manual smoke (optional, for the operator)**

Restart the dev server (`npm start`), run a session through the pipeline. Look for:
- No "Unknown skill: journalist-image-analyzer" errors
- No "INVARIANT VIOLATION" errors at `buildArcEvidencePackages` (means C3 is working)
- `extractCharacterData` does not time out at 60s
- `[scorePaperEvidence] Batch N timed out, retrying once` appears in logs (when it fires) and items recover
- `generateContentBundle` does not crash on undefined; if it falls into the text-extraction path, that's logged via the new error message rather than the old TypeError

- [ ] **Step 4: Final commit (if any test cleanup needed)**

If test cleanup is needed (e.g., snapshot updates), commit them:

```bash
git add -A
git commit -m "test: cleanup after pipeline integrity controls"
```

---

## Plan Revision History

**Rev 2 (2026-04-27, post-review):**
- Task 2: SDK mock infrastructure extended with `setMockQuery`/`clearMockQuery` because `jest.config.js`'s `moduleNameMapper` overrides per-file `jest.mock()`. Tests now use this hook.
- Task 4: Removed redundant `_testing.analyzeSinglePhoto` add — already exists at `photo-nodes.js:1023`.
- Task 6: Fixed factory name (`createEvidencePreprocessor` not `createPreprocessor`), call signature (`{sdkClient}` not positional), test input shape (flat fields, not nested `rawData` wrapper). Critical: gated `rawData` preservation by disposition to honor the buried-data-leak invariant; added two new tests verifying both branches of the gate.
- Task 7: Removed redundant `_testing.scorePaperEvidence` guard-add — already exists at `ai-nodes.js:1606`.
- Task 8: Added note about `traceNode` wrapping and `LANGSMITH_TRACING` test environment.
- Task 10: Removed CSS variable add — `--accent-amber` already defined at `console.css:14` and used in 50+ places. Adding a duplicate would visually regress unrelated UI.

## Self-Review

**Spec coverage check:**
- [x] C1 (structured output contract) → Tasks 1, 2, 3
- [x] C2 (settingSources isolation) → Tasks 2 (mechanism), 4 (photo), 5 (normalization)
- [x] C3 (canonical evidence shape) → Tasks 6 (preprocessor), 7 (score merge), 8 (boundary assertion)
- [x] C4a (scoring retry) → Task 9
- [x] C4b (extractCharacterData timeout) → Task 5 (folded in)
- [x] C4c (UI distinction) → Task 10
- [x] C5 (state pruning) → Task 11
- [x] Full suite verification → Task 12

**Placeholder scan:** No "TBD", no "implement appropriate error handling", no "similar to Task N". Each step has runnable code or exact commands.

**Type/name consistency:**
- `extractStructuredOutput` (Task 1) — used in `client.js` (Task 2) — same name ✓
- `StructuredOutputExtractionError` (Task 1) — used in `client.js` catch (Task 2) — same name ✓
- `loadProjectSettings` option name — Tasks 2, 4, 5 — same name ✓
- `excludeReason: 'scoringError'` — Task 9 (set), Task 10 (read) — same value ✓
- `extractFullContent` (existing in `node-helpers.js`) — referenced in tasks 6, 7, 8 — unchanged behavior ✓

**Bite-size check:** Each step is one action. No step requires the engineer to make architectural decisions. Test code is complete.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-pipeline-integrity-controls.md`. Two execution options:

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans skill, batch execution with checkpoints.

Which approach?
