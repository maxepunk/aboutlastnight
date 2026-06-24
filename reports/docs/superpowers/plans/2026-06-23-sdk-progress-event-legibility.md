# SDK Progress-Event Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live SDK progress feed self-explanatory — every event surfaces its *actual payload* (retry reason/attempt/backoff, rate-limit status/utilization/which-limit/reset, init model+betas, hook name+outcome, error subtypes) in the on-screen text with severity-correct icons, instead of generic `type`/`subtype` words like "rate limit", "init", "api_retry", "hook_response".

**Architecture:** Two layers. (1) The SDK→progress *forward* in `lib/llm/client.js` currently flattens every message to `type`/`subtype`/`elapsed` and discards the payload — it will additionally pass through the meaningful fields per message kind. (2) The *formatter* `formatProgressEvent` in `lib/observability/progress-bridge.js` (the sole source of progress icons/strings) will render those fields into an informative `shortText`. Both layers stay pure-ish and unit-tested: the formatter directly, the forward via the existing `setMockQuery` SDK mock.

**Tech Stack:** Node, `@anthropic-ai/claude-agent-sdk` (message types in `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`), Jest (node env). No new dependencies.

## Global Constraints

- **No new dependencies.** Pure JS, existing modules only.
- **`lib/observability/progress-bridge.js` is the SOLE source of progress event icons/strings** (per `reports/CLAUDE.md`). All display wording lives in `formatProgressEvent` / `PROGRESS_ICONS` there.
- **Only `icon + shortText` reaches the console/SSE.** `createProgressFromTrace` builds `displayMessage = \`${icon} ${shortText}\`` and the SSE PROGRESS event sends only that (`progress-bridge.js` ~:382/:396). `detailText` is server-log-only. **Therefore every piece of info that must be visible on the console MUST be in `shortText`.**
- **Do not break existing tests:** `lib/observability/__tests__/progress-bridge-*.test.js`, `lib/observability/__tests__/constants.test.js`, `lib/llm/__tests__/client-contract.test.js`.
- **Emoji icons use the existing unicode-escape style** in `PROGRESS_ICONS` (e.g. `'⏱️'`), not raw glyphs.
- **The forward must not clobber existing fields** already attached in the `onProgress({...})` literal (`type`, `subtype`, `elapsed`, `messageCount`, `label`, `toolName`, `toolInput`, `error`, `assistantError`, `rateLimitInfo`, `contentPreview`). New fields use new names.
- **SDK fact (authoritative, from `sdk.d.ts`):** `api_retry`, `init`, `status`, `hook_started`/`hook_progress`/`hook_response`, `mirror_error`, `notification` all arrive as **`type: 'system'` with a distinct `subtype`**. `rate_limit_event` is its own top-level `type`. `result` is its own top-level `type` with `subtype` in `'success' | 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries'`.

---

## File Structure

- **`lib/llm/client.js`** (modify, ~:330 `onProgress({...})` literal) — the SDK→progress forward. Add conditional field pass-throughs carrying each message kind's payload. Hot path; changes are additive spreads only.
- **`lib/observability/progress-bridge.js`** (modify) — `PROGRESS_ICONS` map + `formatProgressEvent` switch. Add severity icons; render the new fields into `shortText`; add a `formatResetsIn` helper; convert `case 'system'` to a subtype sub-dispatch; fix `case 'result'` to not show success styling on error subtypes; route error-ish `default` types to the error icon.
- **`lib/observability/__tests__/progress-bridge-events.test.js`** (create) — pure unit tests for `formatProgressEvent` across every enriched event + `formatResetsIn`.
- **`lib/llm/__tests__/client-progress-forward.test.js`** (create) — contract tests that drive `sdkQueryImpl` with `setMockQuery` and capture `onProgress` to assert the new fields are forwarded.

---

## Task 1: Rate-limit events render by status, not a blanket "rate limit"

**Files:**
- Modify: `lib/observability/progress-bridge.js` (`PROGRESS_ICONS`, `formatProgressEvent` `case 'rate_limit_event'`, add `formatResetsIn` helper + export)
- Test: `lib/observability/__tests__/progress-bridge-events.test.js` (create)

**Interfaces:**
- Consumes: `msg.rateLimitInfo` (already forwarded today by client.js) = `{ status: 'allowed'|'allowed_warning'|'rejected', utilization?: number (0..1), rateLimitType?: string, resetsAt?: number }`.
- Produces: `formatResetsIn(resetsAt, now)` → `string` (`'resets in 42m'` / `''`); enriched `case 'rate_limit_event'` return.

- [ ] **Step 1: Write the failing tests.**

Create `lib/observability/__tests__/progress-bridge-events.test.js`. (Assert icons against the named `PROGRESS_ICONS.*` constants, never raw emoji literals — emoji with variation selectors like `⚠️` are fragile to compare as source text.)
```javascript
const { formatProgressEvent, formatResetsIn, PROGRESS_ICONS } = require('../progress-bridge');

describe('formatResetsIn', () => {
  const NOW = 1_000_000; // seconds-epoch reference for deterministic tests
  it('returns "" when resetsAt is missing', () => {
    expect(formatResetsIn(undefined, NOW * 1000)).toBe('');
  });
  it('formats a seconds-epoch resetsAt as minutes from now', () => {
    // resetsAt 42 minutes in the future, expressed in SECONDS
    expect(formatResetsIn(NOW + 42 * 60, NOW * 1000)).toBe('resets in 42m');
  });
  it('formats a millis-epoch resetsAt as minutes from now', () => {
    // same instant expressed in MILLIS (> 1e12 heuristic)
    expect(formatResetsIn((NOW + 42 * 60) * 1000, NOW * 1000)).toBe('resets in 42m');
  });
  it('clamps a past resetsAt to "resets in 0m"', () => {
    expect(formatResetsIn(NOW - 600, NOW * 1000)).toBe('resets in 0m');
  });
});

describe('formatProgressEvent — rate_limit_event', () => {
  it('renders benign "allowed" telemetry quietly with which-limit + utilization', () => {
    const out = formatProgressEvent({
      type: 'rate_limit_event',
      rateLimitInfo: { status: 'allowed', utilization: 0.2, rateLimitType: 'seven_day_opus' }
    });
    expect(out.shortText).toBe('quota ok · seven_day_opus 20%');
    expect(out.icon).toBe(PROGRESS_ICONS.quota_ok);
  });
  it('renders "rejected" as a blocked alarm with reset time in shortText', () => {
    const out = formatProgressEvent({
      type: 'rate_limit_event',
      rateLimitInfo: { status: 'rejected', utilization: 1, rateLimitType: 'seven_day_opus', resetsAt: 9_999_999_999 }
    });
    expect(out.icon).toBe(PROGRESS_ICONS.blocked);
    expect(out.shortText).toMatch(/^RATE LIMITED · seven_day_opus 100%/);
    expect(out.shortText).toMatch(/resets in \d+m$/);
  });
  it('renders "allowed_warning" as a warning', () => {
    const out = formatProgressEvent({
      type: 'rate_limit_event',
      rateLimitInfo: { status: 'allowed_warning', utilization: 0.87, rateLimitType: 'seven_day_opus' }
    });
    expect(out.icon).toBe(PROGRESS_ICONS.warn);
    expect(out.shortText).toBe('quota warning · seven_day_opus 87%');
  });
});
```

- [ ] **Step 2: Run the tests, expect failure.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js`
Expected: FAIL — `formatResetsIn` is not exported (`TypeError: formatResetsIn is not a function`); the `rate_limit_event` assertions fail because the current `shortText` is the literal `'rate limit'`.

- [ ] **Step 3: Add the new icons to `PROGRESS_ICONS`** (unicode-escape style, matching the existing entries — do NOT rewrite the existing entries to raw glyphs). The existing map's last line is `rate_limit_event: '⏱️' // stopwatch` with no trailing comma. The map uses unicode-escape literals (e.g. `'⚙️'`, surrogate pairs like `'💭'`), NOT raw glyphs — match that style exactly. Replace exactly that line + the closing brace:
```javascript
  rate_limit_event: '⏱️' // stopwatch
};
```
with (the existing last entry gains a trailing comma; new entries are unicode escapes; codepoints: bar-chart U+1F4CA, warning U+26A0, no-entry U+26D4, arrows U+1F504, bell U+1F514):
```javascript
  rate_limit_event: '⏱️', // stopwatch (legacy; unused after this change)
  quota_ok: '📊',   // bar chart — benign quota telemetry
  warn: '⚠️',       // warning sign
  blocked: '⛔',          // no entry — hard throttle / rejected
  retry: '🔄',      // counterclockwise arrows — api retry
  notification: '🔔' // bell
};
```

**ENCODING (do this exactly):** the glyphs above are shown for readability ONLY. **Read `progress-bridge.js` first** — every `PROGRESS_ICONS` entry is a unicode-escape JS string literal (BMP entries like the gear are `'\uXXXX'`; non-BMP emoji entries are surrogate pairs `'\uXXXX\uXXXX'`), NOT raw glyphs. You MUST write the new icons in that same escape style (a Global Constraint). The line you replace in the SOURCE is the escape form of the stopwatch (U+23F1 + variation-selector U+FE0F), **not a raw `⏱️` glyph** — so anchor your edit on the actual file text, not the glyph shown here. Encode each new icon from its codepoint to a JS `\u` escape: stopwatch `rate_limit_event` = U+23F1 U+FE0F; `quota_ok` bar-chart = U+1F4CA; `warn` warning = U+26A0 U+FE0F; `blocked` no-entry = U+26D4; `retry` arrows = U+1F504; `notification` bell = U+1F514. (Non-BMP codepoints ≥ U+10000 — the bar-chart, arrows, bell — become surrogate pairs; U+FE0F is appended as its own `️` where shown.) After writing, `node --check` and grep the map to confirm no raw emoji bytes were introduced.

- [ ] **Step 4: Add the `formatResetsIn` helper** directly above `function formatProgressEvent(msg) {`:
```javascript
/**
 * Format a rate-limit `resetsAt` epoch into a human "resets in Xm" string.
 * Accepts seconds- or millis-epoch (heuristic: > 1e12 ⇒ already millis).
 * @param {number|undefined} resetsAt - epoch from SDKRateLimitInfo.resetsAt
 * @param {number} [now] - millis-epoch reference (injectable for tests)
 * @returns {string} e.g. 'resets in 42m', or '' when resetsAt is absent
 */
function formatResetsIn(resetsAt, now = Date.now()) {
  if (resetsAt == null) return '';
  const ms = resetsAt > 1e12 ? resetsAt : resetsAt * 1000;
  const mins = Math.max(0, Math.round((ms - now) / 60000));
  return `resets in ${mins}m`;
}
```

- [ ] **Step 5: Replace the `case 'rate_limit_event'` block** in `formatProgressEvent` with:
```javascript
    case 'rate_limit_event': {
      const info = msg.rateLimitInfo || {};
      const status = info.status || 'unknown';
      const which = info.rateLimitType || '';
      const util = info.utilization != null ? `${Math.round(info.utilization * 100)}%` : '';
      const scope = [which, util].filter(Boolean).join(' ');
      // 'allowed' is benign telemetry the SDK emits on ~every call — keep it quiet.
      if (status === 'allowed') {
        return {
          icon: PROGRESS_ICONS.quota_ok,
          shortText: `quota ok${scope ? ' · ' + scope : ''}`,
          detailText: status
        };
      }
      // 'allowed_warning' | 'rejected' — actionable; put everything in shortText
      // (only shortText reaches the console).
      const isRejected = status === 'rejected';
      const resets = formatResetsIn(info.resetsAt);
      const segs = [isRejected ? 'RATE LIMITED' : 'quota warning', scope, resets].filter(Boolean);
      return {
        icon: isRejected ? PROGRESS_ICONS.blocked : PROGRESS_ICONS.warn,
        shortText: segs.join(' · '),
        detailText: `status=${status}`
      };
    }
```

- [ ] **Step 6: Export `formatResetsIn`.** In the `module.exports` block at the bottom of `progress-bridge.js`, add `formatResetsIn` to the list:
```javascript
module.exports = {
  createProgressFromTrace,
  formatProgressEvent,
  formatResetsIn,
  PROGRESS_ICONS,
  _resetDeltaBuffers
};
```

- [ ] **Step 7: Run the tests, expect pass.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js`
Expected: PASS (7 tests).

- [ ] **Step 8: Commit.**
```bash
git add lib/observability/progress-bridge.js lib/observability/__tests__/progress-bridge-events.test.js
git commit -m "feat(observability): render rate_limit_event by status (allowed/warning/rejected) not a blanket label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `api_retry` surfaces attempt / reason / HTTP status / backoff

**Files:**
- Modify: `lib/llm/client.js` (the `onProgress({...})` forward, ~:330) — add a `retry` field
- Modify: `lib/observability/progress-bridge.js` (`formatProgressEvent` `case 'system'` → subtype dispatch)
- Test: `lib/observability/__tests__/progress-bridge-events.test.js` (append), `lib/llm/__tests__/client-progress-forward.test.js` (create)

**Interfaces:**
- Consumes (formatter): `msg.subtype === 'api_retry'` with `msg.retry = { attempt, maxRetries, delayMs, errorStatus, reason }`.
- Produces (forward): on an SDK `{ type:'system', subtype:'api_retry', attempt, max_retries, retry_delay_ms, error_status, error }`, the forwarded event gains `retry: { attempt, maxRetries: max_retries, delayMs: retry_delay_ms, errorStatus: error_status, reason: error }`.

- [ ] **Step 1: Write the failing forward test.**

Create `lib/llm/__tests__/client-progress-forward.test.js`:
```javascript
const { setMockQuery, clearMockQuery } = require('@anthropic-ai/claude-agent-sdk');
const { sdkQueryImpl } = require('../client');

function makeAsyncIterable(messages) {
  return (async function* () { for (const m of messages) yield m; })();
}

async function captureForward(sdkMessages) {
  const events = [];
  setMockQuery(() => makeAsyncIterable([
    ...sdkMessages,
    { type: 'result', subtype: 'success', result: 'ok' }
  ]));
  await sdkQueryImpl({ prompt: 'x', model: 'haiku', onProgress: (e) => events.push(e) });
  return events;
}

describe('client onProgress forward — api_retry', () => {
  afterEach(() => clearMockQuery());

  it('forwards a structured retry field with attempt/reason/status/backoff', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 10, retry_delay_ms: 30000, error_status: 429, error: 'rate_limit' }
    ]);
    const retry = events.find(e => e.subtype === 'api_retry');
    expect(retry).toBeDefined();
    expect(retry.retry).toEqual({ attempt: 2, maxRetries: 10, delayMs: 30000, errorStatus: 429, reason: 'rate_limit' });
  });
});
```

- [ ] **Step 2: Run it, expect failure.**

Run: `npx jest lib/llm/__tests__/client-progress-forward.test.js`
Expected: FAIL — `retry` is `undefined` on the forwarded event (`expect(received).toEqual(expected)` mismatch).

- [ ] **Step 3: Add the `retry` pass-through to the forward.** In `lib/llm/client.js`, inside the `onProgress({ ... })` literal (the one starting `type: msg.type,`), add this spread immediately **before** `...(contentPreview && { contentPreview })`:
```javascript
          // api_retry carries the real story: which attempt, why (rate_limit/server_error/
          // overloaded...), the HTTP status, and the backoff. The bare 'api_retry' label
          // hides all of it. (SDKAPIRetryMessage: type:'system' subtype:'api_retry'.)
          ...(msg.subtype === 'api_retry' && {
            retry: {
              attempt: msg.attempt,
              maxRetries: msg.max_retries,
              delayMs: msg.retry_delay_ms,
              errorStatus: msg.error_status,
              reason: msg.error
            }
          }),
```

- [ ] **Step 4: Re-run the forward test, expect pass.**

Run: `npx jest lib/llm/__tests__/client-progress-forward.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing formatter test.** Append to `lib/observability/__tests__/progress-bridge-events.test.js`:
```javascript
describe('formatProgressEvent — system subtypes: api_retry', () => {
  it('renders attempt, reason, HTTP status, and backoff', () => {
    const out = formatProgressEvent({
      type: 'system', subtype: 'api_retry',
      retry: { attempt: 2, maxRetries: 10, delayMs: 30000, errorStatus: 429, reason: 'rate_limit' }
    });
    expect(out.icon).toBe(PROGRESS_ICONS.retry);
    expect(out.shortText).toBe('retry 2/10 · rate_limit (HTTP 429) · backoff 30s');
  });
  it('degrades gracefully when retry fields are partial', () => {
    const out = formatProgressEvent({ type: 'system', subtype: 'api_retry', retry: { reason: 'overloaded' } });
    expect(out.shortText).toBe('overloaded');
  });
  it('falls back to a plain label when retry payload is absent', () => {
    const out = formatProgressEvent({ type: 'system', subtype: 'api_retry' });
    expect(out.shortText).toBe('api retry');
  });
});
```

- [ ] **Step 6: Run it, expect failure.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js -t 'api_retry'`
Expected: FAIL — current `case 'system'` returns `{ icon: gear, shortText: 'api_retry' }`.

- [ ] **Step 7: Convert `case 'system'` to a subtype sub-dispatch and add the `api_retry` branch.** Replace the existing `case 'system'` block in `formatProgressEvent`:
```javascript
    case 'system':
      return {
        icon: PROGRESS_ICONS.system,
        shortText: msg.subtype || 'Initializing...',
        detailText: ''
      };
```
with:
```javascript
    case 'system': {
      switch (msg.subtype) {
        case 'api_retry': {
          const r = msg.retry || {};
          const segs = [];
          if (r.attempt != null) segs.push(`retry ${r.attempt}${r.maxRetries != null ? '/' + r.maxRetries : ''}`);
          if (r.reason) segs.push(r.errorStatus != null ? `${r.reason} (HTTP ${r.errorStatus})` : r.reason);
          if (r.delayMs != null) segs.push(`backoff ${Math.round(r.delayMs / 1000)}s`);
          return { icon: PROGRESS_ICONS.retry, shortText: segs.join(' · ') || 'api retry', detailText: '' };
        }
        default:
          return { icon: PROGRESS_ICONS.system, shortText: msg.subtype || 'Initializing...', detailText: '' };
      }
    }
```

- [ ] **Step 8: Run the formatter tests, expect pass.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js`
Expected: PASS (rate-limit tests from Task 1 + the 3 new api_retry tests).

- [ ] **Step 9: Commit.**
```bash
git add lib/llm/client.js lib/observability/progress-bridge.js lib/observability/__tests__/progress-bridge-events.test.js lib/llm/__tests__/client-progress-forward.test.js
git commit -m "feat(observability): api_retry surfaces attempt/reason/HTTP-status/backoff instead of a bare label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `init` confirms model/betas/tools/permission; `status` shows the real status

**Files:**
- Modify: `lib/llm/client.js` (forward — add `init` + `sdkStatus` pass-throughs)
- Modify: `lib/observability/progress-bridge.js` (`case 'system'` — add `init` + `status` branches)
- Test: both test files (append)

**Interfaces:**
- Consumes (formatter): `msg.subtype === 'init'` with `msg.init = { model, betas, toolCount, permissionMode }`; `msg.subtype === 'status'` with `msg.sdkStatus` (`'compacting'|'requesting'|null`).
- Produces (forward): on `{type:'system', subtype:'init', model, betas, tools, permissionMode}` → `init: { model, betas, toolCount: tools?.length, permissionMode }`; on `{type:'system', subtype:'status', status}` → `sdkStatus: status`.

- [ ] **Step 1: Write the failing forward tests.** Append to `lib/llm/__tests__/client-progress-forward.test.js`:
```javascript
describe('client onProgress forward — init & status', () => {
  afterEach(() => clearMockQuery());

  it('forwards init model/betas/toolCount/permissionMode', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'init', model: 'claude-opus-4-8', betas: ['context-1m-2025-08-07'], tools: ['Read', 'Write', 'Bash'], permissionMode: 'bypassPermissions' }
    ]);
    const init = events.find(e => e.subtype === 'init');
    expect(init.init).toEqual({ model: 'claude-opus-4-8', betas: ['context-1m-2025-08-07'], toolCount: 3, permissionMode: 'bypassPermissions' });
  });

  it('forwards the status enum as sdkStatus', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'status', status: 'requesting' }
    ]);
    expect(events.find(e => e.subtype === 'status').sdkStatus).toBe('requesting');
  });
});
```
(`captureForward` is already defined at the top of the file from Task 2.)

- [ ] **Step 2: Run, expect failure.**

Run: `npx jest lib/llm/__tests__/client-progress-forward.test.js -t 'init & status'`
Expected: FAIL — `init`/`sdkStatus` undefined.

- [ ] **Step 3: Add the forward pass-throughs.** In `lib/llm/client.js`, add immediately after the `api_retry` spread from Task 2:
```javascript
          // init confirms which model/betas/tools/permission actually engaged — invaluable
          // for "is the 1M-context beta really on?" debugging. (SDKSystemMessage subtype:'init'.)
          ...(msg.subtype === 'init' && {
            init: {
              model: msg.model,
              betas: msg.betas,
              toolCount: Array.isArray(msg.tools) ? msg.tools.length : undefined,
              permissionMode: msg.permissionMode
            }
          }),
          // status enum: 'compacting' | 'requesting' | null. (SDKStatusMessage subtype:'status'.)
          ...(msg.subtype === 'status' && { sdkStatus: msg.status }),
```

- [ ] **Step 4: Re-run, expect pass.**

Run: `npx jest lib/llm/__tests__/client-progress-forward.test.js -t 'init & status'`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing formatter tests.** Append to `lib/observability/__tests__/progress-bridge-events.test.js`:
```javascript
describe('formatProgressEvent — system subtypes: init & status', () => {
  it('renders init with model, betas, tool count, and permission mode', () => {
    const out = formatProgressEvent({
      type: 'system', subtype: 'init',
      init: { model: 'claude-opus-4-8', betas: ['context-1m-2025-08-07'], toolCount: 14, permissionMode: 'bypassPermissions' }
    });
    expect(out.shortText).toBe('init · model=claude-opus-4-8 · betas=[context-1m-2025-08-07] · 14 tools · bypassPermissions');
  });
  it('renders init minimally when fields are absent', () => {
    expect(formatProgressEvent({ type: 'system', subtype: 'init', init: {} }).shortText).toBe('init');
  });
  it('renders a non-null status', () => {
    expect(formatProgressEvent({ type: 'system', subtype: 'status', sdkStatus: 'compacting' }).shortText).toBe('status: compacting');
  });
  it('renders a bare "status" when the enum is null', () => {
    expect(formatProgressEvent({ type: 'system', subtype: 'status', sdkStatus: null }).shortText).toBe('status');
  });
});
```

- [ ] **Step 6: Run, expect failure.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js -t 'init & status'`
Expected: FAIL — both fall through to the `default` branch (`shortText: 'init'`/`'status'` with no detail).

- [ ] **Step 7: Add the `init` and `status` branches** to the `case 'system'` sub-switch (before the `default:` branch added in Task 2):
```javascript
        case 'init': {
          const i = msg.init || {};
          const segs = ['init'];
          if (i.model) segs.push(`model=${i.model}`);
          if (Array.isArray(i.betas) && i.betas.length) segs.push(`betas=[${i.betas.join(',')}]`);
          if (i.toolCount != null) segs.push(`${i.toolCount} tools`);
          if (i.permissionMode) segs.push(i.permissionMode);
          return { icon: PROGRESS_ICONS.system, shortText: segs.join(' · '), detailText: '' };
        }
        case 'status':
          return {
            icon: PROGRESS_ICONS.system,
            shortText: msg.sdkStatus ? `status: ${msg.sdkStatus}` : 'status',
            detailText: ''
          };
```

- [ ] **Step 8: Run the formatter tests, expect pass.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js`
Expected: PASS (all prior + 4 new).

- [ ] **Step 9: Commit.**
```bash
git add lib/llm/client.js lib/observability/progress-bridge.js lib/observability/__tests__/progress-bridge-events.test.js lib/llm/__tests__/client-progress-forward.test.js
git commit -m "feat(observability): init shows model/betas/tools/permission; status shows the real enum

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Hook events show name/event/outcome; failed hooks read as errors

**Files:**
- Modify: `lib/llm/client.js` (forward — add `hook` pass-through)
- Modify: `lib/observability/progress-bridge.js` (`case 'system'` — add hook branches)
- Test: both test files (append)

**Interfaces:**
- Consumes (formatter): `msg.subtype` ∈ `'hook_started'|'hook_progress'|'hook_response'` with `msg.hook = { name, event, outcome?, exitCode? }`.
- Produces (forward): on `{type:'system', subtype:'hook_*', hook_name, hook_event, outcome?, exit_code?}` → `hook: { name: hook_name, event: hook_event, outcome, exitCode: exit_code }`.

- [ ] **Step 1: Write the failing forward test.** Append to `lib/llm/__tests__/client-progress-forward.test.js`:
```javascript
describe('client onProgress forward — hooks', () => {
  afterEach(() => clearMockQuery());
  it('forwards hook name/event/outcome/exitCode', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'hook_response', hook_name: 'PreToolUse', hook_event: 'PreToolUse', outcome: 'error', exit_code: 1 }
    ]);
    expect(events.find(e => e.subtype === 'hook_response').hook).toEqual({ name: 'PreToolUse', event: 'PreToolUse', outcome: 'error', exitCode: 1 });
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx jest lib/llm/__tests__/client-progress-forward.test.js -t 'hooks'`
Expected: FAIL — `hook` undefined.

- [ ] **Step 3: Add the forward pass-through.** In `lib/llm/client.js`, after the `status` spread from Task 3:
```javascript
          // Hook lifecycle: surface which hook + (for responses) success/error/cancelled
          // and exit code, so a FAILING hook stops looking like benign 'hook_response'.
          ...((msg.subtype === 'hook_started' || msg.subtype === 'hook_progress' || msg.subtype === 'hook_response') && {
            hook: { name: msg.hook_name, event: msg.hook_event, outcome: msg.outcome, exitCode: msg.exit_code }
          }),
```

- [ ] **Step 4: Re-run, expect pass.**

Run: `npx jest lib/llm/__tests__/client-progress-forward.test.js -t 'hooks'`
Expected: PASS.

- [ ] **Step 5: Write the failing formatter tests.** Append to `lib/observability/__tests__/progress-bridge-events.test.js`:
```javascript
describe('formatProgressEvent — system subtypes: hooks', () => {
  it('renders a started hook with its name', () => {
    const out = formatProgressEvent({ type: 'system', subtype: 'hook_started', hook: { name: 'PreToolUse', event: 'PreToolUse' } });
    expect(out.icon).toBe(PROGRESS_ICONS.system);
    expect(out.shortText).toBe('hook PreToolUse');
  });
  it('renders a successful response with its outcome', () => {
    const out = formatProgressEvent({ type: 'system', subtype: 'hook_response', hook: { name: 'PreToolUse', outcome: 'success' } });
    expect(out.shortText).toBe('hook PreToolUse → success');
  });
  it('renders a FAILED hook response with the error icon + exit code', () => {
    const out = formatProgressEvent({ type: 'system', subtype: 'hook_response', hook: { name: 'PreToolUse', outcome: 'error', exitCode: 1 } });
    expect(out.icon).toBe(PROGRESS_ICONS.error);
    expect(out.shortText).toBe('hook PreToolUse → error (exit 1)');
  });
});
```

- [ ] **Step 6: Run, expect failure.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js -t 'hooks'`
Expected: FAIL — they hit the `default` branch (`shortText: 'hook_started'` etc.).

- [ ] **Step 7: Add the hook branches** to the `case 'system'` sub-switch (before `default:`):
```javascript
        case 'hook_started':
        case 'hook_progress':
        case 'hook_response': {
          const h = msg.hook || {};
          const name = h.name || h.event || '?';
          const failed = msg.subtype === 'hook_response' && h.outcome && h.outcome !== 'success';
          if (failed) {
            const exit = h.exitCode != null ? ` (exit ${h.exitCode})` : '';
            return { icon: PROGRESS_ICONS.error, shortText: `hook ${name} → ${h.outcome}${exit}`, detailText: '' };
          }
          const tail = msg.subtype === 'hook_response' && h.outcome ? ` → ${h.outcome}` : '';
          return { icon: PROGRESS_ICONS.system, shortText: `hook ${name}${tail}`, detailText: '' };
        }
```

- [ ] **Step 8: Run, expect pass.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js`
Expected: PASS (all prior + 3 hook tests).

- [ ] **Step 9: Commit.**
```bash
git add lib/llm/client.js lib/observability/progress-bridge.js lib/observability/__tests__/progress-bridge-events.test.js lib/llm/__tests__/client-progress-forward.test.js
git commit -m "feat(observability): hooks show name + outcome; a failed hook reads as an error

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Failures stop hiding — error results, mirror_error, notifications, and unknown error-types

**Files:**
- Modify: `lib/llm/client.js` (forward — add `mirrorError` + `notification` pass-throughs)
- Modify: `lib/observability/progress-bridge.js` (`case 'result'` fix; `case 'system'` add `mirror_error` + `notification`; `default` error routing)
- Test: both test files (append)

**Interfaces:**
- Consumes (formatter): `case 'result'` reads `msg.subtype`; `msg.subtype === 'mirror_error'` reads `msg.mirrorError`; `msg.subtype === 'notification'` reads `msg.notification = { text, priority }`; `default` inspects `msg.type` for `/error|fail/i`.
- Produces (forward): on `{type:'system', subtype:'mirror_error', error}` → `mirrorError: error`; on `{type:'system', subtype:'notification', text, priority}` → `notification: { text, priority }`.

- [ ] **Step 1: Write the failing forward test.** Append to `lib/llm/__tests__/client-progress-forward.test.js`:
```javascript
describe('client onProgress forward — mirror_error & notification', () => {
  afterEach(() => clearMockQuery());
  it('forwards mirror_error text and notification text/priority', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'mirror_error', error: 'disk write failed', key: { projectKey: 'p', sessionId: 's' } },
      { type: 'system', subtype: 'notification', key: 'k', text: 'context window 80% full', priority: 'high' }
    ]);
    expect(events.find(e => e.subtype === 'mirror_error').mirrorError).toBe('disk write failed');
    expect(events.find(e => e.subtype === 'notification').notification).toEqual({ text: 'context window 80% full', priority: 'high' });
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx jest lib/llm/__tests__/client-progress-forward.test.js -t 'mirror_error & notification'`
Expected: FAIL — fields undefined.

- [ ] **Step 3: Add the forward pass-throughs.** In `lib/llm/client.js`, after the `hook` spread from Task 4:
```javascript
          // mirror_error is a real error message (project mirror write failure); don't lose it.
          ...(msg.subtype === 'mirror_error' && { mirrorError: msg.error }),
          // Loop-side notifications carry user-facing text + priority.
          ...(msg.subtype === 'notification' && { notification: { text: msg.text, priority: msg.priority } }),
```

- [ ] **Step 4: Re-run, expect pass.**

Run: `npx jest lib/llm/__tests__/client-progress-forward.test.js -t 'mirror_error & notification'`
Expected: PASS.

- [ ] **Step 5: Write the failing formatter tests.** Append to `lib/observability/__tests__/progress-bridge-events.test.js`:
```javascript
describe('formatProgressEvent — failures stop hiding', () => {
  it('a success result is a green Complete', () => {
    const out = formatProgressEvent({ type: 'result', subtype: 'success' });
    expect(out.icon).toBe(PROGRESS_ICONS.result);
    expect(out.shortText).toBe('Complete');
  });
  it('an error-subtype result is NOT styled as success', () => {
    const out = formatProgressEvent({ type: 'result', subtype: 'error_max_budget_usd' });
    expect(out.icon).toBe(PROGRESS_ICONS.error);
    expect(out.shortText).toBe('failed: error_max_budget_usd');
  });
  it('mirror_error renders with the error icon and its message', () => {
    const out = formatProgressEvent({ type: 'system', subtype: 'mirror_error', mirrorError: 'disk write failed' });
    expect(out.icon).toBe(PROGRESS_ICONS.error);
    expect(out.shortText).toBe('mirror_error: disk write failed');
  });
  it('notification renders priority + text', () => {
    const out = formatProgressEvent({ type: 'system', subtype: 'notification', notification: { text: 'context window 80% full', priority: 'high' } });
    expect(out.shortText).toBe('[high] context window 80% full');
  });
  it('an unknown error-ish top-level type gets the error icon', () => {
    const out = formatProgressEvent({ type: 'some_error_event' });
    expect(out.icon).toBe(PROGRESS_ICONS.error);
    expect(out.shortText).toBe('some_error_event');
  });
  it('an unknown benign top-level type gets the neutral gear', () => {
    const out = formatProgressEvent({ type: 'keep_alive' });
    expect(out.icon).toBe(PROGRESS_ICONS.system);
    expect(out.shortText).toBe('keep_alive');
  });
});
```

- [ ] **Step 6: Run, expect failure.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js -t 'failures stop hiding'`
Expected: FAIL — `case 'result'` returns `✅ Complete` for the error subtype; `mirror_error`/`notification` hit the system `default`; unknown types hit the `default` with empty icon.

- [ ] **Step 7a: Fix `case 'result'`.** Replace the existing `case 'result'` block:
```javascript
    case 'result':
      return {
        icon: PROGRESS_ICONS.result,
        shortText: 'Complete',
        detailText: msg.subtype || ''
      };
```
with:
```javascript
    case 'result': {
      const sub = msg.subtype || 'success';
      const ok = sub === 'success';
      return {
        icon: ok ? PROGRESS_ICONS.result : PROGRESS_ICONS.error,
        shortText: ok ? 'Complete' : `failed: ${sub}`,
        detailText: ''
      };
    }
```

- [ ] **Step 7b: Add `mirror_error` + `notification` branches** to the `case 'system'` sub-switch (before `default:`):
```javascript
        case 'mirror_error':
          return { icon: PROGRESS_ICONS.error, shortText: `mirror_error: ${msg.mirrorError || 'unknown'}`, detailText: '' };
        case 'notification': {
          const n = msg.notification || {};
          return { icon: PROGRESS_ICONS.notification, shortText: `[${n.priority || 'info'}] ${n.text || ''}`.trim(), detailText: '' };
        }
```

- [ ] **Step 7c: Route error-ish unknown top-level types.** Replace the final `default:` of the OUTER `switch (msg.type)`:
```javascript
    default:
      return { icon: '', shortText: msg.type, detailText: '' };
```
with:
```javascript
    default:
      return {
        icon: /error|fail/i.test(msg.type || '') ? PROGRESS_ICONS.error : PROGRESS_ICONS.system,
        shortText: msg.type || 'event',
        detailText: ''
      };
```

- [ ] **Step 8: Run the formatter tests, expect pass.**

Run: `npx jest lib/observability/__tests__/progress-bridge-events.test.js`
Expected: PASS (all prior + 6 new).

- [ ] **Step 9: Commit.**
```bash
git add lib/llm/client.js lib/observability/progress-bridge.js lib/observability/__tests__/progress-bridge-events.test.js lib/llm/__tests__/client-progress-forward.test.js
git commit -m "feat(observability): error results/mirror_error/unknown-error-types stop reading as success/benign

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Regression sweep + live-log verification

**Files:**
- Test: whole suite (no source changes unless a regression surfaces)

- [ ] **Step 1: Run the observability + client suites.**

Run: `npx jest lib/observability/ lib/llm/`
Expected: green — the new `progress-bridge-events` + `client-progress-forward` suites pass, AND the pre-existing `progress-bridge-llm-delta`, `progress-bridge-undefined-result`, `constants`, `progress-emitter`, `client-contract`, `retry` suites are unchanged-green (the forward only ADDS fields; the formatter's untouched cases — `llm_start`/`llm_complete`/`assistant`/`user`/`tool_progress`/`error` — are unchanged).

- [ ] **Step 2: Run the full suite to confirm nothing else consumed the old strings.**

Run: `npx jest 2>&1 | tail -8`
Expected: `0 failed`. If any suite asserted the literal old text (e.g. a test expecting `shortText: 'rate limit'` or `'Complete'` on an error result), update that assertion to the new behavior and note it in the commit.

- [ ] **Step 3: Require-load smoke (catch a typo in the hot path).**

Run: `node -e "require('./lib/llm/client.js'); require('./lib/observability/progress-bridge.js'); console.log('load OK');"`
Expected: `load OK`.

- [ ] **Step 4: Manual live-log check (operator-run; no automation).**

Restart the server (`npm start`) and resume any session that makes an Opus call. In the server terminal (and the console feed) confirm the progress lines now read like:
`🔄 retry 2/10 · rate_limit (HTTP 429) · backoff 30s`, `📊 quota ok · seven_day_opus 20%`, `⚙️ init · model=claude-opus-4-8 · betas=[context-1m-2025-08-07] · …`, `⚙️ hook PreToolUse → success` — instead of bare `api_retry` / `rate limit` / `init` / `hook_response`. (This is the operator's confirmation that `shortText` reaches the console; there is no node-env harness for the live SSE stream.)

- [ ] **Step 5: No commit needed (verification only).** If Step 2 required a test fix, that commit already happened in its task; otherwise nothing to commit.

---

## Notes / out of scope

- **`detailText` still does not reach the console.** This plan deliberately routes all console-visible info through `shortText` (the only field on `displayMessage`). A future enhancement could add `detail` to the SSE PROGRESS event and render a two-tier line in `console/components/ProgressStream.js` — a separate frontend task, not needed for legibility.
- **Other `type:'system'` subtypes** the SDK *can* emit (`mcp_*`, `can_use_tool`, `elicitation`, `compact_boundary`, `local_command_output`, `auth_status`, …) are intentionally left on the enriched `default` (gear + subtype name). They don't appear on our streaming query path today (YAGNI); the `default` is now safe (neutral gear, or error icon if the name looks error-ish). Add a dedicated branch only when one actually shows up noisy.
- **`assistant`/`user`/`tool_progress`/`llm_*` cases are unchanged** — they already surface useful content (tool name + input, content preview, api timing/tokens).
