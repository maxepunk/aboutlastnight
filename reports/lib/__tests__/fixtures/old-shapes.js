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
 *
 * Piece 3 (brief 3E; spec 2026-10-06 section 13; R6) adds piece 1's shape, as a session paused
 * at the story meeting or a later stop holds it when piece 3 lands: one story at the top of the
 * weave (its story, question, headline and convergence), each thread in a role with its line
 * and evidence, a left-out thread with its reason, and no angles. Its map is in the shape the
 * map still has, since piece 3 changes only the weave. The text is invented: the repo is public.
 */

const { MAP } = require('./rework-state');

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

/** A piece of evidence under a line, in the shape piece 1 and piece 3 share. */
const piece = (sources, shows) => ({ sources, shows, stance: 'supports' });

/**
 * The weave the piece 1 writer wrote, as the meeting showed it, with the fact check's mark: one
 * story, threads in roles, a left-out thread with its reason, the convergence and a stronger
 * main thread, and no angles.
 */
const PIECE_ONE_WEAVE = Object.freeze({
  story: 'PIECE-ONE STORY: the room settled on an overdose, and the ledger tells a second story.',
  question: 'PIECE-ONE QUESTION: whose money moved while the room argued?',
  headline: 'PIECE-ONE HEADLINE',
  threads: [
    { id: 't1', name: 'PIECE-ONE THREAD 1', line: 'PIECE-ONE LINE 1: the room voted for an overdose.', role: 'main-thread', verdict: true, evidence: [piece(['notes'], 'PIECE-ONE PIECE 1: the notes record the vote.')] },
    { id: 't2', name: 'PIECE-ONE THREAD 2', line: 'PIECE-ONE LINE 2: the money moved late in the morning.', role: 'grounds-it', evidence: [piece(['ledger'], 'PIECE-ONE PIECE 2: the ledger holds the last sales.')] },
    { id: 't3', name: 'PIECE-ONE THREAD 3', line: 'PIECE-ONE LINE 3: a thread the story does not need.', role: 'left-out', reason: 'PIECE-ONE REASON: one line of the record.', evidence: [piece(['ledger'], 'PIECE-ONE PIECE 3: one sale.')] }
  ],
  connections: [
    { id: 'c1', joins: ['t1', 't2'], line: 'PIECE-ONE CONNECTION: the vote and the last sale share a minute.', kind: 'moment', evidence: [piece(['notes', 'ledger'], 'PIECE-ONE PIECE 4: the vote beside the last sale.')] }
  ],
  convergence: 'PIECE-ONE CONVERGENCE: the two stories meet at the close.',
  strongerMainThread: { thread: 't2', reason: 'PIECE-ONE: the money carries a stronger story.' },
  questions: [{ id: 'q1', kind: 'figure', about: 'PIECE-ONE figure', question: 'PIECE-ONE QUESTION 1: is this entry right?', changes: 'PIECE-ONE: the money line.', answer: 'PIECE-ONE: yes.' }],
  _factCheck: { at: '2026-10-05T00:00:00.000Z', ready: true, fixes: 0 }
});

/** The director's edit at the meeting, in piece 1's shape: a thread they moved into another role. */
const PIECE_ONE_WEAVE_EDITS = Object.freeze({
  kind: 'weave',
  issued: 1,
  edits: [{ id: 'E1', scope: 'weave', path: 'threads[#t2].role', at: [{ key: 'threads' }, { id: 't2' }, { key: 'role' }], before: 'grounds-it', after: 'complicates-it' }]
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

/** A fresh copy of piece 1's weave, for a state to hold. */
function pieceOneWeave() {
  return clone(PIECE_ONE_WEAVE);
}

/**
 * What a session on piece 1's shapes holds at the meeting's stop: the weave as the writer and
 * the director left it, the director's edit, the meeting's marks and report, and the checks'
 * last result on it.
 */
function pieceOneMeetingChannels() {
  return {
    weave: pieceOneWeave(),
    _weaveBaseline: pieceOneWeave(),
    _weaveHandEdits: clone(PIECE_ONE_WEAVE_EDITS),
    _weaveMarks: { round: 1, from: pieceOneWeave(), marks: [] },
    _weaveHandEditReport: { checked: ['E1'], changed: [] },
    _arcValidation: { weaveKey: 'piece-one-key', passed: true, failures: [], concerns: [], checkedAt: '2026-10-05T00:00:00.000Z' }
  };
}

/** What it holds at the map's stop besides: the approved meeting, and a map in the shape the map still has. */
function pieceOneMapChannels() {
  return {
    ...pieceOneMeetingChannels(),
    _weaveMarks: null,
    _weaveHandEditReport: null,
    meetingApproved: true,
    outline: clone(MAP),
    _mapBaseline: clone(MAP),
    _outlineHandEdits: null,
    heroImage: MAP.topPhoto || null
  };
}

module.exports = {
  PIECE_ONE_WEAVE,
  PIECE_ONE_WEAVE_EDITS,
  pieceOneWeave,
  pieceOneMeetingChannels,
  pieceOneMapChannels,
  OLD_SHAPE_WEAVE,
  OLD_SHAPE_WEAVE_EDITS,
  OLD_SHAPE_MAP,
  OLD_SHAPE_MAP_EDITS,
  oldShapeWeave,
  oldShapeMap,
  oldShapeMeetingChannels,
  oldShapeMapChannels
};
