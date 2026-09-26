/**
 * One pronoun per character, and none guessed (phase 2 final fix wave, item 3).
 *
 * generateRosterSection gave every canonical character without a roster pronoun
 * they/them. The NPC block below it then gave Marcus he/him and called it
 * authoritative, so the article rework render read "Marcus → Marcus Blackwood
 * (they/them)" and, a few lines later, "(he/him)": defect #3 of the report-quality
 * baseline. The same section reaches the article writer and reworker and all three
 * judges.
 *
 * - An NPC is listed once, in the NPC block, with its canon pronoun (or none).
 * - A canonical character not on this session's roster prints no pronoun.
 * - A roster character with no captured pronoun keeps they/them.
 * - Pronouns show for the journalist theme only.
 */

const { generateRosterSection, PromptBuilder } = require('../prompt-builder');

const CANONICAL = {
  Alex: 'Alex Reeves',
  Morgan: 'Morgan Reed',
  Riley: 'Riley Torres',
  Jamie: 'Jamie Park',
  Marcus: 'Marcus Blackwood',
  Blake: 'Blake'
};
const ROSTER = ['Alex', 'Morgan', 'Riley'];
const PRONOUNS = { Alex: 'he/him', Morgan: 'she/her' };

const linesOf = (section) => section.split('\n');

describe('generateRosterSection (journalist)', () => {
  const section = generateRosterSection('journalist', CANONICAL, null, PRONOUNS, ROSTER);

  it('lists Marcus once, in the NPC block, with his canon pronoun', () => {
    const marcus = linesOf(section).filter((l) => l.includes('Marcus'));
    expect(marcus).toEqual(['- Marcus Blackwood (he/him) - the murder victim - central to every arc']);
    expect(section).not.toContain('Marcus → Marcus Blackwood');
  });

  it('lists Blake once, in the NPC block, with no pronoun (the canon states none)', () => {
    const blake = linesOf(section).filter((l) => /\bBlake\b/.test(l));
    expect(blake).toEqual(['- Blake - the valet NPC']);
  });

  it('gives a roster character its captured pronoun', () => {
    expect(section).toContain('- Alex → Alex Reeves (he/him)');
    expect(section).toContain('- Morgan → Morgan Reed (she/her)');
  });

  it('keeps they/them for a roster character with no captured pronoun', () => {
    expect(section).toContain('- Riley → Riley Torres (they/them)');
  });

  it('prints no pronoun for a canonical character not on this session\'s roster, and says why', () => {
    expect(linesOf(section)).toContain('- Jamie → Jamie Park');
    expect(section).toMatch(/no pronoun .* not on this session's roster/i);
  });

  it('matches roster names case-insensitively, and takes {name} roster entries', () => {
    const s = generateRosterSection('journalist', CANONICAL, null, { alex: 'he/him' }, [{ name: 'ALEX' }, 'riley']);
    expect(s).toContain('- Alex → Alex Reeves (he/him)');
    expect(s).toContain('- Riley → Riley Torres (they/them)');
    expect(linesOf(s)).toContain('- Morgan → Morgan Reed');
  });

  it('counts a character with a captured pronoun as on the roster even when the roster list is missing', () => {
    const s = generateRosterSection('journalist', CANONICAL, null, PRONOUNS, null);
    expect(s).toContain('- Alex → Alex Reeves (he/him)');
    expect(linesOf(s)).toContain('- Riley → Riley Torres');
  });
});

describe('generateRosterSection (detective)', () => {
  it('shows no pronouns, and still lists each NPC once', () => {
    const section = generateRosterSection('detective', CANONICAL, null, PRONOUNS, ROSTER);
    expect(section).not.toMatch(/\((he\/him|she\/her|they\/them)\)/);
    expect(linesOf(section).filter((l) => l.includes('Marcus'))).toEqual(['- Marcus Blackwood - the murder victim']);
    expect(section).toContain('- Riley → Riley Torres');
  });
});

describe('the writers\' and judges\' roster section passes the session roster', () => {
  it('PromptBuilder#_rosterSection reads sessionConfig.roster', () => {
    const builder = new PromptBuilder({}, 'journalist', { roster: ROSTER, rosterPronouns: PRONOUNS }, CANONICAL, null);
    const section = builder._rosterSection();
    expect(section).toContain('- Riley → Riley Torres (they/them)');
    expect(linesOf(section)).toContain('- Jamie → Jamie Park');
    expect(linesOf(section).filter((l) => l.includes('Marcus'))).toHaveLength(1);
  });
});
