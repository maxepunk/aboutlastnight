/**
 * The map's code checks (phase 4, brief 4.6; spec 5.4): every roster player in a beat
 * or raised in the gap note, every kept photo placed once, three to five cards from the
 * record, every connection of the settled weave landed in a beat, and each change to the
 * weave named by its source. Each failure is one line with its own list; a failure the
 * director caused is a concern on their edit, never a rework. Invented text throughout.
 *
 * Phase 4b (brief 1D; R1, R4): each beat is a move with its people, the threads it carries and
 * its evidence; a card is a marker on the beat and a flag on the piece whose document it prints
 * (markCard), read through beatCardOf. The story-level checks (threads, evidence, story terms,
 * the page's length) are lib/__tests__/map-story-level.test.js's.
 */
const { mapFindings, mapKey, mapRosterOf, MAP_CHECKS_SOURCE, MAP_BEAT_KINDS } = require('../map');
const { standingOnMap, carriedEdits } = require('../hand-edit-diff');
const { evidenceContextOf } = require('../evidence');

/** The record the cards cite: four documents, each with its text. */
const RECORD = evidenceContextOf({
  evidenceBundle: { exposed: { tokens: ['row001', 'row002', 'row003', 'row004'].map((id) => ({ id, tokenId: id, fullContent: `The text of ${id}.` })) } }
});

const clone = (v) => JSON.parse(JSON.stringify(v));

const ROSTER = [
  { name: 'Ellis', fullName: 'Ellis Reeve' }, { name: 'Rowan', fullName: 'Rowan Vale' },
  { name: 'Sloane', fullName: 'Sloane Hart' }, { name: 'Mira', fullName: 'Mira Fenn' },
  { name: 'Vale', fullName: 'Vale Orrin' }, { name: 'Kai', fullName: 'Kai Lune' }
];

/** A map that passes every check: Kai is raised in the gap note, three cards, three photos. */
/** A piece of evidence. */
const piece = (sources, shows) => ({ sources, shows, stance: 'supports' });
/** A beat's card fields: its marker, and the piece flagged as the card's document (R4). */
const cardOf = (source) => ({ card: true, evidence: [{ ...piece([source], `The document ${source}.`), card: true }] });
/** A beat given a card, as a writer marks one: the marker and the flagged piece. */
const markCard = (beat, source) => Object.assign(beat, cardOf(source));
/** A beat's card taken off, as a writer takes it off: the marker and the flag. */
const clearCard = (beat) => {
  delete beat.card;
  beat.evidence = (beat.evidence || []).map(({ card: _flag, ...rest }) => rest);
  return beat;
};
/** A move the writer gives its threads and evidence: the fields every check reads. */
const move = (id, kind, text, players, extra = {}) => ({ id, kind, move: text, players, threads: ['t1'], evidence: [piece(['notes'], `${text}.`)], ...extra });

const writers = () => ({
  headline: 'Ellis Reeve Pointed the Room at Rowan',
  deck: 'Money moved into an account named for a player in the last two minutes of selling.',
  topPhoto: 'huddle.jpg',
  gapNote: { line: 'The record holds nothing Kai did.', players: ['Kai'] },
  sections: [
    {
      slot: 'lede', heading: '', job: 'Open on the vote and ask what it will cost.',
      beats: [
        move('b1', 'scene', 'The scoreboard goes up on the screen', ['Ellis', 'Rowan']),
        move('b2', 'line', 'Rowan says someone is framing him', ['Rowan'], { connection: 'c1' })
      ],
      photos: []
    },
    {
      slot: 'theStory', heading: 'The Story', job: 'How the room built its case.',
      beats: [
        move('b3', 'receipt', 'The fight in the hall', ['Sloane'], cardOf('row001')),
        move('b4', 'scene', 'The first vote, six to four', ['Mira', 'Vale']),
        move('b5', 'receipt', 'The ledger page', ['Mira'], cardOf('row002')),
        move('b6', 'receipt', 'The letter', ['Vale'], cardOf('row003'))
      ],
      photos: [{ filename: 'theory.jpg', beat: 'b4' }, { filename: 'cards.jpg' }]
    }
  ],
  dropped: [{ slot: 'thePlayers', reason: 'Everyone appears above.' }],
  leftOut: [move('b9', 'scene', 'Kai at the coat check', ['Kai'])],
  expectedLength: 1200,
  weaveChanges: []
});

const inputs = (over = {}) => ({
  roster: ROSTER,
  keptPhotos: ['huddle.jpg', 'theory.jpg', 'cards.jpg'],
  // Fix round 4: a card's document is one the record holds with text, read through the evidence
  // context (lib/evidence.js recordDocumentOf).
  evidence: RECORD,
  connections: ['c1'],
  meetingEdits: [],
  meetingNote: false,
  edits: [],
  ...over
});

const typesOf = (findings) => findings.map((f) => f.type);
/** The director's standing edits on `map`, made against the writer's map. */
const directorsEdits = (map) => carriedEdits(standingOnMap(null, writers(), map), map);

describe('the map: its constants', () => {
  it("the beat kinds are the four C2 names, and the checks stamp their own source", () => {
    expect(MAP_BEAT_KINDS).toEqual(['scene', 'receipt', 'line', 'figure']);
    expect(MAP_CHECKS_SOURCE).toBe('map-checks');
  });

  it('mapKey names the map it read: equal maps one key, a changed map another', () => {
    expect(mapKey(writers())).toBe(mapKey(clone(writers())));
    const changed = writers();
    changed.deck = 'Another deck.';
    expect(mapKey(changed)).not.toBe(mapKey(writers()));
    expect(mapKey(writers())).toMatch(/^[0-9a-f]{12}$/);
  });

  it('mapRosterOf reads the roster stop with the canonical full names', () => {
    expect(mapRosterOf({ roster: ['Ellis', { name: 'Kai' }] }, { Ellis: 'Ellis Reeve' })).toEqual([
      { name: 'Ellis', fullName: 'Ellis Reeve' }, { name: 'Kai', fullName: null }
    ]);
    expect(mapRosterOf(null, null)).toEqual([]);
  });
});

describe('the map checks (spec 5.4)', () => {
  it('a map that holds every player, places every kept photo once, carries three to five cards from the record, lands every connection and lists no change: silent', () => {
    expect(mapFindings(writers(), inputs())).toEqual({ failures: [], concerns: [] });
  });

  describe('players (C7)', () => {
    it('a roster player in no beat fails, listed; the fix names a beat or the gap note', () => {
      const map = writers();
      map.sections[1].beats[1].players = ['Vale'];
      map.sections[1].beats[2].players = [];
      const { failures, concerns } = mapFindings(map, inputs());
      expect(typesOf(failures)).toEqual(['player-not-placed']);
      expect(failures[0].message).toMatch(/^Players in no beat: Mira\. /);
      expect(failures[0].message).toMatch(/gapNote/);
      expect(concerns).toEqual([]);
    });

    it("a player raised in the gap note, by first or full name, counts as placed; one in neither fails", () => {
      expect(mapFindings({ ...writers(), gapNote: { line: 'Nothing on Kai.', players: ['Kai Lune'] } }, inputs()).failures).toEqual([]);
      const { failures } = mapFindings({ ...writers(), gapNote: undefined }, inputs());
      expect(failures.map((f) => f.message)).toEqual([expect.stringMatching(/^Players in no beat: Kai\. /)]);
    });

    it('a beat in leftOut places no one', () => {
      const map = writers();
      map.leftOut.push(map.sections[0].beats.splice(0, 1)[0]);
      expect(mapFindings(map, inputs()).failures.map((f) => f.message)).toEqual([expect.stringMatching(/^Players in no beat: Ellis\. /)]);
    });

    it("a player the director's strike left in no beat is a concern on the strike, never a failure", () => {
      const map = writers();
      map.leftOut.push(map.sections[0].beats.splice(0, 1)[0]);
      const { failures, concerns } = mapFindings(map, inputs({ edits: directorsEdits(map) }));
      expect(failures).toEqual([]);
      expect(concerns).toEqual([{ type: 'player-not-placed', editIds: ['E1'], finding: expect.stringMatching(/Ellis is in no move/) }]);
    });
  });

  describe('photos (T13)', () => {
    it('a kept photo placed nowhere fails, listed', () => {
      const map = writers();
      map.sections[1].photos.pop();
      const { failures } = mapFindings(map, inputs());
      expect(typesOf(failures)).toEqual(['photo-not-placed']);
      expect(failures[0].message).toMatch(/^Photos placed nowhere: cards\.jpg\. /);
    });

    it('a photo placed twice fails, and so does a photo outside the photos offered, with the list of those offered', () => {
      const map = writers();
      map.sections[0].photos.push({ filename: 'theory.jpg' }, { filename: 'whiteboard.jpg' });
      const { failures } = mapFindings(map, inputs());
      expect(typesOf(failures)).toEqual(['photo-placed-twice', 'photo-not-offered']);
      expect(failures[0].message).toMatch(/^The photo theory\.jpg is placed more than once\. /);
      expect(failures[1].message).toMatch(/^The photo whiteboard\.jpg is placed, and it is not among the photos offered\. .*huddle\.jpg, theory\.jpg, cards\.jpg/);
      // Phase 4b (brief 1D): each sits beside the photo's line.
      expect(failures.map((f) => f.place)).toEqual(['sections[#lede].photos[#theory.jpg]', 'sections[#lede].photos[#whiteboard.jpg]']);
    });

    it('a photo whose moment is outside the story, placed by itself with its people, is silent; the top photo counts as placed', () => {
      const map = writers();
      expect(map.sections[1].photos[1]).toEqual({ filename: 'cards.jpg' });
      expect(mapFindings(map, inputs()).failures).toEqual([]);
      const noTop = { ...writers(), topPhoto: undefined };
      noTop.sections[0].photos.push({ filename: 'huddle.jpg' });
      expect(mapFindings(noTop, inputs()).failures).toEqual([]);
    });

    it('matches a filename in any case', () => {
      const map = writers();
      map.sections[1].photos[1] = { filename: 'CARDS.JPG' };
      expect(mapFindings(map, inputs()).failures).toEqual([]);
    });

    it('a photo the director placed outside the photos offered is a concern on their edit', () => {
      const map = writers();
      map.sections[0].photos.push({ filename: 'whiteboard.jpg' });
      const { failures, concerns } = mapFindings(map, inputs({ edits: directorsEdits(map) }));
      expect(failures).toEqual([]);
      expect(concerns).toEqual([{ type: 'photo-not-offered', editIds: ['E1'], finding: expect.stringMatching(/whiteboard\.jpg/) }]);
    });
  });

  describe('cards (C9)', () => {
    // Fix round 2: the rework reads the bad source and is pointed at <RECORD>, never handed the
    // record's ids (over 100 on a real session).
    it('a card whose flagged piece names no document in the record fails, beside its beat, naming the bad source and pointing at <RECORD>', () => {
      const map = writers();
      markCard(map.sections[1].beats[0], 'zzz999');
      // Fix round 4: the card check reads the record through the evidence context, so the evidence
      // check reads the piece too, and fails it for its source.
      const all = mapFindings(map, inputs()).failures;
      expect(typesOf(all)).toEqual(['evidence-not-in-record', 'card-not-in-record']);
      const failures = all.filter((f) => f.type === 'card-not-in-record');
      expect(failures[0].message).toBe(
        "Beat b3's card piece names \"zzz999\", which is no document in <RECORD>. A card prints a document from <RECORD>, never the ledger, the evidence log or the notes: choose in <RECORD> the document the card prints, and flag the piece that names it by its id."
      );
      expect(failures[0].message).not.toMatch(/row00\d/);
      expect(failures[0].place).toBe('sections[#theStory].beats[#b3]');
    });

    it('fewer than three cards or more than five fail; a card id matches in any case', () => {
      const two = writers();
      clearCard(two.sections[1].beats[3]);
      expect(mapFindings(two, inputs()).failures.map((f) => [f.type, f.message])).toEqual([
        ['card-count', expect.stringMatching(/^The map carries 2 cards\. /)]
      ]);
      const one = clone(two);
      clearCard(one.sections[1].beats[2]);
      expect(mapFindings(one, inputs()).failures.map((f) => f.message)).toEqual([expect.stringMatching(/^The map carries 1 card\. /)]);
      const six = writers();
      markCard(six.sections[0].beats[0], 'ROW004');
      markCard(six.sections[0].beats[1], 'row004');
      markCard(six.sections[1].beats[1], 'row001');
      expect(typesOf(mapFindings(six, inputs()).failures)).toEqual(['card-count']);
    });

    it("a card the director's strike took off the map is a concern on the strike", () => {
      const map = writers();
      map.leftOut.push(map.sections[1].beats.splice(3, 1)[0]);
      const { failures, concerns } = mapFindings(map, inputs({ edits: directorsEdits(map) }));
      expect(failures).toEqual([]);
      expect(concerns).toEqual([{ type: 'card-count', editIds: ['E1'], finding: expect.stringMatching(/2 cards/) }]);
    });
  });

  describe("the weave's connections (spec 5.4)", () => {
    it('a live connection of the settled weave that lands in no beat fails, listed; one in a left-out beat lands nowhere', () => {
      const { failures } = mapFindings(writers(), inputs({ connections: ['c1', 'c2'] }));
      expect(typesOf(failures)).toEqual(['connection-not-landed']);
      expect(failures[0].message).toMatch(/^Connections from the settled weave that land in no beat: c2\. /);
      const map = writers();
      map.leftOut[0].connection = 'c2';
      expect(typesOf(mapFindings(map, inputs({ connections: ['c1', 'c2'] })).failures)).toEqual(['connection-not-landed']);
    });

    it("a connection whose beat the director struck is a concern on the strike", () => {
      const map = writers();
      map.leftOut.push(map.sections[0].beats.splice(1, 1)[0]);
      const { failures, concerns } = mapFindings(map, inputs({ edits: directorsEdits(map) }));
      expect(failures).toEqual([]);
      expect(concerns.map((c) => c.type)).toEqual(['connection-not-landed']);
    });
  });

  describe('changes to the weave (spec 4.4)', () => {
    it("each change names a meeting edit's id or the meeting's note", () => {
      const map = { ...writers(), weaveChanges: [{ source: 'E1', change: 'The JessKane thread now grounds the story.' }, { source: 'note', change: 'Patchwork joins the closing.' }] };
      expect(mapFindings(map, inputs({ meetingEdits: ['E1'], meetingNote: true })).failures).toEqual([]);
      const { failures } = mapFindings(map, inputs({ meetingEdits: ['E2'], meetingNote: true }));
      expect(typesOf(failures)).toEqual(['weave-change-source']);
      expect(failures[0].message).toMatch(/E1/);
      expect(failures[0].message).toMatch(/E2/);
    });

    it('lists none when the director changed nothing at the meeting and left no note', () => {
      const map = { ...writers(), weaveChanges: [{ source: 'note', change: 'A change no one asked for.' }] };
      const { failures } = mapFindings(map, inputs());
      expect(typesOf(failures)).toEqual(['weave-change-unasked']);
    });
  });

  it('two beats under one id fail beside the first of them: the edits find a beat by its id', () => {
    const map = writers();
    map.leftOut[0].id = 'b4';
    const { failures } = mapFindings(map, inputs());
    expect(typesOf(failures)).toEqual(['duplicate-beat-id']);
    expect(failures[0]).toMatchObject({ place: 'sections[#theStory].beats[#b4]' });
    expect(failures[0].line).not.toMatch(/\bb4\b/);
  });

  // Fix F3: the check rework reads this message beside C5's "Every beat keeps its id"
  // (node-helpers.js buildRevisionContext), so the message says which beat keeps the id: the one
  // the director's edits find by it, else the first; the others take new ids. Each beat is named
  // by its move and its place, since a pass's copy of a beat shares its move.
  describe("fix F3: the repeat's message says which beat keeps the id", () => {
    const messageOf = (map, over) => mapFindings(map, inputs(over)).failures.find((f) => f.type === 'duplicate-beat-id').message;
    const NEW_ID = 'a new id that no other beat, in the sections or in leftOut, carries.';

    it('with no edit of the director\'s on the id, the first beat keeps it', () => {
      const map = writers();
      map.leftOut[0].id = 'b4';
      expect(messageOf(map)).toBe(`Beats sharing the id b4: "The first vote, six to four" and "Kai at the coat check". Keep b4 on the first, "The first vote, six to four" (in section "theStory"), and give "Kai at the coat check" (in leftOut) ${NEW_ID}`);
    });

    it("the beat whose move the director rewrote keeps the id, though a rework wrote another beat under it earlier on the map", () => {
      const left = writers();
      left.sections[1].beats[1].move = 'The first vote goes six to four';
      const standing = standingOnMap(null, writers(), left);
      const pass = clone(left);
      pass.sections[0].beats.push(move('b4', 'scene', 'A second beat under b4', ['Ellis']));
      pass.leftOut.push(move('b4', 'scene', 'A third beat under b4', ['Kai']));
      expect(messageOf(pass, { edits: carriedEdits(standing, pass) })).toBe('Beats sharing the id b4: "A second beat under b4", "The first vote goes six to four" and "A third beat under b4". '
        + `Keep b4 on "The first vote goes six to four" (in section "theStory"), the beat the director's edits find by that id, and give "A second beat under b4" (in section "lede") and "A third beat under b4" (in leftOut) each ${NEW_ID}`);
    });

    it('when the director\'s edit finds two of the beats, the first keeps the id', () => {
      const left = writers();
      left.sections[1].beats[1].move = 'The first vote goes six to four';
      const standing = standingOnMap(null, writers(), left);
      const pass = clone(left);
      pass.leftOut.push(clone(pass.sections[1].beats[1]));
      expect(messageOf(pass, { edits: carriedEdits(standing, pass) })).toBe('Beats sharing the id b4: "The first vote goes six to four" and "The first vote goes six to four". '
        + `Keep b4 on the first, "The first vote goes six to four" (in section "theStory"), and give "The first vote goes six to four" (in leftOut) ${NEW_ID}`);
    });

    // Fix F, second round: an edit of a beat's place stands, but the map carries it only while the
    // beat sits there and nowhere else, so a repeat leaves it uncarried. The keeper reads the
    // director's standing edits, and the place edit finds the beat that sits where they put it: a
    // copy a pass left in another place is the pass's (fix round 1).
    describe("the director's edit of the beat's place finds it, carried or not", () => {
      const EditLogic = require('../../console/outline-edit-logic');
      const keepingOf = (pass, standing) => messageOf(pass, { edits: carriedEdits(standing, pass), standingEdits: standing.edits });

      it('a move: the director moved the opening beat into The Story, and a send-back\'s rework wrote another beat under its id in the lede; the director\'s beat keeps the id', () => {
        const left = EditLogic.moveBeat(writers(), 'b1', 'theStory');
        const standing = standingOnMap(null, writers(), left);
        expect(standing.edits.map((e) => [e.id, e.from])).toEqual([['E1', 'lede']]);
        const pass = clone(left);
        pass.sections[0].beats.unshift(move('b1', 'scene', 'A new beat under b1', ['Ellis']));
        expect(carriedEdits(standing, pass)).toEqual([]);
        expect(keepingOf(pass, standing)).toBe('Beats sharing the id b1: "A new beat under b1" and "The scoreboard goes up on the screen". '
          + `Keep b1 on "The scoreboard goes up on the screen" (in section "theStory"), the beat the director's edits find by that id, and give "A new beat under b1" (in section "lede") ${NEW_ID}`);
      });

      it('a strike: the director struck the first vote, and a send-back\'s rework wrote it back into The Story; the struck beat keeps the id', () => {
        const left = EditLogic.strikeBeat(writers(), 'b4');
        const standing = standingOnMap(null, writers(), left);
        expect(standing.edits.map((e) => [e.id, e.struck])).toEqual([['E1', true]]);
        const pass = clone(left);
        pass.sections[1].beats.splice(1, 0, move('b4', 'scene', 'The first vote, told again', ['Mira', 'Vale']));
        expect(carriedEdits(standing, pass)).toEqual([]);
        expect(keepingOf(pass, standing)).toBe('Beats sharing the id b4: "The first vote, told again" and "The first vote, six to four". '
          + `Keep b4 on "The first vote, six to four" (in leftOut), the beat the director's edits find by that id, and give "The first vote, told again" (in section "theStory") ${NEW_ID}`);
      });

      it("a bring-back, through the check node: the rework reads the message naming the beat the director brought back, from the standing edits in state", () => {
        const { boardMap, boardMapState } = require('./fixtures/board-map');
        const { _testing: { checkMap } } = require('../workflow/nodes/map-nodes');
        const left = EditLogic.bringBackBeat(boardMap(), 'b17', 'closing');
        const standing = standingOnMap(null, boardMap(), left);
        expect(standing.edits.map((e) => [e.id, e.from])).toEqual([['E1', 'leftOut']]);
        const pass = clone(left);
        pass.sections[0].beats.unshift({ ...clone(pass.sections[4].beats[2]), move: 'A new beat under b17', synopsis: 'A new beat, and the room moves on.' });
        const { validationResults } = checkMap(boardMapState({ outline: pass, _outlineHandEdits: standing }));
        expect(validationResults.structuralIssues.filter((m) => m.startsWith('Beats sharing'))).toEqual([
          'Beats sharing the id b17: "A new beat under b17" and "The other suspects let go". '
            + `Keep b17 on "The other suspects let go" (in section "closing"), the beat the director's edits find by that id, and give "A new beat under b17" (in section "lede") ${NEW_ID}`
        ]);
      });

      // Fix F3, finished: the keeper is the one beat the director's edits find. An edit that finds
      // more than one beat, such as a line of theirs a pass copied onto its own beat, names none.
      // Fix G1: here the line finds both beats, theirs and the pass's copy holding their words, so
      // the lines name no beat, and the edit of the beat's place decides.
      it('a move and a rewrite: a send-back\'s rework put a copy of the director\'s beat, their words and all, back where it sat; the beat they moved keeps the id', () => {
        const left = EditLogic.moveBeat(writers(), 'b1', 'theStory');
        left.sections[1].beats.find((beat) => beat.id === 'b1').move = 'The scoreboard lights the room';
        const standing = standingOnMap(null, writers(), left);
        expect(standing.edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].beats[#b1]'], ['E2', 'sections[#theStory].beats[#b1].move']]);
        const pass = clone(left);
        pass.sections[0].beats.unshift(clone(left.sections[1].beats.find((beat) => beat.id === 'b1')));
        expect(carriedEdits(standing, pass).map((e) => e.id)).toEqual(['E2']);
        expect(keepingOf(pass, standing)).toBe('Beats sharing the id b1: "The scoreboard lights the room" and "The scoreboard lights the room". '
          + `Keep b1 on "The scoreboard lights the room" (in section "theStory"), the beat the director's edits find by that id, and give "The scoreboard lights the room" (in section "lede") ${NEW_ID}`);
      });

      // Fix F, third round: the order of a column (R3) finds a beat by its id in a place without
      // being addressed to the beat: the beat under the id that sits in that column, the copy
      // restoreMapOrder keeps. Fix G1 takes the photo out of the keeper: a photo the director set
      // beside a move finds no beat, since a photo move's `after.beat` is not refreshed after the
      // director's later changes and can name the wrong beat. Each through the check node, from the
      // standing edits in state, as the rework reads it.
      describe('the order of a column finds the beat by its id; a photo beside it finds none', () => {
        const { boardMap, boardMapState } = require('./fixtures/board-map');
        const { _testing: { checkMap } } = require('../workflow/nodes/map-nodes');
        const repeatsOf = (pass, standing) => checkMap(boardMapState({ outline: pass, _outlineHandEdits: standing }))
          .validationResults.structuralIssues.filter((m) => m.startsWith('Beats sharing'));
        /** The pass's output: a send-back's rework that wrote another beat under the id at the head of the lede. */
        const repeatInLede = (left, slot, id) => {
          const pass = clone(left);
          const theirs = pass.sections.find((s) => s.slot === slot).beats.find((beat) => beat.id === id);
          pass.sections[0].beats.unshift({ ...clone(theirs), move: `A new beat under ${id}`, synopsis: 'A new beat, and the room moves on.' });
          return pass;
        };

        it("the column's order: the director put a move at the head of The Story; the beat The Story holds under its id keeps it", () => {
          const left = EditLogic.moveBeat(boardMap(), 'b6', 'theStory', 0);
          const standing = standingOnMap(null, boardMap(), left);
          expect(standing.edits.map((e) => [e.id, e.order])).toEqual([['E1', true]]);
          const pass = repeatInLede(left, 'theStory', 'b6');
          expect(carriedEdits(standing, pass)).toEqual([]);
          expect(repeatsOf(pass, standing)).toEqual([
            'Beats sharing the id b6: "A new beat under b6" and "Quinn tells the room another story". '
              + `Keep b6 on "Quinn tells the room another story" (in section "theStory"), the beat the director's edits find by that id, and give "A new beat under b6" (in section "lede") ${NEW_ID}`
          ]);
        });

        // Fix G1 rewrote these two from "the beat beside it keeps the id": the photo is no longer
        // the keeper's, so with no line or place edit on the id, the first keeps it.
        it('a photo set beside a move: the director dropped a photo on a move in The Story; the photo finds no beat, and the first keeps the id', () => {
          const left = EditLogic.placePhotoBeside(boardMap(), 'followTheMoney', 0, 'theStory', 'b5');
          const standing = standingOnMap(null, boardMap(), left);
          expect(standing.edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].photos[#p06.jpg]'], ['E2', 'sections[#theStory].photos[#p06.jpg].beat']]);
          const pass = repeatInLede(left, 'theStory', 'b5');
          expect(repeatsOf(pass, standing)).toEqual([
            'Beats sharing the id b5: "A new beat under b5" and "Jess warns Sarah away". '
              + `Keep b5 on the first, "A new beat under b5" (in section "lede"), and give "Jess warns Sarah away" (in section "theStory") ${NEW_ID}`
          ]);
        });

        it("the top photo set beside a move: the photo's move is its one edit, which finds no beat, and the first keeps the id", () => {
          const left = EditLogic.placePhotoBeside(boardMap(), 'topPhoto', 0, 'theStory', 'b5');
          const standing = standingOnMap(null, boardMap(), left);
          expect(standing.edits.map((e) => [e.id, e.from, e.after])).toEqual([['E1', 'topPhoto', { filename: 'p01.jpg', beat: 'b5' }]]);
          const pass = repeatInLede(left, 'theStory', 'b5');
          expect(repeatsOf(pass, standing)).toEqual([
            'Beats sharing the id b5: "A new beat under b5" and "Jess warns Sarah away". '
              + `Keep b5 on the first, "A new beat under b5" (in section "lede"), and give "Jess warns Sarah away" (in section "theStory") ${NEW_ID}`
          ]);
        });
      });
    });

    // Fix G1: one rule for the keeper, in this order. A line: the beat the director's standing
    // line edits (a move's title, summary or people) find, when they find exactly one, since a line
    // goes back by id after the check rework, so the id must stay on the beat holding their words.
    // A place: otherwise the beat their edits of a beat's place (a move between sections, a
    // strike, a bring-back) or a column's order find, when they find exactly one. The first:
    // otherwise the first beat with the id in the map's order. Each through the check node, from
    // the standing edits in state, after a send-back's rework that left another beat under the id.
    describe('fix G1: a line, then a place, then the first', () => {
      const EditLogic = require('../../console/outline-edit-logic');
      const { boardMap, boardMapState } = require('./fixtures/board-map');
      const { _testing: { checkMap } } = require('../workflow/nodes/map-nodes');
      const repeatsOf = (pass, standing) => checkMap(boardMapState({ outline: pass, _outlineHandEdits: standing }))
        .validationResults.structuralIssues.filter((m) => m.startsWith('Beats sharing'));
      const sectionOf = (map, slot) => map.sections.find((s) => s.slot === slot);
      const beatOf = (map, slot, id) => sectionOf(map, slot).beats.find((beat) => beat.id === id);
      /** Takes the beat under `id` out of `slot` and returns it. */
      const takeOut = (map, slot, id) => {
        const beats = sectionOf(map, slot).beats;
        return beats.splice(beats.findIndex((beat) => beat.id === id), 1)[0];
      };
      /** A beat the rework wrote under the id, in its own words. */
      const newBeat = (theirs, id) => ({ ...clone(theirs), move: `A new beat under ${id}`, synopsis: 'A new beat, and the room moves on.', players: ['Alex'] });

      it("a line decides over the order of a column: the rework moved the director's rewritten move into The Successors and wrote another at the head of The Story; theirs keeps the id", () => {
        const left = EditLogic.moveBeat(boardMap(), 'b6', 'theStory', 0);
        beatOf(left, 'theStory', 'b6').move = 'Quinn says it again';
        const standing = standingOnMap(null, boardMap(), left);
        expect(standing.edits.map((e) => [e.id, e.path, Boolean(e.order)])).toEqual([
          ['E1', 'sections[#theStory].beats[#b6].move', false], ['E2', 'sections[#theStory].beats', true]
        ]);
        const pass = clone(left);
        const theirs = takeOut(pass, 'theStory', 'b6');
        sectionOf(pass, 'thePlayers').beats.push(theirs);
        sectionOf(pass, 'theStory').beats.unshift(newBeat(theirs, 'b6'));
        expect(repeatsOf(pass, standing)).toEqual([
          'Beats sharing the id b6: "A new beat under b6" and "Quinn says it again". '
            + `Keep b6 on "Quinn says it again" (in section "thePlayers"), the beat the director's edits find by that id, and give "A new beat under b6" (in section "theStory") ${NEW_ID}`
        ]);
      });

      it.each([
        ['summary', 'synopsis', 'The first memories go before the room has a theory.'],
        ['people', 'players', ['Kai', 'Remi']]
      ])("a line decides over the move's own move edit, its %s: the rework put the director's move back where it sat and wrote another in the section they moved it to; theirs keeps the id", (_words, field, value) => {
        const left = EditLogic.moveBeat(boardMap(), 'b9', 'lede');
        beatOf(left, 'lede', 'b9')[field] = value;
        const standing = standingOnMap(null, boardMap(), left);
        expect(standing.edits.map((e) => [e.id, e.path, e.from || null])).toEqual([
          ['E1', 'sections[#lede].beats[#b9]', 'followTheMoney'], ['E2', `sections[#lede].beats[#b9].${field}`, null]
        ]);
        const pass = clone(left);
        const theirs = takeOut(pass, 'lede', 'b9');
        sectionOf(pass, 'followTheMoney').beats.unshift(theirs);
        sectionOf(pass, 'lede').beats.push(newBeat(theirs, 'b9'));
        expect(repeatsOf(pass, standing)).toEqual([
          'Beats sharing the id b9: "A new beat under b9" and "The first memories go early". '
            + `Keep b9 on "The first memories go early" (in section "followTheMoney"), the beat the director's edits find by that id, and give "A new beat under b9" (in section "lede") ${NEW_ID}`
        ]);
      });

      it("a place decides when no line edit finds a beat: the rework rewrote the director's summary and wrote another move under its id in the lede; the beat their order puts at the head of The Story keeps the id", () => {
        const left = EditLogic.moveBeat(boardMap(), 'b6', 'theStory', 0);
        beatOf(left, 'theStory', 'b6').synopsis = 'Quinn leaves the dose out, and the room lets it pass.';
        const standing = standingOnMap(null, boardMap(), left);
        expect(standing.edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].beats[#b6].synopsis'], ['E2', 'sections[#theStory].beats']]);
        const pass = clone(left);
        beatOf(pass, 'theStory', 'b6').synopsis = "Quinn's account skips the dose.";
        sectionOf(pass, 'lede').beats.unshift(newBeat(beatOf(pass, 'theStory', 'b6'), 'b6'));
        expect(repeatsOf(pass, standing)).toEqual([
          'Beats sharing the id b6: "A new beat under b6" and "Quinn tells the room another story". '
            + `Keep b6 on "Quinn tells the room another story" (in section "theStory"), the beat the director's edits find by that id, and give "A new beat under b6" (in section "lede") ${NEW_ID}`
        ]);
      });

      it("the first keeps the id when neither does: the rework rewrote the director's title, and their photo beside the move finds no beat", () => {
        const left = EditLogic.placePhotoBeside(boardMap(), 'followTheMoney', 0, 'theStory', 'b5');
        beatOf(left, 'theStory', 'b5').move = 'Jess warns Sarah off the batch';
        const standing = standingOnMap(null, boardMap(), left);
        expect(standing.edits.map((e) => e.path)).toEqual([
          'sections[#theStory].beats[#b5].move', 'sections[#theStory].photos[#p06.jpg]', 'sections[#theStory].photos[#p06.jpg].beat'
        ]);
        const pass = clone(left);
        beatOf(pass, 'theStory', 'b5').move = 'Jess keeps Sarah clear';
        sectionOf(pass, 'lede').beats.unshift(newBeat(beatOf(pass, 'theStory', 'b5'), 'b5'));
        expect(repeatsOf(pass, standing)).toEqual([
          'Beats sharing the id b5: "A new beat under b5" and "Jess keeps Sarah clear". '
            + `Keep b5 on the first, "A new beat under b5" (in section "lede"), and give "Jess keeps Sarah clear" (in section "theStory") ${NEW_ID}`
        ]);
      });
    });
  });

  it('a value that is no map is one failure', () => {
    expect(mapFindings(null, inputs()).failures.map((f) => f.type)).toEqual(['no-map']);
  });

  // Fix round 1, finding 1: a copy of the director's beat or photo that a pass put in a
  // second place is the pass's, so the check never files it against the director's edit,
  // and after an automatic pass code has already taken it out.
  describe("fix round 1: a copy a pass put in a second place is the pass's", () => {
    const { settleEdits } = require('../hand-edit-diff');

    it('a struck beat a pass copies back into the story repeats an id as the writer\'s failure; struck again by code, the map passes', () => {
      const struck = writers();
      struck.leftOut.push(struck.sections[1].beats.splice(1, 1)[0]);
      const standing = standingOnMap(null, writers(), struck);
      const pass = clone(struck);
      pass.sections[1].beats.splice(1, 0, clone(pass.leftOut[1]));

      const asPassed = mapFindings(pass, inputs({ edits: carriedEdits(standing, pass) }));
      expect(typesOf(asPassed.failures)).toEqual(['duplicate-beat-id']);
      expect(asPassed.concerns).toEqual([]);

      const { output } = settleEdits(null, { edits: carriedEdits(standing, struck), before: struck, after: pass, pass: 1 });
      expect(output.leftOut.map((b) => b.id)).toEqual(['b9', 'b4']);
      expect(mapFindings(output, inputs({ edits: carriedEdits(standing, output) }))).toEqual({ failures: [], concerns: [] });
    });

    it("a photo the director moved, which a pass also places in another section, is placed twice by the writer, never by the director's move; code takes the copy out", () => {
      const moved = writers();
      moved.sections[0].photos.push(moved.sections[1].photos.pop());
      const standing = standingOnMap(null, writers(), moved);
      const pass = clone(moved);
      pass.sections[1].photos.push({ filename: 'cards.jpg' });

      const asPassed = mapFindings(pass, inputs({ edits: carriedEdits(standing, pass) }));
      expect(typesOf(asPassed.failures)).toEqual(['photo-placed-twice']);
      expect(asPassed.failures[0].message).toMatch(/^The photo cards\.jpg is placed more than once\. /);
      expect(asPassed.concerns).toEqual([]);

      const { output } = settleEdits(null, { edits: carriedEdits(standing, moved), before: moved, after: pass, pass: 1 });
      expect(output.sections.map((s) => s.photos.map((p) => p.filename))).toEqual([['cards.jpg'], ['theory.jpg']]);
      expect(mapFindings(output, inputs({ edits: carriedEdits(standing, output) }))).toEqual({ failures: [], concerns: [] });
    });
  });

  // Fix round 1, finding 2: the checks, Everyone and the counts, and the director's edits
  // read a photo by one join key (lib/prompt-renderers/director-words-renderer.js photoKey),
  // and the check's card count is the tally's.
  describe('fix round 1: one photo key and one card count', () => {
    const { mapTally } = require('../../console/outline-edit-logic');
    const { photoKey } = require('../prompt-renderers/director-words-renderer');

    it('a filename with a space before it is not the photo: the checks, the tally and the edits agree', () => {
      expect(photoKey(' cards.jpg')).not.toBe(photoKey('cards.jpg'));
      const padded = writers();
      padded.sections[1].photos[1] = { filename: ' cards.jpg' };
      const { failures } = mapFindings(padded, inputs());
      expect(failures.map((f) => [f.type, f.message])).toEqual([
        ['photo-not-placed', expect.stringMatching(/^Photos placed nowhere: cards\.jpg\. /)],
        ['photo-not-offered', expect.stringMatching(/^The photo  cards\.jpg is placed, and it is not among the photos offered\. /)]
      ]);
      expect(mapTally(padded, { roster: ROSTER, keptPhotos: inputs().keptPhotos }).photos).toEqual({ placed: 2, of: 3 });

      const moved = writers();
      moved.sections[0].photos.push(moved.sections[1].photos.pop());
      const edits = carriedEdits(standingOnMap(null, writers(), moved), moved);
      expect(edits.map((e) => e.path)).toEqual(['sections[#lede].photos[#cards.jpg]']);
      const paddedMove = clone(moved);
      paddedMove.sections[0].photos[0] = { filename: ' cards.jpg' };
      expect(carriedEdits(edits, paddedMove)).toEqual([]);
    });

    it("the check's card count is the tally's: a card whose flagged piece names a blank source is no card in either", () => {
      const blank = writers();
      clearCard(blank.sections[1].beats[3]);
      markCard(blank.sections[0].beats[0], '  ');
      const four = writers();
      markCard(four.sections[0].beats[1], 'row004');
      [writers(), blank, four].forEach((map) => {
        const { cards } = mapTally(map, { roster: ROSTER, keptPhotos: inputs().keptPhotos });
        const lines = mapFindings(map, inputs()).failures.filter((f) => f.type === 'card-count').map((f) => f.message);
        expect(lines).toEqual(cards >= 3 && cards <= 5 ? [] : [expect.stringContaining(`The map carries ${cards} cards.`)]);
      });
      expect(mapTally(blank, { roster: ROSTER }).cards).toBe(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6: the map's schemas, the writer's and the director-side one (R12)
// ═══════════════════════════════════════════════════════════════════════════
describe("4.6: the map's schemas", () => {
  const Ajv = require('ajv');
  const outlineSchema = require('../schemas/outline.schema.json');
  const contentBundleSchema = require('../schemas/content-bundle.schema.json');
  const { HEADLINE_LIMITS } = require('../../console/article-desk-logic');
  const { mapSlotsOf } = require('../theme-config');
  const { mapSchemaFor, directorMapSchemaFor, directorMapProblems } = require('../map');
  const { MAP } = require('./fixtures/rework-state');

  it("the headline and the deck state the content bundle's limits, one constant (HEADLINE_LIMITS)", () => {
    const { headline, deck } = outlineSchema.properties;
    expect([headline.minLength, headline.maxLength, deck.maxLength])
      .toEqual([HEADLINE_LIMITS.main.min, HEADLINE_LIMITS.main.max, HEADLINE_LIMITS.deck.max]);
    const bundle = contentBundleSchema.properties.headline.properties;
    expect([bundle.main.minLength, bundle.main.maxLength, bundle.deck.maxLength])
      .toEqual([headline.minLength, headline.maxLength, deck.maxLength]);
  });

  it("a section's slot and a dropped slot are the theme's, in its order, and the stored schema names no theme", () => {
    const schema = mapSchemaFor('journalist');
    const keys = mapSlotsOf('journalist').map((slot) => slot.key);
    expect(schema.properties.sections.items.properties.slot.enum).toEqual(keys);
    expect(schema.properties.dropped.items.properties.slot.enum).toEqual(keys);
    expect(outlineSchema.properties.sections.items.properties.slot).not.toHaveProperty('enum');
    expect(outlineSchema.properties.dropped.items.properties.slot).not.toHaveProperty('enum');
    // Built once per theme, so the SDK guardrail's memo and ajv compile it once.
    expect(mapSchemaFor('journalist')).toBe(schema);
  });

  it("a beat's kinds are MAP_BEAT_KINDS, and a left-out item has the beat's shape, so one brought back is whole", () => {
    const beat = outlineSchema.properties.sections.items.properties.beats.items;
    expect(beat.properties.kind.enum).toEqual([...MAP_BEAT_KINDS]);
    expect(outlineSchema.properties.leftOut.items).toEqual(beat);
  });

  it('the writer\'s schema holds no format keyword, no $ref and no questions', () => {
    const text = JSON.stringify(mapSchemaFor('journalist'));
    expect(text).not.toMatch(/"format"/);
    expect(text).not.toContain('$ref');
    expect(text).not.toContain('writerQuestions');
  });

  it("the director-side schema is the writer's, derived in code, with a beat needing only its id and its move", () => {
    const writer = mapSchemaFor('journalist');
    const director = directorMapSchemaFor('journalist');
    // Piece 4 (brief 4B; R1): the writer's beat requires its synopsis, and the director's does not.
    expect(writer.properties.sections.items.properties.beats.items.required).toEqual(['id', 'move', 'players', 'synopsis', 'threads', 'evidence']);
    expect(director.properties.sections.items.properties.beats.items.required).toEqual(['id', 'move']);
    expect(director.properties.leftOut.items.required).toEqual(['id', 'move']);
    const withoutBeatRules = (schema) => {
      const copy = clone(schema);
      delete copy.properties.sections.items.properties.beats.items.required;
      delete copy.properties.leftOut.items.required;
      return copy;
    };
    expect(withoutBeatRules(director)).toEqual(withoutBeatRules(writer));
    expect(directorMapSchemaFor('journalist')).toBe(director);
  });

  it("a map the writer's schema takes, the director's takes; a beat the director added with only its id and move, only the director's", () => {
    const writerTakes = new Ajv({ allErrors: true, strict: true }).compile(mapSchemaFor('journalist'));
    expect(writerTakes(clone(MAP))).toBe(true);
    expect(directorMapProblems(clone(MAP), { theme: 'journalist' })).toBeNull();
    const added = clone(MAP);
    added.sections[0].beats.push({ id: 'b11', move: 'Alex at the window' });
    expect(writerTakes(added)).toBe(false);
    expect(directorMapProblems(added, { theme: 'journalist' })).toBeNull();
  });

  it('a theme with no map slots has no map: the parked detective (R1)', () => {
    expect(mapSlotsOf('detective')).toEqual([]);
    expect(() => mapSchemaFor('detective')).toThrow('The "detective" theme has no story map');
    expect(() => directorMapSchemaFor('detective')).toThrow('The "detective" theme has no story map');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6b: the card count is the director's only when their edits change it
// ═══════════════════════════════════════════════════════════════════════════
//
// A count that fails is the director's concern only when their edits change how many card
// beats the sections hold: a card beat added, brought back, struck or cut, or a card marker added
// to a beat or cleared from one. A change of which document a card prints is the writer's
// evidence and no edit (phase 4b, brief 1D; R6), and a card beat moved between sections
// leaves the count as the writer made it, so a count
// that fails then is the writer's, and the round's check rework fixes it (R11).
describe("4.6b: the card count is the director's only when their edits change it", () => {
  /** The director's standing edits on `left`, made against the writer's `base`. */
  const editsAgainst = (base, left) => carriedEdits(standingOnMap(null, base, left), left);
  /** The writer's map with five cards: b1 and b4 carry one too. */
  const fiveCards = () => {
    const map = writers();
    markCard(map.sections[0].beats[0], 'row004');
    markCard(map.sections[1].beats[1], 'row002');
    return map;
  };
  /** The writer's map with six cards, one over the count: b2 carries one too. */
  const sixCards = () => {
    const map = fiveCards();
    markCard(map.sections[0].beats[1], 'row001');
    return map;
  };
  const cardCount = (findings) => ({
    failures: findings.failures.filter((f) => f.type === 'card-count').map((f) => f.message),
    concerns: findings.concerns.filter((c) => c.type === 'card-count')
  });

  it("a change of which document a card prints is the writer's evidence and no edit: the count stays the writer's, a failure, and no concern", () => {
    const base = sixCards();
    const left = clone(base);
    markCard(left.sections[1].beats[0], 'row004');
    const edits = editsAgainst(base, left);
    expect(edits).toEqual([]);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 6 cards\. Mark 3 to 5 beats as cards/)],
      concerns: []
    });
  });

  it("an edit that strikes a card beat makes the count the director's: a concern on the strike, and no failure", () => {
    const base = writers();
    const left = clone(base);
    left.leftOut.push(left.sections[1].beats.splice(3, 1)[0]);
    const edits = editsAgainst(base, left);
    expect(edits.map((e) => [e.id, e.path, e.struck])).toEqual([['E1', 'leftOut[#b6]', true]]);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [],
      concerns: [{ type: 'card-count', editIds: ['E1'], finding: 'The map carries 2 cards; the article carries 3 to 5.' }]
    });
  });

  const broughtBackBase = () => {
    const map = fiveCards();
    markCard(map.leftOut[0], 'row004');
    return map;
  };
  it.each([
    ['a card beat cut', writers, (map) => { map.sections[1].beats.splice(3, 1); }, 2],
    ['a card marker cleared from a beat', writers, (map) => { delete map.sections[1].beats[3].card; }, 2],
    ['a card marked on a beat', fiveCards, (map) => { markCard(map.sections[0].beats[1], 'row003'); }, 6],
    ['a card beat added', fiveCards, (map) => { map.sections[1].beats.push({ id: 'b10', move: 'The receipt', ...cardOf('row004') }); }, 6],
    ['a card beat brought back from left out', broughtBackBase, (map) => { map.sections[0].beats.push(map.leftOut.splice(0, 1)[0]); }, 6]
  ])("%s makes the count the director's: a concern on that edit", (_name, baseOf, change, cards) => {
    const base = baseOf();
    const left = clone(base);
    change(left);
    const edits = editsAgainst(base, left);
    expect(edits).toHaveLength(1);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [],
      concerns: [{ type: 'card-count', editIds: [edits[0].id], finding: `The map carries ${cards} cards; the article carries 3 to 5.` }]
    });
  });

  it("a card beat moved to another section leaves the count the writer's: a failure, and no concern", () => {
    const base = sixCards();
    const left = clone(base);
    left.sections[0].beats.push(left.sections[1].beats.splice(0, 1)[0]);
    const edits = editsAgainst(base, left);
    expect(edits.map((e) => [e.path, e.from])).toEqual([['sections[#lede].beats[#b3]', 'theStory']]);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 6 cards\. /)],
      concerns: []
    });
  });

  it('the concern names only the edits that changed the count, and a card swap beside them is no edit', () => {
    const base = writers();
    const left = clone(base);
    markCard(left.sections[1].beats[0], 'row004');
    left.leftOut.push(left.sections[1].beats.splice(3, 1)[0]);
    const edits = editsAgainst(base, left);
    expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'leftOut[#b6]']]);
    expect(cardCount(mapFindings(left, inputs({ edits }))).concerns).toEqual([
      { type: 'card-count', editIds: ['E1'], finding: 'The map carries 2 cards; the article carries 3 to 5.' }
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6b fix round 1: a failing card count is the director's only where their edits moved it
// ═══════════════════════════════════════════════════════════════════════════
//
// The director's edits own a card count that fails only when, together, they moved it the
// way it fails: a strike cannot make too many cards, and a swap of one card beat for
// another moves no count. Then the concern names only the edits that moved it that way.
// When the count without their edits fails the same way, the failure splits, as every
// check's does (R11): the writer's part fails, and theirs is a concern.
describe("4.6b fix round 1: a failing card count is the director's only where their edits moved it", () => {
  /** The director's standing edits on `left`, made against the writer's `base`. */
  const editsAgainst = (base, left) => carriedEdits(standingOnMap(null, base, left), left);
  const cardCount = (findings) => ({
    failures: findings.failures.filter((f) => f.type === 'card-count').map((f) => f.message),
    concerns: findings.concerns.filter((c) => c.type === 'card-count')
  });
  /** The writer's map with four cards: b1 carries one too. */
  const fourCards = () => {
    const map = writers();
    markCard(map.sections[0].beats[0], 'row004');
    return map;
  };
  /** The writer's map with five cards: b4 carries one too. */
  const fiveCards = () => {
    const map = fourCards();
    markCard(map.sections[1].beats[1], 'row002');
    return map;
  };
  /** The writer's map with six cards, one over the count: b2 carries one too. */
  const sixCards = () => {
    const map = fiveCards();
    markCard(map.sections[0].beats[1], 'row001');
    return map;
  };

  it("a strike, then a send-back's rework that marks three more cards: the writer's failure, and no concern", () => {
    const shown = fourCards();
    const left = clone(shown);
    left.leftOut.push(left.sections[1].beats.splice(3, 1)[0]);
    const standing = standingOnMap(null, shown, left);
    const rework = clone(left);
    markCard(rework.sections[0].beats[1], 'row002');
    markCard(rework.sections[1].beats[1], 'row003');
    rework.sections[1].beats.push(move('b10', 'receipt', 'The receipt', [], cardOf('row001')));
    const edits = carriedEdits(standing, rework);
    expect(edits.map((e) => [e.id, e.path, e.struck])).toEqual([['E1', 'leftOut[#b6]', true]]);
    expect(cardCount(mapFindings(rework, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 6 cards\. Mark 3 to 5 beats as cards/)],
      concerns: []
    });
  });

  it("a card beat struck and another brought back, then a rework that marks two more cards: the writer's failure, and no concern", () => {
    const shown = fourCards();
    markCard(shown.leftOut[0], 'row002');
    const left = clone(shown);
    left.leftOut.push(left.sections[1].beats.splice(3, 1)[0]);
    left.sections[1].beats.push(left.leftOut.splice(0, 1)[0]);
    const standing = standingOnMap(null, shown, left);
    const rework = clone(left);
    markCard(rework.sections[0].beats[1], 'row003');
    markCard(rework.sections[1].beats[1], 'row001');
    const edits = carriedEdits(standing, rework);
    expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].beats[#b9]'], ['E2', 'leftOut[#b6]']]);
    expect(cardCount(mapFindings(rework, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 6 cards\. /)],
      concerns: []
    });
  });

  it("a card beat brought back, then a rework that clears two cards: too few is the writer's failure, and no concern", () => {
    const shown = writers();
    markCard(shown.leftOut[0], 'row004');
    const left = clone(shown);
    left.sections[1].beats.push(left.leftOut.splice(0, 1)[0]);
    const standing = standingOnMap(null, shown, left);
    const rework = clone(left);
    clearCard(rework.sections[1].beats[0]);
    clearCard(rework.sections[1].beats[2]);
    const edits = carriedEdits(standing, rework);
    expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].beats[#b9]']]);
    expect(cardCount(mapFindings(rework, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 2 cards\. /)],
      concerns: []
    });
  });

  it('the concern names only the edits that moved the count the way it fails, not a strike beside them', () => {
    const shown = fiveCards();
    const left = clone(shown);
    markCard(left.sections[0].beats[1], 'row003');
    left.sections[1].beats.push({ id: 'b10', move: 'The receipt', ...cardOf('row001') });
    left.leftOut.push(left.sections[1].beats.splice(3, 1)[0]);
    const edits = editsAgainst(shown, left);
    expect(edits.map((e) => [e.id, e.path])).toEqual([
      ['E1', 'sections[#lede].beats[#b2].card'], ['E2', 'sections[#theStory].beats[#b10]'], ['E3', 'leftOut[#b6]']
    ]);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [],
      concerns: [{ type: 'card-count', editIds: ['E1', 'E2'], finding: 'The map carries 6 cards; the article carries 3 to 5.' }]
    });
  });

  it("a card beat added to a map the writer already gave too many: the writer's part fails, and the director's is a concern", () => {
    const shown = sixCards();
    const left = clone(shown);
    left.sections[1].beats.push({ id: 'b10', move: 'The receipt', ...cardOf('row004') });
    const edits = editsAgainst(shown, left);
    expect(edits.map((e) => [e.id, e.path, e.from])).toEqual([['E1', 'sections[#theStory].beats[#b10]', 'none']]);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 7 cards\. Mark 3 to 5 beats as cards/)],
      concerns: [{ type: 'card-count', editIds: ['E1'], finding: 'The map carries 7 cards; the article carries 3 to 5.' }]
    });
  });

  it("a card beat struck from a map the writer already gave too few: the writer's part fails, and the director's is a concern", () => {
    const shown = writers();
    clearCard(shown.sections[1].beats[2]);
    const left = clone(shown);
    left.leftOut.push(left.sections[1].beats.splice(3, 1)[0]);
    const edits = editsAgainst(shown, left);
    expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'leftOut[#b6]']]);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 1 card\. Mark 3 to 5 beats as cards/)],
      concerns: [{ type: 'card-count', editIds: ['E1'], finding: 'The map carries 1 card; the article carries 3 to 5.' }]
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6b: the gate refuses a photo the director's changes place more than once
// ═══════════════════════════════════════════════════════════════════════════
//
// By the gate's rule for repeats: a repeat the map the stop showed holds is the writer's,
// which the checks report and a rework fixes; one it does not hold is the director's,
// refused, so their placement is never a copy no edit carries.
describe("4.6b: the gate refuses a photo the director's changes place more than once", () => {
  const { directorMapProblems } = require('../map');
  const gate = (left, shown = writers()) => directorMapProblems(left, { theme: 'journalist', shown });

  it('a top photo set to a photo a section already places is refused, naming the photo and the director', () => {
    const left = writers();
    left.topPhoto = 'cards.jpg';
    expect(gate(left)).toBe("\"cards.jpg\" is placed more than once: the director's changes made this repeat. Place each photo once: as the top photo, or in one section.");
  });

  it('a photo placed again in a second section is refused, in any case of its name, and each repeat is named as first placed', () => {
    const left = writers();
    left.sections[0].photos.push({ filename: 'THEORY.JPG' });
    left.topPhoto = 'Cards.jpg';
    expect(gate(left)).toBe("\"Cards.jpg\" and \"THEORY.JPG\" are placed more than once: the director's changes made these repeats. Place each photo once: as the top photo, or in one section.");
  });

  it("a repeat the map the stop showed holds is the writer's: the gate lets it through to the checks", () => {
    const shown = writers();
    shown.sections[0].photos.push({ filename: 'cards.jpg' });
    expect(gate(clone(shown), shown)).toBeNull();
    expect(typesOf(mapFindings(shown, inputs()).failures)).toEqual(['photo-placed-twice']);
  });

  it('a photo moved to the top from its section is placed once: accepted', () => {
    const left = writers();
    left.sections[1].photos = [{ filename: 'theory.jpg', beat: 'b4' }, { filename: 'huddle.jpg' }];
    left.topPhoto = 'cards.jpg';
    expect(gate(left)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6b fix round 1: the gate and the checks read a repeat by one rule
// ═══════════════════════════════════════════════════════════════════════════
//
// The gate lets a repeat the map the stop showed holds through to the checks, so the two
// must find the same repeats: one function decides which beat ids a map repeats, and one
// which photos it places more than once. Each lists its repeats in the map's order.
describe('4.6b fix round 1: the gate and the checks read a repeat by one rule', () => {
  const { directorMapProblems } = require('../map');
  const gate = (left) => directorMapProblems(left, { theme: 'journalist', shown: writers() });

  it("two beat ids repeated are named in the map's order by both: the gate refuses them as the director's, the check fails them as the writer's", () => {
    const map = writers();
    map.sections[0].beats.push(move('b4', 'scene', 'A second beat under b4', []));
    map.leftOut.push(move('b2', 'scene', 'A second beat under b2', []));
    expect(gate(map)).toBe("Two beats share the id \"b2\" and \"b4\": the director's changes made these repeats. Give each beat an id of its own.");
    expect(mapFindings(map, inputs()).failures.filter((f) => f.type === 'duplicate-beat-id').map((f) => f.message))
      .toEqual([expect.stringMatching(/^Beats sharing the id b2: /), expect.stringMatching(/^Beats sharing the id b4: /)]);
  });

  it("photos placed more than once, at the top and in any case of their names, are the same photos in the same order to both", () => {
    const map = writers();
    map.topPhoto = 'Cards.jpg';
    map.sections[0].photos.push({ filename: 'THEORY.JPG' });
    expect(gate(map)).toBe("\"Cards.jpg\" and \"THEORY.JPG\" are placed more than once: the director's changes made these repeats. Place each photo once: as the top photo, or in one section.");
    expect(mapFindings(map, inputs()).failures.filter((f) => f.type === 'photo-placed-twice').map((f) => f.message))
      .toEqual([expect.stringMatching(/^The photo cards\.jpg is placed more than once\. /), expect.stringMatching(/^The photo theory\.jpg is placed more than once\. /)]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6c: a card count is the director's only for the edits that changed it
// ═══════════════════════════════════════════════════════════════════════════
//
// A concern on the card count names an edit on a beat's place only when it took the beat
// into the sections or out of them, and an edit on its card marker only when it added the card or
// cleared it (the integrator's ruling 3 on the follow-ups). A beat moved between sections
// still counts where it did, so its move changed nothing the count reads.
describe("4.6c: a card count is the director's only for the edits that changed it", () => {
  /** The director's standing edits on `left`, made against the writer's `base`. */
  const editsAgainst = (base, left) => carriedEdits(standingOnMap(null, base, left), left);
  const cardCount = (findings) => ({
    failures: findings.failures.filter((f) => f.type === 'card-count').map((f) => f.message),
    concerns: findings.concerns.filter((c) => c.type === 'card-count')
  });
  /** The writer's map with five cards: b1 and b2 carry one too, and b4 none. */
  const fiveCards = () => {
    const map = writers();
    markCard(map.sections[0].beats[0], 'row004');
    markCard(map.sections[0].beats[1], 'row001');
    return map;
  };
  /** The writer's map with six cards, one over the count: b4 carries one too. */
  const sixCards = () => {
    const map = fiveCards();
    markCard(map.sections[1].beats[1], 'row003');
    return map;
  };
  /** The writer's map with two cards, one under the count: b6 carries none. */
  const twoCards = () => {
    const map = writers();
    clearCard(map.sections[1].beats[3]);
    return map;
  };
  /** A base map whose leftOut beat b9 is a card beat. */
  const withLeftOutCard = (baseOf) => () => {
    const map = baseOf();
    markCard(map.leftOut[0], 'row004');
    return map;
  };

  it.each([
    ['moved to another section and given a card', fiveCards, 'b4', (beat) => { markCard(beat, 'row004'); }, 6],
    ['moved to another section with its card marker cleared', writers, 'b5', (beat) => { delete beat.card; }, 2]
  ])('a beat %s: the concern names the card edit, and not the move', (_name, baseOf, id, onCard, cards) => {
    const base = baseOf();
    const left = clone(base);
    const story = left.sections[1];
    const beat = story.beats.splice(story.beats.findIndex((b) => b.id === id), 1)[0];
    onCard(beat);
    left.sections[0].beats.push(beat);
    const edits = editsAgainst(base, left);
    expect(edits.map((e) => [e.id, e.path, e.from || ''])).toEqual([
      ['E1', `sections[#lede].beats[#${id}]`, 'theStory'],
      ['E2', `sections[#lede].beats[#${id}].card`, '']
    ]);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [],
      concerns: [{ type: 'card-count', editIds: ['E2'], finding: `The map carries ${cards} cards; the article carries 3 to 5.` }]
    });
  });

  it('a beat brought back from left out and given a card: the concern names both, the bring-back and the card', () => {
    const base = fiveCards();
    const left = clone(base);
    const beat = left.leftOut.splice(0, 1)[0];
    markCard(beat, 'row004');
    left.sections[1].beats.push(beat);
    const edits = editsAgainst(base, left);
    expect(edits.map((e) => [e.id, e.path, e.from || ''])).toEqual([
      ['E1', 'sections[#theStory].beats[#b9]', 'leftOut'],
      ['E2', 'sections[#theStory].beats[#b9].card', '']
    ]);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [],
      concerns: [{ type: 'card-count', editIds: ['E1', 'E2'], finding: 'The map carries 6 cards; the article carries 3 to 5.' }]
    });
  });

  // The integrator's ruling 3, minor 6: a beat in leftOut counts no card, so no edit there
  // moves the count, and a count that fails is the writer's. Each row's base fails the way
  // its edit would push the count if leftOut counted: an added card over, a cleared one under.
  it.each([
    ['a card marked on a beat in leftOut', sixCards, (map) => { markCard(map.leftOut[0], 'row004'); }, [['leftOut[#b9].card', '']], 6],
    ['a card marker cleared from a beat in leftOut', withLeftOutCard(twoCards), (map) => { delete map.leftOut[0].card; }, [['leftOut[#b9].card', '']], 2],
    ['a card beat added straight into leftOut', sixCards,
      (map) => { map.leftOut.push({ id: 'b10', move: 'The receipt', ...cardOf('row004') }); }, [['leftOut[#b10]', 'none']], 6],
    ['a beat brought back with its card cleared', withLeftOutCard(twoCards),
      (map) => { const beat = map.leftOut.splice(0, 1)[0]; delete beat.card; map.sections[1].beats.push(beat); },
      [['sections[#theStory].beats[#b9]', 'leftOut'], ['sections[#theStory].beats[#b9].card', '']], 2]
  ])("%s: the count is the writer's, a failure, and no concern", (_name, baseOf, change, paths, cards) => {
    const base = baseOf();
    const left = clone(base);
    change(left);
    const edits = editsAgainst(base, left);
    expect(edits.map((e) => [e.path, e.from || ''])).toEqual(paths);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(new RegExp(`^The map carries ${cards} cards\\. Mark 3 to 5 beats as cards`))],
      concerns: []
    });
  });

  const cards = (findings) => ({
    failures: findings.failures.filter((f) => f.type === 'card-not-in-record').map((f) => f.message),
    concerns: findings.concerns.filter((c) => c.type === 'card-not-in-record').map((c) => [c.editIds, c.finding])
  });

  // Phase 15, brief D (ruling R6): no card prints a player's character sheet, so a card whose
  // flagged piece names one fails, saying so; the sheet is still in the record for evidence.
  it("a card whose flagged piece names a player's character sheet fails, naming the sheet", () => {
    const { characterSheet } = require('./fixtures/character-sheet');
    const withSheet = evidenceContextOf({
      evidenceBundle: { exposed: {
        tokens: ['row001', 'row002', 'row003', 'row004'].map((id) => ({ id, tokenId: id, fullContent: `The text of ${id}.` })),
        paperEvidence: [characterSheet()]
      } }
    });
    const map = writers();
    markCard(map.sections[1].beats[1], 'sheet-0001');
    const findings = mapFindings(map, inputs({ evidence: withSheet }));
    expect(cards(findings)).toEqual({
      failures: ["Beat b4's card piece names \"sheet-0001\", a player's character sheet, and no card prints one, as C9 (`<craft-cards>`) sets out. Choose in <RECORD> another document that tells the beat for its card, and flag the piece that names it by its id."],
      concerns: []
    });
    expect(findings.failures.find((f) => f.type === 'card-not-in-record').line)
      .toBe("The move \"The first vote, six to four\" is marked as a card, and its card's document is a player's character sheet, which no card prints.");
  });

  // Fix round 2: the evidence is never the director's edit (R6), so a flagged piece that names no
  // document in the record is the writer's failure on any beat, whichever edit put the card there.
  it("a card whose flagged piece names no document is the writer's failure on any beat: the marker given, the beat added, brought back or moved", () => {
    const notHeld = (id, source) => new RegExp(`^Beat ${id}'s card piece names "${source}", which is no document in <RECORD>\\. `);
    const given = writers();
    markCard(given.sections[1].beats[1], 'zzz001');
    expect(cards(mapFindings(given, inputs({ edits: directorsEdits(given) })))).toEqual({ failures: [expect.stringMatching(notHeld('b4', 'zzz001'))], concerns: [] });
    const added = writers();
    added.sections[0].beats.push({ id: 'b10', move: 'A receipt', ...cardOf('zzz002') });
    expect(cards(mapFindings(added, inputs({ edits: directorsEdits(added) })))).toEqual({ failures: [expect.stringMatching(notHeld('b10', 'zzz002'))], concerns: [] });
    const base = writers();
    markCard(base.leftOut[0], 'zzz003');
    const back = clone(base);
    back.sections[1].beats.push(back.leftOut.splice(0, 1)[0]);
    expect(cards(mapFindings(back, inputs({ edits: editsAgainst(base, back) })))).toEqual({ failures: [expect.stringMatching(notHeld('b9', 'zzz003'))], concerns: [] });
    const moved = writers();
    markCard(moved.sections[1].beats[0], 'zzz004');
    const away = clone(moved);
    away.sections[0].beats.push(away.sections[1].beats.splice(0, 1)[0]);
    expect(cards(mapFindings(away, inputs({ edits: editsAgainst(moved, away) })))).toEqual({ failures: [expect.stringMatching(notHeld('b3', 'zzz004'))], concerns: [] });
  });

  // Fix round 2: a concern arises only from the card marker the director set or cleared.
  it('a card fault the director\'s marker made is a concern on that edit: a marker set where no piece is flagged, or cleared where one is', () => {
    const set = writers();
    set.sections[1].beats[1].card = true;
    expect(cards(mapFindings(set, inputs({ edits: directorsEdits(set) })))).toEqual({
      failures: [], concerns: [[['E1'], "The move \"The first vote, six to four\" is marked as a card, and no piece of its evidence is the card's document."]]
    });
    const added = writers();
    added.sections[0].beats.push({ id: 'b10', move: 'A receipt', card: true });
    expect(cards(mapFindings(added, inputs({ edits: directorsEdits(added) })))).toEqual({
      failures: [], concerns: [[['E1'], "The move \"A receipt\" is marked as a card, and no piece of its evidence is the card's document."]]
    });
    const cleared = writers();
    delete cleared.sections[1].beats[2].card;
    expect(cards(mapFindings(cleared, inputs({ edits: directorsEdits(cleared) })))).toEqual({
      failures: [], concerns: [[['E1'], "The move \"The ledger page\" flags a piece of its evidence as a card's document, and is not marked as a card."]]
    });
    // The same faults with no edit of the director's are the writer's.
    expect(cards(mapFindings(set, inputs())).failures).toEqual([expect.stringMatching(/^Beat b4 is marked as a card and flags no piece/)]);
    expect(cards(mapFindings(cleared, inputs())).failures).toEqual([expect.stringMatching(/^Beat b5 flags a piece as a card's document and is not marked/)]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6c: the gate and the checks find a repeat by the console's rule
// ═══════════════════════════════════════════════════════════════════════════
//
// The gate (directorMapProblems) and the checks (mapFindings) read a repeat through the
// console's mapRepeats (console/outline-edit-logic.js), the rule the map on screen locks a
// line by and the client gate takes the writer's repeats by, so the four read one rule.
describe('4.6c: the gate and the checks find a repeat by mapRepeats, the rule the console reads', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'map.js'), 'utf8');
  /** A function's body in lib/map.js, from its declaration to its closing brace. */
  const body = (name) => {
    const start = src.indexOf(`function ${name}(`);
    return start === -1 ? '' : src.slice(start, src.indexOf('\n}\n', start));
  };

  it('repeatedBeatIds and repeatedPhotos build on mapRepeats, and lib/map.js counts no repeat itself', () => {
    expect(src).toMatch(/\bmapRepeats\b[^;]*= require\('\.\.\/console\/outline-edit-logic'\)/);
    ['repeatedBeatIds', 'repeatedPhotos'].forEach((name) => {
      expect(`${name}: ${body(name).includes('mapRepeats(')}`).toBe(`${name}: true`);
      expect(`${name}: ${/count/i.test(body(name))}`).toBe(`${name}: false`);
    });
    expect(`placedPhotos: ${/count/i.test(body('placedPhotos'))}`).toBe('placedPhotos: false');
  });

  // Fix round 2: one reader of a beat's id, the one repeatedBeatIds reads through mapRepeats.
  it("the checks read every beat's id through the console's beatIdOf, and lib/map.js writes no reader of its own", () => {
    expect(src).toMatch(/\bbeatIdOf\b[^;]*= require\('\.\.\/console\/outline-edit-logic'\)/);
    expect(src).not.toMatch(/\bbeat\.id\b/);
  });

  // Fix round 2: a name means one function across the map's module and its check node.
  it('no function is declared under one name in lib/map.js and in the map checks\' node', () => {
    const declared = (text) => new Set([...text.matchAll(/^function (\w+)\(/gm)].map((m) => m[1]));
    const node = fs.readFileSync(path.join(__dirname, '..', 'workflow', 'nodes', 'map-nodes.js'), 'utf8');
    const both = [...declared(src)].filter((name) => declared(node).has(name));
    expect(both).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6d: the gate reads the map the stop showed as the console does
// ═══════════════════════════════════════════════════════════════════════════
//
// The integrator's ruling 3 on the follow-ups' findings, minor 1. The gate takes a repeat the
// map the stop showed holds as the writer's, and reads that map as the console's refusal and
// its page do (isMapValue): a value that is no map is no map shown, so every repeat in the
// director's map is theirs.
describe('4.6d: the gate reads the map the stop showed as the console does', () => {
  const { directorMapProblems, mapResume } = require('../map');
  /** The writer's map with b9 twice in leftOut. */
  const repeatsB9 = () => {
    const map = writers();
    map.leftOut.push(clone(map.leftOut[0]));
    return map;
  };
  const NO_MAP_SHOWN = "Two beats share the id \"b9\": the director's changes made this repeat. Give each beat an id of its own.";

  it.each([
    ['with no list of sections', () => ({ leftOut: repeatsB9().leftOut })],
    ['whose sections are no list', () => ({ sections: {}, leftOut: repeatsB9().leftOut })]
  ])("a shown value %s that repeats a beat is no map shown: the repeat is the director's, refused at the gate and at the payload", (_name, shownOf) => {
    expect(directorMapProblems(repeatsB9(), { theme: 'journalist', shown: null })).toBe(NO_MAP_SHOWN);
    expect(directorMapProblems(repeatsB9(), { theme: 'journalist', shown: shownOf() })).toBe(NO_MAP_SHOWN);
    expect(mapResume({ outline: 'approve', map: repeatsB9() }, { outline: shownOf() }, { theme: 'journalist' }).error).toBe(NO_MAP_SHOWN);
  });

  it("the same repeat in a map the stop showed is the writer's: the gate lets it through to the checks", () => {
    expect(directorMapProblems(repeatsB9(), { theme: 'journalist', shown: repeatsB9() })).toBeNull();
    expect(typesOf(mapFindings(repeatsB9(), inputs()).failures)).toEqual(['duplicate-beat-id']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6d: the schema says what "note" means
// ═══════════════════════════════════════════════════════════════════════════
//
// The integrator's ruling 3 on the follow-ups' findings, minor 2. The schema's line for a
// change's source says that "note" is the meeting's approval note, offered when the prompt
// holds that note: on 0926262 the meeting's note was a rejection, and a change sourced "note"
// there fails the check and spends the round's one rework.
describe('4.6d: the schema says what "note" means', () => {
  const { mapSchemaFor, MEETING_NOTE_SOURCE } = require('../map');
  const outlineSchema = require('../schemas/outline.schema.json');

  it("a change's source is a meeting edit's id, or \"note\" for the meeting's approval note when the prompt holds it", () => {
    // Brief 4.14a: the example id is in the meeting's own form, as <SETTLED_WEAVE> marks a
    // change (M3, where it read E3).
    const SOURCE = 'The id of the director\'s change in <SETTLED_WEAVE>, such as M3, or "note" for a change the director\'s note from the meeting asks for, when the prompt holds that note: the approval note marked arc-selection in <DIRECTOR_GUIDANCE>';
    // Task 4.6e: the stored schema holds the line up to where the note is; mapSchemaFor fills
    // in that pointer from its one constant (MEETING_NOTE_POINTER).
    expect(outlineSchema.properties.weaveChanges.items.properties.source.description).toBe(SOURCE.slice(0, SOURCE.indexOf(': the approval note')));
    // The map writer's schema, which <SCHEMA> prints and the SDK enforces, carries it as written.
    expect(mapSchemaFor('journalist').properties.weaveChanges.items.properties.source.description).toBe(SOURCE);
    expect(SOURCE).toContain(`"${MEETING_NOTE_SOURCE}"`);
    // Every theme's map prompt prints it: it names no theme, and carries no em-dash.
    expect(SOURCE).not.toMatch(/Nova|journalist|detective|\u2014/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6e: "no note" means no approval note, and the note's pointer has one source
// ═══════════════════════════════════════════════════════════════════════════
//
// The integrator's ruling 1 on 4.6d's minors (minors 2 and 4). The map lists no change to the
// weave when the director changed nothing at the meeting and approved it with no note, as
// meetingNoteOf decides: a rejection note the meeting's send-back left prints in the same
// <DIRECTOR_GUIDANCE> (0926262), so "left no note" read as false beside it. Where the prompt
// holds the approval note is one constant, MEETING_NOTE_POINTER: the map writer's task prints
// it, and mapSchemaFor fills it into the schema's line for a change's source.
describe('4.6e: "no note" means no approval note, and the note\'s pointer has one source', () => {
  const fs = require('fs');
  const path = require('path');
  const { mapSchemaFor, meetingNoteOf, MEETING_NOTE_POINTER } = require('../map');
  const outlineSchema = require('../schemas/outline.schema.json');
  const { PromptBuilder } = require('../prompt-builder');
  const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
  const { WEAVE } = require('./fixtures/rework-state');
  const EMPTY_WHEN = 'What the map changed in the weave to fit in each change the director made at the story meeting; empty when the director changed nothing and left no approval note at the meeting';
  const UNASKED = 'The map lists changes to the weave, and the director changed nothing and left no approval note at the meeting. Leave weaveChanges empty.';
  const note = (kind, gate = 'arc-selection') => ({ gate, kind, round: 1, text: 'Lead with the money.', at: '2026-10-04T09:00:00.000Z' });
  /** The writer's map with one change to the weave, sourced to the meeting's note. */
  const changed = () => ({ ...writers(), weaveChanges: [{ source: 'note', change: 'The money now leads the closing.' }] });

  it("the schema says weaveChanges is empty when the director changed nothing and left no approval note at the meeting", () => {
    expect(outlineSchema.properties.weaveChanges.description).toBe(EMPTY_WHEN);
    // The map writer's schema, which <SCHEMA> prints and the SDK enforces, carries it as written.
    expect(mapSchemaFor('journalist').properties.weaveChanges.description).toBe(EMPTY_WHEN);
    expect(EMPTY_WHEN).not.toMatch(/Nova|journalist|detective|\u2014/);
  });

  it.each([
    ['no notes at all', []],
    ["the meeting's rejection note, from a send-back or a reweave", [note('rejection')]],
    ['an approval note from another stop', [note('approval', 'outline')]]
  ])('with %s and no edit at the meeting, a change to the weave fails on the line that names the approval note', (_name, notes) => {
    const meetingNote = meetingNoteOf({ directorGateNotes: notes });
    expect(meetingNote).toBe(false);
    expect(mapFindings(changed(), inputs({ meetingNote }))).toEqual({
      failures: [{ type: 'weave-change-unasked', message: UNASKED, line: 'The map lists changes to the weave, and you changed nothing and left no approval note at the meeting.', place: 'weaveChanges' }],
      concerns: []
    });
  });

  it("with the meeting's approval note, the same change passes", () => {
    const meetingNote = meetingNoteOf({ directorGateNotes: [note('approval')] });
    expect(meetingNote).toBe(true);
    expect(mapFindings(changed(), inputs({ meetingNote }))).toEqual({ failures: [], concerns: [] });
  });

  it("the pointer at the approval note is one constant, which the map writer's task prints and mapSchemaFor fills in", async () => {
    expect(MEETING_NOTE_POINTER).toBe('the approval note marked arc-selection in <DIRECTOR_GUIDANCE>');
    const stored = outlineSchema.properties.weaveChanges.items.properties.source.description;
    expect(stored).not.toContain('<DIRECTOR_GUIDANCE>');
    expect(mapSchemaFor('journalist').properties.weaveChanges.items.properties.source.description).toBe(`${stored}: ${MEETING_NOTE_POINTER}`);
    const builder = new PromptBuilder({ loadPhasePrompts: jest.fn(), validate: jest.fn() });
    const { userPrompt } = await builder.buildOutlinePrompt(renderSettledWeave(WEAVE, null), [], [], null, { gateNotes: [note('approval')] });
    expect(userPrompt).toContain(`and each change the director's note from the meeting asks for (${MEETING_NOTE_POINTER}).`);
    // Written once, in lib/map.js, from the meeting's stop type; the task's clause reads it.
    const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    expect(read('map.js')).toContain('`the approval note marked ${MEETING_GATE} in <DIRECTOR_GUIDANCE>`');
    const clause = read('prompt-builder.js').split('\n').find((line) => line.startsWith('const MAP_TASK_NOTE_CHANGE ='));
    expect(clause).toContain('${MEETING_NOTE_POINTER}');
    expect(clause).not.toContain('<DIRECTOR_GUIDANCE>');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14a: the map reads the meeting as the director settled it (the final review, ruling 1)
// ═══════════════════════════════════════════════════════════════════════════
//
// Meeting 2: a connection that joins a thread the director left out goes out of the story with
// it, so the map check no longer demands it land. Meeting 3: the meeting's changes have an id
// form of their own wherever a prompt shows them, M and the edit's number, so the map rework's
// prompt never holds a meeting change and one of the map's own edits under one id; a change's
// source names a meeting change in that form, and the map's stop sends each with its place.
describe('4.14a: the map reads the meeting as the director settled it', () => {
  const { reworkFixtureState, WEAVE: FIXTURE_WEAVE, MAP } = require('./fixtures/rework-state');
  const { _testing: { mapCheckInputsOf } } = require('../workflow/nodes/map-nodes');
  const { meetingEditIdsOf, mapCheckpointData } = require('../map');
  const { standingAtMeeting } = require('../hand-edit-diff');

  /** The state at the map after the director approved the meeting with `change` made to the writer's weave. */
  function approvedWith(change) {
    const left = clone(FIXTURE_WEAVE);
    change(left);
    return {
      ...reworkFixtureState('journalist'),
      weave: left,
      _weaveBaseline: clone(FIXTURE_WEAVE),
      _weaveHandEdits: standingAtMeeting(null, clone(FIXTURE_WEAVE), left),
      outline: clone(MAP),
      _mapBaseline: clone(MAP),
      _outlineHandEdits: null
    };
  }
  /**
   * The director's four changes: "from your notes", t3's line, a thread added to the open angle, c2's
   * line. Piece 3 (brief 3B): a change to an angle's pitch is no edit until slice 3C, so the
   * story's change became the words from the director's notes, and the role's, the thread's line.
   */
  const fourChanges = (w) => {
    w.fromYourNotes = 'Riley watched the ledger';
    w.threads[2].line = 'Morgan paid Riley at the bar, in an envelope.';
    w.threads.push({ id: 't6', name: 'The second ledger', line: 'Riley kept a second ledger in the back room.' });
    w.angles[0].threads.push('t6');
    w.connections[1].line = 'The sale and the result came back the same night.';
  };
  /**
   * The fixture's map with t3 kept out: c1's beat no longer names c1, and Morgan's envelope card is
   * left out. Piece 4 (brief 4B; R5): a writer's beat in a section carries only the story's threads,
   * so b1 and b6 no longer carry t3.
   */
  const keepsT3Out = () => {
    const map = clone(MAP);
    delete map.sections[0].beats[0].connection;
    map.sections[0].beats[0].threads = ['t1'];
    map.sections[3].beats[0].threads = ['t1'];
    map.leftOut.push(map.sections[1].beats.splice(1, 1)[0]);
    map.sections[1].beats.push({
      id: 'b10', kind: 'receipt', move: 'An unsigned letter threatens Marcus', players: ['Morgan', 'Riley'], threads: ['t1'], card: true,
      evidence: [{ sources: ['p-rescued'], shows: 'A friend gives Marcus "until Friday".', stance: 'supports', card: true }]
    });
    return map;
  };

  // Piece 3 (brief 3B): a thread the settled angle leaves out takes its connections with it.
  it('the map check passes on a map that keeps a left-out thread out, and wants its connection back when the thread comes back', () => {
    const out = approvedWith((w) => { w.angles[0].threads = w.angles[0].threads.filter((id) => id !== 't3'); });
    const map = keepsT3Out();
    expect(mapCheckInputsOf(out, map).connections.map((c) => c.id)).toEqual(['c2']);
    expect(mapFindings(map, mapCheckInputsOf(out, map))).toEqual({ failures: [], concerns: [] });
    const back = approvedWith(() => {});
    expect(mapCheckInputsOf(back, map).connections.map((c) => c.id)).toEqual(['c1', 'c2']);
    // With t3 back in the story, no beat carries it, and its connection lands nowhere.
    expect(typesOf(mapFindings(map, mapCheckInputsOf(back, map)).failures)).toEqual(['thread-not-landed', 'connection-not-landed']);
  });

  it("a change's source names a meeting change in the meeting's own form, and the map check reads it", () => {
    const state = approvedWith(fourChanges);
    expect(meetingEditIdsOf(state)).toEqual(['M1', 'M2', 'M3', 'M4']);
    // Phase 4b (brief 1D; R3): the map carries the thread the director added, t6, in the money's beat.
    const named = (source) => {
      const map = { ...clone(MAP), weaveChanges: [{ source, change: 'The envelope now closes the story.' }] };
      map.sections[2].beats[0].threads.push('t6');
      return map;
    };
    expect(mapFindings(named('M2'), mapCheckInputsOf(state, named('M2'))).failures).toEqual([]);
    const { failures } = mapFindings(named('E2'), mapCheckInputsOf(state, named('E2')));
    expect(failures).toEqual([{
      type: 'weave-change-source',
      message: 'Changes to the weave name sources the meeting does not hold: "E2". Name each change\'s source: M1, M2, M3 and M4.',
      line: 'A change the map made to the weave names no change of yours at the meeting.',
      place: 'weaveChanges'
    }]);
  });

  it("the map's stop sends each meeting change the weave carries, in the meeting's order, by its id and its place as the meeting names the line", () => {
    const state = approvedWith(fourChanges);
    const data = mapCheckpointData(state, { keptPhotos: ['hero.jpg', 'p2.jpg'], evidenceIndex: {}, maxRevisions: 1 });
    expect(data.meetingChanges).toEqual([
      { id: 'M1', place: 'the words from your notes' },
      // Phase 4b (brief 1B): a thread by its name, as the meeting's page shows it.
      { id: 'M2', place: 'the line "Morgan paid Riley at the bar, in an envelope"' },
      { id: 'M3', place: 'the thread you added, "The second ledger"' },
      { id: 'M4', place: 'the connection "The sale and the result came back the same night"' }
    ]);
    expect(data.meetingChanges.map((change) => change.id)).toEqual(meetingEditIdsOf(state));
    expect(mapCheckpointData(approvedWith(() => {}), { keptPhotos: [], maxRevisions: 1 }).meetingChanges).toEqual([]);
  });

  it("the map rework's prompt holds the meeting's changes as M and the map's own edits as E: no id names two edits", async () => {
    const { _testing: ai } = require('../workflow/nodes/ai-nodes');
    const { PromptBuilder } = require('../prompt-builder');
    const state = approvedWith(fourChanges);
    const left = clone(MAP);
    left.headline = 'The Ledger Kept Talking, and the Room Kept Quiet.';
    const rework = {
      ...state, outline: null, _previousOutline: left, _outlineHandEdits: standingOnMap(null, MAP, left),
      _outlineFeedback: 'Lead with the ledger.', humanOutlineRevisionCount: 1, outlineRevisionCount: 0
    };
    const builder = new PromptBuilder({ loadPhasePrompts: jest.fn(), validate: jest.fn() }, 'journalist', state.sessionConfig, state.canonicalCharacters, state.characterData.characters);
    const { prompt } = await ai.mapReworkCall(rework, builder, 'journalist');
    const block = (tag) => prompt.slice(prompt.indexOf(`<${tag}>`), prompt.indexOf(`</${tag}>`));
    const meeting = [...block('SETTLED_WEAVE').matchAll(/\b([A-Z]\d+)\b(?=[:\]])/g)].map((m) => m[1]);
    const map = [...block('HAND_EDITS').matchAll(/^(E\d+) \(/gm)].map((m) => m[1]);
    // Piece 3 (brief 3B): the threads print in the angle's order, the director's after its own.
    // Brief 3C: the connection's line the director rewrote is marked too, so every change the map
    // may name (meetingEditIdsOf) is on a line.
    expect(meeting).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(meeting).toEqual(meetingEditIdsOf(state));
    expect(map).toEqual(['E1']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14b: the map's last defects (the final review, ruling 2)
// ═══════════════════════════════════════════════════════════════════════════

describe("4.14b: the gate stores a struck beat's photo by itself", () => {
  const { mapResume } = require('../map');
  const { MAP, reworkFixtureState } = require('./fixtures/rework-state');
  const EditLogic = require('../../console/outline-edit-logic');

  it.each(['approve', 'send-back'])('%s: the photo beside a struck beat is stored by itself, and the strike alone stands', (action) => {
    const struck = EditLogic.strikeBeat(clone(MAP), 'b2');
    expect(struck.sections[1].photos).toEqual([{ filename: 'p2.jpg', beat: 'b2' }]);
    const { error, stateUpdates } = mapResume({ outline: action, map: struck, note: 'Keep my strike.' }, reworkFixtureState('journalist'), { theme: 'journalist' });
    expect(error).toBeNull();
    expect(stateUpdates.outline.sections[1].photos).toEqual([{ filename: 'p2.jpg' }]);
    expect(stateUpdates._outlineHandEdits.edits.map((e) => [e.path, e.from])).toEqual([['leftOut[#b2]', 'theStory']]);
  });
});

describe('4.14b: a section the director empties is dropped, at approve and at send-back', () => {
  const { mapResume } = require('../map');
  const { MAP, reworkFixtureState } = require('./fixtures/rework-state');
  const EditLogic = require('../../console/outline-edit-logic');
  const state = () => ({ ...reworkFixtureState('journalist'), directorGateNotes: [] });
  const sent = (action, map, at = state()) => mapResume({ outline: action, map, note: 'Tighten the lede.' }, at, { theme: 'journalist' });

  it.each(['approve', 'send-back'])("%s: the section moves to the dropped list, with the line that says the director emptied it, and the drop stands as the director's edit", (action) => {
    // The director strikes b5, Follow the Money's one beat, and moves no photo into it.
    const { error, stateUpdates } = sent(action, EditLogic.strikeBeat(clone(MAP), 'b5'));
    expect(error).toBeNull();
    expect(stateUpdates.outline.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'closing']);
    expect(stateUpdates.outline.dropped).toEqual([...clone(MAP).dropped, { slot: 'followTheMoney', reason: EditLogic.EMPTIED_SECTION_REASON }]);
    expect(EditLogic.EMPTIED_SECTION_REASON).toBe('The director emptied this section on the map.');
    expect(EditLogic.EMPTIED_SECTION_REASON).not.toMatch(/\u2014|Nova/);
    expect(stateUpdates._outlineHandEdits.edits.map((e) => e.path).sort()).toEqual(['dropped[#followTheMoney]', 'leftOut[#b5]', 'sections[#followTheMoney]']);
  });

  it('a section moved empty the same way, every beat moved out, is dropped too', () => {
    const { stateUpdates } = sent('approve', EditLogic.moveBeat(clone(MAP), 'b5', 'closing'));
    expect(stateUpdates.outline.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'closing']);
    expect(stateUpdates.outline.dropped.map((d) => d.slot)).toEqual(['thePlayers', 'whatsMissing', 'followTheMoney']);
  });

  it('a section that keeps a photo stays, and so do a section the writer left empty and a section already dropped', () => {
    // The Story's beats struck: p2.jpg stays in the section, with its people.
    let left = clone(MAP);
    ['b2', 'b3', 'b4'].forEach((id) => { left = EditLogic.strikeBeat(left, id); });
    expect(sent('approve', left).stateUpdates.outline.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'followTheMoney', 'closing']);
    // The writer's empty section, approved as shown.
    const writers = clone(MAP);
    writers.sections[2].beats = [];
    expect(sent('approve', clone(writers), { ...state(), outline: writers, _mapBaseline: clone(writers) }).stateUpdates.outline).toEqual(writers);
    // A slot already in the dropped list keeps its one entry.
    const twice = clone(MAP);
    twice.dropped.push({ slot: 'followTheMoney', reason: 'The writer dropped it too.' });
    const { stateUpdates } = sent('approve', EditLogic.strikeBeat(clone(twice), 'b5'), { ...state(), outline: twice, _mapBaseline: clone(twice) });
    expect(stateUpdates.outline.dropped.filter((d) => d.slot === 'followTheMoney')).toEqual([{ slot: 'followTheMoney', reason: 'The writer dropped it too.' }]);
    expect(stateUpdates.outline.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'closing']);
  });
});

describe('4.14b: the gate refuses a photo the director left out as the top photo the director chose', () => {
  const { directorMapProblems, mapResume, mapCheckpointData } = require('../map');
  const { leavePhotosOut } = require('../photo-leave-out');
  const { MAP, reworkFixtureState } = require('./fixtures/rework-state');
  const EditLogic = require('../../console/outline-edit-logic');
  /** A state at the map after p2.jpg was deleted at the desk: on the leave-out list. */
  function deletedAtDesk(outline = clone(MAP)) {
    const state = { ...reworkFixtureState('journalist'), outline, _mapBaseline: clone(outline) };
    return { ...state, ...leavePhotosOut(state, ['p2.jpg']) };
  }
  const p2OnTop = () => EditLogic.movePhoto(clone(MAP), 'theStory', 0, EditLogic.MAP_TOP_PHOTO);
  const REFUSAL = "The top photo \"p2.jpg\" is a photo the director left out of the article, so it would not print: the director's changes put it at the top. Move another photo to the top.";

  it('the payload lists each photo the map places that the director left out, by the rule the article reads (isPhotoExcluded)', () => {
    expect(mapCheckpointData(deletedAtDesk(), {}).leftOutPhotos).toEqual(['p2.jpg']);
    expect(mapCheckpointData(deletedAtDesk(p2OnTop()), {}).leftOutPhotos).toEqual(['p2.jpg']);
    expect(mapCheckpointData({ ...reworkFixtureState('journalist') }, {}).leftOutPhotos).toEqual([]);
    // An exclusion read from the mapping alone counts too, in any case of the filename.
    const excluded = { ...reworkFixtureState('journalist'), characterIdMappings: { 'P2.JPG': { exclude: true } } };
    expect(mapCheckpointData(excluded, {}).leftOutPhotos).toEqual(['p2.jpg']);
  });

  it("refuses the director's change that puts a left-out photo at the top, saying why", () => {
    const state = deletedAtDesk();
    const moved = EditLogic.movePhoto(clone(MAP), 'theStory', 0, EditLogic.MAP_TOP_PHOTO);
    expect(mapResume({ outline: 'approve', map: moved }, state, { theme: 'journalist' }))
      .toEqual({ resume: {}, stateUpdates: {}, note: null, error: REFUSAL });
    expect(mapResume({ outline: 'send-back', map: moved, note: 'Lead with the photo.' }, state, { theme: 'journalist' }).error).toBe(REFUSAL);
    expect(directorMapProblems(moved, { theme: 'journalist', shown: clone(MAP), leftOut: ['P2.jpg'] })).toBe(REFUSAL);
  });

  it('takes a left-out top photo the map the stop showed holds, a map with no left-out photo at the top, and a map with no list', () => {
    expect(mapResume({ outline: 'approve', map: p2OnTop() }, deletedAtDesk(p2OnTop()), { theme: 'journalist' }).error).toBeNull();
    expect(mapResume({ outline: 'approve', map: clone(MAP) }, deletedAtDesk(), { theme: 'journalist' }).error).toBeNull();
    expect(directorMapProblems(p2OnTop(), { theme: 'journalist', shown: clone(MAP) })).toBeNull();
  });
});
