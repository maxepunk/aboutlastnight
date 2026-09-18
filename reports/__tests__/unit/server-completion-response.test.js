process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * buildCompletionResponse (H5)
 *
 * The one shaper for the terminal payload the /approve, /resume and /rollback
 * completions deliver over SSE. It must carry a BROWSER-OPENABLE `htmlUrl`
 * beside the absolute `outputPath`: the console's "View Report" button opened
 * the Windows filesystem path, which the browser resolved relatively into the
 * /console/* catch-all and answered with a second copy of the console.
 */
const path = require('path');
const { buildCompletionResponse } = require('../../server.js');
const { PHASES } = require('../../lib/workflow/state');

function completeResult(overrides = {}) {
  return {
    currentPhase: PHASES.COMPLETE,
    outputPath: path.join('C:', 'x', 'outputs', 'report-071826.html'),
    assembledHtml: '<html>',
    validationResults: {},
    photosCopied: 3,
    ...overrides
  };
}

describe('buildCompletionResponse', () => {
  it('adds a servable htmlUrl derived from the output filename', () => {
    const out = buildCompletionResponse(completeResult(), '071826');

    expect(out).toEqual({
      sessionId: '071826',
      currentPhase: 'complete',
      assembledHtml: '<html>',
      validationResults: {},
      outputPath: path.join('C:', 'x', 'outputs', 'report-071826.html'),
      photosCopied: 3,
      htmlUrl: '/outputs/report-071826.html'
    });
  });

  it('omits htmlUrl when the run completed without writing a file', () => {
    const out = buildCompletionResponse(completeResult({ outputPath: undefined }), '071826');

    expect(out).not.toHaveProperty('htmlUrl');
    expect(out.currentPhase).toBe('complete');
  });

  it('carries no completion fields when the run did not complete', () => {
    const out = buildCompletionResponse({ currentPhase: 2.35 }, '071826');

    expect(out).toEqual({ sessionId: '071826', currentPhase: 2.35 });
  });

  it('merges caller extras (previousPhase) ahead of currentPhase', () => {
    const out = buildCompletionResponse({ currentPhase: 3.25 }, '071826', { previousPhase: 2.35 });

    expect(out).toEqual({ sessionId: '071826', previousPhase: 2.35, currentPhase: 3.25 });
  });

  it('forwards a non-empty errors array', () => {
    const out = buildCompletionResponse(
      { currentPhase: 2.35, errors: [{ type: 'x' }] },
      '071826'
    );

    expect(out.errors).toEqual([{ type: 'x' }]);
  });

  it('omits errors when the array is empty', () => {
    const out = buildCompletionResponse({ currentPhase: 2.35, errors: [] }, '071826');

    expect(out).not.toHaveProperty('errors');
  });
});
