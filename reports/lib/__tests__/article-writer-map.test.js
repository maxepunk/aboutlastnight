/**
 * Brief 4.7b (spec 6.1; the approved read's section D, "The article writer's task"): the
 * article writer and its reworker read the settled weave first, then the story map as the
 * director left it, where they read the approved outline until phase 4, then what they
 * read before. The arc selection's guidance (`_outlineGuidance`) went with them, its last
 * readers (R4), and neither reads a <SHOULD_CONSIDER>.
 *
 * The real nodes run on the rework fixture with the real PromptBuilder and a recording
 * stand-in for the model, so the prompts are the ones the writer and the rework send.
 */

const { reworkFixtureState, MAP, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const { generateContentBundle, reviseContentBundle, articleWriterInputs } = require('../workflow/nodes/ai-nodes');
const { PromptBuilder, STORY_MAP_TAG } = require('../prompt-builder');
const { settledWeaveOf } = require('../prompt-renderers/settled-weave');

const clone = (v) => JSON.parse(JSON.stringify(v));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });

/** A model stand-in that records every call and returns `value`. */
function recordingSdk(value) {
  return jest.fn(async () => clone(value));
}

const NOTES = [
  { gate: 'arc-selection', kind: 'approval', round: 1, text: 'Keep Riley in view.', at: 't1' },
  { gate: 'outline', kind: 'approval', round: 1, text: 'The closing is right.', at: 't2' }
];

/** The fixture past the map's approve: the map in state.outline, its top photo the hero. */
function articleState(overrides = {}) {
  return { ...reworkFixtureState('journalist'), heroImage: 'hero.jpg', contentBundle: null, directorGateNotes: NOTES, ...overrides };
}

async function writerPrompt(state) {
  const sdk = recordingSdk(PREVIOUS_BUNDLE);
  await generateContentBundle(state, cfg(sdk));
  return { user: sdk.mock.calls[0][0].prompt, system: sdk.mock.calls[0][0].systemPrompt };
}

/** The block between a tag's opening and closing lines. */
function block(text, tag) {
  const open = text.indexOf(`<${tag}>`);
  const close = text.indexOf(`</${tag}>`);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return text.slice(open, close + tag.length + 3);
}

/** The JSON a block carries, from its first "{" to its last "}". */
function blockJson(text, tag) {
  const inner = block(text, tag);
  return JSON.parse(inner.slice(inner.indexOf('{'), inner.lastIndexOf('}') + 1));
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('4.7b: the article writer reads the settled weave, then the map', () => {
  it('opens on the settled weave, then the map, then its task, then what it read before, with <DIRECTOR_GUIDANCE> last', async () => {
    const state = articleState();
    const { user } = await writerPrompt(state);

    expect(user.startsWith(settledWeaveOf(state))).toBe(true);
    const order = [
      '</SETTLED_WEAVE>',
      `<${STORY_MAP_TAG}>`,
      `</${STORY_MAP_TAG}>`,
      'Write the article from the settled weave and the story map above',
      '<DATA_CONTEXT>',
      'PHOTOS (',
      '\n<RECORD>\n',
      '<FINANCIAL_SUMMARY>',
      '<SESSION_FACTS>',
      '<GENERATION_INSTRUCTION>',
      '<SCHEMA>',
      // Each section by the line that opens it: the task names <craft-story> in prose.
      '\n<craft-story>\n',
      '\n<craft-questions>\n',
      '\n<DIRECTOR_GUIDANCE>\n'
    ].map((marker) => [marker, user.indexOf(marker)]);
    order.forEach(([marker, at]) => expect(`${marker}: ${at >= 0}`).toBe(`${marker}: true`));
    const positions = order.map(([, at]) => at);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(user.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('prints the map as the director left it (state.outline), never the writer\'s last map', async () => {
    const left = clone(MAP);
    left.sections[3].beats[0].material = 'Riley at the door with the ledger, the last to leave';
    const { user } = await writerPrompt(articleState({ outline: left, _mapBaseline: clone(MAP) }));

    expect(blockJson(user, STORY_MAP_TAG)).toEqual(left);
    expect(block(user, STORY_MAP_TAG)).not.toContain('Riley: \\"I only kept the books\\"');
  });

  it('leaves off the map and out of PHOTOS a photo the director has left out since the map', async () => {
    const { user } = await writerPrompt(articleState({ characterIdMappings: { 'p2.jpg': { exclude: true } } }));

    const printed = blockJson(user, STORY_MAP_TAG);
    expect(printed.sections.flatMap((s) => s.photos)).toEqual([]);
    expect(printed.topPhoto).toBe('hero.jpg');
    expect(block(user, 'DATA_CONTEXT')).not.toContain('p2.jpg');
    expect(user).toContain('"filename": "hero.jpg"');
  });

  it('with its top photo left out, the map prints none, and the bundle takes no hero', async () => {
    const { user } = await writerPrompt(articleState({ characterIdMappings: { 'hero.jpg': { exclude: true } } }));

    expect(blockJson(user, STORY_MAP_TAG)).not.toHaveProperty('topPhoto');
    expect(block(user, 'DATA_CONTEXT')).not.toContain('hero.jpg');
    const instruction = block(user, 'GENERATION_INSTRUCTION');
    expect(instruction).toContain('The map has no top photo, so the bundle has no "heroImage".');
    expect(instruction).not.toContain('"heroImage": {"filename"');
  });

  it("names each section by the map's slot and heading, and no fixed list of sections", async () => {
    const instruction = block((await writerPrompt(articleState())).user, 'GENERATION_INSTRUCTION');
    expect(instruction).toContain('"id": the slot of the map\'s section it writes, as the map gives it.');
    expect(instruction).not.toMatch(/the-story|follow-the-money|whats-missing/);
  });

  it("asks for the map's headline and deck, and its top photo as the hero", async () => {
    const instruction = block((await writerPrompt(articleState())).user, 'GENERATION_INSTRUCTION');
    expect(instruction).toContain('"heroImage": {"filename": "hero.jpg", "caption": "..."}');
    expect(instruction).toContain('"headline": {"main": "<the map\'s headline>", "kicker": "...", "deck": "<the map\'s deck>"}');
  });

  it('reads no arc-stop guidance and no <SHOULD_CONSIDER>, even from a stored state that still holds the old channel', async () => {
    const { user } = await writerPrompt(articleState({ _outlineGuidance: 'Lead with the money, not the vote.' }));
    expect(user).not.toContain('Lead with the money, not the vote.');
    expect(user).not.toContain('The director reviewed the arcs');
    expect(user).not.toContain('SHOULD_CONSIDER');
    expect(user).not.toContain('APPROVED OUTLINE:');
    expect(user).not.toContain('HERO IMAGE:');
  });

  it('the reworker opens with the same settled weave and map, and keeps <DIRECTOR_GUIDANCE> last', async () => {
    const state = articleState();
    const { user: writer } = await writerPrompt({ ...state, directorGateNotes: [] });
    const sdk = recordingSdk(PREVIOUS_BUNDLE);
    await reviseContentBundle({
      ...state, _previousContentBundle: clone(PREVIOUS_BUNDLE), articleRevisionCount: 1,
      _outlineGuidance: 'Lead with the money, not the vote.'
    }, cfg(sdk));
    const rework = sdk.mock.calls[0][0].prompt;

    expect(rework.startsWith(writer)).toBe(true);
    expect(block(rework, STORY_MAP_TAG)).toBe(block(writer, STORY_MAP_TAG));
    expect(rework.indexOf('## REVISION CONTEXT')).toBeGreaterThan(rework.indexOf(`</${STORY_MAP_TAG}>`));
    expect(rework).not.toContain('Lead with the money, not the vote.');
    expect(rework.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('articleWriterInputs passes the settled weave, then the map as the article reads it', () => {
    const state = articleState({ characterIdMappings: { 'p2.jpg': { exclude: true } } });
    const [settledWeave, map] = articleWriterInputs(state);
    expect(settledWeave).toBe(settledWeaveOf(state));
    expect(map.sections.flatMap((s) => s.photos)).toEqual([]);
    expect(state.outline.sections[1].photos).toEqual([{ filename: 'p2.jpg', beat: 'b2' }]);   // the stored map is untouched
  });

  it('fails loud with no settled weave or no map, naming what it needs', async () => {
    const builder = new PromptBuilder({ loadPhasePrompts: async () => ({}), validate: async () => ({ valid: true, missing: [] }) }, 'journalist', {});
    await expect(builder.buildArticlePrompt('', clone(MAP))).rejects.toThrow(/settled weave/);
    await expect(builder.buildArticlePrompt(settledWeaveOf(articleState()), null)).rejects.toThrow(/story map/);
  });
});
