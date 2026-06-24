# SDK `format`-keyword Channel-Skip Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-engage the Claude Agent SDK's constrained-decoding (`structured_output`) channel for `generateContentBundle` (and the revision/detective paths that share its schema) by removing the `format:"date-time"` keyword that silently disables it, plus a defensive guardrail so a future `format:` can't regress it again.

**Architecture:** The JSON-Schema keyword `format` silently disables the SDK's constrained-decoding channel (SDK bug #277). With the channel off, the model hand-writes a large strict-JSON document as text and drifts from the schema → ajv rejects → `StructuredOutputExtractionError`. Fix = remove `format` from the two schemas that carry it (both validate server-stamped timestamp fields, so zero validation value), and add a `sanitizeSchemaForSdk()` guardrail in `lib/llm/client.js` that strips **only** `format` from the schema handed to the SDK — and feeds that *same* sanitized object to the post-hoc extractor so the two never disagree.

**Tech Stack:** Node.js, LangGraph, `@anthropic-ai/claude-agent-sdk`, ajv + ajv-formats, Jest.

## Evidence base (already established — do not re-litigate)

- **Single-variable probe:** removing ONLY `format` from the full `content-bundle` schema re-engages the channel (`structured_output` PRESENT). Removing `oneOf`, `minLength`/`maxLength`/`minItems`, or `additionalProperties:{...}` did NOT help — `format` is the SOLE trigger; the others are SAFE and provide real validation value. **Strip only `format`.**
- **Production-faithful verification** on the real failing session 062126 (xhigh effort, `settingSources:['project']`, ~40K output tokens): format-stripped schema → channel ENGAGED (`🔧 StructuredOutput ✓`), complete bundle (sections=6, evidenceCards=8), ajv-valid against the strict original schema. A `compact_boundary` still fired but the engaged channel succeeded anyway (compaction was never the cause). No MCP detour.
- `metadata.generatedAt` is server-overridden at `ai-nodes.js:1218` (`new Date().toISOString()`), so the schema's `format` on it validates nothing. `preprocessed-evidence.preprocessedAt` is server-set at `evidence-preprocessor.js` (3 sites) and never `validate()`d.

## Global Constraints

- **Strip ONLY `format`.** Never strip `oneOf`/`minLength`/`maxLength`/`minItems`/`additionalProperties` — they're proven safe and validate real data.
- **Never mutate a caller's schema object.** Deep-clone before stripping. The fixture-selection mock (`__tests__/mocks/llm-client.mock.js`) and the LLM tracer key on the original `jsonSchema.$id` — the original must stay intact.
- **One sanitized object feeds BOTH the SDK `outputFormat` AND the extractor** — so the channel constraint and post-hoc validation are byte-identical (no false rejection).
- **Avoid the ajv `$id` collision:** the extractor uses a module-level ajv whose `compile()` registers `$id` globally. A clone-per-call guardrail carrying the same `$id` would throw `"schema with key or id 'content-bundle' already exists"` on the 2nd schema-bearing call in a process (generation→revision, or two sessions). Memoize the sanitized clone per original (WeakMap) AND strip `$id`/`$schema` from the clone (lossless — no schema in `lib/schemas` uses `$ref`).
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch: `fix/sdk-format-channel-skip` (already created). Defer the plan-doc commit to the final task so the impl commit stays HEAD through fix-loops.

---

### Task 1: Remove `format` from `content-bundle.generatedAt` (+ invert its one red test)

**Files:**
- Modify: `lib/schemas/content-bundle.schema.json` (the `metadata.generatedAt` block, ~lines 22-26)
- Modify (test): `__tests__/unit/schema-validator.test.js` (the `format`-rejection test, ~lines 158-177)

**Interfaces:** Produces: a `content-bundle` schema with no `format` keyword. No signature changes.

- [ ] **Step 1: Rewrite the failing test first (RED).** In `__tests__/unit/schema-validator.test.js`, find the test (~158-177) that asserts `content-bundle` REJECTS a non-ISO `generatedAt` with a `keyword:'format'` error. Replace it with an assertion that documents the deliberate relaxation:

```js
    it('should ACCEPT ContentBundle with a non-ISO generatedAt (format intentionally not enforced)', () => {
      // generatedAt is server-stamped (ai-nodes.js generateContentBundle:1218), so the schema
      // deliberately carries no `format:"date-time"` — that keyword silently disables the
      // SDK constrained-decoding channel (#277). This test locks in the relaxation.
      const nonIsoDate = {
        metadata: { sessionId: 'test', theme: 'journalist', generatedAt: 'not-a-date' },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [{ id: 's1', type: 'narrative', content: [] }]
      };
      const result = validator.validate('content-bundle', nonIsoDate);
      expect(result.valid).toBe(true);
    });
```
Match the file's existing variable names (`validator`, and its `.validate(...)` return shape — confirm whether it returns `{valid, errors}` or a boolean and adapt the assertion). Keep every other assertion in the file unchanged (`minLength`, `enum`, `additionalProperties`, `minItems`, valid-ISO all still pass — those keywords are retained).

- [ ] **Step 2: Run it to confirm RED.** `npx jest __tests__/unit/schema-validator.test.js -t "non-ISO generatedAt"` — Expected: FAIL (current schema still rejects `'not-a-date'` via the `format` keyword).

- [ ] **Step 3: Remove the `format` line.** In `lib/schemas/content-bundle.schema.json`, delete `          "format": "date-time",` from `metadata.generatedAt` and update its description so a future editor doesn't re-add it:

```json
        "generatedAt": {
          "type": "string",
          "description": "ISO 8601 timestamp of generation (server-stamped; see ai-nodes.js generateContentBundle). NO format:date-time — that keyword disables the SDK constrained-decoding channel (#277)."
        },
```

- [ ] **Step 4: Run to confirm GREEN.** `npx jest __tests__/unit/schema-validator.test.js` — Expected: PASS (whole file).

- [ ] **Step 5: Commit.**
```bash
git add lib/schemas/content-bundle.schema.json __tests__/unit/schema-validator.test.js
git commit -m "$(cat <<'EOF'
fix(schema): drop format:date-time from content-bundle.generatedAt (#277 channel-skip)

The format keyword silently disables the SDK constrained-decoding channel,
forcing generateContentBundle onto the fragile text-fallback path. generatedAt
is server-stamped (ai-nodes.js:1218) so the constraint validated nothing.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Remove `format` from `preprocessed-evidence.preprocessedAt`

**Files:** Modify: `lib/schemas/preprocessed-evidence.schema.json` (the `preprocessedAt` block, ~lines 84-88)

**Interfaces:** Produces: a `preprocessed-evidence` schema with no `format`. No callers change.

- [ ] **Step 1: Confirm no test asserts format here.** `rg -n "preprocessedAt|date-time" __tests__ lib` — verify only `toBeDefined()`-style assertions exist (the test-sweep confirmed this; re-confirm). No new failing test is required — this is latent cleanup; the broad sweep in Task 7 is the guard.

- [ ] **Step 2: Remove the `format` line.** Delete `      "format": "date-time",` from `preprocessedAt`:
```json
    "preprocessedAt": {
      "type": "string",
      "description": "ISO timestamp when preprocessing completed (server-stamped; no format:date-time — disables SDK channel, #277)"
    },
```

- [ ] **Step 3: Run the touching tests.** `npx jest __tests__/unit/evidence-preprocessor.test.js __tests__/unit/workflow/preprocess-nodes.test.js __tests__/unit/schema-validator.test.js` — Expected: all PASS.

- [ ] **Step 4: Commit.**
```bash
git add lib/schemas/preprocessed-evidence.schema.json
git commit -m "$(cat <<'EOF'
chore(schema): drop latent format:date-time from preprocessed-evidence.preprocessedAt

Same #277 channel-skip trigger; preprocessedAt is server-set and never validated.
Forward-defense so a future refactor routing this schema to the SDK doesn't regress.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add `sanitizeSchemaForSdk` guardrail (unit-tested in isolation)

**Files:**
- Modify: `lib/llm/client.js` (add module-scope helper + export)
- Modify (test): `lib/llm/__tests__/client-contract.test.js` (add unit + memoization tests)

**Interfaces:** Produces: `sanitizeSchemaForSdk(schema) -> schema` (exported). Deep-clones, strips `$id`/`$schema` + every `format`, memoized per original object.

- [ ] **Step 1: Write the failing unit tests first (RED).** In `lib/llm/__tests__/client-contract.test.js`, add:
```js
describe('sanitizeSchemaForSdk (#277 channel-skip guardrail)', () => {
  const { sanitizeSchemaForSdk } = require('../client'); // confirm the actual export path/shape

  it('strips ONLY format, recursively, and keeps safe keywords', () => {
    const original = {
      $id: 'x', $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object', additionalProperties: false,
      properties: {
        ts: { type: 'string', format: 'date-time', minLength: 1 },
        nested: { type: 'array', minItems: 1, items: { type: 'string', format: 'email', maxLength: 99 } },
        choice: { oneOf: [{ type: 'string' }, { type: 'number' }] }
      }
    };
    const out = sanitizeSchemaForSdk(original);
    expect(out.properties.ts.format).toBeUndefined();
    expect(out.properties.nested.items.format).toBeUndefined();
    expect(out.properties.ts.minLength).toBe(1);
    expect(out.properties.nested.minItems).toBe(1);
    expect(out.properties.nested.items.maxLength).toBe(99);
    expect(out.properties.choice.oneOf).toHaveLength(2);
    expect(out.additionalProperties).toBe(false);
    expect(out.$id).toBeUndefined();
    expect(out.$schema).toBeUndefined();
    // original never mutated:
    expect(original.properties.ts.format).toBe('date-time');
    expect(original.$id).toBe('x');
  });

  it('memoizes: same original -> same sanitized object (stable identity)', () => {
    const original = { $id: 'memo', type: 'object', properties: { ts: { type: 'string', format: 'date-time' } } };
    expect(sanitizeSchemaForSdk(original)).toBe(sanitizeSchemaForSdk(original));
  });
});
```

- [ ] **Step 2: Run to confirm RED.** `npx jest lib/llm/__tests__/client-contract.test.js -t "sanitizeSchemaForSdk"` — Expected: FAIL (function not exported).

- [ ] **Step 3: Implement the helper.** In `lib/llm/client.js`, insert at module scope (after the `require` block, before `query` usage):
```js
// ─────────────────────────────────────────────────────────────────────────────
// SDK schema sanitizer (anthropics/claude-agent-sdk-typescript#277)
//
// The JSON-Schema keyword `format` silently disables the SDK's constrained-decoding
// (structured_output) channel. With the channel off the model hand-writes strict JSON
// and drifts from the schema -> ajv rejects -> StructuredOutputExtractionError. `format`
// is the SOLE confirmed trigger; oneOf / minLength / maxLength / minItems /
// additionalProperties are PROVEN SAFE and KEPT for their validation value. Strip ONLY
// `format`, recursively.
//
// The sanitized clone is the SINGLE schema handed to BOTH the SDK outputFormat AND the
// post-hoc extractor, so the channel constraint and validation can never disagree.
//
// Memoized per original object so the extractor's object-identity validator cache
// (structured-output-extractor.js) compiles each schema exactly once. A naive clone-per-
// call carrying the same `$id` ('content-bundle') would make the extractor's module-level
// ajv throw "schema with key or id 'content-bundle' already exists" on the 2nd schema-
// bearing call in a process (generation->revision). Belt-and-suspenders: also drop
// `$id`/`$schema` — lossless because NO schema in lib/schemas uses `$ref`.
//
// NOTE: inline-literal callers (e.g. validateContentBundle, ai-nodes.js) pass a fresh
// object each call, so the memo misses and a fresh clone+compile happens per call — no
// worse than today (the raw literal was also compiled per call) and collision-free (no $id).
const _sanitizedSchemaCache = new WeakMap();

function sanitizeSchemaForSdk(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const cached = _sanitizedSchemaCache.get(schema);
  if (cached) return cached;

  const sanitized = JSON.parse(JSON.stringify(schema)); // deep clone — never mutate caller's constant
  delete sanitized.$id;
  delete sanitized.$schema;
  (function stripFormat(node) {
    if (Array.isArray(node)) { for (const item of node) stripFormat(item); return; }
    if (node && typeof node === 'object') {
      delete node.format; // the ONLY keyword we remove
      for (const key of Object.keys(node)) stripFormat(node[key]);
    }
  })(sanitized);

  _sanitizedSchemaCache.set(schema, sanitized);
  return sanitized;
}
```
Add `sanitizeSchemaForSdk` to `module.exports` — match the file's existing export shape (read it first; append to the exported object or `module.exports.sanitizeSchemaForSdk = sanitizeSchemaForSdk;`).

- [ ] **Step 4: Run to confirm GREEN.** `npx jest lib/llm/__tests__/client-contract.test.js -t "sanitizeSchemaForSdk"` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/llm/client.js lib/llm/__tests__/client-contract.test.js
git commit -m "$(cat <<'EOF'
feat(llm): add sanitizeSchemaForSdk to strip the #277 channel-skip format keyword

Deep-clones, strips only `format` (recursively) plus $id/$schema, memoized per
original object so the extractor's module-level ajv compiles each schema once.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire the guardrail into the SDK + extractor consumers

**Files:**
- Modify: `lib/llm/client.js` (the `outputFormat` block ~228-234, the extractor call ~395)
- Modify (test): `lib/llm/__tests__/client-contract.test.js` (add the `outputFormat.schema` format-free integration assertion)

**Interfaces:** Consumes: `sanitizeSchemaForSdk` (Task 3). Produces: `options.outputFormat.schema` and `extractStructuredOutput({schema})` both fed the same sanitized object.

- [ ] **Step 1: Write the failing integration test first (RED).** Using the existing options-capture harness in `client-contract.test.js` (the one that asserts on `settingSources`/`maxBudgetUsd`/`includePartialMessages`), add a case that drives a wrapper call with a `jsonSchema` containing `format` and asserts the captured `options.outputFormat.schema` is format-free:
```js
  it('passes a format-free schema to the SDK outputFormat', async () => {
    // ...invoke the wrapper with jsonSchema:{ $id:'cap', type:'object',
    //    properties:{ ts:{ type:'string', format:'date-time' } } } using this file's
    //    existing query/options-capture mock...
    expect(JSON.stringify(capturedOptions.outputFormat.schema)).not.toContain('"format"');
    expect(capturedOptions.outputFormat.schema.$id).toBeUndefined();
  });
```
Mirror the exact capture mechanism the file already uses (mock `query`, read the `options` arg).

- [ ] **Step 2: Run to confirm RED.** `npx jest lib/llm/__tests__/client-contract.test.js -t "format-free schema"` — Expected: FAIL (client still passes raw `jsonSchema`).

- [ ] **Step 3: Rewire client.js.** Replace the `outputFormat` block (~228-234):
```js
  // Structured output: sanitizeSchemaForSdk strips `format` (#277 channel-skip trigger)
  // and is the SINGLE sanitized object reused for BOTH the SDK channel and the extractor.
  const sdkSchema = jsonSchema ? sanitizeSchemaForSdk(jsonSchema) : null;
  if (sdkSchema) {
    options.outputFormat = { type: 'json_schema', schema: sdkSchema };
  }
```
And change the extractor call (~395) `schema: jsonSchema` → `schema: sdkSchema`. **Leave** the original `jsonSchema` in the three progress payloads (`llm_start` ~249, `llm_error` ~418, `llm_complete` ~426) for truth-in-diagnostics, and leave the `if (jsonSchema)` extraction gate (~386) as-is (`sdkSchema` is non-null iff `jsonSchema` is). Read the surrounding lines and confirm line numbers before editing.

- [ ] **Step 4: Run to confirm GREEN.** `npx jest lib/llm/__tests__/client-contract.test.js` — Expected: PASS (whole file).

- [ ] **Step 5: Commit.**
```bash
git add lib/llm/client.js lib/llm/__tests__/client-contract.test.js
git commit -m "$(cat <<'EOF'
fix(llm): route SDK outputFormat + extractor through one sanitized schema (#277)

Both the SDK constrained-decoding channel and post-hoc ajv validation now receive
the same format-stripped schema object, so they cannot disagree. Re-engages the
structured_output channel for generateContentBundle (journalist + detective, gen + revision).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `$id`-collision regression test (prove the `$id`-strip is load-bearing)

**Files:** Modify (test): `lib/llm/__tests__/structured-output-extractor.test.js`

**Interfaces:** Consumes: `sanitizeSchemaForSdk`, `extractStructuredOutput`, `content-bundle.schema.json`.

- [ ] **Step 1: Add the regression test.** It must (a) prove a `$id`-bearing clone compiled twice in the extractor's ajv throws, and (b) prove the sanitized (`$id`-stripped) schema compiled twice does NOT — so the strip is demonstrably load-bearing, not decorative:
```js
const { sanitizeSchemaForSdk } = require('../client');
const contentBundleSchema = require('../../schemas/content-bundle.schema.json');
// extractStructuredOutput is already imported in this file (confirm; add require if not).

const validBundle = {
  metadata: { sessionId: 's', theme: 'journalist', generatedAt: '2026-06-23T00:00:00.000Z' },
  headline: { main: 'A Sufficiently Long Headline Here' },
  sections: [{ id: 's1', type: 'narrative', content: [] }]
};
const callWith = (schema) => extractStructuredOutput({
  structuredOutput: validBundle, resultText: JSON.stringify(validBundle),
  schema, label: 'collision-probe', model: 'sonnet'
});

it('sanitized ($id-stripped) schema compiles twice without ajv "already exists"', () => {
  const sdkSchema = sanitizeSchemaForSdk(contentBundleSchema); // $id stripped + memoized
  expect(() => { callWith(sdkSchema); callWith(sdkSchema); }).not.toThrow();
  expect(callWith(sdkSchema).value).toMatchObject({ headline: { main: expect.any(String) } });
});

it('proves the $id-strip is load-bearing: two DISTINCT $id-bearing clones collide', () => {
  // Two different objects sharing the same $id, sanitizer bypassed, force the collision the
  // strip prevents. Different objects => extractor validatorCache (WeakMap) misses both =>
  // ajv.compile runs twice => "schema with key or id 'content-bundle' already exists".
  const cloneA = JSON.parse(JSON.stringify(contentBundleSchema)); // keeps $id:'content-bundle'
  const cloneB = JSON.parse(JSON.stringify(contentBundleSchema));
  callWith(cloneA);
  expect(() => callWith(cloneB)).toThrow(/already exists/);
});
```
**Caution:** the second test pollutes the module-level ajv with `$id:'content-bundle'` for the rest of the process. Run it LAST in the file (or register `cloneA` under a unique throwaway `$id` to avoid colliding with the real `content-bundle` other tests rely on). Prefer giving both clones a unique shared `$id` (e.g. set `cloneA.$id = cloneB.$id = 'collision-probe-id'`) so the real schema's registration is untouched. Adjust the regex accordingly.

- [ ] **Step 2: Run.** `npx jest lib/llm/__tests__/structured-output-extractor.test.js` — Expected: PASS (both new tests + existing).

- [ ] **Step 3: Commit.**
```bash
git add lib/llm/__tests__/structured-output-extractor.test.js
git commit -m "$(cat <<'EOF'
test(llm): lock $id-collision safety — sanitized schema compiles twice, strip is load-bearing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Harden `articleId` against a NaN year (defense-in-depth for the relaxation)

**Files:**
- Modify: `lib/template-helpers.js` (`articleId`, ~lines 210-225)
- Modify (test): `__tests__/unit/template-helpers.test.js`

**Rationale:** Removing `format` lets a malformed `generatedAt` pass schema validation. In the pipeline this is unreachable (`generatedAt` is server-overridden), but the standalone `assemble-article.js`/skill path has no override, so a hand-malformed bundle would now reach `new Date('bad').getFullYear()` → `NaN` → article id like `NNA-0306-aN`. One-line guard removes the consequence my change introduces.

**Interfaces:** No signature change; `articleId(metadata)` returns a clean id with `-00` year suffix when the date is unparseable.

- [ ] **Step 1: Write the failing test first (RED).**
```js
    it('falls back to 00 year suffix when generatedAt is unparseable', () => {
      const id = articleId({ sessionId: '0306', theme: 'journalist', generatedAt: 'not-a-date' });
      expect(id).toBe('NNA-0306-00'); // confirm prefix from theme-config (NNA journalist)
    });
```
Match the file's existing `articleId` import/usage and the journalist prefix.

- [ ] **Step 2: Confirm RED.** `npx jest __tests__/unit/template-helpers.test.js -t "unparseable"` — Expected: FAIL (current code yields `NNA-0306-aN`).

- [ ] **Step 3: Add the guard.** In `lib/template-helpers.js` `articleId`, replace the `yearSuffix` computation:
```js
  let yearSuffix = '00';
  if (metadata.generatedAt) {
    const year = new Date(metadata.generatedAt).getFullYear();
    yearSuffix = Number.isNaN(year) ? '00' : String(year).slice(-2);
  }
```
(Preserve the existing `!metadata || !metadata.sessionId` early return above it.)

- [ ] **Step 4: Confirm GREEN.** `npx jest __tests__/unit/template-helpers.test.js` — Expected: PASS (whole file).

- [ ] **Step 5: Commit.**
```bash
git add lib/template-helpers.js __tests__/unit/template-helpers.test.js
git commit -m "$(cat <<'EOF'
fix(template): guard articleId against NaN year from an unparseable generatedAt

Defense-in-depth for the content-bundle format relaxation: in the standalone
assemble-article path (no server override) a malformed generatedAt could otherwise
yield an "-aN" article id.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Full-suite sweep + plan-doc commit

**Files:** Add: this plan doc. Plus any test fallout the broad sweep surfaces.

- [ ] **Step 1: Broad jest sweep (run it yourself — don't trust a partial pass).** `npx jest` across `__tests__/`, `lib/__tests__/`, `lib/llm/__tests__/`. Expected: ALL green. Per the fail-loud-sweep lesson, run the BROAD sweep, never scoped per-file runs, and `rg "format" lib/schemas/` must return ZERO hits.
- [ ] **Step 2: Fix any fallout** on the impl commits (amend the relevant HEAD commit only if it is still HEAD; otherwise a new fixup commit).
- [ ] **Step 3: Commit the plan doc** (deferred to last so it never sat on top of an impl commit during fix-loops).
```bash
git add docs/superpowers/plans/2026-06-23-format-keyword-channel-skip-fix.md
git commit -m "$(cat <<'EOF'
docs(plan): format-keyword channel-skip fix implementation plan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Verification (post-implementation, orchestrator-run)

**A. Suite (gate before live):** `npx jest` fully green; `rg '"format"' lib/schemas/` → 0 hits.

**B. Live end-to-end on session 062126 (decisive render confirmation):**
1. Start server (`npm start`), re-run the pipeline for 062126 through article generation (`node scripts/e2e-walkthrough.js --session 062126 --auto`, or step to the `article` checkpoint).
2. Confirm the `generateContentBundle` `llm_complete` reports the `structured_output` channel (`🔧 StructuredOutput ✓`), NOT `text_fallback`.
3. Confirm the bundle is complete (sections + evidenceCards), passes `validateContentBundle` (no `StructuredOutputExtractionError`), and the article HTML renders via `TemplateAssembler`.
4. **Detective parity:** one detective-theme generation also reports `structured_output`.
5. **Revision + collision:** trigger one revision in the same process; confirm no `"schema with key or id 'content-bundle' already exists"` and it also reports `structured_output`.

## Risk register (carried from preflight; all dispositioned)

| # | Risk | Severity | Disposition |
|---|------|----------|-------------|
| R1 | `schema-validator.test.js` format-rejection test goes red | HIGH (certain) | In-scope Task 1 (inverted) |
| R2 | ajv `$id` double-registration if guardrail clones-per-call | HIGH | In-scope Tasks 3-5 (WeakMap memo + `$id` strip; locked by Task 5) |
| R3 | Mutating the original breaks fixture mock / tracer ($id routing) | MED-HIGH | In-scope (deep-clone; diagnostics keep original) |
| R4 | SDK/extractor schema mismatch | MED | In-scope Task 4 (one `sdkSchema` feeds both) |
| R5 | Detective theme (shares schema) | benefit | In-scope by construction |
| R6 | Revision path uses module schema, no `:1218` override | LOW | Relaxation-only; goes through client.js (gets guardrail + file edit) |
| R7 | preprocessed-evidence consumers | LOW | Server-set, never validated; Task 2 cleanup |
| R8 | `articleId` NaN year on malformed `generatedAt` (standalone path only) | LOW | In-scope Task 6 (the preflight's claim of an existing graceful test was FALSE — no NaN guard existed) |
| R9 | Console article-edit writes bundle without SchemaValidator | LOW (pre-existing, orthogonal) | Deferred — separate follow-up |
| R10/R11 | prompt `<SCHEMA>` size / snapshot tests | NONE | Verified no test measures size; no snapshots |
