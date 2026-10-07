/**
 * A map in the shape of the corkboard's mock-up (phase 4b, piece 4, brief 4B; spec 2026-10-07
 * sections 4 and 8): five sections, sixteen moves, each with its people and its synopsis, three
 * cards, ten photos (the top photo, six beside a move and three by themselves) and two moves left
 * out, laid over the story-level weave (fixtures/story-level-weave.js). Every line is in story
 * terms, every thread in the story is carried, every connection lands and every roster player is
 * placed, so every map check passes.
 *
 * Invented text: the repo is public. Not a test file (jest's testMatch is *.test.js).
 */

const { piece } = require('./story-level-weave');
const { storyLevelMapState, cardPiece } = require('./story-level-map');

const clone = (v) => JSON.parse(JSON.stringify(v));

/** A beat of the board: its words, people, synopsis and threads, with one piece of the notes under it. */
const beat = (id, move, players, synopsis, threads, extra = {}) => ({
  id, move, players, synopsis, threads, kind: 'scene', evidence: [piece(['notes'], 'The room votes for an accident.')], ...extra
});

/** The writer's map. */
const BOARD_MAP = {
  headline: 'Ten Votes Call the Trial Run an Accident',
  deck: "The room called Marcus Blackwood's death an overdose, and the people who stand to gain waited it out.",
  topPhoto: 'p01.jpg',
  sections: [
    {
      slot: 'lede', heading: '', job: 'Opens on the vote and poses the question.',
      beats: [
        beat('b1', 'The room settles on an accident', ['Quinn', 'Kai'], 'Near the end, Quinn and Kai steer the room toward calling the death an accident, and the vote follows.', ['t1']),
        beat('b2', 'Alex wonders if everyone was dosed', ['Alex'], 'Alex asks whether Marcus dosed the whole party, and the room moves past the question without an answer.', ['t1', 't6'], { connection: 'c4' })
      ],
      photos: [{ filename: 'p02.jpg', beat: 'b1' }]
    },
    {
      slot: 'theStory', heading: 'The Trial Run', job: "Builds the room's case, then turns it.",
      beats: [
        beat('b3', 'Marcus tests the batch on himself', ['Sam'], "Sam's journal shows Marcus trying the new batch on himself in the days before the party.", ['t2'], { card: true, kind: 'receipt', evidence: [cardPiece(['sam001'], 'Sam writes that Marcus is trying the batch on himself.')] }),
        beat('b4', 'Marcus asks Quinn to raise the dose', ['Quinn'], "An email has Marcus asking Quinn to raise the dose for the pilot, which sits badly beside Quinn's account.", ['t3', 't2'], { connection: 'c2', card: true, kind: 'receipt', evidence: [cardPiece(['p-email'], 'Marcus asks Quinn to raise the dose.')] }),
        beat('b5', 'Jess warns Sarah away', ['Jess', 'Sarah'], 'Jess warns Sarah that Marcus tests every batch on himself, and keeps her clear of the vote.', ['t2'], { card: true, kind: 'receipt', evidence: [cardPiece(['jes002'], 'Jess warns Sarah about the batch.')] }),
        beat('b6', 'Quinn tells the room another story', ['Quinn'], "Quinn's account to the room leaves out the dose Marcus asked for, and nobody presses the gap.", ['t4']),
        beat('b7', 'The trial run comes to light', ['Sam', 'Kai'], 'Sam and Kai piece together that the party was a trial of the batch on its own guests.', ['t3']),
        beat('b8', 'Remi presses Quinn and backs off', ['Remi', 'Quinn'], 'Remi pushes Quinn on the dose, then lets it drop when the room turns toward the vote.', ['t4'])
      ],
      photos: [{ filename: 'p03.jpg', beat: 'b3' }, { filename: 'p04.jpg', beat: 'b6' }, { filename: 'p05.jpg' }]
    },
    {
      slot: 'followTheMoney', heading: 'Follow the Money', job: 'Sets what was sold against the case.',
      beats: [
        beat('b9', 'The first memories go early', ['Kai'], 'The first memories are sold soon after the doors close, long before the room has a theory.', ['t5']),
        beat('b10', 'Sales spike as the trial run surfaces', ['Kai', 'Sam'], 'Selling jumps in the same stretch that the trial run comes to light in the room.', ['t5', 't3'], { connection: 'c3' }),
        beat('b11', 'The heaviest selling before the vote', ['Alex'], 'The heaviest selling of the morning comes just before the room sits down to vote.', ['t5'])
      ],
      photos: [{ filename: 'p06.jpg' }]
    },
    {
      slot: 'thePlayers', heading: 'The Successors', job: 'Shows who gains when the case closes.',
      beats: [
        beat('b12', 'Quinn and Alex wait to be named', ['Quinn', 'Alex'], 'The company holds off naming Quinn and Alex as successors until the case is closed.', ['t7', 't4'], { connection: 'c1' }),
        beat('b13', 'Alex laughs with Jess, untouched', ['Alex', 'Jess'], "Alex spends the morning at the bar with Jess, and none of the room's theories names her.", ['t7']),
        beat('b14', 'The truth around Marcus bends again', ['Sarah'], 'Sarah recalls how often the story around Marcus has been bent, and the room shrugs it off.', ['t6'])
      ],
      photos: [{ filename: 'p07.jpg', beat: 'b12' }, { filename: 'p08.jpg', beat: 'b13' }]
    },
    {
      slot: 'closing', heading: '', job: 'Lands where the gains drift.',
      beats: [
        beat('b15', 'The verdict clears every hand', ['Quinn', 'Kai'], 'The accident verdict leaves every hand in the room clean, the hands that gain among them.', ['t1', 't7']),
        beat('b16', 'A launch waits on the closed case', ['Alex'], 'A bigger launch waits on the closed case, with Alex in line to lead it.', ['t7'])
      ],
      photos: [{ filename: 'p09.jpg', beat: 'b16' }, { filename: 'p10.jpg' }]
    }
  ],
  dropped: [{ slot: 'whatsMissing', reason: "Its questions land in the closing." }],
  leftOut: [
    beat('b17', 'The other suspects let go', ['Remi'], 'The room weighs three other suspects and lets each of them go.', ['t8']),
    beat('b18', 'An old grudge at the bar', ['Kai'], 'Two old grudges flare at the bar before the count.', ['t10'])
  ],
  expectedLength: 1350,
  weaveChanges: []
};

/** The ten photos, each with the description the director gave it at the character-IDs stop. */
const BOARD_PHOTOS = Object.fromEntries(Array.from({ length: 10 }, (_, i) => {
  const name = `p${String(i + 1).padStart(2, '0')}.jpg`;
  return [name, `The room at the board, photo ${i + 1}`];
}));

/** A fresh copy of the board's map. */
function boardMap() {
  return clone(BOARD_MAP);
}

/** A state paused at the map with the board's map in hand and its ten photos kept. */
function boardMapState(overrides = {}) {
  const map = boardMap();
  return storyLevelMapState({
    outline: map,
    _mapBaseline: clone(map),
    sessionPhotos: Object.keys(BOARD_PHOTOS).map((name) => `photos/${name}`),
    photoAnalyses: { analyses: [] },
    photoDescriptions: { ...BOARD_PHOTOS },
    ...overrides
  });
}

module.exports = { BOARD_MAP, BOARD_PHOTOS, boardMap, boardMapState };
