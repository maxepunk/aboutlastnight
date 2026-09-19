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

  test('the photo branch is a chain from the gate to the evidence-package join', () => {
    expect(has('checkpointPhotos', 'fetchSessionPhotos')).toBe(true);
    expect(has('fetchSessionPhotos', 'preprocessPhotos')).toBe(true);
    expect(has('preprocessPhotos', 'analyzePhotos')).toBe(true);
    // I1: detectWhiteboard travels WITH the chain. Ahead of the fetch it would
    // always write null and the whiteboard would leak into the article photos.
    expect(has('analyzePhotos', 'detectWhiteboard')).toBe(true);
    expect(has('detectWhiteboard', 'checkpointCharacterIds')).toBe(true);
    expect(has('checkpointCharacterIds', 'parseCharacterIds')).toBe(true);
    expect(has('parseCharacterIds', 'finalizePhotoAnalyses')).toBe(true);
    expect(has('finalizePhotoAnalyses', 'buildArcEvidencePackages')).toBe(true);
    expect(has('buildArcEvidencePackages', 'generateOutline')).toBe(true);
  });

  test('registers checkpointPhotos as a node', () => {
    expect(Object.keys(builder.nodes)).toContain('checkpointPhotos');
    expect(Object.keys(builder.nodes)).toHaveLength(45);
  });
});
