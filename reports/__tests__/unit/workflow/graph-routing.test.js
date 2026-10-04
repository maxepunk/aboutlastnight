/**
 * Graph Routing Unit Tests - Batch 3A.5
 *
 * Tests the human rejection routing functions added in Batch 3A.3:
 * - routeAfterOutlineCheckpoint: routes based on outlineApproved
 * - routeAfterArticleCheckpoint: routes based on articleApproved
 *
 * These routing functions enable the human rejection → revision loop
 * that was added as part of Sub-Phase 3A (three approval modes).
 */

// Mock checkpointInterrupt to prevent GraphInterrupt in unit tests
// Required because graph.js imports from nodes which import checkpoint-helpers
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const { _testing } = require('../../../lib/workflow/graph');
const { routeAfterOutlineCheckpoint, routeAfterArticleCheckpoint } = _testing;

describe('routeAfterOutlineCheckpoint', () => {
  test('returns forward when outlineApproved is true', () => {
    expect(routeAfterOutlineCheckpoint({ outlineApproved: true })).toBe('forward');
  });

  test('returns revise when outlineApproved is false', () => {
    expect(routeAfterOutlineCheckpoint({ outlineApproved: false })).toBe('revise');
  });

  test('returns revise when outlineApproved is undefined', () => {
    expect(routeAfterOutlineCheckpoint({})).toBe('revise');
  });
});

describe('routeAfterArticleCheckpoint', () => {
  test('returns forward when articleApproved is true', () => {
    expect(routeAfterArticleCheckpoint({ articleApproved: true })).toBe('forward');
  });

  test('returns revise when articleApproved is false', () => {
    expect(routeAfterArticleCheckpoint({ articleApproved: false })).toBe('revise');
  });

  test('returns revise when articleApproved is undefined', () => {
    expect(routeAfterArticleCheckpoint({})).toBe('revise');
  });
});

describe('routeAfterInputReview (CODE-REVIEW B2/B8)', () => {
  const { routeAfterInputReview } = _testing;

  test('returns reparse when the director supplied corrections', () => {
    expect(routeAfterInputReview({ _inputCorrections: 'x' })).toBe('reparse');
  });

  test('returns forward when the parse was approved', () => {
    expect(routeAfterInputReview({ inputReviewApproved: true })).toBe('forward');
  });

  test('returns forward on blank/absent corrections (no re-parse loop)', () => {
    expect(routeAfterInputReview({})).toBe('forward');
    expect(routeAfterInputReview({ _inputCorrections: null })).toBe('forward');
    expect(routeAfterInputReview({ _inputCorrections: '   ' })).toBe('forward');
  });
});

describe('routeArticleEvaluation — programmatic fact-check path (BASELINE class 1)', () => {
  const { routeArticleEvaluation } = _testing;
  const { REVISION_CAPS } = require('../../../lib/workflow/state');

  const factCheckFailure = {
    phase: 'article',
    ready: false,
    source: 'fact-check',
    structuralPassed: false,
    structuralIssues: ['Evidence card "rem004" is not verbatim: ...']
  };

  test('a fact-check failure under the cap routes to the revision loop', () => {
    expect(routeArticleEvaluation({
      evaluationHistory: [factCheckFailure],
      articleRevisionCount: 0
    })).toBe('revise');
  });

  test('a fact-check failure AT the cap goes to the human checkpoint', () => {
    expect(routeArticleEvaluation({
      evaluationHistory: [factCheckFailure],
      articleRevisionCount: REVISION_CAPS.ARTICLE
    })).toBe('checkpoint');
  });

  test('it ignores another phase’s last entry', () => {
    expect(routeArticleEvaluation({
      evaluationHistory: [factCheckFailure, { phase: 'outline', ready: true }],
      articleRevisionCount: 0
    })).toBe('revise');
  });
});

describe('graph wiring — photo late-join', () => {
  const { createGraphBuilder } = _testing;
  const builder = createGraphBuilder();
  const edges = [...builder.edges];
  const has = (from, to) => edges.some(([f, t]) => f === from && t === to);

  test('the photo chain no longer sits in Phase 1', () => {
    expect(has('fetchPaperEvidence', 'fetchSessionPhotos')).toBe(false);
    expect(has('detectWhiteboard', 'checkpointPaperEvidence')).toBe(false);
    expect(has('checkpointAwaitRoster', 'checkpointCharacterIds')).toBe(false);
    expect(has('finalizePhotoAnalyses', 'checkpointAwaitContext')).toBe(false);
  });

  test('Phase 1 runs straight from evidence to the roster gate to the context gate', () => {
    expect(has('fetchPaperEvidence', 'checkpointPaperEvidence')).toBe(true);
    expect(has('checkpointPaperEvidence', 'checkpointAwaitRoster')).toBe(true);
    expect(has('checkpointAwaitRoster', 'checkpointAwaitContext')).toBe(true);
  });

  test("checkpointArcSelection's forward leg enters the photo branch", () => {
    // A conditional edge is in builder.BRANCHES, not builder.edges (M1).
    const ends = builder.branches.checkpointArcSelection.condition.ends;
    expect(ends.forward).toBe('checkpointPhotos');
    expect(ends.revise).toBe('incrementArcRevision');
  });

  // Phase 4 (brief 4.6; R5): the branch joins at the outline writer; the arc packages
  // that joined it went.
  test('the photo branch is a chain from the gate to the outline writer', () => {
    expect(has('checkpointPhotos', 'fetchSessionPhotos')).toBe(true);
    expect(has('fetchSessionPhotos', 'preprocessPhotos')).toBe(true);
    expect(has('preprocessPhotos', 'analyzePhotos')).toBe(true);
    // I1: detectWhiteboard travels WITH the chain. Ahead of the fetch it would
    // always write null and the whiteboard would leak into the article photos.
    expect(has('analyzePhotos', 'detectWhiteboard')).toBe(true);
    expect(has('detectWhiteboard', 'checkpointCharacterIds')).toBe(true);
    expect(has('checkpointCharacterIds', 'parseCharacterIds')).toBe(true);
    expect(has('parseCharacterIds', 'finalizePhotoAnalyses')).toBe(true);
    expect(has('finalizePhotoAnalyses', 'generateOutline')).toBe(true);
    expect(Object.keys(builder.nodes)).not.toContain('buildArcEvidencePackages');
  });

  test('registers checkpointPhotos as a node', () => {
    expect(Object.keys(builder.nodes)).toContain('checkpointPhotos');
    // Phase 4 (brief 4.6): the packages node and the outline judge went, and the map's
    // checks came.
    expect(Object.keys(builder.nodes)).toHaveLength(44);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6: the map checks' route (brief 4.6; R6)
// ═══════════════════════════════════════════════════════════════════════════
describe('4.6: routeMapChecks', () => {
  const { routeMapChecks } = _testing;
  const { REVISION_CAPS, PHASES } = require('../../../lib/workflow/state');
  const FAILED = { mapKey: 'k', passed: false, failures: [{ type: 'player-not-placed', message: 'Jamie is in no beat.' }] };

  test('a passing map goes to the stop', () => {
    expect(routeMapChecks({ _mapCheck: { mapKey: 'k', passed: true, failures: [] } })).toBe('checkpoint');
  });

  test('a failed check sends the map back for one rework in the round', () => {
    expect(REVISION_CAPS.OUTLINE).toBe(1);
    expect(routeMapChecks({ _mapCheck: FAILED, outlineRevisionCount: 0 })).toBe('revise');
  });

  test("a check still failing after the round's rework opens the stop, which shows it", () => {
    expect(routeMapChecks({ _mapCheck: FAILED, outlineRevisionCount: 1 })).toBe('checkpoint');
  });

  test('an approved map goes on whatever its mark, and so does a map the checks never marked', () => {
    expect(routeMapChecks({ _mapCheck: FAILED, outlineApproved: true })).toBe('checkpoint');
    expect(routeMapChecks({})).toBe('checkpoint');
  });

  test('a rework that failed ends the run', () => {
    expect(routeMapChecks({ currentPhase: PHASES.ERROR, _mapCheck: FAILED })).toBe('error');
  });

  // Spec 5.4: no model judge reads the map. The checks follow the writer and each rework,
  // and route to the stop, to the one rework, or to the error.
  test('the checks follow the writer and each rework, and no outline judge is in the graph', () => {
    const { createGraphBuilder } = _testing;
    const builder = createGraphBuilder();
    const edges = [...builder.edges];
    const has = (from, to) => edges.some(([f, t]) => f === from && t === to);
    expect(has('generateOutline', 'checkMap')).toBe(true);
    // Task 4.14e: the rework reaches the checks through its own route, which may run it again.
    expect(builder.branches.reviseOutline.condition.ends.checks).toBe('checkMap');
    expect(has('incrementOutlineRevision', 'reviseOutline')).toBe(true);
    expect(builder.branches.checkMap.condition.ends).toEqual({
      checkpoint: 'checkpointOutline', revise: 'incrementOutlineRevision', error: '__end__'
    });
    expect(Object.keys(builder.nodes)).not.toContain('evaluateOutline');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14e: a failed rework keeps the version it started from (the final review's ruling 5).
// A rework call that failed on a transient error runs again, by the route after the rework;
// a rework that gave up opens its stop with that version, and no automatic pass runs on it.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.14e: the routes after a rework that failed', () => {
  const { routeAfterMapRework, routeAfterArticleRework, routeMapChecks, routeArticleEvaluation, createGraphBuilder } = _testing;
  const { PHASES } = require('../../../lib/workflow/state');
  const RUNNING = { round: null, note: null, countsBefore: {}, failures: 0, status: 'running' };
  const RETRYING = { ...RUNNING, failures: 1, at: 't', error: 'SDK timeout after 900s', status: 'retrying' };
  const DID_NOT_RUN = { ...RUNNING, round: 'send-back', note: 'Tighten it.', failures: 3, at: 't', error: 'SDK timeout after 900s', status: 'did-not-run' };
  const FAILED = { mapKey: 'k', passed: false, failures: [{ type: 'player-not-placed', message: 'Riley is in no beat.' }] };

  test('after the map\'s rework: a call to retry runs the rework again, anything else goes to the checks, and an error ends the run', () => {
    expect(routeAfterMapRework({ _outlineRework: RETRYING })).toBe('retry');
    expect(routeAfterMapRework({ _outlineRework: null })).toBe('checks');
    expect(routeAfterMapRework({ _outlineRework: DID_NOT_RUN })).toBe('checks');
    expect(routeAfterMapRework({ _outlineRework: DID_NOT_RUN, currentPhase: PHASES.ERROR })).toBe('error');
  });

  test('after the article\'s rework: a call to retry runs the rework again, anything else goes to the evaluation, and an error ends the run', () => {
    expect(routeAfterArticleRework({ _articleRework: RETRYING })).toBe('retry');
    expect(routeAfterArticleRework({ _articleRework: null })).toBe('evaluate');
    expect(routeAfterArticleRework({ _articleRework: DID_NOT_RUN })).toBe('evaluate');
    expect(routeAfterArticleRework({ _articleRework: { ...DID_NOT_RUN, round: null }, currentPhase: PHASES.ERROR })).toBe('error');
  });

  test('the map checks open the stop on a rework that did not run, whatever the check found', () => {
    expect(routeMapChecks({ _mapCheck: FAILED, outlineRevisionCount: 0, _outlineRework: DID_NOT_RUN })).toBe('checkpoint');
    // A rework that ran keeps the route as it was: a failed check under the cap gets its rework.
    expect(routeMapChecks({ _mapCheck: FAILED, outlineRevisionCount: 0, _outlineRework: null })).toBe('revise');
  });

  test('an evaluation escalated to the director opens the article\'s stop under the cap, as the cap\'s escalation does at it', () => {
    expect(routeArticleEvaluation({ evaluationHistory: [{ phase: 'article', ready: false, escalatedToHuman: true }], articleRevisionCount: 0 })).toBe('checkpoint');
    expect(routeArticleEvaluation({ evaluationHistory: [{ phase: 'article', ready: false }], articleRevisionCount: 0 })).toBe('revise');
  });

  test('each rework routes on its own outcome: to itself to retry, on to its checks or evaluation, or to the end', () => {
    const builder = createGraphBuilder();
    expect(builder.branches.reviseOutline.condition.ends).toEqual({ checks: 'checkMap', retry: 'reviseOutline', error: '__end__' });
    expect(builder.branches.reviseContentBundle.condition.ends).toEqual({ evaluate: 'evaluateArticle', retry: 'reviseContentBundle', error: '__end__' });
    const edges = [...builder.edges];
    expect(edges.some(([from]) => from === 'reviseOutline' || from === 'reviseContentBundle')).toBe(false);
  });
});
