const { createProgressFromTrace } = require('../progress-bridge');

// Force progress enabled for the test
process.env.SDK_PROGRESS = 'true';

describe('progress-bridge llm_complete with undefined result', () => {
  test('does not throw on undefined result (defense-in-depth)', () => {
    const logger = createProgressFromTrace('test-context', null);
    expect(() => logger({
      type: 'llm_complete',
      elapsed: 1.5,
      result: undefined,
      jsonSchema: { type: 'object' }
    })).not.toThrow();
  });

  test('does not throw on null result', () => {
    const logger = createProgressFromTrace('test-context', null);
    expect(() => logger({
      type: 'llm_complete',
      elapsed: 1.5,
      result: null
    })).not.toThrow();
  });

  test('logs character count when result is a valid object', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createProgressFromTrace('test-context', null);
    logger({
      type: 'llm_complete',
      elapsed: 1.5,
      result: { hello: 'world' }
    });
    const lastCall = logSpy.mock.calls[logSpy.mock.calls.length - 1][0];
    expect(lastCall).toMatch(/Completed \(\d+ chars\)/);
    logSpy.mockRestore();
  });
});
