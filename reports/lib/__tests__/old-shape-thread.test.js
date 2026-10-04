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
const { evaluateArticle } = require('../workflow/nodes/evaluator-nodes');
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

// Brief 4.13 (R14; R1): the journalist's alone. The parked detective's last prompt here, its
// article judge, went when a judge's prompt became its theme's: the detective names no rules
// folder (lib/__tests__/theme-rules.test.js).
describe.each(['journalist'])('%s: a thread from before phase 3 renders every prompt', (theme) => {
  const SALE_LINE = '- 07:50 AM | sale | account: Melanie | amount: $75,000';

  // Phase 4 (brief 4.4): the arc writer writes the weave in one call, and the arc stage
  // is the journalist's alone (R1); the interweaving call went. Brief 4.6: the outline
  // judge went, and the map writer is the journalist's alone too (R1). Brief 4.7b: so is
  // the article writer (R1).
  it('the arc writer, the outline and article writers and the article judge carry the sales on the clock', async () => {
    const arcSdk = recordingSdk(() => oldShapeState(theme).weave);
    await analyzeArcsPlayerFocusGuided({ ...oldShapeState(theme), weave: null }, cfg(arcSdk, theme));
    expect(promptOf(arcSdk, 0)).toContain(SALE_LINE);

    const outlineSdk = recordingSdk(() => OUTLINE);
    await generateOutline({ ...oldShapeState(theme), outline: null }, cfg(outlineSdk, theme));
    expect(promptOf(outlineSdk)).toContain(SALE_LINE);

    const articleSdk = recordingSdk(() => PREVIOUS_BUNDLE);
    await generateContentBundle({ ...oldShapeState(theme), heroImage: 'hero.jpg', contentBundle: null }, cfg(articleSdk, theme));
    expect(promptOf(articleSdk)).toContain(SALE_LINE);

    const verdict = () => ({ ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' });
    const articleJudge = recordingSdk(verdict);
    await evaluateArticle({
      ...oldShapeState(theme), heroImage: 'hero.jpg', evaluationHistory: [], contentBundle: PREVIOUS_BUNDLE,
      articleApproved: false, articleRevisionCount: REVISION_CAPS.ARTICLE
    }, cfg(articleJudge, theme));
    expect(promptOf(articleJudge)).toContain(SALE_LINE);
  });

  it('prints the transaction links on the clock the timeline reads (fix batch, finding 8)', async () => {
    // No stamp and no exposures (092026's shape): the timeline decides the evening
    // clock from the bundle's sales, and the links must read that one decision.
    const withLink = () => {
      const state = oldShapeState(theme);
      state.directorNotes = {
        ...state.directorNotes,
        transactionReferences: [{
          excerpt: 'Riley watched the ledger all morning.',
          linkedTransactions: [{ timestamp: '07:50 PM', amount: '$75,000', sellingTeam: 'Melanie' }],
          confidence: 'high'
        }]
      };
      return state;
    };
    const LINK_LINE = '[account: Melanie | amount: $75,000 | time: 07:50 AM]';

    const arcSdk = recordingSdk(() => withLink().weave);
    const outlineSdk = recordingSdk(() => OUTLINE);
    const articleSdk = recordingSdk(() => PREVIOUS_BUNDLE);
    await analyzeArcsPlayerFocusGuided({ ...withLink(), weave: null }, cfg(arcSdk, theme));
    await generateOutline({ ...withLink(), outline: null }, cfg(outlineSdk, theme));
    await generateContentBundle({ ...withLink(), heroImage: 'hero.jpg', contentBundle: null }, cfg(articleSdk, theme));
    const verdict = () => ({ ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' });
    // Phase 4 (brief 4.6): the article judge, in place of the outline judge that went.
    const articleJudge = recordingSdk(verdict);
    await evaluateArticle({
      ...withLink(), heroImage: 'hero.jpg', evaluationHistory: [], contentBundle: PREVIOUS_BUNDLE,
      articleApproved: false, articleRevisionCount: REVISION_CAPS.ARTICLE
    }, cfg(articleJudge, theme));

    const prompts = {
      arcWriter: promptOf(arcSdk, 0), outlineWriter: promptOf(outlineSdk), articleWriter: promptOf(articleSdk),
      articleJudge: promptOf(articleJudge)
    };
    const withLinks = Object.entries(prompts).filter(([, prompt]) => prompt.includes('<TRANSACTION_LINKS>'));
    expect(withLinks.map(([name]) => name)).toEqual(['arcWriter', 'outlineWriter', 'articleWriter', 'articleJudge']);
    withLinks.forEach(([, prompt]) => {
      // The timeline prints this sale at 07:50 AM (the test above); the link agrees.
      expect(prompt).toContain(LINK_LINE);
      expect(prompt).not.toContain('time: 07:50 PM]');
    });
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
