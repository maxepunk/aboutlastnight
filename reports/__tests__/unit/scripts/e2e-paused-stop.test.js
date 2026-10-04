/**
 * The harness approves a paused stop directly (task 3.11; the phase gate's replay
 * finding).
 *
 * POST /resume re-invokes the graph from START. A stop the automated budget
 * escalated kept a not-ready verdict, so the replay re-ran that judge before it
 * paused at the same stop again: at the gate, two harness approvals re-paid an Opus
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
 * Since 3.9 the judge skips an escalated verdict on a replay, so the approval without a
 * /resume saves a replay, not a paid judge.
 *
 * Task 4c-fix (3.12 review minor 0): a rollback never starts the session over. Without
 * --resume, `--rollback <stop>` POSTed /rollback and then /start with force, which wiped
 * the thread the rollback had just rerun. A rollback names an existing thread, so after
 * it the harness continues that thread as --resume would.
 *
 * The decision is scripts/lib/paused-stop.js (pausedStopToApprove, openingRequest,
 * startsSessionOver); the harness runs main() on require, so its wiring is pinned on the
 * source, as e2e-trace.test.js does.
 */
const fs = require('fs');
const path = require('path');
const { pausedStopToApprove, openingRequest, startsSessionOver, keepThreadCommands } = require('../../../scripts/lib/paused-stop');

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

  // Final review (data-harness-docs[2]): an --override run with neither --resume nor
  // --rollback printed a warning that its overrides apply only to a run that continues a
  // thread, then POSTed /start with force, which clears the thread. It stops with that
  // warning instead.
  it('without --resume or --rollback, an --override never starts the session over: it stops with its warning', () => {
    expect(opening({ startsOver: true, stateOverrides: true })).toEqual({
      kind: 'stop',
      reason: '--override applies only with --rollback or --resume. Without either the harness would start the session over, so it stops here.'
    });
  });

  it('an --override with --resume, or after a rollback, resumes as before', () => {
    expect(opening({ startsOver: false, stateOverrides: true })).toEqual({ kind: 'resume' });
  });
});

/**
 * Final review (data-harness-docs[2]): the step-mode mismatch (--approve names a stop the
 * thread is not paused at) is reached only by a run with --resume or --rollback, one
 * that means to keep the thread. Its hint said "Use --step without --approve to view
 * current checkpoint", and `--session <id> --step` without --resume POSTs /start with
 * force, which clears the thread. Each command it prints now keeps the thread, and none
 * repeats --rollback, which would run the rollback again.
 */
describe('keepThreadCommands: the step-mode mismatch hint', () => {
  /** The harness's opening for a printed command, read from its flags as the harness reads them. */
  const openingFor = (command, read) => {
    const flags = command.split(/\s+/);
    const approveAt = flags.indexOf('--approve');
    const resume = flags.includes('--resume');
    return openingRequest({
      approveType: approveAt === -1 ? null : flags[approveAt + 1],
      // --session's files give the run its own input unless --resume reads none
      startsOver: startsSessionOver({ rawSessionInput: resume ? undefined : {}, resume, rollbackTo: null }),
      checkpointRead: approveAt === -1 ? undefined : read
    });
  };

  it('prints a command that views the stop the thread is paused at, and one that approves it', () => {
    expect(keepThreadCommands('092026', 'arc-selection')).toEqual([
      { label: 'To view the stop the thread is paused at, run:', command: 'node scripts/e2e-walkthrough.js --session 092026 --resume --step' },
      { label: 'To approve it, run:', command: 'node scripts/e2e-walkthrough.js --session 092026 --approve arc-selection --step' }
    ]);
  });

  it('every command keeps the thread: the harness resumes it or approves the paused stop from the read, and never starts over', () => {
    const read = pausedAt('arc-selection');
    const kinds = keepThreadCommands('092026', 'arc-selection').map(({ command }) => {
      expect(command).not.toMatch(/--rollback/);
      return openingFor(command, read).kind;
    });
    expect(kinds).toEqual(['resume', 'approve']);
  });
});

describe('startsSessionOver (task 4c-fix): a rollback never starts the session over', () => {
  it('starts over only on the run\'s own input, without --resume and without --rollback', () => {
    expect(startsSessionOver({ rawSessionInput: {}, resume: false, rollbackTo: null })).toBe(true);
    expect(startsSessionOver({ rawSessionInput: { photosPath: 'p' }, resume: false, rollbackTo: null })).toBe(true);
    expect(startsSessionOver({ rawSessionInput: undefined, resume: true, rollbackTo: null })).toBe(false);
    expect(startsSessionOver({ rawSessionInput: {}, resume: true, rollbackTo: null })).toBe(false);
    expect(startsSessionOver({ rawSessionInput: {}, resume: false, rollbackTo: 'photos' })).toBe(false);
    expect(startsSessionOver({ rawSessionInput: undefined, resume: true, rollbackTo: 'photos' })).toBe(false);
  });

  it.each([
    ['without --approve', null, undefined],
    ['with --approve on the stop the thread is paused at', 'outline', pausedAt('outline')],
    ['with --approve on another stop', 'article', pausedAt('outline')],
    ['with --approve on a thread a run holds', 'article', pausedAt('article', { inProgress: true })]
  ])('after a rollback without --resume, the harness continues the thread as --resume would: %s', (_case, approveType, checkpointRead) => {
    const afterRollback = openingRequest({
      approveType, checkpointRead, startsOver: startsSessionOver({ rawSessionInput: {}, resume: false, rollbackTo: 'photos' })
    });
    const withResume = openingRequest({
      approveType, checkpointRead, startsOver: startsSessionOver({ rawSessionInput: undefined, resume: true, rollbackTo: null })
    });
    expect(afterRollback).toEqual(withResume);
    expect(['start', 'stop']).not.toContain(afterRollback.kind);
  });
});

describe('e2e-walkthrough decides how to open its run before any /start or /resume', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'e2e-walkthrough.js'), 'utf8');
  const run = SRC.slice(SRC.indexOf('async function runWalkthrough('), SRC.indexOf('// Main checkpoint loop'));
  const decided = run.slice(run.indexOf('openingRequest({'));

  it('requires the decision from scripts/lib/paused-stop.js', () => {
    // Task 4.12a: the old-thread guard's decisions come from the same module.
    expect(SRC).toMatch(/const \{\s*openingRequest, startsSessionOver, keepThreadCommands, oldThreadStop, oldThreadOfResponse, oldThreadNotice\s*\} = require\('\.\/lib\/paused-stop'\);/);
  });

  // Final review (data-harness-docs[2]): the decision on --override is the opening's, so
  // the run stops with the warning before any post; no separate warning precedes a start.
  it('passes --override to the opening decision, and keeps no warning that then starts the session over', () => {
    expect(run).toMatch(/stateOverrides: Boolean\(stateOverrides\)/);
    expect(SRC).not.toContain('WARNING: --override only applies');
  });

  it('the step-mode mismatch prints the commands that keep the thread, and none that clears it', () => {
    const mismatch = SRC.slice(SRC.indexOf('does not match current checkpoint'), SRC.indexOf('// Approve this checkpoint'));
    expect(mismatch).toMatch(/keepThreadCommands\(sessionId, checkpointType\)/);
    expect(SRC).not.toContain('Use --step without --approve');
  });

  // Task 4.12a: a run that continues a thread reads it once before anything is posted
  // (firstRead, for the old-thread guard); --approve decides from that read, or from a second
  // read after a rollback, which moves the thread.
  it('reads GET /checkpoint whenever --approve names a stop, with or without --resume', () => {
    expect(run).toMatch(/checkpointRead: APPROVE_TYPE \? \(ROLLBACK_TO \? await apiGet\(`\/api\/session\/\$\{sessionId\}\/checkpoint`\) : firstRead\) : undefined/);
  });

  // Task 4c-fix: --rollback is part of the decision, so a rollback never starts over. Task
  // 4.12a: the decision is made once, before the first read, and the opening reads it.
  it('starts over only on its own input, without --resume and without --rollback', () => {
    expect(run).toMatch(/const startsOver = startsSessionOver\(\{ rawSessionInput: inputData\.rawSessionInput, resume: RESUME_MODE, rollbackTo: ROLLBACK_TO \}\);/);
    expect(run.slice(run.indexOf('openingRequest({'))).toMatch(/^openingRequest\(\{\n\s*approveType: APPROVE_TYPE,\n\s*startsOver,/);
  });

  it('rolls back before it decides how to open the run, and a failed rollback posts nothing more', () => {
    const rollback = run.indexOf('/api/session/${sessionId}/rollback');
    expect(rollback).toBeGreaterThan(-1);
    expect(rollback).toBeLessThan(run.indexOf('openingRequest({'));
    const failed = run.slice(rollback, run.indexOf('openingRequest({'));
    // Task 4.12a: a refusal of an old thread prints its message and the rollback instead.
    expect(failed).toMatch(/if \(status !== 200\) \{\n\s*if \(stoppedOnOldThread\(sessionId, \{ status, data \}\)\) return;\n\s*console\.error\(color\(`Rollback failed: [^\n]*\n\s*return;\n\s*\}/);
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

/**
 * Task 4.12a (the integrator's ruling 3): a thread started before the story meeting is refused
 * with 4.11's message (lib/old-thread.js), and GET /checkpoint carries its flag. The harness
 * prints that message and the rollback to the meeting, and posts nothing else to such a thread:
 * it reads where a thread stands before it posts anything to it, and a refusal that carries the
 * flag stops the run the same way.
 */
describe('4.12a: a thread from before the story meeting (ruling 3)', () => {
  const { oldThreadStop, oldThreadOfResponse, oldThreadNotice } = require('../../../scripts/lib/paused-stop');
  const MESSAGE = 'This session was started before the story meeting. Roll back to the story meeting to continue.';
  const FLAG = {
    message: MESSAGE,
    rollbackTo: 'arc-selection',
    rollbackPoints: ['paper-evidence-selection', 'await-roster', 'await-full-context', 'input-review', 'pre-curation', 'evidence-and-photos', 'arc-selection']
  };
  const oldRead = () => pausedAt('outline', { oldThread: FLAG, checkpoint: { type: 'outline', oldThread: FLAG } });

  it('prints the server\'s message and the rollback it names, as a command that keeps the thread', () => {
    expect(oldThreadNotice('092626', FLAG)).toEqual({
      message: MESSAGE,
      commands: [{ label: 'To roll back to arc-selection, run:', command: 'node scripts/e2e-walkthrough.js --session 092626 --rollback arc-selection --step' }]
    });
    const [{ command }] = oldThreadNotice('092626', FLAG).commands;
    const flags = command.split(/\s+/);
    expect(startsSessionOver({ rawSessionInput: {}, resume: flags.includes('--resume'), rollbackTo: flags[flags.indexOf('--rollback') + 1] })).toBe(false);
  });

  it('stops a run on a thread GET /checkpoint flags, unless the run rolls back to a point the flag opens', () => {
    expect(oldThreadStop({ sessionId: '092626', checkpointRead: oldRead(), rollbackTo: null })).toEqual(oldThreadNotice('092626', FLAG));
    expect(oldThreadStop({ sessionId: '092626', checkpointRead: oldRead(), rollbackTo: 'outline' })).toEqual(oldThreadNotice('092626', FLAG));
    expect(oldThreadStop({ sessionId: '092626', checkpointRead: oldRead(), rollbackTo: 'arc-selection' })).toBeNull();
    expect(oldThreadStop({ sessionId: '092626', checkpointRead: oldRead(), rollbackTo: 'input-review' })).toBeNull();
  });

  it.each([
    ['a thread the guard does not flag', pausedAt('outline', { oldThread: null })],
    ['no thread', { status: 404, data: { sessionId: '092626', exists: false } }],
    ['a failed read', { status: 500, error: 'fetch failed' }],
    ['no read at all', undefined]
  ])('lets the run go on for %s', (_name, read) => {
    expect(oldThreadStop({ sessionId: '092626', checkpointRead: read, rollbackTo: null })).toBeNull();
  });

  it('reads the flag off a refusal: the 409 that carries it, and no other answer', () => {
    expect(oldThreadOfResponse({ status: 409, data: { sessionId: '092626', error: MESSAGE, oldThread: FLAG } })).toEqual(FLAG);
    expect(oldThreadOfResponse({ status: 409, data: { sessionId: '092626', error: 'An operation is already in progress for this session.' } })).toBeNull();
    expect(oldThreadOfResponse({ status: 400, data: { error: 'No valid approval detected in request' } })).toBeNull();
    expect(oldThreadOfResponse({ status: 200, data: { status: 'processing' } })).toBeNull();
    expect(oldThreadOfResponse(undefined)).toBeNull();
  });

  describe('e2e-walkthrough posts nothing to an old thread', () => {
    const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'e2e-walkthrough.js'), 'utf8');
    const run = SRC.slice(SRC.indexOf('async function runWalkthrough('), SRC.indexOf('// Main checkpoint loop'));
    const body = (signature) => {
      const block = SRC.slice(SRC.indexOf(signature));
      return block.slice(0, block.indexOf('\n}\n'));
    };

    it('reads where a thread it continues stands before it posts anything, and stops on the flag', () => {
      const read = run.indexOf('apiGet(`/api/session/${sessionId}/checkpoint`)');
      const stop = run.indexOf('oldThreadStop({');
      const firstPost = Math.min(...['/rollback', '/start', '/resume'].map((route) => run.indexOf(`/api/session/\${sessionId}${route}`)));
      expect(read).toBeGreaterThan(-1);
      expect(stop).toBeGreaterThan(read);
      expect(stop).toBeLessThan(firstPost);
      expect(run).toMatch(/const firstRead = \(APPROVE_TYPE \|\| !startsOver\) \? await apiGet\(`\/api\/session\/\$\{sessionId\}\/checkpoint`\) : undefined;/);
    });

    it('stops on a refusal that carries the flag, after the rollback, the resume and both kinds of approval', () => {
      expect((SRC.match(/stoppedOnOldThread\(sessionId, \{ status, data \}\)/g) || []).length).toBe(4);
      expect(body('function stoppedOnOldThread(sessionId, response)')).toMatch(/oldThreadOfResponse\(response\)/);
    });
  });
});
