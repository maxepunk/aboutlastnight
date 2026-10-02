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

describe('PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT removal (X-8)', () => {
  it('no longer exports the unused system prompt', () => {
    expect(subagents.PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT).toBeUndefined();
    expect(subagents._testing.PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT).toBeUndefined();
  });
  it('still exports the live revision schema', () => {
    expect(subagents.PLAYER_FOCUS_GUIDED_SCHEMA).toBeDefined();
  });
});

// Phase 3 (3.10): the interweaving call and the arc reworker read one principles text.
describe('INTERWEAVING_PRINCIPLES', () => {
  it('is exported once, and the interweaving system prompt is built on it', () => {
    expect(typeof subagents.INTERWEAVING_PRINCIPLES).toBe('string');
    expect(subagents.INTERWEAVING_SYSTEM_PROMPT.split(subagents.INTERWEAVING_PRINCIPLES)).toHaveLength(2);
  });
});
