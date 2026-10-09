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
const { beatCardOf } = require('../../console/outline-edit-logic');

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

/** The article task's lines, from its opening to the data that follows it. */
function taskLines(prompt) {
  const start = prompt.indexOf('Write the article from the settled weave and the story map above.');
  expect(start).toBeGreaterThanOrEqual(0);
  return prompt.slice(start, prompt.indexOf('<DATA_CONTEXT>', start)).split('\n').filter((line) => line.startsWith('- '));
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

  // Phase 4b (fix round 2): the director rewrites a move, the line a beat carries since brief 1D.
  it('prints the map as the director left it (state.outline), never the writer\'s last map', async () => {
    const writers = MAP.sections[3].beats[0].move;
    expect(writers).toBe('Riley says they only kept the books');
    const left = clone(MAP);
    left.sections[3].beats[0].move = 'Riley at the door with the ledger, the last to leave';
    const { user } = await writerPrompt(articleState({ outline: left, _mapBaseline: clone(MAP) }));

    expect(blockJson(user, STORY_MAP_TAG)).toEqual(left);
    expect(block(user, STORY_MAP_TAG)).toContain('"move": "Riley at the door with the ledger, the last to leave"');
    expect(block(user, STORY_MAP_TAG)).not.toContain(writers);
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
// Brief 4.7f (ruling 2 on 4.5f's and 4.7e's findings) reworded both lines: they give the
// director's edits precedence, as HAND_EDITS gives them, and the rule for those edits, with its
// send-back exception, is HAND_EDITS' alone (the 4.7f describe below).
describe("4.7e: the rework's task gives a card the director cut and a paragraph they inserted at the desk precedence over the map", () => {
  const { standingAfterSendBack } = require('../hand-edit-diff');
  /** A paragraph the director inserts at the desk, from the letter the map left out (b9, p-rescued). */
  const DESK_PARAGRAPH = 'An unsigned letter warned Marcus about the Stanford patents a week before he died.';
  /**
   * The task's beats line: the director's edits first, as HAND_EDITS gives them, the map's beats
   * otherwise. Phase 4b (brief 1E; fix round 3) adds what C16 does not say: a beat with no
   * evidence told from the record, and the rules on citing (the 1E describe below).
   */
  const BEATS_LINE = "- the beats: the director's edits first, as HAND_EDITS gives them; otherwise every beat in the map's sections, and no other, so the beats under leftOut, the director's strikes among them, stay out of the article; a beat that carries no evidence told from the record; each source cited as T1 sets out, and a card as C9 (`<craft-cards>`) sets out;";
  /** The task's words line: the director's edits first, the map's beats and the writer's words otherwise. */
  // Phase 4b, piece 4 (brief 4B; R2): the order of a section's beats is the map's, so the line
  // gives the writer the beats in the map's order, and the words, the transitions and the detail.
  const WORDS_LINE = "- the map's sections in its order; the director's edits first, as HAND_EDITS gives them; otherwise each section holds its beats in the map's order, as C2 (`<craft-form>`) sets them out, and the words, the transitions and each scene's detail from the record are yours;";
  /** The precedence both lines open their body with. */
  const FIRST = "the director's edits first, as HAND_EDITS gives them";

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

  it("a send-back rework that deletes a card and inserts a paragraph from left-out material: the task's beats and words lines put the director's edits first, as HAND_EDITS gives them, and the map's beats after them", async () => {
    const prompt = await sendBackPrompt();
    const edits = block(prompt, 'HAND_EDITS');
    expect(edits).toContain('E1 (section "the-story", evidence-card p-dna, cut)');
    expect(edits).toContain(`E2 (section "the-story", paragraph): "${DESK_PARAGRAPH}"`);
    // The map the rework reads still carries the cut card's beat, and the letter under leftOut.
    const map = blockJson(prompt, STORY_MAP_TAG);
    // Phase 4b (brief 1D; R4): a beat's card is its flagged piece, read through beatCardOf.
    expect(map.sections.flatMap((section) => section.beats).filter((beat) => beatCardOf(beat) === 'p-dna').map((beat) => beat.id)).toEqual(['b4']);
    expect(map.leftOut.map((beat) => beat.evidence[0].sources)).toEqual([['p-rescued']]);

    const lines = taskLines(prompt);
    expect(lines.filter((line) => line.startsWith('- the beats:'))).toEqual([BEATS_LINE]);
    expect(lines.filter((line) => line.startsWith("- the map's sections in its order"))).toEqual([WORDS_LINE]);
    // Each task line that asks for the map's beats, keeps leftOut out of the article or gives the
    // writer the words names the director's edits before it.
    const first = (line, after) => line.indexOf(FIRST) >= 0 && line.indexOf(FIRST) < line.indexOf(after);
    lines.filter((line) => line.includes("every beat in the map's sections")).forEach((line) => {
      expect(first(line, "every beat in the map's sections")).toBe(true);
    });
    lines.filter((line) => line.includes('leftOut')).forEach((line) => expect(first(line, 'leftOut')).toBe(true));
    lines.filter((line) => line.includes('are yours')).forEach((line) => expect(first(line, 'are yours')).toBe(true));
    // No line asks for the map's beats, or keeps leftOut out, ahead of the director's edits.
    expect(prompt).not.toContain("- every beat in the map's sections, and no other;");
    expect(prompt).not.toContain('the beats under leftOut stay out of the article');
  });

  it("the writer's first draft still asks for every beat of the map's sections and no other", async () => {
    const { user } = await writerPrompt(articleState());
    // The task names the block, which only a rework's prompt carries.
    expect(user).not.toMatch(/^<HAND_EDITS>$/m);
    const lines = taskLines(user);
    expect(lines.filter((line) => line.startsWith('- the beats:'))).toEqual([BEATS_LINE]);
    expect(lines.filter((line) => line.startsWith("- the map's sections in its order"))).toEqual([WORDS_LINE]);
    expect(lines.filter((line) => line.includes("otherwise every beat in the map's sections, and no other,"))).toEqual([BEATS_LINE]);
    // Phase 4b, piece 4 (R2): no task line gives the writer the order of a section's beats.
    expect(lines.filter((line) => /order of the beats/.test(line))).toEqual([]);
  });
});

// Brief 4.7f (ruling 2 on 4.5f's and 4.7e's findings): the rule for the director's desk edits,
// with its send-back exception, is stated in <HAND_EDITS> alone, and the task's lines give it
// precedence. 4.7e's lines restated the rule, a cut staying out among it, without the exception,
// so a send-back whose note asked for a cut card back met two statements that disagreed. And a cut takes its material with it: the cut check flags only the cut's own
// sentences coming back, so the rule asks the rework to retell the cut in no other words.
describe("4.7f: the director's desk edits, stated once", () => {
  const { standingAfterSendBack } = require('../hand-edit-diff');
  const { instructionText } = require('./fixtures/removed-phrases');
  /** The round-2 note: it asks for the card the director cut at the desk in round 1. */
  const BRING_BACK = 'Bring the DNA test card back into The Story, right after "Then the test came back."';
  /** The rule's line on a cut, as <HAND_EDITS> states it. */
  const CUT_RULE = 'What a block they cut said is not said again anywhere in the article.';
  /** The rule's exception, which <HAND_EDITS> states on a send-back. */
  const EXCEPTION = 'unless the structural change their note asks for means it no longer fits';
  /** Each rule-set file's block in the prompts (the world, the truth rules, the mode block, the craft), the director's wording. */
  const RULE_SET_BLOCK = /^<(world|truth-rules|mode-[a-z-]+|craft-[a-z]+)>$[\s\S]*?^<\/\1>$/gm;

  /**
   * The rework's prompts after the director cut the p-dna card at the desk in round 1.
   * `round: 1` is that send-back, with `note`; `round: 2` sends the round-1 rework back
   * unchanged, with the note that asks for the card back; `round: 0` is an automatic pass.
   */
  async function cutCardRework({ round, note = 'Tighten the closing.' }) {
    const shown = clone(PREVIOUS_BUNDLE);
    const cut = clone(shown);
    cut.sections[0].content.splice(3, 1);
    const roundOne = standingAfterSendBack(null, shown, cut, 'bundle');
    const handEdits = round === 2 ? standingAfterSendBack(roundOne, clone(cut), clone(cut), 'bundle') : roundOne;
    const sdk = recordingSdk(cut);
    await reviseContentBundle(articleState({
      _previousContentBundle: clone(cut), _articleHandEdits: handEdits,
      articleRevisionCount: round === 0 ? 1 : 0, humanArticleRevisionCount: round,
      _articleFeedback: round === 0 ? null : (round === 2 ? BRING_BACK : note)
    }), cfg(sdk));
    return { user: sdk.mock.calls[0][0].prompt, system: sdk.mock.calls[0][0].systemPrompt };
  }

  it("a send-back whose note asks for a cut card back: no line outside <HAND_EDITS> says the cut stays out, and <HAND_EDITS> states the rule with its exception", async () => {
    const { user, system } = await cutCardRework({ round: 2 });
    expect(user).toContain(`HUMAN FEEDBACK (HIGHEST PRIORITY):\n${BRING_BACK}`);

    // The pipeline's own lines: the prompts without <HAND_EDITS> and the rule set's files, whose
    // wording is the director's. Every one that keeps something out names HAND_EDITS before it.
    const own = [system, user].flatMap((prompt) => prompt.replace(/^<HAND_EDITS>$[\s\S]*?^<\/HAND_EDITS>$/m, '').replace(RULE_SET_BLOCK, '').split('\n'));
    const keepsOut = own.filter((line) => /\bstays? out\b/i.test(line));
    expect(keepsOut.filter((line) => !(line.includes('HAND_EDITS') && line.indexOf('HAND_EDITS') < line.search(/\bstays? out\b/i)))).toEqual([]);
    // The task's lines state no rule for the director's edits of their own.
    expect(taskLines(user).filter((line) => /stays (out|as written|where)|has added stays/.test(line))).toEqual([]);

    const edits = block(user, 'HAND_EDITS');
    expect(edits).toContain('E1 (section "the-story", evidence-card p-dna, cut)');
    expect(edits).toContain(EXCEPTION);
    expect(edits).toContain(CUT_RULE);
  });

  it("a cut card's content: <HAND_EDITS> says what the cut block said is not said again, on a send-back and on an automatic pass", async () => {
    const sendBack = block((await cutCardRework({ round: 1 })).user, 'HAND_EDITS');
    expect(sendBack).toContain('E1 (section "the-story", evidence-card p-dna, cut)');
    expect(sendBack).toContain(EXCEPTION);
    expect(sendBack).toContain(CUT_RULE);
    const automatic = block((await cutCardRework({ round: 0 })).user, 'HAND_EDITS');
    expect(automatic).toContain(CUT_RULE);
    expect(automatic).not.toContain(EXCEPTION);
  });

  // The task names the block without its angle brackets, as the judge's questions name
  // FINANCIAL_SUMMARY: the removed-phrase scan strips a <HAND_EDITS> block from the first
  // "<HAND_EDITS>" it meets, so a bracketed name in the task, above the block, would hide every
  // line between them from the scan.
  it("names HAND_EDITS without its brackets, so the removed-phrase scan still reads the lines between the task and the block", async () => {
    const { user } = await cutCardRework({ round: 1 });
    expect(taskLines(user).filter((line) => line.includes('<HAND_EDITS>'))).toEqual([]);
    expect(instructionText(user)).toContain('Write the article as a ContentBundle');
  });
});

// Phase 4b (brief 1E; spec 2026-10-05 sections 5.2, 5.3 and 7; R4): the article writer reads the
// evidence. A beat on the map is a move with its people, the threads it carries and the pieces of
// the record it is told from, one piece flagged as its card's document. The label above the map
// says how to read that, C16 has the writer tell each beat from its evidence and cite it, the
// task's beats line adds only what C16 does not say (a beat with no evidence and the rules on how
// to cite), and the instruction's card line names each card's document
// (prompt-builder-card-fields.test.js). The rework carries all three word for word.
describe('1E: the article writer tells each beat from the evidence it carries', () => {
  const { EVIDENCE_SOURCES } = require('../evidence');
  /** The label: the line right after <STORY_MAP>. */
  const labelOf = (prompt) => block(prompt, STORY_MAP_TAG).split('\n')[1];
  /** The instruction's card line. */
  const cardLineOf = (prompt) => prompt.split('\n').filter((line) => line.startsWith('     * {"type": "evidence-card"'));
  /** What the beats line adds to C16 on each beat, after the beats it names. */
  const BEATS_EVIDENCE = 'a beat that carries no evidence told from the record; each source cited as T1 sets out, and a card as C9 (`<craft-cards>`) sets out;';
  /** The precedence the beats line and the card line open with. */
  const FIRST = "the director's edits first, as HAND_EDITS gives them";

  it("the map's label reads a beat as a move: its words, its people, its threads, its evidence and the card flag, and no material", async () => {
    const { user } = await writerPrompt(articleState());
    const label = labelOf(user);
    // Phase 4b, piece 4 (brief 4B; R1): the label names the beat's summary, its synopsis, which a
    // map from before piece 4 and a move the director added may lack.
    expect(label).toContain('A beat is one move of the story: its "move" says it in a few plain words, "synopsis", where the beat has one, says in one sentence what the article tells there, "players" names the people in it, "threads" the ids of the settled weave\'s threads it carries, and "connection" the id of the weave\'s connection that lands in it.');
    expect(label).toContain('Its "evidence" holds the pieces of the record the move is told from, each with its "sources"');
    expect(label).toContain('what it "shows", and its "stance": whether it supports the move or cuts against it.');
    expect(label).toContain('A beat marked "card": true prints an inline evidence card of the document named by its piece flagged "card": true.');
    // A piece's sources besides a document, as lib/evidence.js names them.
    Object.values(EVIDENCE_SOURCES).forEach((source) => expect(label).toContain(`"${source}"`));
    expect(label).not.toMatch(/material|the id of the document it prints/);
    // It names the record in words: the map prints above the record, whose first tag is the record.
    expect(label).not.toContain('<RECORD>');

    // Each field the label names is one the printed map carries, on a beat or on a piece.
    const map = blockJson(user, STORY_MAP_TAG);
    const beats = map.sections.flatMap((section) => section.beats);
    ['move', 'synopsis', 'players', 'threads', 'connection', 'evidence', 'card'].forEach((field) => {
      expect(`${field}: ${beats.some((beat) => field in beat)}`).toBe(`${field}: true`);
    });
    const pieces = beats.flatMap((beat) => beat.evidence);
    ['sources', 'shows', 'stance', 'card'].forEach((field) => {
      expect(`${field}: ${pieces.some((piece) => field in piece)}`).toBe(`${field}: true`);
    });
  });

  it("the map's label and the weave writer's Sources line print one gloss of the named sources, lib/evidence.js's", async () => {
    const { SOURCES_GLOSS } = require('../evidence');
    const { _testing: { buildWeaveSections } } = require('../workflow/nodes/arc-specialist-nodes');
    // The gloss says what each named source holds, in the weave writer's words: the director's
    // words under "notes" are the four the evidence check reads (evidenceContextOf).
    expect(SOURCES_GLOSS).toBe('"ledger" for a sale, the bonus or a transfer on the morning timeline, "evidence-log" for an exposure on it, or "notes" for the director\'s own words: the notes, the corrections, the accusation, the answers at the story meeting and the standing notes from the stops');
    const { user } = await writerPrompt(articleState());
    expect(labelOf(user)).toContain(`each with its "sources" (the id of a document in the record, ${SOURCES_GLOSS}), what it "shows"`);
    expect(buildWeaveSections(articleState())).toContain(`A piece of evidence names each of its sources by one of these document ids, or as ${SOURCES_GLOSS}.\n`);
  });

  it("the beats line leaves C16's sentence to C16, sends a beat with no evidence to the record and points at the rules on citing that the prompt holds", async () => {
    const { user, system } = await writerPrompt(articleState());
    const beatsLines = taskLines(user).filter((line) => line.startsWith('- the beats:'));
    expect(beatsLines).toHaveLength(1);
    expect(beatsLines[0].startsWith(`- the beats: ${FIRST};`)).toBe(true);
    expect(beatsLines[0].endsWith(` ${BEATS_EVIDENCE}`)).toBe(true);
    // Each rule is stated once (spec section 8): C16, in the craft files the prompt holds, tells
    // the article writer to write each beat from its evidence and cite it, and the line says it
    // no second time. Task 4A's rule text has C16 tell each beat as the beat's sentence says.
    expect(user).toMatch(/^<craft-story>$[\s\S]*It tells each beat as the beat's sentence says, from the evidence the beat carries, and cites it\.[\s\S]*^<\/craft-story>$/m);
    expect(beatsLines[0]).not.toMatch(/from the evidence it carries|evidence cited/);
    // The items it points at: T1 in the truth rules, which print in the system prompt alone, and
    // C9 in the craft files.
    expect(system).toMatch(/^<truth-rules>$[\s\S]*^## T1\. [\s\S]*^<\/truth-rules>$/m);
    expect(user).not.toContain('<truth-rules>');
    expect(user).toMatch(/^<craft-cards>\n## C9\./m);
    // The writer still reads the record for each scene's detail.
    expect(taskLines(user).filter((line) => line.includes("each scene's detail from the record"))).toHaveLength(1);
  });

  // The task's offer of the record for a beat with no evidence is a fixed line, in the prompt
  // whether such a beat is or not: the beats-line test above holds it.
  it('a beat the director added on the map, with no evidence, prints as they left it', async () => {
    const map = clone(MAP);
    map.sections[3].beats.push({ id: 'b7', move: 'Riley leaves by the back door', players: ['Riley'] });
    const { user } = await writerPrompt(articleState({ outline: map }));
    const printed = blockJson(user, STORY_MAP_TAG).sections[3].beats.find((beat) => beat.id === 'b7');
    expect(printed).toEqual({ id: 'b7', move: 'Riley leaves by the back door', players: ['Riley'] });
  });

  it('a send-back that cut a card at the desk: the card line still names the map\'s card, behind the director\'s edits', async () => {
    const { standingAfterSendBack } = require('../hand-edit-diff');
    const shown = clone(PREVIOUS_BUNDLE);
    const cut = clone(shown);
    cut.sections[0].content.splice(3, 1);
    const sdk = recordingSdk(cut);
    await reviseContentBundle(articleState({
      _previousContentBundle: clone(cut), articleRevisionCount: 0, humanArticleRevisionCount: 1,
      _articleFeedback: 'Tighten the closing.',
      _articleHandEdits: standingAfterSendBack(null, shown, cut, 'bundle')
    }), cfg(sdk));
    const prompt = sdk.mock.calls[0][0].prompt;
    expect(block(prompt, 'HAND_EDITS')).toContain('E1 (section "the-story", evidence-card p-dna, cut)');

    const [line] = cardLineOf(prompt);
    expect(line).toContain('"p-dna" for b4');
    expect(line.indexOf(FIRST)).toBeGreaterThan(0);
    expect(line.indexOf(FIRST)).toBeLessThan(line.indexOf('"ale003" for b2'));
  });

  it('the rework carries the label, the beats line and the card line as its writer prints them', async () => {
    const state = articleState();
    const { user: writer } = await writerPrompt(state);
    const sdk = recordingSdk(PREVIOUS_BUNDLE);
    await reviseContentBundle({ ...state, _previousContentBundle: clone(PREVIOUS_BUNDLE), articleRevisionCount: 1 }, cfg(sdk));
    const rework = sdk.mock.calls[0][0].prompt;

    expect(labelOf(rework)).toBe(labelOf(writer));
    expect(taskLines(rework).filter((line) => line.startsWith('- the beats:')))
      .toEqual(taskLines(writer).filter((line) => line.startsWith('- the beats:')));
    expect(cardLineOf(rework)).toEqual(cardLineOf(writer));
    expect(cardLineOf(writer)).toHaveLength(1);
    expect(cardLineOf(writer)[0]).toContain('"ale003" for b2');
  });
});
