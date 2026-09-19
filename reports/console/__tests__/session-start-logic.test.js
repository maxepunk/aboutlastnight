/**
 * session-start-logic — the two decisions the Session screen makes before it
 * spends anything (B9 resume-on-complete, H2 theme, H8 in-flight run).
 *
 * Node-env unit tests against the dual-export module, per reports/CLAUDE.md
 * ("Console has NO DOM/React test harness"): the classifier and the validator
 * live here so they can be pinned; SessionStart.js is a thin consumer.
 */
const fs = require('fs');
const path = require('path');

const {
  isValidSessionId,
  classifyCheckpointResponse,
  SESSION_ID_PATTERN
} = require('../session-start-logic');

describe('isValidSessionId', () => {
  it('accepts six digits (MMDDYY) and seven (plus a session number)', () => {
    expect(isValidSessionId('091826')).toBe(true);
    expect(isValidSessionId('0918262')).toBe(true);
  });

  it('rejects the legacy MMDD form that split session 071126 across two directories', () => {
    expect(isValidSessionId('1221')).toBe(false);
    expect(isValidSessionId('0711')).toBe(false);
  });

  it('rejects a free-form label', () => {
    expect(isValidSessionId('march-15')).toBe(false);
  });

  it('rejects too-short, too-long and non-string input', () => {
    expect(isValidSessionId('09182')).toBe(false);
    expect(isValidSessionId('09182622')).toBe(false);
    expect(isValidSessionId('')).toBe(false);
    expect(isValidSessionId(null)).toBe(false);
    expect(isValidSessionId(undefined)).toBe(false);
    expect(isValidSessionId(91826)).toBe(false);
  });

  it('accepts a free-form label only when the server allows nonstandard ids', () => {
    expect(isValidSessionId('march-15', true)).toBe(true);
    expect(isValidSessionId('march-15', false)).toBe(false);
    // Only the boolean true opts in — a truthy string must not (it is the shape the
    // env var arrives in, and the server compares it to the string 'true' itself).
    expect(isValidSessionId('march-15', 'true')).toBe(false);
  });

  it('still rejects an empty or over-long id in nonstandard mode', () => {
    expect(isValidSessionId('', true)).toBe(false);
    expect(isValidSessionId('a'.repeat(31), true)).toBe(false);
    expect(isValidSessionId('a'.repeat(30), true)).toBe(true);
  });

  it('rejects characters that would escape data/<id>/ even in nonstandard mode', () => {
    expect(isValidSessionId('../etc', true)).toBe(false);
    expect(isValidSessionId('has space', true)).toBe(false);
  });
});

describe('SESSION_ID_PATTERN agrees with the server predicate', () => {
  // The console is a browser script and cannot require server.js, so the regex is
  // duplicated by necessity. This test is the join: edit either side and it fails.
  it('is character-for-character the pattern in server.js isAllowedSessionId', () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
    const match = serverSrc.match(/const SESSION_ID_PATTERN = (\/.*?\/);/);
    expect(match).not.toBeNull();
    expect(String(SESSION_ID_PATTERN)).toBe(match[1]);
  });
});

describe('classifyCheckpointResponse', () => {
  it('reports not-found for an error body', () => {
    expect(classifyCheckpointResponse({ error: 'x' })).toBe('not-found');
  });

  it('reports not-found for a missing or empty response', () => {
    expect(classifyCheckpointResponse(null)).toBe('not-found');
    expect(classifyCheckpointResponse(undefined)).toBe('not-found');
    expect(classifyCheckpointResponse({})).toBe('not-found');
  });

  it('reports not-found for a thread with no phase (nothing has run)', () => {
    expect(classifyCheckpointResponse({ interrupted: false })).toBe('not-found');
  });

  it('reports at-checkpoint for a paused thread carrying its payload', () => {
    expect(classifyCheckpointResponse({ interrupted: true, checkpoint: { type: 'outline' } }))
      .toBe('at-checkpoint');
  });

  it('reports in-progress for a running thread', () => {
    expect(classifyCheckpointResponse({ interrupted: false, inProgress: true, currentPhase: '2.1' }))
      .toBe('in-progress');
  });

  it('reports complete for a finished thread — the B9 case that must never resume', () => {
    expect(classifyCheckpointResponse({ interrupted: false, currentPhase: 'complete' }))
      .toBe('complete');
  });

  it('reports resumable for a stopped mid-pipeline thread', () => {
    expect(classifyCheckpointResponse({ interrupted: false, currentPhase: '2.1' }))
      .toBe('resumable');
  });

  it('prefers in-progress over complete when a forced re-run is already going', () => {
    expect(classifyCheckpointResponse({ interrupted: false, inProgress: true, currentPhase: 'complete' }))
      .toBe('in-progress');
  });

  it('does not treat a payloadless interrupt as at-checkpoint', () => {
    // /checkpoint sends checkpoint:null when it cannot build a payload; loading that
    // rendered an empty checkpoint screen with live Approve buttons.
    expect(classifyCheckpointResponse({ interrupted: true, checkpoint: null, currentPhase: '1.8' }))
      .toBe('resumable');
  });
});

describe('buildReportLinks', () => {
  // The B9 payoff screen: a complete session is offered its report instead of a
  // Resume that would re-run the pipeline. The conventional path is always offered;
  // a recorded outcome naming a DIFFERENT file is offered alongside it, because
  // B1 (parseRawInput overwriting the sessionId channel) published session 071126's
  // report as report-0711.html and that mismatch is exactly what the director needs
  // to see rather than a 404.
  const { buildReportLinks } = require('../session-start-logic');

  it('offers the conventional report path when there is no recorded outcome', () => {
    expect(buildReportLinks('091826', null)).toEqual(['/outputs/report-091826.html']);
    expect(buildReportLinks('091826', undefined)).toEqual(['/outputs/report-091826.html']);
  });

  it('adds nothing when the recorded outcome names the same file', () => {
    expect(buildReportLinks('091826', {
      outcome: 'complete',
      htmlUrl: '/outputs/report-091826.html'
    })).toEqual(['/outputs/report-091826.html']);
  });

  it('adds the recorded htmlUrl when it names a different file', () => {
    expect(buildReportLinks('071126', {
      outcome: 'complete',
      htmlUrl: '/outputs/report-0711.html'
    })).toEqual(['/outputs/report-071126.html', '/outputs/report-0711.html']);
  });

  it('derives the link from outputPath when the record carries no htmlUrl', () => {
    // buildOutcomeRecord stores outputPath (absolute, Windows) and not htmlUrl.
    expect(buildReportLinks('071126', {
      outcome: 'complete',
      outputPath: 'C:\\Users\\dir\\reports\\outputs\\report-0711.html'
    })).toEqual(['/outputs/report-071126.html', '/outputs/report-0711.html']);
    expect(buildReportLinks('071126', {
      outcome: 'complete',
      outputPath: '/home/x/reports/outputs/report-0711.html'
    })).toEqual(['/outputs/report-071126.html', '/outputs/report-0711.html']);
  });

  it('ignores an outcome that is not a completion', () => {
    expect(buildReportLinks('091826', { outcome: 'failed', outputPath: '/x/report-other.html' }))
      .toEqual(['/outputs/report-091826.html']);
    expect(buildReportLinks('091826', { outcome: 'interrupted' }))
      .toEqual(['/outputs/report-091826.html']);
  });

  it('returns nothing without a session id', () => {
    expect(buildReportLinks('', null)).toEqual([]);
    expect(buildReportLinks(null, null)).toEqual([]);
  });
});

describe('decideAttachFallback', () => {
  // Review fix 2: attach sets processing:true and rides a stream that may never
  // speak again. progressEmitter fires `complete` ONCE, to whoever is connected at
  // that moment, so a run that ended between the /checkpoint read (or the lock 409)
  // and the handshake leaves the console spinning with no Retry — that only appears
  // while llmActivity.phase === 'failed' — and no timeout. Worse, `inProgress` is
  // only isSessionLocked(id), and api-background-runner.js:58 documents a stuck lock
  // as a real failure mode, so the wait can be permanent. This is the decision the
  // 20-second watchdog makes after re-reading GET /checkpoint.
  const { decideAttachFallback } = require('../session-start-logic');

  it('loads the checkpoint when the run has paused', () => {
    expect(decideAttachFallback({ interrupted: true, checkpoint: { type: 'outline' } }))
      .toBe('load-checkpoint');
  });

  it('shows the completion when the run finished unheard', () => {
    expect(decideAttachFallback({ interrupted: false, currentPhase: 'complete' }))
      .toBe('complete');
  });

  it('keeps waiting while the session is still locked', () => {
    expect(decideAttachFallback({ interrupted: false, inProgress: true, currentPhase: '2.1' }))
      .toBe('keep-waiting');
  });

  it('keeps waiting even at phase complete while the lock is still held', () => {
    // A forced re-run of a complete thread: still working, do not steal the screen.
    expect(decideAttachFallback({ interrupted: false, inProgress: true, currentPhase: 'complete' }))
      .toBe('keep-waiting');
  });

  it('reports stranded when the run stopped mid-pipeline and left no checkpoint', () => {
    // Nothing holds the lock, nothing is interrupted, nothing completed: the graph
    // died or the lock leaked. This is the permanent hang the watchdog exists for.
    expect(decideAttachFallback({ interrupted: false, currentPhase: '2.1' }))
      .toBe('stranded');
  });

  it('reports stranded for a vanished session or an error body', () => {
    expect(decideAttachFallback({ error: 'Session not found' })).toBe('stranded');
    expect(decideAttachFallback({ interrupted: false })).toBe('stranded');
    expect(decideAttachFallback(null)).toBe('stranded');
  });

  it('reports stranded for an interrupt with no payload to render', () => {
    expect(decideAttachFallback({ interrupted: true, checkpoint: null, currentPhase: '1.8' }))
      .toBe('stranded');
  });
});

describe('completedResultFrom', () => {
  // Task 2 review finding 3 (ruled): a completed session has NO checkpoint, so
  // neither rollback opener (PipelineProgress, ProgressStream) could be reached
  // for it - yet re-running the article or outline of a finished session with a
  // note is a real need, and the baseline shows sessions republished after
  // edits. This builds the completedResult that lets App render the stepper
  // above the completion view, from the GET /checkpoint response alone (there is
  // no SSE completion payload on this path).
  const { completedResultFrom } = require('../session-start-logic');

  it('builds the completion result from the response and its recorded outcome', () => {
    expect(completedResultFrom({
      sessionId: '091826',
      currentPhase: 'complete',
      interrupted: false,
      lastOutcome: {
        outcome: 'complete',
        outputPath: 'C:\\Users\\dir\\reports\\outputs\\report-091826.html',
        photosCopied: 5,
        recordedAt: '2026-09-18T12:00:00Z'
      }
    })).toEqual({
      outcome: 'complete',
      outputPath: 'C:\\Users\\dir\\reports\\outputs\\report-091826.html',
      photosCopied: 5,
      recordedAt: '2026-09-18T12:00:00Z',
      sessionId: '091826',
      currentPhase: 'complete',
      htmlUrl: '/outputs/report-091826.html'
    });
  });

  it('prefers the file the run actually wrote when it differs from the convention (B1)', () => {
    // 071126 published as report-0711.html; the director must be sent to the
    // file that exists, not to a 404 on the conventional path.
    const result = completedResultFrom({
      sessionId: '071126',
      lastOutcome: { outcome: 'complete', htmlUrl: '/outputs/report-0711.html' }
    });
    expect(result.htmlUrl).toBe('/outputs/report-0711.html');
  });

  it('still produces a servable link with no recorded outcome (in-memory, cleared by a restart)', () => {
    expect(completedResultFrom({ sessionId: '091826', lastOutcome: null })).toEqual({
      sessionId: '091826',
      currentPhase: 'complete',
      htmlUrl: '/outputs/report-091826.html'
    });
  });

  it('accepts a fallback session id when the response carries none', () => {
    expect(completedResultFrom({ lastOutcome: null }, '091826').htmlUrl)
      .toBe('/outputs/report-091826.html');
  });

  it('never lets a recorded currentPhase or sessionId override the derived ones', () => {
    const result = completedResultFrom({
      sessionId: '091826',
      lastOutcome: { outcome: 'complete', currentPhase: 'error', sessionId: 'wrong' }
    });
    expect(result.currentPhase).toBe('complete');
    expect(result.sessionId).toBe('091826');
  });

  it('returns null without a session id (nothing to link to)', () => {
    expect(completedResultFrom({ lastOutcome: null })).toBeNull();
    expect(completedResultFrom(null)).toBeNull();
  });
});

describe('startFreshDecision', () => {
  // C1: Start Fresh POSTed /start unconditionally, and /start seeded its state from
  // buildRollbackState('input-review') — which preserves everything upstream of the
  // parse plus the photo channels. So the most likely action after a mistake kept
  // the old photos, roster and parse and paused once on them. The route refuses an
  // existing thread now (409 unless force:true); this is the screen's half, so the
  // director is asked before anything is discarded rather than after.
  const { startFreshDecision } = require('../session-start-logic');

  it('goes straight ahead when nothing has ever run under this id', () => {
    expect(startFreshDecision({ error: 'Session not found' })).toBe('go');
    expect(startFreshDecision({ interrupted: false })).toBe('go');
    expect(startFreshDecision(null)).toBe('go');
    expect(startFreshDecision({})).toBe('go');
  });

  it('asks first when the id already has state, whatever kind', () => {
    expect(startFreshDecision({ interrupted: true, checkpoint: { type: 'outline' } })).toBe('confirm');
    expect(startFreshDecision({ interrupted: false, currentPhase: '2.1' })).toBe('confirm');
    expect(startFreshDecision({ interrupted: false, currentPhase: 'complete' })).toBe('confirm');
  });

  it('refuses outright while a run holds the session lock', () => {
    // A start here would 409 on the lock anyway, and re-seeding state under a
    // running graph is not something to offer a confirm button for.
    expect(startFreshDecision({ interrupted: false, inProgress: true, currentPhase: '2.1' }))
      .toBe('not-allowed');
    expect(startFreshDecision({ interrupted: false, inProgress: true, currentPhase: 'complete' }))
      .toBe('not-allowed');
  });
});
