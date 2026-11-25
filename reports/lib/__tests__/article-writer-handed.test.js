/**
 * Phase 18, run 2b (brief H; R19, R20, R22, R24): what the article writer is handed.
 *
 * - The settled weave without the evidence under its threads (R19): the map holds the evidence the
 *   map writer chose for each beat. The article writer and its rework read it that way; the map
 *   writer and the map's rework read it whole. Run 2h (R46): each reads its reader's form, and the
 *   article's judge reads the judge's.
 * - The map as shown (R20): each beat without its `kind`, each left-out beat by its id and title
 *   alone (mapAsShown). The stored map, the stamp, the fact check, the judge and the page read the
 *   map whole.
 * - The article writer's system prompt, and its rework's, without the character digest (R22). The
 *   judges keep their roster as it was.
 * - The article writer reads its own part before the brief (R24). Run 2h (R45) reverses it: the
 *   article writer reads the brief, then its own part, as the weave and the map writers do.
 *
 * The real nodes run on the rework fixture with the real PromptBuilder and a recording stand-in
 * for the model. Invented names and text: the repo is public.
 */

const { reworkFixtureState, MAP, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const aiNodes = require('../workflow/nodes/ai-nodes');
const { generateContentBundle, reviseContentBundle, generateOutline, articleMapOf } = aiNodes;
const { mapAsShown, mapWithoutBeatKinds, STORY_MAP_TAG } = require('../prompt-builder');
const { settledWeaveOf } = require('../prompt-renderers/settled-weave');
const { RULE_SET_CALLS } = require('../rule-set');
const { _testing: evalTesting } = require('../workflow/nodes/evaluator-nodes');

const clone = (v) => JSON.parse(JSON.stringify(v));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });

/** The fixture past the map's approve: the map in state.outline, its top photo the hero. */
function articleState(overrides = {}) {
  return { ...reworkFixtureState('journalist'), heroImage: 'hero.jpg', contentBundle: null, ...overrides };
}

/** The writer's and an automatic rework's calls, each as the SDK is given it. */
async function articleCalls(state = articleState()) {
  const writer = jest.fn(async () => clone(PREVIOUS_BUNDLE));
  await generateContentBundle(state, cfg(writer));
  const rework = jest.fn(async () => clone(PREVIOUS_BUNDLE));
  await reviseContentBundle({ ...state, _previousContentBundle: clone(PREVIOUS_BUNDLE), articleRevisionCount: 1 }, cfg(rework));
  return { writer: writer.mock.calls[0][0], rework: rework.mock.calls[0][0] };
}

/** The JSON printed inside a tag, from its first "{" to its last "}". */
function blockJson(text, tag) {
  const open = text.indexOf(`<${tag}>`);
  const close = text.indexOf(`</${tag}>`);
  const inner = text.slice(open, close);
  return JSON.parse(inner.slice(inner.indexOf('{'), inner.lastIndexOf('}') + 1));
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('R20: mapAsShown, the map as the article writer is shown it', () => {
  it("leaves out each beat's kind, in the sections and under leftOut", () => {
    const shown = mapAsShown(clone(MAP));
    shown.sections.forEach((section) => section.beats.forEach((beat) => expect(`${beat.id}: ${'kind' in beat}`).toBe(`${beat.id}: false`)));
    expect(JSON.stringify(shown)).not.toContain('"kind"');
  });

  it('shows each left-out beat by its id and its title alone', () => {
    expect(mapAsShown(clone(MAP)).leftOut).toEqual(MAP.leftOut.map((beat) => ({ id: beat.id, move: beat.move })));
  });

  // Run 2h (R50): and without the map's notes to the director, gapNote and dropped.
  it("keeps every other field of the map as it is", () => {
    const shown = mapAsShown(clone(MAP));
    const expected = clone(MAP);
    expected.sections.forEach((section) => section.beats.forEach((beat) => { delete beat.kind; }));
    expected.leftOut = expected.leftOut.map((beat) => ({ id: beat.id, move: beat.move }));
    delete expected.gapNote;
    delete expected.dropped;
    expect(shown).toEqual(expected);
  });

  it('leaves the map it is given untouched', () => {
    const map = clone(MAP);
    mapAsShown(map);
    expect(map).toEqual(MAP);
  });

  it('passes a map with no beats, no leftOut or something that is no map through as it is', () => {
    expect(mapAsShown(null)).toBe(null);
    expect(mapAsShown({ sections: [] })).toEqual({ sections: [] });
    expect(mapAsShown({ sections: [{ slot: 'lede' }], leftOut: ['b9'] })).toEqual({ sections: [{ slot: 'lede' }], leftOut: ['b9'] });
  });

  it("is what the article writer's <STORY_MAP> and its rework's print, while the stored map keeps every field", async () => {
    const state = articleState();
    const { writer, rework } = await articleCalls(state);
    [writer, rework].forEach(({ prompt }) => {
      expect(blockJson(prompt, STORY_MAP_TAG)).toEqual(mapAsShown(articleMapOf(state)));
      const map = prompt.slice(prompt.indexOf(`<${STORY_MAP_TAG}>`), prompt.indexOf(`</${STORY_MAP_TAG}>`));
      expect(map).not.toContain('"kind"');
      // The left-out beat's synopsis and evidence are nowhere in the prompt.
      expect(prompt).not.toContain(MAP.leftOut[0].synopsis);
    });
    expect(state.outline).toEqual(MAP);
  });

  it('the article judge reads the map whole, kind and left-out beats included', async () => {
    const state = articleState({ contentBundle: clone(PREVIOUS_BUNDLE) });
    const user = await evalTesting.buildEvaluationUserPrompt('article', state, {});
    expect(user).toContain(JSON.stringify(state.outline, null, 2));
    expect(user).toContain('"kind": "receipt"');
  });
});

// Phase 18, run 2c (R31): one rule for a beat's kind, in two forms. The strip of `kind` is its own
// exported step (mapWithoutBeatKinds), which the map's rework calls, since it hands back a whole
// map; the map as the article writer is shown it (mapAsShown) builds on it and then cuts each
// left-out beat to its id and title.
describe("R31: the strip of a beat's kind, and the map as shown built on it", () => {
  it("leaves out each beat's kind, in the sections and under leftOut, and keeps every other field, a left-out beat whole", () => {
    const stripped = mapWithoutBeatKinds(clone(MAP));
    const expected = clone(MAP);
    [...expected.sections.flatMap((section) => section.beats), ...expected.leftOut].forEach((beat) => { delete beat.kind; });
    expect(stripped).toEqual(expected);
    expect(stripped.leftOut[0].synopsis).toBe(MAP.leftOut[0].synopsis);
    expect(JSON.stringify(stripped)).not.toContain('"kind"');
  });

  it('leaves the map it is given untouched, and passes a map with no beats or something that is no map through', () => {
    const map = clone(MAP);
    mapWithoutBeatKinds(map);
    expect(map).toEqual(MAP);
    expect(mapWithoutBeatKinds(null)).toBe(null);
    expect(mapWithoutBeatKinds({ sections: [] })).toEqual({ sections: [] });
    expect(mapWithoutBeatKinds({ sections: [{ slot: 'lede' }], leftOut: ['b9'] })).toEqual({ sections: [{ slot: 'lede' }], leftOut: ['b9'] });
  });

  it('the map as shown is the stripped map, each left-out beat cut to its id and title, with no gapNote and no dropped (R50)', () => {
    const { gapNote: _gapNote, dropped: _dropped, ...stripped } = mapWithoutBeatKinds(clone(MAP));
    expect(mapAsShown(clone(MAP))).toEqual({ ...stripped, leftOut: stripped.leftOut.map((beat) => ({ id: beat.id, move: beat.move })) });
  });

  it("the map's rework prints the map it starts from through the strip, left-out beats whole", async () => {
    const state = reworkFixtureState('journalist');
    let sent;
    await aiNodes.reviseOutline(
      { ...state, _previousOutline: clone(MAP), outlineRevisionCount: 1 },
      { configurable: { sdkClient: async (options) => { sent = options; return mapWithoutBeatKinds(clone(MAP)); }, theme: 'journalist' } }
    );
    expect(sent.prompt).toContain(JSON.stringify(mapWithoutBeatKinds(clone(MAP)), null, 2));
    // One rule: the nodes hold no strip of their own.
    const source = require('fs').readFileSync(require.resolve('../workflow/nodes/ai-nodes'), 'utf8');
    expect(source).not.toMatch(/function mapWithoutBeatKinds|const withoutKind/);
  });
});

// Run 2h (R46): each reader reads its own form of the settled weave: the map writer and its rework
// the map's, the article writer and its rework the article's, the article judge the judge's.
describe("R19, R46: the article writer and its rework read the settled weave in the article's form", () => {
  it('opens the writer and its rework on the settled weave without its evidence', async () => {
    const state = articleState();
    const { writer, rework } = await articleCalls(state);
    const without = settledWeaveOf(state, { reader: 'article' });
    expect(without).not.toBe(settledWeaveOf(state));
    expect(writer.prompt.startsWith(`${without}\n`)).toBe(true);
    expect(rework.prompt.startsWith(`${without}\n`)).toBe(true);
    // A thread's evidence line, which the weave prints under it, is in neither.
    const weave = writer.prompt.slice(0, writer.prompt.indexOf('</SETTLED_WEAVE>'));
    expect(weave.split('\n').filter((line) => line.startsWith('  - '))).toEqual([]);
  });

  it('the map writer reads it whole, as before', async () => {
    const state = { ...reworkFixtureState('journalist'), outline: null };
    const sdk = jest.fn(async () => clone(MAP));
    await generateOutline(state, cfg(sdk));
    expect(sdk.mock.calls[0][0].prompt.startsWith(`${settledWeaveOf(state)}\n`)).toBe(true);
  });

  it("the map's rework reads it whole, as before", async () => {
    const state = reworkFixtureState('journalist');
    const sdk = jest.fn(async () => clone(MAP));
    await aiNodes.reviseOutline({ ...state, _previousOutline: clone(MAP), _outlineFeedback: 'Rethink it.', outlineRevisionCount: 0 }, cfg(sdk));
    expect(sdk.mock.calls[0][0].prompt.startsWith(`${settledWeaveOf(state)}\n`)).toBe(true);
  });

  it("the article judge reads it in the judge's form", async () => {
    const state = articleState({ contentBundle: clone(PREVIOUS_BUNDLE) });
    const user = await evalTesting.buildEvaluationUserPrompt('article', state, {});
    expect(user).toContain(settledWeaveOf(state, { reader: 'judge' }));
    expect(user).not.toContain(settledWeaveOf(state));
  });
});

describe("R22: the article writer's system prompt holds no character digest", () => {
  it('neither the writer nor its rework prints the character context, while the roster stays', async () => {
    const state = articleState();
    expect(Object.keys(state.characterData.characters).length).toBeGreaterThan(0);
    const { writer, rework } = await articleCalls(state);
    [writer, rework].forEach(({ systemPrompt }) => {
      expect(systemPrompt).not.toContain('CHARACTER CONTEXT');
      expect(systemPrompt).not.toContain('Role: CEO');
      expect(systemPrompt).toContain('Every character of the game, first name and then the full name the article prints.');
      expect(systemPrompt).toContain('- Alex → Alex Reeves (he/him)');
    });
  });

  // Run 2h (the wording doc's part 10): the judges have the documents, so their roster prints
  // without the summary too, in the article writer's form, and the list of names stays.
  it("the article judge's roster leaves it out as well, and keeps the list of names", async () => {
    const state = articleState({ contentBundle: clone(PREVIOUS_BUNDLE) });
    const user = await evalTesting.buildEvaluationUserPrompt('article', state, {});
    expect(user).not.toContain('CHARACTER CONTEXT');
    expect(user).not.toContain('Role: CEO');
    expect(user).toContain('- Alex → Alex Reeves (he/him)');
  });
});

describe('R45: the article writer reads the brief, then its own part, as the other two writers do', () => {
  it('lists the brief before job-article for the article call, as for the weave and the map', () => {
    expect(RULE_SET_CALLS.article).toEqual(['brief', 'job-article']);
    expect(RULE_SET_CALLS.arc).toEqual(['brief', 'job-weave']);
    expect(RULE_SET_CALLS.outline).toEqual(['brief', 'job-map']);
  });

  it('prints <brief> before <job-article>, after the schema and before the standing notes, in the writer and its rework', async () => {
    const state = articleState({ directorGateNotes: [{ gate: 'outline', kind: 'approval', round: 1, text: 'Keep it.', at: 't' }] });
    const { writer, rework } = await articleCalls(state);
    [writer.prompt, rework.prompt].forEach((prompt) => {
      const at = (marker) => prompt.indexOf(marker);
      expect(at('\n</SCHEMA>\n')).toBeLessThan(at('\n<brief>\n'));
      expect(at('\n<brief>\n')).toBeLessThan(at('\n<job-article>\n'));
      expect(at('\n</job-article>')).toBeLessThan(at('\n<DIRECTOR_GUIDANCE>\n'));
    });
  });
});
