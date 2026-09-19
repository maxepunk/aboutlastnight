# Director Steering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before the first fall-run session is generated, give the director four steering tools: a per-call prompt/response log, "reject with my hand edits" at the outline and article gates (with a hand-edit block in the reviser prompt and a post-revision report), standing gate notes that every later writer sees, and a thesis panel.

**Architecture:** No new graph node. The server's `buildResumePayload` writes the director's edited outline/article into state on a reject (the existing `increment*Revision` node then hands it to the reviser as the "previous" version) plus a diff computed by a new pure module; the revisers render that diff into their prompt and verify it afterwards. A new replace-reducer channel `directorGateNotes` is appended server-side and rendered inside the existing `<DIRECTOR_GUIDANCE>` section. The LLM client stamps a `callId` on every progress message so a new observability writer can pair starts with completions on disk. Console changes are React wiring over dual-export pure logic.

**Tech Stack:** Node 24, Express 4, LangGraph 1.0.7 (pinned; do NOT `npm install`), Claude Agent SDK 0.2.119, Jest 30, React 18 via CDN + Babel standalone (no build, no DOM tests), better-sqlite3 checkpointer.

**Spec:** `docs/superpowers/specs/2026-09-19-director-steering-design.md` (read it first; section numbers below refer to it). Adversarial review with rulings: `.superpowers/sdd/2026-09-19-director-steering/spec-review.md` (untracked).

## Global Constraints

- Do not run `npm install`, `npm update`, or `npm ci`. `node_modules` is the verified set.
- No change to any craft rule, any prompt file under `.claude/skills/*/references/prompts/`, any model pin, or any effort level. The ONLY prompt text added is the `<HAND_EDITS>` block (§4.3) and the standing-notes paragraph inside `<DIRECTOR_GUIDANCE>` (§5.3). Task 5's render-diff enforces this.
- No Claude API/SDK calls from tests. Mocks: `__tests__/mocks/llm-client.mock.js`, `__tests__/mocks/checkpoint-helpers.mock.js`, and `@anthropic-ai/claude-agent-sdk`'s `setMockQuery`.
- Run the FULL suite before every commit and guard the exit code: `npx jest --silent 2>&1 | tail -5; test ${PIPESTATUS[0]} -eq 0` (Bash) — a `grep` on the output masks a failure. Baseline at the branch point: 138 suites / 2147 tests green.
- Every state field a node returns must be declared in `lib/workflow/state.js` (LangGraph 1.0.7 silently drops undeclared keys). `getDefaultState()` is hand-written and its key count is pinned at 69 by `__tests__/unit/workflow/state.test.js`; this plan moves it to 74.
- Every rollback point clears every downstream skip field; `lib/__tests__/rollback-clears-completeness.test.js` must stay honest.
- The repo is PUBLIC. `reports/data/` is gitignored by the parent `.gitignore`; never commit anything under it, nor `outputs/report-0919269.html`, nor `outputs/sessionphotos/0919269/`.
- Never read `.env`. Test servers take a throwaway `ACCESS_PASSWORD` and `SESSION_SECRET` through the environment.
- **The production database `data/checkpoints.sqlite` is never opened by a test or a gate.** Task 5's live gate runs against a COPY through `CHECKPOINT_DB_PATH`.
- Console conventions: `const` not `var`, direct destructured imports, `safeStringify` not `JSON.stringify` for display, CSS utility classes over inline styles, `aria-label` on icon buttons, `function () {}` expressions as the surrounding file does.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The push to `origin` is the user's.
- Branch: `feat/director-steering` (exists; the spec is committed on it). Work in the main checkout; do not create worktrees except the read-only `main` worktree Task 5 uses for the render-diff.

---

## File structure

**Create**
- `lib/observability/llm-call-log.js` — the per-call writer (start file, completion rewrite, index line); knows nothing about SSE.
- `lib/hand-edit-diff.js` — pure diff of outline/bundle hand edits, prompt block formatter, post-revision verifier.
- `scripts/render-prompts.js` — renders the four prompts from persisted state with no model calls; `--compare` mode strips the two allowed blocks and asserts byte equality.
- `docs/runbook/decision-log-template.md`, `docs/runbook/first-run-sheet.md`, `docs/runbook/pre-registration-2026-09.md` — the run kit.
- Tests: `lib/__tests__/llm-call-log.test.js`, `lib/observability/__tests__/progress-bridge-call-log.test.js`, `lib/__tests__/hand-edit-diff.test.js`, `__tests__/unit/checkpoint-db-path.test.js`, `__tests__/unit/workflow/revise-hand-edits.test.js`, `__tests__/unit/workflow/checkpoint-hand-edit-clears.test.js`.

**Modify**
- `lib/llm/client.js` — `callId` + `emit` wrapper (six `onProgress(` sites → `emit(`).
- `lib/observability/progress-bridge.js` — `createProgressFromTrace` becomes a wrapper that records to the log before the `SDK_PROGRESS` gate.
- `lib/workflow/state.js` — five channels, `getDefaultState`, `ROLLBACK_CLEARS`, the three "69" comments.
- `lib/api-helpers.js` — hoist + export `PHASES_INVALIDATED_BY`; add + export `pruneGateNotes`.
- `server.js` — `CHECKPOINT_DB_PATH` env override (exported); `buildResumePayload` reject-with-edits + gate notes; rollback handler pruning line; `getCheckpointData` three keys.
- `lib/prompt-builder.js` — `buildDirectorGuidanceSection(directorGuidance, gateNotes)`, `filterGateNotes`, `_buildDirectorGuidance` + the two `options.gateNotes` call sites.
- `lib/workflow/nodes/node-helpers.js` — `buildRevisionContext` `handEdits` option → `<HAND_EDITS>` block.
- `lib/workflow/nodes/ai-nodes.js` — revisers (hand edits in, report out, notes), generators (notes), revision prompt builders (notes).
- `lib/workflow/nodes/checkpoint-nodes.js` — approve branches null the diff and report.
- `console/outline-edit-logic.js` — `initThesis`, `buildThesisPayload`.
- `console/checkpoint-view-logic.js` — `steeringView` (labels, kept count, notes) for `RevisionDiff`.
- `console/components/checkpoints/Outline.js`, `Article.js` — thesis panel/echo, reject-with-edits, cue line, RevisionDiff props.
- `console/components/checkpoints/ArcSelection.js` — RevisionDiff `gateNotes` prop.
- `console/components/RevisionDiff.js` — two new props, widened render condition.
- `console/console.css` — `.outline-thesis`, `.article-thesis-echo`, `.revision-diff__hand-edits`, `.revision-diff__notes`.
- `reports/CLAUDE.md` — payload keys, approval payloads, state channels, log folder, env vars.
- Tests extended: `lib/llm/__tests__/client-contract.test.js`, `__tests__/unit/workflow/state.test.js`, `lib/__tests__/rollback-clears-completeness.test.js`, `lib/__tests__/api-helpers.test.js`, `__tests__/unit/server-build-resume-payload.test.js`, `lib/__tests__/prompt-builder-director-guidance.test.js`, `lib/__tests__/node-helpers-revision-context.test.js`, `__tests__/unit/get-checkpoint-data.test.js`, `__tests__/unit/outline-edit-logic.test.js`, `__tests__/unit/console-editable-pencils.test.js`, `__tests__/unit/checkpoint-view-logic.test.js`.

**Ownership and order** (spec §8): T1, T2 and T4a run in parallel (disjoint files). T3 runs after T2 (it reads T2's module and channels; `server.js` is split by function: T2 owns `buildResumePayload`, the rollback handler's pruning line and the DB-path line; T3 owns `getCheckpointData`). T4b runs after T3 and T4a. T5 last.

---

### Task 1: Instrumentation — `callId` and the per-call LLM log

**Files:**
- Modify: `lib/llm/client.js` (top-of-file requires; `sdkQueryImpl` after `const progressLabel = …` ~line 200; the six `onProgress({` sites at ~339, ~376, ~432, ~545, ~586, ~596)
- Create: `lib/observability/llm-call-log.js`
- Modify: `lib/observability/progress-bridge.js:344-350` (`createProgressFromTrace`)
- Test: `lib/llm/__tests__/client-contract.test.js` (extend), `lib/__tests__/llm-call-log.test.js` (new), `lib/observability/__tests__/progress-bridge-call-log.test.js` (new)

**Interfaces:**
- Produces: every `onProgress` message from `sdkQueryImpl` carries `callId: string` (UUID v4), constant within a call.
- Produces: `lib/observability/llm-call-log.js` exports `{ recordLlmEvent(sessionId, context, msg), setLogRoot(dir), resolveLogDir(sessionId), isEnabled(), _resetForTests() }`. Nothing else in the plan consumes it; Task 5 reads the files it writes.
- Consumes: nothing from other tasks.

#### 1.1 `callId` on every progress message

- [ ] **Step 1: Write the failing test.** Append to `lib/llm/__tests__/client-contract.test.js`:

```js
describe('sdkQueryImpl callId (spec 2026-09-19 §3.1)', () => {
  afterEach(() => clearMockQuery());

  async function capture() {
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'system', subtype: 'init', model: 'claude-haiku-4-5', tools: [] },
      { type: 'result', subtype: 'success', result: 'ok' }
    ]));
    await sdkQueryImpl({ prompt: 'x', model: 'haiku', onProgress: (e) => events.push(e) });
    return events;
  }

  test('every progress message of one call carries the same non-empty callId', async () => {
    const events = await capture();
    const types = events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['llm_start', 'system', 'llm_complete']));
    const ids = new Set(events.map((e) => e.callId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('two calls get different callIds', async () => {
    const first = (await capture())[0].callId;
    const second = (await capture())[0].callId;
    expect(first).not.toBe(second);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.** `npx jest lib/llm/__tests__/client-contract.test.js -t callId` → FAIL: `ids.size` is 1 but the id is `undefined`, so the regex assertion fails.

- [ ] **Step 3: Implement.** In `lib/llm/client.js`:
  1. Near the other requires at the top of the file add `const crypto = require('crypto');` (grep first: it is not required today).
  2. In `sdkQueryImpl`, directly after `const progressLabel = label || prompt.slice(0, 25).replace(/\n/g, ' ');` add:

```js
  // Spec 2026-09-19 §3.1: one id per call on EVERY progress message, so the per-call
  // log can pair a start with its completion when eight concurrent calls share one
  // context string. `emit` is the only way this function talks to onProgress.
  const callId = crypto.randomUUID();
  const emit = (m) => { if (onProgress) onProgress({ callId, ...m }); };
```

  3. At each of the six emission sites replace the token `onProgress({` with `emit({`. The surrounding `if (onProgress) {` guards may stay. Verify with `grep -n "onProgress({" lib/llm/client.js` → no matches; `grep -c "emit({" lib/llm/client.js` → 6.

- [ ] **Step 4: Run the test file and the progress-forward tests.** `npx jest lib/llm/__tests__/` → PASS (the forward tests assert fields, never whole objects).

- [ ] **Step 5: Commit.**

```bash
git add lib/llm/client.js lib/llm/__tests__/client-contract.test.js
git commit -m "feat(llm): stamp a callId on every progress message of a call

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 1.2 The writer module

- [ ] **Step 1: Write the failing tests.** Create `lib/__tests__/llm-call-log.test.js`:

```js
/**
 * lib/observability/llm-call-log.js — per-call prompt/response log (spec 2026-09-19 §3).
 * Writes under <root>/<sessionId>/llm-log; the root is injected here so nothing lands in data/.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../observability/llm-call-log');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-llm-log-'));
  log._resetForTests();
  log.setLogRoot(root);
});
afterEach(() => {
  log._resetForTests();
  jest.restoreAllMocks();
});

const start = (callId, extra = {}) => ({
  type: 'llm_start', callId, model: 'haiku', label: 'Photo 1',
  prompt: 'USER', systemPrompt: 'SYS', jsonSchema: { type: 'object' }, ...extra
});
const complete = (callId) => ({
  type: 'llm_complete', callId, elapsed: 1.5, result: { ok: true }, jsonSchema: { type: 'object' },
  channel: 'structured_output', stopReason: 'end_turn', durationApiMs: 1200, numTurns: 1,
  usage: { input_tokens: 5, output_tokens: 10 }
});
const dirOf = (s) => path.join(root, s, 'llm-log');
const jsonFiles = (s) => fs.readdirSync(dirOf(s)).filter((f) => f.endsWith('.json')).sort();
const readJson = (s, f) => JSON.parse(fs.readFileSync(path.join(dirOf(s), f), 'utf8'));

test('llm_start writes the prompt file immediately, named by time, context and callId', () => {
  log.recordLlmEvent('S1', 'analyzePhotos', start('11111111-2222-4333-8444-555555555555'));
  const files = jsonFiles('S1');
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^\d{8}-\d{6}-analyzePhotos-11111111\.json$/);
  const rec = readJson('S1', files[0]);
  expect(rec).toMatchObject({
    callId: '11111111-2222-4333-8444-555555555555', context: 'analyzePhotos', label: 'Photo 1', model: 'haiku',
    prompt: { system: 'SYS', user: 'USER', schema: { type: 'object' } }
  });
  expect(rec.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(rec.response).toBeUndefined();
  expect(fs.existsSync(path.join(dirOf('S1'), 'index.jsonl'))).toBe(false);
});

test('llm_complete rewrites the same file with the response and appends one index line', () => {
  log.recordLlmEvent('S1', 'analyzePhotos', start('aaaaaaaa-2222-4333-8444-555555555555'));
  log.recordLlmEvent('S1', 'analyzePhotos', complete('aaaaaaaa-2222-4333-8444-555555555555'));
  const files = jsonFiles('S1');
  expect(files).toHaveLength(1);
  const rec = readJson('S1', files[0]);
  expect(rec.prompt.user).toBe('USER');
  expect(rec.response).toEqual({ full: { ok: true }, length: JSON.stringify({ ok: true }).length, structured: true });
  expect(rec.diagnostics).toMatchObject({ channel: 'structured_output', stopReason: 'end_turn', durationApiMs: 1200, usage: { output_tokens: 10 } });
  expect(rec.outcome).toBe('complete');
  expect(rec.elapsed).toBe(1.5);
  const index = fs.readFileSync(path.join(dirOf('S1'), 'index.jsonl'), 'utf8').trim().split('\n');
  expect(index).toHaveLength(1);
  expect(JSON.parse(index[0])).toMatchObject({ callId: 'aaaaaaaa-2222-4333-8444-555555555555', context: 'analyzePhotos', model: 'haiku', elapsed: 1.5, channel: 'structured_output', file: files[0], outcome: 'complete' });
});

test('llm_error rewrites the file with the error and indexes it as an error', () => {
  log.recordLlmEvent('S1', 'enrich', start('bbbbbbbb-2222-4333-8444-555555555555'));
  log.recordLlmEvent('S1', 'enrich', { type: 'llm_error', callId: 'bbbbbbbb-2222-4333-8444-555555555555', elapsed: 9, error: 'boom', errorName: 'StructuredOutputExtractionError', schemaErrors: [{ path: '/x' }], stopReason: 'end_turn' });
  const rec = readJson('S1', jsonFiles('S1')[0]);
  expect(rec.error).toEqual({ message: 'boom', errorName: 'StructuredOutputExtractionError', schemaErrors: [{ path: '/x' }] });
  expect(rec.outcome).toBe('error');
  expect(rec.response).toBeUndefined();
});

test('two concurrent calls with the same context stay separate by callId', () => {
  log.recordLlmEvent('S1', 'analyzePhotos', start('cccccccc-2222-4333-8444-555555555555', { label: 'Photo 1' }));
  log.recordLlmEvent('S1', 'analyzePhotos', start('dddddddd-2222-4333-8444-555555555555', { label: 'Photo 2' }));
  log.recordLlmEvent('S1', 'analyzePhotos', complete('dddddddd-2222-4333-8444-555555555555'));
  log.recordLlmEvent('S1', 'analyzePhotos', complete('cccccccc-2222-4333-8444-555555555555'));
  const files = jsonFiles('S1');
  expect(files).toHaveLength(2);
  const labels = files.map((f) => readJson('S1', f).label).sort();
  expect(labels).toEqual(['Photo 1', 'Photo 2']);
  files.forEach((f) => expect(readJson('S1', f).outcome).toBe('complete'));
});

test('a completion with no recorded start still writes a file', () => {
  log.recordLlmEvent('S1', 'curate', complete('eeeeeeee-2222-4333-8444-555555555555'));
  const files = jsonFiles('S1');
  expect(files).toHaveLength(1);
  const rec = readJson('S1', files[0]);
  expect(rec.startedAt).toBeNull();
  expect(rec.prompt).toBeNull();
  expect(rec.response.full).toEqual({ ok: true });
});

test('the context is sanitised in the filename', () => {
  log.recordLlmEvent('S1', 'curate/evidence:2', start('ffffffff-2222-4333-8444-555555555555'));
  expect(jsonFiles('S1')[0]).toMatch(/-curate_evidence_2-ffffffff\.json$/);
});

test('a write failure is swallowed and warned exactly once', () => {
  jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { const e = new Error('EPERM'); e.code = 'EPERM'; throw e; });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(() => {
    log.recordLlmEvent('S1', 'x', start('a1a1a1a1-2222-4333-8444-555555555555'));
    log.recordLlmEvent('S1', 'x', start('b1b1b1b1-2222-4333-8444-555555555555'));
  }).not.toThrow();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toMatch(/llm-call-log/);
  expect(warn.mock.calls[0][0]).toMatch(/EPERM/);
});

test('ignores events without a sessionId or of other types', () => {
  log.recordLlmEvent(null, 'x', start('a2a2a2a2-2222-4333-8444-555555555555'));
  log.recordLlmEvent('S2', 'x', { type: 'llm_delta', callId: 'q', deltaText: 'hi' });
  log.recordLlmEvent('S2', 'x', { type: 'assistant', callId: 'q' });
  expect(fs.existsSync(path.join(root, 'S2'))).toBe(false);
});

test('is disabled under Jest unless a test opts in with setLogRoot', () => {
  log._resetForTests();                 // JEST_WORKER_ID is set, nothing opted in
  expect(log.isEnabled()).toBe(false);
  log.setLogRoot(root);
  expect(log.isEnabled()).toBe(true);
});

test('resolveLogDir is <root>/<sessionId>/llm-log', () => {
  expect(log.resolveLogDir('091926')).toBe(path.join(root, '091926', 'llm-log'));
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest lib/__tests__/llm-call-log.test.js` → FAIL: `Cannot find module '../observability/llm-call-log'`.

- [ ] **Step 3: Implement.** Create `lib/observability/llm-call-log.js`:

```js
/**
 * lib/observability/llm-call-log.js — per-call prompt/response log (spec 2026-09-19 §3).
 *
 * One JSON file per model call under <root>/<sessionId>/llm-log/, written on
 * llm_start (so a crash mid-call still leaves the prompt) and rewritten on
 * llm_complete / llm_error with the response, diagnostics and timings, plus one
 * line per completion in index.jsonl. Keyed by the client's `callId`.
 *
 * Never throws into the pipeline: every fs call is wrapped, the first failure per
 * process warns once, later failures are silent.
 *
 * Disabled under Jest (JEST_WORKER_ID) unless a test calls setLogRoot(), so the
 * bridge's own tests never write into data/. LLM_CALL_LOG_DIR overrides the root.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..', '..', 'data');
const LOGGED_TYPES = new Set(['llm_start', 'llm_complete', 'llm_error']);

let logRoot = process.env.LLM_CALL_LOG_DIR || null;
let explicitlyEnabled = false;
let warned = false;
const inFlight = new Map(); // callId -> { file, record }

function setLogRoot(dir) {
  logRoot = dir;
  explicitlyEnabled = true;
  inFlight.clear();
  warned = false;
}

function _resetForTests() {
  logRoot = process.env.LLM_CALL_LOG_DIR || null;
  explicitlyEnabled = false;
  warned = false;
  inFlight.clear();
}

function isEnabled() {
  if (process.env.JEST_WORKER_ID && !explicitlyEnabled) return false;
  return true;
}

function resolveLogDir(sessionId) {
  return path.join(logRoot || DEFAULT_ROOT, String(sessionId), 'llm-log');
}

function sanitize(s) {
  return String(s || 'call').replace(/[^A-Za-z0-9_-]/g, '_');
}

/** UTC YYYYMMDD-HHMMSS from an ISO timestamp (or now). */
function stamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

function shortId(callId) {
  return String(callId).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'nocallid';
}

function warnOnce(err, where) {
  if (warned) return;
  warned = true;
  console.warn(`[llm-call-log] disabled after a write failure at ${where}: ${err && (err.code || err.message)}`);
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function diagnosticsOf(msg) {
  return {
    channel: msg.channel ?? null,
    stopReason: msg.stopReason ?? null,
    durationApiMs: msg.durationApiMs ?? null,
    numTurns: msg.numTurns ?? null,
    usage: msg.usage ?? null,
    apiErrorStatus: msg.apiErrorStatus ?? null,
    terminalReason: msg.terminalReason ?? null,
    structuredOutputPresent: msg.structuredOutputPresent ?? null,
    resultTextLength: msg.resultTextLength ?? null
  };
}

function recordLlmEvent(sessionId, context, msg) {
  if (!sessionId || !msg || !LOGGED_TYPES.has(msg.type) || !isEnabled()) return;
  const callId = msg.callId || `nocall-${Date.now()}`;
  const dir = resolveLogDir(sessionId);
  try {
    if (msg.type === 'llm_start') {
      const startedAt = new Date().toISOString();
      const file = path.join(dir, `${stamp(startedAt)}-${sanitize(context)}-${shortId(callId)}.json`);
      const record = {
        callId, context, label: msg.label || null, model: msg.model || null, startedAt,
        prompt: { system: msg.systemPrompt || '', user: msg.prompt || '', schema: msg.jsonSchema || null }
      };
      inFlight.set(callId, { file, record });
      writeJson(file, record);
      return;
    }

    const entry = inFlight.get(callId) || {
      file: path.join(dir, `${stamp()}-${sanitize(context)}-${shortId(callId)}.json`),
      record: { callId, context, label: msg.label || null, model: msg.model || null, startedAt: null, prompt: null }
    };
    const completedAt = new Date().toISOString();
    const diagnostics = diagnosticsOf(msg);
    const record = {
      ...entry.record,
      completedAt,
      elapsed: msg.elapsed ?? null,
      diagnostics,
      outcome: msg.type === 'llm_complete' ? 'complete' : 'error'
    };
    if (msg.type === 'llm_complete') {
      const full = msg.result === undefined ? null : msg.result;
      const text = full === null ? '' : (typeof full === 'string' ? full : JSON.stringify(full));
      record.response = { full, length: text.length, structured: !!msg.jsonSchema };
    } else {
      record.error = { message: msg.error || null, errorName: msg.errorName || null, schemaErrors: msg.schemaErrors || null };
    }
    writeJson(entry.file, record);
    fs.appendFileSync(path.join(dir, 'index.jsonl'), JSON.stringify({
      ts: completedAt, callId, context, model: record.model, elapsed: record.elapsed,
      channel: diagnostics.channel, usage: diagnostics.usage, file: path.basename(entry.file), outcome: record.outcome
    }) + '\n');
    inFlight.delete(callId);
  } catch (err) {
    warnOnce(err, dir);
  }
}

module.exports = { recordLlmEvent, setLogRoot, resolveLogDir, isEnabled, _resetForTests };
```

- [ ] **Step 4: Run.** `npx jest lib/__tests__/llm-call-log.test.js` → PASS (10 tests).

- [ ] **Step 5: Commit.**

```bash
git add lib/observability/llm-call-log.js lib/__tests__/llm-call-log.test.js
git commit -m "feat(observability): per-call LLM prompt/response log on disk

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 1.3 Hook the writer into the bridge, ahead of the `SDK_PROGRESS` gate

- [ ] **Step 1: Write the failing test.** Create `lib/observability/__tests__/progress-bridge-call-log.test.js`:

```js
/**
 * createProgressFromTrace records to the per-call log BEFORE the SDK_PROGRESS gate
 * (spec §3.2 [M4]): that flag silences the console/SSE stream, never the record.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../llm-call-log');
const { createProgressFromTrace } = require('../progress-bridge');

let root;
let originalSdkProgress;
beforeEach(() => {
  originalSdkProgress = process.env.SDK_PROGRESS;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-bridge-log-'));
  log._resetForTests();
  log.setLogRoot(root);
});
afterEach(() => {
  if (originalSdkProgress === undefined) delete process.env.SDK_PROGRESS;
  else process.env.SDK_PROGRESS = originalSdkProgress;
  log._resetForTests();
});

test('records llm_start and llm_complete even when SDK_PROGRESS=false', () => {
  process.env.SDK_PROGRESS = 'false';
  const logger = createProgressFromTrace('generateOutline', 'S9');
  logger({ type: 'llm_start', callId: 'c1c1c1c1-2222-4333-8444-555555555555', model: 'opus', label: 'Outline', prompt: 'P', systemPrompt: 'S' });
  logger({ type: 'llm_complete', callId: 'c1c1c1c1-2222-4333-8444-555555555555', elapsed: 2, result: { a: 1 } });
  const dir = path.join(root, 'S9', 'llm-log');
  expect(fs.readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  expect(fs.existsSync(path.join(dir, 'index.jsonl'))).toBe(true);
});

test('writes nothing for a console-only logger (no sessionId)', () => {
  process.env.SDK_PROGRESS = 'true';
  const logger = createProgressFromTrace('generateOutline');
  logger({ type: 'llm_start', callId: 'c2c2c2c2-2222-4333-8444-555555555555', model: 'opus', prompt: 'P' });
  expect(fs.readdirSync(root)).toEqual([]);
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest lib/observability/__tests__/progress-bridge-call-log.test.js` → FAIL on the first test (`ENOENT` reading the dir: the no-op logger wrote nothing).

- [ ] **Step 3: Implement.** In `lib/observability/progress-bridge.js`:
  1. Add near the other requires: `const { recordLlmEvent } = require('./llm-call-log');`
  2. Rename the existing `function createProgressFromTrace(context, sessionId = null) { if (!isProgressEnabled()) { return () => {}; } return (msg) => { … }; }` to `function createConsoleAndSseLogger(context, sessionId) { return (msg) => { … }; }` — delete its `isProgressEnabled` early return, keep the body byte-for-byte otherwise.
  3. Add the new wrapper above it:

```js
/**
 * Progress callback for one SDK call: records to the per-call log (spec 2026-09-19
 * §3.2) and, when SDK_PROGRESS is not 'false', forwards to the console + SSE logger.
 * The log is deliberately ahead of the gate: that flag silences the stream, not the
 * record.
 */
function createProgressFromTrace(context, sessionId = null) {
  const consoleAndSse = isProgressEnabled() ? createConsoleAndSseLogger(context, sessionId) : null;
  return (msg) => {
    recordLlmEvent(sessionId, context, msg);
    if (consoleAndSse) consoleAndSse(msg);
  };
}
```

  Keep `module.exports` unchanged (`createProgressFromTrace` is still exported).

- [ ] **Step 4: Run the observability tests.** `npx jest lib/observability` → PASS, including `progress-bridge-llm-delta.test.js` (it sets `SDK_PROGRESS=true` and, under Jest without `setLogRoot`, the writer is a no-op, so `data/test-delta-session/` is never created — check with `ls data | grep test-delta` → nothing).

- [ ] **Step 5: Full suite, then commit.**

```bash
npx jest --silent 2>&1 | tail -5; test ${PIPESTATUS[0]} -eq 0 && git add lib/observability/progress-bridge.js lib/observability/__tests__/progress-bridge-call-log.test.js && git commit -m "feat(observability): record every model call to the per-call log ahead of the SDK_PROGRESS gate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Hand-edit diff, state channels, rollback pruning, resume payload, DB path

**Files:**
- Create: `lib/hand-edit-diff.js`
- Modify: `lib/workflow/state.js` (annotations after `_outlineGuidance` ~line 735; `getDefaultState` ~754-850; `ROLLBACK_CLEARS` lists 1020-1208; the three comments that say 69)
- Modify: `lib/api-helpers.js` (hoist `PHASES_INVALIDATED_BY` out of `buildEvaluationInvalidationStubs` ~89-96; add `pruneGateNotes`; exports ~208)
- Modify: `server.js` (`CHECKPOINT_DB_PATH` line 44 + export; requires ~line 32; `buildResumePayload` arc reject ~416-420, outline reject ~436-441, article reject ~462-467; rollback handler after the `_previousPhotosPath` stash ~1315)
- Test: `lib/__tests__/hand-edit-diff.test.js` (new), `__tests__/unit/workflow/state.test.js:442-446`, `lib/__tests__/rollback-clears-completeness.test.js` (extend), `lib/__tests__/api-helpers.test.js` (extend), `__tests__/unit/server-build-resume-payload.test.js` (extend), `__tests__/unit/checkpoint-db-path.test.js` (new)

**Interfaces:**
- Produces (`lib/hand-edit-diff.js`): `diffOutline(before, after) → {kind:'outline', sections:[{key, changes:[{path, before, after}]}]}`; `diffBundle(before, after) → {kind:'bundle', scopes:[{key, changes:[…]}]}`; `isEmpty(diff)`; `scopeKeys(diff) → string[]`; `formatHandEditsBlock(diff) → string`; `changedScopes(diff, revised) → string[]`; `readAtPath(obj, path)`. Paths: `lede.hook`, `headline.main`, `sections[#<id>].heading`, `sections[#<id>].content[<i>]`, `sections[#<id>].content[-]` (removed), `evidenceCards[#<tokenId>]`, `pullQuotes[<i>]`, `photos[<i>]`, `heroImage`, `financialTracker.<field>`. Task 3 consumes all of these.
- Produces (state channels, all replace-reducer, default `null` unless stated): `_outlineHandEdits`, `_articleHandEdits`, `_outlineHandEditReport`, `_articleHandEditReport`, `directorGateNotes` (default `[]`). Gate-note entry shape: `{ gate:'arc-selection'|'outline'|'article', kind:'rejection', round:number, text:string, at:string }`.
- Produces (`lib/api-helpers.js`): `PHASES_INVALIDATED_BY` (exported object with keys `photos`, `character-ids`, `outline`, `article`), `pruneGateNotes(notes, rollbackTo) → entry[]`.
- Produces (`server.js`): `resolveCheckpointDbPath(env, baseDir)`, `CHECKPOINT_DB_PATH` and `PORT` exported (`PORT` honours `process.env.PORT`, default 3001); `buildResumePayload` accepts `outlineEdits`/`articleEdits` on a reject and writes `outline`/`contentBundle`, `_outlineHandEdits`/`_articleHandEdits` (diff or `null`), `_outlineHandEditReport`/`_articleHandEditReport` (`null`), and appends to `directorGateNotes` on the three rejections.
- Consumes: nothing from other tasks.

#### 2.1 The diff module

- [ ] **Step 1: Write the failing tests.** Create `lib/__tests__/hand-edit-diff.test.js`:

```js
/**
 * lib/hand-edit-diff.js — the director's hand edits as a diff the reviser can read
 * and code can verify (spec 2026-09-19 §4.2).
 */
const D = require('../hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));

const outlineBefore = () => ({
  lede: { hook: 'Old hook', keyTension: 'T', primaryArc: 'A', selectedEvidence: ['e1'] },
  closing: { finalQuestion: 'Q' }
});

const bundleBefore = () => ({
  metadata: { generatedAt: '1' },
  headline: { main: 'Old', kicker: 'K', deck: 'D' },
  byline: { name: 'Nova' },
  sections: [{
    id: 'intro', type: 'narrative', heading: 'H',
    content: [
      { type: 'paragraph', text: 'First paragraph about the vote.' },
      { type: 'paragraph', text: 'Second paragraph about the money.' }
    ]
  }],
  evidenceCards: [{ tokenId: 'alr001', headline: 'Card', content: 'C' }],
  pullQuotes: [{ text: 'Q1' }],
  photos: [],
  heroImage: 'a.jpg'
});

describe('diffOutline', () => {
  test('one changed field → one section with one change at a dotted path', () => {
    const after = outlineBefore(); after.lede.hook = 'New hook';
    expect(D.diffOutline(outlineBefore(), after)).toEqual({
      kind: 'outline',
      sections: [{ key: 'lede', changes: [{ path: 'lede.hook', before: 'Old hook', after: 'New hook' }] }]
    });
  });

  test('a nested array change is ONE change at the field path', () => {
    const after = outlineBefore(); after.lede.selectedEvidence = ['e1', 'e2'];
    const { sections } = D.diffOutline(outlineBefore(), after);
    expect(sections).toHaveLength(1);
    expect(sections[0].changes).toEqual([{ path: 'lede.selectedEvidence', before: ['e1'], after: ['e1', 'e2'] }]);
  });

  test('trailing whitespace is not a change', () => {
    const after = outlineBefore(); after.lede.hook = 'Old hook  ';
    expect(D.isEmpty(D.diffOutline(outlineBefore(), after))).toBe(true);
  });

  test('a section that is not an object on one side is one whole-section change', () => {
    const after = outlineBefore(); delete after.closing;
    const { sections } = D.diffOutline(outlineBefore(), after);
    expect(sections).toEqual([{ key: 'closing', changes: [{ path: 'closing', before: { finalQuestion: 'Q' }, after: undefined }] }]);
  });

  test('detective sections diff by their own keys', () => {
    const b = { executiveSummary: { summary: 'a' }, evidenceLocker: { groups: [] } };
    const a = { executiveSummary: { summary: 'b' }, evidenceLocker: { groups: [] } };
    expect(D.scopeKeys(D.diffOutline(b, a))).toEqual(['executiveSummary']);
  });

  test('identical → empty; malformed → empty, never throws', () => {
    expect(D.isEmpty(D.diffOutline(outlineBefore(), outlineBefore()))).toBe(true);
    expect(D.diffOutline(null, {})).toEqual({ kind: 'outline', sections: [] });
    expect(D.diffOutline('x', 3)).toEqual({ kind: 'outline', sections: [] });
    expect(D.diffOutline(undefined, undefined)).toEqual({ kind: 'outline', sections: [] });
  });
});

describe('diffBundle', () => {
  test('headline field change is scoped to headline', () => {
    const after = bundleBefore(); after.headline.main = 'New';
    expect(D.diffBundle(bundleBefore(), after).scopes).toEqual([
      { key: 'headline', changes: [{ path: 'headline.main', before: 'Old', after: 'New' }] }
    ]);
  });

  test('metadata, voice_self_check and _revisionHistory are ignored', () => {
    const after = bundleBefore(); after.metadata.generatedAt = '2'; after._revisionHistory = [{ x: 1 }]; after.voice_self_check = 'ok';
    expect(D.isEmpty(D.diffBundle(bundleBefore(), after))).toBe(true);
  });

  test('a section is matched by id; an edited paragraph is one change at its after-index', () => {
    const after = bundleBefore(); after.sections[0].content[1].text = 'Second paragraph, rewritten.';
    const { scopes } = D.diffBundle(bundleBefore(), after);
    expect(scopes).toHaveLength(1);
    expect(scopes[0].key).toBe('section:intro');
    expect(scopes[0].changes).toEqual([{
      path: 'sections[#intro].content[1]',
      before: { type: 'paragraph', text: 'Second paragraph about the money.' },
      after: { type: 'paragraph', text: 'Second paragraph, rewritten.' }
    }]);
  });

  test('an inserted paragraph does not flood: later blocks still match by type + text prefix', () => {
    const after = bundleBefore(); after.sections[0].content.splice(1, 0, { type: 'paragraph', text: 'Inserted.' });
    const { scopes } = D.diffBundle(bundleBefore(), after);
    expect(scopes[0].changes).toEqual([{ path: 'sections[#intro].content[1]', before: null, after: { type: 'paragraph', text: 'Inserted.' } }]);
  });

  test('a removed block is one removed change', () => {
    const after = bundleBefore(); after.sections[0].content.pop();
    const { scopes } = D.diffBundle(bundleBefore(), after);
    expect(scopes[0].changes).toEqual([{ path: 'sections[#intro].content[-]', before: { type: 'paragraph', text: 'Second paragraph about the money.' }, after: null }]);
  });

  test('a section heading change and a removed section', () => {
    const a1 = bundleBefore(); a1.sections[0].heading = 'New H';
    expect(D.diffBundle(bundleBefore(), a1).scopes[0].changes).toEqual([{ path: 'sections[#intro].heading', before: 'H', after: 'New H' }]);
    const a2 = bundleBefore(); a2.sections = [];
    expect(D.diffBundle(bundleBefore(), a2).scopes).toEqual([{ key: 'section:intro', changes: [{ path: 'sections[#intro]', before: bundleBefore().sections[0], after: null }] }]);
  });

  test('evidence cards match by tokenId; pull quotes and photos by index', () => {
    const after = bundleBefore();
    after.evidenceCards[0].content = 'C2';
    after.evidenceCards.push({ tokenId: 'alr002', headline: 'New card', content: 'N' });
    after.pullQuotes[0].text = 'Q1 edited';
    after.photos.push({ filename: 'p.jpg', caption: 'cap' });
    const { scopes } = D.diffBundle(bundleBefore(), after);
    const byKey = Object.fromEntries(scopes.map((s) => [s.key, s.changes]));
    expect(byKey.evidenceCards).toEqual([
      { path: 'evidenceCards[#alr001]', before: { tokenId: 'alr001', headline: 'Card', content: 'C' }, after: { tokenId: 'alr001', headline: 'Card', content: 'C2' } },
      { path: 'evidenceCards[#alr002]', before: null, after: { tokenId: 'alr002', headline: 'New card', content: 'N' } }
    ]);
    expect(byKey.pullQuotes).toEqual([{ path: 'pullQuotes[0]', before: { text: 'Q1' }, after: { text: 'Q1 edited' } }]);
    expect(byKey.photos).toEqual([{ path: 'photos[0]', before: null, after: { filename: 'p.jpg', caption: 'cap' } }]);
  });

  test('heroImage and financialTracker', () => {
    const after = bundleBefore(); after.heroImage = 'b.jpg'; after.financialTracker = { title: 'Money' };
    const keys = D.scopeKeys(D.diffBundle(bundleBefore(), after)).sort();
    expect(keys).toEqual(['financialTracker', 'heroImage']);
  });

  test('malformed → empty, never throws', () => {
    expect(D.diffBundle(null, bundleBefore())).toEqual({ kind: 'bundle', scopes: [] });
    expect(D.diffBundle({ sections: 'nope' }, { sections: 5 })).toEqual({ kind: 'bundle', scopes: [] });
  });
});

describe('formatHandEditsBlock', () => {
  test('empty diff → empty string', () => {
    expect(D.formatHandEditsBlock(D.diffOutline({}, {}))).toBe('');
    expect(D.formatHandEditsBlock(null)).toBe('');
  });

  test('one line per change; before trimmed to 300, after to 1,500', () => {
    const long = 'x'.repeat(2000);
    const diff = D.diffOutline({ lede: { hook: long } }, { lede: { hook: long + 'y' } });
    const block = D.formatHandEditsBlock(diff);
    expect(block).toBe(`- lede.hook: was "${'x'.repeat(300)}…" -> now "${'x'.repeat(1500)}…"`);
  });

  test('added and removed values are labelled', () => {
    const diff = D.diffBundle(bundleBefore(), (() => { const a = bundleBefore(); a.sections[0].content.pop(); a.pullQuotes.push({ text: 'Q2' }); return a; })());
    const block = D.formatHandEditsBlock(diff);
    expect(block).toContain('- sections[#intro].content[-]: removed "');
    expect(block).toContain('- pullQuotes[1]: added "');
  });

  test('the whole block is capped at 12,000 characters with a trailing count', () => {
    const before = {}; const after = {};
    for (let i = 0; i < 200; i++) { before[`s${i}`] = { f: 'a'.repeat(200) }; after[`s${i}`] = { f: 'b'.repeat(200) }; }
    const block = D.formatHandEditsBlock(D.diffOutline(before, after));
    expect(block.length).toBeLessThanOrEqual(12000 + 60);
    expect(block).toMatch(/\(… \d+ more changes not shown\)$/);
  });
});

describe('changedScopes', () => {
  const edited = (() => { const a = outlineBefore(); a.lede.hook = 'New hook'; a.closing.finalQuestion = 'Q2'; return a; })();
  const diff = D.diffOutline(outlineBefore(), edited);

  test('kept edits → nothing changed', () => {
    expect(D.changedScopes(diff, clone(edited))).toEqual([]);
  });

  test('a reverted edit names its scope', () => {
    const reverted = clone(edited); reverted.lede.hook = 'Old hook';
    expect(D.changedScopes(diff, reverted)).toEqual(['lede']);
  });

  test('partially kept: only the reverted scope is named', () => {
    const partly = clone(edited); partly.closing.finalQuestion = 'Something else';
    expect(D.changedScopes(diff, partly)).toEqual(['closing']);
  });

  test('works on a later pass: compares against the diff, not against a previous output', () => {
    const revisedTwice = clone(edited); revisedTwice.lede.keyTension = 'the reviser changed an unedited field';
    expect(D.changedScopes(diff, revisedTwice)).toEqual([]);
  });

  test('removals are not checked; an added block that survives is not a change', () => {
    const a = bundleBefore(); a.sections[0].content.pop(); a.pullQuotes.push({ text: 'Q2' });
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    expect(D.changedScopes(bundleDiff, clone(a))).toEqual([]);
    const lostTheQuote = clone(a); lostTheQuote.pullQuotes.pop();
    expect(D.changedScopes(bundleDiff, lostTheQuote)).toEqual(['pullQuotes']);
  });

  test('a section edit is found by id even when the reviser reordered sections', () => {
    const a = bundleBefore(); a.sections[0].heading = 'New H';
    const bundleDiff = D.diffBundle(bundleBefore(), a);
    const reordered = clone(a); reordered.sections.unshift({ id: 'other', type: 'narrative', heading: 'X', content: [] });
    expect(D.changedScopes(bundleDiff, reordered)).toEqual([]);
  });

  test('readAtPath resolves ids, indexes and missing segments', () => {
    const b = bundleBefore();
    expect(D.readAtPath(b, 'sections[#intro].content[1].text')).toBe('Second paragraph about the money.');
    expect(D.readAtPath(b, 'evidenceCards[#alr001].content')).toBe('C');
    expect(D.readAtPath(b, 'pullQuotes[0].text')).toBe('Q1');
    expect(D.readAtPath(b, 'sections[#nope].heading')).toBeUndefined();
    expect(D.readAtPath(b, 'sections[#intro].content[-]')).toBeUndefined();
    expect(D.readAtPath(null, 'x')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest lib/__tests__/hand-edit-diff.test.js` → FAIL: `Cannot find module '../hand-edit-diff'`.

- [ ] **Step 3: Implement.** Create `lib/hand-edit-diff.js`:

```js
/**
 * lib/hand-edit-diff.js — PURE diff of a director's hand edits (spec 2026-09-19 §4.2).
 *
 * No dependencies. Never throws: any non-object input yields an empty diff.
 *
 * Paths are dotted from the root of the object, with collection selectors in
 * brackets: `lede.hook`, `headline.main`, `sections[#intro].heading`,
 * `sections[#intro].content[2]`, `evidenceCards[#alr001]`, `pullQuotes[1]`.
 * `#` selects by id (sections.id, evidenceCards.tokenId); a bare number is an index;
 * `[-]` marks a removed item (not resolvable). readAtPath resolves the same grammar,
 * so changedScopes can check a REVISED object at exactly the places the director
 * changed — on any reviser pass, against the diff's own `after` values.
 */
'use strict';

const IGNORED_BUNDLE_KEYS = new Set(['metadata', 'voice_self_check', '_revisionHistory']);
const BUNDLE_OBJECT_SCOPES = ['headline', 'byline', 'financialTracker'];
const BUNDLE_SCALAR_SCOPES = ['heroImage'];
const BUNDLE_INDEX_COLLECTIONS = ['pullQuotes', 'photos'];
const BEFORE_MAX = 300;
const AFTER_MAX = 1500;
const BLOCK_MAX = 12000;

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) return Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {});
  return v;
}

function canon(v) { return v === undefined ? 'undefined' : JSON.stringify(sortKeys(v)); }

function same(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
  return canon(a) === canon(b);
}

function asText(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  return canon(v);
}

function trunc(s, max) { return s.length > max ? s.slice(0, max) + '…' : s; }

function unionKeys(a, b) { return Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})])); }

function diffFields(before, after, prefix) {
  return unionKeys(before, after)
    .filter((k) => !same(before[k], after[k]))
    .map((k) => ({ path: `${prefix}.${k}`, before: before[k], after: after[k] }));
}

// ─── outline ──────────────────────────────────────────────────────────────────

function diffOutline(before, after) {
  if (!isObj(before) || !isObj(after)) return { kind: 'outline', sections: [] };
  const sections = [];
  for (const key of unionKeys(before, after)) {
    const b = before[key];
    const a = after[key];
    if (same(a, b)) continue;
    const changes = (isObj(a) && isObj(b)) ? diffFields(b, a, key) : [{ path: key, before: b, after: a }];
    if (changes.length > 0) sections.push({ key, changes });
  }
  return { kind: 'outline', sections };
}

// ─── bundle ───────────────────────────────────────────────────────────────────

function blockText(b) {
  if (!isObj(b)) return '';
  if (typeof b.text === 'string') return b.text;
  if (Array.isArray(b.items)) return b.items.map(String).join(' ');
  if (typeof b.caption === 'string') return b.caption;
  if (typeof b.headline === 'string') return b.headline;
  return '';
}

function blockKey(b) {
  const type = isObj(b) && typeof b.type === 'string' ? b.type : '';
  return type + '|' + blockText(b).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** Pair blocks by type + first 40 normalised characters, then by index for what is left. */
function matchBlocks(beforeArr, afterArr) {
  const b = Array.isArray(beforeArr) ? beforeArr : [];
  const a = Array.isArray(afterArr) ? afterArr : [];
  const usedB = new Set();
  const usedA = new Set();
  const pairs = [];
  a.forEach((blk, ai) => {
    const key = blockKey(blk);
    const bi = b.findIndex((cand, i) => !usedB.has(i) && blockKey(cand) === key);
    if (bi !== -1) { usedB.add(bi); usedA.add(ai); pairs.push({ bi, ai }); }
  });
  a.forEach((blk, ai) => {
    if (usedA.has(ai)) return;
    if (ai < b.length && !usedB.has(ai)) { usedB.add(ai); usedA.add(ai); pairs.push({ bi: ai, ai }); }
  });
  const removed = b.map((_, i) => i).filter((i) => !usedB.has(i));
  const added = a.map((_, i) => i).filter((i) => !usedA.has(i));
  return { pairs, removed, added };
}

function diffSection(id, before, after) {
  const prefix = `sections[#${id}]`;
  const changes = [];
  ['type', 'heading'].forEach((f) => {
    if (!same(before[f], after[f])) changes.push({ path: `${prefix}.${f}`, before: before[f], after: after[f] });
  });
  const bc = Array.isArray(before.content) ? before.content : [];
  const ac = Array.isArray(after.content) ? after.content : [];
  const { pairs, removed, added } = matchBlocks(bc, ac);
  pairs.forEach(({ bi, ai }) => {
    if (!same(bc[bi], ac[ai])) changes.push({ path: `${prefix}.content[${ai}]`, before: bc[bi], after: ac[ai] });
  });
  removed.forEach((bi) => changes.push({ path: `${prefix}.content[-]`, before: bc[bi], after: null }));
  added.forEach((ai) => changes.push({ path: `${prefix}.content[${ai}]`, before: null, after: ac[ai] }));
  return changes;
}

function idOf(item, idField, i) {
  return (isObj(item) && item[idField] != null) ? String(item[idField]) : `index-${i}`;
}

function diffById(name, idField, before, after) {
  const b = Array.isArray(before) ? before : [];
  const a = Array.isArray(after) ? after : [];
  const bMap = new Map(b.map((x, i) => [idOf(x, idField, i), x]));
  const aMap = new Map(a.map((x, i) => [idOf(x, idField, i), x]));
  const changes = [];
  for (const id of new Set([...bMap.keys(), ...aMap.keys()])) {
    const bv = bMap.get(id);
    const av = aMap.get(id);
    if (!same(bv, av)) changes.push({ path: `${name}[#${id}]`, before: bv === undefined ? null : bv, after: av === undefined ? null : av });
  }
  return changes;
}

function diffByIndex(name, before, after) {
  const b = Array.isArray(before) ? before : [];
  const a = Array.isArray(after) ? after : [];
  const changes = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (!same(b[i], a[i])) changes.push({ path: `${name}[${i}]`, before: b[i] === undefined ? null : b[i], after: a[i] === undefined ? null : a[i] });
  }
  return changes;
}

function diffBundle(before, after) {
  if (!isObj(before) || !isObj(after)) return { kind: 'bundle', scopes: [] };
  const scopes = [];
  const push = (key, changes) => { if (changes.length > 0) scopes.push({ key, changes }); };

  BUNDLE_OBJECT_SCOPES.forEach((k) => {
    if (IGNORED_BUNDLE_KEYS.has(k) || same(before[k], after[k])) return;
    push(k, (isObj(before[k]) && isObj(after[k])) ? diffFields(before[k], after[k], k) : [{ path: k, before: before[k], after: after[k] }]);
  });
  BUNDLE_SCALAR_SCOPES.forEach((k) => {
    if (!same(before[k], after[k])) push(k, [{ path: k, before: before[k], after: after[k] }]);
  });

  const bSecs = Array.isArray(before.sections) ? before.sections : [];
  const aSecs = Array.isArray(after.sections) ? after.sections : [];
  const bById = new Map(bSecs.map((s, i) => [idOf(s, 'id', i), s]));
  const aById = new Map(aSecs.map((s, i) => [idOf(s, 'id', i), s]));
  for (const id of new Set([...bById.keys(), ...aById.keys()])) {
    const bs = bById.get(id);
    const as = aById.get(id);
    if (same(bs, as)) continue;
    if (!isObj(bs) || !isObj(as)) {
      push(`section:${id}`, [{ path: `sections[#${id}]`, before: bs === undefined ? null : bs, after: as === undefined ? null : as }]);
    } else {
      push(`section:${id}`, diffSection(id, bs, as));
    }
  }

  push('evidenceCards', diffById('evidenceCards', 'tokenId', before.evidenceCards, after.evidenceCards));
  BUNDLE_INDEX_COLLECTIONS.forEach((k) => push(k, diffByIndex(k, before[k], after[k])));
  return { kind: 'bundle', scopes };
}

// ─── shared ───────────────────────────────────────────────────────────────────

function groups(diff) {
  if (!isObj(diff)) return [];
  if (diff.kind === 'outline') return Array.isArray(diff.sections) ? diff.sections : [];
  if (diff.kind === 'bundle') return Array.isArray(diff.scopes) ? diff.scopes : [];
  return [];
}

function isEmpty(diff) {
  return groups(diff).every((g) => !g || !Array.isArray(g.changes) || g.changes.length === 0);
}

function scopeKeys(diff) {
  return groups(diff).filter((g) => g && Array.isArray(g.changes) && g.changes.length > 0).map((g) => g.key);
}

function formatHandEditsBlock(diff) {
  if (isEmpty(diff)) return '';
  const lines = [];
  groups(diff).forEach((g) => (g.changes || []).forEach((c) => {
    const gone = (v) => v === null || v === undefined;
    if (gone(c.before)) lines.push(`- ${c.path}: added "${trunc(asText(c.after), AFTER_MAX)}"`);
    else if (gone(c.after)) lines.push(`- ${c.path}: removed "${trunc(asText(c.before), BEFORE_MAX)}"`);
    else lines.push(`- ${c.path}: was "${trunc(asText(c.before), BEFORE_MAX)}" -> now "${trunc(asText(c.after), AFTER_MAX)}"`);
  }));
  let out = '';
  let shown = 0;
  for (const line of lines) {
    if (out.length + line.length + 1 > BLOCK_MAX) break;
    out += (out ? '\n' : '') + line;
    shown++;
  }
  if (shown < lines.length) out += `\n(… ${lines.length - shown} more changes not shown)`;
  return out;
}

/** Resolve a change path against an object; undefined when any segment is missing. */
function readAtPath(obj, pathStr) {
  if (!isObj(obj) || typeof pathStr !== 'string' || !pathStr) return undefined;
  let cur = obj;
  for (const seg of pathStr.split('.')) {
    const m = /^([^\[]+)(?:\[(.+)\])?$/.exec(seg);
    if (!m) return undefined;
    cur = isObj(cur) ? cur[m[1]] : undefined;
    if (m[2] !== undefined) {
      if (!Array.isArray(cur)) return undefined;
      const sel = m[2];
      if (sel === '-') return undefined;
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        const idField = m[1] === 'evidenceCards' ? 'tokenId' : 'id';
        cur = cur.find((x, i) => idOf(x, idField, i) === id);
      } else {
        cur = cur[Number(sel)];
      }
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** Scope keys whose `after` value no longer matches `revised` at that path. Removals are not checked. */
function changedScopes(diff, revised) {
  const out = [];
  groups(diff).forEach((g) => {
    const changed = (g.changes || []).some((c) => {
      if (c.after === null || c.after === undefined) return false;
      return !same(readAtPath(revised, c.path), c.after);
    });
    if (changed) out.push(g.key);
  });
  return out;
}

module.exports = {
  diffOutline, diffBundle, isEmpty, scopeKeys, formatHandEditsBlock, changedScopes, readAtPath,
  _testing: { matchBlocks, blockKey, canon, same }
};
```

- [ ] **Step 4: Run.** `npx jest lib/__tests__/hand-edit-diff.test.js` → PASS (all tests). If the "inserted paragraph" test fails on the second block's index, check `matchBlocks`: the first pass must match by key BEFORE any index fallback.

- [ ] **Step 5: Commit.**

```bash
git add lib/hand-edit-diff.js lib/__tests__/hand-edit-diff.test.js
git commit -m "feat(lib): pure diff, prompt block and verifier for the director's hand edits

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 2.2 State channels, default state, rollback lists

- [ ] **Step 1: Write the failing tests.**

  (a) In `__tests__/unit/workflow/state.test.js` change the pin at line ~445 from `toBe(69)` to `toBe(74)` and add, in the same `describe`:

```js
    it('declares the steering channels (spec 2026-09-19 §4.5, §5.1)', () => {
      const channels = Object.keys(ReportStateAnnotation.spec);
      ['_outlineHandEdits', '_articleHandEdits', '_outlineHandEditReport', '_articleHandEditReport', 'directorGateNotes']
        .forEach((c) => expect(channels).toContain(c));
      const d = getDefaultState();
      expect(d._outlineHandEdits).toBeNull();
      expect(d._articleHandEdits).toBeNull();
      expect(d._outlineHandEditReport).toBeNull();
      expect(d._articleHandEditReport).toBeNull();
      expect(d.directorGateNotes).toEqual([]);
    });

    it('directorGateNotes is a REPLACE channel (a prune must be able to write survivors)', () => {
      // In LangGraph 1.0.7 an Annotation({reducer}) channel is a BinaryOperatorAggregate
      // whose `.operator` IS the reducer function (verified: Object.keys(spec.photosPath)).
      const operator = ReportStateAnnotation.spec.directorGateNotes.operator;
      const prev = [{ gate: 'arc-selection', text: 'a' }, { gate: 'outline', text: 'b' }];
      const next = [{ gate: 'arc-selection', text: 'a' }];
      expect(operator(prev, next)).toEqual(next);            // replace, not append
      expect(operator(prev, [])).toEqual([]);
      // Contrast with the append channel the old design would have used:
      expect(ReportStateAnnotation.spec.evaluationHistory.operator([{ a: 1 }], [{ b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
    });
```

  (b) Append to `lib/__tests__/rollback-clears-completeness.test.js`:

```js
  describe('steering channels (spec 2026-09-19 §4.5, §5.4)', () => {
    const points = Object.keys(ROLLBACK_CLEARS);

    test.each(points)('%s clears the hand-edit diff and report exactly where it clears the feedback slot', (point) => {
      const list = ROLLBACK_CLEARS[point];
      expect(list.includes('_outlineHandEdits')).toBe(list.includes('_outlineFeedback'));
      expect(list.includes('_outlineHandEditReport')).toBe(list.includes('_outlineFeedback'));
      expect(list.includes('_articleHandEdits')).toBe(list.includes('_articleFeedback'));
      expect(list.includes('_articleHandEditReport')).toBe(list.includes('_articleFeedback'));
    });

    test('directorGateNotes clears at arc-selection and every point upstream of it', () => {
      ['input-review', 'paper-evidence-selection', 'await-roster', 'await-full-context',
       'pre-curation', 'evidence-and-photos', 'arc-selection']
        .forEach((p) => expect(ROLLBACK_CLEARS[p]).toContain('directorGateNotes'));
    });

    test('directorGateNotes is NOT list-cleared by the four downstream points (they prune instead)', () => {
      ['photos', 'character-ids', 'outline', 'article']
        .forEach((p) => expect(ROLLBACK_CLEARS[p]).not.toContain('directorGateNotes'));
    });
  });
```

- [ ] **Step 2: Run to confirm failure.** `npx jest __tests__/unit/workflow/state.test.js lib/__tests__/rollback-clears-completeness.test.js` → FAIL (count is 69; channels missing; completeness "every state field is either cleared or exempt" will also fail once channels exist but lists do not — that is the next step).

- [ ] **Step 3: Implement** in `lib/workflow/state.js`:

  (a) After the `_outlineGuidance` annotation (ends ~line 735) add:

```js
  /**
   * The director's hand edits sent WITH a rejection (spec 2026-09-19 §4).
   *
   * Written by buildResumePayload on every outline reject: the diff between the
   * model's outline and the director's edited one (lib/hand-edit-diff.js), or null.
   * Read by reviseOutline on EVERY pass of the round (an evaluator-driven second pass
   * must still see it — C3), so the reviser does NOT clear it; checkpointOutline
   * clears it on approve and the server overwrites it on the next reject.
   */
  _outlineHandEdits: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),
  _articleHandEdits: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * What the rework did to those edits: { checked: scopeKeys, changed: scopeKeys }.
   * Rewritten by every reviser pass; surfaced at the gate as `handEditReport`;
   * cleared on approve and reset to null on every reject.
   */
  _outlineHandEditReport: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),
  _articleHandEditReport: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Every rejection note the director wrote at a gate, in order (spec §5).
   * Entries: { gate, kind:'rejection', round, text, at }. REPLACE reducer on purpose:
   * the server appends by writing the full array (it holds current state and the
   * session lock), and a rollback into the outline/article region writes the
   * SURVIVORS after pruning — something an append channel cannot express (C1).
   * Points at or above arc-selection clear it through ROLLBACK_CLEARS (null); every
   * reader uses `|| []`. Not `directorNotes`, which holds the session observations.
   */
  directorGateNotes: Annotation({
    reducer: replaceReducer,
    default: () => []
  }),
```

  (b) In `getDefaultState()` add, next to `_outlineFeedback: null,` (~line 848):

```js
    _outlineHandEdits: null,
    _articleHandEdits: null,
    _outlineHandEditReport: null,
    _articleHandEditReport: null,
    directorGateNotes: [],
```

  (c) Update the three comments that carry the count: `grep -n "69" lib/workflow/state.js` → the file header, the `getDefaultState` JSDoc (`69 fields; …`), and the self-test comment. Change each to 74 and append `+4 hand-edit steering, +1 director gate notes` to the running tally in the JSDoc.

  (d) `ROLLBACK_CLEARS`: in every list that contains `'_outlineFeedback'` (10 lists: all but `article`) add `'_outlineHandEdits', '_outlineHandEditReport'` right after it on the same line. In every list that contains `'_articleFeedback'` (all 11) add `'_articleHandEdits', '_articleHandEditReport'` right after it. In the seven lists `input-review`, `paper-evidence-selection`, `await-roster`, `await-full-context`, `pre-curation`, `evidence-and-photos`, `arc-selection` add a line `'directorGateNotes',` after the `'_outlineGuidance',` line, with the comment on the first occurrence:

```js
    // Spec 2026-09-19 §5.4: the director's gate notes describe outlines/articles that
    // this point regenerates from scratch, and arc notes describe arcs it re-picks.
    // The four downstream points (photos, character-ids, outline, article) PRUNE
    // instead — see pruneGateNotes in lib/api-helpers.js.
    'directorGateNotes',
```

- [ ] **Step 4: Run.** `npx jest __tests__/unit/workflow/state.test.js lib/__tests__/rollback-clears-completeness.test.js lib/__tests__/prompt-builder-director-guidance.test.js` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/workflow/state.js __tests__/unit/workflow/state.test.js lib/__tests__/rollback-clears-completeness.test.js
git commit -m "feat(state): hand-edit diff/report channels and directorGateNotes, cleared with their gates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 2.3 `PHASES_INVALIDATED_BY` hoisted and `pruneGateNotes`

- [ ] **Step 1: Write the failing tests.** Append to `lib/__tests__/api-helpers.test.js` (add `pruneGateNotes, PHASES_INVALIDATED_BY` to the destructured require at the top):

```js
describe('pruneGateNotes (spec 2026-09-19 §5.4)', () => {
  const notes = [
    { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'a', at: 't1' },
    { gate: 'outline', kind: 'rejection', round: 1, text: 'o', at: 't2' },
    { gate: 'outline', kind: 'rejection', round: 2, text: 'o2', at: 't3' },
    { gate: 'article', kind: 'rejection', round: 1, text: 'r', at: 't4' }
  ];

  test('PHASES_INVALIDATED_BY is exported with exactly the four regenerating points', () => {
    expect(Object.keys(PHASES_INVALIDATED_BY).sort()).toEqual(['article', 'character-ids', 'outline', 'photos']);
    expect(PHASES_INVALIDATED_BY.outline).toEqual(['outline', 'article']);
    expect(PHASES_INVALIDATED_BY.article).toEqual(['article']);
  });

  test('article keeps the arc and outline notes', () => {
    expect(pruneGateNotes(notes, 'article').map((n) => n.text)).toEqual(['a', 'o', 'o2']);
  });

  test.each(['outline', 'photos', 'character-ids'])('%s keeps only the arc-selection notes', (point) => {
    expect(pruneGateNotes(notes, point).map((n) => n.text)).toEqual(['a']);
  });

  test('a point outside the table returns every note unchanged (the caller clears via ROLLBACK_CLEARS)', () => {
    expect(pruneGateNotes(notes, 'arc-selection')).toEqual(notes);
    expect(pruneGateNotes(notes, 'input-review')).toEqual(notes);
  });

  test('returns a new array and tolerates null/garbage', () => {
    expect(pruneGateNotes(notes, 'article')).not.toBe(notes);
    expect(pruneGateNotes(null, 'outline')).toEqual([]);
    expect(pruneGateNotes([null, 'x', { gate: 'arc-selection', text: 'k' }], 'outline')).toEqual([{ gate: 'arc-selection', text: 'k' }]);
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest lib/__tests__/api-helpers.test.js -t pruneGateNotes` → FAIL (`pruneGateNotes is not a function`).

- [ ] **Step 3: Implement** in `lib/api-helpers.js`:
  1. Cut the `const PHASES_INVALIDATED_BY = { … }` block out of `buildEvaluationInvalidationStubs` and paste it at module scope above that function (keep its comment). The function body keeps using it unchanged.
  2. Add below `buildEvaluationInvalidationStubs`:

```js
/**
 * The director's gate notes that survive a rollback to `rollbackTo` (spec 2026-09-19 §5.4).
 *
 * A rollback into the outline/article region regenerates content the later notes
 * described, so those notes are dropped; the arc-selection notes always survive.
 * Points OUTSIDE PHASES_INVALIDATED_BY are not pruned here — they clear the whole
 * channel through ROLLBACK_CLEARS — so this returns every note unchanged for them,
 * and the rollback handler must check membership before writing (a write of "all
 * notes" would undo the list's clear).
 *
 * @param {Array|null} notes - state.directorGateNotes
 * @param {string} rollbackTo
 * @returns {Array} survivors (a new array)
 */
function pruneGateNotes(notes, rollbackTo) {
  const list = (Array.isArray(notes) ? notes : []).filter((n) => n && typeof n === 'object');
  const invalidated = new Set(PHASES_INVALIDATED_BY[rollbackTo] || []);
  if (invalidated.size === 0) return list.slice();
  return list.filter((n) => !invalidated.has(n.gate));
}
```

  3. Export both: `module.exports = { buildRollbackState, buildFreshStartState, createGraphAndConfig, sendErrorResponse, confineToBase, pruneGateNotes, PHASES_INVALIDATED_BY };`

- [ ] **Step 4: Run.** `npx jest lib/__tests__/api-helpers.test.js lib/__tests__/rollback-invalidates-evaluation.test.js` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/api-helpers.js lib/__tests__/api-helpers.test.js
git commit -m "feat(api-helpers): export PHASES_INVALIDATED_BY and add pruneGateNotes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 2.4 `buildResumePayload`: reject with hand edits, and gate notes

- [ ] **Step 1: Write the failing tests.** Append to `__tests__/unit/server-build-resume-payload.test.js` (the file already defines `validJournalistOutline()`; the article fixture is `__tests__/fixtures/content-bundles/valid-journalist.json`):

```js
describe('reject WITH hand edits (spec 2026-09-19 §4.1)', () => {
  const bundleFixture = () => JSON.parse(JSON.stringify(require('../fixtures/content-bundles/valid-journalist.json')));

  test('outline: valid edits are written as the current outline with a diff and a null report', () => {
    const before = validJournalistOutline();
    const edits = validJournalistOutline();
    edits.lede.hook = 'A sharper hook.';
    const { resume, stateUpdates, error } = buildResumePayload(
      { outline: false, outlineFeedback: 'Tighten the lede', outlineEdits: edits },
      { outline: before, directorGateNotes: [] }
    );
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: false, feedback: 'Tighten the lede' });
    expect(stateUpdates.outline).toEqual(edits);
    expect(stateUpdates._outlineFeedback).toBe('Tighten the lede');
    expect(stateUpdates._outlineHandEdits).toEqual({
      kind: 'outline',
      sections: [{ key: 'lede', changes: [{ path: 'lede.hook', before: before.lede.hook, after: 'A sharper hook.' }] }]
    });
    expect(stateUpdates._outlineHandEditReport).toBeNull();
  });

  test('outline: edits identical to the current outline write the outline but a null diff', () => {
    const before = validJournalistOutline();
    const { stateUpdates } = buildResumePayload(
      { outline: false, outlineFeedback: 'Rework the closing', outlineEdits: validJournalistOutline() },
      { outline: before }
    );
    expect(stateUpdates.outline).toEqual(before);
    expect(stateUpdates._outlineHandEdits).toBeNull();
  });

  test('outline: invalid edits return the schema error and write nothing', () => {
    const edits = validJournalistOutline();
    edits.lede = {};                                   // hook/keyTension/primaryArc required
    const { stateUpdates, error } = buildResumePayload(
      { outline: false, outlineFeedback: 'x', outlineEdits: edits },
      { outline: validJournalistOutline() }
    );
    expect(error).toMatch(/Edited outline failed schema validation \(outline\)/);
    expect(stateUpdates.outline).toBeUndefined();
    expect(stateUpdates._outlineHandEdits).toBeUndefined();
    expect(stateUpdates.directorGateNotes).toBeUndefined();
  });

  test('outline: a reject WITHOUT edits resets the diff and report to null', () => {
    const { stateUpdates } = buildResumePayload(
      { outline: false, outlineFeedback: 'Rework it' },
      { outline: validJournalistOutline(), _outlineHandEdits: { kind: 'outline', sections: [] }, _outlineHandEditReport: { checked: ['lede'], changed: [] } }
    );
    expect(stateUpdates.outline).toBeUndefined();
    expect(stateUpdates._outlineHandEdits).toBeNull();
    expect(stateUpdates._outlineHandEditReport).toBeNull();
  });

  test('outline: detective theme validates against detective-outline', () => {
    const { error } = buildResumePayload(
      { outline: false, outlineFeedback: 'x', outlineEdits: validJournalistOutline() },
      { theme: 'detective', outline: {} }
    );
    expect(error).toMatch(/detective-outline/);
  });

  test('article: valid edits are written with a diff scoped to the headline', () => {
    const before = bundleFixture();
    const edits = bundleFixture();
    edits.headline.main = 'A different headline';
    const { stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'Cut the second section', articleEdits: edits },
      { contentBundle: before }
    );
    expect(error).toBeNull();
    expect(stateUpdates.contentBundle).toEqual(edits);
    expect(stateUpdates._articleHandEdits.kind).toBe('bundle');
    expect(stateUpdates._articleHandEdits.scopes.map((s) => s.key)).toEqual(['headline']);
    expect(stateUpdates._articleHandEditReport).toBeNull();
  });

  test('article: invalid edits return the schema error and write nothing', () => {
    const edits = bundleFixture();
    delete edits.headline;
    const { stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'x', articleEdits: edits },
      { contentBundle: bundleFixture() }
    );
    expect(error).toMatch(/Edited article failed schema validation \(content-bundle\)/);
    expect(stateUpdates.contentBundle).toBeUndefined();
    expect(stateUpdates._articleHandEdits).toBeUndefined();
  });

  test('article: a reject WITHOUT edits resets the diff and report to null', () => {
    const { stateUpdates } = buildResumePayload({ article: false, articleFeedback: 'Rework it' }, { contentBundle: bundleFixture() });
    expect(stateUpdates._articleHandEdits).toBeNull();
    expect(stateUpdates._articleHandEditReport).toBeNull();
  });
});

describe('directorGateNotes (spec 2026-09-19 §5.2)', () => {
  const existing = [{ gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the vote arc.', at: '2026-09-19T10:00:00.000Z' }];

  test('an arc rejection appends one arc-selection entry with round = existing arc notes + 1', () => {
    const { stateUpdates } = buildResumePayload({ selectedArcs: false, arcFeedback: 'Merge arcs 2 and 3.' }, { directorGateNotes: existing });
    expect(stateUpdates.directorGateNotes).toHaveLength(2);
    expect(stateUpdates.directorGateNotes[0]).toEqual(existing[0]);
    expect(stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'arc-selection', kind: 'rejection', round: 2, text: 'Merge arcs 2 and 3.' });
    expect(stateUpdates.directorGateNotes[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('an outline rejection appends an outline entry, round 1 when no outline notes exist', () => {
    const { stateUpdates } = buildResumePayload({ outline: false, outlineFeedback: 'Lead with the ledger.' }, { outline: validJournalistOutline(), directorGateNotes: existing });
    expect(stateUpdates.directorGateNotes.map((n) => n.gate)).toEqual(['arc-selection', 'outline']);
    expect(stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'outline', round: 1, text: 'Lead with the ledger.' });
  });

  test('an article rejection appends an article entry; a missing channel counts as empty', () => {
    const { stateUpdates } = buildResumePayload({ article: false, articleFeedback: 'Name the shell account.' }, { contentBundle: {} });
    expect(stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'article', kind: 'rejection', round: 1, text: 'Name the shell account.' })]);
  });

  test('approvals append nothing, and arc GUIDANCE is not recorded as a note', () => {
    const a = buildResumePayload({ selectedArcs: ['arc-1'], outlineGuidance: 'Lead with the money.' }, { directorGateNotes: existing });
    expect(a.stateUpdates._outlineGuidance).toBe('Lead with the money.');
    expect(a.stateUpdates.directorGateNotes).toBeUndefined();
    const o = buildResumePayload({ outline: true }, { directorGateNotes: existing });
    expect(o.stateUpdates.directorGateNotes).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest __tests__/unit/server-build-resume-payload.test.js` → FAIL (edits ignored on reject; no notes).

- [ ] **Step 3: Implement** in `server.js`:

  (a) Extend the api-helpers import at line ~32 and add the diff import beside it:

```js
const { buildRollbackState, buildFreshStartState, createGraphAndConfig, sendErrorResponse, confineToBase, pruneGateNotes, PHASES_INVALIDATED_BY } = require('./lib/api-helpers');
const { diffOutline, diffBundle, isEmpty: isEmptyDiff } = require('./lib/hand-edit-diff');
```

  (b) Add a helper above `buildResumePayload`:

```js
/**
 * Append one director gate note (spec 2026-09-19 §5.2). The channel is a REPLACE
 * channel, so this writes the full array; buildResumePayload has the current state
 * and the per-session lock rules out a concurrent writer. `round` counts the
 * SURVIVING notes for the gate, so it restarts after a pruning rollback.
 */
function appendGateNote(stateUpdates, currentState, gate, text) {
    const existing = Array.isArray(currentState.directorGateNotes)
        ? currentState.directorGateNotes.filter(n => n && typeof n === 'object')
        : [];
    const round = existing.filter(n => n.gate === gate).length + 1;
    stateUpdates.directorGateNotes = [...existing, { gate, kind: 'rejection', round, text, at: new Date().toISOString() }];
}

/** Schema-check a director's edited object the same way the approve path does. */
function validateEdits(schemaName, edits, noun) {
    const { valid, errors } = outlineValidator.validate(schemaName, edits);
    if (valid) return null;
    const detail = (errors || []).map(function (e) { return (e.path || '/') + ' ' + e.message; }).join('; ');
    return 'Edited ' + noun + ' failed schema validation (' + schemaName + '): ' + detail;
}
```

  (c) Arc reject branch (~line 416-420): after `stateUpdates._arcFeedback = approvals.arcFeedback.trim();` add `appendGateNote(stateUpdates, currentState, 'arc-selection', approvals.arcFeedback.trim());`.

  (d) Replace the outline reject branch (~436-441) with:

```js
    } else if (approvals.outline === false && typeof approvals.outlineFeedback === 'string' && approvals.outlineFeedback.trim()) {
        // Spec 2026-09-19 §4.1: hand edits may travel with the note. Validate FIRST so
        // an invalid edit writes nothing at all.
        const hasEdits = approvals.outlineEdits && typeof approvals.outlineEdits === 'object';
        if (hasEdits) {
            const schemaName = theme === 'detective' ? 'detective-outline' : 'outline';
            error = validateEdits(schemaName, approvals.outlineEdits, 'outline');
            if (error) return { resume, stateUpdates, error };
        }
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.outlineFeedback.trim();
        stateUpdates._outlineFeedback = resume.feedback;
        appendGateNote(stateUpdates, currentState, 'outline', resume.feedback);
        // Every reject resets both steering fields (C3): a second reject after a
        // rework must not carry the previous round's diff or report.
        stateUpdates._outlineHandEdits = null;
        stateUpdates._outlineHandEditReport = null;
        if (hasEdits) {
            stateUpdates.outline = approvals.outlineEdits;   // incrementOutlineRevision hands it to the reviser
            const diff = diffOutline(currentState.outline, approvals.outlineEdits);
            stateUpdates._outlineHandEdits = isEmptyDiff(diff) ? null : diff;
        }
    }
```

  (e) Replace the article reject branch (~462-467) with the mirror:

```js
    } else if (approvals.article === false && typeof approvals.articleFeedback === 'string' && approvals.articleFeedback.trim()) {
        const hasEdits = approvals.articleEdits && typeof approvals.articleEdits === 'object';
        if (hasEdits) {
            error = validateEdits('content-bundle', approvals.articleEdits, 'article');
            if (error) return { resume, stateUpdates, error };
        }
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.articleFeedback.trim();
        stateUpdates._articleFeedback = resume.feedback;
        appendGateNote(stateUpdates, currentState, 'article', resume.feedback);
        stateUpdates._articleHandEdits = null;
        stateUpdates._articleHandEditReport = null;
        if (hasEdits) {
            stateUpdates.contentBundle = approvals.articleEdits;   // incrementArticleRevision hands it to the reviser
            const diff = diffBundle(currentState.contentBundle, approvals.articleEdits);
            stateUpdates._articleHandEdits = isEmptyDiff(diff) ? null : diff;
        }
    }
```

  Check the existing "invalid edits" tests for the APPROVE path still pass: they assert `error` text `Edited outline failed schema validation (outline): …` — the new `validateEdits` produces the identical string, and the approve branches may now call it too (optional refactor: replace the two inline blocks with `error = validateEdits(...)`; do it only if the existing tests stay byte-green).

- [ ] **Step 4: Run.** `npx jest __tests__/unit/server-build-resume-payload.test.js __tests__/integration` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add server.js __tests__/unit/server-build-resume-payload.test.js
git commit -m "feat(api): reject with hand edits, and the director's gate notes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 2.5 Rollback pruning line and `CHECKPOINT_DB_PATH`

- [ ] **Step 1: Write the failing test.** Create `__tests__/unit/checkpoint-db-path.test.js`. The default-path case is tested through a PURE resolver so this test never opens the production database; the one `require` of `server.js` happens with the override pointed at a temp file.

```js
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * CHECKPOINT_DB_PATH and PORT (spec 2026-09-19 §7.4 [C2]): a gate must be able to run
 * the server against a COPY of the checkpoint database on a port of its own, never the
 * production file and never the director's port. `server.js` hardcoded PORT = 3001.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

test('resolveCheckpointDbPath: the env override wins, else data/checkpoints.sqlite under the base dir', () => {
  // Load the resolver from a require that is itself pointed at a temp file (see below);
  // the pure function is what we exercise here.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-db-'));
  const file = path.join(dir, 'copy.sqlite');
  const previous = { db: process.env.CHECKPOINT_DB_PATH, port: process.env.PORT };
  process.env.CHECKPOINT_DB_PATH = file;
  process.env.PORT = '3011';
  try {
    jest.isolateModules(() => {
      const server = require('../../server.js');
      expect(server.resolveCheckpointDbPath({ CHECKPOINT_DB_PATH: 'rel/copy.sqlite' }, '/base')).toBe(path.resolve('rel/copy.sqlite'));
      expect(server.resolveCheckpointDbPath({}, '/base')).toBe(path.join('/base', 'data', 'checkpoints.sqlite'));
      expect(server.CHECKPOINT_DB_PATH).toBe(path.resolve(file));   // the module used the override
      expect(server.PORT).toBe(3011);
    });
    expect(fs.existsSync(file)).toBe(true);                          // SqliteSaver created the COPY, not data/
  } finally {
    if (previous.db === undefined) delete process.env.CHECKPOINT_DB_PATH; else process.env.CHECKPOINT_DB_PATH = previous.db;
    if (previous.port === undefined) delete process.env.PORT; else process.env.PORT = previous.port;
  }
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest __tests__/unit/checkpoint-db-path.test.js` → FAIL (`server.resolveCheckpointDbPath is not a function`).

- [ ] **Step 3: Implement** in `server.js`:

  (a) Replace line 44 with:

```js
/**
 * Spec 2026-09-19 §7.4: a live gate runs against a COPY of the checkpoint database,
 * never the production file, so the path is overridable through the environment.
 * Pure so the default can be tested without opening any database.
 */
function resolveCheckpointDbPath(env = process.env, baseDir = __dirname) {
    return env.CHECKPOINT_DB_PATH
        ? path.resolve(env.CHECKPOINT_DB_PATH)
        : path.join(baseDir, 'data', 'checkpoints.sqlite');
}
const CHECKPOINT_DB_PATH = resolveCheckpointDbPath();
```

  (b) Line ~656 `const PORT = 3001;` → `const PORT = Number(process.env.PORT) || 3001;   // throwaway gate servers must not collide with the director's 3001` (keep the rest of the listen block unchanged).

  (c) Add `resolveCheckpointDbPath`, `CHECKPOINT_DB_PATH` and `PORT` to `module.exports`.

  (c) In the rollback handler, directly after the `_previousPhotosPath` stash block (~line 1315) and BEFORE `if (stateOverrides)`:

```js
        // Spec 2026-09-19 §5.4: a rollback into the outline/article region drops the
        // director's gate notes about content this point regenerates and keeps the
        // earlier ones. Membership is checked first: points at or above arc-selection
        // clear the whole channel through ROLLBACK_CLEARS, and writing "all notes"
        // here would undo that clear.
        if (Object.prototype.hasOwnProperty.call(PHASES_INVALIDATED_BY, rollbackTo)) {
            initialState.directorGateNotes = pruneGateNotes(session.state.directorGateNotes, rollbackTo);
        }
```

- [ ] **Step 4: Run the new test and the full suite.** `npx jest __tests__/unit/checkpoint-db-path.test.js` → PASS. Then the full suite with the exit-code guard → green.

- [ ] **Step 5: Commit.**

```bash
git add server.js __tests__/unit/checkpoint-db-path.test.js
git commit -m "feat(api): prune gate notes on downstream rollbacks; CHECKPOINT_DB_PATH override

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Prompt side — hand-edits block, standing notes, report, payload keys

**Files:**
- Modify: `lib/prompt-builder.js` (`buildDirectorGuidanceSection` ~108-125; `_buildDirectorGuidance` ~272-284; the two `userPrompt += this._buildDirectorGuidance(options.directorGuidance);` lines ~685 and ~1173; `module.exports` ~1432)
- Modify: `lib/workflow/nodes/node-helpers.js` (requires at top; `buildRevisionContext` ~825-1000 — the `contextSection` template)
- Modify: `lib/workflow/nodes/ai-nodes.js` (`generateOutline` options ~919; `reviseOutline` ~968-1050; `buildOutlineRevisionPrompt` ~1101-1140; `generateContentBundle` options ~1209; `reviseContentBundle` ~1404-1490; `buildArticleRevisionPrompt` ~1538-1560)
- Modify: `lib/workflow/nodes/checkpoint-nodes.js` (`checkpointOutline` approve branch ~572-578; `checkpointArticle` approve branch ~620-626)
- Modify: `server.js#getCheckpointData` (~218-290: `ARC_SELECTION`, `OUTLINE`, `ARTICLE` cases) — T3 owns ONLY this function in `server.js`
- Test: `lib/__tests__/prompt-builder-director-guidance.test.js` (extend), `lib/__tests__/node-helpers-revision-context.test.js` (extend), `__tests__/unit/workflow/revise-hand-edits.test.js` (new), `__tests__/unit/workflow/checkpoint-hand-edit-clears.test.js` (new), `__tests__/unit/get-checkpoint-data.test.js` (extend)

**Interfaces:**
- Consumes (from T2): `lib/hand-edit-diff.js` `{ isEmpty, scopeKeys, formatHandEditsBlock, changedScopes }`; state channels `_outlineHandEdits`, `_articleHandEdits`, `_outlineHandEditReport`, `_articleHandEditReport`, `directorGateNotes` and the entry shape `{gate, kind, round, text, at}`.
- Produces (`lib/prompt-builder.js`): `buildDirectorGuidanceSection(directorGuidance, gateNotes = [])`; `filterGateNotes(notes, currentFeedback) → entry[]`; `PromptBuilder#buildOutlinePrompt(..., options)` and `#buildArticlePrompt(..., options)` read `options.gateNotes` (array) beside `options.directorGuidance` (string).
- Produces (`node-helpers.js`): `buildRevisionContext({ …, handEdits })` inserts `<HAND_EDITS>…</HAND_EDITS>` into `contextSection` after the HUMAN FEEDBACK paragraph and before "CRITICAL REVISION INSTRUCTIONS".
- Produces (`ai-nodes.js`): `buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes = [])` and `buildArticleRevisionPrompt(…, gateNotes = [])`; `reviseOutline` returns `_outlineHandEditReport` (never `_outlineHandEdits`); `reviseContentBundle` likewise.
- Produces (checkpoint payloads, consumed by T4b): `outline` and `article` gain `handEditReport: {checked: string[], changed: string[]} | null` and `directorGateNotes: entry[]`; `article` gains `outlineThesis: {hook, keyTension, primaryArc} | null`; `arc-selection` gains `directorGateNotes`.

#### 3.1 `buildDirectorGuidanceSection` with standing notes; `filterGateNotes`; the options key

- [ ] **Step 1: Write the failing tests.** Append to `lib/__tests__/prompt-builder-director-guidance.test.js`:

```js
describe('<DIRECTOR_GUIDANCE> standing notes (spec 2026-09-19 §5.3)', () => {
  const { buildDirectorGuidanceSection, filterGateNotes } = require('../prompt-builder');
  const NOTES = [
    { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the vote arc.', at: '2026-09-19T10:00:00.000Z' },
    { gate: 'outline', kind: 'rejection', round: 1, text: 'Lead with the ledger.', at: '2026-09-19T11:00:00.000Z' }
  ];
  // The pre-change output, captured with:
  //   node -e "const {buildDirectorGuidanceSection}=require('./lib/prompt-builder');
  //            console.log(JSON.stringify(buildDirectorGuidanceSection('Lead with the money, not the vote.')))"
  const EXPECTED_GUIDANCE_ONLY =
    '<DIRECTOR_GUIDANCE>\nThe director reviewed the arcs and asks for this emphasis. It outranks the craft rules above where they conflict:\n\nLead with the money, not the vote.\n</DIRECTOR_GUIDANCE>';

  it('guidance only is byte-identical to the pre-notes output, with or without an empty list', () => {
    expect(buildDirectorGuidanceSection(GUIDANCE)).toBe(EXPECTED_GUIDANCE_ONLY);
    expect(buildDirectorGuidanceSection(GUIDANCE, [])).toBe(EXPECTED_GUIDANCE_ONLY);
    expect(buildDirectorGuidanceSection(GUIDANCE, [null, { text: '   ' }])).toBe(EXPECTED_GUIDANCE_ONLY);
  });

  it('notes only → the section carries only the standing-notes paragraph, in order, labelled', () => {
    const section = buildDirectorGuidanceSection(null, NOTES);
    expect(section.startsWith('<DIRECTOR_GUIDANCE>\nStanding notes the director gave at earlier gates, in order.')).toBe(true);
    expect(section).toContain('keep honoring it in what you write now.');
    expect(section).not.toContain('outranks');
    const a = section.indexOf('- [arc-selection, rejection 1] Drop the vote arc.');
    const b = section.indexOf('- [outline, rejection 1] Lead with the ledger.');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(section.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('both → the guidance paragraph first, then the notes, one section', () => {
    const section = buildDirectorGuidanceSection(GUIDANCE, NOTES);
    expect(section.indexOf('outranks')).toBeLessThan(section.indexOf('Standing notes'));
    expect(section.match(/<DIRECTOR_GUIDANCE>/g)).toHaveLength(1);
  });

  it('nothing → empty string', () => {
    expect(buildDirectorGuidanceSection(null, [])).toBe('');
    expect(buildDirectorGuidanceSection('  ', null)).toBe('');
  });

  it('filterGateNotes drops only the note whose text is the feedback being acted on', () => {
    expect(filterGateNotes(NOTES, 'Lead with the ledger.')).toEqual([NOTES[0]]);
    expect(filterGateNotes(NOTES, null)).toEqual(NOTES);
    expect(filterGateNotes(NOTES, 'something else')).toEqual(NOTES);
    expect(filterGateNotes(null, 'x')).toEqual([]);
  });

  it('buildOutlinePrompt and buildArticlePrompt read options.gateNotes and still end with the section', async () => {
    const o = await makeBuilder().buildOutlinePrompt({ narrativeArcs: [] }, [], 'hero.png', [], [], [], null, { directorGuidance: null, gateNotes: NOTES });
    expect(o.userPrompt).toContain('- [outline, rejection 1] Lead with the ledger.');
    expect(o.userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
    const a = await makeBuilder().buildArticlePrompt({ lede: { hook: 'x' } }, [], 'hero.png', [], null, null, null, { directorGuidance: GUIDANCE, gateNotes: NOTES });
    expect(a.userPrompt).toContain(GUIDANCE);
    expect(a.userPrompt).toContain('- [arc-selection, rejection 1] Drop the vote arc.');
    expect(a.userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest lib/__tests__/prompt-builder-director-guidance.test.js -t "standing notes"` → FAIL (`filterGateNotes` undefined; notes never rendered).

- [ ] **Step 3: Implement** in `lib/prompt-builder.js`:

  (a) Replace `buildDirectorGuidanceSection` (~116-123) with:

```js
/**
 * The director's standing notes as a prompt paragraph (spec 2026-09-19 §5.3).
 * Entries with no usable text are skipped. '' when nothing remains.
 */
function formatGateNotes(gateNotes) {
  const list = Array.isArray(gateNotes)
    ? gateNotes.filter(n => n && typeof n.text === 'string' && n.text.trim())
    : [];
  if (list.length === 0) return '';
  const lines = list.map(n => `- [${n.gate}, ${n.kind || 'rejection'} ${n.round || 1}] ${n.text.trim()}`);
  return 'Standing notes the director gave at earlier gates, in order. Each was already applied\n' +
         'at its own gate; keep honoring it in what you write now.\n' + lines.join('\n');
}

/**
 * Drop the note the reviser is acting on RIGHT NOW (it is already in the prompt as
 * HUMAN FEEDBACK). Matching is by text: on an evaluator-driven second pass the
 * feedback slot is null, so nothing is excluded and the note stands (spec §5.3 [I10]).
 */
function filterGateNotes(gateNotes, currentFeedback) {
  const list = Array.isArray(gateNotes) ? gateNotes.filter(n => n && typeof n === 'object') : [];
  const current = typeof currentFeedback === 'string' ? currentFeedback.trim() : '';
  if (!current) return list;
  return list.filter(n => (typeof n.text === 'string' ? n.text.trim() : '') !== current);
}

/**
 * Build the <DIRECTOR_GUIDANCE> section (Q2 decision + spec 2026-09-19 §5.3).
 *
 * Standalone so the revision nodes can append it without going through a
 * PromptBuilder instance (their tests use a mock builder).
 *
 * @param {string|null} directorGuidance - free text from the arc-selection gate
 * @param {Array} [gateNotes] - directorGateNotes entries (already filtered by the caller)
 * @returns {string} XML section, or '' when there is neither guidance nor notes
 */
function buildDirectorGuidanceSection(directorGuidance, gateNotes = []) {
  const hasGuidance = typeof directorGuidance === 'string' && !!directorGuidance.trim();
  const notesText = formatGateNotes(gateNotes);
  if (!hasGuidance && !notesText) return '';
  const parts = [];
  if (hasGuidance) {
    parts.push('The director reviewed the arcs and asks for this emphasis. It outranks the craft rules above where they conflict:\n\n' +
      directorGuidance.trim());
  }
  if (notesText) parts.push(notesText);
  return labelPromptSection('DIRECTOR_GUIDANCE', parts.join('\n\n'));
}
```

  (b) `_buildDirectorGuidance(directorGuidance, gateNotes = [])` → `const section = buildDirectorGuidanceSection(directorGuidance, gateNotes);` (rest unchanged).

  (c) Both call sites become `userPrompt += this._buildDirectorGuidance(options.directorGuidance, options.gateNotes || []);`.

  (d) Add `filterGateNotes` to `module.exports` beside `buildDirectorGuidanceSection`.

- [ ] **Step 4: Run.** `npx jest lib/__tests__/prompt-builder-director-guidance.test.js lib/__tests__/revision-prompts-craft-rules.test.js` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder-director-guidance.test.js
git commit -m "feat(prompts): standing director notes inside <DIRECTOR_GUIDANCE>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 3.2 `<HAND_EDITS>` in `buildRevisionContext`

- [ ] **Step 1: Write the failing tests.** Append to `lib/__tests__/node-helpers-revision-context.test.js`:

```js
describe('<HAND_EDITS> block (spec 2026-09-19 §4.3)', () => {
  const { diffOutline } = require('../hand-edit-diff');
  const diff = diffOutline({ lede: { hook: 'Old' } }, { lede: { hook: 'New' } });
  const base = { phase: 'outline', revisionCount: 1, validationResults: null, previousOutput: { lede: { hook: 'New' } } };

  it('sits after HUMAN FEEDBACK and before CRITICAL REVISION INSTRUCTIONS', () => {
    const { contextSection, previousOutputSection } = buildRevisionContext({ ...base, humanFeedback: 'Tighten it', handEdits: diff });
    const hf = contextSection.indexOf('HUMAN FEEDBACK');
    const he = contextSection.indexOf('<HAND_EDITS>');
    const cr = contextSection.indexOf('CRITICAL REVISION INSTRUCTIONS');
    expect(hf).toBeGreaterThan(-1);
    expect(he).toBeGreaterThan(hf);
    expect(cr).toBeGreaterThan(he);
    expect(contextSection).toContain('- lede.hook: was "Old" -> now "New"');
    expect(contextSection).toContain("The evaluator's notes above were written before these edits.");
    expect(contextSection).toContain('</HAND_EDITS>');
    expect(previousOutputSection).not.toContain('HAND_EDITS');
  });

  it('is present even without human feedback (an evaluator-driven second pass)', () => {
    const { contextSection } = buildRevisionContext({ ...base, humanFeedback: null, handEdits: diff });
    expect(contextSection).toContain('<HAND_EDITS>');
    expect(contextSection.indexOf('<HAND_EDITS>')).toBeLessThan(contextSection.indexOf('CRITICAL REVISION INSTRUCTIONS'));
  });

  it('is absent when handEdits is null, empty or missing', () => {
    expect(buildRevisionContext({ ...base, handEdits: null }).contextSection).not.toContain('HAND_EDITS');
    expect(buildRevisionContext({ ...base, handEdits: diffOutline({}, {}) }).contextSection).not.toContain('HAND_EDITS');
    expect(buildRevisionContext(base).contextSection).not.toContain('HAND_EDITS');
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest lib/__tests__/node-helpers-revision-context.test.js -t HAND_EDITS` → FAIL.

- [ ] **Step 3: Implement** in `lib/workflow/nodes/node-helpers.js`:
  1. Add at the top with the other requires: `const { isEmpty: isEmptyDiff, formatHandEditsBlock } = require('../../hand-edit-diff');`
  2. In `buildRevisionContext`, destructure `handEdits` too: `const { phase, revisionCount, validationResults, previousOutput, humanFeedback, handEdits } = options;`
  3. Just before `const contextSection = \`` add:

```js
  // Spec 2026-09-19 §4.3: what the director changed by hand before sending this
  // back. Placed after HUMAN FEEDBACK and before the instructions so "PRESERVE"
  // covers the edits and "feedback above" is literally true. Present on EVERY pass
  // of the round, not only the first (C3).
  const handEditsBlock = (handEdits && !isEmptyDiff(handEdits))
    ? `<HAND_EDITS>
The director changed these parts by hand before sending this back. They are already
in the previous version below. Keep them exactly as they are unless the director's
feedback above asks to change them. The evaluator's notes above were written before
these edits.

${formatHandEditsBlock(handEdits)}
</HAND_EDITS>

`
    : '';
```

  4. In the template, change the line that today reads
     `` ` : ''}═══════ … CRITICAL REVISION INSTRUCTIONS: `` so the human-feedback ternary is followed by `${handEditsBlock}` before the rule line:

```js
${humanFeedback ? `HUMAN FEEDBACK (HIGHEST PRIORITY):
${humanFeedback}

NOTE: The human reviewer has explicitly requested these changes.
Address human feedback FIRST, then address any remaining evaluator issues.
` : ''}${handEditsBlock}═══════════════════════════════════════════════════════════════════════════════
CRITICAL REVISION INSTRUCTIONS:
```

- [ ] **Step 4: Run.** `npx jest lib/__tests__/node-helpers-revision-context.test.js __tests__/unit/workflow/node-helpers.test.js` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/workflow/nodes/node-helpers.js lib/__tests__/node-helpers-revision-context.test.js
git commit -m "feat(revision): <HAND_EDITS> block between the director's feedback and the instructions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 3.3 Revisers and generators

- [ ] **Step 1: Write the failing tests.** Create `__tests__/unit/workflow/revise-hand-edits.test.js`:

```js
/**
 * Revisers see the director's hand edits and report what they did to them; every
 * writer sees the standing notes (spec 2026-09-19 §4.3, §4.4, §5.3).
 *
 * getSdkClient returns config.configurable.sdkClient as-is, so a jest.fn that
 * records its options IS the model here. No paid calls.
 */
const {
  reviseOutline, reviseContentBundle, generateOutline, generateContentBundle,
  createMockPromptBuilder, _testing: { buildOutlineRevisionPrompt, buildArticleRevisionPrompt }
} = require('../../../lib/workflow/nodes/ai-nodes');
const { diffOutline, diffBundle } = require('../../../lib/hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const OUTLINE = { lede: { hook: 'Old hook', keyTension: 'T', primaryArc: 'A' }, closing: { finalQuestion: 'Q' } };
const EDITED = (() => { const o = clone(OUTLINE); o.lede.hook = 'New hook'; return o; })();
const NOTES = [
  { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the vote arc.', at: 't1' },
  { gate: 'outline', kind: 'rejection', round: 1, text: 'Tighten the lede.', at: 't2' }
];

function sdkReturning(value) {
  const sdk = jest.fn(async () => clone(value));
  return sdk;
}
function cfg(sdk, builder = createMockPromptBuilder()) {
  return { configurable: { sdkClient: sdk, promptBuilder: builder, theme: 'journalist' } };
}
const promptOf = (sdk) => sdk.mock.calls[0][0].prompt;

describe('reviseOutline', () => {
  const diff = diffOutline(OUTLINE, EDITED);

  it('puts <HAND_EDITS> in the prompt and does NOT clear the diff', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, _outlineFeedback: 'Tighten the lede.', outlineRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('<HAND_EDITS>');
    expect(promptOf(sdk)).toContain('lede.hook: was "Old hook" -> now "New hook"');
    expect(result).not.toHaveProperty('_outlineHandEdits');
  });

  it('reports kept edits: checked names the scopes, changed is empty', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, outlineRevisionCount: 1 }, cfg(sdk));
    expect(result._outlineHandEditReport).toEqual({ checked: ['lede'], changed: [] });
  });

  it('reports a reverted edit', async () => {
    const sdk = sdkReturning(OUTLINE);           // the model put the old hook back
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, outlineRevisionCount: 1 }, cfg(sdk));
    expect(result._outlineHandEditReport).toEqual({ checked: ['lede'], changed: ['lede'] });
  });

  it('rewrites the report on a second pass (no feedback slot, diff still present)', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: OUTLINE, _outlineHandEdits: diff, _outlineFeedback: null, _outlineHandEditReport: { checked: ['lede'], changed: ['lede'] }, outlineRevisionCount: 2 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('<HAND_EDITS>');
    expect(result._outlineHandEditReport).toEqual({ checked: ['lede'], changed: [] });
  });

  it('report is null and no block is rendered when there are no hand edits', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: OUTLINE, _outlineHandEdits: null, outlineRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).not.toContain('HAND_EDITS');
    expect(result._outlineHandEditReport).toBeNull();
  });

  it('passes the standing notes, excluding the one it is acting on', async () => {
    const sdk = sdkReturning(EDITED);
    await reviseOutline({ _previousOutline: OUTLINE, directorGateNotes: NOTES, _outlineFeedback: 'Tighten the lede.', outlineRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('- [arc-selection, rejection 1] Drop the vote arc.');
    expect(promptOf(sdk)).not.toContain('- [outline, rejection 1] Tighten the lede.');
    expect(promptOf(sdk)).toContain('HUMAN FEEDBACK');
  });

  it('on an evaluator-driven pass (no feedback) every note is passed', async () => {
    const sdk = sdkReturning(EDITED);
    await reviseOutline({ _previousOutline: OUTLINE, directorGateNotes: NOTES, _outlineFeedback: null, outlineRevisionCount: 2 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('- [outline, rejection 1] Tighten the lede.');
  });

  it('still nulls the feedback slot and the previous outline on success', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: OUTLINE, _outlineFeedback: 'x', outlineRevisionCount: 1 }, cfg(sdk));
    expect(result._outlineFeedback).toBeNull();
    expect(result._previousOutline).toBeNull();
  });
});

describe('reviseContentBundle', () => {
  const BUNDLE = { headline: { main: 'Old', kicker: 'K', deck: 'D' }, sections: [{ id: 's1', type: 'narrative', heading: 'H', content: [{ type: 'paragraph', text: 'P' }] }] };
  const EDITED_BUNDLE = (() => { const b = clone(BUNDLE); b.headline.main = 'New'; return b; })();
  const diff = diffBundle(BUNDLE, EDITED_BUNDLE);

  it('renders the block, keeps the diff, reports kept edits', async () => {
    const sdk = sdkReturning(EDITED_BUNDLE);
    const result = await reviseContentBundle({ _previousContentBundle: EDITED_BUNDLE, _articleHandEdits: diff, articleRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('headline.main: was "Old" -> now "New"');
    expect(result).not.toHaveProperty('_articleHandEdits');
    expect(result._articleHandEditReport).toEqual({ checked: ['headline'], changed: [] });
  });

  it('reports a reverted headline', async () => {
    const sdk = sdkReturning(BUNDLE);
    const result = await reviseContentBundle({ _previousContentBundle: EDITED_BUNDLE, _articleHandEdits: diff, articleRevisionCount: 1 }, cfg(sdk));
    expect(result._articleHandEditReport).toEqual({ checked: ['headline'], changed: ['headline'] });
  });

  it('passes the standing notes, excluding the current article feedback', async () => {
    const sdk = sdkReturning(EDITED_BUNDLE);
    const notes = [...NOTES, { gate: 'article', kind: 'rejection', round: 1, text: 'Name the shell.', at: 't3' }];
    await reviseContentBundle({ _previousContentBundle: BUNDLE, directorGateNotes: notes, _articleFeedback: 'Name the shell.', articleRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('- [outline, rejection 1] Tighten the lede.');
    expect(promptOf(sdk)).not.toContain('- [article, rejection 1] Name the shell.');
  });
});

describe('generators pass options.gateNotes', () => {
  it('generateOutline passes every note as options.gateNotes', async () => {
    const builder = createMockPromptBuilder();
    builder.buildOutlinePrompt = jest.fn(builder.buildOutlinePrompt);
    const sdk = sdkReturning(OUTLINE);
    await generateOutline({ selectedArcs: ['a'], narrativeArcs: [], arcEvidencePackages: [], directorGateNotes: NOTES, _outlineGuidance: 'Lead with the money.' }, cfg(sdk, builder));
    const options = builder.buildOutlinePrompt.mock.calls[0][7];
    expect(options).toEqual({ directorGuidance: 'Lead with the money.', gateNotes: NOTES });
  });

  it('generateContentBundle passes every note as options.gateNotes', async () => {
    const builder = createMockPromptBuilder();
    builder.buildArticlePrompt = jest.fn(builder.buildArticlePrompt);
    const sdk = sdkReturning({ headline: { main: 'x' }, sections: [] });
    await generateContentBundle({ outline: OUTLINE, arcEvidencePackages: [], directorGateNotes: NOTES }, cfg(sdk, builder));
    const options = builder.buildArticlePrompt.mock.calls[0][7];
    expect(options).toEqual({ directorGuidance: null, gateNotes: NOTES });
  });

  it('with no notes the generators pass an empty list (prompt unchanged)', async () => {
    const builder = createMockPromptBuilder();
    builder.buildOutlinePrompt = jest.fn(builder.buildOutlinePrompt);
    await generateOutline({ selectedArcs: ['a'], narrativeArcs: [], arcEvidencePackages: [] }, cfg(sdkReturning(OUTLINE), builder));
    expect(builder.buildOutlinePrompt.mock.calls[0][7]).toEqual({ directorGuidance: null, gateNotes: [] });
  });
});

describe('revision prompt builders accept gateNotes', () => {
  const promptBuilder = createMockPromptBuilder();
  it('outline revision renders the notes inside <DIRECTOR_GUIDANCE> after <RULES>', async () => {
    const prompt = await buildOutlineRevisionPrompt({ _outlineGuidance: null }, 'CTX', 'PREV', promptBuilder, NOTES);
    expect(prompt).toContain('- [arc-selection, rejection 1] Drop the vote arc.');
    expect(prompt.indexOf('<DIRECTOR_GUIDANCE>')).toBeGreaterThan(prompt.indexOf('<RULES>'));
  });
  it('article revision likewise, and omits the section with neither guidance nor notes', async () => {
    const withNotes = await buildArticleRevisionPrompt({ _outlineGuidance: null }, 'CTX', 'PREV', promptBuilder, NOTES);
    expect(withNotes).toContain('- [outline, rejection 1] Tighten the lede.');
    const bare = await buildArticleRevisionPrompt({ _outlineGuidance: null }, 'CTX', 'PREV', promptBuilder, []);
    expect(bare).not.toContain('DIRECTOR_GUIDANCE');
  });
});
```

  If `generateOutline`/`generateContentBundle` need more state to reach the prompt builder in this test (they read `sessionConfig`, `canonicalCharacters`, `shellAccounts`, `sessionPhotos`, `photoAnalyses`, `heroImage` with `|| {}`/`|| []` fallbacks), add the minimal fields the first failing assertion names; do not stub the builder methods away.

- [ ] **Step 2: Run to confirm failure.** `npx jest __tests__/unit/workflow/revise-hand-edits.test.js` → FAIL.

- [ ] **Step 3: Implement** in `lib/workflow/nodes/ai-nodes.js`:

  (a) Extend the prompt-builder require (line ~29): `const { …, buildDirectorGuidanceSection, filterGateNotes } = require('../../prompt-builder');` and add `const { scopeKeys, changedScopes } = require('../../hand-edit-diff');`.

  (b) `generateOutline` options (~919): `{ directorGuidance: state._outlineGuidance || null, gateNotes: state.directorGateNotes || [] }`. Same at `generateContentBundle` (~1209).

  (c) `reviseOutline`:
  - Before `buildRevisionContextDRY(...)`: `const handEdits = state._outlineHandEdits || null;` and pass `handEdits` in the options object.
  - After `const promptBuilder = …`: `const gateNotes = filterGateNotes(state.directorGateNotes, state._outlineFeedback);`
  - `buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes)`.
  - Success return: keep `_previousOutline: null` and `_outlineFeedback: null`; ADD

```js
      // Spec §4.4 (C3): verify on EVERY pass and rewrite the report; never clear
      // _outlineHandEdits here — the checkpoint clears it on approve, the server on reject.
      _outlineHandEditReport: handEdits
        ? { checked: scopeKeys(handEdits), changed: changedScopes(handEdits, result || {}) }
        : null,
```
  - The catch/timeout returns are unchanged (they do not mention the report).

  (d) `buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes = [])`: `const guidanceSection = buildDirectorGuidanceSection(state._outlineGuidance, gateNotes);`.

  (e) `reviseContentBundle`: mirror (c) with `_articleHandEdits`, `_articleFeedback`, `revised || {}`, `_articleHandEditReport`; `buildArticleRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes)`.

  (f) `buildArticleRevisionPrompt(…, gateNotes = [])`: same one-line change as (d).

- [ ] **Step 4: Run.** `npx jest __tests__/unit/workflow/revise-hand-edits.test.js __tests__/unit/workflow/ai-nodes.test.js lib/__tests__/revision-prompts-craft-rules.test.js` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/workflow/nodes/ai-nodes.js __tests__/unit/workflow/revise-hand-edits.test.js
git commit -m "feat(revisers): hand edits in, hand-edit report out, standing notes to every writer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 3.4 Checkpoint nodes clear the diff and report on approve

- [ ] **Step 1: Write the failing test.** Create `__tests__/unit/workflow/checkpoint-hand-edit-clears.test.js`:

```js
/**
 * The hand-edit diff and its report must not survive the gate they belong to
 * (spec 2026-09-19 §4.4). The revisers deliberately do not clear them (C3).
 */
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const { _testing: { checkpointOutline, checkpointArticle } } = require('../../../lib/workflow/nodes/checkpoint-nodes');

const DIFF = { kind: 'outline', sections: [{ key: 'lede', changes: [{ path: 'lede.hook', before: 'a', after: 'b' }] }] };
const REPORT = { checked: ['lede'], changed: [] };

test('outline approve returns null for both steering fields', async () => {
  const result = await checkpointOutline({ outline: {}, evaluationHistory: [], _outlineHandEdits: DIFF, _outlineHandEditReport: REPORT }, {});
  expect(result).toMatchObject({ outlineApproved: true, _outlineHandEdits: null, _outlineHandEditReport: null });
});

test('article approve returns null for both steering fields', async () => {
  const result = await checkpointArticle({ contentBundle: {}, evaluationHistory: [], _articleHandEdits: DIFF, _articleHandEditReport: REPORT }, {});
  expect(result).toMatchObject({ articleApproved: true, _articleHandEdits: null, _articleHandEditReport: null });
});

test('a resume that skips (already approved) does not touch them', async () => {
  const o = await checkpointOutline({ outlineApproved: true, _outlineHandEdits: DIFF }, {});
  expect(o).not.toHaveProperty('_outlineHandEdits');
  const a = await checkpointArticle({ articleApproved: true, _articleHandEdits: DIFF }, {});
  expect(a).not.toHaveProperty('_articleHandEdits');
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest __tests__/unit/workflow/checkpoint-hand-edit-clears.test.js` → FAIL (fields absent from the approve return).

- [ ] **Step 3: Implement** in `lib/workflow/nodes/checkpoint-nodes.js`. `checkpointOutline` approve branch:

```js
  if (resumeValue?.approved === true && !skipCondition) {
    console.log(`[checkpointOutline] Approved by human`);
    return {
      outlineApproved: true,
      // Spec 2026-09-19 §4.4: the director's hand-edit diff and the rework report belong
      // to this gate only; the revisers keep them for the whole round (C3), so the gate
      // is where they end.
      _outlineHandEdits: null,
      _outlineHandEditReport: null,
      currentPhase: PHASES.OUTLINE_CHECKPOINT
    };
  }
```

  `checkpointArticle` approve branch: the same with `articleApproved`, `_articleHandEdits`, `_articleHandEditReport`, `PHASES.ARTICLE_CHECKPOINT`.

- [ ] **Step 4: Run.** `npx jest __tests__/unit/workflow/checkpoint-hand-edit-clears.test.js __tests__/unit/workflow/` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/workflow/nodes/checkpoint-nodes.js __tests__/unit/workflow/checkpoint-hand-edit-clears.test.js
git commit -m "feat(checkpoints): approve ends the hand-edit diff and report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 3.5 Checkpoint payload keys

- [ ] **Step 1: Write the failing tests.** Append to `__tests__/unit/get-checkpoint-data.test.js`:

```js
describe('steering keys (spec 2026-09-19 §4.4, §5.5, §6.2)', () => {
  const NOTES = [{ gate: 'outline', kind: 'rejection', round: 1, text: 'x', at: 't' }];

  it('outline carries handEditReport and directorGateNotes', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: [], _outlineHandEditReport: { checked: ['lede'], changed: [] }, directorGateNotes: NOTES });
    expect(data.handEditReport).toEqual({ checked: ['lede'], changed: [] });
    expect(data.directorGateNotes).toEqual(NOTES);
  });

  it('outline defaults to a null report and an empty notes list', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: [] });
    expect(data.handEditReport).toBeNull();
    expect(data.directorGateNotes).toEqual([]);
  });

  it('article carries handEditReport, directorGateNotes and the journalist outlineThesis', async () => {
    const lede = { hook: 'H', keyTension: 'T', primaryArc: 'A', selectedEvidence: ['e'] };
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null, outline: { lede }, _articleHandEditReport: { checked: ['headline'], changed: ['headline'] }, directorGateNotes: NOTES });
    expect(data.handEditReport).toEqual({ checked: ['headline'], changed: ['headline'] });
    expect(data.directorGateNotes).toEqual(NOTES);
    expect(data.outlineThesis).toEqual({ hook: 'H', keyTension: 'T', primaryArc: 'A' });
  });

  it('article outlineThesis is null for the detective theme and when the outline has no lede', async () => {
    const d = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null, theme: 'detective', outline: { lede: { hook: 'H' } } });
    expect(d.outlineThesis).toBeNull();
    const none = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null, outline: {} });
    expect(none.outlineThesis).toBeNull();
  });

  it('arc-selection carries directorGateNotes', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, { evaluationHistory: [], narrativeArcs: [], directorGateNotes: NOTES });
    expect(data.directorGateNotes).toEqual(NOTES);
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest __tests__/unit/get-checkpoint-data.test.js -t "steering keys"` → FAIL.

- [ ] **Step 3: Implement** in `server.js#getCheckpointData`:
  - `ARC_SELECTION` case: add `directorGateNotes: state.directorGateNotes || []`.
  - `OUTLINE` case: add `handEditReport: state._outlineHandEditReport || null, directorGateNotes: state.directorGateNotes || []`.
  - `ARTICLE` case: add `handEditReport: state._articleHandEditReport || null, directorGateNotes: state.directorGateNotes || [], outlineThesis: outlineThesisOf(state)`.
  - Add above `getCheckpointData`:

```js
/** The approved outline's thesis for the article gate (spec 2026-09-19 §6.2). Journalist only. */
function outlineThesisOf(state) {
    if ((state.theme || 'journalist') === 'detective') return null;
    const lede = state.outline && state.outline.lede;
    if (!lede || typeof lede !== 'object') return null;
    return { hook: lede.hook || '', keyTension: lede.keyTension || '', primaryArc: lede.primaryArc || '' };
}
```

- [ ] **Step 4: Run.** `npx jest __tests__/unit/get-checkpoint-data.test.js` → PASS. Then the full suite with the exit-code guard → green.

- [ ] **Step 5: Commit.**

```bash
git add server.js __tests__/unit/get-checkpoint-data.test.js
git commit -m "feat(api): handEditReport, directorGateNotes and outlineThesis on the gate payloads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4a: Console — thesis panel, reject with edits, cue line, thesis echo

**Files:**
- Modify: `console/outline-edit-logic.js` (section (C) journalist initializers ~126; section (D) builders ~190; the `api` object ~677-712)
- Modify: `console/components/checkpoints/Outline.js` (editors area after `TextField`/`actionsRow` ~36-60; `handleReject` ~661-668; `renderOutlineSections` journalist array ~1135; reject-mode block ~1205-1220; add `renderThesis` beside `renderLede` ~674)
- Modify: `console/components/checkpoints/Article.js` (`handleReject` ~902-908; render ~1350 above the headline block; reject-mode block)
- Modify: `console/console.css` (append)
- Test: `__tests__/unit/outline-edit-logic.test.js` (extend), `__tests__/unit/console-editable-pencils.test.js` (bump pins)

**Interfaces:**
- Consumes: nothing from other tasks (the reject payload keys `outlineEdits`/`articleEdits` already exist on the approve path; T2 makes the server honour them on a reject; `data.outlineThesis` arrives from T3 and is read defensively).
- Produces: `EditLogic.initThesis(lede) → {hook, keyTension, primaryArc}`; `EditLogic.buildThesisPayload(formState, originalLede) → lede object`. Reject payloads `{ outline:false, outlineFeedback, outlineEdits? }` / `{ article:false, articleFeedback, articleEdits? }`. T4b later adds two props to the `RevisionDiff` calls in these files.

#### 4a.1 Pure thesis logic

- [ ] **Step 1: Write the failing tests.** Append to `__tests__/unit/outline-edit-logic.test.js` (it already requires the module as `L` and defines `validJournalistOutline()`):

```js
describe('thesis editor logic (spec 2026-09-19 §6.1)', () => {
  test('initThesis reads the three fields and tolerates a missing lede', () => {
    expect(L.initThesis({ hook: 'H', keyTension: 'T', primaryArc: 'A', selectedEvidence: ['e'] })).toEqual({ hook: 'H', keyTension: 'T', primaryArc: 'A' });
    expect(L.initThesis(null)).toEqual({ hook: '', keyTension: '', primaryArc: '' });
    expect(L.initThesis({ hook: 7 })).toEqual({ hook: '', keyTension: '', primaryArc: '' });
  });

  test('buildThesisPayload replaces the three fields and preserves selectedEvidence and unknown keys', () => {
    const original = { ...validJournalistOutline().lede, extraKey: { kept: true } };
    const out = L.buildThesisPayload({ hook: 'New hook', keyTension: 'New tension', primaryArc: 'New arc' }, original);
    expect(out).toEqual({ ...original, hook: 'New hook', keyTension: 'New tension', primaryArc: 'New arc' });
    expect(out).not.toBe(original);
    expect(original.hook).toBe(validJournalistOutline().lede.hook);   // no mutation
  });

  test('buildThesisPayload keeps blank fields blank (the validation layer decides)', () => {
    const out = L.buildThesisPayload({ hook: '', keyTension: 'T', primaryArc: '' }, validJournalistOutline().lede);
    expect(out.hook).toBe('');
    expect(out.primaryArc).toBe('');
  });

  test('a thesis save on a LEDE with no selectedEvidence emits no selectedEvidence key', () => {
    const out = L.buildThesisPayload({ hook: 'h', keyTension: 't', primaryArc: 'a' }, { hook: 'x', keyTension: 'y', primaryArc: 'z' });
    expect(out).toEqual({ hook: 'h', keyTension: 't', primaryArc: 'a' });
  });

  test('the result passes the journalist outline schema inside a valid outline', () => {
    const outline = validJournalistOutline();
    outline.lede = L.buildThesisPayload({ hook: 'h', keyTension: 't', primaryArc: 'a' }, outline.lede);
    expect(validate('outline', outline).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest __tests__/unit/outline-edit-logic.test.js -t thesis` → FAIL (`L.initThesis is not a function`).

- [ ] **Step 3: Implement** in `console/outline-edit-logic.js`. After `initLede` add:

```js
  function initThesis(lede) {
    var s = lede || {};
    return {
      hook: typeof s.hook === 'string' ? s.hook : '',
      keyTension: typeof s.keyTension === 'string' ? s.keyTension : '',
      primaryArc: typeof s.primaryArc === 'string' ? s.primaryArc : ''
    };
  }
```

  After `buildLedePayload` add:

```js
  // Thesis panel (spec 2026-09-19 §6.1): three LEDE fields with their own editor.
  // Delegates to buildLedePayload so the LEDE builder stays the single writer of
  // that section and selectedEvidence survives untouched.
  function buildThesisPayload(formState, originalLede) {
    var base = initLede(originalLede);
    return buildLedePayload({
      hook: formState.hook,
      keyTension: formState.keyTension,
      primaryArc: formState.primaryArc,
      selectedEvidence: base.selectedEvidence
    }, originalLede);
  }
```

  Register both in the `api` object: `initThesis: initThesis,` next to `initLede`, `buildThesisPayload: buildThesisPayload,` next to `buildLedePayload`.

- [ ] **Step 4: Run.** `npx jest __tests__/unit/outline-edit-logic.test.js` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add console/outline-edit-logic.js __tests__/unit/outline-edit-logic.test.js
git commit -m "feat(console): pure thesis init/build logic over the LEDE builder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 4a.2 Thesis panel and editor in `Outline.js`

- [ ] **Step 1: Write the failing test.** In `__tests__/unit/console-editable-pencils.test.js` change the pins: the `it('routes all 13 pencil hosts …')` title → `'routes all 14 pencil hosts through it: 12 section wrappers + the 2 THE STORY rows'`, `expect(count(src, 'className: EDITABLE')).toBe(11)` → `toBe(12)`, and in `'has one editable host per editBtn call site'` `expect(hosts).toBe(13)` → `toBe(14)`. Add in the same `describe`:

```js
  it('renders the thesis panel through the opt-in host and its own editing key (spec 2026-09-19 §6.1)', () => {
    expect(src).toContain("className: EDITABLE + ' outline-thesis'");
    expect(src).toContain("setEditingBlock({ type: 'section', key: 'thesis' })");
    expect(src).toContain("isEditing('section', 'thesis')");
    expect(src).toContain('EditLogic.buildThesisPayload(');
  });
```

- [ ] **Step 2: Run to confirm failure.** `npx jest __tests__/unit/console-editable-pencils.test.js` → FAIL (counts 11/13; strings absent).

- [ ] **Step 3: Implement** in `console/components/checkpoints/Outline.js`:

  (a) After the `TextField` widget and before the section editors, add the thesis editor:

```js
/**
 * Thesis editor (spec 2026-09-19 §6.1): the three LEDE fields the director rewrites
 * most, with their own pencil. Saves through the LEDE path via EditLogic.buildThesisPayload.
 */
function ThesisEditor({ lede, onSave, onCancel }) {
  const [form, setForm] = React.useState(EditLogic.initThesis(lede));
  function set(key) {
    return function (value) { setForm(function (prev) { return Object.assign({}, prev, { [key]: value }); }); };
  }
  return React.createElement('div', { className: 'edit-form' },
    React.createElement(TextField, { label: 'Hook', value: form.hook, onChange: set('hook'), multiline: true }),
    React.createElement(TextField, { label: 'Key tension', value: form.keyTension, onChange: set('keyTension'), multiline: true }),
    React.createElement(TextField, { label: 'Primary arc', value: form.primaryArc, onChange: set('primaryArc') }),
    actionsRow(function () { onSave(EditLogic.buildThesisPayload(form, lede)); }, onCancel)
  );
}
```

  (b) Inside the `Outline` component, beside `renderLede`, add:

```js
  // Thesis panel (spec 2026-09-19 §6.1). Journalist only. Its editing key is 'thesis',
  // never 'lede', so opening it does not flip the LEDE section into edit mode; its
  // original is the CURRENT lede (edited when edits are pending) so a thesis save after
  // a LEDE edit keeps that edit's evidence selection.
  function renderThesis(lede) {
    if (isDetective || !lede) return null;
    const editing = isEditing('section', 'thesis');
    const field = function (label, value) {
      return React.createElement('p', { className: 'text-sm mb-sm' },
        React.createElement('strong', null, label + ': '),
        typeof value === 'string' && value.trim() ? value : React.createElement('span', { className: 'text-muted' }, '(empty)')
      );
    };
    if (editing) {
      return React.createElement('div', { key: 'thesis', className: 'outline-section outline-section--editing outline-thesis' },
        React.createElement('h4', { className: 'outline-section__title' }, 'THESIS'),
        React.createElement(ThesisEditor, { lede: lede, onSave: function (updated) { saveSectionEdit('lede', updated); }, onCancel: cancelEdit })
      );
    }
    return React.createElement('div', { key: 'thesis', className: EDITABLE + ' outline-thesis' },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'THESIS'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'thesis' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        field('Hook', lede.hook),
        field('Key tension', lede.keyTension),
        field('Primary arc', lede.primaryArc),
        React.createElement('p', { className: 'text-xs text-muted' }, 'Shown again at the article gate. The headline must serve this.')
      )
    );
  }
```

  (c) In `renderOutlineSections()` the journalist array starts with `renderThesis(current.lede),` before `renderLede(current.lede),`.

  (d) `console/console.css` append:

```css
/* Thesis panel at the outline gate (spec 2026-09-19 §6.1) */
.outline-thesis {
  border-left-color: rgba(212, 168, 83, 0.6);
  background: rgba(212, 168, 83, 0.06);
  padding: var(--space-sm) var(--space-md);
  border-radius: 4px;
}
/* Read-only echo of the thesis at the article gate (§6.2) */
.article-thesis-echo {
  border-left: 2px solid rgba(212, 168, 83, 0.6);
  background: rgba(212, 168, 83, 0.06);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-md);
  border-radius: 4px;
}
```

- [ ] **Step 4: Run.** `npx jest __tests__/unit/console-editable-pencils.test.js __tests__/unit/console-checkpoint-order.test.js` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add console/components/checkpoints/Outline.js console/console.css __tests__/unit/console-editable-pencils.test.js
git commit -m "feat(console): thesis panel with its own editor at the outline gate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 4a.3 Reject with edits, cue line, thesis echo

No node-testable logic here (React wiring); the reviewer's click-through (§7.2) is the test. Implement carefully and self-check with the grep assertions at the end of Step 2.

- [ ] **Step 1: `Outline.js` `handleReject`** — replace with:

```js
  function handleReject() {
    if (!feedbackText.trim()) return;
    // Spec 2026-09-19 §4.6: hand edits travel with the note. Validate exactly as
    // approve does; an invalid edit is shown, not sent. The EDITED outline is cached
    // as the revision's previous version so the diff view compares the rework
    // against what the director actually sent.
    if (hasEdits && editedOutline) {
      const themeForValidation = isDetective ? 'detective' : 'journalist';
      const result = EditLogic.validateOutlineShape(editedOutline, themeForValidation);
      if (!result.valid) {
        setEditError('Cannot send, edited outline is invalid: ' +
          result.errors.map(function (e) { return e.path + ' ' + e.message; }).join('; '));
        return;
      }
      setEditError('');
      if (dispatch) {
        dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: editedOutline });
        dispatch({ type: 'CACHE_REVISION', contentType: 'outline', data: editedOutline });
      }
      onReject({ outline: false, outlineFeedback: feedbackText.trim(), outlineEdits: editedOutline });
      return;
    }
    if (dispatch) {
      dispatch({ type: 'CACHE_REVISION', contentType: 'outline', data: outline });
    }
    onReject({ outline: false, outlineFeedback: feedbackText.trim() });
  }
```

  In the reject-mode block, directly after the `'Feedback for revision'` label element, add:

```js
      hasEdits && React.createElement('p', { className: 'text-xs text-muted', role: 'status' },
        'Your hand edits will be sent with this note. The reviser is told to keep them.'),
```

- [ ] **Step 2: `Article.js`** — `handleReject` becomes the mirror:

```js
  function handleReject() {
    if (!feedbackText.trim()) return;
    if (hasEdits && editedBundle) {
      const result = ArticleEditLogic.validateBundleShape(editedBundle);
      if (!result.valid) {
        setEditError('Cannot send, edited article is invalid: ' +
          result.errors.map(function (e) { return e.path + ' ' + e.message; }).join('; '));
        return;
      }
      setEditError('');
      if (dispatch) {
        dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'article', edits: editedBundle });
        dispatch({ type: 'CACHE_REVISION', contentType: 'article', data: editedBundle });
      }
      onReject({ article: false, articleFeedback: feedbackText.trim(), articleEdits: editedBundle });
      return;
    }
    if (dispatch) {
      dispatch({ type: 'CACHE_REVISION', contentType: 'article', data: contentBundle });
    }
    onReject({ article: false, articleFeedback: feedbackText.trim() });
  }
```

  Add the same cue `<p>` in Article's reject-mode block after its label. Then the thesis echo: near the other `const` reads at the top of the component add `const outlineThesis = (data && data.outlineThesis) || null;` and, in the render, directly BEFORE the headline block (`isEditing('headline') ? … : …`), add:

```js
    // Thesis echo (spec 2026-09-19 §6.2): read-only, from the approved outline, so the
    // headline is judged against the thesis it must serve. No pencil, no opt-in class.
    outlineThesis && React.createElement('div', { className: 'article-thesis-echo' },
      React.createElement('h4', { className: 'outline-section__title' }, 'THESIS (from the approved outline)'),
      React.createElement('p', { className: 'text-sm mb-sm' }, React.createElement('strong', null, 'Hook: '), outlineThesis.hook || '(empty)'),
      React.createElement('p', { className: 'text-sm mb-sm' }, React.createElement('strong', null, 'Key tension: '), outlineThesis.keyTension || '(empty)'),
      React.createElement('p', { className: 'text-sm' }, React.createElement('strong', null, 'Primary arc: '), outlineThesis.primaryArc || '(empty)')
    ),
```

  Self-check greps (all must hold): `grep -c "outlineEdits: editedOutline" console/components/checkpoints/Outline.js` → 2 (approve + reject); `grep -c "articleEdits: editedBundle" console/components/checkpoints/Article.js` → 2; `grep -c "article-block--editable-always" console/components/checkpoints/Article.js` → 0.

- [ ] **Step 3: Run the console tests and the full suite.** `npx jest __tests__/unit/console-editable-pencils.test.js __tests__/unit/outline-edit-logic.test.js` → PASS; full suite green.

- [ ] **Step 4: Syntax check** (Babel compiles at load; a syntax error blanks the whole console, and these files use `React.createElement`, not JSX, so Node can parse them): `node --check console/components/checkpoints/Outline.js && node --check console/components/checkpoints/Article.js && echo SYNTAX-OK`. The browser render is verified by the reviewer's click-through in 4b.2 and by the integrator in 5.2 (T4a runs in parallel with T2, so the `PORT` override a throwaway server needs may not exist yet — do not start a server here).

- [ ] **Step 5: Commit.**

```bash
git add console/components/checkpoints/Outline.js console/components/checkpoints/Article.js
git commit -m "feat(console): reject sends the hand edits with the note; thesis echo at the article gate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4b: `RevisionDiff` — hand-edit advisory and standing notes

**Files:**
- Modify: `console/checkpoint-view-logic.js` (add `steeringView`; register in `api`)
- Modify: `console/components/RevisionDiff.js` (props, condition, two blocks)
- Modify: `console/components/checkpoints/Outline.js` (~1148), `Article.js` (~1324), `ArcSelection.js` (~149) — the `RevisionDiff` prop objects only
- Modify: `console/console.css` (append)
- Test: `console/__tests__/checkpoint-view-logic.test.js` (extend)

**Interfaces:**
- Consumes (from T3 payloads): `data.handEditReport`, `data.directorGateNotes`.
- Produces: `ViewLogic.steeringView(handEditReport, gateNotes) → { any: boolean, changedLabels: string[], keptCount: number, notes: [{ label, text }] }`; `RevisionDiff` props `handEditReport`, `gateNotes`.

#### 4b.1 Pure view logic

- [ ] **Step 1: Write the failing tests.** Append to `console/__tests__/checkpoint-view-logic.test.js` (it requires the module as `V` or similar — match the file's existing alias):

```js
describe('steeringView (spec 2026-09-19 §4.4, §5.5)', () => {
  const { steeringView } = require('../checkpoint-view-logic');

  test('nothing → any:false with empty parts', () => {
    expect(steeringView(null, null)).toEqual({ any: false, changedLabels: [], keptCount: 0, notes: [] });
    expect(steeringView(null, [])).toEqual({ any: false, changedLabels: [], keptCount: 0, notes: [] });
  });

  test('changed scopes are mapped to the gate labels; section ids and unknown keys are readable', () => {
    const v = steeringView({ checked: ['lede', 'closing', 'section:intro', 'evidenceCards', 'weird'], changed: ['lede', 'section:intro', 'weird'] }, []);
    expect(v.any).toBe(true);
    expect(v.changedLabels).toEqual(['LEDE', 'Section "intro"', 'weird']);
    expect(v.keptCount).toBe(0);
  });

  test('a report with nothing changed reports the kept count', () => {
    const v = steeringView({ checked: ['headline', 'byline'], changed: [] }, []);
    expect(v).toEqual({ any: true, changedLabels: [], keptCount: 2, notes: [] });
  });

  test('an empty checked list is treated as no report', () => {
    expect(steeringView({ checked: [], changed: [] }, []).any).toBe(false);
  });

  test('notes become labelled lines in order; malformed entries are skipped', () => {
    const v = steeringView(null, [
      { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the vote arc.' },
      null, { gate: 'outline', text: '' },
      { gate: 'outline', round: 2, text: 'Lead with the ledger.' }
    ]);
    expect(v.any).toBe(true);
    expect(v.notes).toEqual([
      { label: '[arc-selection, rejection 1]', text: 'Drop the vote arc.' },
      { label: '[outline, rejection 2]', text: 'Lead with the ledger.' }
    ]);
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest console/__tests__/checkpoint-view-logic.test.js -t steeringView` → FAIL.

- [ ] **Step 3: Implement** in `console/checkpoint-view-logic.js`, before the `api` object:

```js
  // ── steeringView (spec 2026-09-19 §4.4, §5.5) ─────────────────────────────
  // The hand-edit report and the standing notes as RevisionDiff renders them.
  var SCOPE_LABELS = {
    lede: 'LEDE', theStory: 'THE STORY', followTheMoney: 'FOLLOW THE MONEY', thePlayers: 'THE PLAYERS',
    whatsMissing: "WHAT'S MISSING", closing: 'CLOSING',
    executiveSummary: 'EXECUTIVE SUMMARY', evidenceLocker: 'EVIDENCE LOCKER', memoryAnalysis: 'MEMORY ANALYSIS',
    suspectNetwork: 'SUSPECT NETWORK', outstandingQuestions: 'OUTSTANDING QUESTIONS', finalAssessment: 'FINAL ASSESSMENT',
    headline: 'Headline', byline: 'Byline', pullQuotes: 'Pull quotes', evidenceCards: 'Evidence cards',
    financialTracker: 'Financial tracker', photos: 'Photos', heroImage: 'Hero image'
  };

  function scopeLabel(key) {
    if (SCOPE_LABELS[key]) return SCOPE_LABELS[key];
    if (typeof key === 'string' && key.indexOf('section:') === 0) return 'Section "' + key.slice(8) + '"';
    return String(key);
  }

  function steeringView(handEditReport, gateNotes) {
    var report = handEditReport && Array.isArray(handEditReport.checked) && handEditReport.checked.length > 0
      ? handEditReport : null;
    var changed = report ? (Array.isArray(report.changed) ? report.changed : []) : [];
    var notes = (Array.isArray(gateNotes) ? gateNotes : [])
      .filter(function (n) { return n && typeof n.text === 'string' && n.text.trim(); })
      .map(function (n) {
        return { label: '[' + n.gate + ', ' + (n.kind || 'rejection') + ' ' + (n.round || 1) + ']', text: n.text.trim() };
      });
    return {
      any: !!report || notes.length > 0,
      changedLabels: changed.map(scopeLabel),
      keptCount: report && changed.length === 0 ? report.checked.length : 0,
      notes: notes
    };
  }
```

  Register `steeringView: steeringView` in the `api` object.

- [ ] **Step 4: Run.** `npx jest console/__tests__/checkpoint-view-logic.test.js` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add console/checkpoint-view-logic.js console/__tests__/checkpoint-view-logic.test.js
git commit -m "feat(console): steeringView — labels for the hand-edit report and the standing notes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 4b.2 `RevisionDiff` and the three gates

- [ ] **Step 1: `RevisionDiff.js`.** Add at the top, after `const { Badge } = window.Console.utils;`: `const ViewLogic = window.Console.checkpointViewLogic;` (it loads before `RevisionDiff.js` in `index.html`). Change the signature to `function RevisionDiff({ previous, current, revisionCount, maxRevisions, previousFeedback, humanRevisionCount, maxHumanRevisions, handEditReport, gateNotes })` and, right after `const hasPrevious = …`, add:

```js
  // Spec 2026-09-19 §4.4/§5.5: the hand-edit report and the standing notes render
  // here too, and they must render on a gate with no revision state (the first
  // outline gate after an arc rejection has notes and nothing else).
  const steering = ViewLogic.steeringView(handEditReport, gateNotes);
```

  Widen the early return: `const hasRevisionState = revisionCount > 0 || humanRevisionCount > 0 || !!previousFeedback || steering.any;`.

  After the "Previous feedback callout" element, insert:

```js
    // Hand-edit report: what the rework did to the director's own edits (§4.4)
    steering.changedLabels.length > 0 && React.createElement('div', {
      className: 'revision-diff__warning revision-diff__hand-edits', role: 'status'
    }, 'The rework changed sections you edited by hand: ' + steering.changedLabels.join(', ') + '.'),
    steering.keptCount > 0 && React.createElement('div', {
      className: 'text-xs text-muted revision-diff__hand-edits revision-diff__hand-edits--kept', role: 'status'
    }, 'Rework kept all ' + steering.keptCount + ' hand edit' + (steering.keptCount === 1 ? '' : 's') + '.'),

    // Standing notes the writer will see (§5.5)
    steering.notes.length > 0 && React.createElement('div', { className: 'revision-diff__feedback revision-diff__notes' },
      React.createElement('span', { className: 'revision-diff__feedback-label' }, 'Standing notes the writer will see'),
      React.createElement('ul', { className: 'revision-diff__notes-list' },
        steering.notes.map(function (n, i) {
          return React.createElement('li', { key: i, className: 'revision-diff__feedback-text' },
            React.createElement('span', { className: 'text-muted' }, n.label + ' '), n.text);
        })
      )
    ),
```

- [ ] **Step 2: Wire the props.** In `Outline.js` (~1148) and `Article.js` (~1324) add to the `RevisionDiff` prop object: `handEditReport: (data && data.handEditReport) || null, gateNotes: (data && data.directorGateNotes) || []`. In `ArcSelection.js` (~149) add `handEditReport: null, gateNotes: (data && data.directorGateNotes) || []`.

- [ ] **Step 3: CSS.** Append to `console/console.css`:

```css
/* Hand-edit report and standing notes inside RevisionDiff (spec 2026-09-19) */
.revision-diff__hand-edits { margin-top: var(--space-sm); }
.revision-diff__hand-edits--kept { padding-left: var(--space-md); }
.revision-diff__notes-list { list-style: none; padding-left: 0; margin: var(--space-xs) 0 0; }
.revision-diff__notes-list li { margin-bottom: var(--space-xs); }
```

- [ ] **Step 4: Verify.** Full suite green (no console file is under test except the pure modules). Then the reviewer's click-through per spec §7.2 on a throwaway server with `CHECKPOINT_DB_PATH` pointed at a scratch file and `window.fetch` stubbed:

```js
// Paste in the browser console AFTER logging in. `payload` is a captured GET /checkpoint
// JSON for an outline gate (see docs/reviews/2026-09-19-photo-late-join/pre-deploy-gate.md
// for how one was captured) with these keys added to payload.checkpoint:
//   directorGateNotes: [{gate:'arc-selection',kind:'rejection',round:1,text:'Drop the vote arc.',at:'t'}]
//   handEditReport: {checked:['lede','closing'],changed:['closing']}
const realFetch = window.fetch;
window.__posts = [];
window.fetch = async function (url, opts) {
  opts = opts || {};
  if ((opts.method || 'GET') !== 'GET') {
    window.__posts.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
    return new Response(JSON.stringify({ status: 'processing' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (String(url).indexOf('/checkpoint') !== -1) {
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, opts);
};
```

  Click-through checklist (record each as pass/fail with a screenshot name): (1) Resume the session id → outline gate renders with the THESIS panel first; (2) the advisory line names CLOSING; (3) the standing note renders under "Standing notes the writer will see"; (4) thesis pencil → edit hook → Save → panel shows the new hook and the LEDE section's evidence list is unchanged; (5) Reject → the cue line "Your hand edits will be sent with this note." is visible → type a note → Submit → `window.__posts[0].body` has `outline:false`, `outlineFeedback`, and `outlineEdits.lede.hook` equal to the new hook; (6) blank the hook via the LEDE editor, Reject → the `.validation-error` appears and `window.__posts.length` is unchanged; (7) swap `payload.checkpoint.handEditReport` for `{checked:['lede'],changed:[]}` and Resume again → "Rework kept all 1 hand edit."; (8) an article-gate payload with `outlineThesis` → the echo renders above the headline; `window.__posts` never contains a GET.

- [ ] **Step 5: Commit.**

```bash
git add console/components/RevisionDiff.js console/components/checkpoints/Outline.js console/components/checkpoints/Article.js console/components/checkpoints/ArcSelection.js console/console.css
git commit -m "feat(console): hand-edit advisory and standing notes in RevisionDiff on the three creative gates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Integration — render-diff guard, live gate on a copy, docs, run kit, final review, merge

The integrator (the lead) runs this task. Sub-steps 5.1 and 5.4–5.5 may be delegated (5.1 to an implementer with a reviewer); 5.2, 5.3 and 5.6 are the lead's.

**Files:**
- Create: `scripts/render-prompts.js`
- Create: `docs/runbook/decision-log-template.md`, `docs/runbook/first-run-sheet.md`, `docs/runbook/pre-registration-2026-09.md`
- Modify: `reports/CLAUDE.md`
- Scratch (never committed): `<scratchpad>/gate-steering/` — the copied database, the log root, the server wrapper, curl outputs, gate notes.

**Interfaces:**
- Consumes: everything above.
- Produces: `docs/reviews/2026-09-19-director-steering/pre-deploy-gate.md` (the gate notes, committed), the merged `main`.

#### 5.1 `scripts/render-prompts.js` — the prompt regression guard

- [ ] **Step 1: Write the script.** Create `scripts/render-prompts.js`:

```js
#!/usr/bin/env node
/**
 * scripts/render-prompts.js — render the four director-facing prompts from a thread's
 * PERSISTED state, with NO model calls (spec 2026-09-19 §7.3), or compare two renders.
 *
 *   node scripts/render-prompts.js --session 0919269 --db <copy.sqlite> --out <dir> [--repo <path>]
 *   node scripts/render-prompts.js --compare <dirA> <dirB>
 *
 * --repo points at the tree whose lib/ renders (default: this repo). Run once with the
 * `main` worktree and once with the branch, then --compare: the only permitted
 * differences are the <HAND_EDITS> block and the standing-notes paragraph inside
 * <DIRECTOR_GUIDANCE>. Anything else fails (exit 1).
 *
 * Transient inputs are faked deterministically: the "previous" output is the persisted
 * outline/bundle, feedback is a fixed string, revisionCount is 1, a fixed hand-edit
 * (one edited field) and two fixed gate notes are supplied. On a tree without
 * lib/hand-edit-diff.js (main) the hand-edit diff is simply absent.
 */
'use strict';
const path = require('path');
const fs = require('fs');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
    else out._.push(a);
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

const FILES = ['outline-generation.txt', 'outline-revision.txt', 'article-generation.txt', 'article-revision.txt'];
const FIXED_FEEDBACK = 'RENDER-DIFF FIXED FEEDBACK: tighten the second section.';
const FIXED_NOTES = [
  { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'RENDER-DIFF NOTE A', at: '2026-09-19T00:00:00.000Z' },
  { gate: 'outline', kind: 'rejection', round: 1, text: 'RENDER-DIFF NOTE B', at: '2026-09-19T00:00:01.000Z' }
];

if (args.compare) { compare(args._[0], args._[1]); }
else { render().catch((e) => { console.error(e); process.exit(2); }); }

async function loadState(dbPath, threadId) {
  const Database = require('better-sqlite3');
  let JsonPlusSerializer;
  try { ({ JsonPlusSerializer } = require('@langchain/langgraph-checkpoint/dist/serde/jsonplus.cjs')); }
  catch (_) { ({ JsonPlusSerializer } = require('@langchain/langgraph-checkpoint')); }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const row = db.prepare(`SELECT type, checkpoint FROM checkpoints WHERE thread_id=? AND checkpoint_ns='' ORDER BY checkpoint_id DESC LIMIT 1`).get(threadId);
  db.close();
  if (!row) throw new Error(`no checkpoint for thread ${threadId} in ${dbPath}`);
  const cp = row.type === 'json'
    ? JSON.parse(Buffer.isBuffer(row.checkpoint) ? row.checkpoint.toString('utf8') : String(row.checkpoint))
    : await new JsonPlusSerializer().loadsTyped(row.type, row.checkpoint);
  return cp.channel_values || {};
}

async function render() {
  const repo = path.resolve(args.repo || path.join(__dirname, '..'));
  const outDir = path.resolve(args.out);
  const sessionId = String(args.session);
  const dbPath = path.resolve(args.db);
  fs.mkdirSync(outDir, { recursive: true });

  const req = (p) => require(path.join(repo, p));
  const { createPromptBuilder } = req('lib/prompt-builder.js');
  const { buildRevisionContext } = req('lib/workflow/nodes/node-helpers.js');
  const { _testing: { buildOutlineRevisionPrompt, buildArticleRevisionPrompt, getOutlineRevisionSystemPrompt, getArticleRevisionSystemPrompt } } = req('lib/workflow/nodes/ai-nodes.js');
  let diffMod = null;
  try { diffMod = req('lib/hand-edit-diff.js'); } catch (_) { /* main has no hand-edit module */ }

  const state = await loadState(dbPath, sessionId);
  const theme = state.theme || 'journalist';
  const promptBuilder = createPromptBuilder({
    theme, sessionConfig: state.sessionConfig || {},
    canonicalCharacters: state.canonicalCharacters || null,
    characterData: (state.characterData && state.characterData.characters) || null
  });

  // Mirror ai-nodes.js generateOutline / generateContentBundle (as data/review-2026-09-18/render-p1.js did).
  const roster = (state.sessionConfig && state.sessionConfig.roster) || [];
  const canonical = state.canonicalCharacters || {};
  const sessionFacts = roster.length > 0 ? {
    roster: roster.map((p) => { const n = p.name || p; return canonical[n] || n; }),
    accusation: (state.sessionConfig && state.sessionConfig.accusation && state.sessionConfig.accusation.accused || []).join(' and ') || 'Unknown',
    playerCount: roster.length
  } : null;
  const nameOf = (p) => typeof p === 'string' ? p.split(/[/\\]/).pop() : p && p.filename;
  const whiteboard = state.whiteboardPhotoPath ? nameOf(state.whiteboardPhotoPath) : null;
  const heroImage = state.heroImage || null;
  const availablePhotos = (state.sessionPhotos || [])
    .filter((p) => nameOf(p) !== heroImage && (!whiteboard || nameOf(p) !== whiteboard))
    .map((p, i) => {
      const a = (state.photoAnalyses && state.photoAnalyses.analyses && state.photoAnalyses.analyses[i]) || {};
      return { filename: nameOf(p) || `photo-${i}.jpg`, fullPath: p,
        characters: (a.characterDescriptions || []).map((c) => typeof c === 'string' ? c : c.description), visualContent: a.visualContent || '' };
    });
  const { timing, architecture, ...cache } = state._arcAnalysisCache || {};
  const arcAnalysis = { ...cache, narrativeArcs: state.narrativeArcs || [] };
  const guidance = state._outlineGuidance || null;

  const write = (name, systemPrompt, userPrompt) =>
    fs.writeFileSync(path.join(outDir, name), `===== SYSTEM =====\n${systemPrompt}\n\n===== USER =====\n${userPrompt}\n`);

  // 1. outline generation
  const og = await promptBuilder.buildOutlinePrompt(arcAnalysis, state.selectedArcs || [], heroImage, availablePhotos,
    state.arcEvidencePackages || [], state.shellAccounts || [], sessionFacts, { directorGuidance: guidance, gateNotes: FIXED_NOTES });
  write(FILES[0], og.systemPrompt, og.userPrompt);

  // 2. outline revision (fixed hand edit: lede.hook)
  const outline = state.outline || {};
  const editedOutline = JSON.parse(JSON.stringify(outline));
  if (editedOutline.lede) editedOutline.lede.hook = String(editedOutline.lede.hook || '') + ' [RENDER-DIFF EDIT]';
  const outlineDiff = diffMod ? diffMod.diffOutline(outline, editedOutline) : null;
  const orc = buildRevisionContext({ phase: 'outline', revisionCount: 1, validationResults: state.validationResults || null,
    previousOutput: editedOutline, humanFeedback: FIXED_FEEDBACK, handEdits: outlineDiff });
  const orPrompt = await buildOutlineRevisionPrompt({ ...state, _outlineGuidance: guidance }, orc.contextSection, orc.previousOutputSection, promptBuilder, FIXED_NOTES);
  write(FILES[1], getOutlineRevisionSystemPrompt(theme), orPrompt);

  // 3. article generation
  const ag = await promptBuilder.buildArticlePrompt(outline, state.arcEvidencePackages || [], heroImage, state.shellAccounts || [],
    sessionFacts, state.directorNotes || null, state.narrativeTensions || null, { directorGuidance: guidance, gateNotes: FIXED_NOTES });
  write(FILES[2], ag.systemPrompt, ag.userPrompt);

  // 4. article revision (fixed hand edit: headline.main)
  const bundle = state.contentBundle || {};
  const editedBundle = JSON.parse(JSON.stringify(bundle));
  if (editedBundle.headline) editedBundle.headline.main = String(editedBundle.headline.main || '') + ' [RENDER-DIFF EDIT]';
  const bundleDiff = diffMod ? diffMod.diffBundle(bundle, editedBundle) : null;
  const arc = buildRevisionContext({ phase: 'article', revisionCount: 1, validationResults: state.validationResults || null,
    previousOutput: editedBundle, humanFeedback: FIXED_FEEDBACK, handEdits: bundleDiff });
  const arPrompt = await buildArticleRevisionPrompt({ ...state, _outlineGuidance: guidance }, arc.contextSection, arc.previousOutputSection, promptBuilder, FIXED_NOTES);
  write(FILES[3], getArticleRevisionSystemPrompt(theme), arPrompt);

  for (const f of FILES) console.log(`${f}: ${fs.statSync(path.join(outDir, f)).size.toLocaleString()} bytes`);
}

/** Strip the two permitted additions from a rendered prompt, then normalise blank runs. */
function stripPermitted(text) {
  let t = text.replace(/<HAND_EDITS>[\s\S]*?<\/HAND_EDITS>\n*/g, '');
  t = t.replace(/\n*Standing notes the director gave at earlier gates, in order\.[\s\S]*?(?=\n<\/DIRECTOR_GUIDANCE>)/g, '');
  t = t.replace(/\n*<DIRECTOR_GUIDANCE>\n<\/DIRECTOR_GUIDANCE>/g, '');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function compare(dirA, dirB) {
  let failed = false;
  for (const f of FILES) {
    const a = stripPermitted(fs.readFileSync(path.join(dirA, f), 'utf8'));
    const b = stripPermitted(fs.readFileSync(path.join(dirB, f), 'utf8'));
    if (a === b) { console.log(`OK    ${f}`); continue; }
    failed = true;
    const la = a.split('\n'), lb = b.split('\n');
    let i = 0; while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
    console.log(`DIFF  ${f} — first difference at line ${i + 1}:\n  A: ${JSON.stringify(la[i] || '')}\n  B: ${JSON.stringify(lb[i] || '')}`);
  }
  process.exit(failed ? 1 : 0);
}
```

- [ ] **Step 2: Run it on the branch against the COPIED database** (5.3 step 2 makes the copy; make it now if not yet): `node scripts/render-prompts.js --session 0919269 --db "$GATE/db/copy.sqlite" --out "$GATE/render-branch"` → four files, sizes printed. Confirm `grep -c "<HAND_EDITS>" "$GATE/render-branch/outline-revision.txt"` → 1 and `grep -c "RENDER-DIFF NOTE B" "$GATE/render-branch/article-generation.txt"` → 1.

- [ ] **Step 3: Render on `main` through a read-only worktree.** From `reports/`:

```bash
git worktree add ../reports-main main
cmd //c mklink /J "..\\reports-main\\node_modules" "node_modules"     # junction, no admin needed
node scripts/render-prompts.js --session 0919269 --db "$GATE/db/copy.sqlite" --out "$GATE/render-main" --repo ../reports-main
node scripts/render-prompts.js --compare "$GATE/render-main" "$GATE/render-branch"
```

  Expected: four `OK` lines, exit 0. Any `DIFF` line is a prompt regression: fix the branch (never the script's strip rules) until it passes. Remove the worktree afterwards: `git worktree remove ../reports-main`.

- [ ] **Step 4: Commit** the script (not the render outputs).

```bash
git add scripts/render-prompts.js
git commit -m "chore(scripts): render-prompts — render the four prompts from persisted state and compare trees

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

#### 5.2 Integrator click-through

- [ ] Repeat the 4b.2 Step 4 click-through once yourself on the branch server (throwaway password, `CHECKPOINT_DB_PATH` at a scratch file, `PORT=3011` so it cannot collide with the director's 3001; the 4b.2 reviewer uses the same env). Record pass/fail per item in the gate notes (5.3 step 8). Any failure is a fix round on T4a/T4b, not a note.

#### 5.3 Live deploy gate on a COPY (spec §7.4)

- [ ] **Step 1: Preconditions.** The director's `main` server is DOWN (ask; do not assume). Set `GATE` to `<scratchpad>/gate-steering`. Record production mtimes:

```bash
mkdir -p "$GATE" && stat -c '%y %n' data/checkpoints.sqlite outputs/report-0919269.html > "$GATE/mtimes-before.txt" && ls -laR data/0919269 >> "$GATE/mtimes-before.txt"
```

- [ ] **Step 2: Copy.** `mkdir -p "$GATE/db" && cp data/checkpoints.sqlite "$GATE/db/copy.sqlite" && cp -r data/0919269 "$GATE/data-0919269-before"`.

- [ ] **Step 3: Server wrapper.** Write `"$GATE/run-gate-server.js"` (the `PORT` and `CHECKPOINT_DB_PATH` overrides landed in T2.5):

```js
// Throwaway gate server on a COPIED database and its own port. server.js loads .env
// itself (dotenv does not override variables already set), so these presets win.
process.env.ACCESS_PASSWORD = 'gate-0919-steering-throwaway';
process.env.SESSION_SECRET = require('crypto').randomBytes(32).toString('hex');
process.env.CHECKPOINT_DB_PATH = process.argv[2];
process.env.LLM_CALL_LOG_DIR = process.argv[3];
process.env.PORT = process.argv[4] || '3011';
require('C:/Users/spide/Documents/claudecode/aboutlastnight/reports/server.js');
```

  Start it in the background: `node "$GATE/run-gate-server.js" "$GATE/db/copy.sqlite" "$GATE/llm-log" 3011 > "$GATE/server.log" 2>&1 &` and confirm `curl -s http://localhost:3011/api/health`. **No other process opens the copied database while it runs; no subagent runs the suite or a server during the gate.**

- [ ] **Step 4: Roll the copied thread back to `outline`.**

```bash
curl -s -c "$GATE/jar.txt" -H 'Content-Type: application/json' -d '{"password":"gate-0919-steering-throwaway"}' http://localhost:3011/api/auth/login
curl -s -N -b "$GATE/jar.txt" http://localhost:3011/api/session/0919269/progress > "$GATE/sse-1.log" &   # SSE before POST
sleep 2; curl -s -b "$GATE/jar.txt" -H 'Content-Type: application/json' -d '{"rollbackTo":"outline"}' http://localhost:3011/api/session/0919269/rollback
```

  Poll (background until-loop, 20 s interval) `curl -s -b "$GATE/jar.txt" http://localhost:3011/api/session/0919269/checkpoint` until `"checkpointType":"outline"`. Save it: `… > "$GATE/cp1.json"`. This pays `generateOutline` + `evaluateOutline` (Opus).

- [ ] **Step 5: Edit the thesis by hand and reject with a note.**

```bash
node -e "
const cp=require('$GATE/cp1.json'); const o=cp.checkpoint.outline;
o.lede.hook = o.lede.hook + ' [GATE EDIT]';
require('fs').writeFileSync('$GATE/approve-reject-with-edits.json', JSON.stringify({ outline:false, outlineFeedback:'GATE TEST: keep my hook exactly. Make the key tension name the money, not the vote.', outlineEdits:o }));
"
curl -s -N -b "$GATE/jar.txt" http://localhost:3011/api/session/0919269/progress > "$GATE/sse-2.log" &
sleep 2; curl -s -b "$GATE/jar.txt" -H 'Content-Type: application/json' -d @"$GATE/approve-reject-with-edits.json" http://localhost:3011/api/session/0919269/approve
```

  Expect `{"status":"processing"}` (a 400 here is a schema failure to investigate). Poll until `checkpointType` is `outline` again; save `"$GATE/cp2.json"`. This pays `reviseOutline` + `evaluateOutline`, up to three pairs if the evaluator loops.

- [ ] **Step 6: Checks.** All must hold; record each in the gate notes:
  1. `node -e "const c=require('$GATE/cp2.json').checkpoint; console.log(JSON.stringify({report:c.handEditReport, notes:c.directorGateNotes, hook:c.outline.lede.hook}))"` → `report.checked` is `["lede"]`; `report.changed` is `[]` (hook kept) or `["lede"]` (reverted — also a valid outcome, record which); `notes` has one entry `{gate:'outline', kind:'rejection', round:1, text:'GATE TEST: …'}`.
  2. `ls "$GATE/llm-log/0919269/llm-log/"` lists the calls; `grep -l "<HAND_EDITS>" "$GATE"/llm-log/0919269/llm-log/*reviseOutline*.json` → the revision file; `grep -c "Standing notes the director gave" <that file>` → 1; `grep -c "GATE EDIT" <that file>` → ≥ 2 (in the diff line and in the previous output).
  3. `cat "$GATE/llm-log/0919269/llm-log/index.jsonl"` → one line per call with `elapsed` and `channel`; copy the Opus durations into the gate notes (problem 5 data).
  4. Console: in the built-in browser open `http://localhost:3011/console`, log in with the throwaway password, Resume `0919269` → the THESIS panel shows the edited hook; the RevisionDiff shows either the advisory line or "Rework kept all 1 hand edit."; the standing-notes list shows the GATE TEST note. Screenshot to `$GATE/`.
  5. **Stop here** (spec §7.4 [I11]). Approving on to the article gate is optional and costs two more Opus calls.

- [ ] **Step 7: Tear down and verify isolation.** Kill the gate server. Then:

```bash
stat -c '%y %n' data/checkpoints.sqlite outputs/report-0919269.html > "$GATE/mtimes-after.txt" && ls -laR data/0919269 >> "$GATE/mtimes-after.txt"
diff "$GATE/mtimes-before.txt" "$GATE/mtimes-after.txt" && echo PRODUCTION-UNTOUCHED
git status --short | grep -v '^??' ; echo "(no tracked changes expected above)"
```

- [ ] **Step 8: Gate notes.** Write `docs/reviews/2026-09-19-director-steering/pre-deploy-gate.md` with: the click-through checklist results, the render-diff result (four OK lines), the live gate's six checks with the actual values, the call durations from `index.jsonl`, the isolation diff result, and any follow-ups. No session content beyond the GATE TEST strings. Commit it.

#### 5.4 `reports/CLAUDE.md`

- [ ] Make these edits, then re-read the touched paragraphs for accuracy:
  1. **Checkpoint payload keys table** (the table headed "Checkpoint payload keys the gates read"): add rows — `handEditReport` (outline, article): "`{checked, changed}` from `_outlineHandEditReport`/`_articleHandEditReport`: which of the director's hand-edited scopes the rework kept or changed; read through `checkpoint-view-logic.js#steeringView` into `RevisionDiff`; `null` when the reject carried no edits" — `directorGateNotes` (arc-selection, outline, article): "every rejection note so far, `{gate, kind, round, text, at}`; rendered as 'Standing notes the writer will see'" — `outlineThesis` (article): "`{hook, keyTension, primaryArc}` from the approved outline's LEDE (journalist only; `null` for detective) for the read-only echo above the headline".
  2. **Approval payloads paragraph** (starts "`buildResumePayload`): append: "A rejection may carry the director's edited object — `{outline:false, outlineFeedback, outlineEdits?}` / `{article:false, articleFeedback, articleEdits?}` (spec `docs/superpowers/specs/2026-09-19-director-steering-design.md`). It is validated exactly like an approval, becomes the version the reviser starts from (`incrementOutlineRevision` copies it into `_previousOutline`), and its diff (`lib/hand-edit-diff.js`) is written to `_outlineHandEdits`/`_articleHandEdits`, which the reviser renders as a `<HAND_EDITS>` block between HUMAN FEEDBACK and the revision instructions. After EVERY reviser pass the report `_outlineHandEditReport`/`_articleHandEditReport` (`{checked, changed}`) is rewritten; the revisers never clear the diff (an evaluator-driven second pass must still see it), the checkpoint clears both on approve, and the server resets both on every reject. Every rejection note is appended to `directorGateNotes` (a REPLACE channel the server appends to by writing the full array; `pruneGateNotes` drops the invalidated gates' notes on a rollback to `photos`/`character-ids`/`outline`/`article`, and points at or above `arc-selection` clear it) and rendered as standing notes inside `<DIRECTOR_GUIDANCE>` for every later writer and reviser. Arc-selection GUIDANCE is not a note; it already persists in `_outlineGuidance`."
  3. **Session Data Directory Structure table**: add `llm-log/` | "Per-call prompt/response log (`lib/observability/llm-call-log.js`): `<yyyymmdd-HHMMSS>-<context>-<callId8>.json` per call, `index.jsonl`" | written on `llm_start`, rewritten on completion; disabled under Jest unless a test opts in.
  4. **Claude Agent SDK Usage** section: after the `onProgress` bullet add "every message carries `callId` (one UUID per call)".
  5. **Environment Setup**: add `CHECKPOINT_DB_PATH` (default `data/checkpoints.sqlite`; any live gate runs on a COPY through this), `LLM_CALL_LOG_DIR` (default `data/`) and `PORT` (default 3001; throwaway servers use another port).
  6. **Console File Structure**: `RevisionDiff.js` line → "+ hand-edit advisory and standing notes (`steeringView`)"; `checkpoint-view-logic.js` line → add `steeringView`; `outline-edit-logic.js` line → add `initThesis`/`buildThesisPayload`.

  Commit: `git commit -m "docs: director steering — payload keys, reject-with-edits, gate notes, LLM log, env vars"` with the attribution line.

#### 5.5 Run kit (documents)

- [ ] Create `docs/runbook/decision-log-template.md`:

```markdown
# Decision log — session <MMDDYY>

Copy this file to `data/<id>/decision-log.md` (gitignored) and fill one entry per gate you touch.
Write while you wait; the waits are the data too. Times in your local clock.

## Entry

### <gate> — <hh:mm> — round <n>
- **Saw:** what the gate showed that mattered (the verdict line, a fact-check defect, the thesis, a card, a caption…)
- **Wanted:** what you wanted to do to it
- **Allowed:** what the console let you do
- **Did:** approve | approve with edits | reject with note | reject with edits + note | roll back to <gate> | left it for end-editing
- **Why:**
- **Waited:** <mm:ss> until the next gate appeared
- **Flags:** [ ] wanted-scoped-rework  [ ] end-edited-for-time  [ ] could-not-predict-downstream  [ ] page-reset
- **Note typed (verbatim):**

## End of run
- Start → publish: <h:mm>
- Rejections used: <n>   Rejections with edits: <n>   Reverted-edit advisories seen: <n>
- Hand edits after publish (from the findings file): <n>
- The one thing the console should have let you do:
```

- [ ] Create `docs/runbook/first-run-sheet.md`:

```markdown
# First fall-run session — run sheet (2026-09)

## Before you start
1. Local `main` is the merged branch; `npm start` from `reports/`. If a server is already running, stop it first — the graph and the gates changed.
2. `curl -s localhost:3001/api/health` answers. The database is the default `data/checkpoints.sqlite` (no `CHECKPOINT_DB_PATH` set).
3. Open `docs/runbook/decision-log-template.md`, copy it to `data/<id>/decision-log.md`.

## Starting the session
- Session ID = the session date as MMDDYY (second session the same day: add a digit).
- Leave **Photos** blank if the photos are not curated yet: the pipeline asks for the folder after arc selection.
- Put the whiteboard photo in the **Whiteboard** field. A whiteboard inside the photos folder is excluded from the article but NOT read.

## During the run
- Never restart the server while a step is running. Restart only at a pause (a gate).
- If the page resets to the blank Session screen: note the time in the decision log, open the browser DevTools console and run
  `document.wasDiscarded; performance.getEntriesByType('navigation')[0].type` and write down both values, then type the session ID and click **Resume**. Nothing is lost.
- At **arc selection**: the guidance box goes to the outline AND the article prompts.
- At **outline**: read the THESIS panel first. Edit by hand what you can, then, if the clock allows, reject once with a note — your edits travel with it and the reviser is told to keep them. After the rework, read the advisory line (kept / changed your edits).
- At **article**: the thesis echo sits above the headline; judge the headline against it. Same reject-once request if the clock allows. Read "Standing notes the writer will see".
- Every note you type is kept and shown to every later writer.

## After publishing
1. Fill the end-of-run block of the decision log.
2. Run the two-pass refinement with a findings file, and add one column per finding: *which gate could have caught this, and why it did not*.
3. Do not commit: anything under `data/`, `outputs/report-<id>.html`, `outputs/sessionphotos/<id>/`.
4. The per-call prompt log is at `data/<id>/llm-log/` for the prompt work.
```

- [ ] Create `docs/runbook/pre-registration-2026-09.md`:

```markdown
# Pre-registration — first fall-run session on the 2026-09-19 pipeline

Written BEFORE the run. Compared against the findings file AFTER it. Baseline = the five
measured sessions (062126–071826, 116 hand edits), see the 2026-09-18 baseline memo.

| # | Failure class (baseline rank) | Baseline frequency | Caught now by | Expectation for this run |
|---|---|---|---|---|
| 1 | Evidence-card content fabricated under a real token id | 4 of 5 | CODE: fact-check structural (card fidelity) → automatic revision before Opus | Zero fabricated cards reach the article gate. Watch for FALSE structurals (a paraphrase flagged as fabricated). |
| 2 | Roster coverage gaps | shipped anyway | CODE: fact-check structural (rosterCoverage) | Every roster PC named at the article gate. |
| 3 | Marcus (victim, not roster) written they/them | FACT errors | ADVISORY only (npcPronouns) | May still ship. Count occurrences; if ≥1, promote the check after the run. |
| 4 | Thesis / headline rewritten by hand | headline survived in 1 of 5 | DIRECTOR: thesis panel at outline (new), echo at article (new) | The headline is changed AT THE GATE or survives; not rewritten after publish. |
| 5 | Evidence-boundary violations (account-name → actor, money direction) | narrowed | PROMPT only | Hand-check; expect ≤1. |
| 6 | Remote session written on-site | 2 of 2 remote | CODE: reporting-mode system block + fact-check narrator scan (structural) | Zero presence/vote claims by the narrator in a remote session. |
| 7 | Invalid photo references / captions | advisory in 4 of 5 | CODE: photoReferences structural | Zero invalid refs. Caption quality is prompt-only. |
| 8 | Voice / scaffolding (WHAT'S MISSING cut, closing untitled) | director pass | PROMPT only | Expect hand edits; count them. |

## Steering metrics to record (from the decision log)
- Rejections used, and how many carried hand edits.
- Reverted-edit advisories seen (the reviser undid an edit).
- Notes typed, and whether a later phase visibly honoured them.
- Gates skipped for time; end-edits made after publish (count, by class).
- Wait per Opus call (outline generation, outline revision, article generation, article revision) — problem 5 data.

## Not expected to change
Prose quality classes 5 and 8: the prompts are unchanged by design; this run is their "before" measurement.
```

  Commit the three files: `git commit -m "docs(runbook): decision log, first-run sheet and pre-registration for the fall run"` with the attribution line.

#### 5.6 Final review, fix wave, merge

- [ ] **Full suite green** with the exit-code guard; `git log --oneline main..HEAD` lists every commit above.
- [ ] **Whole-branch review on Fable** (read-only; output to `.superpowers/sdd/2026-09-19-director-steering/final-review.md`): spec pass against `docs/superpowers/specs/2026-09-19-director-steering-design.md` section by section, quality pass on every changed file, with `file:line` evidence and C/I/M severities. Then ONE fix wave (TDD per fix) and a scoped re-review of the fixes.
- [ ] **Merge to local main:** `git checkout main && git merge --ff-only feat/director-steering` (the branch was cut from `main`'s tip; if `main` moved, rebase the branch first). Run the full suite on `main`. `git branch -d feat/director-steering`.
- [ ] **Memory:** update `project_prerelaunch_review_2026_09_18.md` (status) and add a memory file for this work (what changed for the director, the run kit, follow-ups); index in `MEMORY.md`.
- [ ] **Tell the director:** restart the server from `main` before the session; the run sheet is `docs/runbook/first-run-sheet.md`. The push is theirs.

---

## Ledger

Rulings made during execution (who, what, why) go in `.superpowers/sdd/2026-09-19-director-steering/ledger.md` (untracked), one line per ruling prefixed `Ruling:`; a reviewer's `needs-fixes` and the fix round that answered it are recorded there too.
