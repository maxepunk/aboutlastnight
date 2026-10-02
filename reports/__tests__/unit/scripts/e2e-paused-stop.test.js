/**
 * The harness approves a paused stop directly (task 3.11; the phase gate's replay
 * finding).
 *
 * POST /resume re-invokes the graph from START. A stop the automated budget
 * escalated keeps a not-ready verdict, so the replay re-runs that judge before it
 * pauses at the same stop again: at the gate, two harness approvals re-paid an Opus
 * evaluation each. With `--approve <stop>` on a thread already paused at that stop,
 * the harness reads the stop through GET /api/session/:id/checkpoint and posts the
 * approval without a /resume.
 *
 * Fix round 1: the decision ran only with --resume. Without it the harness POSTs
 * /start with force, which clears the thread, and the approve commands the harness
 * prints carry no --resume, so the command an operator copied from its output started
 * the session over. With --approve the harness now reads GET /checkpoint before any
 * /start, and never starts over: it approves the paused stop, resumes when --resume
 * asks for it, and otherwise says where the thread is and stops.
 *
 * The decision is scripts/lib/paused-stop.js (pausedStopToApprove, openingRequest);
 * the harness runs main() on require, so its wiring is pinned on the source, as
 * e2e-trace.test.js does.
 */
const fs = require('fs');
const path = require('path');
const { pausedStopToApprove, openingRequest } = require('../../../scripts/lib/paused-stop');

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

describe('openingRequest (fix round 1)', () => {
  const opening = (request) => openingRequest({ approveType: null, startsOver: false, checkpointRead: undefined, ...request });
  const REFUSAL = 'Without --resume the harness would start the session over, so it stops here.';

  it.each([
    ['without --resume', true],
    ['with --resume', false]
  ])('approves a thread paused at the --approve stop from the read, %s', (_case, startsOver) => {
    const read = pausedAt('outline');
    expect(opening({ approveType: 'outline', startsOver, checkpointRead: read })).toEqual({
      kind: 'approve',
      currentData: { sessionId: '092026', interrupted: true, checkpoint: read.data.checkpoint, currentPhase: 'outline-checkpoint' }
    });
  });

  it('without --approve, starts a new session without --resume and resumes with it, as before', () => {
    expect(opening({ startsOver: true })).toEqual({ kind: 'start' });
    expect(opening({ startsOver: false })).toEqual({ kind: 'resume' });
  });

  it('with --resume, resumes when the thread is not paused at the --approve stop, as before', () => {
    expect(opening({ approveType: 'article', startsOver: false, checkpointRead: pausedAt('outline') })).toEqual({ kind: 'resume' });
    expect(opening({ approveType: 'outline', startsOver: false, checkpointRead: pausedAt('outline'), stateOverrides: true })).toEqual({ kind: 'resume' });
  });

  it.each([
    ['paused at another stop', pausedAt('outline'), 'the thread is paused at outline'],
    ['not paused', pausedAt('article', { interrupted: false, checkpointType: null, checkpoint: null, currentPhase: 'complete' }), 'the thread is not paused (phase: complete)'],
    ['running', pausedAt('article', { inProgress: true }), 'a run holds the thread'],
    ['paused with no checkpoint payload', pausedAt('article', { checkpoint: null }), 'the thread is paused with no checkpoint payload'],
    ['not found', { status: 404, data: { sessionId: '092026', exists: false } }, 'the session has no thread'],
    ['a failed read', { status: 500, error: 'fetch failed' }, 'GET /checkpoint failed (500: fetch failed)'],
    ['no read at all', undefined, 'GET /checkpoint failed (no answer)']
  ])('without --resume, an --approve never starts the session over: it stops when the read says %s', (_case, read, where) => {
    expect(opening({ approveType: 'article', startsOver: true, checkpointRead: read })).toEqual({
      kind: 'stop',
      reason: `--approve article: ${where}. ${REFUSAL}`
    });
  });

  it('without --resume, stops on an --approve with state overrides, which only /resume applies', () => {
    expect(opening({ approveType: 'outline', startsOver: true, checkpointRead: pausedAt('outline'), stateOverrides: true })).toEqual({
      kind: 'stop',
      reason: `--approve outline: --override gives state overrides, which only /resume applies. ${REFUSAL}`
    });
  });
});

describe('e2e-walkthrough decides how to open its run before any /start or /resume', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'e2e-walkthrough.js'), 'utf8');
  const run = SRC.slice(SRC.indexOf('async function runWalkthrough('), SRC.indexOf('// Main checkpoint loop'));
  const decided = run.slice(run.indexOf('openingRequest({'));

  it('requires the decision from scripts/lib/paused-stop.js', () => {
    expect(SRC).toMatch(/const \{ openingRequest \} = require\('\.\/lib\/paused-stop'\);/);
  });

  it('reads GET /checkpoint whenever --approve names a stop, with or without --resume', () => {
    expect(run).toMatch(/checkpointRead: APPROVE_TYPE \? await apiGet\(`\/api\/session\/\$\{sessionId\}\/checkpoint`\) : undefined/);
  });

  it('starts over only where it did before: without --resume, on its own input', () => {
    expect(run).toMatch(/startsOver: Boolean\(inputData\.rawSessionInput && !RESUME_MODE\)/);
  });

  it('reads GET /checkpoint and decides before it posts /start or /resume', () => {
    const read = run.indexOf('apiGet(`/api/session/${sessionId}/checkpoint`)');
    const decide = run.indexOf('openingRequest({');
    const start = run.indexOf('/api/session/${sessionId}/start');
    const resume = run.indexOf('/api/session/${sessionId}/resume');
    [read, decide, start, resume].forEach((at) => expect(at).toBeGreaterThan(-1));
    expect(Math.max(read, decide)).toBeLessThan(Math.min(start, resume));
  });

  it('stops before either post, approves from the read, and posts /start only to start and /resume only to resume', () => {
    const marks = [
      "if (opening.kind === 'stop') {",
      "if (opening.kind === 'approve') {",
      "} else if (opening.kind === 'start') {",
      '// Use /resume for existing sessions'
    ].map((mark) => decided.indexOf(mark));
    marks.forEach((at) => expect(at).toBeGreaterThan(-1));
    expect(marks).toEqual([...marks].sort((a, b) => a - b));
    const [stopBranch, approveBranch, startBranch, resumeBranch] = marks.map((at, i) => decided.slice(at, marks[i + 1]));

    expect(stopBranch).toContain('opening.reason');
    expect(stopBranch).toMatch(/return;\s*\}\s*$/);
    expect(stopBranch).not.toMatch(/apiCall\(/);
    expect(approveBranch).toContain('currentData = opening.currentData;');
    expect(approveBranch).not.toMatch(/apiCall\(/);
    expect(startBranch).toContain('/api/session/${sessionId}/start');
    expect(startBranch).not.toContain('/api/session/${sessionId}/resume');
    expect(resumeBranch).toContain('/api/session/${sessionId}/resume');
    expect(resumeBranch).not.toContain('/api/session/${sessionId}/start');
  });

  it('prints approve commands an operator can copy: without --resume they reach the paused stop', () => {
    const printed = SRC.match(/--session \$\{sessionId\} --approve \$\{(?:nextCheckpointType|checkpointType)\} --step/g) || [];
    expect(printed).toHaveLength(2);
  });
});
