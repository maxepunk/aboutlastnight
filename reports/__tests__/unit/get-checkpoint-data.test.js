process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * getCheckpointData — what the console is actually given at each gate
 * (CODE-REVIEW H6, H13, H25 — server half)
 *
 * H6: the evaluator's verdict never reached the operator. Every checkpoint
 * payload carried the whole raw `evaluationHistory` array (append-only, mixed
 * phases, revision-invalidation stubs interleaved) and the console showed none
 * of it, so the operator approved arcs/outline/article with no idea what the
 * $5 Opus evaluation had said. `lastEvaluation` is the last entry FOR THIS PHASE.
 *
 * H13: the article gate showed a JSON blob. `htmlPreview` renders the bundle
 * through the same TemplateAssembler the pipeline publishes with, so the
 * operator approves what they can actually read.
 *
 * H25: an empty enrichment looked identical to a session with nothing in the
 * notes. The counts (and the fallback marker) make the difference visible.
 */

// Assembly must be mockable per-test (the "assembly throws" case).
jest.mock('../../lib/template-assembler', () => {
  const actual = jest.requireActual('../../lib/template-assembler');
  return { ...actual, createTemplateAssembler: jest.fn(actual.createTemplateAssembler) };
});

const { getCheckpointData } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { REVISION_CAPS } = require('../../lib/workflow/state');
const { createTemplateAssembler } = require('../../lib/template-assembler');

const VALID_BUNDLE = () => JSON.parse(JSON.stringify(
  require('../fixtures/content-bundles/valid-journalist.json')
));

describe('getCheckpointData — lastEvaluation (H6)', () => {
  const HISTORY = [
    { phase: 'arcs', overallScore: 0.9 },
    { phase: 'outline', overallScore: 0.7 },
    { phase: 'arcs', overallScore: 0.95 }
  ];

  it('gives arc-selection the LAST arcs evaluation, not the last entry overall', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, { evaluationHistory: HISTORY });
    expect(data.lastEvaluation.overallScore).toBe(0.95);
  });

  it('gives the outline gate the outline evaluation', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: HISTORY });
    expect(data.lastEvaluation.overallScore).toBe(0.7);
  });

  it('is null when this phase has never been evaluated', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: HISTORY, contentBundle: null });
    expect(data.lastEvaluation).toBeNull();
  });

  it('is null when there is no history at all', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, {});
    expect(data.lastEvaluation).toBeNull();
  });

  it('keeps the raw evaluationHistory for backward compatibility', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, { evaluationHistory: HISTORY });
    expect(data.evaluationHistory).toEqual(HISTORY);
  });
});

describe('getCheckpointData — article preview (H13)', () => {
  beforeEach(() => {
    createTemplateAssembler.mockClear();
    createTemplateAssembler.mockImplementation(
      jest.requireActual('../../lib/template-assembler').createTemplateAssembler
    );
  });

  it('renders the content bundle to HTML with a root <base>', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      contentBundle: VALID_BUNDLE(),
      sessionId: '071826',
      sessionPhotos: ['/data/071826/photos/a.jpg'],
      theme: 'journalist'
    });
    expect(typeof data.htmlPreview).toBe('string');
    expect(data.htmlPreview.startsWith('<!DOCTYPE')).toBe(true);
    // Without it, relative sessionphotos/ URLs resolve against /console/ in the
    // preview iframe and every image 404s.
    expect(data.htmlPreview).toContain('<base href="/">');
  });

  it('passes sessionPhotos through so the gate can list what was available', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      contentBundle: VALID_BUNDLE(),
      sessionId: '071826',
      sessionPhotos: ['/data/071826/photos/a.jpg', '/data/071826/photos/b.jpg']
    });
    expect(data.sessionPhotos).toEqual(['/data/071826/photos/a.jpg', '/data/071826/photos/b.jpg']);
  });

  it('is null — not a thrown 500 — when assembly fails', async () => {
    createTemplateAssembler.mockImplementation(() => ({
      assemble: async () => { throw new Error('Invalid ContentBundle: /sections: must be array'); }
    }));
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      contentBundle: { broken: true },
      sessionId: '071826'
    });
    expect(data.htmlPreview).toBeNull();
    // The gate still has to render: the operator needs the JSON and the feedback box.
    expect(data.contentBundle).toEqual({ broken: true });
  });

  it('is null when there is no bundle yet', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { sessionId: '071826' });
    expect(data.htmlPreview).toBeNull();
    expect(createTemplateAssembler).not.toHaveBeenCalled();
  });
});

describe('getCheckpointData — enrichment counts (H25)', () => {
  it('counts what the enricher indexed and surfaces the fallback marker', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.INPUT_REVIEW, {
      directorNotes: {
        quotes: [1, 2],
        characterMentions: { Vic: [1] },
        transactionReferences: [],
        _enrichmentFallback: { reason: 'x' }
      }
    });
    expect(data.enrichment).toEqual({
      quotes: 2,
      characterMentions: 1,
      transactionReferences: 0,
      fallback: { reason: 'x' },
      warnings: null
    });
  });

  it('no longer returns the dead parsedInput key', async () => {
    // `_parsedInput` was never an Annotation channel, so LangGraph dropped every
    // write and this key was always undefined. The writes are gone too
    // (fetch-nodes.js, input-nodes.js).
    const data = await getCheckpointData(CHECKPOINT_TYPES.INPUT_REVIEW, { _parsedInput: { parsedAt: 'x' } });
    expect('parsedInput' in data).toBe(false);
  });

  it('reports zeroes rather than throwing when directorNotes is absent', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.INPUT_REVIEW, {});
    expect(data.enrichment).toEqual({
      quotes: 0,
      characterMentions: 0,
      transactionReferences: 0,
      fallback: null,
      warnings: null
    });
  });

  it('passes the dropped-quote warnings through', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.INPUT_REVIEW, {
      directorNotes: { quotes: [], characterMentions: {}, transactionReferences: [], _enrichmentWarnings: { droppedQuotes: 3 } }
    });
    expect(data.enrichment.warnings).toEqual({ droppedQuotes: 3 });
  });
});

describe('getCheckpointData — the ledger at the input review (phase 3, brief 3.5)', () => {
  const { ledgerReviewOf } = require('../../lib/session-ledger');

  it('carries the clock, the adjustments, the accounts and the totals check, from the one pure function', async () => {
    const state = {
      sessionConfig: {
        sessionClock: { decided: true, evening: true, firstTime: '07:37 PM' },
        adjustments: [{ time: '07:50 PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' }],
        ledgerCheck: { adjustmentsParsed: true, mismatches: [], unclassified: [] }
      },
      shellAccounts: [{ name: 'Ember', total: 925000, tokenCount: 2, rank: 1 }]
    };
    const data = await getCheckpointData(CHECKPOINT_TYPES.INPUT_REVIEW, state);
    expect(data.ledger).toEqual(ledgerReviewOf(state));
    expect(data.ledger.clock.evening).toBe(true);
    expect(data.ledger.adjustmentsParsed).toBe(true);
  });

  it('says a thread from before phase 3 has no adjustments parsed, and decides its clock from its exposures', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.INPUT_REVIEW, {
      sessionConfig: { exposures: [{ tokenId: 'nat002', time: '02:25 PM' }] },
      shellAccounts: []
    });
    expect(data.ledger.adjustmentsParsed).toBe(false);
    expect(data.ledger.clock).toEqual({ decided: true, evening: false, firstTime: '02:25 PM' });
  });
});

describe('steering keys (spec 2026-09-19 §4.4, §5.5, §6.2)', () => {
  const NOTES = [{ gate: 'outline', kind: 'rejection', round: 1, text: 'x', at: 't' }];

  // F1: the report names each of the director's edits a pass changed, by id, with the
  // director's text, what it became, the pass and the reason (lib/hand-edit-diff.js
  // reportAfterPass); checked lists the ids the round's passes checked.
  const CHANGED = {
    id: 'E2', scope: 'section:closing', cut: false, director: 'Alex wanted Marcus out.', became: 'Alex may yet pay.',
    pass: 'send-back', automatic: false, reason: 'The note asked for an open ending.'
  };

  it('outline carries handEditReport and directorGateNotes', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: [], _outlineHandEditReport: { checked: ['E1'], changed: [] }, directorGateNotes: NOTES });
    expect(data.handEditReport).toEqual({ checked: ['E1'], changed: [] });
    expect(data.directorGateNotes).toEqual(NOTES);
  });

  it('outline defaults to a null report and an empty notes list', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: [] });
    expect(data.handEditReport).toBeNull();
    expect(data.directorGateNotes).toEqual([]);
  });

  it('article carries handEditReport, directorGateNotes and the journalist outlineThesis', async () => {
    const lede = { hook: 'H', keyTension: 'T', primaryArc: 'A', selectedEvidence: ['e'] };
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null, outline: { lede }, _articleHandEditReport: { checked: ['E1', 'E2'], changed: [CHANGED] }, directorGateNotes: NOTES });
    expect(data.handEditReport).toEqual({ checked: ['E1', 'E2'], changed: [CHANGED] });
    expect(data.directorGateNotes).toEqual(NOTES);
    expect(data.outlineThesis).toEqual({ hook: 'H', keyTension: 'T', primaryArc: 'A' });
  });

  it('a report written before F1 (scope keys, no ids) reaches the stop as none', async () => {
    const article = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null, _articleHandEditReport: { checked: ['headline'], changed: ['headline'] } });
    expect(article.handEditReport).toBeNull();
    const outline = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: [], _outlineHandEditReport: { checked: ['lede'], changed: [] } });
    expect(outline.handEditReport).toBeNull();
  });

  it('article outlineThesis is null for the detective theme and when the outline has no lede', async () => {
    const d = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null, theme: 'detective', outline: { lede: { hook: 'H' } } });
    expect(d.outlineThesis).toBeNull();
    const none = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null, outline: {} });
    expect(none.outlineThesis).toBeNull();
  });

  it('arc-selection carries directorGateNotes', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, { evaluationHistory: [], narrativeArcs: [], directorGateNotes: NOTES });
    expect(data.directorGateNotes).toEqual(NOTES);
  });
});

// Brief 1.4: the console shows "Round N" from the director's own counter and the
// automated budget from the other. The outline and article stops sent neither, so
// RevisionDiff read the automated counter as if it were the round and printed
// "Maximum revisions reached — this is the final version" after two send-backs.
describe('rounds (brief 1.4)', () => {
  it('the outline stop carries the round count beside the automated budget', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, {
      evaluationHistory: [], outlineRevisionCount: 1, humanOutlineRevisionCount: 2
    });
    expect(data.revisionCount).toBe(1);
    expect(data.humanRevisionCount).toBe(2);
    expect(data.maxRevisions).toBe(REVISION_CAPS.OUTLINE);
  });

  it('the article stop carries the round count beside the automated budget', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      evaluationHistory: [], contentBundle: null, articleRevisionCount: 0, humanArticleRevisionCount: 3
    });
    expect(data.revisionCount).toBe(0);
    expect(data.humanRevisionCount).toBe(3);
    expect(data.maxRevisions).toBe(REVISION_CAPS.ARTICLE);
  });

  it('both round counts default to 0 on a thread that predates them', async () => {
    const outline = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: [] });
    expect(outline.humanRevisionCount).toBe(0);
    const article = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null });
    expect(article.humanRevisionCount).toBe(0);
  });

  it('the arc stop no longer reports a cap on the director', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, {
      evaluationHistory: [], narrativeArcs: [], humanArcRevisionCount: 5
    });
    expect(data.humanRevisionCount).toBe(5);
    expect(data.maxHumanRevisions).toBeUndefined();
  });
});

describe('arc stop evidenceIndex (phase 1, brief 1.2)', () => {
  // The arc cards showed bare ids, so the director judged an arc by
  // `85620c6f-befd-4799-a877-8fc25c040d8e`. The index is what lets the card name
  // the document instead. Ids resolve the way the fact check resolves them
  // (`buildSourceMap`: id, tokenId, notionId, pageId, name), so the console and the
  // check agree on what an id means.
  const BUNDLE = {
    exposed: {
      tokens: [
        {
          id: 'mor004',
          summary: 'A paraphrase the index must not quote',
          fullContent: 'You are standing by the stairs.\nThe second line never shows.',
          rawData: { name: 'The hallway memory', owners: ['Zia'] }
        },
        { tokenId: 'vic009', rawData: { name: 'The study memory', owner: 'Vic' }, content: 'A door closes.' }
      ],
      paperEvidence: [
        {
          id: 'paper-1',
          name: "Victor's ledger page",
          owners: ['Vic'],
          description: '   Page three, entries for the week of the party.   \nMore below.'
        }
      ]
    }
  };

  it('names each exposed document, its owner, its kind and its first line', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, { evaluationHistory: [], narrativeArcs: [], evidenceBundle: BUNDLE });
    expect(data.evidenceIndex).toEqual({
      mor004: { name: 'The hallway memory', owner: 'Zia', type: 'memory', firstLine: 'You are standing by the stairs.' },
      vic009: { name: 'The study memory', owner: 'Vic', type: 'memory', firstLine: 'A door closes.' },
      'paper-1': { name: "Victor's ledger page", owner: 'Vic', type: 'paper', firstLine: 'Page three, entries for the week of the party.' }
    });
  });

  it('is an empty map, not undefined, when the bundle has not been curated yet', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, { evaluationHistory: [], narrativeArcs: [] });
    expect(data.evidenceIndex).toEqual({});
  });

  it('falls back to the id for a document with no name and leaves an unknown owner blank', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, {
      evaluationHistory: [],
      narrativeArcs: [],
      evidenceBundle: { exposed: { tokens: [{ id: 'bare001' }] } }
    });
    expect(data.evidenceIndex).toEqual({
      bare001: { name: 'bare001', owner: '', type: 'memory', firstLine: '' }
    });
  });
});

// Brief 2.7: each stop sends its automatic passes under `trace`, a key no interrupt
// payload uses (the interrupt wins a collision in buildCompleteCheckpointData). Each
// pass carries the diff of the version it started from against the version it
// produced: the next pass's starting version, or, for the last pass, the stop's own.
describe('trace (phase 2, brief 2.7)', () => {
  const { buildCompleteCheckpointData } = require('../../server.js');
  const FINDINGS = { structuralIssues: ['x'], advisoryWarnings: ['y'], criteriaScores: null, revisionGuidance: 'z' };
  const pass = (n, round, before, trigger = 'evaluation') => ({
    pass: n, round, trigger, findings: FINDINGS, before, at: `2026-09-26T10:0${n}:00.000Z`
  });

  it('the outline stop diffs each pass against the next version and sends no whole versions', async () => {
    const v1 = { lede: { hook: 'one', keyTension: 'same' }, closing: { line: 'a' } };
    const v2 = { lede: { hook: 'two', keyTension: 'same' }, closing: { line: 'a' } };
    const v3 = { lede: { hook: 'two', keyTension: 'same' }, closing: { line: 'b' } };
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, {
      evaluationHistory: [], outline: v3, humanOutlineRevisionCount: 0,
      _outlineTrace: [pass(1, 1, v1), pass(2, 1, v2)]
    });
    expect(data.trace).toHaveLength(2);
    expect(data.trace[0]).toEqual({
      pass: 1, round: 1, trigger: 'evaluation', findings: FINDINGS, at: '2026-09-26T10:01:00.000Z',
      diff: { kind: 'outline', sections: [{ key: 'lede', changes: [{ path: 'lede.hook', before: 'one', after: 'two' }] }] },
      changedScopes: ['lede']
    });
    expect(data.trace[1].diff).toEqual({ kind: 'outline', sections: [{ key: 'closing', changes: [{ path: 'closing.line', before: 'a', after: 'b' }] }] });
    expect(data.trace[1].changedScopes).toEqual(['closing']);
    data.trace.forEach((p) => expect(p).not.toHaveProperty('before'));
  });

  it('the article stop diffs with the bundle diff, by scope', async () => {
    const before = VALID_BUNDLE();
    const after = VALID_BUNDLE();
    after.headline.main = 'A sharper headline';
    after.sections[0].content[1].text = 'A rewritten second paragraph that names the roster.';
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      evaluationHistory: [], contentBundle: after, humanArticleRevisionCount: 1,
      _articleTrace: [pass(1, 2, before, 'check')]
    });
    expect(data.trace).toHaveLength(1);
    expect(data.trace[0].trigger).toBe('check');
    expect(data.trace[0].diff.kind).toBe('bundle');
    expect(data.trace[0].changedScopes).toEqual(['headline', 'section:intro']);
  });

  it('a rework that changed nothing reports no scope, not a missing diff', async () => {
    const same = VALID_BUNDLE();
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      evaluationHistory: [], contentBundle: VALID_BUNDLE(), _articleTrace: [pass(1, 1, same)]
    });
    expect(data.trace[0].changedScopes).toEqual([]);
    expect(data.trace[0].diff).toEqual({ kind: 'bundle', scopes: [] });
  });

  it('the diff is null when a version is missing (a rework that errored leaves none)', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      evaluationHistory: [], contentBundle: null, _articleTrace: [pass(1, 1, VALID_BUNDLE())]
    });
    expect(data.trace[0].diff).toBeNull();
    expect(data.trace[0].changedScopes).toBeNull();
  });

  it('sends only the current round', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, {
      evaluationHistory: [], outline: { lede: {} }, humanOutlineRevisionCount: 1,
      _outlineTrace: [pass(1, 1, { lede: {} }), pass(1, 2, { lede: {} })]
    });
    expect(data.trace.map((p) => p.round)).toEqual([2]);
  });

  it('is an empty list at both stops when no automatic pass ran', async () => {
    const outline = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: [] });
    const article = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null });
    expect(outline.trace).toEqual([]);
    expect(article.trace).toEqual([]);
  });

  it('survives the merge with the interrupt payload on both delivery paths', async () => {
    const state = { evaluationHistory: [], outline: { lede: { hook: 'b' } }, _outlineTrace: [pass(1, 1, { lede: { hook: 'a' } })] };
    const merged = await buildCompleteCheckpointData({ type: CHECKPOINT_TYPES.OUTLINE, outline: state.outline, evaluationHistory: [] }, state);
    expect(merged.trace).toHaveLength(1);
    expect(merged.trace[0].changedScopes).toEqual(['lede']);
  });
});

// Phase 3, brief 3.7 (spec C15): each of the three stops sends the current output's
// questions for the director as `writerQuestions`, a key no interrupt payload uses.
// The arcs keep theirs in the arc cache; the outline and the article carry theirs at
// their top level. An entry without both strings is not a question and is not sent.
describe('writerQuestions (phase 3, brief 3.7)', () => {
  const { buildCompleteCheckpointData } = require('../../server.js');
  const Q1 = { about: 'Sarah', question: 'The record holds nothing about Sarah: where was Sarah?' };
  const Q2 = { about: 'The 10:02 AM sale', question: 'Is this a duplicate?' };

  it('the arc stop sends the arc cache\'s questions', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, {
      narrativeArcs: [], _arcAnalysisCache: { writerQuestions: [Q1, Q2] }
    });
    expect(data.writerQuestions).toEqual([Q1, Q2]);
  });

  it('the outline stop sends the outline\'s questions', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, {
      evaluationHistory: [], outline: { lede: { hook: 'h' }, writerQuestions: [Q2] }
    });
    expect(data.writerQuestions).toEqual([Q2]);
  });

  it('the article stop sends the article\'s questions', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      evaluationHistory: [], contentBundle: { ...VALID_BUNDLE(), writerQuestions: [Q1] }
    });
    expect(data.writerQuestions).toEqual([Q1]);
  });

  it('is an empty list at each stop when the output has none, or there is no output yet', async () => {
    const arcs = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, { _arcAnalysisCache: null });
    const outline = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: [], outline: null });
    const article = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: VALID_BUNDLE() });
    expect([arcs.writerQuestions, outline.writerQuestions, article.writerQuestions]).toEqual([[], [], []]);
  });

  it('sends only entries with both an about and a question', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, {
      _arcAnalysisCache: { writerQuestions: [Q1, { about: 'Alex' }, { about: '  ', question: 'x' }, 'loose', null] }
    });
    expect(data.writerQuestions).toEqual([Q1]);
  });

  it('survives the merge with the interrupt payload', async () => {
    const state = { evaluationHistory: [], outline: { writerQuestions: [Q1] } };
    const merged = await buildCompleteCheckpointData({ type: CHECKPOINT_TYPES.OUTLINE, outline: state.outline, evaluationHistory: [] }, state);
    expect(merged.writerQuestions).toEqual([Q1]);
  });

  // Fix 3.7b (finding 5): a rollback to a stop clears that stop's questions with its
  // output, through the field each stop reads them from (ROLLBACK_CLEARS clears
  // _arcAnalysisCache, outline and contentBundle), and keeps the questions of the
  // stops before it, whose output it keeps.
  describe('a rollback clears a stop\'s questions with its output', () => {
    const { buildRollbackState } = require('../../lib/api-helpers');
    const Q3 = { kind: 'ledger', about: 'The 10:14 AM sale of $50,000', question: 'Is this a second entry for one sale?' };
    const withQuestions = () => ({
      evaluationHistory: [],
      _arcAnalysisCache: { writerQuestions: [Q1] },
      outline: { lede: { hook: 'h' }, writerQuestions: [Q2] },
      contentBundle: { ...VALID_BUNDLE(), writerQuestions: [Q3] }
    });
    const questionsAtEachStop = async (state) => ({
      'arc-selection': (await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, state)).writerQuestions,
      outline: (await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, state)).writerQuestions,
      article: (await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, state)).writerQuestions
    });

    it('every stop shows its questions before the rollback', async () => {
      expect(await questionsAtEachStop(withQuestions())).toEqual({ 'arc-selection': [Q1], outline: [Q2], article: [Q3] });
    });

    it.each([
      ['arc-selection', { 'arc-selection': [], outline: [], article: [] }],
      ['outline', { 'arc-selection': [Q1], outline: [], article: [] }],
      ['article', { 'arc-selection': [Q1], outline: [Q2], article: [] }]
    ])('a rollback to %s', async (point, expected) => {
      const state = { ...withQuestions(), ...buildRollbackState(point) };
      expect(await questionsAtEachStop(state)).toEqual(expected);
    });
  });
});
