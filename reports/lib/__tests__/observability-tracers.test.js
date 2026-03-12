/**
 * Tests for LangSmith tracer output filtering
 */

// Mock langsmith before requiring modules
jest.mock('langsmith/traceable', () => ({
  traceable: (fn, opts) => {
    fn._traceOptions = opts;
    return fn;
  }
}));

// Must mock isTracingEnabled to return true
jest.mock('../observability/config', () => ({
  isTracingEnabled: () => true,
  getProject: () => 'test-project'
}));

describe('LangSmith tracer output filtering', () => {
  test('traceNode defines process_outputs', () => {
    const { traceNode } = require('../observability/node-tracer');
    const tracedFn = traceNode(async () => ({}), 'testNode');
    expect(tracedFn._traceOptions).toBeDefined();
    expect(tracedFn._traceOptions.process_outputs).toBeDefined();
    expect(typeof tracedFn._traceOptions.process_outputs).toBe('function');
  });

  test('traceNode process_outputs truncates large strings', () => {
    const { traceNode } = require('../observability/node-tracer');
    const tracedFn = traceNode(async () => ({}), 'testNode');
    const processOutputs = tracedFn._traceOptions.process_outputs;

    const largeOutput = {
      assembledHtml: 'x'.repeat(100000),
      currentPhase: 'complete'
    };

    const filtered = processOutputs(largeOutput);
    expect(filtered.assembledHtml.length).toBeLessThan(5000);
    expect(filtered.currentPhase).toBe('complete');
  });

  test('traceNode process_outputs truncates large objects', () => {
    const { traceNode } = require('../observability/node-tracer');
    const tracedFn = traceNode(async () => ({}), 'testNode');
    const processOutputs = tracedFn._traceOptions.process_outputs;

    const largeOutput = {
      contentBundle: { data: 'x'.repeat(10000) },
      count: 42
    };

    const filtered = processOutputs(largeOutput);
    expect(typeof filtered.contentBundle).toBe('string'); // Replaced with size description
    expect(filtered.count).toBe(42); // Numbers pass through
  });

  test('createTracedSdkQuery defines process_outputs', () => {
    const { createTracedSdkQuery } = require('../observability/llm-tracer');
    const tracedFn = createTracedSdkQuery(async () => ({}));
    expect(tracedFn._traceOptions).toBeDefined();
    expect(tracedFn._traceOptions.process_outputs).toBeDefined();
    expect(typeof tracedFn._traceOptions.process_outputs).toBe('function');
  });

  test('traceLLMCall defines process_outputs', () => {
    const { traceLLMCall } = require('../observability/llm-tracer');
    const tracedFn = traceLLMCall(async () => ({}), 'test');
    expect(tracedFn._traceOptions).toBeDefined();
    expect(tracedFn._traceOptions.process_outputs).toBeDefined();
  });

  test('traceBatch defines process_outputs', () => {
    const { traceBatch } = require('../observability/llm-tracer');
    const tracedFn = traceBatch(async () => ({}), 'test');
    expect(tracedFn._traceOptions).toBeDefined();
    expect(tracedFn._traceOptions.process_outputs).toBeDefined();
  });
});
