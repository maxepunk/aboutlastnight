/**
 * The roster with pronouns for the arc writer, the interweaving call and the outline
 * writer (phase 3, brief 3.10; T9, C15; final-review-known item 2 and the ledger's
 * "Gate 3 finding" on pronouns).
 *
 * The article writer's system prompt and every judge print the roster through one
 * section, PromptBuilder#_rosterSection: each canonical name, with the pronoun the
 * director set at the roster stop for a player, and the NPCs' canon lines. The arc
 * writer, the interweaving call and the outline writer read first names alone, so at
 * the gate (092026) the arc writer asked the director five pronoun questions the roster
 * stop had already answered, and the outline writer planned with no pronoun to hand.
 * Each of the three now reads the same section, so each player's pronoun appears once in
 * its prompt. The arc writer keeps its session roster, whose first names decide
 * rosterCoverage. The section is built without the character data: the arc writer
 * prints its own character context, and the other two read none. The detective's
 * prompts keep their text (D13).
 *
 * Phase 4 (brief 4.4): the arc writer writes the weave, the interweaving call went, and
 * the arc stage's detective branch went (R1). Roster coverage left the arc stage; the
 * arc writer still prints the session roster.
 */

const { reworkFixtureState } = require('./fixtures/rework-state');
const { createPromptBuilder } = require('../prompt-builder');
const arcNodes = require('../workflow/nodes/arc-specialist-nodes');
const aiNodes = require('../workflow/nodes/ai-nodes');

const clone = (v) => JSON.parse(JSON.stringify(v));
const count = (haystack, needle) => haystack.split(needle).length - 1;

/** The fixture's players, each with the pronoun the director set at the roster stop. */
const PRONOUN_LINES = [
  '- Alex → Alex Reeves (he/him)',
  '- Morgan → Morgan Reed (she/her)',
  '- Sarah → Sarah Blackwood (she/her)',
  '- Riley → Riley Torres (they/them)'
];

/** The roster with pronouns, through _rosterSection, as the three writers print it. */
function rosterSectionFor(state) {
  return createPromptBuilder({
    theme: 'journalist', sessionConfig: state.sessionConfig, canonicalCharacters: state.canonicalCharacters
  })._rosterSection();
}

/** A model stand-in that records each call and answers by `answer(options)`. */
function recordingSdk(answer) {
  return jest.fn(async (options) => clone(answer(options)));
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

/** The arc writer's prompt, as analyzeArcsPlayerFocusGuided sends it (the weave, one call). */
async function arcCalls() {
  const state = reworkFixtureState('journalist');
  const sdk = recordingSdk(() => state.weave);
  await arcNodes.analyzeArcsPlayerFocusGuided({ ...clone(state), weave: null }, { configurable: { sdkClient: sdk, theme: 'journalist' } });
  expect(sdk).toHaveBeenCalledTimes(1);
  const [writer] = sdk.mock.calls.map(([options]) => `${options.systemPrompt}\n=====\n${options.prompt}`);
  return { state, writer };
}

/** The outline writer's prompt, as generateOutline sends it, through a real PromptBuilder. */
async function outlineCall(theme) {
  const state = reworkFixtureState(theme);
  const builder = createPromptBuilder({
    theme, sessionConfig: state.sessionConfig, canonicalCharacters: state.canonicalCharacters,
    characterData: state.characterData.characters
  });
  const sdk = recordingSdk(() => ({ lede: {} }));
  await aiNodes.generateOutline({ ...clone(state), outline: null }, { configurable: { sdkClient: sdk, promptBuilder: builder, theme } });
  const [{ systemPrompt, prompt }] = sdk.mock.calls[0];
  return { state, builder, system: systemPrompt, user: prompt };
}

describe('the section is the one the article writer and the judges print', () => {
  it("is _rosterSection's roster and NPC lines, which the article writer's system prompt carries", async () => {
    const state = reworkFixtureState('journalist');
    const section = rosterSectionFor(state);
    expect(section.startsWith('CANONICAL CHARACTER ROSTER:\n')).toBe(true);
    PRONOUN_LINES.forEach((line) => expect(section).toContain(line));
    expect(section).toContain('- Marcus Blackwood (he/him)');
    const articleBuilder = createPromptBuilder({
      theme: 'journalist', sessionConfig: state.sessionConfig, canonicalCharacters: state.canonicalCharacters,
      characterData: state.characterData.characters
    });
    expect(await articleBuilder.buildArticleSystemPrompt()).toContain(section);
  });
});

describe('the arc writer', () => {
  it('reads the roster with pronouns once, each player\'s pronoun once', async () => {
    const { state, writer } = await arcCalls();
    expect(count(writer, rosterSectionFor(state))).toBe(1);
    PRONOUN_LINES.forEach((line) => expect(`${line}: ${count(writer, line)}`).toBe(`${line}: 1`));
  });

  it('keeps its session roster, and its own character context once', async () => {
    const { writer } = await arcCalls();
    expect(writer).toContain('### Session Roster (the players at the investigation)\n["Alex","Morgan","Sarah","Riley"]');
    expect(count(writer, 'CHARACTER CONTEXT')).toBe(0);
    expect(count(writer, '### Character Context (')).toBe(1);
    // The roster comes after the character categories, under its own heading.
    const at = (s) => writer.indexOf(s);
    expect(at('### Names and Pronouns\nCANONICAL CHARACTER ROSTER:')).toBeGreaterThan(at('### Character Categories'));
    expect(at('### Character Context (')).toBeGreaterThan(at('### Names and Pronouns'));
  });

  it('the arc reworker carries it once, through the writer\'s sections', async () => {
    const state = reworkFixtureState('journalist');
    const sdk = recordingSdk(() => state.weave);
    await arcNodes.reviseArcs(
      { ...clone(state), _arcFeedback: 'Rethink it.' },
      { configurable: { sdkClient: sdk, theme: 'journalist' } }
    );
    const [{ systemPrompt, prompt }] = sdk.mock.calls[0];
    expect(count(`${systemPrompt}\n${prompt}`, rosterSectionFor(state))).toBe(1);
  });
});

// The 4b fix batch (3.10 review minor 5): the section was built at two sites with two
// constructions, and the outline printed it bare while the arc writer and the
// interweaving call gave it a heading. One function builds it, heading included.
describe('one builder for the roster without the character context', () => {
  // Phase 4 (brief 4.4): the interweaving call went.
  it('the arc writer and the outline writer print its section once, under the same heading', async () => {
    const { rosterWithPronounsSection } = require('../prompt-builder');
    const { state, writer } = await arcCalls();
    const { system, user } = await outlineCall('journalist');
    const section = rosterWithPronounsSection(state.sessionConfig, state.canonicalCharacters);
    expect(section).toBe(`### Names and Pronouns\n${rosterSectionFor(state)}`);
    for (const [name, text] of [['arc writer', writer], ['outline writer', `${system}\n${user}`]]) {
      expect(`${name}: ${count(text, section)}`).toBe(`${name}: 1`);
      expect(`${name}: ${count(text, 'Names and Pronouns')}`).toBe(`${name}: 1`);
    }
  });
});

describe('the outline writer', () => {
  it('reads the roster with pronouns once, after SESSION_FACTS and before the schema', async () => {
    const { state, system, user } = await outlineCall('journalist');
    const whole = `${system}\n=====\n${user}`;
    const section = rosterSectionFor(state);
    expect(count(whole, section)).toBe(1);
    PRONOUN_LINES.forEach((line) => expect(`${line}: ${count(whole, line)}`).toBe(`${line}: 1`));
    expect(user.indexOf(section)).toBeGreaterThan(user.indexOf('</SESSION_FACTS>'));
    expect(user.indexOf(section)).toBeLessThan(user.indexOf('<SCHEMA>'));
    expect(whole).not.toContain('CHARACTER CONTEXT');
  });

  it('the outline reworker carries it once, through the writer\'s sections', async () => {
    const { state, builder } = await outlineCall('journalist');
    const sdk = recordingSdk(() => ({ lede: {} }));
    await aiNodes.reviseOutline(
      { ...clone(state), outline: null, _previousOutline: clone(state.outline), _outlineFeedback: 'Rethink it.', outlineRevisionCount: 0 },
      { configurable: { sdkClient: sdk, promptBuilder: builder, theme: 'journalist' } }
    );
    const [{ systemPrompt, prompt }] = sdk.mock.calls[0];
    expect(count(`${systemPrompt}\n${prompt}`, rosterSectionFor(state))).toBe(1);
  });
});

// Phase 4 (brief 4.4): the detective's arc writer and interweaving call went (R1). Brief
// 4.6: so did its outline writer; the detective has no map.
describe("the detective's prompts keep their text (D13)", () => {
  it('it has no outline writer to print the section (R1)', async () => {
    await expect(outlineCall('detective')).rejects.toThrow('The "detective" theme has no story map');
  });
});
