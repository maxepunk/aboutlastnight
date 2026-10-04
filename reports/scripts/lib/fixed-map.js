'use strict';
/**
 * The story map scripts/render-prompts.js plants when a thread holds no map (phase 4, brief
 * 4.6), as it plants the fixed story meeting (fixed-weave.js): invented text, so a render
 * shows where each part of a map lands in the map's rework prompt, whatever the session.
 *
 * FIXED_MAP_BASELINE is the writer's map, and FIXED_MAP the map as the director left it at
 * the map's stop (the shapes lib/map.js directorMapSchemaFor allows). The director's
 * changes between them, which lib/hand-edit-diff.js standingOnMap reads as the standing
 * edits:
 * - a struck beat: b2, moved from the lede into leftOut;
 * - a moved photo: render-diff-photo-2.jpg, from the story to the lede.
 *
 * The card names a document no record holds and the photos are no session's, so the map
 * checks find failures on every session, and the map's automatic rework has the checks'
 * lines to fix. Beat b1 carries the fixed weave's connection c1, and the one change to the
 * weave names its first edit.
 */

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
        { id: 'b1', kind: 'scene', material: 'RENDER-DIFF BEAT 1: the vote', players: [], connection: 'c1' },
        { id: 'b2', kind: 'line', material: 'RENDER-DIFF BEAT 2: a line from the room', players: [] }
      ],
      photos: [{ filename: 'render-diff-photo-1.jpg', beat: 'b1' }]
    },
    {
      slot: 'theStory',
      heading: 'The Story',
      job: 'RENDER-DIFF JOB 2: how the room built its case.',
      beats: [
        { id: 'b3', kind: 'receipt', material: 'RENDER-DIFF BEAT 3: a document', players: [], card: 'RENDER-DIFF-DOC' }
      ],
      photos: [{ filename: 'render-diff-photo-2.jpg' }]
    }
  ],
  dropped: [{ slot: 'thePlayers', reason: 'RENDER-DIFF REASON: everyone appears above.' }],
  leftOut: [{ id: 'b9', kind: 'scene', material: 'RENDER-DIFF LEFT OUT: a scene the story does not need', players: [] }],
  expectedLength: 900,
  weaveChanges: [{ source: 'E1', change: 'RENDER-DIFF CHANGE: the story the director rewrote at the meeting.' }]
});

/** The map as the director left it: b2 struck into leftOut, the second photo moved to the lede. */
const FIXED_MAP = Object.freeze({
  ...FIXED_MAP_BASELINE,
  sections: [
    {
      ...FIXED_MAP_BASELINE.sections[0],
      beats: [FIXED_MAP_BASELINE.sections[0].beats[0]],
      photos: [...FIXED_MAP_BASELINE.sections[0].photos, FIXED_MAP_BASELINE.sections[1].photos[0]]
    },
    { ...FIXED_MAP_BASELINE.sections[1], photos: [] }
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
