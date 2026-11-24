/**
 * The director's edits are final, at the judges (before phase 4, F1; spec 2026-10-02
 * section 7).
 *
 * On 0926262 the article judge, after the director's send-back, made two of the
 * director's edits must-fix (the closing stated Alex's motive as fact, T1; a cut
 * paragraph left a debated theory unreported, T2), and the automatic rework changed
 * both. The judges never saw which text was the director's. Now:
 *   - the article judge's user prompt lists the standing edits by id, each with its
 *     section and the director's text (or, for a cut, the text removed); the outline
 *     judge, which did too, left the graph (phase 4, brief 4.6);
 *   - the verdict guard moves a structural issue that quotes the director's text to
 *     advisoryWarnings, under the one prefix and the edit's id, and a truth criterion
 *     holds the output only while an issue under its rules is still structural or its
 *     own notes quote the writer's text;
 *   - the fact check reads the same edits (buildFactCheckArgs).
 *
 * getSdkClient returns config.configurable.sdkClient as-is, so a jest.fn is the judge.
 */
const { evaluateArticle, evaluateArcs, _testing: { buildEvaluationUserPrompt, buildFactCheckArgs } } =
  require('../../../lib/workflow/nodes/evaluator-nodes');
const { standingAfterSendBack, DIRECTOR_EDIT_PREFIX } = require('../../../lib/hand-edit-diff');
const { buildRevisionContext } = require('../../../lib/workflow/nodes/node-helpers');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../../lib/__tests__/fixtures/rework-state');

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
  // Brief 4.7a: one article judge for every theme (R1); the map it reads sits before the
  // article, so the edits come between the article and the fact check's result.
  it.each(['journalist', 'detective'])('%s article judge: lists each standing edit by id, section and the director\'s text, after the bundle', (theme) => {
    const prompt = buildEvaluationUserPrompt('article', articleState(theme), { factCheck: null, directorEdits: buildFactCheckArgs(articleState(theme)).directorEdits });
    const at = (s) => prompt.indexOf(s);
    expect(at("THE DIRECTOR'S EDITS (record: the director's own text")).toBeGreaterThan(at('CONTENT BUNDLE:'));
    expect(at("THE DIRECTOR'S EDITS")).toBeLessThan(at('THE FACT CHECK ON THIS BUNDLE'));
    expect(prompt).toContain(`E1 (section "the-story", paragraph, cut): "${THEORY}"`);
    expect(prompt).toContain(`E2 (section "closing", paragraph): "${CLOSING}"\n  removed: "Whether the verdict costs Alex anything is still open."`);
    expect(prompt).toContain('A removed: line under an edit is a sentence the director took out of that text when rewriting it.');
    expect(prompt).toContain(`write the concern in advisoryWarnings, opening with the edit's id and then the limit it concerns, as in: ${DIRECTOR_EDIT_PREFIX}E1: `);
    expect(prompt).toContain('score each criterion, and write each structural issue, on the writer\'s text alone');
  });

  it('carries no such section when there are no standing edits', () => {
    const state = articleState('journalist', { _articleHandEdits: null });
    expect(buildEvaluationUserPrompt('article', state, { factCheck: null, directorEdits: [] })).not.toContain("THE DIRECTOR'S EDITS");
    expect(buildEvaluationUserPrompt('article', state, { factCheck: null })).not.toContain("THE DIRECTOR'S EDITS");
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

  // FA, requirement 5 (replacing F1's "notes that quote the writer's text hold"): a
  // criterion a director concern covers keeps its notes and fix from the rework, and
  // holds only while a structural issue under its rule ids remains.
  it('a truth criterion a director concern covers holds only while a structural issue under its rules remains', async () => {
    const covered = await evaluateArticle(articleState(), cfg(judging(verdict({
      criteriaScores: { wordsTruth: { score: 0.3, type: 'structural', notes: `"${WRITER_LINE}" is in no document.`, fix: 'Cut it.' } },
      structuralIssues: [`T12: "${CLOSING}" quotes no document.`]
    }))));
    expect(covered.evaluationHistory.ready).toBe(true);
    expect(covered.validationResults.criteriaScores).toEqual({ wordsTruth: { score: 0.3, type: 'structural' } });
    const stillHeld = await evaluateArticle(articleState(), cfg(judging(verdict({
      criteriaScores: { wordsTruth: { score: 0.3, type: 'structural', notes: `"${WRITER_LINE}" is in no document.`, fix: 'Cut it.' } },
      structuralIssues: [`T12: "${CLOSING}" quotes no document.`, WRITER_ISSUE]
    }))));
    expect(stillHeld.evaluationHistory.ready).toBe(false);
    expect(stillHeld.validationResults.structuralIssues).toEqual([WRITER_ISSUE]);
    expect(stillHeld.validationResults.criteriaScores).toEqual({ wordsTruth: { score: 0.3, type: 'structural' } });
  });

  it('a failed truth criterion no concern covers holds the output, and its notes and fix reach the rework', async () => {
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      criteriaScores: { wordsTruth: { score: 0.3, type: 'structural', notes: `"${WRITER_LINE}" is in no document.`, fix: 'Cut it.' } },
      structuralIssues: [CLOSING_ISSUE]
    }))));
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.validationResults.structuralIssues).toEqual([`T12: "${WRITER_LINE}" is in no document. Cut it.`]);
    expect(result.validationResults.criteriaScores.wordsTruth.fix).toBe('Cut it.');
  });

  // FA, requirement 1: the director's text wins. 0926262's real T1 issue quoted the
  // closing beside two of the writer's lines, and F1 kept it structural.
  it('an issue that quotes the director\'s text moves to the concerns, whatever else it quotes', async () => {
    const mixed = `T1: "${CLOSING}" says what "${WRITER_LINE.slice(0, -1)}" only implies.`;
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({ structuralIssues: [mixed] }))));
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([`${DIRECTOR_EDIT_PREFIX}E2: ${mixed}`]);
    expect(result.evaluationHistory.ready).toBe(true);
  });

  // FA, requirement 5 and known item 1: director-located findings release the output only
  // when no structural criterion failed outside them. Brief 4.7a: the article judge's
  // structural criteria are its truth criteria alone, so a criterion that failed on the
  // writer's text beside a moved issue is the failed truth criterion pinned above ("a
  // failed truth criterion no concern covers holds the output"); its weighted-criterion
  // case went with the weighted criteria.

  // Final review, finding 6: a judge that files its concern correctly and still sets
  // structuralPassed false must not send the output to automatic passes with nothing to fix.
  it('a judge\'s structuralPassed false with nothing left to fix does not hold the output', async () => {
    const concern = `${DIRECTOR_EDIT_PREFIX}E2: T1: "${CLOSING}" states a motive as fact.`;
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      structuralPassed: false, ready: false,
      criteriaScores: { evidenceTruth: { score: 0.85, type: 'structural', notes: 'Holds.' } },
      advisoryWarnings: [concern]
    }))));
    expect(result.evaluationHistory.ready).toBe(true);
    expect(result.validationResults.passed).toBe(true);
  });

  // FA, requirement 6: a judge's advisory that quotes the director's text is a concern,
  // never SHOULD CONSIDER for the rework. Brief 4.7a: the article judge is truth-only, so a
  // note on the writing (the C10 line) reaches neither the stop nor the rework.
  it('an advisory that quotes the director\'s text is a concern for the stop and never reaches the rework', async () => {
    const advisory = `T12: "${CLOSING}" ends on a line the room never said.`;
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      ready: true, structuralPassed: true, overallScore: 0.9, advisoryWarnings: [advisory, 'C10: the lede runs long.']
    }))));
    expect(result.evaluationHistory.advisoryWarnings).toEqual([`${DIRECTOR_EDIT_PREFIX}E2: ${advisory}`]);
    expect(result.validationResults.advisoryWarnings).toEqual([]);
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

  // Brief 4.7a: the truth-only article judge keeps its concerns and no note on the writing.
  it('a concern reaches the stop but not the rework: validationResults leaves it out', async () => {
    const concern = `${DIRECTOR_EDIT_PREFIX}E2: T1: a motive stated as fact.`;
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      ready: true, structuralPassed: true, overallScore: 0.9, advisoryWarnings: [concern, 'C10: the lede runs long.']
    }))));
    expect(result.evaluationHistory.advisoryWarnings).toEqual([concern]);
    expect(result.validationResults.advisoryWarnings).toEqual([]);
  });

  it('with no standing edits nothing moves (the arc judge has none)', async () => {
    const issue = `T1: "${CLOSING}" states a motive.`;
    const article = await evaluateArticle(articleState('journalist', { _articleHandEdits: null }), cfg(judging(verdict({ structuralIssues: [issue] }))));
    expect(article.evaluationHistory.structuralIssues).toEqual([issue]);
    expect(article.evaluationHistory.ready).toBe(false);
    const arcs = await evaluateArcs({ ...reworkFixtureState('journalist'), meetingApproved: false, evaluationHistory: [] }, cfg(judging(verdict({ structuralIssues: [issue] }))));
    expect(arcs.evaluationHistory.structuralIssues).toEqual([issue]);
  });

  // Fix round 1, finding 2: a finding names the record it contradicts, and the writer's
  // evidence card prints that record passage word for word. The citation is the
  // record's, so the finding is about the director's line alone.
  it('a finding that cites a record passage a writer\'s card prints still moves, and its criterion is released', async () => {
    const TEST_RESULT = 'The probability of paternity is 99.9 percent.';   // the p-dna document, word for word
    const state = articleState();
    state.contentBundle.sections[0].content.push({ type: 'evidence-card', tokenId: 'p-dna', headline: 'The test', content: TEST_RESULT });
    const cited = `T1: "${CLOSING}" states Alex's motive as fact; the record holds only the test result, "${TEST_RESULT}"`;
    const result = await evaluateArticle(state, cfg(judging(verdict({
      criteriaScores: { evidenceTruth: { score: 0.3, type: 'structural', notes: `The closing outruns "${TEST_RESULT}"`, fix: 'Attribute the motive.' } },
      structuralIssues: [cited]
    }))));
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([`${DIRECTOR_EDIT_PREFIX}E2: ${cited}`]);
    expect(result.evaluationHistory.ready).toBe(true);
  });
});

// Fix round 1, finding 1: the rework reads validationResults. A verdict whose findings
// about the director's edits moved must not hand the automatic pass that follows a fix
// located in the director's text: not in CRITERIA SCORES, not in the judge's guidance,
// and not as a truth criterion restated as a must-fix line.
describe('what the rework reads of a verdict about the director\'s edits (F1, fix round 1)', () => {
  const CLOSING_ISSUE = `T1: "${CLOSING}" states Alex's motive as fact; the record holds only the January demand. State it as the room's suspicion.`;
  const WRITER_ISSUE = `T12: "${WRITER_LINE}" is not in the record. Cut the line.`;
  const verdict = (overrides) => ({
    ready: false, structuralPassed: false, overallScore: 0.7, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [],
    revisionGuidance: '', confidence: 'high', ...overrides
  });

  /**
   * The part of a rework's context that carries the evaluation: from its must-fix list to
   * <HAND_EDITS> (phase 18, run 2b, brief K: the findings alone, with no summary above them).
   */
  function evaluationPart(validationResults, state) {
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 1, validationResults, previousOutput: state.contentBundle,
      humanFeedback: null, handEdits: state._articleHandEdits
    });
    expect(contextSection).toContain('<HAND_EDITS>');
    return contextSection.slice(contextSection.indexOf('ISSUES TO ADDRESS'), contextSection.indexOf('<HAND_EDITS>'));
  }

  it('journalist, a mixed verdict: the automatic pass reads the writer\'s fixes and none located in the director\'s text', async () => {
    const state = articleState();
    const result = await evaluateArticle(state, cfg(judging(verdict({
      criteriaScores: {
        evidenceTruth: { score: 0.3, type: 'structural', notes: 'The closing states Alex\'s motive as fact.', fix: 'Rewrite the closing so the motive is the room\'s suspicion.' },
        wordsTruth: { score: 0.4, type: 'structural', notes: 'A line no document holds.', fix: 'Cut the line.' }
      },
      structuralIssues: [CLOSING_ISSUE, WRITER_ISSUE],
      revisionGuidance: 'Step 1: rewrite the closing as the room\'s suspicion. Step 2: cut the Riley line.'
    }))));
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([`${DIRECTOR_EDIT_PREFIX}E2: ${CLOSING_ISSUE}`]);
    // The released criterion keeps its score; its notes and fix stay with the concern.
    expect(result.validationResults.criteriaScores).toEqual({
      evidenceTruth: { score: 0.3, type: 'structural' },
      wordsTruth: { score: 0.4, type: 'structural', notes: 'A line no document holds.', fix: 'Cut the line.' }
    });
    expect(result.validationResults.structuralIssues).toEqual([WRITER_ISSUE]);
    expect(result.validationResults.revisionGuidance).toBe('');
    expect(result.validationResults.feedback).toBe('');

    const part = evaluationPart(result.validationResults, state);
    // Brief K: the must-fix line reads the limit's name for its code, and the writer's fix is
    // read once, in it; wordsTruth's fix, its second copy, does not print.
    expect(part).toContain(`  - Quotes are exact: "${WRITER_LINE}" is not in the record. Cut the line.`);
    expect(part.split('Cut the line.').length - 1).toBe(1);
    expect(part).not.toContain(CLOSING);
    expect(part).not.toContain('the closing');
    expect(part).not.toContain('The closing');
  });

  // Brief 4.7a (R1): the detective's mixed verdict, on its weighted criteria, went with its
  // article judge; the journalist's mixed verdict above is the one article judge's.

  it('a truth criterion the judge wrote up as a concern is not restated as a must-fix, and the output is ready', async () => {
    const concern = `${DIRECTOR_EDIT_PREFIX}E2: T1: "${CLOSING}" states Alex's motive as fact.`;
    const lowTruth = { evidenceTruth: { score: 0.3, type: 'structural', notes: 'The closing states a motive as fact.', fix: 'Attribute it.' } };
    for (const filed of [{ advisoryWarnings: [concern] }, { structuralIssues: [concern] }]) {
      const result = await evaluateArticle(articleState(), cfg(judging(verdict({ criteriaScores: lowTruth, ...filed }))));
      expect(result.evaluationHistory.ready).toBe(true);
      expect(result.evaluationHistory.structuralIssues).toEqual([]);
      expect(result.evaluationHistory.advisoryWarnings).toEqual([concern]);
      expect(result.validationResults.structuralIssues).toEqual([]);
      expect(result.validationResults.criteriaScores).toEqual({ evidenceTruth: { score: 0.3, type: 'structural' } });
    }
    // A concern may name the criterion instead of its rules.
    const byName = `${DIRECTOR_EDIT_PREFIX}E2: evidenceTruth: the closing states a motive as fact.`;
    const named = await evaluateArticle(articleState(), cfg(judging(verdict({ criteriaScores: lowTruth, advisoryWarnings: [byName] }))));
    expect(named.evaluationHistory.ready).toBe(true);
    expect(named.evaluationHistory.structuralIssues).toEqual([]);
  });

  it('beside a writer\'s issue, a truth criterion written up as a concern adds no must-fix line', async () => {
    const concern = `${DIRECTOR_EDIT_PREFIX}E2: T1: "${CLOSING}" states Alex's motive as fact.`;
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      criteriaScores: {
        evidenceTruth: { score: 0.3, type: 'structural', notes: 'The closing states a motive as fact.', fix: 'Attribute it.' },
        wordsTruth: { score: 0.4, type: 'structural', notes: `"${WRITER_LINE}" is in no document.`, fix: 'Cut the line.' }
      },
      structuralIssues: [WRITER_ISSUE],
      advisoryWarnings: [concern]
    }))));
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.validationResults.structuralIssues).toEqual([WRITER_ISSUE]);
    expect(result.validationResults.criteriaScores.evidenceTruth).toEqual({ score: 0.3, type: 'structural' });
    expect(result.validationResults.criteriaScores.wordsTruth.fix).toBe('Cut the line.');
  });

  // Brief 4.7a: on a truth criterion, the article judge's criteria being the truth criteria
  // alone; the concern is labelled by the criterion's rule ids.
  it('a criterion whose notes quote only the director\'s text joins the concerns, and alone it does not hold the output', async () => {
    const result = await evaluateArticle(articleState(), cfg(judging(verdict({
      criteriaScores: { fictionTruth: { score: 0.5, type: 'structural', notes: `The closing "${CLOSING}" names the game's machinery.`, fix: 'Rewrite it in the fiction\'s words.' } }
    }))));
    expect(result.evaluationHistory.ready).toBe(true);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E2: T14: The closing "${CLOSING}" names the game's machinery. Rewrite it in the fiction's words.`
    ]);
    expect(result.validationResults.criteriaScores).toEqual({ fictionTruth: { score: 0.5, type: 'structural' } });
    expect(result.validationResults.advisoryWarnings).toEqual([]);
  });

  // Brief 4.7a: on two truth criteria, the article judge's criteria being the truth criteria
  // alone.
  it('with no standing edits the rework reads the judge\'s criteria and guidance as they came', async () => {
    const criteriaScores = {
      evidenceTruth: { score: 0.3, type: 'structural', notes: 'The closing states a motive as fact.', fix: 'Attribute it.' },
      fictionTruth: { score: 0.5, type: 'structural', notes: `The closing "${CLOSING}" names the game's machinery.`, fix: 'Rewrite it.' }
    };
    const guidance = 'Step 1: rewrite the closing.';
    const result = await evaluateArticle(articleState('journalist', { _articleHandEdits: null }), cfg(judging(verdict({
      criteriaScores, structuralIssues: [CLOSING_ISSUE], revisionGuidance: guidance
    }))));
    expect(result.validationResults.criteriaScores).toEqual(criteriaScores);
    expect(result.validationResults.revisionGuidance).toBe(guidance);
    expect(result.validationResults.feedback).toBe(guidance);
    // The failed T14 criterion, under which the judge wrote no issue, adds its must-fix line.
    expect(result.validationResults.structuralIssues).toEqual([
      CLOSING_ISSUE, `T14: The closing "${CLOSING}" names the game's machinery. Rewrite it.`
    ]);
    expect(result.evaluationHistory.ready).toBe(false);
  });

  // FA, requirement 5 at a later send-back: the verdict carries each criterion's rule ids,
  // so the send-back's rework can keep a criterion's notes and fix away when an issue under
  // its rules is located in the director's newest edits (node-helpers.js withoutDirectorsFindings).
  // Brief 4.13 (R14; R1): the journalist's judge; the parked detective, which names no rules
  // folder, has no judge prompt and so no verdict (lib/__tests__/theme-rules.test.js).
  it.each(['journalist'])('%s: the rework\'s verdict carries the rule ids each criterion scores', async (theme) => {
    const result = await evaluateArticle(articleState(theme, { _articleHandEdits: null }), cfg(judging(verdict({ ready: true, structuralPassed: true })), theme));
    const { getPhaseCriteria } = require('../../../lib/workflow/nodes/evaluator-nodes')._testing;
    const expected = Object.fromEntries(Object.entries(getPhaseCriteria('article', theme))
      .filter(([, criterion]) => Array.isArray(criterion.rules) && criterion.rules.length > 0)
      .map(([key, criterion]) => [key, criterion.rules]));
    expect(result.validationResults.criteriaRules || {}).toEqual(expected);
    expect(result.validationResults.criteriaRules.verdictTruth).toEqual(['T2']);
  });
});

// FA fix round 1, finding 2: a move is the block's place only. The director moved the
// writer's paragraph to the closing without changing it, so a finding that quotes the
// paragraph is about the writer's text: it stays must-fix, and the output is not ready.
describe('a paragraph the director only moved is the writer\'s at the judge (FA, fix round 1)', () => {
  const WRITER_ISSUE = `T12: "${WRITER_LINE}" is not in the record. Cut the line.`;
  /** The writer's article with WRITER_LINE moved, unchanged, from THE STORY to the closing. */
  const movedArticle = () => {
    const a = writersArticle();
    const [line] = a.sections[0].content.splice(2, 1);
    a.sections[1].content.push(line);
    return a;
  };
  const movedState = (theme = 'journalist') => articleState(theme, {
    contentBundle: movedArticle(),
    _articleHandEdits: standingAfterSendBack(null, writersArticle(), movedArticle(), 'bundle')
  });

  it.each(['journalist', 'detective'])('%s judge: the move is listed by its place and the words the block begins with', (theme) => {
    const state = movedState(theme);
    const prompt = buildEvaluationUserPrompt('article', state, { factCheck: null, directorEdits: buildFactCheckArgs(state).directorEdits });
    const section = prompt.slice(prompt.indexOf("THE DIRECTOR'S EDITS"), prompt.indexOf('THE FACT CHECK ON THIS BUNDLE'));
    expect(section).toContain('E1 (section "closing", paragraph, moved from section "the-story"): begins "Riley watched the ledger all morning and said…"');
    expect(section).toContain('A line marked moved names a block the director moved to that place without changing it: the place is the director\'s, and the block\'s text is still the writer\'s.');
    expect(section).not.toContain(WRITER_LINE);
  });

  it('a finding that quotes the moved paragraph stays structural, and the output is not ready', async () => {
    const result = await evaluateArticle(movedState(), cfg(judging({
      ready: false, structuralPassed: false, overallScore: 0.7, criteriaScores: {},
      structuralIssues: [WRITER_ISSUE], advisoryWarnings: [], revisionGuidance: 'Step 1: cut the Riley line.', confidence: 'high'
    })));
    expect(result.evaluationHistory.structuralIssues).toEqual([WRITER_ISSUE]);
    expect(result.evaluationHistory.advisoryWarnings.filter((w) => w.startsWith(DIRECTOR_EDIT_PREFIX))).toEqual([]);
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.validationResults.structuralIssues).toEqual([WRITER_ISSUE]);
    expect(result.validationResults.revisionGuidance).toBe('Step 1: cut the Riley line.');
  });
});

// Task 4.5e (the integrator's ruling 4 on run 5's follow-ups; scratch 4.5d-review/guard-probe.js):
// the judge may file a finding under the prefix and the id of a block the director only moved,
// quoting the block's text, which is the writer's. The guard moved such a finding to the
// concerns as it was, so the article read ready and no fix ran. A move owns no text, so the
// guard reads a finding filed under such edits alone by its quotes: a quote of the writer's
// text is the writer's must-fix, and a quote of the director's text a concern under the id of
// the edit it quotes, however the judge filed it.
describe("4.5e: a finding filed under a moved block's id is read by its quotes", () => {
  const WRITER_FINDING = `T12: "${WRITER_LINE}" is not in the record. Cut the line.`;
  const REWRITTEN = 'Alex and Morgan argued at the bar, and Sarah kept the count for the whole room.';
  /** The writer's article with WRITER_LINE moved, unchanged, from THE STORY to the closing, and, with `rewrite`, the story's first paragraph rewritten. */
  const movedArticle = ({ rewrite = false } = {}) => {
    const a = writersArticle();
    const [line] = a.sections[0].content.splice(2, 1);
    a.sections[1].content.push(line);
    if (rewrite) a.sections[0].content[0] = paragraph(REWRITTEN);
    return a;
  };
  const movedState = (options) => articleState('journalist', {
    contentBundle: movedArticle(options),
    _articleHandEdits: standingAfterSendBack(null, writersArticle(), movedArticle(options), 'bundle')
  });
  const judged = (filed) => judging({
    ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [],
    revisionGuidance: '', confidence: 'high', ...filed
  });

  it.each([
    ['a structural issue', (finding) => ({ structuralIssues: [finding] })],
    ['an advisory', (finding) => ({ advisoryWarnings: [finding] })]
  ])("filed as %s, quoting the moved paragraph, it is the writer's must-fix", async (_name, filed) => {
    const state = movedState();
    expect(state._articleHandEdits.edits.map((e) => [e.id, Boolean(e.from)])).toEqual([['E1', true]]);
    const result = await evaluateArticle(state, cfg(judged(filed(`${DIRECTOR_EDIT_PREFIX}E1: ${WRITER_FINDING}`))));
    expect(result.evaluationHistory.structuralIssues).toEqual([WRITER_FINDING]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([]);
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.validationResults.structuralIssues).toEqual([WRITER_FINDING]);
  });

  it("filed under the move's id, a finding that quotes the director's own text is a concern under the id of the edit it quotes", async () => {
    const state = movedState({ rewrite: true });
    expect(state._articleHandEdits.edits.map((e) => [e.id, e.path, Boolean(e.from)])).toEqual([
      ['E1', 'sections[#the-story].content[0].text', false],
      ['E2', 'sections[#closing].content[1]', true]
    ]);
    const finding = `T1: "${REWRITTEN}" puts Sarah at the count, which no document records.`;
    const result = await evaluateArticle(state, cfg(judged({ structuralIssues: [`${DIRECTOR_EDIT_PREFIX}E2: ${finding}`] })));
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([`${DIRECTOR_EDIT_PREFIX}E1: ${finding}`]);
    expect(result.evaluationHistory.ready).toBe(true);
  });
});

// Task 4.5f (the integrator's ruling 2 on 4.5e's findings, progress.md 2026-10-04; scratch
// 4.5e-review/guard-noquote.js): a finding the judge files under the prefix and the id of a
// block the director moved, quoting nothing, is how the judge disagrees with the director's
// choice of the block's place, which no rework may change. It stays a concern beside the move,
// as the judge filed it. Only a quote of the writer's words makes such a finding the writer's
// must-fix. A finding filed under the move and a text-owning edit together stays a concern as
// the judge filed it, whatever it quotes, as one under the text edit alone does.
describe("4.5f: a finding filed under a moved block's id is the writer's must-fix only when it quotes the writer's words", () => {
  const PLACE_FINDING = 'T1: the closing now carries the ledger line after the verdict, which the record orders the other way.';
  const WRITER_FINDING = `T12: "${WRITER_LINE}" is not in the record. Cut the line.`;
  const REWRITTEN = 'Alex and Morgan argued at the bar, and Sarah kept the count for the whole room.';
  /** The writer's article with the story's first paragraph rewritten (E1) and WRITER_LINE moved, unchanged, to the closing (E2). */
  const editedArticle = () => {
    const a = writersArticle();
    const [line] = a.sections[0].content.splice(2, 1);
    a.sections[1].content.push(line);
    a.sections[0].content[0] = paragraph(REWRITTEN);
    return a;
  };
  const editedState = () => articleState('journalist', {
    contentBundle: editedArticle(),
    _articleHandEdits: standingAfterSendBack(null, writersArticle(), editedArticle(), 'bundle')
  });
  const judged = (filed) => judging({
    ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [],
    revisionGuidance: '', confidence: 'high', ...filed
  });
  const LISTS = [
    ['a structural issue', (finding) => ({ structuralIssues: [finding] })],
    ['an advisory', (finding) => ({ advisoryWarnings: [finding] })]
  ];

  it('the edits: the rewrite owns text, the move owns none', () => {
    expect(editedState()._articleHandEdits.edits.map((e) => [e.id, e.path, Boolean(e.from)])).toEqual([
      ['E1', 'sections[#the-story].content[0].text', false],
      ['E2', 'sections[#closing].content[1]', true]
    ]);
  });

  it.each(LISTS)('filed as %s under the move alone, quoting nothing: a concern beside the move, as the judge filed it, and the article is ready', async (_name, filed) => {
    const finding = `${DIRECTOR_EDIT_PREFIX}E2: ${PLACE_FINDING}`;
    const result = await evaluateArticle(editedState(), cfg(judged(filed(finding))));
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([finding]);
    expect(result.evaluationHistory.ready).toBe(true);
    expect(result.validationResults.structuralIssues).toEqual([]);
  });

  it.each(LISTS)("filed as %s under the move alone, quoting the writer's words: the writer's must-fix", async (_name, filed) => {
    const result = await evaluateArticle(editedState(), cfg(judged(filed(`${DIRECTOR_EDIT_PREFIX}E2: ${WRITER_FINDING}`))));
    expect(result.evaluationHistory.structuralIssues).toEqual([WRITER_FINDING]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([]);
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.validationResults.structuralIssues).toEqual([WRITER_FINDING]);
  });

  it.each(LISTS)("filed as %s under the move and the rewrite together, quoting the writer's words: a concern as the judge filed it", async (_name, filed) => {
    const finding = `${DIRECTOR_EDIT_PREFIX}E1, E2: ${WRITER_FINDING}`;
    const result = await evaluateArticle(editedState(), cfg(judged(filed(finding))));
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([finding]);
    expect(result.evaluationHistory.ready).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10d: rule ids and criterion keys never reach the director (the integrator's ruling 1 on
// 4.6e's and 4.10c's minors). A truth criterion the judge scored below the bar with no issue
// under its rule ids, and no notes or fix, read "T5: the moneyTruth criterion failed.", which
// the desk shows past its rule ids as "The moneyTruth criterion failed.". It says in a plain
// sentence what failed, by the criterion's subject, after its rule ids, which the guard and the
// rework still read.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10d: a failed truth criterion with no notes says what failed, by its subject', () => {
  const { _testing: { guardDirectorEdits, getPhaseCriteria } } = require('../../../lib/workflow/nodes/evaluator-nodes');
  /** A verdict whose one failed criterion carries no notes and no fix, and no issue under its rule ids. */
  const failedBare = (key) => ({
    ready: false, structuralPassed: false, overallScore: 0.2, criteriaScores: { [key]: { score: 0.2 } }, structuralIssues: [], advisoryWarnings: []
  });
  /** What the director reads, and the rework reads after the rule ids, for each truth criterion. */
  const SUBJECTS = {
    evidenceTruth: 'how the claims are written against their evidence',
    moneyTruth: 'the money',
    verdictTruth: 'how the verdict is told',
    stagesTruth: 'the timeline',
    novaPositionTruth: "the reporter's role",
    playersTruth: "the players' pronouns or how the players are judged",
    wordsTruth: 'the quoted words',
    photosTruth: 'the photos or their captions',
    fictionTruth: 'keeping the fiction whole'
  };

  it.each(['arcs', 'article'])('every %s truth criterion: its rule ids, then a plain sentence naming its subject, never its key', (phase) => {
    const criteria = getPhaseCriteria(phase);
    for (const [key, { rules }] of Object.entries(criteria)) {
      const { kept, ready } = guardDirectorEdits({ evaluation: failedBare(key), criteria, edits: [], output: null });
      expect([key, kept]).toEqual([key, [`${rules.join(', ')}: The judge found a fault in ${SUBJECTS[key]} and gave no detail.`]]);
      expect([key, ready]).toEqual([key, false]);
    }
  });

  it("with the director's edits standing, the article's rework reads the sentence as must-fix", async () => {
    const result = await evaluateArticle(articleState(), cfg(judging(failedBare('moneyTruth'))));
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.validationResults.structuralIssues).toEqual(['T5: The judge found a fault in the money and gave no detail.']);
  });

  it("a criterion's notes or fix, when it has them, are the line as before", () => {
    const criteria = getPhaseCriteria('article');
    const evaluation = { ...failedBare('moneyTruth'), criteriaScores: { moneyTruth: { score: 0.2, notes: 'The bonus runs to the wrong account.', fix: 'Pay it to the seller.' } } };
    expect(guardDirectorEdits({ evaluation, criteria, edits: [], output: null }).kept).toEqual(['T5: The bonus runs to the wrong account. Pay it to the seller.']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 18, run 2f (R41): the guard reads a limit's name as its code. The article judge is told
// to open a concern about one of the director's edits "with the edit's id and then the limit it
// concerns", and a judge may write the limit by its name, as its own list of the limits gives it
// (LIMIT_CODES). Read only by code, such a concern covered no criterion: the criterion it was
// about became a must-fix line under its codes, and a rework was sent about the director's own
// line. A name is read whole, so the comma inside one is no break between two limits, and the
// limit on Nova taking no side is read with or without the clause its entry adds.
// ═══════════════════════════════════════════════════════════════════════════
describe("R41: the guard reads a limit's name as its code", () => {
  const { LIMIT_CODES, _testing: { guardDirectorEdits, getPhaseCriteria, judgedEdits } } = require('../../../lib/workflow/nodes/evaluator-nodes');
  const nameOf = (code) => LIMIT_CODES.find((limit) => limit.code === code).name;
  const NOTES = 'One of the lines says more than its source does.';

  /**
   * The guard's reading of a verdict that failed `keys` with notes that quote nothing, beside one
   * concern about the director's closing (E2) that opens with `opening`.
   */
  const guarded = (phase, keys, opening) => {
    const state = articleState();
    return guardDirectorEdits({
      evaluation: {
        ready: false, structuralPassed: false, overallScore: 0.3, structuralIssues: [],
        criteriaScores: Object.fromEntries(keys.map((key) => [key, { score: 0.3, notes: NOTES, fix: 'Say less.' }])),
        advisoryWarnings: [`${DIRECTOR_EDIT_PREFIX}E2: ${opening} the closing says more than the notes do.`]
      },
      criteria: getPhaseCriteria(phase, 'journalist'),
      edits: judgedEdits('article', state),
      output: state.contentBundle
    });
  };
  /** What a covered criterion leaves: nothing to fix, nothing holding, and no notes or fix for a rework. */
  const covered = (guard, keys) => ({
    kept: guard.kept, holding: guard.holding, ready: guard.ready,
    scores: keys.map((key) => guard.criteriaScores[key])
  });
  const COVERED = (keys) => ({ kept: [], holding: [], ready: true, scores: keys.map(() => ({ score: 0.3 })) });

  /** Every limit a criterion scores, at each judge: [phase, criterion, code, name]. */
  const SCORED = ['arcs', 'article'].flatMap((phase) => Object.entries(getPhaseCriteria(phase, 'journalist'))
    .flatMap(([key, criterion]) => criterion.rules.map((code) => [phase, key, code, nameOf(code)])));

  it('the table holds every limit a criterion scores: all but the head count, at the article', () => {
    const article = SCORED.filter(([phase]) => phase === 'article').map(([, , code]) => code);
    expect([...article].sort()).toEqual(LIMIT_CODES.map((limit) => limit.code).filter((code) => code !== 'T10').sort());
  });

  it.each(SCORED)('the %s judge: a concern that names %s by %s as "%s" covers it, as its code does', (phase, key, code, name) => {
    const byCode = covered(guarded(phase, [key], `${code}:`), [key]);
    expect(byCode).toEqual(COVERED([key]));
    expect(covered(guarded(phase, [key], `${name}:`), [key])).toEqual(byCode);
  });

  it('a name is read in any case, and before a full stop as the list of the limits prints it', () => {
    expect(covered(guarded('article', ['verdictTruth'], 'the verdict:'), ['verdictTruth'])).toEqual(COVERED(['verdictTruth']));
    expect(covered(guarded('article', ['verdictTruth'], 'The verdict.'), ['verdictTruth'])).toEqual(COVERED(['verdictTruth']));
    // With its code after it in brackets, or a dash where the colon would be.
    expect(covered(guarded('article', ['verdictTruth'], 'The verdict (T2):'), ['verdictTruth'])).toEqual(COVERED(['verdictTruth']));
    expect(covered(guarded('article', ['verdictTruth'], 'The verdict -'), ['verdictTruth'])).toEqual(COVERED(['verdictTruth']));
    // And after its code, as the judge's list prints each limit: the code alone is read, as before.
    expect(covered(guarded('article', ['verdictTruth'], 'T2 The verdict:'), ['verdictTruth'])).toEqual(COVERED(['verdictTruth']));
  });

  it('a name that holds a comma is one limit: the comma is no break between two', () => {
    // "Characters, never the players" is T11, which playersTruth scores.
    expect(covered(guarded('article', ['playersTruth'], 'Characters, never the players:'), ['playersTruth'])).toEqual(COVERED(['playersTruth']));
    // "Nova takes no side, with the part about this session" is T8 whole, comma and "with" included.
    expect(covered(guarded('article', ['novaPositionTruth'], 'Nova takes no side, with the part about this session:'), ['novaPositionTruth']))
      .toEqual(COVERED(['novaPositionTruth']));
  });

  it("the limit on Nova taking no side is read by its own lead-in too, without the clause its entry adds", () => {
    expect(nameOf('T8')).toBe('Nova takes no side, with the part about this session');
    expect(covered(guarded('article', ['novaPositionTruth'], 'Nova takes no side:'), ['novaPositionTruth'])).toEqual(COVERED(['novaPositionTruth']));
  });

  it('two limits named in a row are both read, each by its name', () => {
    const both = ['verdictTruth', 'playersTruth'];
    expect(covered(guarded('article', both, 'The verdict and Pronouns:'), both)).toEqual(COVERED(both));
    expect(covered(guarded('article', both, 'T2, T9:'), both)).toEqual(COVERED(both));
    const withComma = ['novaPositionTruth', 'playersTruth'];
    expect(covered(guarded('article', withComma, 'Nova takes no side, Pronouns:'), withComma)).toEqual(COVERED(withComma));
    expect(covered(guarded('article', withComma, 'Nova takes no side, with the part about this session, Characters, never the players:'), withComma))
      .toEqual(COVERED(withComma));
  });

  it("a concern that names one limit covers that limit's criterion and no other", () => {
    const guard = guarded('article', ['verdictTruth', 'moneyTruth'], 'The verdict:');
    expect(guard.kept).toEqual([`T5: ${NOTES} Say less.`]);
    expect(guard.holding).toEqual(['moneyTruth']);
    expect(guard.ready).toBe(false);
    expect(guard.criteriaScores.verdictTruth).toEqual({ score: 0.3 });
    expect(guard.criteriaScores.moneyTruth.fix).toBe('Say less.');
  });

  it('a concern that opens with no limit, or with words that only begin like one, or that names one further in, covers nothing, as before', () => {
    const uncovered = { kept: [`T13: ${NOTES} Say less.`], holding: ['photosTruth'], ready: false };
    for (const opening of ['', 'Photoshoots:', 'Photos of the party show too much:', 'About Photos:']) {
      const guard = guarded('article', ['photosTruth'], opening);
      expect([opening, { kept: guard.kept, holding: guard.holding, ready: guard.ready }]).toEqual([opening, uncovered]);
    }
  });

  it('through the article judge: the concern reaches the stop, no rework is sent, and the rework reads no notes of it', async () => {
    const concern = `${DIRECTOR_EDIT_PREFIX}E2: What can be stated as fact: "${CLOSING}" states Alex's motive as fact.`;
    const result = await evaluateArticle(articleState(), cfg(judging({
      ready: false, structuralPassed: false, overallScore: 0.3, confidence: 'high', structuralIssues: [],
      criteriaScores: { evidenceTruth: { score: 0.3, notes: 'The closing states a motive as fact.', fix: 'Attribute it.' } },
      advisoryWarnings: [concern]
    })));
    expect(result.evaluationHistory.ready).toBe(true);
    expect(result.evaluationHistory.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([concern]);
    expect(result.validationResults.structuralIssues).toEqual([]);
    expect(result.validationResults.criteriaScores).toEqual({ evidenceTruth: { score: 0.3, type: 'structural' } });
  });
});
