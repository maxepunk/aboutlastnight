/**
 * session-outcome unit tests (DEL-1)
 * The approve outcome must survive a dropped SSE: it is recorded in a
 * session-readable store and merged into GET /state responses.
 */
const {
  buildOutcomeRecord,
  recordSessionOutcome,
  getSessionOutcome,
  clearSessionOutcome,
  _resetOutcomeStore
} = require('../../lib/session-outcome');

beforeEach(() => _resetOutcomeStore());

describe('buildOutcomeRecord', () => {
  it('classifies an interrupted result as outcome "interrupted" with the next checkpoint phase', () => {
    const rec = buildOutcomeRecord({ interrupted: true, checkpoint: { type: 'outline' }, currentPhase: 3.25 });
    expect(rec.outcome).toBe('interrupted');
    expect(rec.currentPhase).toBe(3.25);
    expect(rec.checkpointType).toBe('outline');
    expect(typeof rec.recordedAt).toBe('string');
  });

  it('classifies a complete result as outcome "complete" and keeps the output path', () => {
    const rec = buildOutcomeRecord({ currentPhase: 'complete', outputPath: 'outputs/report-1221.html' });
    expect(rec.outcome).toBe('complete');
    expect(rec.outputPath).toBe('outputs/report-1221.html');
  });

  it('classifies an error result as outcome "failed" and preserves the error text', () => {
    const rec = buildOutcomeRecord({ currentPhase: 'error', error: 'Internal server error', details: 'Approval failed.' });
    expect(rec.outcome).toBe('failed');
    expect(rec.error).toBe('Internal server error');
    expect(rec.details).toBe('Approval failed.');
  });
});

describe('record/get/clear store', () => {
  it('returns null before anything is recorded', () => {
    expect(getSessionOutcome('1221')).toBeNull();
  });

  it('persists the last outcome and is readable without an SSE subscriber (last-write-wins)', () => {
    recordSessionOutcome('1221', buildOutcomeRecord({ currentPhase: 'error', error: 'boom' }));
    recordSessionOutcome('1221', buildOutcomeRecord({ currentPhase: 'complete', outputPath: 'outputs/x.html' }));
    const got = getSessionOutcome('1221');
    expect(got.outcome).toBe('complete');
    expect(got.outputPath).toBe('outputs/x.html');
  });

  it('clears a session outcome (used on rollback / fresh start)', () => {
    recordSessionOutcome('1221', buildOutcomeRecord({ currentPhase: 'complete' }));
    clearSessionOutcome('1221');
    expect(getSessionOutcome('1221')).toBeNull();
  });
});
