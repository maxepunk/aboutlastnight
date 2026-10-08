/**
 * Phase 4b, piece 4, brief 4C: the director's order and summaries as edits (spec 2026-10-07
 * sections 3, 6 and 17; R3, R11; Review focus 1 and 4).
 *
 * The order of a section's beats is the order the article tells them (R2), so the director's order
 * is their edit: one per section, its value the section's beat ids in the director's order. It is
 * read by mapEditsBetween, carried by standingOnMap across looks (a later reorder of the section
 * replaces it under its id), put back by settleEdits after an automatic pass, recorded by
 * reportAfterPass, and listed in <HAND_EDITS> by the moves' titles. A summary (a beat's synopsis)
 * the director rewrote reads as the summary of the move, never by the field's name, and a sentence
 * they cut from one that comes back is flagged.
 *
 * Invented text: the repo is public.
 */
const D = require('../hand-edit-diff');
const EditLogic = require('../../console/outline-edit-logic');
const { boardMap } = require('./fixtures/board-map');
const { MAP, reworkFixtureState } = require('./fixtures/rework-state');
const { buildRevisionContext } = require('../workflow/nodes/node-helpers');

const clone = (v) => JSON.parse(JSON.stringify(v));
const pathsOf = (changes) => changes.map((c) => D._testing.pathOf(c.at));
const idsIn = (map, slot) => map.sections.find((s) => s.slot === slot).beats.map((b) => b.id);
const beatOf = (map, id) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut].find((b) => b.id === id);
const editsOf = (base, left) => D.carriedEdits(D.standingOnMap(null, base, left), left);
const handEditsBlock = (contextSection) => contextSection.slice(contextSection.indexOf('<HAND_EDITS>'), contextSection.indexOf('</HAND_EDITS>'));
/** A tag the page and the report never print: a beat's, a thread's or a connection's id. */
const TAG = /\b[btc]\d+\b/;

/** A new beat a pass writes, in the writer's shape. */
const passBeat = (id, move) => ({
  id, move, players: ['Kai'], synopsis: `${move}, and the room moves on.`, threads: ['t3'], kind: 'scene',
  evidence: [{ sources: ['notes'], shows: 'The room votes for an accident.', stance: 'supports' }]
});

// ═══════════════════════════════════════════════════════════════════════════
// The diff reads the order (R3)
// ═══════════════════════════════════════════════════════════════════════════

describe("4C: the director's order of a section is one edit, the section's beat ids in their order (R3)", () => {
  it('a move moved up within its section: one order edit, before the shown order and after the director\'s', () => {
    const left = EditLogic.moveBeatBy(boardMap(), 'b5', -1);
    const changes = D.mapEditsBetween(boardMap(), left);
    expect(pathsOf(changes)).toEqual(['sections[#theStory].beats']);
    expect(changes[0]).toMatchObject({
      scope: 'map', order: true,
      before: ['b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
      after: ['b3', 'b5', 'b4', 'b6', 'b7', 'b8']
    });
  });

  it('a beat moved to the foot of another section makes only its move edit; one dropped in the middle makes the move and that section\'s order edit', () => {
    expect(pathsOf(D.mapEditsBetween(boardMap(), EditLogic.moveBeat(boardMap(), 'b2', 'closing')))).toEqual(['sections[#closing].beats[#b2]']);
    const middle = D.mapEditsBetween(boardMap(), EditLogic.moveBeat(boardMap(), 'b2', 'closing', 1));
    expect(pathsOf(middle)).toEqual(['sections[#closing].beats[#b2]', 'sections[#closing].beats']);
    expect(middle[1]).toMatchObject({ order: true, after: ['b15', 'b2', 'b16'] });
  });

  it('a beat brought back or added at the foot makes no order edit; brought back to the head, one', () => {
    expect(pathsOf(D.mapEditsBetween(boardMap(), EditLogic.bringBackBeat(boardMap(), 'b17', 'theStory')))).toEqual(['sections[#theStory].beats[#b17]']);
    expect(pathsOf(D.mapEditsBetween(boardMap(), EditLogic.addBeat(boardMap(), 'closing', 'Kai leaves early', 'Kai')))).toEqual(['sections[#closing].beats[#b19]']);
    const head = D.mapEditsBetween(boardMap(), EditLogic.bringBackBeat(boardMap(), 'b17', 'theStory', 0));
    expect(pathsOf(head)).toEqual(['sections[#theStory].beats[#b17]', 'sections[#theStory].beats']);
    expect(head[1].after).toEqual(['b17', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']);
  });

  it('a struck beat leaves the rest of its section in the shown order: no order edit', () => {
    expect(pathsOf(D.mapEditsBetween(boardMap(), EditLogic.strikeBeat(boardMap(), 'b5')))).toEqual(['leftOut[#b5]']);
  });

  it("the trace's diff gives the order under its section's scope", () => {
    expect(D.scopeKeys(D.diffOutline(boardMap(), EditLogic.moveBeatBy(boardMap(), 'b8', -1)))).toEqual(['section:theStory']);
  });
});

// Fix round 1, finding 3: R3's foot exception is one beat, "a beat moved to the foot". Two cards
// that arrived in a column after the beats it kept no longer read as both at its foot, so a card
// dropped above an earlier arrival makes the column's order edit, and a pass that swaps the two
// is undone and reported. The diff reads only versions, so two plain moves to the foot of one
// column carry its order too, in either order (the integrator to confirm).
describe("4C, fix round 1: one beat that arrived in a column may sit at its foot without an order edit, and no more", () => {
  /** b9 moved to the foot of Closing, then b2 dropped above it. */
  const a2c = () => EditLogic.moveBeat(EditLogic.moveBeat(boardMap(), 'b9', 'closing'), 'b2', 'closing', 2);
  /** b1 moved to the foot of Closing, its photo with it, then b2 dropped above it. */
  const a2 = () => EditLogic.moveBeat(EditLogic.moveBeat(boardMap(), 'b1', 'closing'), 'b2', 'closing', 2);

  it('a card dropped above a card that arrived before it: the move edits and the column\'s order edit', () => {
    const shapes = [[a2c(), ['b15', 'b16', 'b2', 'b9']], [a2(), ['b15', 'b16', 'b2', 'b1']]];
    shapes.forEach(([left, closing]) => {
      expect(idsIn(left, 'closing')).toEqual(closing);
      const orders = D.mapEditsBetween(boardMap(), left).filter((c) => c.order);
      expect(orders.map((c) => [D._testing.pathOf(c.at), c.after])).toEqual([['sections[#closing].beats', closing]]);
    });
    expect(pathsOf(D.mapEditsBetween(boardMap(), a2()))).toEqual([
      'sections[#closing].beats[#b2]', 'sections[#closing].beats[#b1]', 'sections[#closing].photos[#p02.jpg]', 'sections[#closing].beats'
    ]);
    expect(pathsOf(D.mapEditsBetween(boardMap(), a2c()))).toEqual(['sections[#closing].beats[#b2]', 'sections[#closing].beats[#b9]', 'sections[#closing].beats']);
  });

  it('one plain move to the foot still makes only its move edit', () => {
    expect(pathsOf(D.mapEditsBetween(boardMap(), EditLogic.moveBeat(boardMap(), 'b9', 'closing')))).toEqual(['sections[#closing].beats[#b9]']);
  });

  it('two plain moves to the foot of one column carry its order, in either order', () => {
    const firstThenSecond = EditLogic.moveBeat(EditLogic.moveBeat(boardMap(), 'b9', 'closing'), 'b2', 'closing');
    const secondThenFirst = EditLogic.moveBeat(EditLogic.moveBeat(boardMap(), 'b2', 'closing'), 'b9', 'closing');
    expect(D.mapEditsBetween(boardMap(), firstThenSecond).filter((c) => c.order).map((c) => c.after)).toEqual([['b15', 'b16', 'b9', 'b2']]);
    expect(D.mapEditsBetween(boardMap(), secondThenFirst).filter((c) => c.order).map((c) => c.after)).toEqual([['b15', 'b16', 'b2', 'b9']]);
  });

  it('an automatic pass that swaps the two arrivals has them put back, with one order line in the report, and the page counts the order among the edits that stand', () => {
    const { mapCheckpointData } = require('../map');
    const { keptPhotoFilenames } = require('../workflow/nodes/ai-nodes');
    const ViewLogic = require('../../console/checkpoint-view-logic');
    const { boardMapState } = require('./fixtures/board-map');
    const before = a2c();
    const standing = D.standingOnMap(null, boardMap(), before);
    const edits = D.carriedEdits(standing, before);
    expect(edits.map((e) => [e.id, e.path])).toEqual([
      ['E1', 'sections[#closing].beats[#b2]'], ['E2', 'sections[#closing].beats[#b9]'], ['E3', 'sections[#closing].beats']
    ]);
    const pass = clone(before);
    const closing = pass.sections.find((s) => s.slot === 'closing');
    closing.beats = [beatOf(pass, 'b15'), beatOf(pass, 'b16'), beatOf(pass, 'b9'), beatOf(pass, 'b2')];
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(idsIn(settled.output, 'closing')).toEqual(['b15', 'b16', 'b2', 'b9']);
    expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1', 'E2', 'E3']);
    expect(settled.report.changed).toEqual([expect.objectContaining({
      id: 'E3', where: 'section "closing", the order of its moves', automatic: true, restored: true
    })]);
    // The page's line is true of the map the stop shows: code put the order back, so the round
    // lists no changed line (changedEditsToShow) and every edit stands, the order among them.
    const state = boardMapState({ outline: settled.output, _mapBaseline: settled.output, _outlineHandEdits: standing, _outlineHandEditReport: settled.report });
    const data = mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline.topPhoto), evidenceIndex: {}, maxRevisions: 1 });
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    expect(view.kept).toBe('All 3 of your edits stand.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// It stands across looks (R3)
// ═══════════════════════════════════════════════════════════════════════════

describe('4C: the order edit stands across looks, and a later reorder of the section replaces it under its id', () => {
  const left = () => EditLogic.moveBeatBy(boardMap(), 'b5', -1);

  it('a reorder at one look stands at the next, the same edit under the same id, with no text of its own', () => {
    const first = D.standingOnMap(null, boardMap(), left());
    expect(first.edits).toEqual([expect.objectContaining({
      id: 'E1', path: 'sections[#theStory].beats', order: true, after: ['b3', 'b5', 'b4', 'b6', 'b7', 'b8']
    })]);
    ['removed', 'pieces', 'names', 'from'].forEach((key) => expect(first.edits[0]).not.toHaveProperty(key));
    expect(D.standingOnMap(first, boardMap(), left())).toEqual(first);
    expect(D.carriedEdits(first, left()).map((e) => e.id)).toEqual(['E1']);
  });

  it('a later reorder of the same section replaces it under its id; the order put back as the writer had it drops it', () => {
    const first = D.standingOnMap(null, boardMap(), left());
    const later = EditLogic.moveBeat(left(), 'b8', 'theStory', 0);
    const second = D.standingOnMap(first, boardMap(), later);
    expect(second.edits.map((e) => [e.id, e.after])).toEqual([['E1', ['b8', 'b3', 'b5', 'b4', 'b6', 'b7']]]);
    expect(second.issued).toBe(1);
    const undone = D.standingOnMap(second, boardMap(), boardMap());
    expect(undone).toEqual({ kind: 'map', issued: 1, edits: [] });
  });

  it("a struck beat the order named: the director's next look names only the beats that remain, and the order stands on them", () => {
    const ordered = EditLogic.moveBeat(boardMap(), 'b5', 'theStory', 0);
    const first = D.standingOnMap(null, boardMap(), ordered);
    expect(first.edits[0].after).toEqual(['b5', 'b3', 'b4', 'b6', 'b7', 'b8']);
    const struck = EditLogic.strikeBeat(ordered, 'b3');
    // Fix A: the order is carried only while the section holds every beat it names, so the edit
    // as it stood is not carried on the struck map; the director's own strike narrows it at the look.
    expect(D.carriedEdits(first, struck)).toEqual([]);
    const next = D.standingOnMap(first, struck, struck);
    expect(next.edits.map((e) => [e.id, e.after])).toEqual([['E1', ['b5', 'b4', 'b6', 'b7', 'b8']]]);
    expect(D.carriedEdits(next, struck).map((e) => e.id)).toEqual(['E1']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Code puts it back after an automatic pass, and the report records it (R3; Review focus 1)
// ═══════════════════════════════════════════════════════════════════════════

describe('4C: after an automatic pass that changed the order, code puts the beats it names back into it', () => {
  it('Review focus 1: the pass reorders the section and adds a beat; the beats go back into the director\'s order in the places they hold, the new beat keeps its place, and the report holds one line', () => {
    const before = EditLogic.moveBeatBy(boardMap(), 'b5', -1);
    const edits = editsOf(boardMap(), before);
    const pass = clone(before);
    const story = pass.sections.find((s) => s.slot === 'theStory');
    story.beats = [beatOf(pass, 'b4'), beatOf(pass, 'b3'), passBeat('b20', 'Kai counts the votes'), beatOf(pass, 'b5'), beatOf(pass, 'b6'), beatOf(pass, 'b8'), beatOf(pass, 'b7')];
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(idsIn(settled.output, 'theStory')).toEqual(['b3', 'b5', 'b20', 'b4', 'b6', 'b7', 'b8']);
    expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1']);
    expect(settled.report.changed).toEqual([expect.objectContaining({
      id: 'E1', where: 'section "theStory", the order of its moves', automatic: true, pass: 1, restored: true, moved: false, cut: false,
      director: 'Marcus tests the batch on himself / Jess warns Sarah away / Marcus asks Quinn to raise the dose / Quinn tells the room another story / The trial run comes to light / Remi presses Quinn and backs off',
      became: 'Marcus asks Quinn to raise the dose / Marcus tests the batch on himself / Jess warns Sarah away / Quinn tells the room another story / Remi presses Quinn and backs off / The trial run comes to light'
    })]);
  });

  it('Fix A: a pass that strikes a beat the order names breaks it, and code brings the beat back at its place', () => {
    const before = EditLogic.moveBeat(boardMap(), 'b5', 'theStory', 0);
    const edits = editsOf(boardMap(), before);
    const pass = EditLogic.strikeBeat(before, 'b3');
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(idsIn(settled.output, 'theStory')).toEqual(['b5', 'b3', 'b4', 'b6', 'b7', 'b8']);
    expect(settled.output.leftOut.map((b) => b.id)).toEqual(['b17', 'b18']);
    expect(settled.report.changed).toEqual([expect.objectContaining({ id: 'E1', automatic: true, restored: true })]);
    // A later pass that swaps two of them has them put back too.
    const swapped = EditLogic.moveBeatBy(settled.output, 'b4', -1);
    const again = D.settleEdits(null, { edits, before: settled.output, after: swapped, pass: 2 });
    expect(idsIn(again.output, 'theStory')).toEqual(['b5', 'b3', 'b4', 'b6', 'b7', 'b8']);
  });

  it('a card dropped in the middle of another column: the move edit and that section\'s order edit, both put back', () => {
    const before = EditLogic.moveBeat(boardMap(), 'b2', 'closing', 1);
    const edits = editsOf(boardMap(), before);
    expect(edits.map((e) => e.path)).toEqual(['sections[#closing].beats[#b2]', 'sections[#closing].beats']);
    const pass = clone(before);
    const closing = pass.sections.find((s) => s.slot === 'closing');
    const lede = pass.sections.find((s) => s.slot === 'lede');
    lede.beats.push(closing.beats.splice(1, 1)[0]);
    closing.beats.reverse();
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(idsIn(settled.output, 'closing')).toEqual(['b15', 'b2', 'b16']);
    expect(idsIn(settled.output, 'lede')).toEqual(['b1']);
    expect(settled.report.changed.map((c) => [c.id, c.moved, c.restored])).toEqual([['E1', true, true], ['E2', false, true]]);
  });

  // Fix round 1, findings 1 and 2: a pass that left the director's order intact on the beats the
  // section still held, but took out a beat the director placed in it. Code puts that beat back at
  // its place, which can break the order, so the order goes back after every other restore. Fix A:
  // a beat the order names that the pass took out of the section breaks the order too, so the
  // report records the order's restore beside the move's, and the stored map carries both edits,
  // so "Both of your edits stand." is true.
  describe("a beat code puts back at its place does not leave the director's order broken", () => {
    const setUp = (passOf) => {
      const before = EditLogic.moveBeat(boardMap(), 'b2', 'closing', 1);
      const standing = D.standingOnMap(null, boardMap(), before);
      const edits = D.carriedEdits(standing, before);
      expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#closing].beats[#b2]'], ['E2', 'sections[#closing].beats']]);
      const pass = clone(before);
      const closing = pass.sections.find((s) => s.slot === 'closing');
      pass.sections.find((s) => s.slot === 'lede').beats.push(closing.beats.splice(1, 1)[0]);
      passOf(pass, closing);
      return { standing, edits, settled: D.settleEdits(null, { edits, before, after: pass, pass: 1 }) };
    };
    const holdsOut = ({ standing, edits, settled }, closingIds) => {
      expect(idsIn(settled.output, 'closing')).toEqual(closingIds);
      expect(idsIn(settled.output, 'lede')).toEqual(['b1']);
      expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1', 'E2']);
      expect(settled.report.checked).toEqual(['E1', 'E2']);
      expect(settled.report.changed.map((c) => [c.id, c.moved, c.restored])).toEqual([['E1', true, true], ['E2', false, true]]);
      // The next look: the stored map is the writer's last map, and the director leaves it as shown.
      expect(D.standingOnMap(standing, settled.output, settled.output).edits.map((e) => e.id)).toEqual(['E1', 'E2']);
    };

    it('the pass moves the card back to the lede and strikes the beat above it', () => {
      // The order's restore brings the struck beat back with the card (fix A).
      holdsOut(setUp((pass, closing) => { pass.leftOut.push(closing.beats.shift()); }), ['b15', 'b2', 'b16']);
    });

    it('the pass moves the card back to the lede and puts a beat of its own at the head of the column', () => {
      holdsOut(setUp((pass, closing) => { closing.beats.unshift(passBeat('b20', 'Kai counts the votes')); }), ['b20', 'b15', 'b2', 'b16']);
    });

    it('a bring-back: the check rework strikes the beat the director brought back and puts one of its own at the head', () => {
      const before = EditLogic.bringBackBeat(clone(MAP), 'b9', 'theStory', 1);
      const edits = editsOf(MAP, before);
      expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].beats[#b9]'], ['E2', 'sections[#theStory].beats']]);
      const pass = EditLogic.strikeBeat(before, 'b9');
      pass.sections.find((s) => s.slot === 'theStory').beats.unshift(passBeat('b21', 'Morgan leaves the bar'));
      const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
      expect(idsIn(settled.output, 'theStory')).toEqual(['b21', 'b2', 'b9', 'b3', 'b4']);
      expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1', 'E2']);
      expect(settled.report.changed.map((c) => [c.id, c.restored])).toEqual([['E1', true], ['E2', true]]);
    });
  });

  it("a send-back's rework that changes the order is left as it is, with its reason", () => {
    const before = EditLogic.moveBeatBy(boardMap(), 'b5', -1);
    const edits = editsOf(boardMap(), before);
    const pass = EditLogic.moveBeatBy(before, 'b5', 1);
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: D.SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asks to open on the dose.' }] });
    expect(settled.output).toEqual(pass);
    expect(settled.report.changed).toEqual([expect.objectContaining({ id: 'E1', pass: 'send-back', automatic: false, restored: false, reason: 'The note asks to open on the dose.' })]);
  });

  it('Review focus 1, through the stop and the rework: the director reorders and sends back, and the check rework reorders again', async () => {
    const { mapResume } = require('../map');
    const { reviseOutline } = require('../workflow/nodes/ai-nodes');
    const FAILED = {
      phase: 'outline', source: 'map-checks', passed: false, ready: false, structuralPassed: false,
      structuralIssues: ["Players in no beat: Riley. Place each in a section's beat, or name them among gapNote's players, as C7 (`<craft-material>`) sets out."]
    };
    const state = reworkFixtureState();
    const left = EditLogic.moveBeatBy(clone(MAP), 'b4', -1);
    const { error, stateUpdates } = mapResume({ outline: 'send-back', map: left, note: 'Tighten the lede.' }, state, { theme: 'journalist' });
    expect(error).toBeNull();
    expect(stateUpdates._outlineHandEdits.edits.map((e) => [e.id, e.order, e.after])).toEqual([['E1', true, ['b2', 'b4', 'b3']]]);

    // The send-back's rework keeps the order and adds a beat at the section's foot.
    const sendBack = clone(left);
    sendBack.sections[1].beats.push(passBeat('b20', 'Riley counts the envelopes'));
    const round = { ...state, ...stateUpdates, humanOutlineRevisionCount: 1, outlineRevisionCount: 0 };
    const afterSendBack = await reviseOutline(
      { ...round, _previousOutline: clone(round.outline) },
      { configurable: { sdkClient: async () => clone(sendBack), theme: 'journalist' } }
    );
    expect(afterSendBack._outlineHandEditReport).toEqual({ checked: ['E1'], changed: [] });

    // The round's check rework reorders the section again and adds a beat of its own.
    const check = clone(afterSendBack.outline);
    const story = check.sections[1];
    const byId = (id) => story.beats.find((b) => b.id === id);
    story.beats = [byId('b3'), passBeat('b21', 'Morgan leaves the bar'), byId('b2'), byId('b20'), byId('b4')];
    let sent;
    const afterCheck = await reviseOutline(
      { ...round, ...afterSendBack, _previousOutline: clone(afterSendBack.outline), outlineRevisionCount: 1, _outlineFeedback: null, validationResults: FAILED },
      { configurable: { sdkClient: async (options) => { sent = options; return clone(check); }, theme: 'journalist' } }
    );
    expect(handEditsBlock(sent.prompt)).toContain('E1 (section "theStory", the order of its moves): beat "b2" "Marcus brags about the sale", then beat "b4" "The paternity result names Sarah", then beat "b3" "Morgan pays Riley at the bar"');
    expect(idsIn(afterCheck.outline, 'theStory')).toEqual(['b2', 'b21', 'b4', 'b20', 'b3']);
    expect(afterCheck._outlineHandEditReport.changed).toEqual([expect.objectContaining({
      id: 'E1', where: 'section "theStory", the order of its moves', automatic: true, restored: true
    })]);
  });
});

// Fix A (the integrator's ruling: the spec's section 17 wins): code puts the director's order back
// by putting each beat it names back into the section, at its place in that order, from wherever
// the pass put it, so it prints once. Each beat the pass added keeps its place relative to the
// others. Fix C2: a writer's beat the pass removed from the map stays out, as a beat the director
// only moved does (mapRestoresWhenGone), and the order holds for the beats that remain.
describe("Fix A: the order's restore puts each beat it names back into the section, from wherever the pass put it", () => {
  /** The director's map: Jess moved above Marcus's request, in The Story. */
  const directors = () => EditLogic.moveBeatBy(boardMap(), 'b5', -1);
  const DIRECTORS_STORY = ['b3', 'b5', 'b4', 'b6', 'b7', 'b8'];
  const placesOf = (map, id) => [
    ...map.sections.flatMap((s) => s.beats.filter((b) => b.id === id).map(() => s.slot)),
    ...map.leftOut.filter((b) => b.id === id).map(() => 'leftOut')
  ];
  /** The pass swaps two of the story's beats and adds one of its own, then `out` does the rest. */
  const passOf = (before, out) => {
    const pass = clone(before);
    const story = pass.sections.find((s) => s.slot === 'theStory');
    const byId = (id) => story.beats.find((b) => b.id === id);
    story.beats = [byId('b3'), byId('b5'), byId('b4'), byId('b7'), passBeat('b20', 'Kai counts the votes'), byId('b6'), byId('b8')];
    out(pass, story);
    return pass;
  };
  const settle = (before, pass) => D.settleEdits(null, { edits: editsOf(boardMap(), before), before, after: pass, pass: 1 });

  it('a beat the pass moved to another section comes back at its place, and prints once', () => {
    const before = directors();
    const pass = passOf(before, (map, story) => {
      map.sections.find((s) => s.slot === 'closing').beats.push(story.beats.splice(1, 1)[0]);
    });
    const { output, report } = settle(before, pass);
    expect(idsIn(output, 'theStory')).toEqual(['b3', 'b5', 'b4', 'b6', 'b20', 'b7', 'b8']);
    expect(placesOf(output, 'b5')).toEqual(['theStory']);
    expect(idsIn(output, 'closing')).toEqual(['b15', 'b16']);
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', automatic: true, restored: true })]);
  });

  it('a beat the pass struck into left out comes back at its place, and leaves left out', () => {
    const before = directors();
    const pass = passOf(before, (map, story) => { map.leftOut.push(story.beats.splice(2, 1)[0]); });
    const { output } = settle(before, pass);
    expect(idsIn(output, 'theStory')).toEqual(['b3', 'b5', 'b4', 'b6', 'b20', 'b7', 'b8']);
    expect(placesOf(output, 'b4')).toEqual(['theStory']);
  });

  it('fix C2: a beat the pass removed from the map stays out, and the beats that remain go back into the order', () => {
    const before = directors();
    const pass = passOf(before, (map, story) => { story.beats.splice(2, 1); });
    const { output } = settle(before, pass);
    expect(idsIn(output, 'theStory')).toEqual(['b3', 'b5', 'b6', 'b20', 'b7', 'b8']);
    expect(placesOf(output, 'b4')).toEqual([]);
    expect(DIRECTORS_STORY.filter((id) => id !== 'b4').every((id) => placesOf(output, id).length === 1)).toBe(true);
  });
});

// Fix A, items 1, 2 and 5: the order stands while its section holds every beat it names, in the
// director's order. A named beat a pass took out of the section breaks it (moved to another section,
// put into left out, or gone from the map), and code puts it back after an automatic pass, but for
// a beat gone from the map, which stays out (fix C2). A send-back's rework that does the same is
// reported with its reason and not restored. Only the director's own changes narrow it, at their
// next look, and code's, by the beats a pass removed from the map (fix C2).
describe('Fix A: the order stands while its section holds every beat it names, and code puts it back', () => {
  const { mapCheckpointData } = require('../map');
  const { keptPhotoFilenames } = require('../workflow/nodes/ai-nodes');
  const ViewLogic = require('../../console/checkpoint-view-logic');
  const { boardMapState } = require('./fixtures/board-map');
  /** The page the stop shows for a map, the director's standing edits and the round's report. */
  const pageOf = (map, standing, report) => {
    const state = boardMapState({ outline: map, _mapBaseline: map, _outlineHandEdits: standing, _outlineHandEditReport: report, humanOutlineRevisionCount: 1 });
    const data = mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline.topPhoto), evidenceIndex: {}, maxRevisions: 1 });
    return ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
  };
  const handEditsOn = (handEdits, version) => handEditsBlock(buildRevisionContext({
    phase: 'outline', outputName: 'map', revisionCount: 1, previousOutput: version, handEdits, humanFeedback: null
  }).contextSection);
  const placesOf = (map, id) => [
    ...map.sections.flatMap((s) => s.beats.filter((b) => b.id === id).map(() => s.slot)),
    ...map.leftOut.filter((b) => b.id === id).map(() => 'leftOut')
  ];
  /** The director's map: Jess warns Sarah away moved to the head of The Story. */
  const headMoved = () => EditLogic.moveBeat(boardMap(), 'b5', 'theStory', 0);
  const HEAD_ORDER = ['b5', 'b3', 'b4', 'b6', 'b7', 'b8'];

  it("an automatic pass that moves the director's head move to another section: it comes back to the head, prints once, and the report records the restore", () => {
    const before = headMoved();
    const standing = D.standingOnMap(null, boardMap(), before);
    const edits = D.carriedEdits(standing, before);
    expect(edits.map((e) => [e.id, e.after])).toEqual([['E1', HEAD_ORDER]]);
    const pass = EditLogic.moveBeat(before, 'b5', 'closing');
    // The pass's map no longer carries the order: a check rework reading it would find no order line.
    expect(D.carriedEdits(edits, pass)).toEqual([]);
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(idsIn(settled.output, 'theStory')).toEqual(HEAD_ORDER);
    expect(placesOf(settled.output, 'b5')).toEqual(['theStory']);
    expect(idsIn(settled.output, 'closing')).toEqual(['b15', 'b16']);
    expect(settled.report.changed).toEqual([expect.objectContaining({
      id: 'E1', where: 'section "theStory", the order of its moves', automatic: true, pass: 1, restored: true,
      became: 'Marcus tests the batch on himself / Marcus asks Quinn to raise the dose / Quinn tells the room another story / The trial run comes to light / Remi presses Quinn and backs off'
    })]);
    // The next pass reads the whole order, every move by its title.
    expect(handEditsOn(edits, settled.output)).toContain('E1 (section "theStory", the order of its moves): beat "b5" "Jess warns Sarah away", then beat "b3"');
    expect(pageOf(settled.output, standing, settled.report).kept).toBe('Your edit stands.');
  });

  it('fix C2: a pass that removes a named move from the map: it stays out, and the report names it, with nothing to put back in the order', () => {
    const before = headMoved();
    const edits = editsOf(boardMap(), before);
    const pass = clone(before);
    pass.sections.find((s) => s.slot === 'theStory').beats.splice(2, 1);
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(idsIn(settled.output, 'theStory')).toEqual(HEAD_ORDER.filter((id) => id !== 'b4'));
    expect(placesOf(settled.output, 'b4')).toEqual([]);
    expect(settled.report.changed).toEqual([expect.objectContaining({
      id: 'E1', where: 'section "theStory", beat "b4"', moved: true, automatic: true, restored: false, became: null,
      title: 'Marcus asks Quinn to raise the dose'
    })]);
  });

  it("a check rework never reads an order line naming fewer beats than the director's order", () => {
    const left = EditLogic.moveBeatBy(clone(MAP), 'b4', -1);
    const edits = editsOf(MAP, left);
    let pass = EditLogic.moveBeat(left, 'b2', 'closing');
    pass = EditLogic.moveBeat(pass, 'b4', 'closing');
    expect(handEditsOn(edits, pass)).not.toContain('the order of its moves');
    const settled = D.settleEdits(null, { edits, before: left, after: pass, pass: 1 });
    expect(idsIn(settled.output, 'theStory')).toEqual(['b2', 'b4', 'b3']);
    expect(idsIn(settled.output, 'closing')).toEqual(['b6']);
    expect(handEditsOn(edits, settled.output)).toContain('E1 (section "theStory", the order of its moves): beat "b2" "Marcus brags about the sale", then beat "b4" "The paternity result names Sarah", then beat "b3" "Morgan pays Riley at the bar"');
  });

  it("a send-back's rework that moves a named move out: reported with its reason, not restored, and the page shows it", () => {
    const before = headMoved();
    const standing = D.standingOnMap(null, boardMap(), before);
    const edits = D.carriedEdits(standing, before);
    const pass = EditLogic.moveBeat(before, 'b5', 'closing');
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: D.SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asks for the warning at the close.' }] });
    expect(settled.output).toEqual(pass);
    expect(settled.report.changed).toEqual([expect.objectContaining({
      id: 'E1', pass: 'send-back', automatic: false, restored: false, reason: 'The note asks for the warning at the close.'
    })]);
    const view = pageOf(settled.output, standing, settled.report);
    expect(view.kept).toBe('');
    expect(view.sections.find((s) => s.slot === 'theStory').changed).toEqual([
      expect.stringContaining('Why: The note asks for the warning at the close.')
    ]);
  });

  it("an order narrowed by the director's own strike to one beat: no edit, no <HAND_EDITS> line, and not counted among the edits that stand", () => {
    const left = EditLogic.moveBeatBy(clone(MAP), 'b4', -1);
    const first = D.standingOnMap(null, MAP, left);
    expect(first.edits.map((e) => [e.id, e.after])).toEqual([['E1', ['b2', 'b4', 'b3']]]);
    // The director's next look: they strike two of the three, which leaves the order one beat.
    const struck = EditLogic.strikeBeat(EditLogic.strikeBeat(left, 'b2'), 'b4');
    expect(idsIn(struck, 'theStory')).toEqual(['b3']);
    expect(D.carriedEdits(first, struck)).toEqual([]);
    expect(handEditsOn(first, struck)).not.toContain('the order of its moves');
    const next = D.standingOnMap(first, left, struck);
    expect(next.edits.map((e) => e.path)).toEqual(['leftOut[#b2]', 'leftOut[#b4]']);
    expect(handEditsOn(next, struck)).not.toContain('the order of its moves');
    // The round's automatic pass changes nothing: the page counts the two strikes alone.
    const edits = D.carriedEdits(next, struck);
    const settled = D.settleEdits(null, { edits, before: struck, after: clone(struck), pass: 1 });
    expect(settled.report.checked).toEqual(['E2', 'E3']);
  });

  it('an order edit next to an added move the pass removed: both put back, and the order holds', () => {
    const added = EditLogic.addBeat(boardMap(), 'closing', 'Kai leaves before the count', 'Kai');
    const before = EditLogic.moveBeatBy(added, 'b19', -1);
    const edits = editsOf(boardMap(), before);
    expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#closing].beats[#b19]'], ['E2', 'sections[#closing].beats']]);
    const pass = clone(before);
    const closing = pass.sections.find((s) => s.slot === 'closing');
    closing.beats = closing.beats.filter((b) => b.id !== 'b19');
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(idsIn(settled.output, 'closing')).toEqual(['b15', 'b19', 'b16']);
    expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1', 'E2']);
    expect(settled.report.changed.map((c) => [c.id, c.moved, c.restored])).toEqual([['E1', true, true], ['E2', false, true]]);
  });

  // Fix A, item 3: an order of fewer than two beats is no edit, wherever one comes from, such as a
  // store written by hand or by an earlier build.
  it('an order of one beat is no edit: not carried, no <HAND_EDITS> line, not checked by a pass, and not counted among the edits that stand', () => {
    const left = EditLogic.moveBeatBy(clone(MAP), 'b4', -1);
    const [order] = D.standingOnMap(null, MAP, left).edits;
    const standing = { kind: 'map', issued: 1, edits: [{ ...order, before: ['b3'], after: ['b3'] }] };
    expect(D.carriedEdits(standing, left)).toEqual([]);
    expect(handEditsOn(standing, left)).not.toContain('the order of its moves');
    expect(D.standingOnMap(standing, left, left)).toEqual({ kind: 'map', issued: 1, edits: [] });
    const settled = D.settleEdits(null, { edits: standing.edits, before: left, after: clone(left), pass: 1 });
    expect(settled.report).toBeNull();
    expect(pageOf(left, standing, settled.report).kept).toBe('');
  });

  // Fix A, item 6: the order cannot be put back into a section the pass removed, and the report
  // says so, as it does for every edit a pass should have kept.
  it('a pass that removes the ordered section: nothing goes back, the report says the order is gone, and the page lists it', () => {
    const before = headMoved();
    const standing = D.standingOnMap(null, boardMap(), before);
    const edits = D.carriedEdits(standing, before);
    const pass = clone(before);
    pass.sections = pass.sections.filter((s) => s.slot !== 'theStory');
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(settled.output).toEqual(pass);
    expect(settled.report).toEqual({
      checked: ['E1'],
      changed: [{
        id: 'E1', scope: 'map', where: 'section "theStory", the order of its moves', cut: false, removed: false, moved: false,
        director: 'Jess warns Sarah away / Marcus tests the batch on himself / Marcus asks Quinn to raise the dose / Quinn tells the room another story / The trial run comes to light / Remi presses Quinn and backs off',
        became: null, pass: 1, automatic: true, reason: null, restored: false
      }]
    });
    const view = pageOf(settled.output, standing, settled.report);
    expect(view.kept).toBe('');
    expect(view.changedEdits).toEqual([
      'The Story, the order of its moves: your "Jess warns Sarah away / Marcus tests the batch on himself / Marcus asks Quinn to raise the dose / Quinn tells the room another story / The trial run comes to light / Remi presses Quinn and backs off" is gone (automatic pass 1, which should have kept your edit). No reason given.'
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// <HAND_EDITS> lists the order by the moves' titles, and the summary as the summary of its beat
// ═══════════════════════════════════════════════════════════════════════════

describe("4C: the map's rework reads the order edit and the summary edit", () => {
  const OLD_SUMMARY = MAP.sections[1].beats[1].synopsis;
  const NEW_SUMMARY = 'Morgan slips Riley an envelope at the bar.';
  /** The director's map: The Story reordered, and the summary of "Morgan pays Riley at the bar" rewritten. */
  function directorsMap() {
    const left = EditLogic.moveBeatBy(clone(MAP), 'b4', -1);
    beatOf(left, 'b3').synopsis = NEW_SUMMARY;
    return left;
  }

  it('the guide says what the order line lists and that a beat\'s summary is its synopsis; the rule keeps the order, and each beat it names in its section (fix A)', () => {
    expect(D.MAP_EDIT_LINES_GUIDE).toContain("the order of a section's moves, which lists the section's beats in the order the director set for the article to tell them");
    expect(D.MAP_EDIT_LINES_GUIDE).toContain("the summary of a beat is its synopsis");
    const { contextSection } = buildRevisionContext({
      phase: 'outline', outputName: 'map', revisionCount: 1, previousOutput: directorsMap(),
      handEdits: D.standingOnMap(null, MAP, directorsMap()), humanFeedback: null
    });
    expect(handEditsBlock(contextSection)).toContain('the beats of each section they ordered stay in that section, in the order they set');
  });

  it('lists the order by the moves\' titles in the director\'s order, and the summary edit by its beat, never by the field\'s name', () => {
    const left = directorsMap();
    const standing = D.standingOnMap(null, MAP, left);
    expect(standing.edits.map((e) => [e.id, e.path])).toEqual([
      ['E1', 'sections[#theStory].beats[#b3].synopsis'], ['E2', 'sections[#theStory].beats']
    ]);
    const block = handEditsBlock(buildRevisionContext({
      phase: 'outline', outputName: 'map', revisionCount: 1, previousOutput: left, handEdits: standing, humanFeedback: 'Tighten the lede.'
    }).contextSection);
    expect(block).toContain(`E1 (section "theStory", the summary of beat "b3"): "${NEW_SUMMARY}"\n  removed: "${OLD_SUMMARY}"`);
    expect(block).toContain('E2 (section "theStory", the order of its moves): beat "b2" "Marcus brags about the sale", then beat "b4" "The paternity result names Sarah", then beat "b3" "Morgan pays Riley at the bar"');
    expect(block).not.toMatch(/synopsis\)|, synopsis/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The summary edit (R11; Review focus 4)
// ═══════════════════════════════════════════════════════════════════════════

describe('4C: a summary the director rewrote is put back after an automatic pass, and read as the summary of its move', () => {
  const OLD_SUMMARY = MAP.sections[1].beats[1].synopsis;
  const NEW_SUMMARY = 'Morgan slips Riley an envelope at the bar.';
  const directors = () => {
    const left = clone(MAP);
    beatOf(left, 'b3').synopsis = NEW_SUMMARY;
    return left;
  };

  it('Review focus 4: a pass that rewrites it has the director\'s sentence put back, and the report names it as the summary of its beat', () => {
    const before = directors();
    const edits = editsOf(MAP, before);
    expect(D.editWhere(edits[0])).toBe('section "theStory", the summary of beat "b3"');
    const pass = clone(before);
    beatOf(pass, 'b3').synopsis = 'Morgan pays Riley off at the bar, and Riley pockets it.';
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(beatOf(settled.output, 'b3').synopsis).toBe(NEW_SUMMARY);
    const [entry] = settled.report.changed;
    expect(entry).toMatchObject({
      id: 'E1', where: 'section "theStory", the summary of beat "b3"', restored: true,
      director: NEW_SUMMARY, became: 'Morgan pays Riley off at the bar, and Riley pockets it.'
    });
    expect(JSON.stringify(settled.report)).not.toMatch(/synopsis/);
  });

  it('a sentence the director cut from a summary that a pass writes into another move\'s summary is flagged as come back', () => {
    const before = directors();
    const edits = editsOf(MAP, before);
    expect(edits[0].removed).toEqual([OLD_SUMMARY]);
    const pass = clone(before);
    beatOf(pass, 'b6').synopsis = OLD_SUMMARY;
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(settled.report.changed).toEqual([expect.objectContaining({ id: 'E1', removed: true, director: OLD_SUMMARY, became: OLD_SUMMARY })]);
  });

  it("a summary the director kept a sentence of records only what they took out", () => {
    const left = clone(MAP);
    beatOf(left, 'b3').synopsis = `${OLD_SUMMARY} Riley keeps the envelope.`;
    expect(editsOf(MAP, left)[0]).not.toHaveProperty('removed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No id and no field name in what the report prints for the new kinds
// ═══════════════════════════════════════════════════════════════════════════

describe('4C: the report prints no id and no field name for the order edit and the summary edit', () => {
  it('after a send-back and after an automatic pass', () => {
    const before = EditLogic.moveBeatBy(boardMap(), 'b5', -1);
    beatOf(before, 'b6').synopsis = "Quinn's account leaves out the dose.";
    const edits = editsOf(boardMap(), before);
    const pass = EditLogic.moveBeatBy(before, 'b5', 1);
    beatOf(pass, 'b6').synopsis = 'Quinn tells it another way.';
    const printed = (report) => report.changed.flatMap((entry) => [entry.director, entry.became]);
    [D.SEND_BACK_PASS, 1].forEach((kind) => {
      const { report } = D.settleEdits(null, { edits, before, after: pass, pass: kind });
      expect(report.changed).toHaveLength(2);
      printed(report).forEach((text) => {
        expect(text).not.toMatch(TAG);
        expect(text).not.toMatch(/synopsis/);
      });
      report.changed.forEach((entry) => expect(entry.where).not.toMatch(/synopsis/));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix C: the edge cases of the order the director sets
// ═══════════════════════════════════════════════════════════════════════════

describe("Fix C: the edge cases of the director's order", () => {
  /** Every place a photo sits on the map: its section's slot and the beat it names. */
  const photoPlaces = (map, filename) => [
    ...(map.topPhoto === filename ? [{ slot: 'topPhoto' }] : []),
    ...map.sections.flatMap((s) => (s.photos || []).filter((p) => p.filename === filename).map((p) => ({ slot: s.slot, ...(p.beat ? { beat: p.beat } : {}) })))
  ];
  /** Every place a beat sits on the map: its section's slot, or leftOut. */
  const beatPlaces = (map, id) => [
    ...map.sections.flatMap((s) => s.beats.filter((b) => b.id === id).map(() => s.slot)),
    ...map.leftOut.filter((b) => b.id === id).map(() => 'leftOut')
  ];

  // C1: a move the order names comes back from another section with the photos the pass moved
  // with it, as the director's own move takes them (console/outline-edit-logic.js moveBeat).
  it('C1: a pass moves a named move and its photo to another column; both come back, and each prints once', () => {
    const before = EditLogic.moveBeatBy(boardMap(), 'b5', -1);
    const edits = editsOf(boardMap(), before);
    const pass = EditLogic.moveBeat(before, 'b3', 'closing');
    expect(photoPlaces(pass, 'p03.jpg')).toEqual([{ slot: 'closing', beat: 'b3' }]);
    const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
    expect(idsIn(settled.output, 'theStory')).toEqual(['b3', 'b5', 'b4', 'b6', 'b7', 'b8']);
    expect(beatPlaces(settled.output, 'b3')).toEqual(['theStory']);
    expect(photoPlaces(settled.output, 'p03.jpg')).toEqual([{ slot: 'theStory', beat: 'b3' }]);
    expect(settled.output.sections.find((s) => s.slot === 'closing').photos).toEqual(boardMap().sections[4].photos);
    expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1']);
  });

  // C2: the rule every other map edit follows (mapRestoresWhenGone). A writer's move the pass
  // removed from the map stays out: only its place was the director's, and its removal can be the
  // fix of a fault in the writer's text. The order holds for the moves that remain, and the report
  // records the removed move, which the page names by its title.
  describe('C2: a named move the pass removed from the map stays out', () => {
    const { mapCheckpointData } = require('../map');
    const { keptPhotoFilenames } = require('../workflow/nodes/ai-nodes');
    const ViewLogic = require('../../console/checkpoint-view-logic');
    const { boardMapState } = require('./fixtures/board-map');
    const pageOf = (map, standing, report) => {
      const state = boardMapState({ outline: map, _mapBaseline: map, _outlineHandEdits: standing, _outlineHandEditReport: report, humanOutlineRevisionCount: 1 });
      const data = mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline.topPhoto), evidenceIndex: {}, maxRevisions: 1 });
      return ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    };

    it('the pass removes a writer\'s move and swaps two others: it stays out, the rest go back into the order, and the page names it by its title', () => {
      const before = EditLogic.moveBeat(boardMap(), 'b5', 'theStory', 0);
      const standing = D.standingOnMap(null, boardMap(), before);
      const edits = D.carriedEdits(standing, before);
      expect(edits.map((e) => [e.id, e.after])).toEqual([['E1', ['b5', 'b3', 'b4', 'b6', 'b7', 'b8']]]);
      const pass = clone(before);
      const story = pass.sections.find((s) => s.slot === 'theStory');
      story.beats = ['b5', 'b3', 'b7', 'b6', 'b8'].map((id) => beatOf(before, id));
      const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
      expect(idsIn(settled.output, 'theStory')).toEqual(['b5', 'b3', 'b6', 'b7', 'b8']);
      expect(beatPlaces(settled.output, 'b4')).toEqual([]);
      expect(settled.report.changed).toEqual([
        expect.objectContaining({ id: 'E1', where: 'section "theStory", the order of its moves', automatic: true, restored: true }),
        expect.objectContaining({
          id: 'E1', where: 'section "theStory", beat "b4"', moved: true, automatic: true, restored: false, became: null,
          director: 'Marcus asks Quinn to raise the dose (shows Quinn)', title: 'Marcus asks Quinn to raise the dose'
        })
      ]);
      // The order stands narrowed to the moves that remain, as code put it back.
      expect(settled.narrowed.map((e) => [e.id, e.after])).toEqual([['E1', ['b5', 'b3', 'b6', 'b7', 'b8']]]);
      expect(D.carriedEdits(settled.narrowed, settled.output).map((e) => e.id)).toEqual(['E1']);
      const view = pageOf(settled.output, standing, settled.report);
      expect(view.kept).toBe('');
      expect(view.sections.find((s) => s.slot === 'theStory').changed).toEqual([
        'The Story, the move "Marcus asks Quinn to raise the dose": automatic pass 1 removed the beat you placed here. Only its place was your edit, so it was not put back: add it again if it should stay.'
      ]);
    });

    it('a move the director placed in the order, which the pass removed, is reported once, by its own edit', () => {
      const before = EditLogic.moveBeat(boardMap(), 'b2', 'theStory', 1);
      const edits = editsOf(boardMap(), before);
      expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].beats[#b2]'], ['E2', 'sections[#theStory].beats']]);
      const pass = clone(before);
      const story = pass.sections.find((s) => s.slot === 'theStory');
      story.beats = story.beats.filter((b) => b.id !== 'b2');
      const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
      expect(beatPlaces(settled.output, 'b2')).toEqual([]);
      expect(idsIn(settled.output, 'theStory')).toEqual(['b3', 'b4', 'b5', 'b6', 'b7', 'b8']);
      expect(settled.report.changed.map((c) => [c.id, c.where, c.moved, c.restored])).toEqual([
        ['E1', 'section "theStory", beat "b2", moved from section "lede"', true, false]
      ]);
    });

    it('a move the director added that the pass removed is put back by its own edit, and the order holds on it', () => {
      const added = EditLogic.addBeat(boardMap(), 'closing', 'Kai leaves before the count', 'Kai');
      const before = EditLogic.moveBeatBy(added, 'b19', -1);
      const edits = editsOf(boardMap(), before);
      const pass = clone(before);
      pass.sections.find((s) => s.slot === 'closing').beats = pass.sections.find((s) => s.slot === 'closing').beats.filter((b) => b.id !== 'b19');
      const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
      expect(idsIn(settled.output, 'closing')).toEqual(['b15', 'b19', 'b16']);
      expect(settled.narrowed).toEqual([]);
    });
  });

  // C3: the order is carried only while each move it names prints once, in its section. A named
  // move that also sits in another section or in left out breaks it, and the restore takes the
  // copies outside the section out, with the photos beside them.
  describe('C3: a named move printed twice breaks the order', () => {
    const STORY = ['b3', 'b5', 'b4', 'b6', 'b7', 'b8'];

    it('a named move with a copy in left out: the order is not carried, and the restore takes the copy out', () => {
      const before = EditLogic.moveBeatBy(boardMap(), 'b5', -1);
      const edits = editsOf(boardMap(), before);
      const pass = clone(before);
      pass.leftOut.push(clone(beatOf(before, 'b4')));
      expect(D.carriedEdits(edits, pass)).toEqual([]);
      const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
      expect(idsIn(settled.output, 'theStory')).toEqual(STORY);
      expect(beatPlaces(settled.output, 'b4')).toEqual(['theStory']);
      expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1']);
    });

    it("the director edits a section's heading and orders its moves; a pass removes the section and puts its moves in another column: each move prints once, in the director's section and order", () => {
      const before = EditLogic.moveBeatBy(boardMap(), 'b5', -1);
      before.sections.find((s) => s.slot === 'theStory').heading = 'What the Batch Did';
      const edits = editsOf(boardMap(), before);
      expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].heading'], ['E2', 'sections[#theStory].beats']]);
      let pass = before;
      STORY.forEach((id) => { pass = EditLogic.moveBeat(pass, id, 'closing'); });
      pass = clone(pass);
      pass.sections = pass.sections.filter((s) => s.slot !== 'theStory');
      const settled = D.settleEdits(null, { edits, before, after: pass, pass: 1 });
      const story = settled.output.sections.find((s) => s.slot === 'theStory');
      expect(settled.output.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'followTheMoney', 'thePlayers', 'closing']);
      expect(story.heading).toBe('What the Batch Did');
      expect(idsIn(settled.output, 'theStory')).toEqual(STORY);
      expect(idsIn(settled.output, 'closing')).toEqual(['b15', 'b16']);
      STORY.forEach((id) => expect(`${id}: ${beatPlaces(settled.output, id)}`).toBe(`${id}: theStory`));
      expect(['p03.jpg', 'p04.jpg', 'p05.jpg'].map((f) => photoPlaces(settled.output, f))).toEqual([
        [{ slot: 'theStory', beat: 'b3' }], [{ slot: 'theStory', beat: 'b6' }], [{ slot: 'theStory' }]
      ]);
      expect(D.carriedEdits(edits, settled.output).map((e) => e.id)).toEqual(['E1', 'E2']);
      expect(settled.report.changed.map((c) => [c.id, c.restored])).toEqual([['E1', true], ['E2', true]]);
    });
  });

  // C4: no edit can find a beat by an id the writer repeated, so the board locks the lines under a
  // repeat (mapRepeats) and the meeting refuses a change under one. A section holding such an id
  // makes no order edit.
  it('C4: a column with a repeated id, reordered by the director, makes no order edit, and the other edits stand as before', () => {
    const shown = boardMap();
    shown.leftOut.push(clone(beatOf(shown, 'b4')));
    expect(EditLogic.mapRepeats(shown).beatIds).toEqual(['b4']);
    let left = EditLogic.moveBeatBy(shown, 'b5', -1);
    left = EditLogic.moveBeatBy(left, 'b16', -1);
    left.sections.find((s) => s.slot === 'closing').heading = 'Where the Gains Drift';
    beatOf(left, 'b6').synopsis = "Quinn's account leaves out the dose.";
    expect(idsIn(left, 'theStory')).toEqual(['b3', 'b5', 'b4', 'b6', 'b7', 'b8']);
    const standing = D.standingOnMap(null, shown, left);
    expect(standing.edits.map((e) => [e.id, e.path])).toEqual([
      ['E1', 'sections[#closing].heading'], ['E2', 'sections[#theStory].beats[#b6].synopsis'], ['E3', 'sections[#closing].beats']
    ]);
    expect(D.carriedEdits(standing, left).map((e) => e.id)).toEqual(['E1', 'E2', 'E3']);
    expect(D.standingOnMap(standing, shown, left)).toEqual(standing);
  });

  // C6: a send-back's rework that only takes named moves out of an ordered column, keeping the rest
  // in the director's order, narrows the order to the rest for the round, so the round's check rework
  // is held to it. Its line still reports the move it took out. One that reorders the rest changes
  // the order, which is reported and dropped, as before.
  describe('C6: a send-back that only takes moves out leaves the rest of the order standing', () => {
    const { mapResume } = require('../map');
    const { reviseOutline } = require('../workflow/nodes/ai-nodes');
    const FAILED = {
      phase: 'outline', source: 'map-checks', passed: false, ready: false, structuralPassed: false,
      structuralIssues: ["Players in no beat: Riley. Place each in a section's beat, or name them among gapNote's players, as C7 (`<craft-material>`) sets out."]
    };
    const REASON = 'The note asks for the paternity result at the close.';

    /** The director reorders The Story and sends the map back; the rework moves the paternity result to the close, and `rest` orders what remains. */
    async function sendBackRound(rest) {
      const state = reworkFixtureState();
      const left = EditLogic.moveBeatBy(clone(MAP), 'b4', -1);
      const { error, stateUpdates } = mapResume({ outline: 'send-back', map: left, note: 'Close on the paternity result.' }, state, { theme: 'journalist' });
      expect(error).toBeNull();
      expect(stateUpdates._outlineHandEdits.edits.map((e) => [e.id, e.after])).toEqual([['E1', ['b2', 'b4', 'b3']]]);
      const sendBack = EditLogic.moveBeat(left, 'b4', 'closing');
      const story = sendBack.sections.find((s) => s.slot === 'theStory');
      story.beats = rest.map((id) => story.beats.find((b) => b.id === id));
      const round = { ...state, ...stateUpdates, humanOutlineRevisionCount: 1, outlineRevisionCount: 0 };
      const afterSendBack = await reviseOutline(
        { ...round, _previousOutline: clone(round.outline) },
        { configurable: { sdkClient: async () => ({ ...clone(sendBack), changedDirectorEdits: [{ id: 'E1', reason: REASON }] }), theme: 'journalist' } }
      );
      expect(afterSendBack._outlineHandEditReport.changed).toEqual([expect.objectContaining({
        id: 'E1', where: 'section "theStory", the order of its moves', pass: 'send-back', restored: false, reason: REASON,
        director: 'Marcus brags about the sale / The paternity result names Sarah / Morgan pays Riley at the bar'
      })]);
      return { round, afterSendBack };
    }

    /** The round's check rework, which puts Morgan's payment above the brag. */
    async function checkRework({ round, afterSendBack }) {
      const check = clone(afterSendBack.outline);
      const story = check.sections.find((s) => s.slot === 'theStory');
      story.beats = ['b3', 'b2'].map((id) => story.beats.find((b) => b.id === id));
      let sent;
      const afterCheck = await reviseOutline(
        { ...round, ...afterSendBack, _previousOutline: clone(afterSendBack.outline), outlineRevisionCount: 1, _outlineFeedback: null, validationResults: FAILED },
        { configurable: { sdkClient: async (options) => { sent = options; return clone(check); }, theme: 'journalist' } }
      );
      return { afterCheck, sent };
    }

    it("the send-back moves one named move out, and the check rework reorders the rest: the rest go back to the director's order", async () => {
      const done = await sendBackRound(['b2', 'b3']);
      expect(done.afterSendBack._outlineHandEdits.edits.map((e) => [e.id, e.after])).toEqual([['E1', ['b2', 'b3']]]);
      const { afterCheck, sent } = await checkRework(done);
      expect(handEditsBlock(sent.prompt)).toContain('E1 (section "theStory", the order of its moves): beat "b2" "Marcus brags about the sale", then beat "b3" "Morgan pays Riley at the bar"');
      expect(idsIn(afterCheck.outline, 'theStory')).toEqual(['b2', 'b3']);
      expect(idsIn(afterCheck.outline, 'closing')).toEqual(['b6', 'b4']);
      // The send-back's line still reports the move it took out; the check rework's restore asks nothing.
      expect(afterCheck._outlineHandEditReport.changed.map((c) => [c.id, c.pass, c.restored])).toEqual([['E1', 'send-back', false], ['E1', 1, true]]);
    });

    it('a send-back that reorders the rest changes the order: reported, and dropped for the round', async () => {
      const done = await sendBackRound(['b3', 'b2']);
      expect(done.afterSendBack._outlineHandEdits).toBeUndefined();
      const { afterCheck, sent } = await checkRework({ ...done, afterSendBack: { ...done.afterSendBack, outline: done.afterSendBack.outline } });
      expect(sent.prompt).not.toContain('the order of its moves');
      expect(idsIn(afterCheck.outline, 'theStory')).toEqual(['b3', 'b2']);
    });
  });
});
