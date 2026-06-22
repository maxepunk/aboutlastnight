/**
 * progress-emitter outcome event typing (SSE-1)
 */
const { outcomeEventType, ProgressEmitter } = require('../../lib/observability/progress-emitter');

describe('outcomeEventType', () => {
  it('maps an interrupted result to "complete" (payload-disambiguated by the client)', () => {
    expect(outcomeEventType({ interrupted: true, currentPhase: 3.25 })).toBe('complete');
  });
  it('maps a completed result to "complete"', () => {
    expect(outcomeEventType({ currentPhase: 'complete' })).toBe('complete');
  });
  it('maps an error result to the distinct "failed" type', () => {
    expect(outcomeEventType({ currentPhase: 'error', error: 'boom' })).toBe('failed');
  });
});

describe('emitComplete stamps the outcome-derived type', () => {
  it('emits type:"failed" for an error response', (done) => {
    const em = new ProgressEmitter();
    em.subscribe('1221', (data) => {
      expect(data.type).toBe('failed');
      expect(data.error).toBe('boom');
      done();
    });
    em.emitComplete('1221', { sessionId: '1221', currentPhase: 'error', error: 'boom' });
  });

  it('emits type:"complete" for an interrupted response', (done) => {
    const em = new ProgressEmitter();
    em.subscribe('1225', (data) => {
      expect(data.type).toBe('complete');
      expect(data.interrupted).toBe(true);
      done();
    });
    em.emitComplete('1225', { sessionId: '1225', interrupted: true, currentPhase: 3.25 });
  });
});
