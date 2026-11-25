/**
 * Phase 18, run 2h, slice W: the writers' lines the director approved on 2026-11-24 after the
 * second prompt read (docs/superpowers/specs/2026-11-24-phase-18-run-2c-wording.md, part 10),
 * each word for word in every prompt that prints it:
 * - the label over the director's notes (R47): one constant, printed by the weave writer, the map
 *   writer, the article writer, their reworks and both judges;
 * - the director's notes from the stops (R48), in every writer's prompt, a stop's name and an
 *   action's word read from the map the judges' block reads;
 * - the weave writer's list of who was played;
 * - the line over the map for the article writer, the list of section names after it, and the map
 *   as the article writer is shown it, with no gapNote and no dropped (R50);
 * - one word of the map's schema, and Blake's full name in the journalist theme (R51).
 *
 * The real nodes run on the rework fixture with the real PromptBuilder and a recording stand-in
 * for the model. Invented names and text: the repo is public.
 */

const { reworkFixtureState, OUTLINE, MAP, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const {
  generateOutline, reviseOutline, generateContentBundle, reviseContentBundle
} = require('../workflow/nodes/ai-nodes');
const arcNodes = require('../workflow/nodes/arc-specialist-nodes');
const { reviseArcs, _testing: { generateWeave } } = arcNodes;
const { _testing: { buildEvaluationUserPrompt } } = require('../workflow/nodes/evaluator-nodes');
const { standingOnMap, diffBundle } = require('../hand-edit-diff');
const { buildDirectorGuidanceSection, mapAsShown, STORY_MAP_TAG } = require('../prompt-builder');
const { SOURCES_GLOSS } = require('../evidence');
const director = require('../prompt-renderers/director-words-renderer');
const { getThemeNPCEntries, mapSlotsOf } = require('../theme-config');
const OUTLINE_SCHEMA = require('../schemas/outline.schema.json');

const clone = (v) => JSON.parse(JSON.stringify(v));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });
const recordingSdk = (value) => jest.fn(async () => clone(value));
const sent = (sdk) => sdk.mock.calls[0][0];
const count = (text, part) => text.split(part).length - 1;

// The approved lines, word for word (part 10).
const NOTES_LABEL = "The Director's Notes (what people did and said in the warehouse, and often what came after it and the director's own read of the session)\n" +
  "They are Nova's notes and thinking, not text for the article. A line they quote a person as saying is one the article can quote.\n" +
  'Backstory in the notes, what the director knows about the characters beyond what the session showed, is not in the record and did not happen in the warehouse. The article never states it as fact. It can appear as what Nova suspects, asks or believes.';
const STOP_NOTES_HEAD = "The director's notes from the stops so far, in order, in the director's own words. A note sent with a send-back was acted on at that stop: do not undo what it asked for. A note sent with an approval has not been acted on yet: act on it where it bears on your work.";
const MAP_LINE = `The story map as the director left it at the map's stop, as JSON. Each section gives its slot, heading, job, beats and photos. A section's job is its step: what the reader learns there about the question. A beat is one move of the story: its "move" says it in a few plain words, "synopsis", where the beat has one, says in one sentence what the article tells there, "players" names the people in it, "threads" the ids of the settled weave's threads it carries, and "connection" the id of the weave's connection that lands in it: the beat where the article shows those two threads meeting. Its "evidence" holds the pieces of the record the move can be told from, each with its "sources" (the id of a document in the record, ${SOURCES_GLOSS}), what it "shows", and its "stance": whether it supports the move or cuts against it. A piece that cuts against a beat is a caution or a disagreement. It keeps the article from claiming more than the record supports, and the article can tell the disagreement where the step needs it. A beat marked "card": true prints an inline evidence card of the document named by its piece flagged "card": true. A photo's "beat" is the beat it sits beside. A photo whose moment is outside the story sits in the section where its people appear, and nothing is written to explain it. "leftOut" lists the beats the story does not use.`;
const SECTION_NAMES = [
  "What each section's name stands for:",
  '- lede: the opening',
  '- theStory: what people said and did in front of everyone',
  '- followTheMoney: the money',
  '- thePlayers: particular people and what they wanted',
  "- whatsMissing: what nobody has explained",
  '- closing: the closing'
].join('\n');

/** The map the article reads, with a gap note and a dropped section, as a stored map may hold. */
const mapWithNotes = () => ({
  ...clone(MAP),
  gapNote: { line: 'The record holds nothing Sarah did.', players: ['Sarah'] },
  dropped: [{ slot: 'thePlayers', reason: 'Everyone appears above.' }]
});

const MEETING_NOTES = [
  { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Riley is not the buyer; Morgan is.', at: 't1' },
  { gate: 'arc-selection', kind: 'approval', round: 2, text: 'Keep Riley in view.', at: 't2' }
];

/** Each writer, each rework, and both judges, on one state. */
async function renderAll() {
  const state = { ...reworkFixtureState('journalist'), directorGateNotes: MEETING_NOTES, outline: mapWithNotes() };
  const renders = {};

  const weaveSdk = recordingSdk(state.weave);
  await generateWeave({ ...state, weave: null, arcRevisionCount: 0 }, cfg(weaveSdk));
  renders['weave writer'] = sent(weaveSdk);
  const arcSdk = recordingSdk(state.weave);
  await reviseArcs({
    ...state, _meetingRound: 'send-back', _arcFeedback: 'Open on the bar.', humanArcRevisionCount: 1, arcRevisionCount: 0,
    validationResults: { phase: 'arcs', passed: true, structuralIssues: [] }
  }, cfg(arcSdk));
  renders['weave rework'] = sent(arcSdk);

  const mapSdk = recordingSdk(OUTLINE);
  const { heroImage } = await generateOutline({ ...state, outline: null }, cfg(mapSdk));
  renders['map writer'] = sent(mapSdk);
  const edited = clone(OUTLINE);
  edited.headline = 'The Headline the Director Wrote';
  const mapReworkSdk = recordingSdk(edited);
  await reviseOutline({
    ...state, heroImage, outline: null, _previousOutline: edited, _outlineFeedback: 'Open on the vote.',
    _outlineHandEdits: standingOnMap(null, OUTLINE, edited), humanOutlineRevisionCount: 1, outlineRevisionCount: 0,
    validationResults: { phase: 'outline', passed: true, structuralIssues: [], advisoryWarnings: [] }
  }, cfg(mapReworkSdk));
  renders['map rework'] = sent(mapReworkSdk);

  const articleState = { ...state, heroImage: 'hero.jpg' };
  const articleSdk = recordingSdk(PREVIOUS_BUNDLE);
  await generateContentBundle({ ...articleState, contentBundle: null }, cfg(articleSdk));
  renders['article writer'] = sent(articleSdk);
  const editedBundle = clone(PREVIOUS_BUNDLE);
  editedBundle.headline.main = 'Hand-edited headline';
  const articleReworkSdk = recordingSdk(editedBundle);
  await reviseContentBundle({
    ...articleState, contentBundle: null, _previousContentBundle: editedBundle,
    _articleFeedback: 'Put the test before the sale.', _articleHandEdits: diffBundle(PREVIOUS_BUNDLE, editedBundle),
    humanArticleRevisionCount: 1, articleRevisionCount: 0,
    validationResults: { phase: 'article', passed: true, structuralIssues: [], advisoryWarnings: [] }
  }, cfg(articleReworkSdk));
  renders['article rework'] = sent(articleReworkSdk);

  renders['weave judge'] = { prompt: buildEvaluationUserPrompt('arcs', state, {}), systemPrompt: '' };
  renders['article judge'] = { prompt: buildEvaluationUserPrompt('article', { ...articleState, contentBundle: clone(PREVIOUS_BUNDLE) }, {}), systemPrompt: '' };
  return { state, renders };
}

let state;
let renders;
beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  ({ state, renders } = await renderAll());
});
afterAll(() => jest.restoreAllMocks());

const WRITERS = ['weave writer', 'weave rework', 'map writer', 'map rework', 'article writer', 'article rework'];
const PROMPTS = [...WRITERS, 'weave judge', 'article judge'];
const whole = (name) => `${renders[name].systemPrompt}\n=====\n${renders[name].prompt}`;

describe('R47: one label over the director\'s notes, in every prompt that prints them', () => {
  it('is one constant, the approved label, which the weave writer\'s module still exports under its old name', () => {
    expect(director.DIRECTOR_NOTES_LABEL).toBe(NOTES_LABEL);
    expect(arcNodes.ARC_NOTES_LABEL).toBe(director.DIRECTOR_NOTES_LABEL);
  });

  it.each(PROMPTS)('%s prints it once', (name) => {
    expect(`${name}: ${count(whole(name), NOTES_LABEL)}`).toBe(`${name}: 1`);
  });

  it('the weave writer and its rework print it as the heading of the notes, as before', () => {
    ['weave writer', 'weave rework'].forEach((name) => expect(renders[name].prompt).toContain(`### ${NOTES_LABEL}\n`));
  });

  it("the map writer and the article writer print it at the top of the notes' block, in place of the old line, with the block's own lines after it", () => {
    ['map writer', 'map rework', 'article writer', 'article rework'].forEach((name) => {
      const prompt = renders[name].prompt;
      expect(prompt).toContain(`<INVESTIGATION_OBSERVATIONS>\n${NOTES_LABEL}\nEach block below says what it is.\nThe follow-up from Nova's day is the <EPILOGUE> below.`);
      expect(prompt).not.toContain("The director's notes on the session, as written.");
    });
  });

  it('both judges print it bare over the notes, as before', () => {
    ['weave judge', 'article judge'].forEach((name) => expect(renders[name].prompt).toContain(`${NOTES_LABEL}\n<DIRECTOR_NOTES>`));
  });
});

describe('R48: the director\'s notes from the stops, in every writer\'s prompt', () => {
  it('prints one paragraph, then one line a note, by the stop\'s name and the action\'s word the judges\' block prints', () => {
    const section = buildDirectorGuidanceSection([
      { gate: 'arc-selection', kind: 'rejection', round: 1, text: '  Riley is not the buyer.  ' },
      { gate: 'outline', kind: 'approval', round: 1, text: 'Keep the bar.' },
      { gate: 'article', kind: 'rejection', round: 2, text: 'Cut the second quote.' },
      { gate: 'arc-selection', text: 'A note from before approval notes existed.' },
      { gate: 'input-review', kind: 'rejection', round: 3, text: 'A stop the map does not name.' },
      { gate: 'outline', kind: 'rejection', text: 'A note with no round.' },
      { gate: 'outline', kind: 'approval', text: '   ' }
    ]);
    expect(section).toBe([
      '<DIRECTOR_GUIDANCE>',
      STOP_NOTES_HEAD,
      '- [the story meeting, sent back, round 1] Riley is not the buyer.',
      '- [the map, approved] Keep the bar.',
      '- [the article, sent back, round 2] Cut the second quote.',
      '- [the story meeting, sent back, round 1] A note from before approval notes existed.',
      '- [an earlier stop, sent back, round 3] A stop the map does not name.',
      '- [the map, sent back, round 1] A note with no round.',
      '</DIRECTOR_GUIDANCE>'
    ].join('\n'));
  });

  it("takes the stop's name and the action's word from the one map the judges' block reads", () => {
    expect(director.STOP_NOTE_PLACES).toEqual({ 'arc-selection': 'the story meeting', outline: 'the map', article: 'the article' });
    expect(director.STOP_NOTE_ACTIONS).toEqual({ approval: 'approved', rejection: 'sent back' });
    const notes = [{ gate: 'outline', kind: 'approval', text: 'x' }, { gate: 'nowhere', text: 'y' }];
    expect(notes.map(director.stopNotePlaceOf)).toEqual(['the map', 'an earlier stop']);
    expect(notes.map(director.stopNoteActionOf)).toEqual(['approved', 'sent back']);
  });

  it('is empty with no note that has text', () => {
    expect(buildDirectorGuidanceSection([])).toBe('');
    expect(buildDirectorGuidanceSection([{ gate: 'outline', text: ' ' }])).toBe('');
  });

  it.each(WRITERS)('%s prints it last, in the approved words', (name) => {
    const prompt = renders[name].prompt;
    const block = prompt.slice(prompt.lastIndexOf('<DIRECTOR_GUIDANCE>'));
    expect(block.startsWith(`<DIRECTOR_GUIDANCE>\n${STOP_NOTES_HEAD}\n`)).toBe(true);
    expect(block).not.toMatch(/Standing notes|rejection|approval note|forward guidance|arc-selection|\[outline/);
  });
});

describe("the weave writer's list of who was played", () => {
  const { buildCharacterCategoriesBlock } = arcNodes._testing;

  it('labels each list in the approved words, with a thread naming one not played through the record or the director\'s words', () => {
    expect(buildCharacterCategoriesBlock(['Alex', 'Morgan'], 'journalist', ['Alex', 'Morgan', 'Riley', 'Sarah'])).toBe(`### Character Categories

**Played in this session** (they were at the investigation; the part about this session says how Nova knows what they did):
["Alex","Morgan"]

**The game's own characters** (never players):
Marcus, Nova, Blake

**Not played in this session**:
Riley, Sarah
- A thread names one only through what the record or the director's words show of them.
`);
  });

  it('says none were left unplayed when everyone played', () => {
    const block = buildCharacterCategoriesBlock(['Alex'], 'journalist', ['Alex']);
    expect(block).toContain('**Not played in this session**:\n(none this session)\n');
    expect(block).not.toMatch(/ROSTER PCs|NPCs|NON-ROSTER/);
  });

  it('is what the weave writer prints', () => {
    expect(renders['weave writer'].prompt).toContain('**Played in this session** (they were at the investigation;');
    expect(renders['weave writer'].prompt).not.toMatch(/ROSTER PCs|\*\*NPCs\*\*|NON-ROSTER/);
  });
});

describe('R50: the line over the map, the names of its sections, and the map as the article writer is shown it', () => {
  it.each(['article writer', 'article rework'])('%s prints the approved line, then the names, then the map as shown', (name) => {
    const expected = `<${STORY_MAP_TAG}>\n${MAP_LINE}\n${SECTION_NAMES}\n${JSON.stringify(mapAsShown(mapWithNotes()), null, 2)}\n</${STORY_MAP_TAG}>`;
    expect(renders[name].prompt).toContain(expected);
  });

  it("builds the names from the theme's sections, as the map writer's list is", () => {
    expect(SECTION_NAMES.split('\n').slice(1)).toEqual(mapSlotsOf('journalist').map((slot) => `- ${slot.key}: ${slot.description}`));
    // The map writer's list prints the same lines.
    mapSlotsOf('journalist').forEach((slot) => expect(renders['map writer'].prompt).toContain(`\n- ${slot.key}: ${slot.description}\n`));
  });

  it('the map as shown holds no gapNote and no dropped; the stored map keeps both, and every other field', () => {
    const stored = mapWithNotes();
    const before = clone(stored);
    const shown = mapAsShown(stored);
    expect(shown).not.toHaveProperty('gapNote');
    expect(shown).not.toHaveProperty('dropped');
    expect(stored).toEqual(before);
    const { gapNote: _g, dropped: _d, ...rest } = before;
    expect(Object.keys(shown).sort()).toEqual(Object.keys(rest).sort());
    expect(shown.headline).toEqual(before.headline);
    expect(state.outline).toEqual(mapWithNotes());
  });

  it("the article writer's prompt holds neither note to the director", () => {
    ['article writer', 'article rework'].forEach((name) => {
      const prompt = renders[name].prompt;
      const map = prompt.slice(prompt.indexOf(`<${STORY_MAP_TAG}>`), prompt.indexOf(`</${STORY_MAP_TAG}>`));
      expect(map).not.toContain('"gapNote"');
      expect(map).not.toContain('"dropped"');
      expect(map).not.toContain('The record holds nothing Sarah did.');
    });
  });
});

describe('one field of the map', () => {
  it("says each connection lands in one beat, in a section's beats and in the left-out beats", () => {
    const schema = JSON.stringify(OUTLINE_SCHEMA);
    expect(count(schema, "The id of the settled weave's connection that lands in this beat; each connection lands in one beat")).toBe(2);
    expect(schema).not.toContain('live connection');
    expect(renders['map writer'].prompt).toContain('each connection lands in one beat');
    expect(renders['map writer'].prompt).not.toContain('live connection');
  });
});

describe("R51: Blake's full name, in the journalist theme only", () => {
  const blake = (theme) => getThemeNPCEntries(theme).find((entry) => entry && entry.name === 'Blake');

  it('is Blake Manley for the journalist, and the parked theme keeps its own', () => {
    expect(blake('journalist').fullName).toBe('Blake Manley');
    expect(blake('detective').fullName).toBe('Blake');
  });

  it("the list of names prints it beside Blake's role, and the alias still names Blake", () => {
    ['weave writer', 'map writer', 'article writer'].forEach((name) => {
      expect(whole(name)).toContain('\n- Blake Manley - manages operations at NeurAI; Marcus called Blake his Valet\n');
    });
  });
});
