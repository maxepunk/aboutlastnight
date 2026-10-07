/**
 * The map as a corkboard, the server side (phase 4b, piece 4, brief 4B; spec
 * docs/superpowers/specs/2026-10-07-map-as-corkboard.md sections 3, 9 to 11, 13 and 17; rulings R1,
 * R2, R4 and R5).
 *
 * A beat gains its summary, `synopsis`: one sentence, in story terms, saying what the article
 * tells at that move. The writer's schema requires it and the director's does not, so a map from
 * before piece 4 still validates and is no earlier shape. The checks hold each synopsis the writer
 * wrote to story terms, and each of the writer's beats in a section to the threads the settled
 * story tells. The map's stop sends the legend: the story's threads in the angle's order, the
 * connections between them, and the names of the weave's other threads. The map writer's task asks
 * for the synopses, the order and both pages; the article writer reads the synopsis and takes the
 * order from the map. Invented text: the repo is public.
 */
const Ajv = require('ajv');
const {
  mapFindings, mapSchemaFor, directorMapSchemaFor, directorMapProblems, mapCheckpointData,
  MAP_WORD_BOUND, MAP_WORD_AIM, MAP_OPEN_WORD_BOUND, MAP_SYNOPSIS_AIM
} = require('../map');
const { isOldShapeMap } = require('../old-thread');
const { standingOnMap, carriedEdits } = require('../hand-edit-diff');
const { addBeat, bringBackBeat, validateOutlineShape } = require('../../console/outline-edit-logic');
const { _testing: mapNodes } = require('../workflow/nodes/map-nodes');
const { keptPhotoFilenames } = require('../workflow/nodes/ai-nodes');
const { mapSlotsOf } = require('../theme-config');
const { storyLevelMap, storyLevelMapState } = require('./fixtures/story-level-map');

const clone = (v) => JSON.parse(JSON.stringify(v));
const beatOf = (map, id) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut].find((b) => b.id === id);
const inputsOf = (state, map = state.outline) => mapNodes.mapCheckInputsOf(state, map);
const check = (map, overrides = {}) => mapFindings(map, inputsOf(storyLevelMapState(overrides), map));
/** The director's standing edits on `left`, made against the writer's map. */
const editsAgainst = (base, left) => carriedEdits(standingOnMap(null, base, left), left);
/** The map with no synopsis on any beat: a map written before piece 4. */
const withoutSynopses = (map) => {
  [...map.sections.flatMap((s) => s.beats), ...map.leftOut].forEach((beat) => { delete beat.synopsis; });
  return map;
};

// ═══════════════════════════════════════════════════════════════════════════
// The shape (R1)
// ═══════════════════════════════════════════════════════════════════════════

describe('4B: a beat carries its synopsis, required of the writer and never of the director (R1)', () => {
  const writer = mapSchemaFor('journalist');
  const director = directorMapSchemaFor('journalist');
  const copies = (schema) => [schema.properties.sections.items.properties.beats.items, schema.properties.leftOut.items];

  it("the writer's schema requires synopsis, a string, after players, in both copies of the beat", () => {
    copies(writer).forEach((beat) => {
      expect(Object.keys(beat.properties)).toEqual(['id', 'move', 'players', 'synopsis', 'threads', 'connection', 'card', 'kind', 'evidence']);
      expect(beat.properties.synopsis.type).toBe('string');
      expect(beat.required).toContain('synopsis');
    });
  });

  it("the director's schema does not require it: a beat they add needs only its id and its move", () => {
    copies(director).forEach((beat) => {
      expect(beat.properties.synopsis.type).toBe('string');
      expect(beat.required).toEqual(['id', 'move']);
    });
  });

  it("the synopsis's description says what it is in the map writer's <SCHEMA>: one sentence, in story terms, on what the article tells there", () => {
    const { description } = copies(writer)[0].properties.synopsis;
    expect(description).toMatch(/one sentence/i);
    expect(description).toMatch(/story terms/);
    expect(description).toMatch(/what the article tells/);
    expect(description).not.toMatch(/—/);
    expect(copies(writer)[1].properties.synopsis).toEqual(copies(writer)[0].properties.synopsis);
  });

  it("a section's beats are described in the order the article tells them", () => {
    expect(writer.properties.sections.items.properties.beats.description).toMatch(/in the order the article tells them/);
  });

  it("the writer's map with its synopses is the writer's; a synopsis that is no text is refused by both gates", () => {
    expect(new Ajv({ allErrors: true, strict: true }).compile(writer)(storyLevelMap())).toBe(true);
    const bad = storyLevelMap();
    beatOf(bad, 'b2').synopsis = ['The room votes'];
    expect(directorMapProblems(bad, { theme: 'journalist', shown: storyLevelMap() })).toMatch(/synopsis/);
    expect(validateOutlineShape(bad, 'journalist', mapSlotsOf('journalist'), storyLevelMap()).valid).toBe(false);
  });

  it('Review focus 2: a map from before piece 4, with no synopses, passes the director\'s gate and the client\'s, and is no earlier shape', () => {
    const old = withoutSynopses(storyLevelMap());
    expect(directorMapProblems(old, { theme: 'journalist', shown: clone(old) })).toBeNull();
    expect(validateOutlineShape(old, 'journalist', mapSlotsOf('journalist'), clone(old))).toEqual({ valid: true, errors: [] });
    expect(isOldShapeMap(old)).toBe(false);
    // The checks read it as they read any map: nothing fails for a missing synopsis.
    expect(check(old, { outline: old, _mapBaseline: clone(old) })).toEqual({ failures: [], concerns: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The checks: story terms on the synopsis
// ═══════════════════════════════════════════════════════════════════════════

describe("4B: each synopsis the writer wrote is in story terms, and the director's never fails", () => {
  it.each([
    ['a quotation', 'Sam writes, "I think he is trying the new batch on himself"'],
    ['a clock time', 'Marcus tries the batch on himself at 9:58.'],
    ['a figure', 'Marcus spends $450,000 to try the batch on himself.'],
    ['a document id', 'Sam001 shows Marcus trying the batch on himself.']
  ])("a writer's synopsis that holds %s fails beside its move, the line naming the move by its title", (_name, synopsis) => {
    const map = storyLevelMap();
    beatOf(map, 'b3').synopsis = synopsis;
    const failure = check(map).failures.find((f) => f.type === 'story-terms');
    expect(failure).toMatchObject({ place: 'sections[#theStory].beats[#b3]' });
    expect(failure.message).toMatch(/b3's synopsis/);
    expect(failure.line).toMatch(/^The summary of the move "Marcus trying the batch on himself" /);
    expect(failure.line).not.toMatch(/synopsis|\bb3\b|sam001/i);
  });

  it("a synopsis in left out is held to story terms too", () => {
    const map = storyLevelMap();
    map.leftOut[0].synopsis = 'The room lets three suspects go at 9:40.';
    expect(check(map).failures.find((f) => f.type === 'story-terms')).toMatchObject({ place: 'leftOut[#b9]' });
  });

  it("a synopsis the director rewrote, or wrote on a move they added, is never held to story terms", () => {
    const rewritten = storyLevelMap();
    beatOf(rewritten, 'b3').synopsis = 'Sam writes, "he is trying the batch on himself", at 9:58.';
    expect(mapFindings(rewritten, { ...inputsOf(storyLevelMapState(), rewritten), edits: editsAgainst(storyLevelMap(), rewritten) }).failures).toEqual([]);

    const added = addBeat(storyLevelMap(), 'closing', 'Remi walks out before the vote', 'Remi');
    beatOf(added, 'b10').synopsis = 'Remi leaves at 10:02 saying "count me out".';
    expect(mapFindings(added, { ...inputsOf(storyLevelMapState(), added), edits: editsAgainst(storyLevelMap(), added) })).toEqual({ failures: [], concerns: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The checks: a writer's beat carries only the story's threads (R5)
// ═══════════════════════════════════════════════════════════════════════════

describe("4B: a writer's beat in a section carries only threads the settled story tells (R5)", () => {
  it('a beat that carries a thread the story leaves out fails beside it, naming the thread by its name', () => {
    const map = storyLevelMap();
    beatOf(map, 'b2').threads = ['t1', 't8'];
    const failure = check(map).failures.find((f) => f.type === 'thread-outside-story');
    expect(failure).toMatchObject({ place: 'sections[#lede].beats[#b2]' });
    expect(failure.message).toMatch(/b2/);
    expect(failure.message).toMatch(/"The other suspects" \(t8\)/);
    expect(failure.line).toBe('The move "The quick vote for an accident" carries the thread "The other suspects", which the story leaves out.');
  });

  it('two such threads are named together, and an id the weave does not hold is named as one it does not hold', () => {
    const map = storyLevelMap();
    beatOf(map, 'b2').threads = ['t1', 't8', 't9'];
    beatOf(map, 'b6').threads = ['t5', 't99'];
    const failures = check(map).failures.filter((f) => f.type === 'thread-outside-story');
    expect(failures.map((f) => f.line)).toEqual([
      'The move "The quick vote for an accident" carries the threads "The other suspects" and "Protecting Sarah", which the story leaves out.',
      'The move "The memories sold off as the trial run surfaced" carries a thread the weave does not hold.'
    ]);
    expect(failures[1].message).toMatch(/t99/);
    failures.forEach((f) => expect(f.line).not.toMatch(/\b[btc]\d+\b/));
  });

  it('a beat in left out may carry any thread', () => {
    const map = storyLevelMap();
    map.leftOut[0].threads = ['t8'];
    expect(check(map).failures).toEqual([]);
  });

  it('Review focus 5: a move the director brings back from left out with a thread the angle leaves out fails nothing', () => {
    const base = storyLevelMap();
    base.leftOut[0].threads = ['t8'];
    const left = bringBackBeat(clone(base), 'b9', 'closing');
    const state = storyLevelMapState({ outline: left, _mapBaseline: clone(base) });
    expect(mapFindings(left, { ...inputsOf(state, left), edits: editsAgainst(base, left) })).toEqual({ failures: [], concerns: [] });
  });

  it('with no settled story in hand, the check reads nothing', () => {
    const map = storyLevelMap();
    beatOf(map, 'b2').threads = ['t1', 't8'];
    expect(mapFindings(map, { ...inputsOf(storyLevelMapState(), map), threads: [], otherThreads: [] }).failures.map((f) => f.type)).not.toContain('thread-outside-story');
  });

  it("the node's inputs name the weave's other threads by id and name", () => {
    expect(inputsOf(storyLevelMapState()).otherThreads).toEqual([
      { id: 't8', name: 'The other suspects' },
      { id: 't9', name: 'Protecting Sarah' },
      { id: 't10', name: "Remi's and Kai's quarrels" }
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The payload: the legend (R4)
// ═══════════════════════════════════════════════════════════════════════════

describe("4B: the map's stop sends the legend from the settled story (R4)", () => {
  const payload = (state = storyLevelMapState()) => mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, 'top.jpg'), evidenceIndex: {}, maxRevisions: 1 });

  it("the story's threads in the angle's order, each {id, name, line}; the connections between them; the other threads by name", () => {
    const { legend } = payload();
    expect(legend.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
    expect(legend.threads[1]).toEqual({ id: 't2', name: "Marcus's own dosing", line: 'He had been trying the batch on himself.' });
    expect(legend.connections.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(legend.connections[0]).toEqual({ id: 'c1', joins: ['t4', 't7'], line: 'Quinn and Alex steered the verdict, and they are the successors.' });
    expect(legend.others).toEqual([
      { id: 't8', name: 'The other suspects' },
      { id: 't9', name: 'Protecting Sarah' },
      { id: 't10', name: "Remi's and Kai's quarrels" }
    ]);
  });

  it('follows the angle the director sent on: its threads in its order, and only the connections between them', () => {
    const state = storyLevelMapState();
    state.weave = { ...clone(state.weave), picked: 'a2' };
    const { legend } = payload(state);
    expect(legend.threads.map((t) => t.id)).toEqual(['t4', 't1', 't3']);
    expect(legend.connections).toEqual([]);
    expect(legend.others.map((t) => t.id)).toEqual(['t2', 't5', 't6', 't7', 't8', 't9', 't10']);
  });

  it('is empty with no weave in hand', () => {
    expect(payload(storyLevelMapState({ weave: null })).legend).toEqual({ threads: [], connections: [], others: [] });
  });

  it("the map check's first look at the map carries the legend the stop sends", () => {
    const state = storyLevelMapState();
    expect(mapNodes.firstLookData(state, state.outline).legend).toEqual(payload(state).legend);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The bounds this slice names, and the map writer's task (spec 8 and 11)
// ═══════════════════════════════════════════════════════════════════════════

describe("4B: the map writer's task asks for a synopsis on every move, the article's order and both pages", () => {
  const { PromptBuilder } = require('../prompt-builder');
  const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
  const { storyLevelWeave } = require('./fixtures/story-level-weave');
  const taskOf = async () => {
    const builder = new PromptBuilder({ loadPhasePrompts: jest.fn(), validate: jest.fn() });
    const { userPrompt } = await builder.buildOutlinePrompt(renderSettledWeave(storyLevelWeave(), null), [], [], null, {});
    return userPrompt.slice(userPrompt.indexOf("Lay the settled weave above across the article's sections"), userPrompt.indexOf('<SLOTS>'));
  };

  it('the bounds: 450 and 750 words, the aims 300 and 250', () => {
    expect([MAP_WORD_BOUND, MAP_WORD_AIM, MAP_OPEN_WORD_BOUND, MAP_SYNOPSIS_AIM]).toEqual([450, 300, 750, 250]);
  });

  it('asks for both pages: at most 450 as it opens, aiming for 300, and at most 750 with every synopsis open, the synopses about 250', async () => {
    const task = await taskOf();
    expect(task).toContain(`at most ${MAP_WORD_BOUND} words`);
    expect(task).toContain(`aim for ${MAP_WORD_AIM}`);
    expect(task).toContain(`at most ${MAP_OPEN_WORD_BOUND}`);
    expect(task).toContain(`about ${MAP_SYNOPSIS_AIM}`);
  });

  it("asks for each move's synopsis, of about 20 words, and each section's moves in the order the article will tell them, pointing at C2 and C6", async () => {
    const task = await taskOf();
    expect(task).toMatch(/synopsis/);
    expect(task).toContain('about 20 words');
    expect(task).toMatch(/in the order the article will tell them/);
    expect(task).toContain('C6');
    expect(task).not.toMatch(/—/);
  });

  it('asks that a beat in a section carry only the threads of the story', async () => {
    expect(await taskOf()).toMatch(/only threads of the story/);
  });
});
