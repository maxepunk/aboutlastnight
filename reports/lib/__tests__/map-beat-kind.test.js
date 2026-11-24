/**
 * Phase 18, run 2b, brief J (R21): the map writer is no longer asked for a beat's kind.
 *
 * `kind` (scene, receipt, line or figure) leaves the writer's schema, the one schema the map
 * writer and its rework are given and shown in <SCHEMA>, in a section's beats and in the left-out
 * beats; the schema's top description is cut to its first sentence. A map stored before the change
 * holds a kind on its beats: the director-side schema, the payload gate and the console's validator
 * still take it, so an old thread and a map in flight open as before. The map's rework prints the
 * map it starts from without the kind, and the map it returns, with no kind, settles with the
 * director's edits put back and no change of theirs reported for the kind it dropped.
 *
 * Invented text: the repo is public.
 */
const Ajv = require('ajv');
const EditLogic = require('../../console/outline-edit-logic');
const {
  mapSchemaFor, directorMapSchemaFor, directorMapProblems, mapResume, MAP_BEAT_KINDS
} = require('../map');
const { mapSlotsOf } = require('../theme-config');
const { MAP, reworkFixtureState } = require('./fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));
const beatsOf = (map) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut];
const beatOf = (map, id) => beatsOf(map).find((b) => b.id === id);
/** The map as the writer now writes it: its beats with no kind. */
const writersShape = (map) => {
  const copy = clone(map);
  beatsOf(copy).forEach((beat) => { delete beat.kind; });
  return copy;
};
/** The text of the previous map a rework's prompt prints. */
const previousMapOf = (prompt) => prompt.slice(prompt.indexOf('PREVIOUS MAP OUTPUT'), prompt.indexOf('END PREVIOUS OUTPUT'));

const slots = mapSlotsOf('journalist');

describe("J: the writer's schema asks for no kind", () => {
  it("neither a section's beat nor a left-out beat holds one, and the shape prints none", () => {
    const schema = mapSchemaFor('journalist');
    expect(schema.properties.sections.items.properties.beats.items.properties).not.toHaveProperty('kind');
    expect(schema.properties.leftOut.items.properties).not.toHaveProperty('kind');
    expect(JSON.stringify(schema)).not.toContain('"kind"');
  });

  it("its top description is the first sentence alone", () => {
    expect(mapSchemaFor('journalist').description).toBe("The story map: the settled weave laid across the article's sections.");
  });

  it('a stored map whose beats hold a kind is not the shape the writer is given', () => {
    const writerTakes = new Ajv({ allErrors: true, strict: true }).compile(mapSchemaFor('journalist'));
    expect(beatsOf(MAP).some((beat) => beat.kind !== undefined)).toBe(true);
    expect(writerTakes(clone(MAP))).toBe(false);
    expect(writerTakes(writersShape(MAP))).toBe(true);
  });
});

describe('J: a stored map with a kind on its beats still opens', () => {
  it("the director-side schema takes a beat's kind, one of MAP_BEAT_KINDS, in a section and in left out, before its evidence", () => {
    const director = directorMapSchemaFor('journalist');
    [director.properties.sections.items.properties.beats.items, director.properties.leftOut.items].forEach((beat) => {
      expect(beat.properties.kind.enum).toEqual([...MAP_BEAT_KINDS]);
      const keys = Object.keys(beat.properties);
      expect(keys.indexOf('kind')).toBe(keys.indexOf('evidence') - 1);
    });
  });

  it('the gate and the console take the stored map and the map the writer now writes, and both refuse a kind the map has none of', () => {
    [clone(MAP), writersShape(MAP)].forEach((map) => {
      expect(directorMapProblems(map, { theme: 'journalist', shown: clone(MAP) })).toBeNull();
      expect(EditLogic.validateMapShape(map, { slots, shown: clone(MAP) })).toEqual({ valid: true, errors: [] });
    });
    const wrong = clone(MAP);
    wrong.sections[1].beats[0].kind = 'quote';
    expect(directorMapProblems(wrong, { theme: 'journalist', shown: clone(MAP) })).not.toBeNull();
    expect(EditLogic.validateMapShape(wrong, { slots, shown: clone(MAP) }).valid).toBe(false);
  });

  it("the director leaves the stored map with its kinds at the stop: the send-back's edits name no kind", () => {
    const left = clone(MAP);
    left.sections[1].beats[0].synopsis = 'Marcus boasts of a sale on the last night of his life, and nobody asks who paid.';
    const { error, stateUpdates } = mapResume({ outline: 'send-back', map: left, note: 'Tighten the lede.' }, reworkFixtureState(), { theme: 'journalist' });
    expect(error).toBeNull();
    expect(JSON.stringify(stateUpdates._outlineHandEdits.edits)).not.toContain('kind');
  });
});

describe("J: the map's rework prints its map without the kind, and the map it returns settles", () => {
  const { reviseOutline } = require('../workflow/nodes/ai-nodes');
  const mapNodes = require('../workflow/nodes/map-nodes');
  const DIRECTORS = 'Marcus boasts of a sale on the last night of his life, and nobody asks who paid.';

  it("a send-back and then an automatic pass on a stored map: neither prompt's previous map holds a kind, and the director's summary is put back", async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = reworkFixtureState();
    const left = clone(MAP);
    left.sections[1].beats[0].synopsis = DIRECTORS;
    const { error, stateUpdates } = mapResume({ outline: 'send-back', map: left, note: 'Tighten the lede.' }, state, { theme: 'journalist' });
    expect(error).toBeNull();
    const round = { ...state, ...stateUpdates, humanOutlineRevisionCount: 1, outlineRevisionCount: 0 };
    expect(beatsOf(round.outline).some((beat) => beat.kind !== undefined)).toBe(true);

    // The send-back's rework returns the map in the writer's shape, with no kind.
    let sentBack;
    const afterSendBack = await reviseOutline(
      { ...round, _previousOutline: clone(round.outline) },
      { configurable: { sdkClient: async (options) => { sentBack = options; return writersShape(left); }, theme: 'journalist' } }
    );
    const shownBack = previousMapOf(sentBack.prompt);
    expect(shownBack).toContain(DIRECTORS);
    expect(shownBack).not.toContain('"kind"');
    expect(JSON.stringify(sentBack.jsonSchema)).not.toContain('"kind"');
    expect(afterSendBack._outlineHandEditReport).toEqual({ checked: ['E1'], changed: [] });

    // The check rework rewrites the director's summary; code puts it back, and the kind the
    // stored map held is no change of the director's.
    const check = clone(afterSendBack.outline);
    beatOf(check, 'b2').synopsis = 'Marcus boasts about a sale.';
    let sent;
    const afterCheck = await reviseOutline(
      { ...round, ...afterSendBack, _previousOutline: clone(round.outline), outlineRevisionCount: 1, _outlineFeedback: null, validationResults: null },
      { configurable: { sdkClient: async (options) => { sent = options; return clone(check); }, theme: 'journalist' } }
    );
    expect(previousMapOf(sent.prompt)).not.toContain('"kind"');
    expect(beatOf(afterCheck.outline, 'b2').synopsis).toBe(DIRECTORS);
    expect(beatsOf(afterCheck.outline).some((beat) => beat.kind !== undefined)).toBe(false);
    expect(afterCheck._outlineHandEditReport.changed).toEqual([expect.objectContaining({ id: 'E1', automatic: true, restored: true })]);

    // The map checks find nothing the director's edits caused.
    const checked = mapNodes.checkMap({ ...round, ...afterCheck, _mapCheck: null });
    expect(checked._mapCheck.concerns).toEqual([]);
    console.log.mockRestore();
  });

  it('the previous map the rework reads is the stored one: its kinds stay in state', async () => {
    const state = reworkFixtureState();
    const before = clone(MAP);
    let sent;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const after = await reviseOutline(
      { ...state, outline: before, _previousOutline: before, outlineRevisionCount: 1 },
      { configurable: { sdkClient: async (options) => { sent = options; return writersShape(MAP); }, theme: 'journalist' } }
    );
    console.log.mockRestore();
    expect(previousMapOf(sent.prompt)).not.toContain('"kind"');
    expect(previousMapOf(sent.prompt)).toContain(MAP.sections[0].beats[0].synopsis);
    expect(before).toEqual(MAP);
    expect(after.outline).toEqual(writersShape(MAP));
  });
});
