/**
 * <DIRECTOR_GUIDANCE>: the director's standing notes, last in every writer's prompt (Q2
 * decision; spec 2026-09-19 §5.3).
 *
 * The section first carried the arc-selection gate's `outlineGuidance`, appended LAST to
 * the outline and article prompts (recency bias) and stated to outrank the craft rules
 * where they conflicted. Phase 4: the story meeting wrote it no more (brief 4.5), its last
 * readers went (brief 4.7b; R4), and the parameter and its label went with them (brief
 * 4.7c). The section carries the standing notes alone.
 */

const { PromptBuilder } = require('../prompt-builder');

const PROMPTS = {
  'character-voice': 'CV rules',
  'writing-principles': 'WP rules',
  'evidence-boundaries': 'EB rules',
  'section-rules': 'SR rules',
  'narrative-structure': 'NS rules',
  'formatting': 'FMT rules',
  'anti-patterns': 'AP rules',
  'editorial-design': 'ED rules'
};

function makeBuilder(theme = 'journalist', sessionConfig = {}) {
  const themeLoader = { loadPhasePrompts: jest.fn().mockResolvedValue(PROMPTS), validate: jest.fn() };
  return new PromptBuilder(themeLoader, theme, sessionConfig, { Vic: 'Vic Kingsley' });
}

const GUIDANCE = 'Lead with the money, not the vote.';

// Phase 4 (brief 4.6): the outline writer is the map writer, which reads the settled weave
// first. The arc selection's emphasis went with the arc selection (brief 4.5): the
// director's note from the story meeting is a standing note, and the map writer's
// <DIRECTOR_GUIDANCE> carries the standing notes. The detective has no map writer (R1).
const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
const { WEAVE, MAP } = require('./fixtures/rework-state');
const SETTLED_WEAVE = renderSettledWeave(WEAVE, null);

describe('buildOutlinePrompt — <DIRECTOR_GUIDANCE>', () => {
  const MEETING_NOTE = { gate: 'arc-selection', kind: 'approval', round: 1, text: GUIDANCE, at: '2026-10-03T09:00:00.000Z' };

  it("appends the standing notes, the meeting's note among them, as the LAST section of the user prompt", async () => {
    const { userPrompt } = await makeBuilder().buildOutlinePrompt(SETTLED_WEAVE, [], [], null, { gateNotes: [MEETING_NOTE] });
    expect(userPrompt).toMatch(/^<DIRECTOR_GUIDANCE>$/m);
    expect(userPrompt).toContain(GUIDANCE);
    expect(userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('omits the section entirely when there is no note, and reads no arc-selection emphasis', async () => {
    const { userPrompt } = await makeBuilder().buildOutlinePrompt(SETTLED_WEAVE, [], [], null, { directorGuidance: GUIDANCE });
    expect(userPrompt).not.toMatch(/^<DIRECTOR_GUIDANCE>$/m);
    expect(userPrompt).not.toContain(GUIDANCE);
  });
});

// Phase 4 (brief 4.7b): the article writer reads the settled weave and the map, and its
// <DIRECTOR_GUIDANCE> carries the standing notes alone, as the map writer's does: the arc
// selection's emphasis went with its last readers (R4).
describe('buildArticlePrompt — <DIRECTOR_GUIDANCE>', () => {
  const MEETING_NOTE = { gate: 'arc-selection', kind: 'approval', round: 1, text: GUIDANCE, at: '2026-10-03T09:00:00.000Z' };

  it("appends the standing notes, the meeting's note among them, as the LAST section of the user prompt", async () => {
    const { userPrompt } = await makeBuilder().buildArticlePrompt(SETTLED_WEAVE, MAP, [], null, null, null, { gateNotes: [MEETING_NOTE] });
    expect(userPrompt).toMatch(/^<DIRECTOR_GUIDANCE>$/m);
    expect(userPrompt).toContain(GUIDANCE);
    expect(userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('omits the section entirely when there is no note, and reads no arc-selection emphasis', async () => {
    const { userPrompt } = await makeBuilder().buildArticlePrompt(SETTLED_WEAVE, MAP, [], null, null, null, { directorGuidance: GUIDANCE });
    expect(userPrompt).not.toMatch(/^<DIRECTOR_GUIDANCE>$/m);
    expect(userPrompt).not.toContain(GUIDANCE);
  });
  // Phase 4 (brief 4.7b; R1): the detective's article writer went with the old stages.
});

// Phase 4 (brief 4.7b; R4): the story meeting wrote the arc selection's guidance no more
// (brief 4.5), and its last readers, the article writer and its rework, read the standing
// notes alone, so the channel went with them.
describe('_outlineGuidance state channel', () => {
  const { ReportStateAnnotation, ROLLBACK_CLEARS, ROLLBACK_CLEARS_EXEMPT, getDefaultState } = require('../workflow/state');

  it('is gone with its last readers: no channel, no default, and no rollback list names it', () => {
    expect(Object.keys(ReportStateAnnotation.spec)).not.toContain('_outlineGuidance');
    expect(getDefaultState()).not.toHaveProperty('_outlineGuidance');
    Object.entries(ROLLBACK_CLEARS).forEach(([point, fields]) => expect(`${point}: ${fields.includes('_outlineGuidance')}`).toBe(`${point}: false`));
    expect([...(ROLLBACK_CLEARS_EXEMPT || [])]).not.toContain('_outlineGuidance');
  });
});

describe('reporting mode REPLACES the persona (BASELINE §4 class 6)', () => {
  // Both remote sessions of the last five were written as on-site. The rule
  // existed at character-voice.md lines 89-94 but lost to the on-site persona
  // stated earlier in the same file and to hardConstraints' own
  // `use "We decided"` line. One mode block, stated once, wins.
  //
  // Phase 3 (3.1): the journalist's block is the rule set's mode file (T8's mode
  // part). "You did not vote" left the block: it is T8's mode-independent part, in
  // the truth rules every writer reads from wave 2 on.
  // Brief 4.13 (R14): the journalist's mode files, from the folder its config names.
  const { loadModeBlock } = require('../rule-set');
  const JOURNALIST_REMOTE = loadModeBlock('remote', { theme: 'journalist' });
  const JOURNALIST_ONSITE = loadModeBlock('on-site', { theme: 'journalist' });

  it('remote: carries the remote block and not the on-site one', async () => {
    const { systemPrompt } = await makeBuilder('journalist', { reportingMode: 'remote' })
      .buildArticlePrompt(SETTLED_WEAVE, MAP);
    expect(systemPrompt).toContain(JOURNALIST_REMOTE);
    expect(systemPrompt).not.toContain(JOURNALIST_ONSITE);
  });

  it('on-site: carries the on-site block and not the remote one', async () => {
    const { systemPrompt } = await makeBuilder('journalist', { reportingMode: 'on-site' })
      .buildArticlePrompt(SETTLED_WEAVE, MAP);
    expect(systemPrompt).toContain(JOURNALIST_ONSITE);
    expect(systemPrompt).not.toContain(JOURNALIST_REMOTE);
  });

  it('defaults to on-site when the session config says nothing', async () => {
    const { systemPrompt } = await makeBuilder('journalist', {})
      .buildArticlePrompt(SETTLED_WEAVE, MAP);
    expect(systemPrompt).toContain(JOURNALIST_ONSITE);
  });

  it('no longer tells the reporter to write "We decided"', async () => {
    const { systemPrompt } = await makeBuilder('journalist', { reportingMode: 'remote' })
      .buildArticlePrompt(SETTLED_WEAVE, MAP);
    // This line directly contradicted the remote rule AND made Nova a member of
    // the room in both modes. It is gone, along with the stray detective line
    // that sat beside it in the JOURNALIST constraints.
    expect(systemPrompt).not.toContain('We decided');
    expect(systemPrompt).not.toContain('you ARE the detective');
  });
  // Phase 4 (brief 4.7b; R1): the detective's article writer, the last writer to carry the
  // detective's remote block, went with the old stages.
});

describe('the evaluator scores reporter mode (BASELINE §4 class 6)', () => {
  const {
    _testing: { getArticleCriteria, buildEvaluationUserPrompt }
  } = require('../workflow/nodes/evaluator-nodes');

  // Brief 4.7a: the article judge scores the truth criteria alone, and the reporting mode
  // with them: T8 (novaPositionTruth) and T7 (stagesTruth) read the session's mode block,
  // each structural. The weighted reporterMode criterion went with the weighted criteria,
  // and the detective's article criteria with its old stages (R1).
  it('the article judge scores the reporting mode through its structural truth criteria, which read the mode block', () => {
    const criteria = getArticleCriteria();
    expect(criteria.reporterMode).toBeUndefined();
    for (const key of ['novaPositionTruth', 'stagesTruth']) {
      expect([key, criteria[key].type, criteria[key].truth, criteria[key].reads.includes('modeBlock')]).toEqual([key, 'structural', true, true]);
    }
  });

  it('the evaluation user prompt states the session mode', () => {
    const remote = buildEvaluationUserPrompt('article', {
      contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'remote' }
    });
    expect(remote).toMatch(/REPORTING MODE/i);
    expect(remote).toContain('remote');

    const onsite = buildEvaluationUserPrompt('article', {
      contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'on-site' }
    });
    expect(onsite).toContain('on-site');
  });
});

describe('<DIRECTOR_GUIDANCE> standing notes (spec 2026-09-19 §5.3)', () => {
  const { buildDirectorGuidanceSection, filterGateNotes } = require('../prompt-builder');
  const NOTES = [
    { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the vote arc.', at: '2026-09-19T10:00:00.000Z' },
    { gate: 'outline', kind: 'rejection', round: 1, text: 'Lead with the ledger.', at: '2026-09-19T11:00:00.000Z' }
  ];
  // Brief 4.7c: the notes are the section's one input. The arc stop's guidance, which every
  // caller passed as null since brief 4.7b, went with its label ("The director reviewed the
  // arcs and asks for this emphasis"), and the tests of a section carrying it went too.
  it('notes only → the section carries only the standing-notes paragraph, in order, labelled', () => {
    const section = buildDirectorGuidanceSection(NOTES);
    expect(section.startsWith('<DIRECTOR_GUIDANCE>\nStanding notes the director gave at earlier stops, in order.')).toBe(true);
    // Phase 1 brief 1.1: an approval note has NOT been applied by a rework, so the
    // old blanket "each was already applied at its own gate" was a lie about it.
    expect(section).toContain('a rejection note was applied by the rework at its own stop');
    expect(section).toContain('an approval note is forward guidance');
    expect(section).toContain('Keep honoring each in what you write now.');
    expect(section).not.toContain('outranks');
    const a = section.indexOf('- [arc-selection, rejection 1] Drop the vote arc.');
    const b = section.indexOf('- [outline, rejection 1] Lead with the ledger.');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(section.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('nothing → empty string', () => {
    expect(buildDirectorGuidanceSection([])).toBe('');
    expect(buildDirectorGuidanceSection(null)).toBe('');
    expect(buildDirectorGuidanceSection()).toBe('');
    expect(buildDirectorGuidanceSection([null, { text: '   ' }])).toBe('');
  });

  it("takes the standing notes alone: a call in the retired shape fails loud, naming what went", () => {
    expect(() => buildDirectorGuidanceSection(null, NOTES)).toThrow(/standing notes alone/);
    expect(() => buildDirectorGuidanceSection(GUIDANCE)).toThrow(/standing notes alone/);
    expect(() => buildDirectorGuidanceSection(GUIDANCE, NOTES)).toThrow(/standing notes alone/);
  });

  it('filterGateNotes drops only the note whose text is the feedback being acted on', () => {
    expect(filterGateNotes(NOTES, 'Lead with the ledger.', 'outline')).toEqual([NOTES[0]]);
    expect(filterGateNotes(NOTES, null, 'outline')).toEqual(NOTES);
    expect(filterGateNotes(NOTES, 'something else', 'outline')).toEqual(NOTES);
    expect(filterGateNotes(null, 'x', 'outline')).toEqual([]);
  });

  // Phase 1 brief 1.1: with approval notes in the channel a text-only match would
  // silently delete a sentence the director reused. The note being acted on is the
  // REJECTION at the stop being reworked; nothing else may be dropped.
  it('filterGateNotes keeps a same-text note of another kind, or from another stop', () => {
    const reused = [
      { gate: 'outline', kind: 'approval', round: 1, text: 'Lead with the ledger.' },
      { gate: 'article', kind: 'rejection', round: 1, text: 'Lead with the ledger.' },
      { gate: 'outline', kind: 'rejection', round: 1, text: 'Lead with the ledger.' }
    ];
    expect(filterGateNotes(reused, 'Lead with the ledger.', 'outline')).toEqual([reused[0], reused[1]]);
    expect(filterGateNotes(reused, 'Lead with the ledger.', 'article')).toEqual([reused[0], reused[2]]);
  });

  // Review fix round 1: an omitted gate used to match any stop, which is exactly the
  // cross-stop deletion the narrowing removes. A caller that forgets the gate must
  // fail loud, not quietly get the old behaviour back.
  it('filterGateNotes throws when the gate is missing or not a string', () => {
    expect(() => filterGateNotes(NOTES, 'Lead with the ledger.')).toThrow(/gate is required/);
    expect(() => filterGateNotes(NOTES, 'Lead with the ledger.', '')).toThrow(/gate is required/);
    expect(() => filterGateNotes(NOTES, 'Lead with the ledger.', '  ')).toThrow(/gate is required/);
    expect(() => filterGateNotes(NOTES, null, { gate: 'outline' })).toThrow(/gate is required/);
  });

  it('filterGateNotes treats a note with no kind as a rejection (notes written before approval notes existed)', () => {
    const legacy = [{ gate: 'outline', round: 1, text: 'Lead with the ledger.' }];
    expect(filterGateNotes(legacy, 'Lead with the ledger.', 'outline')).toEqual([]);
  });

  it('buildOutlinePrompt and buildArticlePrompt read options.gateNotes and still end with the section', async () => {
    const o = await makeBuilder().buildOutlinePrompt(SETTLED_WEAVE, [], [], null, { gateNotes: NOTES });
    expect(o.userPrompt).toContain('- [outline, rejection 1] Lead with the ledger.');
    expect(o.userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
    // Brief 4.7b: the article writer's section is the standing notes alone (R4).
    const a = await makeBuilder().buildArticlePrompt(SETTLED_WEAVE, MAP, [], null, null, null, { directorGuidance: GUIDANCE, gateNotes: NOTES });
    expect(a.userPrompt).not.toContain(GUIDANCE);
    expect(a.userPrompt).toContain('- [arc-selection, rejection 1] Drop the vote arc.');
    expect(a.userPrompt.trim().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });
});
