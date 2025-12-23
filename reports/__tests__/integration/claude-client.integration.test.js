/**
 * Claude Client Integration Tests
 *
 * Tests process orchestration by mocking child_process.spawn.
 * Uses a simpler approach that doesn't rely on fake timers.
 */

const { EventEmitter } = require('events');

// Store for mock process
let mockProcessInstance = null;

// Create mock process factory
function createMockProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = {
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn()
  };
  proc.kill = jest.fn();
  return proc;
}

// Mock child_process - spawn returns our controlled mock
jest.mock('child_process', () => ({
  spawn: jest.fn(() => {
    const { EventEmitter } = require('events');
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: jest.fn(), end: jest.fn(), on: jest.fn() };
    proc.kill = jest.fn();
    // Store globally for test access
    mockProcessInstance = proc;
    return proc;
  })
}));

// Mock fs.promises
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    rm: jest.fn().mockResolvedValue(undefined)
  }
}));

const { spawn } = require('child_process');
const fs = require('fs').promises;
const { callClaude, MODEL_TIMEOUTS, getModelTimeout } = require('../../lib/claude-client');

describe('claude-client integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessInstance = null;
  });

  describe('MODEL_TIMEOUTS configuration', () => {
    it('defines correct timeout for opus (10 minutes)', () => {
      expect(MODEL_TIMEOUTS.opus).toBe(10 * 60 * 1000);
    });

    it('defines correct timeout for sonnet (5 minutes)', () => {
      expect(MODEL_TIMEOUTS.sonnet).toBe(5 * 60 * 1000);
    });

    it('defines correct timeout for haiku (2 minutes)', () => {
      expect(MODEL_TIMEOUTS.haiku).toBe(2 * 60 * 1000);
    });
  });

  describe('getModelTimeout', () => {
    it('returns opus timeout for opus model', () => {
      expect(getModelTimeout('opus')).toBe(MODEL_TIMEOUTS.opus);
    });

    it('returns sonnet timeout as default for unknown models', () => {
      expect(getModelTimeout('unknown-model')).toBe(MODEL_TIMEOUTS.sonnet);
    });
  });

  describe('argument construction', () => {
    it('includes -p flag for prompt mode', async () => {
      const callPromise = callClaude({ prompt: 'Test prompt', maxRetries: 0 });

      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p']),
        expect.any(Object)
      );

      // Complete the process to let promise resolve
      mockProcessInstance.stdout.emit('data', 'Response');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });

    it('includes --model flag with specified model', async () => {
      const callPromise = callClaude({ prompt: 'Test', model: 'opus', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--model', 'opus']),
        expect.any(Object)
      );

      mockProcessInstance.stdout.emit('data', 'Response');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });

    it('includes --system-prompt when provided', async () => {
      const callPromise = callClaude({
        prompt: 'Test',
        systemPrompt: 'You are helpful',
        maxRetries: 0
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--system-prompt', 'You are helpful']),
        expect.any(Object)
      );

      mockProcessInstance.stdout.emit('data', 'Response');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });

    it('includes --output-format json when specified', async () => {
      const callPromise = callClaude({
        prompt: 'Test',
        outputFormat: 'json',
        maxRetries: 0
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--output-format', 'json']),
        expect.any(Object)
      );

      mockProcessInstance.stdout.emit('data', '{}');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });

    it('includes --json-schema when provided', async () => {
      const schema = { type: 'object', properties: { key: { type: 'string' } } };
      const callPromise = callClaude({
        prompt: 'Test',
        jsonSchema: schema,
        maxRetries: 0
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--json-schema', JSON.stringify(schema)]),
        expect.any(Object)
      );

      mockProcessInstance.stdout.emit('data', '{"key": "value"}');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });

    it('includes --tools when specified', async () => {
      const callPromise = callClaude({
        prompt: 'Test',
        tools: '',
        maxRetries: 0
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--tools', '']),
        expect.any(Object)
      );

      mockProcessInstance.stdout.emit('data', 'Response');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });
  });

  describe('prompt handling', () => {
    it('writes prompt to stdin', async () => {
      const callPromise = callClaude({ prompt: 'My test prompt', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      expect(mockProcessInstance.stdin.write).toHaveBeenCalledWith('My test prompt');
      expect(mockProcessInstance.stdin.end).toHaveBeenCalled();

      mockProcessInstance.stdout.emit('data', 'Response');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });

    it('throws error when prompt is missing', async () => {
      await expect(callClaude({})).rejects.toThrow('prompt is required');
    });
  });

  describe('work directory handling', () => {
    it('creates temp directory with unique name', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/claude-batch-\d+-[a-z0-9]+$/),
        { recursive: true }
      );

      mockProcessInstance.stdout.emit('data', 'Response');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });

    it('spawns process in work directory', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: expect.stringMatching(/claude-batch-/)
        })
      );

      mockProcessInstance.stdout.emit('data', 'Response');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });

    it('uses windowsHide option', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          windowsHide: true
        })
      );

      mockProcessInstance.stdout.emit('data', 'Response');
      mockProcessInstance.emit('close', 0);

      await callPromise;
    });

    it('cleans up work directory after success', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      mockProcessInstance.stdout.emit('data', 'Response');
      mockProcessInstance.emit('close', 0);

      await callPromise;

      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringMatching(/claude-batch-/),
        { recursive: true, force: true }
      );
    });

    it('cleans up work directory after error', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      mockProcessInstance.emit('close', 1);

      await expect(callPromise).rejects.toThrow();

      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringMatching(/claude-batch-/),
        { recursive: true, force: true }
      );
    });
  });

  describe('error handling', () => {
    it('rejects on non-zero exit code', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      mockProcessInstance.stderr.emit('data', 'Error message');
      mockProcessInstance.emit('close', 1);

      await expect(callPromise).rejects.toThrow('Claude exited with code 1');
    });

    it('rejects on abnormal termination', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      mockProcessInstance.emit('close', null, null);

      await expect(callPromise).rejects.toThrow('terminated abnormally');
    });

    it('rejects on spawn error', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      mockProcessInstance.emit('error', new Error('ENOENT'));

      await expect(callPromise).rejects.toThrow('Failed to spawn Claude CLI');
    });

    it('includes stderr in error message', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      mockProcessInstance.stderr.emit('data', 'API rate limit exceeded');
      mockProcessInstance.emit('close', 1);

      await expect(callPromise).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('output handling', () => {
    it('returns trimmed stdout', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      mockProcessInstance.stdout.emit('data', '  Response text  \n\n');
      mockProcessInstance.emit('close', 0);

      const result = await callPromise;
      expect(result).toBe('Response text');
    });

    it('concatenates chunked stdout', async () => {
      const callPromise = callClaude({ prompt: 'Test', maxRetries: 0 });

      await new Promise(resolve => setImmediate(resolve));

      mockProcessInstance.stdout.emit('data', 'First ');
      mockProcessInstance.stdout.emit('data', 'Second ');
      mockProcessInstance.stdout.emit('data', 'Third');
      mockProcessInstance.emit('close', 0);

      const result = await callPromise;
      expect(result).toBe('First Second Third');
    });

    it('parses JSON output when outputFormat is json', async () => {
      const callPromise = callClaude({
        prompt: 'Test',
        outputFormat: 'json',
        maxRetries: 0
      });

      await new Promise(resolve => setImmediate(resolve));

      const jsonOutput = JSON.stringify([
        {
          type: 'result',
          subtype: 'success',
          structured_output: { key: 'value' }
        }
      ]);

      mockProcessInstance.stdout.emit('data', jsonOutput);
      mockProcessInstance.emit('close', 0);

      const result = await callPromise;
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });
  });
});
