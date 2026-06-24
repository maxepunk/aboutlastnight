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
