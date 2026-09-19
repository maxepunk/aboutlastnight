/**
 * The rendered prompts do not contradict the session's reporting mode (I3)
 *
 * `reportingMode` REPLACES the reporter's persona: `_buildReportingModeBlock` puts
 * one REPORTING_MODE_BLOCKS entry in the article SYSTEM prompt, right after the
 * identity line, and for `remote` it says "You were not in the room."
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
const { _testing: { getArticleRevisionSystemPrompt } } = require('../workflow/nodes/ai-nodes');

/** The whole rendered article prompt for `mode`, system + user. */
async function renderArticlePrompt(mode) {
  const builder = createPromptBuilder({
    theme: 'journalist',
    sessionConfig: { reportingMode: mode, journalistFirstName: 'Cass', roster: ['Vic'] }
  });
  const { systemPrompt, userPrompt } = await builder.buildArticlePrompt(
    { sections: [] }, [], null, [], null, null, null, {}
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
  'The reporter has opinions. She was there.'
];

describe('article prompt, remote session', () => {
  let rendered;
  beforeAll(async () => { rendered = await renderArticlePrompt('remote'); });

  it('states the mode and defers to the system prompt for it', () => {
    expect(rendered.userPrompt).toContain('reporting mode for this session is remote');
  });

  it('carries the remote mode block in the SYSTEM prompt', () => {
    expect(rendered.systemPrompt).toContain('You were not in the room.');
  });

  it.each(ON_SITE_PERSONA)('does not assert: %s', (phrase) => {
    expect(rendered.all).not.toContain(phrase);
  });
});

describe('article prompt, on-site session', () => {
  let rendered;
  beforeAll(async () => { rendered = await renderArticlePrompt('on-site'); });

  it('states the mode', () => {
    expect(rendered.userPrompt).toContain('reporting mode for this session is on-site');
  });

  it('carries the on-site mode block in the SYSTEM prompt, which is where presence is asserted', () => {
    expect(rendered.systemPrompt).toContain('You watched the investigation from inside the room');
  });

  it.each(ON_SITE_PERSONA)('does not assert it in the rules block either: %s', (phrase) => {
    // The mode block is the single authority in BOTH modes. An on-site session
    // gets its presence from there, not from a persona sentence in a craft file
    // that a remote session would also be reading.
    expect(rendered.all).not.toContain(phrase);
  });
});

describe('REPORTING_MODE substitution', () => {
  it('resolves from sessionConfig.reportingMode', () => {
    const builder = createPromptBuilder({ theme: 'journalist', sessionConfig: { reportingMode: 'remote' } });
    expect(builder.resolvePromptVariables('mode: {{REPORTING_MODE}}')).toBe('mode: remote');
  });

  it('defaults to on-site when the session config carries no mode', () => {
    const builder = createPromptBuilder({ theme: 'journalist', sessionConfig: {} });
    expect(builder.resolvePromptVariables('mode: {{REPORTING_MODE}}')).toBe('mode: on-site');
  });

  it('leaves no unresolved {{REPORTING_MODE}} in the rendered prompt', async () => {
    const { all } = await renderArticlePrompt('remote');
    expect(all).not.toContain('{{REPORTING_MODE}}');
  });
});

describe('article REVISION system prompt', () => {
  // This prompt has no mode block (it is built from the theme alone), so it must
  // not name a place the reporter was. A revision is where a remote article would
  // be "corrected" back into an on-site one.
  const revisionPrompt = getArticleRevisionSystemPrompt('journalist');

  it('does not list a presence claim as the voice to embody', () => {
    expect(revisionPrompt).not.toContain('"I was there"');
    expect(revisionPrompt).not.toContain('in-the-muck');
  });

  it('still asks for the first-person participatory voice', () => {
    expect(revisionPrompt).toMatch(/first-person participatory/i);
  });
});
