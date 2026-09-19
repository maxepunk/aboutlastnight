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
