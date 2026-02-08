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
