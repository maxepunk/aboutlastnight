/**
 * The harness approves a paused stop directly (task 3.11; the phase gate's replay
 * finding).
 *
 * POST /resume re-invokes the graph from START. A stop the automated budget
 * escalated keeps a not-ready verdict, so the replay re-runs that judge before it
 * pauses at the same stop again: at the gate, two harness approvals re-paid an Opus
 * evaluation each. With `--approve <stop>` on a thread already paused at that stop,
 * the harness reads the stop through GET /api/session/:id/checkpoint and posts the
 * approval without a /resume. The decision is scripts/lib/paused-stop.js
 * pausedStopToApprove; the harness runs main() on require, so its wiring is pinned on
 * the source, as e2e-trace.test.js does.
 */
const fs = require('fs');
const path = require('path');
const { pausedStopToApprove } = require('../../../scripts/lib/paused-stop');

/** GET /checkpoint's answer for a thread paused at `type` (server.js, the checkpoint route). */
function pausedAt(type, extra = {}) {
  return {
    status: 200,
    data: {
      sessionId: '092026',
      currentPhase: 'outline-checkpoint',
      interrupted: true,
      checkpointType: type,
      checkpoint: { type, outline: { lede: {} }, lastEvaluation: { phase: 'outline', ready: false } },
      theme: 'journalist',
      inProgress: false,
      lastOutcome: null,
      ...extra
    }
  };
}

describe('pausedStopToApprove', () => {
  it('approves the stop the thread is paused at, in the shape a /resume completion carries', () => {
    const read = pausedAt('outline');
    expect(pausedStopToApprove('outline', read)).toEqual({
      sessionId: '092026',
      interrupted: true,
      checkpoint: read.data.checkpoint,
      currentPhase: 'outline-checkpoint'
    });
  });

  it('resumes when --approve names no stop', () => {
    expect(pausedStopToApprove(null, pausedAt('outline'))).toBeNull();
    expect(pausedStopToApprove('', pausedAt('outline'))).toBeNull();
  });

  it('resumes when the thread is paused at another stop', () => {
    expect(pausedStopToApprove('article', pausedAt('outline'))).toBeNull();
  });

  it.each([
    ['not paused (a complete thread)', pausedAt('outline', { interrupted: false, checkpointType: null, checkpoint: null, currentPhase: 'complete' })],
    ['running (the session is locked)', pausedAt('outline', { inProgress: true })],
    ['paused with no checkpoint payload', pausedAt('outline', { checkpoint: null })],
    ['not found', { status: 404, data: { sessionId: '092026', exists: false } }],
    ['a failed read', { status: 500, error: 'fetch failed' }],
    ['no read at all', undefined]
  ])('resumes when the read says %s', (_name, read) => {
    expect(pausedStopToApprove('outline', read)).toBeNull();
  });

  it('resumes when --override gave state overrides, which only /resume applies', () => {
    expect(pausedStopToApprove('outline', pausedAt('outline'), { stateOverrides: true })).toBeNull();
    expect(pausedStopToApprove('outline', pausedAt('outline'), { stateOverrides: false })).not.toBeNull();
  });
});

describe('e2e-walkthrough reads a paused stop before it resumes', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'e2e-walkthrough.js'), 'utf8');
  const run = SRC.slice(SRC.indexOf('async function runWalkthrough('), SRC.indexOf('// Main checkpoint loop'));

  it('requires the decision from scripts/lib/paused-stop.js', () => {
    expect(SRC).toMatch(/const \{ pausedStopToApprove \} = require\('\.\/lib\/paused-stop'\);/);
  });

  it('with --approve, reads GET /checkpoint and asks the decision before any /resume', () => {
    const read = run.indexOf('apiGet(`/api/session/${sessionId}/checkpoint`)');
    const decide = run.indexOf('pausedStopToApprove(APPROVE_TYPE, ');
    const resume = run.indexOf('/api/session/${sessionId}/resume');
    expect(read).toBeGreaterThan(-1);
    expect(decide).toBeGreaterThan(-1);
    expect(resume).toBeGreaterThan(-1);
    expect(read).toBeLessThan(resume);
    expect(decide).toBeLessThan(resume);
  });

  it('posts /resume only when the decision returns no paused stop', () => {
    const branch = run.slice(run.indexOf('pausedStopToApprove(APPROVE_TYPE, '));
    expect(branch).toMatch(/if \(pausedStop\) \{\s*\n[^]*?currentData = pausedStop;\s*\n\s*\} else \{[^]*?\/api\/session\/\$\{sessionId\}\/resume/);
  });
});
