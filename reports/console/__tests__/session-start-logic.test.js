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
