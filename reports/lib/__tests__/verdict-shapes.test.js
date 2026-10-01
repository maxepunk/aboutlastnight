/**
 * Unusual verdicts through the real path (phase 3, brief 3.5; spec T2, section 6;
 * the plan's Review Focus 4).
 *
 * - A split final vote keeps every option that drew votes, with its count, and marks
 *   the one the group statement adopted, or none.
 * - A verdict that blames an institution or an unnamed person is a culprit verdict
 *   naming no character, with the room's words as the charge.
 * - A verdict with no culprit names no one.
 *
 * Each reaches SESSION_FACTS (buildSessionFacts -> renderSessionFactsVerdict) and the
 * arc writer's accusation block (synthesizePlayerFocus -> renderArcAccusation) through
 * the functions the nodes call, not only through the renderers. 092626's room voted
 * Remi 7, Vic 4 (a split vote): the shapes below are synthetic in that shape.
 */

const {
  normalizeAccusation,
  blamesNoCharacter,
  isNoCulpritVerdict
} = require('../accusation-verdict');
const { synthesizePlayerFocus } = require('../workflow/nodes/node-helpers');
const { buildSessionFacts } = require('../workflow/nodes/ai-nodes');
const {
  renderArcAccusation,
  renderSessionFactsVerdict,
  formatSplitVote
} = require('../prompt-renderers/director-words-renderer');

beforeAll(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterAll(() => jest.restoreAllMocks());

const ROSTER = ['Remi', 'Vic', 'Alex'];

/** Both paths a verdict takes into a prompt, from one parsed accusation. */
function bothRenders(accusation) {
  const sessionConfig = { roster: ROSTER, accusation: normalizeAccusation(accusation), accusationRaw: 'The director\'s account.' };
  const playerFocus = synthesizePlayerFocus(sessionConfig, { rawProse: '', whiteboard: {} });
  const state = { sessionConfig, playerFocus, canonicalCharacters: {} };
  return {
    playerFocus,
    facts: buildSessionFacts(state),
    sessionFacts: renderSessionFactsVerdict(buildSessionFacts(state)),
    arc: renderArcAccusation(playerFocus.accusation, sessionConfig.accusationRaw, "Players' Reasoning")
  };
}

describe('normalizeAccusation: the split vote', () => {
  it('keeps every option with its count, and the one the statement adopted', () => {
    const votes = [{ option: 'Remi', count: 7, adopted: true }, { option: 'Vic', count: 4, adopted: false }];
    expect(normalizeAccusation({ verdictKind: 'culprit', accused: ['Remi'], charge: 'Murder', votes }).votes).toEqual(votes);
  });

  it('keeps a tie, and a vote whose options the statement adopted none of', () => {
    const tie = [{ option: 'Alex', count: 4, adopted: false }, { option: 'Vic', count: 4, adopted: false }];
    expect(normalizeAccusation({ verdictKind: 'overdose', accused: [], charge: 'Accidental overdose', votes: tie }).votes).toEqual(tie);
  });

  it('drops a "split" of one option, and entries with no option or count', () => {
    expect(normalizeAccusation({ verdictKind: 'culprit', accused: ['Vic'], charge: 'Murder', votes: [{ option: 'Vic', count: 11, adopted: true }] }))
      .not.toHaveProperty('votes');
    expect(normalizeAccusation({ verdictKind: 'culprit', accused: ['Vic'], charge: 'Murder', votes: [{ option: '', count: 3 }, { option: 'Vic', count: 'many' }] }))
      .not.toHaveProperty('votes');
  });

  it('keeps at most one adopted option', () => {
    const out = normalizeAccusation({
      verdictKind: 'culprit', accused: ['Remi'], charge: 'Murder',
      votes: [{ option: 'Remi', count: 7, adopted: true }, { option: 'Vic', count: 4, adopted: true }]
    });
    expect(out.votes.map((v) => v.adopted)).toEqual([true, false]);
  });
});

describe('normalizeAccusation: the institution verdict', () => {
  it('allows a culprit verdict that names no character, with the room\'s words as the charge', () => {
    const acc = { verdictKind: 'culprit', accused: [], charge: 'NeurAI\'s board, for erasing the evidence' };
    expect(normalizeAccusation(acc)).toEqual(acc);
    expect(blamesNoCharacter(acc)).toBe(true);
    expect(isNoCulpritVerdict(acc)).toBe(false);
  });

  it('is not read into a parse from before verdict kinds, or a culprit verdict that names someone', () => {
    expect(blamesNoCharacter({ accused: [], charge: 'Murder' })).toBe(false);
    expect(blamesNoCharacter({ verdictKind: 'culprit', accused: ['Vic'], charge: 'Murder' })).toBe(false);
    expect(blamesNoCharacter({ verdictKind: 'overdose', accused: [], charge: 'Overdose' })).toBe(false);
  });

  it('needs the room\'s words as the charge: a culprit parse with neither accused nor charge failed (fix batch, finding 6)', () => {
    expect(blamesNoCharacter({ verdictKind: 'culprit', accused: [], charge: '' })).toBe(false);
    expect(blamesNoCharacter({ verdictKind: 'culprit', accused: [], charge: '   ' })).toBe(false);
    expect(blamesNoCharacter({ verdictKind: 'culprit', accused: [] })).toBe(false);
  });
});

describe('Review Focus 4: the verdicts reach SESSION_FACTS and the arc writer\'s block', () => {
  it('a split vote, with the adopted option marked', () => {
    const r = bothRenders({
      verdictKind: 'culprit', accused: ['Remi'], charge: 'Murder of Marcus Blackwood',
      votes: [{ option: 'Remi', count: 7, adopted: true }, { option: 'Vic', count: 4, adopted: false }]
    });
    const line = 'Remi 7, adopted by the group statement; Vic 4';
    expect(formatSplitVote(r.facts.accusation.votes)).toBe(line);
    expect(r.playerFocus.accusation.votes).toHaveLength(2);
    expect(r.sessionFacts).toContain(`FINAL VOTE (split): ${line}`);
    expect(r.arc).toContain(`**Final Vote (split):** ${line}`);
  });

  it('a tie the statement adopted neither side of', () => {
    const r = bothRenders({
      verdictKind: 'overdose', accused: [], charge: 'Accidental overdose',
      votes: [{ option: 'Alex', count: 4, adopted: false }, { option: 'Vic', count: 4, adopted: false }]
    });
    const line = 'Alex 4; Vic 4. The group statement adopted none of these.';
    expect(r.sessionFacts).toContain(`FINAL VOTE (split): ${line}`);
    expect(r.arc).toContain(`**Final Vote (split):** ${line}`);
  });

  it('an institution verdict: no character in the dock, the room\'s words as the charge', () => {
    const r = bothRenders({ verdictKind: 'culprit', accused: [], charge: 'NeurAI\'s board, for erasing the evidence' });
    expect(r.playerFocus.primarySuspects).toEqual([]);
    expect(r.sessionFacts).toContain('ACCUSATION: no character (the group statement blames an institution or an unnamed person: see the charge)');
    expect(r.sessionFacts).toContain('CHARGE: NeurAI\'s board, for erasing the evidence');
    expect(r.arc).toContain('**Accused:** no character (the group statement blames an institution or an unnamed person: see the charge)');
    expect(r.arc).toContain('The group statement holds no character responsible');
    expect(r.arc).not.toContain('**Accused:** []');
  });

  it('a culprit parse that named no one and no charge is not an institution verdict (fix batch, finding 6)', () => {
    const r = bothRenders({ verdictKind: 'culprit', accused: [], charge: '' });
    expect(r.arc).not.toContain('Place no character');
    expect(r.arc).not.toContain('The group statement holds no character responsible');
    expect(r.sessionFacts).not.toContain('blames an institution');
    expect(r.arc).not.toContain('blames an institution');
  });

  it('a verdict with no culprit names no one', () => {
    const r = bothRenders({ verdictKind: 'overdose', accused: ['Marcus'], charge: 'Accidental overdose' });
    expect(r.sessionFacts).toContain('ACCUSATION: none (the room\'s verdict names no culprit: an overdose)');
    expect(r.arc).toContain('**Accused:** none (the room\'s verdict names no culprit: an overdose)');
    expect(r.sessionFacts).not.toContain('FINAL VOTE');
    expect(r.arc).not.toContain('Final Vote');
  });

  it('a parse from before phase 3 (no verdict kind, no votes) still renders', () => {
    const r = bothRenders({ accused: ['Vic'], charge: 'Murder' });
    expect(r.sessionFacts).toContain('ACCUSATION: Vic');
    expect(r.arc).toContain('**Accused:** ["Vic"]');
  });
});

describe('synthesizePlayerFocus: the investigation focus', () => {
  it('is the charge, and with none it never assumes a killing', () => {
    expect(synthesizePlayerFocus({ accusation: { charge: 'Accidental overdose' } }, {}).primaryInvestigation).toBe('Accidental overdose');
    const fallback = synthesizePlayerFocus({ accusation: {} }, {}).primaryInvestigation;
    expect(fallback).not.toMatch(/killed|murder/i);
    expect(fallback).toMatch(/Marcus Blackwood/);
  });
});
