/**
 * The diagnostics envelope reaches all three places from one builder
 * (llm-call-log.js#diagnosticsOf): the per-call record, the SSE llm_complete and the SSE
 * llm_error (brief 2.0). The llm_error SSE path with a session id had no test before.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../llm-call-log');
const { progressEmitter } = require('../progress-emitter');
const { createProgressFromTrace } = require('../progress-bridge');

const CALL = 'd1d1d1d1-2222-4333-8444-555555555555';
let root;
let originalSdkProgress;
let emitted;

beforeEach(() => {
  originalSdkProgress = process.env.SDK_PROGRESS;
  process.env.SDK_PROGRESS = 'true';
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-bridge-diag-'));
  log._resetForTests();
  log.setLogRoot(root);
  emitted = [];
  jest.spyOn(progressEmitter, 'emitProgress').mockImplementation((sessionId, event) => emitted.push(event));
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  if (originalSdkProgress === undefined) delete process.env.SDK_PROGRESS;
  else process.env.SDK_PROGRESS = originalSdkProgress;
  log._resetForTests();
  jest.restoreAllMocks();
});

const readRecord = (sessionId) => {
  const dir = path.join(root, sessionId, 'llm-log');
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.json'));
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
};

test('a declined call: the SSE llm_error and the record carry the refusal; the SSE error has no channel', () => {
  const logger = createProgressFromTrace('generateCoreArcs', 'S1');
  logger({ type: 'llm_start', callId: CALL, model: 'opus', label: 'Core arcs', prompt: 'P' });
  logger({
    type: 'llm_error', callId: CALL, elapsed: 3.2,
    error: 'SDK refusal (category: bio): claude-opus-5-5 declined the request - Core arcs',
    errorName: 'SdkRefusalError', stopReason: 'refusal',
    refusal: { category: 'bio', explanation: null }, refusalFallback: null
  });

  const sse = emitted.find((e) => e.type === 'llm_error');
  expect(sse.diagnostics.refusal).toEqual({ category: 'bio', explanation: null });
  expect(sse.diagnostics.stopReason).toBe('refusal');
  expect('channel' in sse.diagnostics).toBe(false);

  const record = readRecord('S1');
  expect(record.diagnostics.refusal).toEqual({ category: 'bio', explanation: null });
  expect(record.error.errorName).toBe('SdkRefusalError');

  expect(console.log.mock.calls.some(([line]) => /Declined: SDK refusal/.test(line))).toBe(true);
});

test('a completed call: the SSE llm_complete keeps its channel and carries refusalFallback', () => {
  const logger = createProgressFromTrace('generateOutline', 'S2');
  // Only a 'local' fallback (a subagent's) can reach a completed call; a main-thread one declines it.
  const fallback = { originalModel: 'claude-opus-5-5', fallbackModel: 'claude-opus-4-8', category: 'cyber', scope: 'local' };
  logger({ type: 'llm_start', callId: CALL, model: 'opus', prompt: 'P' });
  logger({ type: 'llm_complete', callId: CALL, elapsed: 2, result: { a: 1 }, channel: 'structured_output', refusalFallback: fallback });

  const sse = emitted.find((e) => e.type === 'llm_complete');
  expect(sse.diagnostics.channel).toBe('structured_output');
  expect(sse.diagnostics.refusalFallback).toEqual(fallback);
  expect(readRecord('S2').diagnostics.refusalFallback).toEqual(fallback);
});

test('a completed call that a refusal signal preceded: refusalSignal reaches the SSE envelope and the record', () => {
  const logger = createProgressFromTrace('generateOutline', 'S4');
  const signal = { category: 'bio', explanation: 'May relate to biological harm.' };
  logger({ type: 'llm_start', callId: CALL, model: 'opus', prompt: 'P' });
  logger({ type: 'llm_complete', callId: CALL, elapsed: 2, result: { a: 1 }, channel: 'structured_output', refusalSignal: signal, refusalFallback: null });

  expect(emitted.find((e) => e.type === 'llm_complete').diagnostics.refusalSignal).toEqual(signal);
  const record = readRecord('S4');
  expect(record.outcome).toBe('complete');
  expect(record.diagnostics.refusalSignal).toEqual(signal);
  expect(record.diagnostics.refusal).toBeNull();
});

test('a declined call: the SSE llm_error and the record carry refusalSignal as null', () => {
  const logger = createProgressFromTrace('generateCoreArcs', 'S5');
  logger({ type: 'llm_start', callId: CALL, model: 'opus', prompt: 'P' });
  logger({ type: 'llm_error', callId: CALL, elapsed: 1, error: 'SDK refusal (category: bio): x declined the request', errorName: 'SdkRefusalError', refusal: { category: 'bio', explanation: null } });
  expect(emitted.find((e) => e.type === 'llm_error').diagnostics.refusalSignal).toBeNull();
  expect(readRecord('S5').diagnostics.refusalSignal).toBeNull();
});

test('the served model reaches the SSE envelope, the record and the index line', () => {
  const logger = createProgressFromTrace('generateContent', 'S3');
  logger({ type: 'llm_start', callId: CALL, model: 'opus', prompt: 'P' });
  logger({ type: 'llm_complete', callId: CALL, elapsed: 370.5, result: { a: 1 }, channel: 'structured_output', servedModels: ['claude-opus-5-5'] });

  expect(emitted.find((e) => e.type === 'llm_complete').diagnostics.servedModels).toEqual(['claude-opus-5-5']);
  expect(readRecord('S3').diagnostics.servedModels).toEqual(['claude-opus-5-5']);
  const index = fs.readFileSync(path.join(root, 'S3', 'llm-log', 'index.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  expect(index[0]).toMatchObject({ model: 'opus', servedModels: ['claude-opus-5-5'], elapsed: 370.5 });
});
