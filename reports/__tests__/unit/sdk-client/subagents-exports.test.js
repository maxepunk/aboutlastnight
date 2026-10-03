const subagents = require('../../../lib/sdk-client/subagents');

describe('subagents dead-export removal (X-8)', () => {
  it('no longer exports normalizePath from _testing', () => {
    expect((subagents._testing || {}).normalizePath).toBeUndefined();
  });

  // Phase 4 (brief 4.4): the weave's prompt and schema are the live exports.
  it('still exports the live schema and prompt', () => {
    expect(subagents.WEAVE_SCHEMA).toBeDefined();
    expect(typeof subagents.WEAVE_SYSTEM_PROMPT).toBe('string');
  });
});

describe('PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT removal (X-8)', () => {
  it('no longer exports the unused system prompt', () => {
    expect(subagents.PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT).toBeUndefined();
    expect((subagents._testing || {}).PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT).toBeUndefined();
  });

  // Phase 4 (brief 4.4): one schema serves the arc writer and its rework.
  it('the weave\'s schema replaces the arc writer\'s and the arc rework\'s', () => {
    expect(subagents.PLAYER_FOCUS_GUIDED_SCHEMA).toBeUndefined();
    expect(subagents.CORE_ARC_SCHEMA).toBeUndefined();
  });
});

// Phase 4 (brief 4.4): the interweaving call went, and its principles with it.
describe('INTERWEAVING_PRINCIPLES', () => {
  it('went with the interweaving call', () => {
    expect(subagents.INTERWEAVING_PRINCIPLES).toBeUndefined();
    expect(subagents.INTERWEAVING_SYSTEM_PROMPT).toBeUndefined();
  });
});
