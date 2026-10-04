/**
 * The rendered prompts do not contradict the session's reporting mode (I3)
 *
 * `reportingMode` REPLACES the reporter's persona: `_buildReportingModeBlock` puts
 * one mode block in the article SYSTEM prompt, right after the identity line. Since
 * phase 3 (task 3.1) the journalist's block is the mode file of the rule set
 * (`references/rules/mode-on-site.md` / `mode-remote.md`, through `loadModeBlock`):
 * T8's mode part, Nova's position as the uninterested third party and what Nova
 * could witness. The detective keeps the old one-line blocks
 * (DETECTIVE_REPORTING_MODE_BLOCKS).
 *
 * The craft prompts then said the opposite, several thousand tokens later and
 * LAST (the <RULES> block is placed last on purpose, for recency):
 * character-voice.md shipped "DEFAULT (on-site): Was surveilling the party", "The
 * reporter was THERE", "I was there when the investigation cracked open", a
 * participatory phrase list of in-the-room lines, and a "REPORTING MODE OVERRIDE"
 * section that arrived after all of it. section-rules.md required a lede beat of
 * "Nova's presence — she was there". writing-principles.md worked alongside Blake
 * all night. anti-patterns.md opened with "She was there." And prompt-builder's
 * own `voiceQuestion` asked for sentences from "someone who was in that room",
 * while `revisionVoice` — the system prompt for every paid article revision, which
 * carries NO mode block at all — listed "I was there" as the voice to embody.
 *
 * Both remote sessions of the last five shipped as on-site.
 *
 * These tests render the REAL prompt files (no ThemeLoader mock) and no model is
 * called: buildArticlePrompt is pure string assembly.
 */

const { createPromptBuilder } = require('../prompt-builder');
const { _testing: { buildArticleRevisionSystemPrompt } } = require('../workflow/nodes/ai-nodes');
const { loadModeBlock } = require('../rule-set');
const { findRemovedPhrases } = require('./fixtures/removed-phrases');
const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
const { WEAVE } = require('./fixtures/rework-state');

/** The settled weave the map writer reads first (phase 4, brief 4.6). */
const SETTLED_WEAVE = renderSettledWeave(WEAVE, null);

/**
 * Director notes with prose, so the <INVESTIGATION_OBSERVATIONS> header renders:
 * its first two lines used to say "What you observed" and "who you saw".
 */
const DIRECTOR_NOTES = {
  rawProse: 'Vic and Mel argued at the bar.',
  quotes: [],
  transactionReferences: [],
  postInvestigationDevelopments: []
};

/** The whole rendered article prompt for `mode`, system + user. */
async function renderArticlePrompt(mode) {
  const builder = createPromptBuilder({
    theme: 'journalist',
    sessionConfig: { reportingMode: mode, journalistFirstName: 'Cass', roster: ['Vic'] }
  });
  const { systemPrompt, userPrompt } = await builder.buildArticlePrompt(
    { sections: [] }, null, [], null, DIRECTOR_NOTES, null, {}
  );
  return { systemPrompt, userPrompt, all: systemPrompt + '\n' + userPrompt };
}

/**
 * Sentences that assert the reporter's physical presence as a fact. Every one of
 * them was in the rendered prompt for a REMOTE session.
 */
const ON_SITE_PERSONA = [
  'surveilling the party',
  'The reporter was THERE',
  'I was there when the investigation cracked open',
  'I was in that room when',
  'Standing there, I could see',
  'We all felt it',
  'The tip came through at 3AM',
  'REPORTING MODE OVERRIDE',
  'in-the-muck',
  'who was present at the scene',
  'two hours in that room',
  'spent two hours working alongside',
  'someone who was in that room',
  "Nova's presence — she was there",
  'The reporter has opinions. She was there.',
  // Phase 2 (2.6): presence lines that now defer to the mode block.
  // lib/prompt-builder.js, the article prompt and the shared observations header
  'You watched this play back on a screen',
  'Something you DIRECTLY OBSERVED',
  '"I watched..." / "I saw..."',
  'was physically present, witnessing',
  'directly witnessed these',
  'I watched them circle each other',
  'What you observed during the investigation',
  'who you saw talking to whom',
  // the craft files
  '(Nova was there)',
  'walked over with a memory',
  'I saw Taylor at the Valet station',
  'I watched the room react',
  '"I noticed," "What I saw was"',
  'the whole evening on this room',
  'Does every "I watched" / "I saw"',
  "Nova's witness line",
  // Fix round 1 (ruling PR2: every presence or absence line defers to the block)
  'things Nova witnessed this morning',
  'I also watched',
  'Opinionated, present, participating',
  'She experienced it.',
  'we saw Taylor at Valet',
  'saw Taylor at Valet at 8:15',
  'reasons for being there',
  // Final fix wave item 6 (ruling PR2): the last presence lines. The preprocessor's
  // and the deep-dive doc's are checked where they live, below.
  'Who she observed visiting the Valet station',
  'what she actually observed and documented',
  'or ABOUT events Nova observed?',
  'saw Taylor at Valet at 8:15 PM',
  "Director Notes = Nova's Observations"
];

/**
 * Phase 2 (2.6): lines outside the block that restated a remote session's
 * absence, or told the writer to announce how each thing reached her. 092026's
 * remote article said it was not there five times. The block says it once now.
 */
const RESTATEMENTS = [
  'received real-time tips from investigators',
  'received reports and tips as they happened',
  'and says how it reached her'
];

describe('article prompt, remote session', () => {
  let rendered;
  beforeAll(async () => { rendered = await renderArticlePrompt('remote'); });

  // Phase 3 (3.2): character-voice.md, whose POV section named the mode in the user
  // prompt, is retired. The truth rules (T8, in the system prompt) defer to the block.
  it('states the mode in the system prompt, where the truth rules defer to it', () => {
    expect(rendered.systemPrompt).toContain('The reporting-mode block states what Nova could witness in this session.');
    expect(rendered.userPrompt).not.toContain('<truth-rules>');
  });

  it('carries the remote mode block in the SYSTEM prompt', () => {
    expect(rendered.systemPrompt).toContain(loadModeBlock('remote'));
  });

  it('closes the block in its tag, then a blank line, before the rest of the system prompt', () => {
    // Review of 3.1, finding 4: the block opens with "## T8, remote", and the article
    // system prompt's next part (the roster) has no heading of its own.
    expect(rendered.systemPrompt).toContain('<mode-remote>\n## T8, remote');
    expect(rendered.systemPrompt).toContain('\n</mode-remote>\n\n');
  });

  it.each(ON_SITE_PERSONA)('does not assert: %s', (phrase) => {
    expect(rendered.all).not.toContain(phrase);
  });

  it.each(RESTATEMENTS)('does not restate the absence outside the block: %s', (phrase) => {
    expect(rendered.all).not.toContain(phrase);
  });

  it('states the remote block once, in the system prompt only', () => {
    expect(rendered.all.split(loadModeBlock('remote')).length - 1).toBe(1);
    expect(rendered.userPrompt).not.toContain(loadModeBlock('remote'));
  });
});

describe('article prompt, on-site session', () => {
  let rendered;
  beforeAll(async () => { rendered = await renderArticlePrompt('on-site'); });

  it('states the mode in the system prompt, where the truth rules defer to it', () => {
    expect(rendered.systemPrompt).toContain('The reporting-mode block states what Nova could witness in this session.');
  });

  it('carries the on-site mode block in the SYSTEM prompt, which is where presence is asserted', () => {
    expect(rendered.systemPrompt).toContain(loadModeBlock('on-site'));
  });

  it.each(ON_SITE_PERSONA)('does not assert it in the rules block either: %s', (phrase) => {
    // The mode block is the single authority in BOTH modes. An on-site session
    // gets its presence from there, not from a persona sentence in a craft file
    // that a remote session would also be reading.
    expect(rendered.all).not.toContain(phrase);
  });

  it.each(RESTATEMENTS)('carries no mode restatement either: %s', (phrase) => {
    expect(rendered.all).not.toContain(phrase);
  });
});

// Phase 4 (brief 4.7b; R1): the template variables went with the parked detective's
// craft files, the last prompt files a writer loaded; the rendered prompt still carries
// none unresolved.
describe('REPORTING_MODE substitution', () => {
  it('leaves no unresolved {{REPORTING_MODE}} in the rendered prompt', async () => {
    const { all } = await renderArticlePrompt('remote');
    expect(all).not.toContain('{{REPORTING_MODE}}');
  });
});

describe('article REVISION system prompt', () => {
  // A revision is where a remote article would be "corrected" back into an on-site
  // one, so the prompt must not name a place the reporter was. Since phase 2 (2.3)
  // it is the article writer's system prompt (which carries the mode block) followed
  // by the rework rules; these read the whole of it, for a remote session.
  let revisionPrompt;
  beforeAll(async () => {
    const builder = createPromptBuilder({
      theme: 'journalist',
      sessionConfig: { reportingMode: 'remote', journalistFirstName: 'Cass', roster: ['Vic'] }
    });
    revisionPrompt = await buildArticleRevisionSystemPrompt(builder, 'journalist');
  });

  it('does not list a presence claim as the voice to embody', () => {
    expect(revisionPrompt).not.toContain('"I was there"');
    expect(revisionPrompt).not.toContain('in-the-muck');
  });

  it('does not prescribe a presence claim as the rewrite for observer voice', () => {
    // The transform example told every revision, remote sessions included, to turn
    // "The group came to a conclusion" into "I watched them reach their conclusion".
    expect(revisionPrompt).not.toMatch(/I watched them/);
    expect(revisionPrompt).not.toMatch(/I was there when/);
  });

  // Phase 3 (3.2): the first person stays; "participatory and implicated" went (T8, C12).
  it('still asks for the first person, and nothing participatory', () => {
    expect(revisionPrompt).toMatch(/in the first person/);
    expect(revisionPrompt).not.toMatch(/participatory/i);
  });
});

/**
 * The block now sits in six more system prompts (phase 1, brief 1.5).
 *
 * The arc writer and the outline writer were never told the mode: the last
 * remote session's arc summaries said "I watched" and its outline carried six
 * presence claims, because the only place the mode was ever stated was the
 * ARTICLE system prompt, two paid calls later. The wording has one source (the
 * journalist's mode files, through loadModeBlock), rendered in the same position
 * everywhere: right after the identity line.
 */
describe('the mode block reaches the arc and outline writers', () => {
  const { createPromptBuilder: makeBuilder } = require('../prompt-builder');
  const REPORTING_MODE_BLOCKS = { 'on-site': loadModeBlock('on-site'), remote: loadModeBlock('remote') };
  const { _testing: { buildOutlineRevisionSystemPrompt, buildArticleRevisionSystemPrompt: articleReworkSystem } } = require('../workflow/nodes/ai-nodes');
  const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');

  /**
   * Every system prompt that must carry the block, for one reporting mode, except
   * the two article prompts (below): the article writer's identity is three lines.
   * Since 2.3 each rework system prompt opens with its writer's, so it carries the
   * block once, in the writer's position.
   */
  async function systemPrompts(mode) {
    const sessionConfig = { reportingMode: mode, journalistFirstName: 'Cass', roster: ['Vic'] };
    const builder = makeBuilder({ theme: 'journalist', sessionConfig });
    // Phase 4 (brief 4.6): the outline writer is the map writer, which reads the settled weave.
    const { systemPrompt: outline } = await builder.buildOutlinePrompt(SETTLED_WEAVE);
    return {
      'outline generation': outline,
      'outline revision': await buildOutlineRevisionSystemPrompt(builder),
      // Phase 4 (brief 4.4): the arc writer writes the weave, and the interweaving
      // call went.
      'weave writer': arcTesting.weaveSystemPrompt(sessionConfig),
      // Both rework branches: a mode-blind rework puts the presence claims back
      // into a remote session's weave one paid call after generation avoided them.
      'arc rework (director-driven)': arcTesting.getArcRevisionSystemPrompt('send-back', sessionConfig),
      // Brief 4.5: the reweave is the director's round too.
      'arc rework (reweave)': arcTesting.getArcRevisionSystemPrompt('reweave', sessionConfig),
      'arc rework (evaluation-driven)': arcTesting.getArcRevisionSystemPrompt(null, sessionConfig)
    };
  }

  ['remote', 'on-site'].forEach((mode) => {
    describe(`${mode} session`, () => {
      let prompts;
      beforeAll(async () => { prompts = await systemPrompts(mode); });

      it.each([
        'outline generation',
        'outline revision',
        'weave writer',
        'arc rework (director-driven)',
        'arc rework (reweave)',
        'arc rework (evaluation-driven)'
      ])(
        'the %s system prompt states the mode, word for word, once',
        (name) => {
          expect(prompts[name]).toContain(REPORTING_MODE_BLOCKS[mode]);
          expect(prompts[name].split(REPORTING_MODE_BLOCKS[mode]).length - 1).toBe(1);
          expect(prompts[name]).not.toContain(REPORTING_MODE_BLOCKS[mode === 'remote' ? 'on-site' : 'remote']);
        }
      );

      it('places the block after the identity line, not at the end', () => {
        // Phase 3 (3.1): the block runs to several lines now, so it is found by its
        // first line, and the whole block must follow the identity line and its blank.
        const firstLine = REPORTING_MODE_BLOCKS[mode].split('\n')[0];
        Object.entries(prompts).forEach(([name, prompt]) => {
          const lines = prompt.split('\n');
          const at = lines.findIndex((l) => l === firstLine);
          expect(`${name}:${at}`).toBe(`${name}:2`);
          expect(`${name}:${lines.slice(2).join('\n').startsWith(REPORTING_MODE_BLOCKS[mode])}`).toBe(`${name}:true`);
        });
      });

      it('wraps the block in its tag, so the prompt\'s next part is not read as part of T8', () => {
        // Review of 3.1, finding 4: the block opens with a "## T8" heading, and the text
        // after it in the arc calls ("GAME CONTEXT:") has none of its own. The closing
        // tag ends the block; the outline writer's next part is its own tagged section.
        Object.entries(prompts).forEach(([name, prompt]) => {
          const lines = prompt.split('\n');
          const open = lines.indexOf(`<mode-${mode}>`);
          const close = lines.indexOf(`</mode-${mode}>`);
          expect(`${name}:${open}:${lines[open + 1]?.startsWith('## T8, ')}`).toBe(`${name}:2:true`);
          expect(`${name}:${close > open}:${/^(|<[a-z-]+>)$/.test(lines[close + 1])}`).toBe(`${name}:true:true`);
        });
      });

      it("the article rework states it once, where the article writer's system prompt does", async () => {
        // Phase 3 (3.2): the article writer's identity is one line now (its temporal
        // line went to the world and T7), so its block sits where every writer's does.
        // The rework system prompt opens with the writer's whole system prompt.
        const builder = makeBuilder({
          theme: 'journalist',
          sessionConfig: { reportingMode: mode, journalistFirstName: 'Cass', roster: ['Vic'] }
        });
        const writer = await builder.buildArticleSystemPrompt();
        const rework = await articleReworkSystem(builder, 'journalist');
        expect(rework.startsWith(`${writer}\n\n`)).toBe(true);
        expect(rework.split(REPORTING_MODE_BLOCKS[mode]).length - 1).toBe(1);
        expect(rework).not.toContain(REPORTING_MODE_BLOCKS[mode === 'remote' ? 'on-site' : 'remote']);
        const identityLines = writer.slice(0, writer.indexOf(REPORTING_MODE_BLOCKS[mode])).trimEnd().split('\n');
        expect(identityLines[0]).toMatch(/^You are Nova, writing/);
        expect(identityLines).toHaveLength(1);
      });
    });
  });

  it('defaults to on-site when the session carries no mode', async () => {
    const prompts = await systemPrompts(undefined);
    Object.values(prompts).forEach((prompt) => {
      expect(prompt).toContain(REPORTING_MODE_BLOCKS['on-site']);
    });
  });
});

/**
 * The journalist's mode blocks are T8's mode part (phase 3, task 3.1; spec T8 and
 * section 2). Each states Nova's position as the uninterested third party Fremont PD
 * required and what Nova could witness in that mode. In both, exposed memories are
 * turned in to Nova directly, anonymous unless the evidence log carries a name or the
 * director's notes record who turned the memory in (T6's two conditions, word for
 * word, so the block and T6 never disagree): the old remote block sent every exposure
 * through a tipster ("Every exposure ... reached you as tips"), which pushed the
 * article to name or invent exposers (plan review I6).
 *
 * Phase 2 (2.6) still holds for the remote block: the absence is said once, and
 * attribution where it matters. 092026's remote article said "I was not there.", "I
 * was not in that room." and "This is the story they told me." and the article
 * evaluation scored it as good voice. Task 3.8 (spec round 7, R13): Nova says it once,
 * early, as the start of Nova's questions, and the room's events are then told as
 * scenes; a source tag on every room event turned the story into a disclaimer.
 *
 * What moved out of the block in 3.1: "you did not vote" is T8's mode-independent
 * part and "you were not at the party" is T7, both in the truth rules, which every
 * writer and judge reads from wave 2 on.
 */
describe("the journalist mode blocks state T8's mode part", () => {
  const blocks = { 'on-site': loadModeBlock('on-site'), remote: loadModeBlock('remote') };

  it.each(['on-site', 'remote'])("%s: sits in its tag, opens with its T8 heading and states Nova's position", (mode) => {
    expect(blocks[mode]).toMatch(new RegExp(`^<mode-${mode}>\\n## T8, ${mode === 'remote' ? 'remote' : 'on site'}:`));
    expect(blocks[mode].endsWith(`\n</mode-${mode}>`)).toBe(true);
    expect(blocks[mode]).toMatch(/uninterested third party Fremont PD required/);
  });

  it.each(['on-site', 'remote'])("%s: exposed memories reach Nova directly, anonymous unless T6's records name who turned one in", (mode) => {
    expect(blocks[mode]).toMatch(/Exposed memories were turned in to Nova directly/);
    expect(blocks[mode]).toMatch(
      /anonymous unless the evidence log carries a name or the director's notes record who turned the memory in/
    );
  });

  it.each(['on-site', 'remote'])('%s: carries nothing on the removed list, tips and a gendered Nova included', (mode) => {
    expect(findRemovedPhrases(blocks[mode])).toEqual([]);
    expect(blocks[mode]).not.toMatch(/\btips?\b/i);
  });

  it('on site: Nova saw and heard the investigation, and "we" takes in the room only for being there', () => {
    expect(blocks['on-site']).toMatch(/saw and heard the investigation/);
    expect(blocks['on-site']).toMatch(/"we" may also take in the room/);
  });

  it('remote: Nova says once, early, that Nova monitored from outside, and then tells the room in scenes (R13)', () => {
    expect(blocks.remote).toMatch(/Nova monitored the investigation remotely, from outside the warehouse/);
    expect(blocks.remote).toMatch(/Nova says so once, early, as the start of Nova's questions/);
    expect(blocks.remote).toMatch(/After that the room's events are told as scenes/);
  });

  it('remote: attribution goes where it matters, and Nova never claims to have seen or heard the room (R13)', () => {
    expect(blocks.remote).toMatch(/Attribution goes where it matters: a line someone was overheard saying, and a claim about a person/);
    expect(blocks.remote).toMatch(/Nova never claims to have seen or heard the room/);
    expect(blocks.remote).toMatch(/A person is named as Nova's source only where the record names them/);
  });
});

/**
 * buildReportingModeBlock(sessionConfig, theme): the journalist reads the mode files;
 * the detective is parked (spec D13) and keeps today's strings, byte for byte.
 */
describe('buildReportingModeBlock', () => {
  const { buildReportingModeBlock, DETECTIVE_REPORTING_MODE_BLOCKS } = require('../prompt-builder');

  it.each(['on-site', 'remote'])('journalist, %s: the mode file', (mode) => {
    expect(buildReportingModeBlock({ reportingMode: mode }, 'journalist')).toBe(loadModeBlock(mode));
  });

  it('journalist: on site when the session carries no mode', () => {
    expect(buildReportingModeBlock({}, 'journalist')).toBe(loadModeBlock('on-site'));
    expect(buildReportingModeBlock(undefined, 'journalist')).toBe(loadModeBlock('on-site'));
  });

  it("detective: today's strings, unchanged", () => {
    expect(DETECTIVE_REPORTING_MODE_BLOCKS).toEqual({
      'on-site': 'You watched the investigation from inside the room and spoke to people there. You did not vote and you were not at the party; the party reaches you only through the memories people exposed.',
      remote: 'You were not in the room. Every exposure, observation, and the verdict reached you as tips from people who were there: show where each fact came from by attributing it to the people who told you. State your absence at most once in the whole piece; the attribution shows it everywhere else. You did not vote and you were not at the party.'
    });
    expect(buildReportingModeBlock({ reportingMode: 'remote' }, 'detective')).toBe(DETECTIVE_REPORTING_MODE_BLOCKS.remote);
    expect(buildReportingModeBlock({}, 'detective')).toBe(DETECTIVE_REPORTING_MODE_BLOCKS['on-site']);
  });

  it('throws on a theme it does not know, a missing one included', () => {
    expect(() => buildReportingModeBlock({}, 'noir')).toThrow(/noir/);
    expect(() => buildReportingModeBlock({})).toThrow(/theme/);
  });
});

/**
 * Phase 2 (2.6): the presence lines outside the article prompt defer to the
 * block too: the outline (third person in both modes), the arc writer's
 * categories line and the photo enrichment examples.
 */
describe('presence lines outside the article prompt', () => {
  it.each(['remote', 'on-site'])('the %s outline prompt carries none of them', async (mode) => {
    const builder = createPromptBuilder({
      theme: 'journalist',
      sessionConfig: { reportingMode: mode, journalistFirstName: 'Cass', roster: ['Vic'] }
    });
    const { systemPrompt, userPrompt } = await builder.buildOutlinePrompt(
      SETTLED_WEAVE, [], [], null, { directorNotes: DIRECTOR_NOTES }
    );
    const all = systemPrompt + '\n' + userPrompt;
    expect(all).toContain('<INVESTIGATION_OBSERVATIONS>');
    [...ON_SITE_PERSONA, ...RESTATEMENTS].forEach((phrase) => {
      expect(`${mode}: ${phrase}: ${all.includes(phrase)}`).toBe(`${mode}: ${phrase}: false`);
    });
  });

  // Since 2.3 the article rework carries the article writer's whole prompt, craft
  // files included, plus its rework rules, so every line reaches the reworker too.
  it.each(['remote', 'on-site'])('the %s article rework prompt carries none of them', async (mode) => {
    const { _testing: { buildArticleRevisionPrompt } } = require('../workflow/nodes/ai-nodes');
    const builder = createPromptBuilder({
      theme: 'journalist',
      sessionConfig: { reportingMode: mode, journalistFirstName: 'Cass', roster: ['Vic'] }
    });
    const system = await buildArticleRevisionSystemPrompt(builder, 'journalist');
    const user = await buildArticleRevisionPrompt(
      { outline: { sections: [] }, directorNotes: DIRECTOR_NOTES, sessionConfig: { roster: ['Vic'] } },
      'CONTEXT', 'PREVIOUS', builder
    );
    const all = system + '\n' + user;
    // Phase 3 (3.2): the rule set in place of the retired craft files.
    expect(all).toContain('<world>');
    expect(all).toContain('<truth-rules>');
    expect(all).toContain('<craft-voice>');
    expect(all).toContain('<INVESTIGATION_OBSERVATIONS>');
    [...ON_SITE_PERSONA, ...RESTATEMENTS].forEach((phrase) => {
      expect(`${mode}: ${phrase}: ${all.includes(phrase)}`).toBe(`${mode}: ${phrase}: false`);
    });
  });

  it('the arc writer\'s roster line no longer says Nova observed them', () => {
    const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
    const block = arcTesting.buildCharacterCategoriesBlock(['Vic'], 'journalist', []);
    expect(block).not.toContain('Nova observed them');
    expect(block).toContain('how Nova learned of them is set by the reporting mode');
  });

  it('the photo enrichment examples make no first-person presence claim', async () => {
    const { createThemeLoader } = require('../theme-loader');
    const prompts = await createThemeLoader({ theme: 'journalist' }).loadPhasePrompts('imageAnalysis');
    const enrichment = prompts['photo-enrichment'];
    expect(enrichment.length).toBeGreaterThan(0);
    expect(enrichment).not.toContain('I noticed these two');
    expect(enrichment).not.toContain('I saw this partnership');
  });
});

/**
 * Final fix wave item 6: the two presence lines that live outside the writers'
 * prompts. The Haiku preprocessor's example said "saw Taylor at Valet", and the
 * pipeline deep dive titled the director's notes "Nova's Observations".
 */
describe("presence lines outside the writers' prompts", () => {
  it("the preprocessor's system prompt carries none of them", async () => {
    const { createEvidencePreprocessor } = require('../evidence-preprocessor');
    const sdkClient = jest.fn().mockResolvedValue({ items: [{ id: 'ale003', sourceType: 'memory-token', summary: 's' }] });
    await createEvidencePreprocessor({ sdkClient }).process({
      memoryTokens: [{ tokenId: 'ale003', name: 'ALE003', disposition: 'exposed', fullDescription: 'x' }],
      paperEvidence: [],
      sessionId: 'test'
    });
    const { systemPrompt } = sdkClient.mock.calls[0][0];
    expect(systemPrompt).toContain('Taylor was seen at Valet at 8:15 PM');
    [...ON_SITE_PERSONA, ...RESTATEMENTS].forEach((phrase) => {
      expect(`${phrase}: ${systemPrompt.includes(phrase)}`).toBe(`${phrase}: false`);
    });
  });

  it("the deep dive names the director's notes the director's observations", () => {
    const doc = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'docs', 'PIPELINE_DEEP_DIVE.md'), 'utf8');
    expect(doc).not.toContain("Director Notes = Nova's Observations");
    expect(doc).toContain("### Layer 3: CONTEXT (Director Notes = the Director's Observations)");
  });
});
