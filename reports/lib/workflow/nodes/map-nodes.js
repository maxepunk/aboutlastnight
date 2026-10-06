/**
 * The map checks' node (phase 4, brief 4.6; spec 5.4): free code checks on the map the
 * writer or a rework returned, before the map's stop opens. No model judge reads the map.
 *
 * The checks (lib/map.js mapFindings) read the map against the session: the roster, the
 * photos kept for the article, the record's document ids, the threads and the connections of
 * the angle the director settled (lib/weave.js settledAngleOf: its threads, and the connections
 * between them that the director did not strike; phase 4b, piece 3, brief 3B), and the
 * director's changes and note at the meeting. A failure the director caused on the map is a concern on their edit, never a
 * rework.
 *
 * Phase 4b (piece 1, brief 1D; spec 2026-10-05 sections 4.2 and 6.1): the checks also read the
 * evidence under each beat against the record (lib/evidence.js evidenceContextOf), and the map's
 * page as it first opens, counted with its overhead (mapPageWords), so the writer's own words
 * are held to the allowance lib/word-count.js pageLengthOf's rule gives. Each failure carries its
 * place, so the map shows a check still failing beside its line.
 *
 * They mark the map they checked (`_mapCheck`, stamped with its mapKey) and write
 * validationResults on every outcome, under their own source (lib/map.js MAP_CHECKS_SOURCE;
 * node-helpers.js CODE_CHECKS), so a failed check's rework reads the check's lines. The
 * routing (graph.js routeMapChecks) sends a failed check back for one automatic rework per
 * round (REVISION_CAPS.OUTLINE), and opens the stop with a check still failing after it.
 *
 * The writer and every rework return their map unchecked (`_mapCheck: null`), so the checks
 * run once on each map. On a replay, and after going back to the map (R9), the map in hand
 * is marked, so the checks skip and no rework runs again on it. That skip stamps the checks'
 * phase, as their run does (brief 4.6b), so the stop opens at one phase on every path and
 * the map's resource endpoint (server.js RESOURCE_ENDPOINTS) reads the map as available.
 */
'use strict';

const { PHASES } = require('../state');
const { traceNode } = require('../../observability');
const {
  mapFindings, mapKey, mapRosterOf, meetingEditIdsOf, meetingNoteOf, topPhotoOf, mapCheckpointData,
  mapDirectorsShare, mapWritersShareOf, mapWritersTextBlank, mapLengthOf, MAP_CHECKS_SOURCE
} = require('../../map');
const { meetingDirectorsThreads } = require('../../meeting');
const { carriedEdits, directorEditConcern } = require('../../hand-edit-diff');
const { weaveIdOf, settledAngleOf } = require('../../weave');
const { evidenceContextOf } = require('../../evidence');
const { stopPage, wordsShown, PAGE_REGIONS } = require('../../stop-pages');
const { wordCount } = require('../../word-count');
const { CHECKPOINT_TYPES } = require('../checkpoint-helpers');
const { keptPhotoFilenames } = require('./ai-nodes');

/** The map's stop type, whose page the check counts. */
const MAP_STOP = CHECKPOINT_TYPES.OUTLINE;

/** The page's region of Everyone and the counts, which code prints from the map as it is. */
const TALLY_REGION = PAGE_REGIONS[MAP_STOP].tally;

/**
 * The map stop's payload on a first look at a map: no round's lines, no check's mark, no
 * concern and no standing note, so its page is the one the writer's map opens on.
 */
function firstLookData(state, map) {
  const firstLook = {
    ...state,
    outline: map,
    _mapCheck: null,
    _outlineHandEdits: null,
    _outlineHandEditReport: null,
    _outlineRework: null,
    directorGateNotes: [],
    outlineRevisionCount: 0,
    humanOutlineRevisionCount: 0
  };
  return mapCheckpointData(firstLook, { keptPhotos: keptPhotoFilenames(state, topPhotoOf(map)), evidenceIndex: {}, maxRevisions: 0 });
}

/** The words of a page's lines that `keep` takes and no fold holds, as wordsShown counts them. */
function wordsOfLines(data, keep) {
  return stopPage(MAP_STOP, data).lines.filter((line) => !line.folded && keep(line)).reduce((sum, line) => sum + wordCount(line.text), 0);
}

/**
 * The length of the map's page as it first opens, of the writer's share of the map (phase 4b,
 * brief 1D; spec 4.2 and 6.1; R5, and lib/word-count.js pageLengthOf's rule): `{page, writer,
 * allowance}` (mapLengthOf).
 * - The page's words: the stop's page (lib/map.js mapCheckpointData) on a first look, counted by
 *   lib/stop-pages.js wordsShown, the count the stops log records, which leaves the folded
 *   evidence out. Only the writer's share is counted (mapWritersShareOf), so the director's
 *   version is never held to the bound (Review focus 3).
 * - Its overhead, the words the writer did not write: the same page with every text field the
 *   writer writes left blank (mapWritersTextBlank). Everyone and the counts are read from the page
 *   as it is, since a beat's players left blank would empty Everyone and list every player as in
 *   no beat, a line the page does not print.
 *
 * @param {Object} state - the session: the settled weave, the roster, the photos and their descriptions
 * @param {Object} map - the map in hand
 * @param {Object[]} edits - the director's standing edits the map carries
 * @returns {{page: number, writer: number, allowance: number}}
 */
function mapPageWords(state, map, edits) {
  const share = mapWritersShareOf(map, mapDirectorsShare(edits));
  const page = firstLookData(state, share);
  const blank = firstLookData(state, mapWritersTextBlank(share));
  const inTally = (line) => line.region === TALLY_REGION;
  const overhead = wordsOfLines(blank, (line) => !inTally(line)) + wordsOfLines(page, inTally);
  return mapLengthOf(wordsShown(MAP_STOP, page), overhead);
}

/**
 * The threads in the story the director settled (state.weave), each `{id, name, added,
 * broughtIn}`, as lib/map.js mapFindings takes them: the picked angle's threads, in its order
 * (lib/weave.js settledAngleOf; phase 4b, piece 3, brief 3B), `added` on one the director added
 * at the meeting and `broughtIn` on one they brought into the story (lib/meeting.js
 * meetingDirectorsThreads; fix round 4), which the map may name in its gap note instead of a beat
 * when the record cannot carry it (spec 5.3).
 *
 * @param {Object} state
 * @returns {Array<{id: string, name: string, added: boolean, broughtIn: boolean}>}
 */
function settledWeaveThreadsOf(state) {
  const settled = settledAngleOf(state.weave);
  if (!settled) return [];
  const directors = new Map(meetingDirectorsThreads(state).map((thread) => [thread.id, thread]));
  return settled.threads
    .filter((thread) => weaveIdOf(thread))
    .map((thread) => {
      const id = weaveIdOf(thread);
      const theirs = directors.get(id);
      return { id, name: typeof thread.name === 'string' ? thread.name.trim() : '', added: Boolean(theirs && theirs.added), broughtIn: Boolean(theirs && theirs.broughtIn) };
    });
}

/**
 * What the map checks read from the session, for the map in hand.
 *
 * @param {Object} state
 * @param {Object} map
 * @returns {Object} mapFindings's inputs
 */
function mapCheckInputsOf(state, map) {
  return {
    roster: mapRosterOf(state.sessionConfig, state.canonicalCharacters),
    keptPhotos: keptPhotoFilenames(state, topPhotoOf(map)),
    // Phase 4b (brief 1D; R3): every thread in the story lands in a beat.
    threads: settledWeaveThreadsOf(state),
    // Brief 4.14a; piece 3: only the connections between the settled angle's threads are in the
    // story, so no map is asked to land another. Each with its line, by which the director's
    // line names it.
    connections: (settledAngleOf(state.weave) || { connections: [] }).connections
      .filter((connection) => weaveIdOf(connection))
      .map((connection) => ({ id: weaveIdOf(connection), line: typeof connection.line === 'string' ? connection.line.trim() : '' })),
    meetingEdits: meetingEditIdsOf(state),
    meetingNote: meetingNoteOf(state),
    edits: carriedEdits(state._outlineHandEdits, map),
    // Phase 4b (brief 1D): what the evidence and story-terms checks read.
    evidence: evidenceContextOf(state),
    // Fix round 2: the director's words name a photo by their description of it.
    photoDescriptions: state.photoDescriptions
  };
}

/**
 * The map checks' node. Skips a run that ended in an error, an approved map, and a map the
 * checks already marked; that last skip stamps the checks' phase, as their run does.
 *
 * @param {Object} state
 * @returns {Object} partial state: the mark, validationResults and the phase
 */
function checkMap(state) {
  if (state.currentPhase === PHASES.ERROR) return {};
  if (state.outlineApproved === true) {
    console.log('[checkMap] Skipping: the map is approved');
    return {};
  }
  if (state._mapCheck) {
    console.log('[checkMap] Skipping: the map in hand is marked as checked');
    return { currentPhase: PHASES.MAP_CHECKS };
  }
  const map = state.outline;
  const inputs = mapCheckInputsOf(state, map);
  const words = map && typeof map === 'object' && Array.isArray(map.sections) ? mapPageWords(state, map, inputs.edits) : null;
  const { failures, concerns } = mapFindings(map, { ...inputs, length: words });
  const key = mapKey(map);
  const passed = failures.length === 0;
  const counted = words ? `${words.page} words on the map's page, ${words.writer} the writer's of ${words.allowance} it may use` : 'no page';
  console.log(`[checkMap] ${passed ? 'Passed' : `Failed: ${failures.map(f => f.type).join(', ')}`} (${counted}, map ${key})${concerns.length > 0 ? `, ${concerns.length} concern(s) about the director's changes` : ''}`);

  return {
    _mapCheck: {
      mapKey: key,
      passed,
      failures,
      concerns: concerns.map(c => directorEditConcern(c.editIds, c.finding)),
      words,
      checkedAt: new Date().toISOString()
    },
    validationResults: {
      phase: 'outline',
      source: MAP_CHECKS_SOURCE,
      mapKey: key,
      passed,
      ready: passed,
      structuralPassed: passed,
      structuralIssues: failures.map(f => f.message)
    },
    currentPhase: PHASES.MAP_CHECKS
  };
}

module.exports = {
  checkMap: traceNode(checkMap, 'checkMap', { stateFields: ['outline'] }),
  _testing: { checkMap, mapCheckInputsOf, mapPageWords }
};
