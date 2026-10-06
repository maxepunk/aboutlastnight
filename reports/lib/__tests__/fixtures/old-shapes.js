'use strict';
/**
 * A weave and a map in phase 4's shapes, as a session paused at the story meeting or a later
 * stop holds them when phase 4b lands (phase 4b, brief 1G; spec 2026-10-05 section 10). Each
 * thread is a claim pinned to one receipt and has no line; each connection carries its
 * detail and no line; each beat is named by its material and has no move. The shapes are
 * those of scripts/lib/fixed-weave.js and fixed-map.js at b44a37ba, the last phase 4 commit.
 * The text is invented: the repo is public.
 *
 * The director's changes at each stop are in phase 4's shapes too: an edit on a thread's
 * claim at the meeting, and on a beat's material at the map.
 */

/** The weave the phase 4 writer wrote, as the meeting showed it, with the fact check's mark. */
const OLD_SHAPE_WEAVE = Object.freeze({
  story: 'OLD-SHAPE STORY: the room settled on an overdose, and the ledger tells a second story.',
  question: 'OLD-SHAPE QUESTION: whose money moved while the room argued?',
  headline: 'OLD-SHAPE HEADLINE',
  threads: [
    { id: 't1', claim: "OLD-SHAPE CLAIM 1: ten voted overdose after Alex's 'Could it be an accident?'", role: 'main-thread', receipt: 'ledger', verdict: true },
    { id: 't2', claim: 'OLD-SHAPE CLAIM 2: the last sale landed at 09:58 for $450,000.', role: 'grounds-it', receipt: 'ledger' },
    { id: 't3', claim: 'OLD-SHAPE CLAIM 3: a thread the story does not need.', role: 'left-out', receipt: 'ledger', reason: 'OLD-SHAPE REASON: one line of the record.' }
  ],
  connections: [
    { id: 'c1', kind: 'moment', joins: ['t1', 't2'], detail: 'OLD-SHAPE DETAIL: the vote and the last sale share a minute.' }
  ],
  convergence: 'OLD-SHAPE CONVERGENCE: the two stories meet at the close.',
  questions: [],
  _factCheck: { at: '2026-10-02T00:00:00.000Z', ready: true, fixes: 0 }
});

/** The director's edit at the meeting, in phase 4's shape: a claim they rewrote. */
const OLD_SHAPE_WEAVE_EDITS = Object.freeze({
  kind: 'weave',
  issued: 1,
  edits: [{ id: 'E1', scope: 'weave', path: 'threads[#t2].claim', at: [{ key: 'threads' }, { id: 't2' }, { key: 'claim' }], before: OLD_SHAPE_WEAVE.threads[1].claim, after: "OLD-SHAPE: the director's claim." }]
});

/** The map the phase 4 writer wrote: beats named by their material, one struck into left out. */
const OLD_SHAPE_MAP = Object.freeze({
  headline: 'OLD-SHAPE HEADLINE: the room named an overdose',
  deck: 'OLD-SHAPE DECK: the ledger tells a second story.',
  topPhoto: 'old-shape-top.jpg',
  sections: [
    {
      slot: 'lede',
      heading: '',
      job: 'OLD-SHAPE JOB 1: open on the vote.',
      beats: [
        { id: 'b1', kind: 'scene', material: "OLD-SHAPE MATERIAL 1: Alex's line at the vote", players: ['Alex'], connection: 'c1' }
      ],
      photos: [{ filename: 'old-shape-1.jpg', beat: 'b1' }]
    },
    {
      slot: 'theStory',
      heading: 'The Story',
      job: 'OLD-SHAPE JOB 2: how the money moved.',
      beats: [
        { id: 'b2', kind: 'receipt', material: 'OLD-SHAPE MATERIAL 2: the ledger at 09:58', players: ['Morgan'], card: 'ledger' }
      ],
      photos: []
    }
  ],
  dropped: [],
  leftOut: [{ id: 'b9', kind: 'line', material: 'OLD-SHAPE LEFT OUT: a line the story does not need', players: [] }],
  expectedLength: 900,
  weaveChanges: []
});

/** The director's edit at the map, in phase 4's shape: a beat's material they rewrote. */
const OLD_SHAPE_MAP_EDITS = Object.freeze({
  kind: 'outline',
  issued: 1,
  edits: [{ id: 'E1', scope: 'outline', path: 'sections[#theStory].beats[#b2].material', at: [{ key: 'sections' }, { slot: 'theStory' }, { key: 'beats' }, { id: 'b2' }, { key: 'material' }], before: OLD_SHAPE_MAP.sections[1].beats[0].material, after: "OLD-SHAPE: the director's material." }]
});

const clone = (value) => JSON.parse(JSON.stringify(value));

/** A fresh copy of the old-shape weave, for a state to hold. */
function oldShapeWeave() {
  return clone(OLD_SHAPE_WEAVE);
}

/** A fresh copy of the old-shape map, for a state to hold. */
function oldShapeMap() {
  return clone(OLD_SHAPE_MAP);
}

/**
 * What a session on the old shapes holds at the meeting's stop: the weave as the writer and
 * the director left it, the director's edit, the meeting's marks and report, and the checks'
 * last result on it.
 */
function oldShapeMeetingChannels() {
  return {
    weave: oldShapeWeave(),
    _weaveBaseline: oldShapeWeave(),
    _weaveHandEdits: clone(OLD_SHAPE_WEAVE_EDITS),
    _weaveMarks: { round: 1, from: oldShapeWeave(), marks: [] },
    _weaveHandEditReport: { checked: ['E1'], changed: [] },
    _arcValidation: { weaveKey: 'old-shape-key', passed: true, failures: [], concerns: [], checkedAt: '2026-10-02T00:00:00.000Z' }
  };
}

/** What it holds at the map's stop besides: the approved meeting, and the map with its edit, baseline and check. */
function oldShapeMapChannels() {
  return {
    ...oldShapeMeetingChannels(),
    _weaveMarks: null,
    _weaveHandEditReport: null,
    meetingApproved: true,
    outline: oldShapeMap(),
    _mapBaseline: oldShapeMap(),
    _outlineHandEdits: clone(OLD_SHAPE_MAP_EDITS),
    _mapCheck: { mapKey: 'old-shape-map-key', passed: true, failures: [], concerns: [] },
    heroImage: 'old-shape-top.jpg'
  };
}

module.exports = {
  OLD_SHAPE_WEAVE,
  OLD_SHAPE_WEAVE_EDITS,
  OLD_SHAPE_MAP,
  OLD_SHAPE_MAP_EDITS,
  oldShapeWeave,
  oldShapeMap,
  oldShapeMeetingChannels,
  oldShapeMapChannels
};
