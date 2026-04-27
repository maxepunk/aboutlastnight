/**
 * buildResumePayload Unit Tests
 *
 * Tests the outline approval/rejection flow and outlineEdits routing
 */

const { buildResumePayload } = require('../../server.js');

describe('buildResumePayload — outlineEdits', () => {
  it('routes outlineEdits into stateUpdates.outline when outline:true', () => {
    const result = buildResumePayload({
      outline: true,
      outlineEdits: { lede: { hook: 'edited hook' } }
    });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toEqual({ lede: { hook: 'edited hook' } });
  });

  it('does not include outlineEdits when outline:false (rejection)', () => {
    const result = buildResumePayload({
      outline: false,
      outlineFeedback: 'needs more detail',
      outlineEdits: { lede: { hook: 'should not be applied' } }
    });
    expect(result.resume.approved).toBe(false);
    expect(result.stateUpdates.outline).toBeUndefined();
    expect(result.stateUpdates._outlineFeedback).toBe('needs more detail');
  });

  it('approves without edits when outlineEdits is omitted', () => {
    const result = buildResumePayload({ outline: true });
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toBeUndefined();
  });
});
