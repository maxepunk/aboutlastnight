/**
 * The director's edits are final, at the judges (before phase 4, F1; spec 2026-10-02
 * section 7).
 *
 * On 0926262 the article judge, after the director's send-back, made two of the
 * director's edits must-fix (the closing stated Alex's motive as fact, T1; a cut
 * paragraph left a debated theory unreported, T2), and the automatic rework changed
 * both. The judges never saw which text was the director's. Now:
 *   - the outline and article judges' user prompts list the standing edits by id, each
 *     with its section and the director's text (or, for a cut, the text removed);
 *   - the verdict guard moves a structural issue that quotes the director's text to
 *     advisoryWarnings, under the one prefix and the edit's id, and a truth criterion
 *     holds the output only while an issue under its rules is still structural or its
 *     own notes quote the writer's text;
 *   - the fact check reads the same edits (buildFactCheckArgs).
 *
 * getSdkClient returns config.configurable.sdkClient as-is, so a jest.fn is the judge.
 */
const { evaluateArticle, evaluateOutline, evaluateArcs, _testing: { buildEvaluationUserPrompt, buildFactCheckArgs } } =
  require('../../../lib/workflow/nodes/evaluator-nodes');
const { standingAfterSendBack, DIRECTOR_EDIT_PREFIX } = require('../../../lib/hand-edit-diff');
const { reworkFixtureState, PREVIOUS_BUNDLE, OUTLINE } = require('../../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

const paragraph = (text) => ({ type: 'paragraph', text });
const CLOSING = 'Alex wanted Marcus out of the company, and the January demand says so.';
const THEORY = 'The room also weighed whether Morgan would replace Marcus, not kill him.';
const WRITER_LINE = 'Riley watched the ledger all morning and said nothing to anyone.';

/** The article as the writer last wrote it, naming every roster player once. */
function writersArticle() {
  return {
    metadata: { sessionId: '010126', theme: 'journalist', generatedAt: '2026-01-01T00:00:00.000Z' },
    headline: { main: 'The Sale', kicker: 'NovaNews', deck: 'A vote for overdose' },
    byline: { author: 'Cass Nova | NovaNews', title: 'Senior Investigative Correspondent' },
    sections: [
      { id: 'the-story', type: 'narrative', heading: 'The Story', content: [
        paragraph('Alex and Morgan argued at the bar while Sarah kept the count.'),
        paragraph(THEORY),
        paragraph(WRITER_LINE)
      ] },
      { id: 'closing', type: 'narrative', heading: 'Closing', content: [paragraph('Whether the verdict costs Alex anything is still open.')] }
    ],
    evidenceCards: []
  };
}

/** The director's version: the closing rewritten (E2), the theory paragraph cut (E1). */
function directorsArticle() {
  const a = writersArticle();
  a.sections[1].content[0] = paragraph(CLOSING);
  a.sections[0].content.splice(1, 1);
  return a;
}

/** The state after the send-back's rework kept both edits. */
function articleState(theme = 'journalist', overrides = {}) {
  return {
    ...reworkFixtureState(theme),
    contentBundle: directorsArticle(),
    _articleHandEdits: standingAfterSendBack(null, writersArticle(), directorsArticle(), 'bundle'),
    sessionPhotos: [],
    articleApproved: false,
    articleRevisionCount: 0,
    evaluationHistory: [],
    ...overrides
  };
}

const cfg = (sdk, theme = 'journalist') => ({ configurable: { sdkClient: sdk, theme } });
const judging = (verdict) => jest.fn(async () => clone(verdict));

describe('the judges read the director\'s edits (F1)', () => {
  it.each(['journalist', 'detective'])('%s article judge: lists each standing edit by id, section and the director\'s text, after the bundle', (theme) => {
    const prompt = buildEvaluationUserPrompt('article', articleState(theme), { factCheck: null, directorEdits: buildFactCheckArgs(articleState(theme)).directorEdits });
    const at = (s) => prompt.indexOf(s);
    expect(at("THE DIRECTOR'S EDITS (record: the director's own text")).toBeGreaterThan(at('CONTENT BUNDLE:'));
    expect(at("THE DIRECTOR'S EDITS")).toBeLessThan(at('\nOUTLINE:'));
    expect(prompt).toContain(`E1 (section "the-story", paragraph, cut): "${THEORY}"`);
    expect(prompt).toContain(`E2 (section "closing", paragraph): "${CLOSING}"`);
    expect(prompt).toContain(`write the concern in advisoryWarnings, opening with the edit's id and then the rule or criterion it concerns, as in: ${DIRECTOR_EDIT_PREFIX}E1: `);
    expect(prompt).toContain('score each criterion, and write each structural issue, on the writer\'s text alone');
  });

  it.each(['journalist', 'detective'])('%s outline judge: lists the outline\'s standing edits after the outline', (theme) => {
    const edited = clone(OUTLINE);
    edited.lede.hook = 'Marcus died the morning his company sold.';
    const state = {
      ...reworkFixtureState(theme), outline: edited,
      _outlineHandEdits: standingAfterSendBack(null, OUTLINE, edited, 'outline')
    };
    const edits = require('../../../lib/hand-edit-diff').carriedEdits(state._outlineHandEdits, state.outline);
    const prompt = buildEvaluationUserPrompt('outline', state, { directorEdits: edits });
    expect(prompt).toContain('E1 (lede, hook): "Marcus died the morning his company sold."');
    expect(prompt.indexOf("THE DIRECTOR'S EDITS")).toBeGreaterThan(prompt.indexOf('OUTLINE:'));
    expect(prompt.indexOf("THE DIRECTOR'S EDITS")).toBeLessThan(prompt.indexOf('SELECTED ARCS'));
    expect(prompt).toContain('text the director wrote into the outline above, or cut from it');
  });

  it('carries no such section when there are no standing edits', () => {
    const state = articleState('journalist', { _articleHandEdits: null });
    expect(buildEvaluationUserPrompt('article', state, { factCheck: null, directorEdits: [] })).not.toContain("THE DIRECTOR'S EDITS");
    expect(buildEvaluationUserPrompt('article', state, { factCheck: null })).not.toContain("THE DIRECTOR'S EDITS");
    expect(buildEvaluationUserPrompt('outline', { ...reworkFixtureState('journalist') }, {})).not.toContain("THE DIRECTOR'S EDITS");
  });

  it('the article judge node sends the edits the bundle under review carries', async () => {
    const sdk = judging({ ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [] });
    await evaluateArticle(articleState(), cfg(sdk));
    expect(sdk).toHaveBeenCalledTimes(1);
    expect(sdk.mock.calls[0][0].prompt).toContain(`E2 (section "closing", paragraph): "${CLOSING}"`);
  });

  it('an edit the bundle no longer carries is not listed', async () => {
    const state = articleState();
    state.contentBundle.sections[1].content[0] = paragraph('Whether the verdict costs Alex anything is still open.');
    const sdk = judging({ ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [] });
    await evaluateArticle(state, cfg(sdk));
    expect(sdk.mock.calls[0][0].prompt).not.toContain('E2 (section "closing"');
    expect(sdk.mock.calls[0][0].prompt).toContain('E1 (section "the-story", paragraph, cut)');
  });

  it('buildFactCheckArgs hands the fact check the edits the bundle carries', () => {
    expect(buildFactCheckArgs(articleState()).directorEdits.map((e) => e.id)).toEqual(['E1', 'E2']);
    expect(buildFactCheckArgs(articleState('journalist', { _articleHandEdits: null })).directorEdits).toEqual([]);
  });
});

describe('the verdict guard (F1)', () => {
  const CLOSING_ISSUE = `T1: "${CLOSING}" states Alex's motive as fact; the record holds only the January demand. State it as the room's suspicion.`;
  const THEORY_ISSUE = 'T2: the room\'s debated theory "Morgan would replace Marcus, not kill him" is not reported. Report it as a theory the room weighed.';
  const WRITER_ISSUE = `T12: "${WRITER_LINE}" is not in the record. Cut the line.`;

  const verdict = (overrides) => ({
    ready: false, structuralPassed: false, overallScore: 0.7, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [],
    revisionGuidance: 'Step 1: fix it.', confidence: 'high', ...overrides
  });

  it('a structural issue quoting the director\'s text moves to advisories under the prefix and the edit\'s id', async () => {
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({ structuralIssues: [CLOSING_ISSUE] }))));
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.advisoryWarnings).toContain(`${DIRECTOR_EDIT_PREFIX}E2: ${CLOSING_ISSUE}`);
    expect(result.validationResults.structuralIssues).toEqual([]);
  });

  it('an issue quoting the writer\'s text stays structural, and the output is not ready', async () => {
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({ structuralIssues: [CLOSING_ISSUE, WRITER_ISSUE] }))));
    expect(result.evaluationHistory.structuralIssues).toEqual([WRITER_ISSUE]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([`${DIRECTOR_EDIT_PREFIX}E2: ${CLOSING_ISSUE}`]);
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.validationResults.structuralIssues).toEqual([WRITER_ISSUE]);
  });

  it('a truth criterion whose issues all moved does not hold the output', async () => {
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      criteriaScores: { evidenceTruth: { score: 0.2, type: 'structural', notes: `The closing says "${CLOSING}"`, fix: 'Attribute the motive.' } },
      structuralIssues: [CLOSING_ISSUE]
    }))));
    expect(result.evaluationHistory.ready).toBe(true);
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
  });

  it('a truth criterion whose own notes quote the writer\'s text still holds it', async () => {
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      criteriaScores: { wordsTruth: { score: 0.3, type: 'structural', notes: `"${WRITER_LINE}" is in no document.`, fix: 'Cut it.' } },
      structuralIssues: [`T12: "${CLOSING}" quotes no document.`]
    }))));
    expect(result.evaluationHistory.ready).toBe(false);
  });

  it('a failed truth criterion the judge wrote no issue for moves when its notes quote only the director\'s text', async () => {
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      criteriaScores: { verdictTruth: { score: 0.4, type: 'structural', notes: 'The cut removed "Morgan would replace Marcus, not kill him".', fix: 'Report the theory.' } },
      structuralIssues: []
    }))));
    expect(result.evaluationHistory.ready).toBe(true);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E1: T2: The cut removed "Morgan would replace Marcus, not kill him". Report the theory.`
    ]);
  });

  it('the output is ready when every structural issue moved, whatever the judge\'s structuralPassed', async () => {
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      criteriaScores: {
        evidenceTruth: { score: 0.3, type: 'structural', notes: 'A motive stated as fact.', fix: 'Attribute it.' },
        verdictTruth: { score: 0.4, type: 'structural', notes: 'A debated theory is unreported.', fix: 'Report it.' }
      },
      structuralIssues: [CLOSING_ISSUE, THEORY_ISSUE]
    }))));
    expect(result.evaluationHistory.ready).toBe(true);
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E2: ${CLOSING_ISSUE}`,
      `${DIRECTOR_EDIT_PREFIX}E1: ${THEORY_ISSUE}`
    ]);
    expect(result.validationResults.passed).toBe(true);
  });

  it('a concern filed under structuralIssues with the prefix and a standing id moves as it is', async () => {
    const filed = `${DIRECTOR_EDIT_PREFIX}E2: T1: the closing states a motive as fact.`;
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({ structuralIssues: [filed] }))));
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([filed]);
  });

  it('a concern reaches the stop but not the rework: validationResults leaves it out', async () => {
    const concern = `${DIRECTOR_EDIT_PREFIX}E2: T1: a motive stated as fact.`;
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      ready: true, structuralPassed: true, overallScore: 0.9, advisoryWarnings: [concern, 'C10: the lede runs long.']
    }))));
    expect(result.evaluationHistory.advisoryWarnings).toEqual([concern, 'C10: the lede runs long.']);
    expect(result.validationResults.advisoryWarnings).toEqual(['C10: the lede runs long.']);
  });

  it('the outline judge\'s verdict is guarded the same way', async () => {
    const edited = clone(OUTLINE);
    edited.closing.systemicAngle = 'Markets for memory decided who the room could blame.';
    const state = {
      ...reworkFixtureState('journalist'), outline: edited, outlineApproved: false, evaluationHistory: [],
      _outlineHandEdits: standingAfterSendBack(null, OUTLINE, edited, 'outline')
    };
    const issue = 'T2: "Markets for memory decided who the room could blame" grades the verdict.';
    const result = await evaluateOutline(state, cfg(judging(verdict({ structuralIssues: [issue] }))));
    expect(result.evaluationHistory.ready).toBe(true);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([`${DIRECTOR_EDIT_PREFIX}E1: ${issue}`]);
  });

  it('with no standing edits nothing moves (the arc judge has none)', async () => {
    const issue = `T1: "${CLOSING}" states a motive.`;
    const article = await evaluateArticle(articleState('journalist', { _articleHandEdits: null }), cfg(judging(verdict({ structuralIssues: [issue] }))));
    expect(article.evaluationHistory.structuralIssues).toEqual([issue]);
    expect(article.evaluationHistory.ready).toBe(false);
    const arcs = await evaluateArcs({ ...reworkFixtureState('journalist'), selectedArcs: [], evaluationHistory: [] }, cfg(judging(verdict({ structuralIssues: [issue] }))));
    expect(arcs.evaluationHistory.structuralIssues).toEqual([issue]);
  });
});
