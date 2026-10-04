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

  // Brief 4.7c: the instruction's headline line defers to the task's, which gives the
  // director's own headline and deck first and the map's otherwise.
  it("asks for the headline and deck the task gives, and the map's top photo as the hero", async () => {
    const instruction = block((await writerPrompt(articleState())).user, 'GENERATION_INSTRUCTION');
    expect(instruction).toContain('"heroImage": {"filename": "hero.jpg", "caption": "..."}');
    expect(instruction).toContain('"headline": {"main": "...", "kicker": "...", "deck": "..."}: the headline and the deck as the task above gives them');
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

// Brief 4.7c (4.7b's minor 1): the hero comes from one source, the map as the article reads
// it (topPhotoOf(articleMapOf(state))). 4.6's invariant writes `heroImage` equal to the map's
// top photo, so in production the two agree; a state where they differ shows which one each
// reader names.
describe('4.7c: the hero comes from one source, the map as the article reads it', () => {
  const { topPhotoOf } = require('../map');
  const { _testing: { buildEvaluationUserPrompt } } = require('../workflow/nodes/evaluator-nodes');
  /** The stored hero is p2.jpg; the map's top photo is hero.jpg. */
  const differing = (overrides = {}) => articleState({ heroImage: 'p2.jpg', ...overrides });

  it("PHOTOS, the instruction and the stamp name the map's top photo, not the stored hero", async () => {
    const sdk = recordingSdk(PREVIOUS_BUNDLE);
    const update = await generateContentBundle(differing(), cfg(sdk));
    const user = sdk.mock.calls[0][0].prompt;
    const photos = block(user, 'DATA_CONTEXT');
    expect(photos).toMatch(/^1\. \[hero image\] hero\.jpg/m);
    expect(photos).not.toMatch(/\[hero image\] p2\.jpg/);
    expect(photos).toMatch(/^2\. p2\.jpg/m);
    expect(block(user, 'GENERATION_INSTRUCTION')).toContain('"heroImage": {"filename": "hero.jpg", "caption": "..."}');
    expect(update.contentBundle.heroImage.filename).toBe('hero.jpg');
  });

  it("the judge's PHOTOS, built from the writer's inputs, names the map's top photo too", () => {
    const prompt = buildEvaluationUserPrompt('article', differing({ contentBundle: clone(PREVIOUS_BUNDLE) }), { factCheck: null });
    const photos = prompt.slice(prompt.indexOf('\nPHOTOS ('), prompt.indexOf('<SETTLED_WEAVE>'));
    expect(photos).toMatch(/^1\. \[hero image\] hero\.jpg/m);
    expect(photos).not.toMatch(/\[hero image\] p2\.jpg/);
  });

  it('articleWriterInputs marks as the hero the top photo of the map it passes', () => {
    const inputs = articleWriterInputs(differing());
    const { photos } = inputs[inputs.length - 1];
    expect(photos.filter((photo) => photo.hero).map((photo) => photo.filename)).toEqual([topPhotoOf(inputs[1])]);
    expect(topPhotoOf(inputs[1])).toBe('hero.jpg');
  });

  it('a map with no top photo gives no hero, whatever the stored hero', () => {
    const map = clone(MAP);
    delete map.topPhoto;
    const inputs = articleWriterInputs(differing({ outline: map }));
    expect(inputs[inputs.length - 1].photos.filter((photo) => photo.hero)).toEqual([]);
  });
});

// Brief 4.7c (4.7b's minor 2): the headline and the deck hold the director's words. The
// rework carries its writer's sections word for word, so the writer's task and its
// instruction are worded to stand beside a headline the director edited at the desk.
describe("4.7c: the headline and the deck hold the director's words", () => {
  const { standingAfterSendBack } = require('../hand-edit-diff');
  const DESK = 'The Director Rewrote This Headline at the Desk';
  /** The instruction's line on the headline: the task decides the headline and the deck. */
  const ITEM_4 = '4. "headline": {"main": "...", "kicker": "...", "deck": "..."}: the headline and the deck as the task above gives them.';

  /** A send-back rework, the director's desk text standing in one field of the headline. */
  async function sendBackPrompt(field = 'main', text = DESK) {
    const shown = { ...clone(PREVIOUS_BUNDLE), headline: { main: MAP.headline, kicker: 'NovaNews', deck: MAP.deck } };
    const sentBack = { ...clone(shown), headline: { ...shown.headline, [field]: text } };
    const sdk = recordingSdk(sentBack);
    await reviseContentBundle(articleState({
      _previousContentBundle: sentBack, articleRevisionCount: 0, humanArticleRevisionCount: 1,
      _articleFeedback: 'Move the photos closer to their beats.',
      _articleHandEdits: standingAfterSendBack(null, shown, sentBack, 'bundle')
    }), cfg(sdk));
    return sdk.mock.calls[0][0].prompt;
  }

  it("a send-back rework whose desk headline differs from the map's asks for nothing that contradicts it", async () => {
    const prompt = await sendBackPrompt();
    expect(block(prompt, 'HAND_EDITS')).toContain(`E1 (headline, main): "${DESK}"`);
    // The task's line and the instruction's line on the headline: the director's own first,
    // the map's otherwise; and no line asks for the map's headline or deck alone.
    const lines = prompt.split('\n');
    expect(lines.filter((line) => line.startsWith('- the headline and the deck:'))).toEqual([
      "- the headline and the deck: the director's own where the director has edited one, otherwise the map's, as written;"
    ]);
    expect(lines.filter((line) => line.startsWith('4. "headline"'))).toEqual([ITEM_4]);
    expect(prompt).not.toMatch(/the map's headline|the map's deck/);
  });

  it("a send-back rework with the director's kicker standing gives the kicker to no one else", async () => {
    const kicker = 'THE DIRECTOR\'S KICKER';
    const prompt = await sendBackPrompt('kicker', kicker);
    expect(block(prompt, 'HAND_EDITS')).toContain(`E1 (headline, kicker): "${kicker}"`);
    expect(prompt.split('\n').filter((line) => /kicker/i.test(line) && !line.includes(kicker) && !/^\s*"kicker": \{/.test(line)))
      .toEqual([ITEM_4]);
    expect(prompt).not.toMatch(/your own kicker|kicker is yours/i);
  });

  it("the task names the director's own headline and deck first, then the map's, and the instruction defers to the task", async () => {
    const { user } = await writerPrompt(articleState());
    expect(user).toContain("- the headline and the deck: the director's own where the director has edited one, otherwise the map's, as written;");
    expect(block(user, 'GENERATION_INSTRUCTION')).toContain(ITEM_4);
  });
});

// Brief 4.7d (ruling 2 on the follow-ups' findings): a section's heading and a photo's place
// hold the director's desk edits as the headline does. The rework carries the task and the
// instruction word for word, ahead of <HAND_EDITS>, so each line gives the director's version
// first and the map's otherwise.
describe("4.7d: a heading and a photo's place the director set at the desk hold through the rework", () => {
  const { standingAfterSendBack } = require('../hand-edit-diff');
  const DESK_HEADING = 'The Director Set This Heading at the Desk';
  /** The task's line on each section's heading, worded as its headline line is. */
  const HEADING_LINE = "- each section's heading: the director's own where the director has edited one, otherwise the map's, as written;";
  /** The task's line on each photo's place: the director's where they moved it, the map's otherwise. */
  const PHOTO_LINE = "- each photo's place: the director's where the director has moved the photo, otherwise the map's, beside its beat; and the map's top photo at the top of the article;";
  /** The instruction's heading line: the task decides the heading. */
  const INSTRUCTION_HEADING = '   - "heading": the section\'s heading, as the task above gives it. A section whose heading is empty or cut takes no "heading" and prints untitled.';

  /**
   * A send-back rework: at the desk the director set THE STORY's heading and moved its photo,
   * p2.jpg, into the closing section.
   */
  async function sendBackPrompt() {
    const shown = clone(PREVIOUS_BUNDLE);
    shown.sections[0].content.splice(1, 0, { type: 'photo', filename: 'p2.jpg', caption: 'Alex leans over the ledger.' });
    shown.sections.push({ id: 'closing', type: 'conclusion', content: [{ type: 'paragraph', text: 'Riley left town.' }] });
    const sentBack = clone(shown);
    sentBack.sections[0].heading = DESK_HEADING;
    sentBack.sections[1].content.push(sentBack.sections[0].content.splice(1, 1)[0]);
    const sdk = recordingSdk(sentBack);
    await reviseContentBundle(articleState({
      _previousContentBundle: sentBack, articleRevisionCount: 0, humanArticleRevisionCount: 1,
      _articleFeedback: 'Tighten the closing.',
      _articleHandEdits: standingAfterSendBack(null, shown, sentBack, 'bundle')
    }), cfg(sdk));
    return sdk.mock.calls[0][0].prompt;
  }

  it("a send-back rework with a desk heading and a desk photo move asks for neither the map's heading nor the map's placement over them", async () => {
    const prompt = await sendBackPrompt();
    const edits = block(prompt, 'HAND_EDITS');
    expect(edits).toContain(`E1 (section "the-story", heading): "${DESK_HEADING}"`);
    expect(edits).toContain('E2 (section "closing", photo p2.jpg, moved from section "the-story")');

    const lines = prompt.split('\n');
    expect(lines.filter((line) => line.startsWith("- each section's heading:"))).toEqual([HEADING_LINE]);
    expect(lines.filter((line) => line.startsWith("- each photo's place:"))).toEqual([PHOTO_LINE]);
    expect(lines.filter((line) => line.startsWith('   - "heading":'))).toEqual([INSTRUCTION_HEADING]);
    // No line asks for the map's heading or the map's placement alone.
    expect(prompt).not.toMatch(/each under its heading|the map's heading|each photo where the map places it/);
  });

  it('the writer reads the same lines, and the section line leaves the heading to its own', async () => {
    const { user } = await writerPrompt(articleState());
    expect(user).toContain(`\n${HEADING_LINE}\n`);
    expect(user).toContain(`\n${PHOTO_LINE}\n`);
    expect(block(user, 'GENERATION_INSTRUCTION')).toContain(`\n${INSTRUCTION_HEADING}\n`);
    // Brief 4.7e reworded the section line to name the director's text and moves first; it
    // still names no heading.
    const sectionLines = user.split('\n').filter((line) => line.startsWith("- the map's sections in its order"));
    expect(sectionLines).toHaveLength(1);
    expect(sectionLines[0]).not.toMatch(/heading/);
  });
});

// Brief 4.7e (ruling 4 on 4.5e's and 4.7d's findings): the task's beats line and its words line
// hold the director's desk edits as the heading, photo and headline lines do. The map keeps the
// beat of a card the director deleted at the desk (only a deleted photo leaves it, through the
// leave-out list), and its leftOut holds the material a paragraph the director inserts may use.
// Code does not restore a send-back's rework, so each line names the director's edits first.
describe("4.7e: a card the director cut and a paragraph they inserted at the desk hold through the rework", () => {
  const { standingAfterSendBack } = require('../hand-edit-diff');
  /** A paragraph the director inserts at the desk, from the letter the map left out (b9, p-rescued). */
  const DESK_PARAGRAPH = 'An unsigned letter warned Marcus about the Stanford patents a week before he died.';
  /** The task's beats line: the director's cut and inserted blocks first, the map's beats otherwise. */
  const BEATS_LINE = "- the beats: a block the director has cut stays out, and a block the director has added stays, whatever its material; otherwise every beat in the map's sections, and no other, so the beats under leftOut, the director's strikes among them, stay out of the article;";
  /** The task's words line: the director's text and moved blocks first, the map's beats and the writer's words otherwise. */
  const WORDS_LINE = "- the map's sections in its order; the text the director has written into the article stays as written, and a block the director has moved stays where the director put it; otherwise each section holds its beats as C2 (`<craft-form>`) sets them out, and the order of the beats within a section, the words, the transitions and each scene's detail from the record are yours;";

  /** The task's lines, from its opening to the data that follows it. */
  function taskLines(prompt) {
    const start = prompt.indexOf('Write the article from the settled weave and the story map above.');
    expect(start).toBeGreaterThanOrEqual(0);
    return prompt.slice(start, prompt.indexOf('<DATA_CONTEXT>', start)).split('\n').filter((line) => line.startsWith('- '));
  }

  /**
   * A send-back rework: at the desk the director deleted the p-dna card, which carries beat b4
   * on the map, and inserted a paragraph from the letter under the map's leftOut.
   */
  async function sendBackPrompt() {
    const shown = clone(PREVIOUS_BUNDLE);
    const sentBack = clone(shown);
    sentBack.sections[0].content.splice(3, 1);
    sentBack.sections[0].content.push({ type: 'paragraph', text: DESK_PARAGRAPH });
    const sdk = recordingSdk(sentBack);
    await reviseContentBundle(articleState({
      _previousContentBundle: sentBack, articleRevisionCount: 0, humanArticleRevisionCount: 1,
      _articleFeedback: 'Tighten the closing.',
      _articleHandEdits: standingAfterSendBack(null, shown, sentBack, 'bundle')
    }), cfg(sdk));
    return sdk.mock.calls[0][0].prompt;
  }

  it('a send-back rework that deletes a card and inserts a paragraph from left-out material asks for nothing that contradicts either', async () => {
    const prompt = await sendBackPrompt();
    const edits = block(prompt, 'HAND_EDITS');
    expect(edits).toContain('E1 (section "the-story", evidence-card p-dna, cut)');
    expect(edits).toContain(`E2 (section "the-story", paragraph): "${DESK_PARAGRAPH}"`);
    // The map the rework reads still carries the cut card's beat, and the letter under leftOut.
    const map = blockJson(prompt, STORY_MAP_TAG);
    expect(map.sections.flatMap((section) => section.beats).filter((beat) => beat.card === 'p-dna').map((beat) => beat.id)).toEqual(['b4']);
    expect(map.leftOut.map((beat) => beat.material)).toEqual(['p-rescued']);

    const lines = taskLines(prompt);
    expect(lines.filter((line) => line.startsWith('- the beats:'))).toEqual([BEATS_LINE]);
    expect(lines.filter((line) => line.startsWith("- the map's sections in its order"))).toEqual([WORDS_LINE]);
    // Each task line that asks for the map's beats, keeps leftOut out of the article or gives the
    // writer the words names the director's cut, inserted block and text before it.
    const first = (line, director, after) => line.indexOf(director) >= 0 && line.indexOf(director) < line.indexOf(after);
    lines.filter((line) => line.includes("every beat in the map's sections")).forEach((line) => {
      expect(first(line, 'a block the director has cut stays out', "every beat in the map's sections")).toBe(true);
    });
    lines.filter((line) => line.includes('leftOut')).forEach((line) => {
      expect(first(line, 'a block the director has added stays, whatever its material', 'leftOut')).toBe(true);
    });
    lines.filter((line) => line.includes('are yours')).forEach((line) => {
      expect(first(line, 'the text the director has written into the article stays as written', 'are yours')).toBe(true);
    });
    // No line asks for the map's beats, or keeps leftOut out, ahead of the director's edits.
    expect(prompt).not.toContain("- every beat in the map's sections, and no other;");
    expect(prompt).not.toContain('the beats under leftOut stay out of the article');
  });

  it("the writer's first draft still asks for every beat of the map's sections and no other", async () => {
    const { user } = await writerPrompt(articleState());
    expect(user).not.toContain('<HAND_EDITS>');
    const lines = taskLines(user);
    expect(lines.filter((line) => line.startsWith('- the beats:'))).toEqual([BEATS_LINE]);
    expect(lines.filter((line) => line.startsWith("- the map's sections in its order"))).toEqual([WORDS_LINE]);
    expect(lines.filter((line) => line.includes("otherwise every beat in the map's sections, and no other,"))).toEqual([BEATS_LINE]);
  });
});
