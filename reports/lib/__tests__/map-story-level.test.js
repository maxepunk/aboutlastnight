/**
 * The map at the level of the story, with the evidence underneath (phase 4b, piece 1, brief 1D;
 * spec 2026-10-05 sections 4.2, 5, 6 and 9; rulings R1, R3 to R6).
 *
 * A beat is a move of the story: `{id, move, players, threads, connection?, card?, kind?,
 * evidence}`. Its `card` is a marker, and the card's document is the piece flagged `card`; every
 * reader of a beat's card reads it through beatCardOf. The checks hold every thread in the story
 * to a beat, each of the writer's beats to its evidence, each of the writer's lines to story
 * terms, and the writer's own words on the page to its allowance under MAP_WORD_BOUND, and each failure carries the place the map
 * shows it beside. The evidence is never the director's edit. Invented text: the repo is public.
 */
const Ajv = require('ajv');
const {
  mapFindings, mapSchemaFor, directorMapSchemaFor, directorMapProblems, mapResume, mapCheckpointData,
  MAP_WORD_BOUND, MAP_WORD_AIM, mapLengthOf
} = require('../map');
const { wordCount } = require('../word-count');
const { EVIDENCE_PIECE_SCHEMA, evidenceContextOf } = require('../evidence');
const { mapEditsBetween, standingOnMap, carriedEdits, settleEdits, _testing: diffTesting } = require('../hand-edit-diff');
const { beatCardOf, mapTally, strikeBeat, bringBackBeat, addBeat } = require('../../console/outline-edit-logic');
const { _testing: mapNodes } = require('../workflow/nodes/map-nodes');
const { stopPage, wordsShown } = require('../stop-pages');
const { CHECKPOINT_TYPES } = require('../workflow/checkpoint-helpers');
const { keptPhotoFilenames } = require('../workflow/nodes/ai-nodes');
const { storyLevelMap, storyLevelMapState, STORY_LEVEL_MAP, PHOTO_DESCRIPTIONS, cardPiece } = require('./fixtures/story-level-map');
const { piece } = require('./fixtures/story-level-weave');

const clone = (v) => JSON.parse(JSON.stringify(v));
const typesOf = (findings) => findings.failures.map((f) => f.type);
const beatOf = (map, id) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut].find((b) => b.id === id);

/** What the checks read for a state at the map, as the node reads it. */
const inputsOf = (state, map = state.outline) => mapNodes.mapCheckInputsOf(state, map);
/** The checks on a map, against the story-level state. */
const check = (map, overrides = {}) => {
  const state = storyLevelMapState(overrides);
  return mapFindings(map, { ...inputsOf(state, map) });
};
/** The director's standing edits on `left`, made against the writer's map. */
const editsAgainst = (base, left) => carriedEdits(standingOnMap(null, base, left), left);

// ═══════════════════════════════════════════════════════════════════════════
// The shape (R1)
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: a beat is a move, with its threads, its people and its evidence", () => {
  const writer = mapSchemaFor('journalist');
  const beat = writer.properties.sections.items.properties.beats.items;

  it("the writer's beat is {id, move, players, threads, connection?, card?, kind?, evidence}, its material gone", () => {
    expect(Object.keys(beat.properties)).toEqual(['id', 'move', 'players', 'threads', 'connection', 'card', 'kind', 'evidence']);
    expect(beat.required).toEqual(['id', 'move', 'players', 'threads', 'evidence']);
    expect(beat.properties.card.type).toBe('boolean');
    expect(beat.properties.threads).toMatchObject({ type: 'array', items: { type: 'string' } });
    expect(JSON.stringify(writer)).not.toMatch(/material/);
  });

  it("each piece of a beat's evidence is lib/evidence.js EVIDENCE_PIECE_SCHEMA, and left out follows the beat", () => {
    expect(beat.properties.evidence.items).toEqual(EVIDENCE_PIECE_SCHEMA);
    expect(writer.properties.leftOut.items).toEqual(beat);
  });

  it("a story-level map is the writer's; a beat that names its material is not, in the writer's schema or the director's", () => {
    const takes = new Ajv({ allErrors: true, strict: true }).compile(writer);
    expect(takes(storyLevelMap())).toBe(true);
    const old = storyLevelMap();
    old.sections[0].beats[0] = { id: 'b1', kind: 'scene', material: 'The vote', players: [] };
    expect(takes(old)).toBe(false);
    expect(directorMapProblems(old, { theme: 'journalist' })).toMatch(/director-side schema/);
  });

  it('the director-side schema needs only the id and the move of a beat the director adds, in a section and in left out', () => {
    const director = directorMapSchemaFor('journalist');
    expect(director.properties.sections.items.properties.beats.items.required).toEqual(['id', 'move']);
    expect(director.properties.leftOut.items.required).toEqual(['id', 'move']);
    const added = addBeat(storyLevelMap(), 'closing', 'Remi walks out before the vote', 'Remi');
    expect(beatOf(added, 'b10')).toEqual({ id: 'b10', move: 'Remi walks out before the vote', players: ['Remi'] });
    expect(directorMapProblems(added, { theme: 'journalist', shown: storyLevelMap() })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The card: a marker on the beat and a flag on one piece (R4)
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: a beat's card is the piece it flags, read through beatCardOf by every reader", () => {
  it("beatCardOf names the flagged piece's document, on a beat marked as a card; null otherwise", () => {
    const map = storyLevelMap();
    expect(beatCardOf(beatOf(map, 'b3'))).toBe('sam001');
    expect(beatCardOf(beatOf(map, 'b4'))).toBe('p-email');
    expect(beatCardOf(beatOf(map, 'b1'))).toBeNull();
    expect(beatCardOf({ id: 'b8', move: 'x', card: true, evidence: [piece(['sam001'], 'Sam writes.')] })).toBeNull();
    expect(beatCardOf({ id: 'b8', move: 'x', evidence: [cardPiece(['sam001'], 'Sam writes.')] })).toBeNull();
    // A piece that sets the ledger beside a document: the card's document is the document.
    expect(beatCardOf({ id: 'b8', move: 'x', card: true, evidence: [cardPiece(['ledger', 'p-email'], 'The sale beside the email.')] })).toBe('p-email');
    expect(beatCardOf({ id: 'b8', move: 'x', card: true, evidence: [cardPiece(['ledger'], 'The sale.')] })).toBeNull();
  });

  it("the tally's card count is the beats whose flagged piece names a document", () => {
    const map = storyLevelMap();
    expect(mapTally(map, {}).cards).toBe(3);
    delete beatOf(map, 'b5').card;
    expect(mapTally(map, {}).cards).toBe(2);
  });

  it.each([
    ['a flagged piece whose source the record lacks', (b) => { b.evidence[0].sources = ['zzz999']; }],
    ['a flagged piece whose source is the ledger', (b) => { b.evidence[0].sources = ['ledger']; }],
    ['a beat marked as a card that flags no piece', (b) => { delete b.evidence[0].card; }],
    ['a piece flagged on a beat that is not marked as a card', (b) => { delete b.card; }]
  ])('%s fails the card check beside its beat, in story terms', (_name, change) => {
    const map = storyLevelMap();
    change(beatOf(map, 'b4'));
    const failure = check(map).failures.find((f) => f.type === 'card-not-in-record');
    expect(failure).toMatchObject({ place: 'sections[#theStory].beats[#b4]' });
    expect(failure.message).toMatch(/b4/);
    expect(failure.line).toMatch(/^The move "Marcus asks Quinn for a higher dose"/);
    expect(failure.line).not.toMatch(/\bb4\b|zzz999|p-email/);
  });

  it("a card beat the director strikes, or brings back from left out, moves the count: a concern on that edit (cardCountChanges)", () => {
    // Jess and Sarah appear in the vote too, so the strike leaves them placed.
    const shown = storyLevelMap();
    beatOf(shown, 'b2').players.push('Jess', 'Sarah');
    const struck = strikeBeat(clone(shown), 'b5');
    const strikeEdits = editsAgainst(shown, struck);
    expect(mapFindings(struck, { ...inputsOf(storyLevelMapState(), struck), edits: strikeEdits }))
      .toEqual({ failures: [], concerns: [{ type: 'card-count', editIds: ['E1'], finding: 'The map carries 2 cards; the article carries 3 to 5.' }] });

    // Five cards in the sections, and a sixth beat marked as a card in left out.
    const base = storyLevelMap();
    Object.assign(base.leftOut[0], { card: true, evidence: [cardPiece(['jes002'], 'Jess warns Sarah.')] });
    ['b1', 'b2'].forEach((id) => { const b = beatOf(base, id); b.card = true; b.evidence[0] = cardPiece(['sam001'], 'Sam writes.'); });
    const back = bringBackBeat(base, 'b9', 'closing');
    const edits = editsAgainst(base, back);
    expect(edits.map((e) => [e.id, e.path, e.from])).toEqual([['E1', 'sections[#closing].beats[#b9]', 'leftOut']]);
    expect(mapFindings(back, { ...inputsOf(storyLevelMapState(), back), edits }).concerns)
      .toEqual([{ type: 'card-count', editIds: ['E1'], finding: 'The map carries 6 cards; the article carries 3 to 5.' }]);
  });

  it("a card the director brought back from left out whose piece names no document is a concern on the bring-back (editsOnCards)", () => {
    const base = storyLevelMap();
    Object.assign(base.leftOut[0], { card: true, evidence: [cardPiece(['zzz003'], 'A document no record holds.')] });
    const back = bringBackBeat(base, 'b9', 'closing');
    const edits = editsAgainst(base, back);
    const findings = mapFindings(back, { ...inputsOf(storyLevelMapState(), back), edits });
    expect(findings.failures.filter((f) => f.type === 'card-not-in-record')).toEqual([]);
    expect(findings.concerns.filter((c) => c.type === 'card-not-in-record').map((c) => c.editIds)).toEqual([['E1']]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Every thread in the story lands in a beat (R3)
// ═══════════════════════════════════════════════════════════════════════════

describe('1D: every thread in the story lands in a beat that names it', () => {
  it('the inputs list the threads in the story, by id and name; a left-out thread is never asked for', () => {
    const { threads } = inputsOf(storyLevelMapState());
    expect(threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
    expect(threads[1]).toEqual({ id: 't2', name: "Marcus's own dosing", added: false });
    expect(check(storyLevelMap())).toEqual({ failures: [], concerns: [] });
  });

  it('a thread in the story that no beat in the sections names fails, by its name; a beat in left out carries none', () => {
    const map = storyLevelMap();
    beatOf(map, 'b6').threads = ['t3'];
    map.leftOut[0].threads = ['t5'];
    const failure = check(map).failures.find((f) => f.type === 'thread-not-landed');
    expect(failure.message).toMatch(/"The memories sold" \(t5\)/);
    expect(failure.line).toBe('The thread "The memories sold" lands in no move.');
    expect(failure.place).toBeUndefined();
  });

  it("a thread the director added at the meeting lands in a beat, or the gap note names it when the record cannot carry it", () => {
    const added = (state) => {
      const left = clone(state.weave);
      left.threads.push({ id: 't11', name: 'The second vial', line: 'Kai kept a second vial in the coat room.', role: 'grounds-it' });
      const { standingAtMeeting } = require('../hand-edit-diff');
      return { weave: left, _weaveHandEdits: standingAtMeeting(null, state.weave, left) };
    };
    const state = storyLevelMapState();
    const meeting = added(state);
    const at = storyLevelMapState(meeting);
    expect(inputsOf(at).threads.slice(-1)).toEqual([{ id: 't11', name: 'The second vial', added: true }]);
    const failure = mapFindings(at.outline, inputsOf(at)).failures.find((f) => f.type === 'thread-not-landed');
    expect(failure.message).toMatch(/added at the meeting/);
    expect(failure.message).toMatch(/gapNote/);
    const named = storyLevelMap();
    named.gapNote.line = 'The notes record nothing Remi did, and the record holds nothing of the second vial.';
    expect(mapFindings(named, inputsOf({ ...at, outline: named }, named)).failures).toEqual([]);
  });

  it("a thread whose only beat the director struck is a concern on the strike, never a failure", () => {
    const struck = strikeBeat(storyLevelMap(), 'b6');
    const findings = mapFindings(struck, { ...inputsOf(storyLevelMapState(), struck), edits: editsAgainst(storyLevelMap(), struck) });
    expect(findings.failures.filter((f) => f.type === 'thread-not-landed')).toEqual([]);
    expect(findings.concerns.filter((c) => c.type === 'thread-not-landed')).toEqual([
      { type: 'thread-not-landed', editIds: ['E1'], finding: 'The thread "The memories sold" lands in no move.' }
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The writer's beats and lines: evidence and story terms (lib/evidence.js)
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: each of the writer's beats passes the evidence check, and each of the writer's lines the story-terms check", () => {
  it('a beat with no threads, or no evidence, fails beside it; a piece that names no document, or misquotes one, fails beside it', () => {
    const map = storyLevelMap();
    beatOf(map, 'b2').threads = [];
    beatOf(map, 'b7').evidence = [];
    beatOf(map, 'b6').evidence = [piece(['zzz999'], 'A document no record holds.'), piece(['p-email'], 'Marcus asks Quinn to "lower the dose"')];
    const failures = check(map).failures;
    expect(failures.map((f) => [f.type, f.place])).toEqual(expect.arrayContaining([
      ['beat-without-threads', 'sections[#lede].beats[#b2]'],
      ['beat-without-evidence', 'sections[#closing].beats[#b7]'],
      ['evidence-not-in-record', 'sections[#followTheMoney].beats[#b6]']
    ]));
    const evidence = failures.find((f) => f.type === 'evidence-not-in-record');
    expect(evidence.message).toMatch(/piece 1 names "zzz999"/);
    expect(evidence.message).toMatch(/piece 2 quotes "lower the dose"/);
    expect(evidence.line).toMatch(/^The evidence behind the move "The memories sold off as the trial run surfaced" cites a document the record does not hold/);
    expect(evidence.line).not.toMatch(/zzz999|piece \d/);
  });

  it('a buried memory named as a source fails, and the line names nothing the record keeps of it', () => {
    const map = storyLevelMap();
    beatOf(map, 'b6').evidence = [piece(['kai009'], 'Kai hides the vial.')];
    const failure = check(map).failures.find((f) => f.type === 'evidence-not-in-record');
    expect(failure.line).not.toMatch(/kai009|vial/i);
  });

  it("a beat the director added, with no threads and no evidence, fails nothing", () => {
    const left = addBeat(storyLevelMap(), 'closing', 'Remi walks out before the vote', 'Remi');
    const findings = mapFindings(left, { ...inputsOf(storyLevelMapState(), left), edits: editsAgainst(storyLevelMap(), left) });
    expect(findings).toEqual({ failures: [], concerns: [] });
  });

  it.each([
    ["a section's job", (m) => { m.sections[0].job = 'Opens on the vote at 9:58 and asks the question.'; }, 'sections[#lede]', /The Lede's job|lede/],
    ["a beat's move in a section", (m) => { beatOf(m, 'b3').move = 'Sam: "I think he is trying the new batch on himself"'; }, 'sections[#theStory].beats[#b3]', /b3/],
    ["a beat's move in left out", (m) => { m.leftOut[0].move = 'The suspects worth $450,000 let go'; }, 'leftOut[#b9]', /b9/],
    ["the gap note's line", (m) => { m.gapNote.line = 'The notes record nothing Remi did, and sam001 is silent.'; }, 'gapNote', /gapNote/],
    ['a change to the weave', (m) => { m.weaveChanges = [{ source: 'note', change: 'The vote moved to 10:18 AM.' }]; }, 'weaveChanges', /change/]
  ])('%s that breaks story terms fails beside its line', (_name, change, place, inMessage) => {
    const map = storyLevelMap();
    change(map);
    const state = storyLevelMapState({ directorGateNotes: [{ gate: 'arc-selection', kind: 'approval', round: 1, stopRound: 1, text: 'Lead with the vote.', at: '2026-10-05T09:00:00.000Z' }] });
    const failure = mapFindings(map, { ...inputsOf(state, map) }).failures.find((f) => f.type === 'story-terms');
    expect(failure).toMatchObject({ place });
    expect(failure.message).toMatch(inMessage);
    expect(failure.message).toMatch(/C16 \(<craft-story>\)/);
    expect(failure.line).toMatch(/The map tells the story in plain words/);
    expect(failure.line).not.toMatch(/\b[btc]\d+\b|sam001/);
  });

  it("the headline, the deck and a section's heading are exempt; names, possessives and numbers in words are story terms", () => {
    const map = storyLevelMap();
    map.headline = 'Ten Votes at 9:58 Call a $450,000 Trial an Accident';
    map.deck = 'At 10:18 AM the room said "accident" and Kai\'s account took $450,000.';
    map.sections[1].heading = 'The Story at 9:58';
    beatOf(map, 'b2').move = "Kai's and Quinn's quick vote, five to four";
    expect(check(map).failures).toEqual([]);
  });

  it("a line the director rewrote is never held to story terms", () => {
    const left = storyLevelMap();
    left.sections[0].job = 'Opens on the vote at 9:58.';
    beatOf(left, 'b1').move = 'Alex says "you dosed us all" at 9:58';
    const findings = mapFindings(left, { ...inputsOf(storyLevelMapState(), left), edits: editsAgainst(storyLevelMap(), left) });
    expect(findings.failures).toEqual([]);
  });

  it('every failure carries the rework\'s message and the director\'s line', () => {
    const map = storyLevelMap();
    map.sections[0].job = 'At 9:58.';
    beatOf(map, 'b6').threads = [];
    check(map).failures.forEach((f) => {
      expect(Object.keys(f).sort()).toEqual(expect.arrayContaining(['line', 'message', 'type']));
      expect(typeof f.line).toBe('string');
      expect(f.line.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The page's length (R5)
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: the writer's own words on the page are held to its allowance under MAP_WORD_BOUND, the director's version never", () => {
  /** The map with every move padded to `words` words. */
  const padded = (words) => {
    const map = storyLevelMap();
    [...map.sections.flatMap((s) => s.beats), ...map.leftOut].forEach((b) => {
      b.move = `${b.move} ${Array.from({ length: words }, (_, i) => `beat${i}`).join(' ')}`;
    });
    return map;
  };

  it('the bound is 450 words, and the aim 300', () => {
    expect([MAP_WORD_BOUND, MAP_WORD_AIM]).toEqual([450, 300]);
  });

  // Fix round 2 (the integrator's ruling): the writer is held only to the words it wrote.
  it('the writer may use 300 words of its own, and more only while the whole page stays within 450 (mapLengthOf)', () => {
    expect(mapLengthOf(244, 115)).toEqual({ page: 244, writer: 129, allowance: 335 });
    expect(mapLengthOf(488, 359)).toEqual({ page: 488, writer: 129, allowance: 300 });
    expect(mapLengthOf(450, 150)).toEqual({ page: 450, writer: 300, allowance: 300 });
  });

  it("the writer's own words past its allowance fail, and words within it pass, however long the page", () => {
    const state = storyLevelMapState();
    expect(mapFindings(storyLevelMap(), { ...inputsOf(state), length: { page: 520, writer: 290, allowance: 300 } }).failures).toEqual([]);
    expect(mapFindings(storyLevelMap(), { ...inputsOf(state), length: { page: 450, writer: 349, allowance: 349 } }).failures).toEqual([]);
    const over = mapFindings(storyLevelMap(), { ...inputsOf(state), length: { page: 452, writer: 351, allowance: 349 } }).failures;
    expect(typesOf({ failures: over })).toEqual(['over-length']);
    expect(over[0].line).toBe("The writer's part of the map runs to 351 words, past the 349 it may use.");
    expect(over[0].line).not.toMatch(/\bb\d+\b/);
    // The rework reads which of its lines to cut, the longest first, and that code prints the rest.
    expect(over[0].message).toMatch(/^The map's page runs to 452 words, 351 of them in the lines you write, past the 349 those lines may use \(300, or more while the whole page stays within 450\)\. Cut 2 words or more from your lines, starting with the longest: /);
    expect(over[0].message).toContain("beat b6's move and people (10 words)");
    expect(over[0].message).toContain("The rest of the page (the settled story, the photos' descriptions and the counts) is printed by code.");
  });

  it("the node counts the page by wordsShown and its overhead on the page with the writer's text blank, and records the three on _mapCheck", () => {
    const state = storyLevelMapState();
    const words = mapNodes.mapPageWords(state, state.outline, []);
    expect(words.page).toBe(wordsShown(CHECKPOINT_TYPES.OUTLINE, mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, 'top.jpg'), maxRevisions: 0 })));
    // The writer's own words: the lines it wrote that the page prints unfolded.
    const map = state.outline;
    const writers = wordCount(map.headline) + wordCount(map.deck) + wordCount(map.gapNote.line)
      + map.sections.reduce((n, s) => n + wordCount(s.heading) + wordCount(s.job)
        + s.beats.reduce((m, b) => m + wordCount(b.move) + wordCount(b.players.join(', ')), 0), 0)
      + map.dropped.reduce((n, d) => n + wordCount(d.reason), 0);
    expect(words.writer).toBe(writers);
    expect(words.allowance).toBe(Math.max(MAP_WORD_AIM, MAP_WORD_BOUND - (words.page - words.writer)));
    const result = mapNodes.checkMap(state);
    expect(result._mapCheck).toMatchObject({ passed: true, words });
  });

  it("long photo descriptions push the page past 450, and a writer within its own 300 passes", () => {
    const long = (word) => Array.from({ length: 90 }, () => word).join(' ');
    const state = storyLevelMapState({ photoDescriptions: { 'top.jpg': long('crowd'), 'board.jpg': long('board'), 'bar.jpg': long('bar') } });
    const result = mapNodes.checkMap(state);
    expect(result._mapCheck.failures).toEqual([]);
    expect(result._mapCheck.words.page).toBeGreaterThan(MAP_WORD_BOUND);
    expect(result._mapCheck.words.writer).toBeLessThanOrEqual(MAP_WORD_AIM);
  });

  it("the writer's own words past its allowance fail at the node, in story terms", () => {
    const result = mapNodes.checkMap(storyLevelMapState({ outline: padded(50) }));
    expect(result._mapCheck.failures.map((f) => f.type)).toEqual(['over-length']);
    const { writer, allowance } = result._mapCheck.words;
    expect(result._mapCheck.failures[0].line).toBe(`The writer's part of the map runs to ${writer} words, past the ${allowance} it may use.`);
  });

  it("the director's long lines add nothing to the count, and their version is never refused for its length", () => {
    const left = padded(50);
    expect(directorMapProblems(left, { theme: 'journalist', shown: storyLevelMap() })).toBeNull();
    expect(mapResume({ outline: 'approve', map: left }, storyLevelMapState(), { theme: 'journalist' }).error).toBeNull();
    const standing = standingOnMap(null, storyLevelMap(), left);
    const result = mapNodes.checkMap(storyLevelMapState({ outline: left, _outlineHandEdits: standing }));
    expect(result._mapCheck.failures).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The evidence is never the director's edit (R6; survey Q1)
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: the evidence is never the director's edit", () => {
  it("Q1: a director's version whose beat's evidence differs makes no edit, in a section or in left out", () => {
    const left = storyLevelMap();
    beatOf(left, 'b3').evidence[1].shows = 'Jess warns Sarah, in other words.';
    beatOf(left, 'b4').evidence.push(piece(['notes'], 'A new piece.'));
    left.leftOut[0].evidence = [];
    expect(mapEditsBetween(storyLevelMap(), left)).toEqual([]);
    expect(standingOnMap(null, storyLevelMap(), left)).toBeNull();
  });

  it("a move rewritten beside a changed piece is one edit, of the move; a beat added, struck or brought back carries no evidence", () => {
    const left = storyLevelMap();
    beatOf(left, 'b3').move = 'Marcus tries the batch on himself first';
    beatOf(left, 'b3').evidence = [];
    expect(mapEditsBetween(storyLevelMap(), left).map((e) => e.at.map((s) => s.key || s.match.id || s.match.slot).join('/'))).toEqual(['sections/theStory/beats/b3/move']);
    const struck = strikeBeat(storyLevelMap(), 'b3');
    const [strike] = mapEditsBetween(storyLevelMap(), struck);
    expect(strike.struck).toBe(true);
    expect(strike.after).not.toHaveProperty('evidence');
    expect(strike.after).toMatchObject({ id: 'b3', move: 'Marcus trying the batch on himself', card: true });
  });

  it("a send-back's change to a beat the director added is a change of their text, read as its move and its people, with no tag and none of the evidence a writer gave it", () => {
    const left = addBeat(storyLevelMap(), 'closing', 'Remi walks out before the vote', 'Remi');
    const standing = standingOnMap(null, storyLevelMap(), left);
    const rework = clone(left);
    Object.assign(beatOf(rework, 'b10'), { move: 'Remi leaves the room', threads: ['t1'], kind: 'scene', connection: 'c2', evidence: [piece(['notes'], 'The room votes for an accident.')] });
    const { reportAfterPass, SEND_BACK_PASS } = require('../hand-edit-diff');
    const report = reportAfterPass(null, { edits: carriedEdits(standing, left), before: left, after: rework, pass: SEND_BACK_PASS });
    expect(report.changed).toEqual([expect.objectContaining({
      id: 'E1', moved: false, director: 'Remi walks out before the vote (shows Remi)', became: 'Remi leaves the room (shows Remi)'
    })]);
  });

  it("a send-back that sits a photo beside another beat reads, in the report, as the moves it sat beside, never their tags", () => {
    const { setPhotoBeside } = require('../../console/outline-edit-logic');
    const left = setPhotoBeside(storyLevelMap(), 'theStory', 0, 'b4');
    const standing = standingOnMap(null, storyLevelMap(), left);
    const rework = setPhotoBeside(left, 'theStory', 0, 'b5');
    const { reportAfterPass, SEND_BACK_PASS } = require('../hand-edit-diff');
    const report = reportAfterPass(null, { edits: carriedEdits(standing, left), before: left, after: rework, pass: SEND_BACK_PASS });
    expect(report.changed).toEqual([expect.objectContaining({
      director: 'Marcus asks Quinn for a higher dose', became: 'Jess warns Sarah'
    })]);
  });

  it("a photo the director took from beside its beat that a pass sat beside another beat reads, in the report, as the move it came back beside, never its tag", () => {
    const { setPhotoBeside } = require('../../console/outline-edit-logic');
    const left = setPhotoBeside(storyLevelMap(), 'theStory', 0, '');
    const standing = standingOnMap(null, storyLevelMap(), left);
    const pass = setPhotoBeside(left, 'theStory', 0, 'b4');
    const { reportAfterPass, SEND_BACK_PASS } = require('../hand-edit-diff');
    const cameBack = { cut: true, director: 'Marcus trying the batch on himself', became: 'Marcus asks Quinn for a higher dose' };

    const sendBack = reportAfterPass(null, { edits: carriedEdits(standing, left), before: left, after: pass, pass: SEND_BACK_PASS });
    expect(sendBack.changed).toEqual([expect.objectContaining(cameBack)]);

    const { report } = settleEdits(null, { edits: carriedEdits(standing, left), before: left, after: pass, pass: 1 });
    expect(report.changed).toEqual([expect.objectContaining({ ...cameBack, automatic: true })]);
  });

  it("the map's printed text is its lines and its moves, never the evidence under them", () => {
    const leaves = diffTesting.printedLeaves(storyLevelMap());
    expect(leaves).toContain('Marcus asks Quinn for a higher dose');
    expect(leaves.join('\n')).not.toMatch(/raise the dose|Sam writes/);
  });

  it("an automatic pass that gives the director's beat its evidence keeps the edit, and the restore of a move it rewrote keeps the pass's evidence", () => {
    const left = addBeat(storyLevelMap(), 'closing', 'Remi walks out before the vote', 'Remi');
    const standing = standingOnMap(null, storyLevelMap(), left);
    const pass = clone(left);
    Object.assign(beatOf(pass, 'b10'), { threads: ['t1'], evidence: [piece(['notes'], 'The room votes for an accident.')] });
    expect(carriedEdits(standing, pass).map((e) => e.path)).toEqual(['sections[#closing].beats[#b10]']);

    const rewrote = clone(pass);
    beatOf(rewrote, 'b10').move = 'Remi leaves the room';
    const { output } = settleEdits(null, { edits: carriedEdits(standing, left), before: left, after: rewrote, pass: 1 });
    expect(beatOf(output, 'b10')).toEqual({
      id: 'b10', move: 'Remi walks out before the vote', players: ['Remi'], threads: ['t1'],
      evidence: [piece(['notes'], 'The room votes for an accident.')]
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The stop's payload, and its page
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: the map's stop carries the director's photo descriptions and the beats they added", () => {
  it('mapCheckpointData sends the photo descriptions and the ids of the beats the director added', () => {
    const left = addBeat(storyLevelMap(), 'closing', 'Remi walks out before the vote', 'Remi');
    const state = storyLevelMapState({ outline: left, _outlineHandEdits: standingOnMap(null, storyLevelMap(), left) });
    const data = mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, 'top.jpg'), maxRevisions: 1 });
    expect(data.photoDescriptions).toEqual(PHOTO_DESCRIPTIONS);
    expect(data.addedBeats).toEqual(['b10']);
    expect(mapCheckpointData(storyLevelMapState(), {}).addedBeats).toEqual([]);
  });
});

describe("1D: the map's page prints each move with its people, the evidence folded, the photos by the director's descriptions, and no tag", () => {
  const payload = (state = storyLevelMapState()) => mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, 'top.jpg'), evidenceIndex: {}, maxRevisions: 1 });

  it('each move prints its words, "(card)" where it has the marker, and its people; its evidence is folded', () => {
    const { lines } = stopPage(CHECKPOINT_TYPES.OUTLINE, payload());
    const shown = lines.filter((l) => !l.folded).map((l) => l.text);
    expect(shown).toContain('Marcus asks Quinn for a higher dose (card)');
    expect(shown).toContain("Alex's late theory that Marcus dosed everyone");
    expect(shown).toContain('Quinn, Kai');
    const folded = lines.filter((l) => l.folded).map((l) => l.text);
    expect(folded).toEqual(expect.arrayContaining([expect.stringContaining('raise the dose for the pilot')]));
    expect(shown.join('\n')).not.toMatch(/raise the dose for the pilot/);
  });

  it("each photo prints the director's description, or its filename when there is none", () => {
    const state = storyLevelMapState({ photoDescriptions: { 'board.jpg': PHOTO_DESCRIPTIONS['board.jpg'] } });
    const shown = stopPage(CHECKPOINT_TYPES.OUTLINE, payload(state)).lines.filter((l) => !l.folded).map((l) => l.text);
    expect(shown).toContain('Sam reading the journal by the board');
    expect(shown).toContain('bar.jpg');
  });

  it("no line or label carries a beat's, a thread's or a connection's tag", () => {
    const { lines } = stopPage(CHECKPOINT_TYPES.OUTLINE, payload());
    lines.forEach((l) => {
      expect(`${l.label} ${l.text}`).not.toMatch(/\b[btc]\d+\b/);
    });
  });

  it("the page's words are its unfolded lines' count, at most the bound for the writer's map", () => {
    const data = payload();
    const page = stopPage(CHECKPOINT_TYPES.OUTLINE, data);
    const { wordCount } = require('../word-count');
    expect(wordsShown(CHECKPOINT_TYPES.OUTLINE, data)).toBe(page.lines.filter((l) => !l.folded).reduce((n, l) => n + wordCount(l.text), 0));
    expect(wordsShown(CHECKPOINT_TYPES.OUTLINE, data)).toBeLessThanOrEqual(MAP_WORD_BOUND);
  });

  it("a beat the director added with no evidence folds the line that the article writer finds it", () => {
    const left = addBeat(storyLevelMap(), 'closing', 'Remi walks out before the vote', 'Remi');
    const state = storyLevelMapState({ outline: left, _outlineHandEdits: standingOnMap(null, storyLevelMap(), left) });
    const folded = stopPage(CHECKPOINT_TYPES.OUTLINE, payload(state)).lines.filter((l) => l.folded).map((l) => l.text);
    expect(folded).toContain('Nothing yet: the article writer finds the evidence for it.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The map writer's task
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: the map writer's task asks for moves in story terms, each with its evidence, at most 450 words aiming for 300", () => {
  const { PromptBuilder } = require('../prompt-builder');
  const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
  const { storyLevelWeave } = require('./fixtures/story-level-weave');
  const taskOf = async () => {
    const builder = new PromptBuilder({ loadPhasePrompts: jest.fn(), validate: jest.fn() });
    const { userPrompt } = await builder.buildOutlinePrompt(renderSettledWeave(storyLevelWeave(), null), [], [], null, {});
    return userPrompt.slice(userPrompt.indexOf("Lay the settled weave above across the article's sections"), userPrompt.indexOf('<SLOTS>'));
  };

  it('asks for the page at most 450 words, aiming for 300, and no beat naming its material', async () => {
    const task = await taskOf();
    expect(task).toContain(`at most ${MAP_WORD_BOUND} words`);
    expect(task).toContain(`aim for ${MAP_WORD_AIM}`);
    expect(task).not.toMatch(/naming its material|about 450 words/);
  });

  it("asks for each move in story terms as C2 sets them out, with its threads, its people and its evidence, and the card's document flagged as C9 sets out", async () => {
    const task = await taskOf();
    expect(task).toContain('C2 (`<craft-form>`)');
    expect(task).toMatch(/threads/);
    expect(task).toMatch(/evidence/);
    expect(task).toContain('C9 (`<craft-cards>`)');
    expect(task).toMatch(/flag/);
  });

  it("asks for a change of the director's that the record cannot carry to go in the gap note", async () => {
    const gapLine = (await taskOf()).split('\n').find((line) => line.includes('gapNote, the one line at the top'));
    expect(gapLine).toMatch(/a change the director made at the meeting/);
    expect(gapLine).toMatch(/record cannot carry/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The fixed map the renders plant
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: the fixed map's planted failure is a card flag on a piece whose source the record lacks", () => {
  const { fixedMap } = require('../../scripts/lib/fixed-map');

  it('is a story-level map, and its flagged card names a document no record holds', () => {
    const map = fixedMap();
    const writerTakes = new Ajv({ allErrors: true, strict: true }).compile(mapSchemaFor('journalist'));
    expect(directorMapProblems(map, { theme: 'journalist' })).toBeNull();
    const cardBeat = map.sections.flatMap((s) => s.beats).find((b) => b.card === true);
    expect(beatCardOf(cardBeat)).toBe('RENDER-DIFF-DOC');
    const state = storyLevelMapState({ outline: map });
    const failure = mapFindings(map, { ...inputsOf(state, map) }).failures.find((f) => f.type === 'card-not-in-record');
    expect(failure.place).toBe(`sections[#theStory].beats[#${cardBeat.id}]`);
    expect(writerTakes(map)).toBe(true);
  });
});

// The fixture's own record holds what its evidence cites.
describe('the story-level map fixture', () => {
  it('passes every check on its own state', () => {
    const state = storyLevelMapState();
    expect(mapFindings(STORY_LEVEL_MAP, { ...inputsOf(state) })).toEqual({ failures: [], concerns: [] });
    expect(evidenceContextOf(state).documents.has('sam001')).toBe(true);
  });
});
