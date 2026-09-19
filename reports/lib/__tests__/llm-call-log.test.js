/**
 * lib/observability/llm-call-log.js — per-call prompt/response log (spec 2026-09-19 §3).
 * Writes under <root>/<sessionId>/llm-log; the root is injected here so nothing lands in data/.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../observability/llm-call-log');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-llm-log-'));
  log._resetForTests();
  log.setLogRoot(root);
});
afterEach(() => {
  log._resetForTests();
  jest.restoreAllMocks();
});

const start = (callId, extra = {}) => ({
  type: 'llm_start', callId, model: 'haiku', label: 'Photo 1',
  prompt: 'USER', systemPrompt: 'SYS', jsonSchema: { type: 'object' }, ...extra
});
const complete = (callId) => ({
  type: 'llm_complete', callId, elapsed: 1.5, result: { ok: true }, jsonSchema: { type: 'object' },
  channel: 'structured_output', stopReason: 'end_turn', durationApiMs: 1200, numTurns: 1,
  usage: { input_tokens: 5, output_tokens: 10 }
});
const dirOf = (s) => path.join(root, s, 'llm-log');
const jsonFiles = (s) => fs.readdirSync(dirOf(s)).filter((f) => f.endsWith('.json')).sort();
const readJson = (s, f) => JSON.parse(fs.readFileSync(path.join(dirOf(s), f), 'utf8'));

test('llm_start writes the prompt file immediately, named by time, context and callId', () => {
  log.recordLlmEvent('S1', 'analyzePhotos', start('11111111-2222-4333-8444-555555555555'));
  const files = jsonFiles('S1');
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^\d{8}-\d{6}-analyzePhotos-11111111\.json$/);
  const rec = readJson('S1', files[0]);
  expect(rec).toMatchObject({
    callId: '11111111-2222-4333-8444-555555555555', context: 'analyzePhotos', label: 'Photo 1', model: 'haiku',
    prompt: { system: 'SYS', user: 'USER', schema: { type: 'object' } }
  });
  expect(rec.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(rec.response).toBeUndefined();
  expect(fs.existsSync(path.join(dirOf('S1'), 'index.jsonl'))).toBe(false);
});

test('llm_complete rewrites the same file with the response and appends one index line', () => {
  log.recordLlmEvent('S1', 'analyzePhotos', start('aaaaaaaa-2222-4333-8444-555555555555'));
  log.recordLlmEvent('S1', 'analyzePhotos', complete('aaaaaaaa-2222-4333-8444-555555555555'));
  const files = jsonFiles('S1');
  expect(files).toHaveLength(1);
  const rec = readJson('S1', files[0]);
  expect(rec.prompt.user).toBe('USER');
  expect(rec.response).toEqual({ full: { ok: true }, length: JSON.stringify({ ok: true }).length, structured: true });
  expect(rec.diagnostics).toMatchObject({ channel: 'structured_output', stopReason: 'end_turn', durationApiMs: 1200, usage: { output_tokens: 10 } });
  expect(rec.outcome).toBe('complete');
  expect(rec.elapsed).toBe(1.5);
  const index = fs.readFileSync(path.join(dirOf('S1'), 'index.jsonl'), 'utf8').trim().split('\n');
  expect(index).toHaveLength(1);
  expect(JSON.parse(index[0])).toMatchObject({ callId: 'aaaaaaaa-2222-4333-8444-555555555555', context: 'analyzePhotos', model: 'haiku', elapsed: 1.5, channel: 'structured_output', file: files[0], outcome: 'complete' });
});

test('llm_error rewrites the file with the error and indexes it as an error', () => {
  log.recordLlmEvent('S1', 'enrich', start('bbbbbbbb-2222-4333-8444-555555555555'));
  log.recordLlmEvent('S1', 'enrich', { type: 'llm_error', callId: 'bbbbbbbb-2222-4333-8444-555555555555', elapsed: 9, error: 'boom', errorName: 'StructuredOutputExtractionError', schemaErrors: [{ path: '/x' }], stopReason: 'end_turn' });
  const rec = readJson('S1', jsonFiles('S1')[0]);
  expect(rec.error).toEqual({ message: 'boom', errorName: 'StructuredOutputExtractionError', schemaErrors: [{ path: '/x' }] });
  expect(rec.outcome).toBe('error');
  expect(rec.response).toBeUndefined();
});

test('two concurrent calls with the same context stay separate by callId', () => {
  log.recordLlmEvent('S1', 'analyzePhotos', start('cccccccc-2222-4333-8444-555555555555', { label: 'Photo 1' }));
  log.recordLlmEvent('S1', 'analyzePhotos', start('dddddddd-2222-4333-8444-555555555555', { label: 'Photo 2' }));
  log.recordLlmEvent('S1', 'analyzePhotos', complete('dddddddd-2222-4333-8444-555555555555'));
  log.recordLlmEvent('S1', 'analyzePhotos', complete('cccccccc-2222-4333-8444-555555555555'));
  const files = jsonFiles('S1');
  expect(files).toHaveLength(2);
  const labels = files.map((f) => readJson('S1', f).label).sort();
  expect(labels).toEqual(['Photo 1', 'Photo 2']);
  files.forEach((f) => expect(readJson('S1', f).outcome).toBe('complete'));
});

test('a completion with no recorded start still writes a file', () => {
  log.recordLlmEvent('S1', 'curate', complete('eeeeeeee-2222-4333-8444-555555555555'));
  const files = jsonFiles('S1');
  expect(files).toHaveLength(1);
  const rec = readJson('S1', files[0]);
  expect(rec.startedAt).toBeNull();
  expect(rec.prompt).toBeNull();
  expect(rec.response.full).toEqual({ ok: true });
});

test('the context is sanitised in the filename', () => {
  log.recordLlmEvent('S1', 'curate/evidence:2', start('ffffffff-2222-4333-8444-555555555555'));
  expect(jsonFiles('S1')[0]).toMatch(/-curate_evidence_2-ffffffff\.json$/);
});

test('a write failure is swallowed and warned exactly once', () => {
  jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { const e = new Error('EPERM'); e.code = 'EPERM'; throw e; });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(() => {
    log.recordLlmEvent('S1', 'x', start('a1a1a1a1-2222-4333-8444-555555555555'));
    log.recordLlmEvent('S1', 'x', start('b1b1b1b1-2222-4333-8444-555555555555'));
  }).not.toThrow();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toMatch(/llm-call-log/);
  expect(warn.mock.calls[0][0]).toMatch(/EPERM/);
});

test('ignores events without a sessionId or of other types', () => {
  log.recordLlmEvent(null, 'x', start('a2a2a2a2-2222-4333-8444-555555555555'));
  log.recordLlmEvent('S2', 'x', { type: 'llm_delta', callId: 'q', deltaText: 'hi' });
  log.recordLlmEvent('S2', 'x', { type: 'assistant', callId: 'q' });
  expect(fs.existsSync(path.join(root, 'S2'))).toBe(false);
});

test('is disabled under Jest unless a test opts in with setLogRoot', () => {
  log._resetForTests();                 // JEST_WORKER_ID is set, nothing opted in
  expect(log.isEnabled()).toBe(false);
  log.setLogRoot(root);
  expect(log.isEnabled()).toBe(true);
});

test('resolveLogDir is <root>/<sessionId>/llm-log', () => {
  expect(log.resolveLogDir('091926')).toBe(path.join(root, '091926', 'llm-log'));
});

/**
 * Fix round 1: the in-flight map holds the FULL prompt per pending call (~250KB for the
 * article call), so no path may retain an entry indefinitely. The client now emits an
 * llm_error on every failure path, but a failing fs write must not leak either.
 */
describe('in-flight bookkeeping is bounded', () => {
  test('a failed llm_start write retains nothing', () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    log.recordLlmEvent('S1', 'x', start('a3a3a3a3-2222-4333-8444-555555555555'));
    expect(log._inFlightSize()).toBe(0);
  });

  test('a failed terminal write still frees the in-flight entry', () => {
    log.recordLlmEvent('S1', 'x', start('a4a4a4a4-2222-4333-8444-555555555555'));
    expect(log._inFlightSize()).toBe(1);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    log.recordLlmEvent('S1', 'x', complete('a4a4a4a4-2222-4333-8444-555555555555'));
    expect(log._inFlightSize()).toBe(0);
  });

  test('a completion frees its entry', () => {
    log.recordLlmEvent('S1', 'x', start('a5a5a5a5-2222-4333-8444-555555555555'));
    log.recordLlmEvent('S1', 'x', complete('a5a5a5a5-2222-4333-8444-555555555555'));
    expect(log._inFlightSize()).toBe(0);
  });

  test('starts that never complete are capped, oldest evicted first', () => {
    for (let i = 0; i < 200; i++) {
      log.recordLlmEvent('S1', 'x', start(`${String(i).padStart(8, '0')}-2222-4333-8444-555555555555`));
    }
    expect(log._inFlightSize()).toBeLessThanOrEqual(64);
    expect(log._inFlightSize()).toBeGreaterThan(0);
  });
});
