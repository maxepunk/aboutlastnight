/**
 * A story map at the level of the story, with its evidence underneath, for the story-level weave
 * (phase 4b, piece 1, brief 1D; spec 2026-10-05 sections 4.2 and 5): each section's job; each
 * beat a move in a few plain words with its people, the threads it carries and the pieces of the
 * record that tell it, and its synopsis, one sentence in story terms (piece 4, brief 4B); three
 * moves marked as cards, each flagging the piece whose document it
 * prints; every thread in the story carried, every connection landed, every roster player placed
 * or raised in the gap note, and every kept photo placed once. Every line is in story terms, and
 * every piece names a source the story-level record holds, its quotations word for word, so
 * every map check passes.
 *
 * Invented text: the repo is public.
 *
 * Not a test file (jest's testMatch is *.test.js).
 */

const { storyLevelState, piece } = require('./story-level-weave');

const clone = (v) => JSON.parse(JSON.stringify(v));

/** A piece flagged as its beat's card: its document prints as the card (C9). */
const cardPiece = (sources, shows) => ({ ...piece(sources, shows), card: true });

/** The writer's map for the story-level weave. */
const STORY_LEVEL_MAP = {
  headline: 'Ten Votes Call the Trial Run an Accident',
  deck: "By ten votes, the room called Marcus Blackwood's death an overdose that left every hand clean.",
  topPhoto: 'top.jpg',
  gapNote: { line: 'The notes record nothing Remi did in the room.', players: ['Remi'] },
  sections: [
    {
      slot: 'lede', heading: '', job: 'Opens on the vote and asks the question.',
      beats: [
        {
          id: 'b1', move: "Alex's late theory that Marcus dosed everyone", players: ['Alex'], synopsis: 'Late in the count, Alex asks whether Marcus dosed everyone, and the room moves past it.', threads: ['t1', 't6'], connection: 'c4', kind: 'scene',
          evidence: [piece(['notes'], 'Alex asks the room if Marcus had dosed them all.')]
        },
        {
          id: 'b2', move: 'The quick vote for an accident', players: ['Quinn', 'Kai'], synopsis: 'Quinn and Kai lead a quick vote that calls the death an accident.', threads: ['t1'], kind: 'scene',
          evidence: [piece(['notes'], 'The room votes for an accident.')]
        }
      ],
      photos: []
    },
    {
      slot: 'theStory', heading: 'The Story', job: "The room's case for an accident, then the turn.",
      beats: [
        {
          id: 'b3', move: 'Marcus trying the batch on himself', players: ['Sam'], synopsis: "Sam's journal shows Marcus trying the batch on himself before the party.", threads: ['t2'], card: true, kind: 'receipt',
          evidence: [cardPiece(['sam001'], 'Sam writes, "I think he is trying the new batch on himself"'), piece(['jes002'], 'Jess warns Sarah he tests every batch on himself.')]
        },
        {
          id: 'b4', move: 'Marcus asks Quinn for a higher dose', players: ['Quinn'], synopsis: "Marcus asks Quinn to raise the dose, which sits badly beside Quinn's story.", threads: ['t3', 't4'], connection: 'c2', card: true, kind: 'receipt',
          evidence: [cardPiece(['p-email'], 'Marcus asks Quinn to "raise the dose for the pilot"')]
        },
        {
          id: 'b5', move: 'Jess warns Sarah', players: ['Jess', 'Sarah'], synopsis: 'Jess warns Sarah that Marcus tests every batch on himself first.', threads: ['t2'], card: true, kind: 'receipt',
          evidence: [cardPiece(['jes002'], 'Jess warns Sarah, "You know he tests every batch on himself first."')]
        }
      ],
      photos: [{ filename: 'board.jpg', beat: 'b3' }, { filename: 'bar.jpg' }]
    },
    {
      slot: 'followTheMoney', heading: 'Follow the Money', job: 'What was sold while the room argued.',
      beats: [
        {
          id: 'b6', move: 'The memories sold off as the trial run surfaced', players: ['Kai'], synopsis: 'Memories sell off one after another as the trial run comes to light.', threads: ['t5', 't3'], connection: 'c3', kind: 'figure',
          evidence: [piece(['ledger', 'evidence-log'], 'The sale into Rich follows the warning turned in.')]
        }
      ],
      photos: []
    },
    {
      slot: 'closing', heading: '', job: 'Where the threads meet.',
      beats: [
        {
          id: 'b7', move: 'The successors wait on the case', players: ['Quinn', 'Alex'], synopsis: 'The company waits for the case to close before naming Quinn and Alex as successors.', threads: ['t7', 't4'], connection: 'c1', kind: 'scene',
          evidence: [piece(['notes'], 'The pilot run was for a bigger launch.')]
        }
      ],
      photos: []
    }
  ],
  dropped: [
    { slot: 'thePlayers', reason: 'Every player appears above.' },
    { slot: 'whatsMissing', reason: "Its question is the closing's." }
  ],
  leftOut: [
    {
      id: 'b9', move: 'The other suspects let go', players: [], synopsis: 'The room weighs three other suspects and lets each of them go.', threads: ['t1'], kind: 'scene',
      evidence: [piece(['notes'], 'Alex asks the room if Marcus had dosed them all.')]
    }
  ],
  expectedLength: 1400,
  weaveChanges: []
};

/** A fresh copy of the writer's map. */
function storyLevelMap() {
  return clone(STORY_LEVEL_MAP);
}

/** The photos the director kept, with the descriptions they gave at the character-IDs stop. */
const PHOTO_DESCRIPTIONS = {
  'top.jpg': 'Quinn, Kai and Alex at the evidence screen as the final count begins',
  'board.jpg': 'Sam reading the journal by the board',
  'bar.jpg': 'Jess and Sarah at the bar'
};

/** A state paused at the map: the story-level weave approved, the writer's map in hand, the photos kept with their descriptions. */
function storyLevelMapState(overrides = {}) {
  const map = storyLevelMap();
  return storyLevelState({
    meetingApproved: true,
    outline: map,
    _mapBaseline: clone(map),
    sessionPhotos: ['photos/top.jpg', 'photos/board.jpg', 'photos/bar.jpg'],
    photoAnalyses: { analyses: [{ filename: 'top.jpg', identifiedCharacters: ['Quinn', 'Kai', 'Alex'] }] },
    photoDescriptions: { ...PHOTO_DESCRIPTIONS },
    directorGateNotes: [],
    outlineRevisionCount: 0,
    humanOutlineRevisionCount: 0,
    ...overrides
  });
}

module.exports = { STORY_LEVEL_MAP, storyLevelMap, storyLevelMapState, PHOTO_DESCRIPTIONS, cardPiece };
