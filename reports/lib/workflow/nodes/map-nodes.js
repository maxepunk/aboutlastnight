/**
 * The map checks' node (phase 4, brief 4.6; spec 5.4): free code checks on the map the
 * writer or a rework returned, before the map's stop opens. No model judge reads the map.
 *
 * The checks (lib/map.js mapFindings) read the map against the session: the roster, the
 * photos kept for the article, the record's document ids, the settled weave's live
 * connections, and the director's changes and note at the meeting. A failure the director
 * caused on the map is a concern on their edit, never a rework.
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
const { mapFindings, mapKey, mapRosterOf, meetingEditIdsOf, meetingNoteOf, topPhotoOf, MAP_CHECKS_SOURCE } = require('../../map');
const { carriedEdits, directorEditConcern } = require('../../hand-edit-diff');
const { liveConnections, weaveIdOf } = require('../../weave');
const { buildValidEvidenceIds } = require('./node-helpers');
const { keptPhotoFilenames } = require('./ai-nodes');

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
    recordIds: buildValidEvidenceIds(state.evidenceBundle),
    connections: liveConnections(state.weave).map(weaveIdOf).filter(Boolean),
    meetingEdits: meetingEditIdsOf(state),
    meetingNote: meetingNoteOf(state),
    edits: carriedEdits(state._outlineHandEdits, map)
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
  const { failures, concerns } = mapFindings(map, mapCheckInputsOf(state, map));
  const key = mapKey(map);
  const passed = failures.length === 0;
  console.log(`[checkMap] ${passed ? 'Passed' : `Failed: ${failures.map(f => f.type).join(', ')}`} (map ${key})${concerns.length > 0 ? `, ${concerns.length} concern(s) about the director's changes` : ''}`);

  return {
    _mapCheck: {
      mapKey: key,
      passed,
      failures,
      concerns: concerns.map(c => directorEditConcern(c.editIds, c.finding)),
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
  _testing: { checkMap, mapCheckInputsOf }
};
