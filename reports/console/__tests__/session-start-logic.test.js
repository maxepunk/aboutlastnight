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
