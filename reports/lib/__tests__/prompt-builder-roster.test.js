/**
 * The victim's pronouns (BASELINE.md §4 class 3)
 *
 * 26 pronoun/fact errors across 4 of 5 sessions, "above all Marcus written
 * they/them". The cause is mechanical: rosterPronouns is keyed by the SESSION
 * ROSTER, the victim is never on the roster, so Marcus has no entry and
 * generateRosterSection's resolvePronouns default (they/them) never applies to
 * him at all — he simply is not in the roster block, and the model guesses.
 *
 * The NPCs are fixed canon, so their pronouns belong in theme-config next to
 * their names, and the roster block now states them.
 */

const { generateRosterSection } = require('../prompt-builder');
const { getThemeNPCs, getThemeNPCPronouns, getThemeNPCEntries } = require('../theme-config');

const CANONICAL = { Vic: 'Vic Kingsley', Mel: 'Mel Nilsson' };

describe('generateRosterSection — NPC pronoun line', () => {
  it('states the NPC pronouns for the journalist theme', () => {
    const section = generateRosterSection('journalist', CANONICAL, null, { Vic: 'he/him' });
    expect(section).toContain('Non-player characters');
    expect(section).toContain('Marcus Blackwood (he/him)');
    expect(section).toContain('Nova (she/her)');
  });

  it('still defaults an un-entered roster member to they/them', () => {
    const section = generateRosterSection('journalist', CANONICAL, null, { Vic: 'he/him' });
    expect(section).toContain('Vic → Vic Kingsley (he/him)');
    expect(section).toContain('Mel → Mel Nilsson (they/them)');
  });

  it('omits Blake, whose pronouns the canon never states', () => {
    // The references use they/them for Blake in prose but never declare them, so
    // asserting a pronoun here would be exactly the invention this fixes.
    const section = generateRosterSection('journalist', CANONICAL, null, {});
    expect(section).not.toMatch(/Blake \([^)]*\/[^)]*\)/);
  });

  it('lists the detective theme’s NPCs, without Nova and without pronouns (X-6)', () => {
    // X-6 suppresses the pronoun annotation for the detective theme; the NPC line
    // follows the same rule so the block stays internally consistent.
    const section = generateRosterSection('detective', CANONICAL, null, { Vic: 'he/him' });
    expect(section).toContain('Non-player characters');
    expect(section).toContain('Marcus Blackwood');
    expect(section).not.toContain('(he/him)');
    expect(section).not.toContain('Nova');
  });

  it('keeps working when there are no canonical characters yet', () => {
    expect(() => generateRosterSection('journalist', null, null, null)).not.toThrow();
  });
});

describe('theme-config NPC entries', () => {
  it('keeps getThemeNPCs returning plain names (every existing consumer)', () => {
    expect(getThemeNPCs('journalist')).toEqual(['Marcus', 'Nova', 'Blake', 'Valet']);
    expect(getThemeNPCs('detective')).toEqual(['Marcus', 'Blake', 'Valet']);
    expect(getThemeNPCs('nope')).toEqual([]);
  });

  it('gives each NPC entry a canonical display name, and pronouns where canon states them', () => {
    const entries = getThemeNPCEntries('journalist');
    const marcus = entries.find(e => e.name === 'Marcus');
    expect(marcus.fullName).toBe('Marcus Blackwood');
    expect(marcus.pronouns).toBe('he/him');
    const nova = entries.find(e => e.name === 'Nova');
    expect(nova.pronouns).toBe('she/her');
    // Valet is an alias of Blake and is not displayed on its own line.
    const valet = entries.find(e => e.name === 'Valet');
    expect(valet.aliasOf).toBe('Blake');
  });

  it('exposes a name -> pronouns map for the fact-check scan', () => {
    expect(getThemeNPCPronouns('journalist')).toEqual({
      Marcus: 'he/him',
      Nova: 'she/her'
    });
    expect(getThemeNPCPronouns('detective')).toEqual({ Marcus: 'he/him' });
    expect(getThemeNPCPronouns('nope')).toEqual({});
  });
});

describe('the article prompt names the NPC line as authoritative', () => {
  const fs = require('fs');
  const path = require('path');

  it('character-voice.md points at the roster AND the NPC line', () => {
    const file = path.join(
      __dirname, '..', '..', '.claude', 'skills', 'journalist-report',
      'references', 'prompts', 'character-voice.md'
    );
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain('Non-player characters');
  });
});

describe('fact-check pronoun scan (class 3)', () => {
  const { factCheckContentBundle } = require('../content-bundle-fact-check');

  const prose = (text) => ({
    contentBundle: {
      sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text }] }],
      evidenceCards: []
    },
    npcPronouns: { Marcus: 'he/him', Nova: 'she/her' }
  });

  it('flags they/them used of Marcus', () => {
    const result = factCheckContentBundle(prose('Marcus was dead before they could finish the sentence.'));
    expect(result.structuralIssues.join(' ')).toMatch(/pronoun/i);
    expect(result.structuralIssues.join(' ')).toContain('Marcus');
  });

  it('flags a possessive their near Marcus', () => {
    const result = factCheckContentBundle(prose('Marcus kept their own counsel about the compound.'));
    expect(result.structuralIssues.join(' ')).toMatch(/pronoun/i);
  });

  it('accepts he/him used of Marcus', () => {
    const result = factCheckContentBundle(prose('Marcus was dead before he could finish the sentence.'));
    expect(result.structuralIssues).toEqual([]);
  });

  it('does not flag a they/them more than six words away from the name', () => {
    const result = factCheckContentBundle(prose(
      'Marcus signed the compound release in February, and long before the party ended the others had already made up their minds.'
    ));
    expect(result.structuralIssues).toEqual([]);
  });

  it('does nothing when no NPC pronoun map is supplied', () => {
    const args = prose('Marcus was dead before they could finish the sentence.');
    delete args.npcPronouns;
    expect(factCheckContentBundle(args).structuralIssues).toEqual([]);
  });
});
