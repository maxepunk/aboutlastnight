/**
 * Auto-memory isolation (operator gate, 2026-09-19)
 *
 * `settingSources: []` does not stop the Claude Code subprocess from loading the
 * operator's auto-memory directory (~/.claude/projects/<cwd>/memory/): a probe with
 * the client's exact options reported `memory_paths.auto` set and the model listed
 * all 33 memory files from MEMORY.md — including editorial-feedback notes about ALN
 * reports — as visible context. `autoMemoryEnabled` is a settings.json key (unread
 * with settingSources []), so the switch is the CLI's CLAUDE_CODE_DISABLE_AUTO_MEMORY
 * env var, passed through `options.env`. With it the same probe reported no
 * memory_paths and the model answered "none".
 *
 * The same env carries one more switch (integrator ruling, 2026-09-25): a declined
 * request is never answered by another model. The bundled CLI 2.1.282 retries a
 * declined turn through refusal fallback routes of its own, keyed on the requested
 * model and independent of `fallbackModel` (for claude-opus-5-5: bio and frontier_llm
 * to claude-opus-5, cyber to claude-opus-4-8). CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK
 * turns them off; the binary gates the fallback lane on that variable.
 *
 * And a third (integrator ruling, 2026-09-25): the pipeline's calls are always served
 * by their pinned model, never a substitute. CLAUDE_CODE_NO_MODEL_FALLBACK is the
 * CLI's "no-fallback guarantee": it also disables the refusal fallback (the lane's gate
 * is `!CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK && !<no-model-fallback>`), collapses the
 * availability fallback chain to the primary model, blocks model substitution, and
 * turns a compaction that needs another model into an error.
 */

let capturedOptions = null;
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(({ options }) => {
    capturedOptions = options;
    return (async function* () {
      yield { type: 'result', subtype: 'success', result: 'ok', structured_output: { test: true } };
    })();
  })
}));

const { sdkQuery } = require('../llm');

describe('SDK auto-memory isolation', () => {
  beforeEach(() => { capturedOptions = null; });

  test('disables the subprocess auto-memory through its environment', async () => {
    await sdkQuery({ prompt: 'test', model: 'haiku', disableTools: true });
    expect(capturedOptions.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
  });

  test('keeps the rest of the process environment (the CLI needs PATH and its auth)', async () => {
    await sdkQuery({ prompt: 'test', model: 'haiku', disableTools: true });
    const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path');
    expect(capturedOptions.env[pathKey]).toBe(process.env[pathKey]);
  });

  test('disables the CLI refusal fallback through its environment, on every model', async () => {
    for (const model of ['opus', 'sonnet', 'haiku']) {
      await sdkQuery({ prompt: 'test', model, disableTools: true });
      expect(capturedOptions.env.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK).toBe('1');
    }
  });

  test('sets the CLI no-fallback guarantee through its environment, on every model', async () => {
    for (const model of ['opus', 'sonnet', 'haiku']) {
      await sdkQuery({ prompt: 'test', model, disableTools: true });
      expect(capturedOptions.env.CLAUDE_CODE_NO_MODEL_FALLBACK).toBe('1');
    }
  });

  test('the env is the process environment plus exactly the three switches', async () => {
    await sdkQuery({ prompt: 'test', model: 'opus', disableTools: true });
    expect(capturedOptions.env).toEqual({
      ...process.env,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK: '1',
      CLAUDE_CODE_NO_MODEL_FALLBACK: '1'
    });
  });
});
