/**
 * The arc judge's canonical roster says what it is for (phase 2 final fix wave,
 * item 9).
 *
 * "CANONICAL CHARACTER ROSTER: Use ONLY these full names in ALL article text" (21
 * names on 092026) followed "ONLY check coverage for the N names listed in SESSION
 * ROSTER above" with nothing between them, and rosterCoverage is structural. One
 * line now says the list gives names and pronouns only (names only for the detective
 * theme, whose list has no pronouns), and that coverage is checked against the
 * SESSION ROSTER.
 */

const { _testing: { buildEvaluationUserPrompt } } = require('../workflow/nodes/evaluator-nodes');
const { reworkFixtureState } = require('./fixtures/rework-state');

const leadIn = (theme) => `The canonical roster below gives ${theme === 'journalist' ? 'names and pronouns' : 'names'} only. Check coverage against the SESSION ROSTER above, not against this list.`;

describe.each(['journalist', 'detective'])('the %s arc judge', (theme) => {
  const prompt = buildEvaluationUserPrompt('arcs', { ...reworkFixtureState(theme), narrativeArcs: [] }, {});

  it('puts the lead-in between the coverage rule and the canonical roster', () => {
    const rule = prompt.indexOf('- ONLY check coverage for the 4 names listed in SESSION ROSTER above');
    const LEAD_IN = leadIn(theme);
    const at = prompt.indexOf(LEAD_IN);
    const roster = prompt.indexOf('CANONICAL CHARACTER ROSTER:');
    expect(rule).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(rule);
    expect(roster).toBeGreaterThan(at);
    expect(prompt.slice(at + LEAD_IN.length, roster)).toBe('\n\n');
  });
});
