const subagents = require('../../../lib/sdk-client/subagents');

describe('subagents dead-export removal (X-8)', () => {
  it('no longer exports normalizePath from _testing', () => {
    expect(subagents._testing.normalizePath).toBeUndefined();
  });

  it('still exports the live schemas and prompts', () => {
    expect(subagents.CORE_ARC_SCHEMA).toBeDefined();
    expect(subagents.PLAYER_FOCUS_GUIDED_SCHEMA).toBeDefined();
    expect(subagents.CORE_ARC_SYSTEM_PROMPT).toBeDefined();
  });
});
