/**
 * generateOutline -> buildOutlinePrompt arcAnalysis wiring (PROMPT-REVIEW H:
 * "the outline generator always receives an empty <arc-metadata>").
 *
 * generateOutline passed `state._arcAnalysisCache || { narrativeArcs, ... }`.
 * The cache is ALWAYS truthy once arc analysis has run and NEVER carries
 * narrativeArcs (arc-specialist-nodes writes synthesisNotes, interweavingPlan,
 * arcCount, architecture and timings into it, and the arcs into their own
 * channel), so the `||` fallback never fired: <arc-metadata> rendered [] in
 * every real session, followed by 1.5KB of instructions on how to use it.
 * arcSource, evidenceStrength, caveats and unansweredQuestions reached nothing.
 * Meanwhile <arc-analysis> dumped the cache verbatim, timings and
 * "architecture":"split-call" included.
 */
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  createTracedSdkQuery: (fn) => fn,
  progressEmitter: { emit: jest.fn(), subscribe: jest.fn(), emitComplete: jest.fn() }
}));
jest.mock('../workflow/checkpoint-helpers',
  () => require('../../__tests__/mocks/checkpoint-helpers.mock'));

const { generateOutline } = require('../workflow/nodes/ai-nodes');
const mockOutline = require('../../__tests__/fixtures/mock-responses/outline.json');

const ARC = {
  id: 'arc-1',
  title: 'The Money Trail',
  arcSource: 'player-focus',
  evidenceStrength: 'strong',
  caveats: ['the ledger is incomplete'],
  unansweredQuestions: ['who signed the final transfer?']
};

/** Capture the arcAnalysis argument generateOutline hands to the prompt builder. */
function makeCapturingConfig() {
  const captured = {};
  const promptBuilder = {
    theme: { loadPhasePrompts: async () => ({}), validate: async () => ({ valid: true, missing: [] }) },
    async buildOutlinePrompt(arcAnalysis) {
      captured.arcAnalysis = arcAnalysis;
      return { systemPrompt: 's', userPrompt: 'u' };
    }
  };
  return {
    captured,
    config: { configurable: { sdkClient: async () => mockOutline, promptBuilder } }
  };
}

describe('generateOutline arcAnalysis wiring', () => {
  it('passes the real narrativeArcs even when _arcAnalysisCache is populated', async () => {
    const { captured, config } = makeCapturingConfig();
    const state = {
      selectedArcs: ['The Money Trail'],
      narrativeArcs: [ARC],
      _arcAnalysisCache: {
        synthesisNotes: 'x',
        interweavingPlan: { convergence: 'the ledger' },
        arcCount: 1,
        architecture: 'split-call',
        timing: { call1: '30.0s', call2: '12.0s', total: '42.0s' }
      }
    };

    await generateOutline(state, config);

    expect(captured.arcAnalysis.narrativeArcs).toHaveLength(1);
    expect(captured.arcAnalysis.narrativeArcs[0].title).toBe('The Money Trail');
    expect(captured.arcAnalysis.narrativeArcs[0].evidenceStrength).toBe('strong');
    expect(captured.arcAnalysis.narrativeArcs[0].caveats).toEqual(['the ledger is incomplete']);
  });

  it('keeps the analytical cache fields the prompt actually uses', async () => {
    const { captured, config } = makeCapturingConfig();
    const state = {
      narrativeArcs: [ARC],
      _arcAnalysisCache: { synthesisNotes: 'x', interweavingPlan: { convergence: 'the ledger' } }
    };

    await generateOutline(state, config);

    expect(captured.arcAnalysis.synthesisNotes).toBe('x');
    expect(captured.arcAnalysis.interweavingPlan).toEqual({ convergence: 'the ledger' });
  });

  it('strips the internal bookkeeping fields from the prompt payload', async () => {
    const { captured, config } = makeCapturingConfig();
    const state = {
      narrativeArcs: [ARC],
      _arcAnalysisCache: { synthesisNotes: 'x', architecture: 'split-call', timing: { total: '42.0s' } }
    };

    await generateOutline(state, config);

    expect(captured.arcAnalysis).not.toHaveProperty('timing');
    expect(captured.arcAnalysis).not.toHaveProperty('architecture');
  });

  it('passes an empty arc list rather than undefined when there is no cache and no arcs', async () => {
    const { captured, config } = makeCapturingConfig();

    await generateOutline({}, config);

    expect(captured.arcAnalysis.narrativeArcs).toEqual([]);
  });
});
