const { resolveCompletePayload } = require('../../../scripts/lib/sse-complete');

describe('resolveCompletePayload', () => {
  it('returns the flat payload when there is no .result wrapper (current server shape)', () => {
    // progress-emitter.emitComplete spreads result flat: { ...result, type:'complete' }
    const flat = { type: 'complete', currentPhase: 'complete', outputPath: 'outputs/report-1221.html', interrupted: false };
    expect(resolveCompletePayload(flat)).toBe(flat);
  });

  it('prefers a nested .result when present (forward-compatible)', () => {
    const inner = { currentPhase: 'complete', outputPath: 'x.html' };
    const wrapped = { type: 'complete', result: inner };
    expect(resolveCompletePayload(wrapped)).toBe(inner);
  });

  it('returns the flat payload for an interrupted (checkpoint) completion', () => {
    const interrupted = { type: 'complete', interrupted: true, currentPhase: '2.35', checkpoint: { type: 'arc-selection' } };
    expect(resolveCompletePayload(interrupted)).toBe(interrupted);
  });

  it('throws on a null/undefined event (no silent undefined currentData)', () => {
    expect(() => resolveCompletePayload(null)).toThrow(/completion event/i);
    expect(() => resolveCompletePayload(undefined)).toThrow(/completion event/i);
  });

  it('throws on a non-object event (string/number) — exercises the typeof guard', () => {
    expect(() => resolveCompletePayload('complete')).toThrow(/completion event/i);
    expect(() => resolveCompletePayload(42)).toThrow(/completion event/i);
  });
});
