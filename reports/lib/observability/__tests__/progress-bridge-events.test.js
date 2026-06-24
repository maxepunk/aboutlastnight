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
