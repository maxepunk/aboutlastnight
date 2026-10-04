/**
 * The map's code checks (phase 4, brief 4.6; spec 5.4): every roster player in a beat
 * or raised in the gap note, every kept photo placed once, three to five cards from the
 * record, every connection of the settled weave landed in a beat, and each change to the
 * weave named by its source. Each failure is one line with its own list; a failure the
 * director caused is a concern on their edit, never a rework. Invented text throughout.
 */
const { mapFindings, mapKey, mapRosterOf, MAP_CHECKS_SOURCE, MAP_BEAT_KINDS } = require('../map');
const { standingOnMap, carriedEdits } = require('../hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));

const ROSTER = [
  { name: 'Ellis', fullName: 'Ellis Reeve' }, { name: 'Rowan', fullName: 'Rowan Vale' },
  { name: 'Sloane', fullName: 'Sloane Hart' }, { name: 'Mira', fullName: 'Mira Fenn' },
  { name: 'Vale', fullName: 'Vale Orrin' }, { name: 'Kai', fullName: 'Kai Lune' }
];

/** A map that passes every check: Kai is raised in the gap note, three cards, three photos. */
const writers = () => ({
  headline: 'Ellis Reeve Pointed the Room at Rowan',
  deck: 'Money moved into an account named for a player in the last two minutes of selling.',
  topPhoto: 'huddle.jpg',
  gapNote: { line: 'The record holds nothing Kai did.', players: ['Kai'] },
  sections: [
    {
      slot: 'lede', heading: '', job: 'Open on the vote and ask what it will cost.',
      beats: [
        { id: 'b1', kind: 'scene', material: 'The scoreboard goes up on the screen', players: ['Ellis', 'Rowan'] },
        { id: 'b2', kind: 'line', material: 'Rowan: "Someone is framing me"', players: ['Rowan'], connection: 'c1' }
      ],
      photos: []
    },
    {
      slot: 'theStory', heading: 'The Story', job: 'How the room built its case.',
      beats: [
        { id: 'b3', kind: 'receipt', material: 'row001, the fight in the hall', players: ['Sloane'], card: 'row001' },
        { id: 'b4', kind: 'scene', material: 'The first vote, six to four', players: ['Mira', 'Vale'] },
        { id: 'b5', kind: 'receipt', material: 'row002, the ledger page', players: ['Mira'], card: 'row002' },
        { id: 'b6', kind: 'receipt', material: 'row003, the letter', players: ['Vale'], card: 'row003' }
      ],
      photos: [{ filename: 'theory.jpg', beat: 'b4' }, { filename: 'cards.jpg' }]
    }
  ],
  dropped: [{ slot: 'thePlayers', reason: 'Everyone appears above.' }],
  leftOut: [{ id: 'b9', kind: 'scene', material: 'Kai at the coat check', players: ['Kai'] }],
  expectedLength: 1200,
  weaveChanges: []
});

const inputs = (over = {}) => ({
  roster: ROSTER,
  keptPhotos: ['huddle.jpg', 'theory.jpg', 'cards.jpg'],
  recordIds: ['row001', 'row002', 'row003', 'row004'],
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
      expect(concerns).toEqual([{ type: 'player-not-placed', editIds: ['E1'], finding: expect.stringMatching(/Ellis is in no beat/) }]);
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
      expect(failures[0].message).toMatch(/^Photos placed more than once: theory\.jpg\. /);
      expect(failures[1].message).toMatch(/^Photos placed that are not among the photos offered: whiteboard\.jpg\. .*huddle\.jpg, theory\.jpg, cards\.jpg/);
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
    it('a card naming no document in the record fails, with the valid ids', () => {
      const map = writers();
      map.sections[1].beats[0].card = 'zzz999';
      const { failures } = mapFindings(map, inputs());
      expect(typesOf(failures)).toEqual(['card-not-in-record']);
      expect(failures[0].message).toMatch(/^Cards naming no document in <RECORD>: zzz999 \(beat b3\)\. .*row001, row002, row003, row004/);
    });

    it('fewer than three cards or more than five fail; a card id matches in any case', () => {
      const two = writers();
      delete two.sections[1].beats[3].card;
      expect(mapFindings(two, inputs()).failures.map((f) => [f.type, f.message])).toEqual([
        ['card-count', expect.stringMatching(/^The map carries 2 cards\. /)]
      ]);
      const six = writers();
      six.sections[0].beats[0].card = 'ROW004';
      six.sections[0].beats[1].card = 'row004';
      six.sections[1].beats[1].card = 'row001';
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

  it('two beats under one id fail: the edits find a beat by its id', () => {
    const map = writers();
    map.leftOut[0].id = 'b4';
    expect(typesOf(mapFindings(map, inputs()).failures)).toEqual(['duplicate-beat-id']);
  });

  it('a value that is no map is one failure', () => {
    expect(mapFindings(null, inputs()).failures.map((f) => f.type)).toEqual(['no-map']);
  });
});
