/**
 * P3.1 — every LLM-calling node carries retryPolicy{maxAttempts,retryOn:isTransientError};
 * pure/programmatic nodes carry none.
 */
const { createGraphBuilder } = require('../graph')._testing; // NOTE: exported under _testing, not top-level
const { isTransientError } = require('../../llm/retry');

const LLM_NODES = [
  'parseRawInput', 'analyzePhotos', 'finalizePhotoAnalyses', 'parseCharacterIds',
  'preprocessEvidence', 'extractCharacterData', 'curateEvidenceBundle',
  'analyzeArcs', 'reviseArcs', 'evaluateArcs', 'evaluateOutline', 'evaluateArticle',
  'generateOutline', 'reviseOutline', 'generateContentBundle', 'reviseContentBundle',
  'validateContentBundle'
];
const PURE_NODES = [
  'initializeSession', 'tagTokenDispositions', 'validateArcs', 'surfaceContradictions',
  'assembleHtml', 'checkpointArcSelection', 'incrementArcRevision', 'buildArcEvidencePackages'
];

function specOf(builder, name) {
  // langgraph 1.0.7 StateGraph stores node specs on builder.nodes
  return builder.nodes[name];
}

describe('graph retryPolicy wiring', () => {
  const builder = createGraphBuilder();

  test.each(LLM_NODES)('%s has retryPolicy with maxAttempts 3 and transient retryOn', (name) => {
    const spec = specOf(builder, name);
    expect(spec).toBeDefined();
    expect(spec.retryPolicy).toBeDefined();
    expect(spec.retryPolicy.maxAttempts).toBe(3);
    // retryOn must be our transient classifier: a 429 retries, a 401 does not
    expect(spec.retryPolicy.retryOn({ status: 429 })).toBe(true);
    expect(spec.retryPolicy.retryOn({ status: 401 })).toBe(false);
    expect(spec.retryPolicy.retryOn).toBe(isTransientError);
  });

  test.each(PURE_NODES)('%s has no retryPolicy', (name) => {
    const spec = specOf(builder, name);
    expect(spec).toBeDefined();
    expect(spec.retryPolicy).toBeUndefined();
  });
});
