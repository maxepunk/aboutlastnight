const { _testing } = require('../workflow/nodes/input-nodes');
const { resolveRosterPronouns } = _testing;

describe('resolveRosterPronouns — empty-{} must not shadow rawInput (CR-4)', () => {
  it('uses rawInput pronouns when state map is an empty object (the bug)', () => {
    const state = { rosterPronouns: {} };
    const rawInput = { rosterPronouns: { Vic: 'she/her', Sam: 'he/him' } };
    expect(resolveRosterPronouns(state, rawInput)).toEqual({ Vic: 'she/her', Sam: 'he/him' });
  });

  it('prefers a populated state map over rawInput (incremental roster wins)', () => {
    const state = { rosterPronouns: { Vic: 'they/them' } };
    const rawInput = { rosterPronouns: { Vic: 'she/her' } };
    expect(resolveRosterPronouns(state, rawInput)).toEqual({ Vic: 'they/them' });
  });

  it('falls back to rawInput when state has no map', () => {
    const state = {};
    const rawInput = { rosterPronouns: { Alex: 'she/her' } };
    expect(resolveRosterPronouns(state, rawInput)).toEqual({ Alex: 'she/her' });
  });

  it('returns {} when neither side provides keys (no crash, fail-soft only when genuinely empty)', () => {
    expect(resolveRosterPronouns({ rosterPronouns: {} }, { rosterPronouns: {} })).toEqual({});
    expect(resolveRosterPronouns({}, {})).toEqual({});
  });

  it('tolerates missing rawInput object', () => {
    expect(resolveRosterPronouns({ rosterPronouns: { Vic: 'she/her' } }, undefined)).toEqual({ Vic: 'she/her' });
  });
});
