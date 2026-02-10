/**
 * Tests for ProgressEmitter
 *
 * Critical regression test: emitComplete must spread result into envelope
 * (not nest under 'result' key) so frontend SSE handler can read fields
 * like interrupted, checkpoint, currentPhase at the top level.
 */

const { ProgressEmitter } = require('../progress-emitter');

describe('ProgressEmitter', () => {
  let emitter;

  beforeEach(() => {
    emitter = new ProgressEmitter();
  });

  afterEach(() => {
    emitter.removeAllListeners();
  });

  describe('emitProgress', () => {
    it('spreads data into the envelope with timestamp', (done) => {
      emitter.subscribe('sess1', (data) => {
        expect(data.timestamp).toBeDefined();
        expect(data.type).toBe('progress');
        expect(data.message).toBe('Processing evidence');
        done();
      });

      emitter.emitProgress('sess1', { type: 'progress', message: 'Processing evidence' });
    });

    it('does not emit when sessionId is falsy', () => {
      const handler = jest.fn();
      emitter.subscribe('', handler);
      emitter.emitProgress('', { type: 'progress' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emitComplete', () => {
    it('spreads result fields at the top level (not nested under result key)', (done) => {
      const response = {
        sessionId: 'test-123',
        interrupted: true,
        checkpoint: { type: 'await-roster', message: 'Provide roster' },
        currentPhase: '1.51'
      };

      emitter.subscribe('test-123', (data) => {
        // CRITICAL: These fields must be at the top level, not under data.result
        expect(data.sessionId).toBe('test-123');
        expect(data.interrupted).toBe(true);
        expect(data.checkpoint).toEqual({ type: 'await-roster', message: 'Provide roster' });
        expect(data.currentPhase).toBe('1.51');
        expect(data.type).toBe('complete');
        expect(data.timestamp).toBeDefined();

        // Must NOT have a nested result object
        expect(data.result).toBeUndefined();
        done();
      });

      emitter.emitComplete('test-123', response);
    });

    it('always sets type to "complete" even if result has a type field', (done) => {
      const response = {
        sessionId: 'test-456',
        type: 'something-else',
        currentPhase: 'error'
      };

      emitter.subscribe('test-456', (data) => {
        expect(data.type).toBe('complete');
        expect(data.sessionId).toBe('test-456');
        expect(data.currentPhase).toBe('error');
        done();
      });

      emitter.emitComplete('test-456', response);
    });

    it('includes error fields for error responses', (done) => {
      const errorResponse = {
        sessionId: 'err-sess',
        currentPhase: 'error',
        error: 'Internal server error',
        details: 'Approval operation failed.'
      };

      emitter.subscribe('err-sess', (data) => {
        expect(data.type).toBe('complete');
        expect(data.currentPhase).toBe('error');
        expect(data.error).toBe('Internal server error');
        expect(data.details).toBe('Approval operation failed.');
        done();
      });

      emitter.emitComplete('err-sess', errorResponse);
    });

    it('includes completion fields for successful responses', (done) => {
      const completeResponse = {
        sessionId: 'done-sess',
        currentPhase: 'complete',
        assembledHtml: '<html>...</html>',
        validationResults: [{ rule: 'word-count', passed: true }],
        outputPath: '/data/done-sess/output/article.html'
      };

      emitter.subscribe('done-sess', (data) => {
        expect(data.type).toBe('complete');
        expect(data.currentPhase).toBe('complete');
        expect(data.assembledHtml).toBe('<html>...</html>');
        expect(data.validationResults).toHaveLength(1);
        expect(data.outputPath).toBe('/data/done-sess/output/article.html');
        done();
      });

      emitter.emitComplete('done-sess', completeResponse);
    });

    it('does not emit when sessionId is falsy', () => {
      const handler = jest.fn();
      emitter.subscribe('', handler);
      emitter.emitComplete('', { currentPhase: 'complete' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('returns an unsubscribe function', () => {
      const handler = jest.fn();
      const unsub = emitter.subscribe('sess-unsub', handler);

      emitter.emitProgress('sess-unsub', { type: 'progress', message: 'first' });
      expect(handler).toHaveBeenCalledTimes(1);

      unsub();
      emitter.emitProgress('sess-unsub', { type: 'progress', message: 'second' });
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it('isolates events by sessionId', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.subscribe('sess-a', handler1);
      emitter.subscribe('sess-b', handler2);

      emitter.emitProgress('sess-a', { type: 'progress', message: 'for A' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});
