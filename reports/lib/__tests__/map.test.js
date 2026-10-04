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
      const one = clone(two);
      delete one.sections[1].beats[2].card;
      expect(mapFindings(one, inputs()).failures.map((f) => f.message)).toEqual([expect.stringMatching(/^The map carries 1 card\. /)]);
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
      expect(asPassed.failures[0].message).toMatch(/^Photos placed more than once: cards\.jpg\. /);
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
        ['photo-not-offered', expect.stringMatching(/^Photos placed that are not among the photos offered:  cards\.jpg\. /)]
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

    it("the check's card count is the tally's: a blank card is no card in either", () => {
      const blank = writers();
      delete blank.sections[1].beats[3].card;
      blank.sections[0].beats[0].card = '  ';
      const four = writers();
      four.sections[0].beats[1].card = 'row004';
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

  it("the director-side schema is the writer's, derived in code, with a beat needing only its id and its material", () => {
    const writer = mapSchemaFor('journalist');
    const director = directorMapSchemaFor('journalist');
    expect(writer.properties.sections.items.properties.beats.items.required).toEqual(['id', 'kind', 'material', 'players']);
    expect(director.properties.sections.items.properties.beats.items.required).toEqual(['id', 'material']);
    expect(director.properties.leftOut.items.required).toEqual(['id', 'material']);
    const withoutBeatRules = (schema) => {
      const copy = clone(schema);
      delete copy.properties.sections.items.properties.beats.items.required;
      delete copy.properties.leftOut.items.required;
      return copy;
    };
    expect(withoutBeatRules(director)).toEqual(withoutBeatRules(writer));
    expect(directorMapSchemaFor('journalist')).toBe(director);
  });

  it("a map the writer's schema takes, the director's takes; a beat the director added with only its id and material, only the director's", () => {
    const writerTakes = new Ajv({ allErrors: true, strict: true }).compile(mapSchemaFor('journalist'));
    expect(writerTakes(clone(MAP))).toBe(true);
    expect(directorMapProblems(clone(MAP), { theme: 'journalist' })).toBeNull();
    const added = clone(MAP);
    added.sections[0].beats.push({ id: 'b11', material: 'Alex at the window' });
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
// beats the sections hold: a card beat added, brought back, struck or cut, or a card added
// to a beat or cleared from one. An edit that changes which document a card prints, or
// moves a card beat between sections, leaves the count as the writer made it, so a count
// that fails then is the writer's, and the round's check rework fixes it (R11).
describe("4.6b: the card count is the director's only when their edits change it", () => {
  /** The director's standing edits on `left`, made against the writer's `base`. */
  const editsAgainst = (base, left) => carriedEdits(standingOnMap(null, base, left), left);
  /** The writer's map with five cards: b1 and b4 carry one too. */
  const fiveCards = () => {
    const map = writers();
    map.sections[0].beats[0].card = 'row004';
    map.sections[1].beats[1].card = 'row002';
    return map;
  };
  /** The writer's map with six cards, one over the count: b2 carries one too. */
  const sixCards = () => {
    const map = fiveCards();
    map.sections[0].beats[1].card = 'row001';
    return map;
  };
  const cardCount = (findings) => ({
    failures: findings.failures.filter((f) => f.type === 'card-count').map((f) => f.message),
    concerns: findings.concerns.filter((c) => c.type === 'card-count')
  });

  it("an edit that swaps a card's document leaves the count the writer's: a failure, and no concern", () => {
    const base = sixCards();
    const left = clone(base);
    left.sections[1].beats[0].card = 'row004';
    const edits = editsAgainst(base, left);
    expect(edits.map((e) => e.path)).toEqual(['sections[#theStory].beats[#b3].card']);
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
    map.leftOut[0].card = 'row004';
    return map;
  };
  it.each([
    ['a card beat cut', writers, (map) => { map.sections[1].beats.splice(3, 1); }, 2],
    ['a card cleared from a beat', writers, (map) => { delete map.sections[1].beats[3].card; }, 2],
    ['a card added to a beat', fiveCards, (map) => { map.sections[0].beats[1].card = 'row003'; }, 6],
    ['a card beat added', fiveCards, (map) => { map.sections[1].beats.push({ id: 'b10', material: 'row004, the receipt', card: 'row004' }); }, 6],
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

  it('the concern names only the edits that changed the count, not a card swap beside them', () => {
    const base = writers();
    const left = clone(base);
    left.sections[1].beats[0].card = 'row004';
    left.leftOut.push(left.sections[1].beats.splice(3, 1)[0]);
    const edits = editsAgainst(base, left);
    expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].beats[#b3].card'], ['E2', 'leftOut[#b6]']]);
    expect(cardCount(mapFindings(left, inputs({ edits }))).concerns).toEqual([
      { type: 'card-count', editIds: ['E2'], finding: 'The map carries 2 cards; the article carries 3 to 5.' }
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
    map.sections[0].beats[0].card = 'row004';
    return map;
  };
  /** The writer's map with five cards: b4 carries one too. */
  const fiveCards = () => {
    const map = fourCards();
    map.sections[1].beats[1].card = 'row002';
    return map;
  };
  /** The writer's map with six cards, one over the count: b2 carries one too. */
  const sixCards = () => {
    const map = fiveCards();
    map.sections[0].beats[1].card = 'row001';
    return map;
  };

  it("a strike, then a send-back's rework that marks three more cards: the writer's failure, and no concern", () => {
    const shown = fourCards();
    const left = clone(shown);
    left.leftOut.push(left.sections[1].beats.splice(3, 1)[0]);
    const standing = standingOnMap(null, shown, left);
    const rework = clone(left);
    rework.sections[0].beats[1].card = 'row002';
    rework.sections[1].beats[1].card = 'row003';
    rework.sections[1].beats.push({ id: 'b10', kind: 'receipt', material: 'row001, the receipt', players: [], card: 'row001' });
    const edits = carriedEdits(standing, rework);
    expect(edits.map((e) => [e.id, e.path, e.struck])).toEqual([['E1', 'leftOut[#b6]', true]]);
    expect(cardCount(mapFindings(rework, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 6 cards\. Mark 3 to 5 beats as cards/)],
      concerns: []
    });
  });

  it("a card beat struck and another brought back, then a rework that marks two more cards: the writer's failure, and no concern", () => {
    const shown = fourCards();
    shown.leftOut[0].card = 'row002';
    const left = clone(shown);
    left.leftOut.push(left.sections[1].beats.splice(3, 1)[0]);
    left.sections[1].beats.push(left.leftOut.splice(0, 1)[0]);
    const standing = standingOnMap(null, shown, left);
    const rework = clone(left);
    rework.sections[0].beats[1].card = 'row003';
    rework.sections[1].beats[1].card = 'row001';
    const edits = carriedEdits(standing, rework);
    expect(edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#theStory].beats[#b9]'], ['E2', 'leftOut[#b6]']]);
    expect(cardCount(mapFindings(rework, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 6 cards\. /)],
      concerns: []
    });
  });

  it("a card beat brought back, then a rework that clears two cards: too few is the writer's failure, and no concern", () => {
    const shown = writers();
    shown.leftOut[0].card = 'row004';
    const left = clone(shown);
    left.sections[1].beats.push(left.leftOut.splice(0, 1)[0]);
    const standing = standingOnMap(null, shown, left);
    const rework = clone(left);
    delete rework.sections[1].beats[0].card;
    delete rework.sections[1].beats[2].card;
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
    left.sections[0].beats[1].card = 'row003';
    left.sections[1].beats.push({ id: 'b10', material: 'row001, the receipt', card: 'row001' });
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
    left.sections[1].beats.push({ id: 'b10', material: 'row004, the receipt', card: 'row004' });
    const edits = editsAgainst(shown, left);
    expect(edits.map((e) => [e.id, e.path, e.from])).toEqual([['E1', 'sections[#theStory].beats[#b10]', 'none']]);
    expect(cardCount(mapFindings(left, inputs({ edits })))).toEqual({
      failures: [expect.stringMatching(/^The map carries 7 cards\. Mark 3 to 5 beats as cards/)],
      concerns: [{ type: 'card-count', editIds: ['E1'], finding: 'The map carries 7 cards; the article carries 3 to 5.' }]
    });
  });

  it("a card beat struck from a map the writer already gave too few: the writer's part fails, and the director's is a concern", () => {
    const shown = writers();
    delete shown.sections[1].beats[2].card;
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
    map.sections[0].beats.push({ id: 'b4', kind: 'scene', material: 'A second beat under b4', players: [] });
    map.leftOut.push({ id: 'b2', kind: 'scene', material: 'A second beat under b2', players: [] });
    expect(gate(map)).toBe("Two beats share the id \"b2\" and \"b4\": the director's changes made these repeats. Give each beat an id of its own.");
    expect(mapFindings(map, inputs()).failures.filter((f) => f.type === 'duplicate-beat-id').map((f) => f.message))
      .toEqual([expect.stringMatching(/^Beats sharing an id: b2 and b4\. /)]);
  });

  it("photos placed more than once, at the top and in any case of their names, are the same photos in the same order to both", () => {
    const map = writers();
    map.topPhoto = 'Cards.jpg';
    map.sections[0].photos.push({ filename: 'THEORY.JPG' });
    expect(gate(map)).toBe("\"Cards.jpg\" and \"THEORY.JPG\" are placed more than once: the director's changes made these repeats. Place each photo once: as the top photo, or in one section.");
    expect(mapFindings(map, inputs()).failures.filter((f) => f.type === 'photo-placed-twice').map((f) => f.message))
      .toEqual([expect.stringMatching(/^Photos placed more than once: cards\.jpg, theory\.jpg\. /)]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6c: a card count is the director's only for the edits that changed it
// ═══════════════════════════════════════════════════════════════════════════
//
// A concern on the card count names an edit on a beat's place only when it took the beat
// into the sections or out of them, and an edit on its card only when it added the card or
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
    map.sections[0].beats[0].card = 'row004';
    map.sections[0].beats[1].card = 'row001';
    return map;
  };
  /** The writer's map with six cards, one over the count: b4 carries one too. */
  const sixCards = () => {
    const map = fiveCards();
    map.sections[1].beats[1].card = 'row003';
    return map;
  };
  /** The writer's map with two cards, one under the count: b6 carries none. */
  const twoCards = () => {
    const map = writers();
    delete map.sections[1].beats[3].card;
    return map;
  };
  /** A base map whose leftOut beat b9 is a card beat. */
  const withLeftOutCard = (baseOf) => () => {
    const map = baseOf();
    map.leftOut[0].card = 'row004';
    return map;
  };

  it.each([
    ['moved to another section and given a card', fiveCards, 'b4', (beat) => { beat.card = 'row004'; }, 6],
    ['moved to another section with its card cleared', writers, 'b5', (beat) => { delete beat.card; }, 2]
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
    beat.card = 'row004';
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
    ['a card added to a beat in leftOut', sixCards, (map) => { map.leftOut[0].card = 'row004'; }, [['leftOut[#b9].card', '']], 6],
    ['a card cleared from a beat in leftOut', withLeftOutCard(twoCards), (map) => { delete map.leftOut[0].card; }, [['leftOut[#b9].card', '']], 2],
    ['a card beat added straight into leftOut', sixCards,
      (map) => { map.leftOut.push({ id: 'b10', material: 'row004, the receipt', card: 'row004' }); }, [['leftOut[#b10]', 'none']], 6],
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

  // The card check's attribution (editsOnCards) reads only the edits its one caller can meet:
  // a card in a section, so the director gave it, or added or brought back its beat.
  it('a card in a section that names no document is a concern on the edit that put it there: the card given, or the beat added or brought back with it', () => {
    const cards = (findings) => ({
      failures: findings.failures.filter((f) => f.type === 'card-not-in-record').map((f) => f.message),
      concerns: findings.concerns.filter((c) => c.type === 'card-not-in-record').map((c) => [c.editIds, c.finding])
    });
    const given = writers();
    given.sections[1].beats[1].card = 'zzz001';
    expect(cards(mapFindings(given, inputs({ edits: directorsEdits(given) })))).toEqual({
      failures: [], concerns: [[['E1'], 'The card zzz001 names no document in the record.']]
    });
    const added = writers();
    added.sections[0].beats.push({ id: 'b10', material: 'zzz002, a receipt', card: 'zzz002' });
    expect(cards(mapFindings(added, inputs({ edits: directorsEdits(added) })))).toEqual({
      failures: [], concerns: [[['E1'], 'The card zzz002 names no document in the record.']]
    });
    const base = writers();
    base.leftOut[0].card = 'zzz003';
    const back = clone(base);
    back.sections[1].beats.push(back.leftOut.splice(0, 1)[0]);
    expect(cards(mapFindings(back, inputs({ edits: editsAgainst(base, back) })))).toEqual({
      failures: [], concerns: [[['E1'], 'The card zzz003 names no document in the record.']]
    });
    const moved = writers();
    moved.sections[1].beats[0].card = 'zzz004';
    const away = clone(moved);
    away.sections[0].beats.push(away.sections[1].beats.splice(0, 1)[0]);
    expect(cards(mapFindings(away, inputs({ edits: editsAgainst(moved, away) })))).toEqual({
      failures: [expect.stringMatching(/^Cards naming no document in <RECORD>: zzz004 \(beat b3\)\. /)], concerns: []
    });
  });
});
