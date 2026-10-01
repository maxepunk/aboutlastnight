/**
 * A thread started before phase 3 (the plan's Review Focus 1; brief 3.5).
 *
 * 092626 was still being worked when phase 3 began. Its parse has no adjustments and
 * no stamped clock, and 092026's has no exposures either; an older parse has no
 * verdict kind. Every prompt must still build: the timeline shows the sales on the
 * clock their times decide, the account totals stay the stored ones, and the input
 * review says the adjustment rows were not parsed. Synthetic state in that shape.
 */

const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const { generateOutline, generateContentBundle } = require('../workflow/nodes/ai-nodes');
const { analyzeArcsPlayerFocusGuided } = require('../workflow/nodes/arc-specialist-nodes');
const { evaluateOutline, evaluateArticle } = require('../workflow/nodes/evaluator-nodes');
const { ledgerReviewOf } = require('../session-ledger');
const { REVISION_CAPS } = require('../workflow/state');

const clone = (v) => JSON.parse(JSON.stringify(v));
const recordingSdk = (answer) => jest.fn(async (options) => clone(answer(options)));
const promptOf = (sdk, i = 0) => sdk.mock.calls[i][0].prompt;
const cfg = (sdk, theme) => ({ configurable: { sdkClient: sdk, theme } });

/** The fixture state with every phase-3 field taken off its parse. */
function oldShapeState(theme) {
  const state = reworkFixtureState(theme);
  const { verdictKind, ...accusation } = state.sessionConfig.accusation;
  state.sessionConfig = { ...state.sessionConfig, accusation: { ...accusation, accused: ['Alex'], charge: 'Murder' } };
  delete state.sessionConfig.exposures;
  delete state.sessionConfig.adjustments;
  delete state.sessionConfig.sessionClock;
  delete state.sessionConfig.ledgerCheck;
  const { verdictKind: _kind, ...focusAccusation } = state.playerFocus.accusation;
  state.playerFocus = { ...state.playerFocus, accusation: { ...focusAccusation, accused: ['Alex'], charge: 'Murder' } };
  return state;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe.each(['journalist', 'detective'])('%s: a thread from before phase 3 renders every prompt', (theme) => {
  const SALE_LINE = '- 07:50 AM | sale | account: Melanie | amount: $75,000';

  it('the interweaving call, the outline and article writers and their judges carry the sales on the clock', async () => {
    const arcSdk = recordingSdk((options) => (options.label && options.label.startsWith('Interweaving')
      ? { arcInterweaving: [], interweavingPlan: { suggestedOrder: ['arc-sale'], convergencePoint: 'The vote', keyCallbacks: [] } }
      : { narrativeArcs: oldShapeState(theme).narrativeArcs, synthesisNotes: 's' }));
    await analyzeArcsPlayerFocusGuided({ ...oldShapeState(theme), narrativeArcs: null }, cfg(arcSdk, theme));
    expect(promptOf(arcSdk, 1)).toContain(SALE_LINE);

    const outlineSdk = recordingSdk(() => OUTLINE);
    await generateOutline({ ...oldShapeState(theme), outline: null }, cfg(outlineSdk, theme));
    expect(promptOf(outlineSdk)).toContain(SALE_LINE);

    const articleSdk = recordingSdk(() => PREVIOUS_BUNDLE);
    await generateContentBundle({ ...oldShapeState(theme), heroImage: 'hero.jpg', contentBundle: null }, cfg(articleSdk, theme));
    expect(promptOf(articleSdk)).toContain(SALE_LINE);

    const verdict = () => ({ ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' });
    const outlineJudge = recordingSdk(verdict);
    await evaluateOutline({ ...oldShapeState(theme), heroImage: 'hero.jpg', evaluationHistory: [], outlineApproved: false }, cfg(outlineJudge, theme));
    expect(promptOf(outlineJudge)).toContain(SALE_LINE);
    const articleJudge = recordingSdk(verdict);
    await evaluateArticle({
      ...oldShapeState(theme), heroImage: 'hero.jpg', evaluationHistory: [], contentBundle: PREVIOUS_BUNDLE,
      articleApproved: false, articleRevisionCount: REVISION_CAPS.ARTICLE
    }, cfg(articleJudge, theme));
    expect(promptOf(articleJudge)).toContain(SALE_LINE);
  });
});

describe('the input review of a thread from before phase 3', () => {
  it('keeps the stored totals and says the adjustment rows were not parsed', () => {
    const state = oldShapeState('journalist');
    const review = ledgerReviewOf(state);
    expect(review.adjustmentsParsed).toBe(false);
    expect(review.accounts).toEqual(state.shellAccounts);
    // With no stamped clock, the decision comes from what the thread holds: here the
    // bundle's one sale, at 07:50 PM.
    expect(review.clock.decided).toBe(true);
    expect(review.clock.evening).toBe(true);
  });
});
