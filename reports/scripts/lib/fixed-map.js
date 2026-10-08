'use strict';
/**
 * The story map scripts/render-prompts.js plants when a thread holds no map (phase 4, brief
 * 4.6), as it plants the fixed story meeting (fixed-weave.js): invented text, so a render
 * shows where each part of a map lands in the map's rework prompt, whatever the session.
 * Since phase 4b (brief 1D) it is in the story-level shape: each beat a move with its people,
 * its synopsis (piece 4, brief 4B), the threads it carries and its evidence underneath, one beat marked as a card with the card's
 * document flagged on a piece.
 *
 * FIXED_MAP_BASELINE is the writer's map, and FIXED_MAP the map as the director left it at
 * the map's stop (the shapes lib/map.js directorMapSchemaFor allows). The director's
 * changes between them, which lib/hand-edit-diff.js standingOnMap reads as the standing
 * edits:
 * - a summary rewritten: b1's synopsis (piece 4, brief 4C; R11), which <HAND_EDITS> names as the
 *   summary of its beat;
 * - a struck beat: b2, moved from the lede into leftOut;
 * - a moved photo: render-diff-photo-2.jpg, from the story to the lede;
 * - the story's order: b4 moved above b3 (piece 4, brief 4C; R3), which <HAND_EDITS> lists as the
 *   order of the section's moves, by their titles.
 *
 * The card beat b3 flags a piece whose source is a document no record holds, RENDER-DIFF-DOC,
 * as the fixed weave's evidence names it, and the photos are no session's, so the map checks
 * find failures on every session (the card check and the evidence check among them), and the
 * map's automatic rework has the checks' lines to fix. Every other piece names the ledger or the
 * director's notes and quotes nothing, so the planted map reads the same against every session's
 * record. The beats carry the fixed weave's threads in the story (t1, t2 and t4), beat b1 its
 * connection c1, and the one change to the weave names its first edit, in the meeting's own
 * form, as the settled weave marks it (M1; brief 4.14a). How a render plants it is
 * scripts/render-prompts.js's.
 */

/** A piece of evidence, as a beat carries it (lib/evidence.js EVIDENCE_PIECE_SCHEMA). */
const piece = (sources, shows, stance = 'supports') => ({ sources, shows, stance });

const FIXED_MAP_BASELINE = Object.freeze({
  headline: 'RENDER-DIFF HEADLINE: the room named one account',
  deck: 'RENDER-DIFF DECK: the record tells a second one.',
  topPhoto: 'render-diff-top.jpg',
  gapNote: { line: 'RENDER-DIFF GAP: the record holds nothing one player did.', players: ['RENDER-DIFF PLAYER'] },
  sections: [
    {
      slot: 'lede',
      heading: '',
      job: 'RENDER-DIFF JOB 1: open on the vote and ask the question.',
      beats: [
        {
          id: 'b1', move: 'RENDER-DIFF MOVE 1: the vote', players: [], synopsis: 'RENDER-DIFF SYNOPSIS 1: the room settles on its verdict by a vote.', threads: ['t1', 't2'], connection: 'c1', kind: 'scene',
          evidence: [piece(['notes'], 'RENDER-DIFF PIECE 1: the notes record the vote.')]
        },
        {
          id: 'b2', move: 'RENDER-DIFF MOVE 2: a line from the room', players: [], synopsis: 'RENDER-DIFF SYNOPSIS 2: one player says what the room would not.', threads: ['t2'], kind: 'line',
          evidence: [piece(['notes'], 'RENDER-DIFF PIECE 2: a line the notes record.')]
        }
      ],
      photos: [{ filename: 'render-diff-photo-1.jpg', beat: 'b1' }]
    },
    {
      slot: 'theStory',
      heading: 'The Story',
      job: 'RENDER-DIFF JOB 2: how the room built its case.',
      beats: [
        {
          id: 'b3', move: 'RENDER-DIFF MOVE 3: a document', players: [], synopsis: 'RENDER-DIFF SYNOPSIS 3: a document tells a second account of the night.', threads: ['t4'], card: true, kind: 'receipt',
          evidence: [{ ...piece(['RENDER-DIFF-DOC'], 'RENDER-DIFF PIECE 3: a document no record holds.'), card: true }]
        },
        {
          id: 'b4', move: 'RENDER-DIFF MOVE 4: the room turns', players: [], synopsis: 'RENDER-DIFF SYNOPSIS 5: the room turns on its own account.', threads: ['t2'], kind: 'scene',
          evidence: [piece(['notes'], 'RENDER-DIFF PIECE 5: the notes record the turn.')]
        }
      ],
      photos: [{ filename: 'render-diff-photo-2.jpg' }]
    }
  ],
  dropped: [{ slot: 'thePlayers', reason: 'RENDER-DIFF REASON: everyone appears above.' }],
  leftOut: [
    {
      id: 'b9', move: 'RENDER-DIFF LEFT OUT: a scene the story does not need', players: [], synopsis: 'RENDER-DIFF SYNOPSIS 4: a scene the story does not need.', threads: ['t1'], kind: 'scene',
      evidence: [piece(['ledger'], 'RENDER-DIFF PIECE 4: one sale.')]
    }
  ],
  expectedLength: 900,
  weaveChanges: [{ source: 'M1', change: 'RENDER-DIFF CHANGE: the story the director rewrote at the meeting.' }]
});

/** The map as the director left it: b1's summary rewritten, b2 struck into leftOut, the second photo moved to the lede, b4 above b3. */
const FIXED_MAP = Object.freeze({
  ...FIXED_MAP_BASELINE,
  sections: [
    {
      ...FIXED_MAP_BASELINE.sections[0],
      beats: [{ ...FIXED_MAP_BASELINE.sections[0].beats[0], synopsis: "RENDER-DIFF SUMMARY EDIT: the director's sentence for the vote." }],
      photos: [...FIXED_MAP_BASELINE.sections[0].photos, FIXED_MAP_BASELINE.sections[1].photos[0]]
    },
    { ...FIXED_MAP_BASELINE.sections[1], beats: [FIXED_MAP_BASELINE.sections[1].beats[1], FIXED_MAP_BASELINE.sections[1].beats[0]], photos: [] }
  ],
  leftOut: [...FIXED_MAP_BASELINE.leftOut, FIXED_MAP_BASELINE.sections[0].beats[1]]
});

/** A fresh copy of the map as the director left it, for a state to hold. */
function fixedMap() {
  return JSON.parse(JSON.stringify(FIXED_MAP));
}

/** A fresh copy of the writer's map the director's changes are read against. */
function fixedMapBaseline() {
  return JSON.parse(JSON.stringify(FIXED_MAP_BASELINE));
}

module.exports = { FIXED_MAP, FIXED_MAP_BASELINE, fixedMap, fixedMapBaseline };
