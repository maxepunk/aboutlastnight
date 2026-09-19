/**
 * MCP isolation (operator gate, 2026-09-19)
 *
 * `settingSources: []` scopes filesystem SETTINGS only. The SDK still loads every
 * MCP server from the user's ~/.claude.json — the claude.ai connectors (Gmail,
 * Google Drive, Google Calendar, Notion, Claude Docs). A live probe of a `tools: []`
 * call under bypassPermissions reported 103 `mcp__` tools at init, so the pipeline's
 * "no tools" calls carried a send-mail tool. `mcpServers: {}` + `strictMcpConfig: true`
 * (the CLI's --strict-mcp-config: use ONLY this MCP config) leaves exactly the
 * declared set: the same probe reported 1 tool (Read) and no servers.
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

describe('SDK MCP isolation', () => {
  beforeEach(() => { capturedOptions = null; });

  const modes = [
    ['disableTools', { disableTools: true }],
    ["tools: ['Read']", { tools: ['Read'] }],
    ['no gating declared', {}],
  ];

  for (const [label, opts] of modes) {
    test(`${label}: passes an empty MCP config in strict mode`, async () => {
      await sdkQuery({ prompt: 'test', model: 'haiku', ...opts });
      expect(capturedOptions.mcpServers).toEqual({});
      expect(capturedOptions.strictMcpConfig).toBe(true);
    });
  }
});
