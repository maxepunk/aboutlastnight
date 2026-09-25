// lib/llm/__tests__/refusal.test.js — the pure refusal module (brief 2.0).
const { SdkRefusalError, refusalOf, isRefusalError, createRefusalTracker } = require('../refusal');

describe('SdkRefusalError', () => {
  test('names the refusal, the category, the model and the call', () => {
    const err = new SdkRefusalError({ category: 'bio', explanation: 'May relate to biological harm.', model: 'claude-opus-5-5', label: 'Outline generation' });
    expect(err.message).toBe('SDK refusal (category: bio): claude-opus-5-5 declined the request - Outline generation: May relate to biological harm.');
    expect(err.name).toBe('SdkRefusalError');
    expect(err.sdkSubtype).toBe('refusal');
    expect(err.refusalCategory).toBe('bio');
  });

  test('a null category reads "none given" and stays null on the error', () => {
    const err = new SdkRefusalError({ model: 'claude-opus-5-5', label: 'x' });
    expect(err.message).toMatch(/\(category: none given\)/);
    expect(err.refusalCategory).toBeNull();
    expect(err.refusalFallbackModel).toBeNull();
  });

  test('names the fallback model the CLI retried on, and keeps the failure it names as its cause', () => {
    const cause = new Error('SDK timeout after 900.0s idle 900.0s with no streamed activity (idle limit: 900s) - x');
    const err = new SdkRefusalError({ category: 'frontier_llm', model: 'claude-opus-5-5', label: 'Outline generation', fallbackModel: 'claude-opus-5' }, { cause });
    expect(err.message).toBe('SDK refusal (category: frontier_llm): claude-opus-5-5 declined the request - Outline generation (the CLI retried it on claude-opus-5; that answer is not used)');
    expect(err.refusalFallbackModel).toBe('claude-opus-5');
    expect(err.cause).toBe(cause);
    expect(refusalOf(err)).toEqual({ category: 'frontier_llm', explanation: null });
  });
});

describe('refusalOf', () => {
  const original = () => new SdkRefusalError({ category: 'cyber', explanation: 'why', label: 'x' });

  test('reads the error itself', () => {
    expect(refusalOf(original())).toEqual({ category: 'cyber', explanation: 'why' });
  });

  test('reads through .cause links', () => {
    const wrapped = new Error('Failed to analyze whiteboard: ...', { cause: new Error('mid', { cause: original() }) });
    expect(refusalOf(wrapped)).toEqual({ category: 'cyber', explanation: 'why' });
  });

  test('reads the marker from a message that kept only the text', () => {
    expect(refusalOf(new Error(`Photo analysis failed: all 2 photos errored (e.g. "${original().message}").`)))
      .toEqual({ category: 'cyber', explanation: null });
    expect(refusalOf(new Error('x: SDK refusal (category: none given): m declined the request - y')))
      .toEqual({ category: null, explanation: null });
  });

  test('is null for other errors, non-objects and a cyclic cause chain', () => {
    expect(refusalOf(new Error('SDK timeout after 900s'))).toBeNull();
    expect(refusalOf(null)).toBeNull();
    expect(refusalOf('SDK refusal (category: bio)')).toBeNull();
    const a = new Error('a'); const b = new Error('b', { cause: a }); a.cause = b;
    expect(refusalOf(a)).toBeNull();
    expect(isRefusalError(a)).toBe(false);
  });
});

describe('createRefusalTracker', () => {
  const frame = (category) => ({ type: 'assistant', message: { stop_reason: 'refusal', stop_details: { category, explanation: null } } });
  const clean = { type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn' };

  test('no signal: not declined', () => {
    const t = createRefusalTracker();
    t.observe({ type: 'assistant', message: { stop_reason: null } });
    expect(t.terminalRefusal(clean)).toBeNull();
    expect(t.pending()).toBeNull();
  });

  test('result stop_reason refusal is terminal and takes the category a frame carried', () => {
    const t = createRefusalTracker();
    t.observe(frame('bio'));
    expect(t.terminalRefusal({ ...clean, stop_reason: 'refusal' })).toEqual({ category: 'bio', explanation: null });
  });

  test('a subagent frame (parent_tool_use_id set) is not the call\'s refusal', () => {
    const t = createRefusalTracker();
    t.observe({ ...frame('bio'), parent_tool_use_id: 'toolu_1' });
    expect(t.pending()).toBeNull();
  });

  test('a later signal without a category keeps the earlier category', () => {
    const t = createRefusalTracker();
    t.observe({ type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'refusal', stop_details: { category: 'cyber', explanation: 'e' } } } });
    t.observe({ type: 'assistant', message: { stop_reason: 'refusal', stop_details: null } });
    expect(t.pending()).toEqual({ category: 'cyber', explanation: 'e' });
  });

  // Integrator ruling 2026-09-25: a declined request is never answered by another model.
  test('a session fallback declines the call, naming the category and the fallback model', () => {
    const t = createRefusalTracker({ model: 'claude-opus-5-5' });
    t.observe(frame('bio'));
    expect(t.declinedFallback()).toBeNull();
    t.observe({ type: 'system', subtype: 'model_refusal_fallback', scope: 'session', original_model: 'claude-opus-5-5', fallback_model: 'claude-opus-5', api_refusal_category: 'bio', api_refusal_explanation: 'why' });
    const declined = { category: 'bio', explanation: 'why', fallbackModel: 'claude-opus-5' };
    expect(t.declinedFallback()).toEqual(declined);
    expect(t.terminalRefusal(clean)).toEqual(declined);
    expect(t.pending()).toEqual(declined);
    expect(t.fallback()).toEqual({ originalModel: 'claude-opus-5-5', fallbackModel: 'claude-opus-5', category: 'bio', scope: 'session' });
  });

  test('a fallback notice with no scope is read as session, and takes the category a frame carried', () => {
    const t = createRefusalTracker({ model: 'claude-opus-5-5' });
    t.observe(frame('cyber'));
    t.observe({ type: 'system', subtype: 'model_refusal_fallback', fallback_model: 'claude-opus-4-8' });
    expect(t.declinedFallback()).toEqual({ category: 'cyber', explanation: null, fallbackModel: 'claude-opus-4-8' });
    expect(t.fallback()).toEqual({ originalModel: 'claude-opus-5-5', fallbackModel: 'claude-opus-4-8', category: 'cyber', scope: null });
  });

  test('a local fallback is recorded only: the call is not declined and the refusal stays pending', () => {
    const t = createRefusalTracker({ model: 'claude-opus-5-5' });
    t.observe(frame('bio'));
    t.observe({ type: 'system', subtype: 'model_refusal_fallback', scope: 'local', fallback_model: 'b' });
    expect(t.declinedFallback()).toBeNull();
    expect(t.pending()).toEqual({ category: 'bio', explanation: null });
    expect(t.fallback()).toEqual({ originalModel: 'claude-opus-5-5', fallbackModel: 'b', category: null, scope: 'local' });
  });

  test('a main-thread frame that supersedes earlier frames is the fallback leg: declined, named from its model', () => {
    const t = createRefusalTracker({ model: 'claude-opus-5-5' });
    t.observe(frame('bio'));
    t.observe({ type: 'assistant', supersedes: ['u1'], message: { model: 'claude-opus-5', stop_reason: null } });
    expect(t.declinedFallback()).toEqual({ category: 'bio', explanation: null, fallbackModel: 'claude-opus-5' });
    expect(t.pending()).toEqual({ category: 'bio', explanation: null, fallbackModel: 'claude-opus-5' });

    // The end-of-turn notice for the same fallback completes the record.
    t.observe({ type: 'system', subtype: 'model_refusal_fallback', scope: 'session', original_model: 'claude-opus-5-5', fallback_model: 'claude-opus-5', api_refusal_category: 'bio' });
    expect(t.fallback()).toEqual({ originalModel: 'claude-opus-5-5', fallbackModel: 'claude-opus-5', category: 'bio', scope: 'session' });
  });

  test('a subagent frame that supersedes (parent_tool_use_id set) does not decline the call', () => {
    const t = createRefusalTracker();
    t.observe({ type: 'assistant', parent_tool_use_id: 'toolu_1', supersedes: ['u1'], message: { model: 'x', stop_reason: null } });
    expect(t.declinedFallback()).toBeNull();
    expect(t.pending()).toBeNull();
  });

  test('the no-fallback notice is terminal even before a clean-looking result', () => {
    const t = createRefusalTracker();
    t.observe({ type: 'system', subtype: 'model_refusal_no_fallback', api_refusal_category: 'bio', api_refusal_explanation: 'x' });
    expect(t.terminalRefusal(clean)).toEqual({ category: 'bio', explanation: 'x' });
  });

  test('an unsuperseded signal is terminal unless the result is a clean finish on another stop reason', () => {
    const t = createRefusalTracker();
    t.observe(frame('bio'));
    expect(t.terminalRefusal(clean)).toBeNull();
    expect(t.terminalRefusal({ ...clean, stop_reason: null })).toEqual({ category: 'bio', explanation: null });
    expect(t.terminalRefusal({ ...clean, is_error: true })).toEqual({ category: 'bio', explanation: null });
    expect(t.terminalRefusal({ type: 'result', subtype: 'error_during_execution' })).toEqual({ category: 'bio', explanation: null });
  });
});
