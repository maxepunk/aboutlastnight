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
});
