/**
 * createProgressFromTrace records to the per-call log BEFORE the SDK_PROGRESS gate
 * (spec §3.2 [M4]): that flag silences the console/SSE stream, never the record.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../llm-call-log');
const { createProgressFromTrace } = require('../progress-bridge');

let root;
let originalSdkProgress;
beforeEach(() => {
  originalSdkProgress = process.env.SDK_PROGRESS;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-bridge-log-'));
  log._resetForTests();
  log.setLogRoot(root);
});
afterEach(() => {
  if (originalSdkProgress === undefined) delete process.env.SDK_PROGRESS;
  else process.env.SDK_PROGRESS = originalSdkProgress;
  log._resetForTests();
  jest.restoreAllMocks();
});

test('records llm_start and llm_complete even when SDK_PROGRESS=false', () => {
  process.env.SDK_PROGRESS = 'false';
  const logger = createProgressFromTrace('generateOutline', 'S9');
  logger({ type: 'llm_start', callId: 'c1c1c1c1-2222-4333-8444-555555555555', model: 'opus', label: 'Outline', prompt: 'P', systemPrompt: 'S' });
  logger({ type: 'llm_complete', callId: 'c1c1c1c1-2222-4333-8444-555555555555', elapsed: 2, result: { a: 1 } });
  const dir = path.join(root, 'S9', 'llm-log');
  expect(fs.readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  expect(fs.existsSync(path.join(dir, 'index.jsonl'))).toBe(true);
});

test('writes nothing for a console-only logger (no sessionId)', () => {
  process.env.SDK_PROGRESS = 'true';
  jest.spyOn(console, 'log').mockImplementation(() => {});   // the forwarding path logs; keep test output clean
  const logger = createProgressFromTrace('generateOutline');
  logger({ type: 'llm_start', callId: 'c2c2c2c2-2222-4333-8444-555555555555', model: 'opus', prompt: 'P' });
  expect(fs.readdirSync(root)).toEqual([]);
});

/**
 * Fix round 1 end-to-end: a failing call must leave a CLOSED record — the prompt file
 * gains an outcome, error and elapsed, and the call appears in index.jsonl. Before the
 * fix only two in-loop paths emitted llm_error, so a stall or a budget overrun left the
 * prompt-only file dangling and its in-flight entry (holding that prompt) retained.
 */
test('a call that fails at the idle timeout leaves a closed record on disk', async () => {
  process.env.SDK_PROGRESS = 'false';
  const { setMockQuery, clearMockQuery } = require('@anthropic-ai/claude-agent-sdk');
  const { sdkQueryImpl } = require('../../llm/client');

  setMockQuery(({ options }) => (async function* () {
    await new Promise((resolve) => options.abortController.signal.addEventListener('abort', resolve, { once: true }));
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  })());

  try {
    await sdkQueryImpl({
      prompt: 'BIG PROMPT', model: 'haiku', label: 'Article', timeoutMs: 20,
      onProgress: createProgressFromTrace('generateArticle', 'S10')
    });
    throw new Error('expected the idle timeout to throw');
  } catch (err) {
    expect(err.message).toMatch(/^SDK timeout after/);
  } finally {
    clearMockQuery();
  }

  const dir = path.join(root, 'S10', 'llm-log');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  expect(files).toHaveLength(1);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  expect(rec.prompt.user).toBe('BIG PROMPT');
  expect(rec.outcome).toBe('error');
  expect(rec.error.message).toMatch(/^SDK timeout after/);
  expect(typeof rec.elapsed).toBe('number');
  const index = fs.readFileSync(path.join(dir, 'index.jsonl'), 'utf8').trim().split('\n');
  expect(index).toHaveLength(1);
  expect(JSON.parse(index[0])).toMatchObject({ context: 'generateArticle', outcome: 'error' });
  expect(log._inFlightSize()).toBe(0);
});
