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

  // Brief 4.5: the story meeting sends no evaluation (its payload is the meeting's), so the
  // H6 cases read the outline and article stops.
  it('gives the article stop the LAST article evaluation, not the last entry overall', async () => {
    const history = [...HISTORY, { phase: 'article', overallScore: 0.6 }, { phase: 'outline', overallScore: 0.8 }, { phase: 'article', overallScore: 0.65 }];
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: history, contentBundle: null });
    expect(data.lastEvaluation.overallScore).toBe(0.65);
  });

  // Brief 4.6 (spec 5.4): the outline judge left the graph, and the map's stop sends no
  // evaluation; its checks are code's (checkFailures, the 4.6 describe below).
  it('the map stop sends no evaluation', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: HISTORY });
    expect('lastEvaluation' in data).toBe(false);
    expect('evaluationHistory' in data).toBe(false);
  });

  it('is null when this phase has never been evaluated', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: HISTORY, contentBundle: null });
    expect(data.lastEvaluation).toBeNull();
  });

  it('is null when there is no history at all', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { contentBundle: null });
    expect(data.lastEvaluation).toBeNull();
  });

  it('keeps the raw evaluationHistory for backward compatibility', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: HISTORY, contentBundle: null });
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

// Brief 4.2: the character-IDs stop's payload carries the photos left out so far, so
// the leave-out boxes show them on a remount.
describe('getCheckpointData — the leave-out choices at the character-IDs stop (brief 4.2)', () => {
  it('sends the current list, each photo once', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.CHARACTER_IDS, {
      sessionPhotos: ['/data/092026/photos/a.jpg'],
      photoAnalyses: { analyses: [{ filename: 'a.jpg' }] },
      leftOutPhotos: ['a.jpg', 'A.JPG']
    });
    expect(data.leftOutPhotos).toEqual(['a.jpg']);
    expect(data.sessionPhotos).toEqual(['/data/092026/photos/a.jpg']);
  });

  it('sends an empty list when nothing is left out, a cleared list included', async () => {
    expect((await getCheckpointData(CHECKPOINT_TYPES.CHARACTER_IDS, { leftOutPhotos: null })).leftOutPhotos).toEqual([]);
    expect((await getCheckpointData(CHECKPOINT_TYPES.CHARACTER_IDS, {})).leftOutPhotos).toEqual([]);
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

  // Brief 4.7b: the outline's thesis went with the outline; the settled story took its place
  // (the 4.7b describe at the end).
  it('article carries handEditReport and directorGateNotes', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null, _articleHandEditReport: { checked: ['E1', 'E2'], changed: [CHANGED] }, directorGateNotes: NOTES });
    expect(data.handEditReport).toEqual({ checked: ['E1', 'E2'], changed: [CHANGED] });
    expect(data.directorGateNotes).toEqual(NOTES);
  });

  it('a report written before F1 (scope keys, no ids) reaches the stop as none', async () => {
    const article = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null, _articleHandEditReport: { checked: ['headline'], changed: ['headline'] } });
    expect(article.handEditReport).toBeNull();
    const outline = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { evaluationHistory: [], _outlineHandEditReport: { checked: ['lede'], changed: [] } });
    expect(outline.handEditReport).toBeNull();
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
  // (`documentTextsOf`, lib/evidence.js: id, tokenId, notionId, pageId, name), so the console and the
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

// Phase 3, brief 3.7 (spec C15): each stop sent the current output's questions for the
// director, a key no interrupt payload uses. Brief 4.5: the story meeting sends the weave's
// as `questions`. Brief 4.6: the writers' questions left the outline's schema, so the map's
// stop sends none; brief 4.7b: they left the article's, so the article's stop sends none
// either (spec section 10). The questions are asked at the story meeting alone.
describe('writerQuestions (phase 3, brief 3.7)', () => {
  const Q1 = { about: 'Sarah', question: 'The record holds nothing about Sarah: where was Sarah?' };
  const Q2 = { about: 'The 10:02 AM sale', question: 'Is this a duplicate?' };

  // Brief 4.5: the story meeting sends the weave's questions, with any answers, as
  // `questions` (the 4.5 describe below); the arc cache is read no more.
  it('the arc stop sends the weave\'s questions as the meeting\'s, and reads no arc cache', async () => {
    const W = { id: 'q1', kind: 'player', about: 'Sarah', question: 'What did Sarah do?', changes: 'Where Sarah prints.', answer: 'Ran the bar.' };
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, {
      weave: { threads: [], questions: [W] }, _arcAnalysisCache: { writerQuestions: [Q1, Q2] }
    });
    expect(data.questions).toEqual([W]);
    expect(data).not.toHaveProperty('writerQuestions');
  });

  it('the map stop sends no questions: they left the outline with the map (brief 4.6)', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, {
      evaluationHistory: [], outline: { headline: 'h', writerQuestions: [Q2] }
    });
    expect('writerQuestions' in data).toBe(false);
  });

  it('the article stop sends no questions: they left the article (brief 4.7b), even from a bundle stored with them', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      evaluationHistory: [], contentBundle: { ...VALID_BUNDLE(), writerQuestions: [Q1] }
    });
    expect('writerQuestions' in data).toBe(false);
  });

  it('the meeting sends an empty list when the weave has none, or there is no weave yet', async () => {
    const arcs = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, { weave: null });
    expect(arcs.questions).toEqual([]);
  });

  // Fix 3.7b (finding 5): a rollback to a stop clears that stop's questions with its
  // output. Brief 4.5 (R9): a rollback to the story meeting keeps the weave, so the meeting
  // reopens with its questions and their answers; the evidence stop above it writes the
  // weave again. Briefs 4.6 and 4.7b: the map and the article hold no questions.
  describe('a rollback clears a stop\'s questions with its output', () => {
    const { buildRollbackState } = require('../../lib/api-helpers');
    const W1 = { id: 'q1', kind: 'player', about: 'Sarah', question: 'What did Sarah do?', changes: 'Where Sarah prints.', answer: 'Ran the bar.' };
    const withQuestions = () => ({ evaluationHistory: [], weave: { threads: [], questions: [W1] }, contentBundle: VALID_BUNDLE() });
    const meetingQuestions = async (state) => (await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, state)).questions;

    it('the meeting shows its questions before the rollback', async () => {
      expect(await meetingQuestions(withQuestions())).toEqual([W1]);
    });

    it.each([
      ['evidence-and-photos', []],
      ['arc-selection', [W1]],
      ['outline', [W1]],
      ['article', [W1]]
    ])('a rollback to %s', async (point, expected) => {
      const state = { ...withQuestions(), ...buildRollbackState(point) };
      expect(await meetingQuestions(state)).toEqual(expected);
    });
  });
});

// Task 4.3b: the article stop says from the start whether the page prints the writer's
// money tracker, from TemplateAssembler's one predicate. The desk used to learn it only from
// its first preview, and until then said the ledger's tracker prints, which is false for a
// session whose ledger has no account above zero.
describe('4.3b: writerTrackerPrints at the article stop', () => {
  const at = (values) => getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { sessionId: '0926262', ...values });

  it('is true when no ledger account is above zero and the writer\'s tracker has an entry', async () => {
    expect((await at({ contentBundle: VALID_BUNDLE(), shellAccounts: [] })).writerTrackerPrints).toBe(true);
    expect((await at({ contentBundle: VALID_BUNDLE(), shellAccounts: [{ name: 'Melanie', total: 0, tokenCount: 0 }] })).writerTrackerPrints).toBe(true);
    expect((await at({ contentBundle: VALID_BUNDLE() })).writerTrackerPrints).toBe(true);
  });

  it('is false when a ledger account is above zero, or the writer\'s tracker has no entry, or there is no bundle yet', async () => {
    expect((await at({ contentBundle: VALID_BUNDLE(), shellAccounts: [{ name: 'JessKane', total: 3235000, tokenCount: 4 }] })).writerTrackerPrints).toBe(false);
    expect((await at({ contentBundle: { ...VALID_BUNDLE(), financialTracker: { entries: [] } }, shellAccounts: [] })).writerTrackerPrints).toBe(false);
    expect((await at({ contentBundle: null })).writerTrackerPrints).toBe(false);
  });

  it('is the predicate\'s answer, which the desk\'s preview route gives too', async () => {
    const { writerTrackerPrints } = require('../../lib/template-assembler');
    const preview = require('../../lib/article-preview');
    for (const shellAccounts of [[], [{ name: 'JessKane', total: 3235000 }]]) {
      const bundle = VALID_BUNDLE();
      const flag = (await at({ contentBundle: bundle, shellAccounts })).writerTrackerPrints;
      expect([shellAccounts, flag]).toEqual([shellAccounts, writerTrackerPrints(bundle.financialTracker, shellAccounts)]);
      expect([shellAccounts, flag]).toEqual([shellAccounts, preview.writerTrackerPrints(bundle, shellAccounts)]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5: what the story meeting's stop sends (brief 4.5; lib/meeting.js)
// ═══════════════════════════════════════════════════════════════════════════
describe('4.5: the story meeting\'s payload at arc-selection', () => {
  const { buildCompleteCheckpointData } = require('../../server.js');
  const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const { withFactCheckMark, weaveKey } = require('../../lib/weave');
  const { standingAtMeeting } = require('../../lib/hand-edit-diff');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const ACCUSATION = { verdictKind: 'overdose', accused: [], charge: 'Accidental overdose', votes: [{ option: 'Overdose', count: 6, adopted: true }, { option: 'Murder', count: 2 }] };

  function atMeeting() {
    const left = clone(WEAVE);
    left.threads.push({ id: 't6', name: 'The second ledger', line: 'Riley kept a second ledger.', role: 'left-out', verdict: true });
    left.questions[0].answer = 'Sarah ran the bar.';
    const weave = withFactCheckMark(left, { at: 't', ready: true, fixes: 0 });
    return {
      weave,
      _weaveHandEdits: standingAtMeeting(null, WEAVE, left),
      _arcValidation: {
        weaveKey: weaveKey(weave), passed: false,
        failures: [{ type: 'over-length', message: 'The weave runs long.' }],
        concerns: ['Director\'s edit E1: "The second ledger" carries the room\'s verdict and is left out.']
      },
      sessionConfig: { accusation: ACCUSATION },
      evidenceBundle: { exposed: { tokens: [{ id: 'ale003', rawData: { name: 'The sale', owners: ['Alex'] }, fullContent: 'A line.' }] } },
      directorGateNotes: [{ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Lead with the vote.', at: 't' }],
      arcRevisionCount: 1,
      humanArcRevisionCount: 2,
      evaluationHistory: [{ phase: 'arcs', ready: true, overallScore: 1 }]
    };
  }

  it("sends the meeting's keys and none of the arc selection's", async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, atMeeting());
    expect(Object.keys(data).sort()).toEqual([
      'accusation', 'addedThreads', 'checkFailures', 'concerns', 'directorGateNotes', 'evidenceIndex', 'handEditReport',
      'humanRevisionCount', 'marks', 'maxRevisions', 'questions', 'revisionCount', 'roundDidNotRun', 'weave'
    ]);
    ['narrativeArcs', 'lastEvaluation', 'writerQuestions', 'previousFeedback'].forEach((key) => expect(`${key}: ${key in data}`).toBe(`${key}: false`));
  });

  it('carries the weave, the documents its evidence cites, the verdict as the parse holds it, the questions with the answer, and the counters', async () => {
    const state = atMeeting();
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, state);
    expect(data.weave).toEqual(state.weave);
    expect(data.evidenceIndex).toEqual({ ale003: { name: 'The sale', owner: 'Alex', type: 'memory', firstLine: 'A line.' } });
    expect(data.accusation).toEqual(ACCUSATION);
    expect(data.questions[0]).toMatchObject({ id: 'q1', answer: 'Sarah ran the bar.' });
    expect(data).toMatchObject({ revisionCount: 1, humanRevisionCount: 2, maxRevisions: REVISION_CAPS.ARCS, roundDidNotRun: null, marks: null });
    expect(data.directorGateNotes).toEqual(state.directorGateNotes);
  });

  it('a check still failing on the weave in hand, and the concern beside the line of the edit it is about', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, atMeeting());
    expect(data.checkFailures).toEqual([{ type: 'over-length', message: 'The weave runs long.' }]);
    expect(data.concerns).toEqual([expect.objectContaining({ editIds: ['E1'], places: [{ id: 'E1', path: 'threads[#t6]', where: 'thread "t6", added' }] })]);
  });

  it('a check run on another weave is not shown (ruling 7)', async () => {
    const state = atMeeting();
    state._arcValidation.weaveKey = 'another-weave';
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, state);
    expect(data.checkFailures).toEqual([]);
    expect(data.concerns).toEqual([]);
  });

  it('a round that did not run, with its note', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, { ...atMeeting(), _arcReworkTimeout: { consecutive: 1, attempt: 0, round: 'reweave', note: null, at: 't9' } });
    expect(data.roundDidNotRun).toEqual({ round: 'reweave', at: 't9', note: null });
  });

  it('survives the merge with the interrupt payload', async () => {
    const state = atMeeting();
    const merged = await buildCompleteCheckpointData({ type: CHECKPOINT_TYPES.ARC_SELECTION, weave: state.weave }, state);
    expect(merged.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(merged.questions[0].answer).toBe('Sarah ran the bar.');
    expect(merged.checkFailures).toHaveLength(1);
  });
});

describe('4.5: /api/session/:id/arcs serves the weave', () => {
  const { RESOURCE_ENDPOINTS } = require('../../server.js');
  const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const arcs = RESOURCE_ENDPOINTS.find((endpoint) => endpoint.path === 'arcs');

  it('the weave as the director last left it, available once the thread holds one', () => {
    expect(arcs.fields({ weave: WEAVE, narrativeArcs: [{ id: 'old' }], selectedArcs: ['old'] })).toEqual({ weave: WEAVE });
    expect(arcs.check({ weave: WEAVE })).toBe(true);
    expect(arcs.check({ narrativeArcs: [{ id: 'old' }] })).toBe(false);
    expect(arcs.fields({})).toEqual({ weave: null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6: what the map's stop sends (brief 4.6; lib/map.js mapCheckpointData)
// ═══════════════════════════════════════════════════════════════════════════
describe('4.6: the map\'s payload at the outline stop', () => {
  const { buildCompleteCheckpointData } = require('../../server.js');
  const { MAP, WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const { mapKey } = require('../../lib/map');
  const { mapSlotsOf } = require('../../lib/theme-config');
  const { standingOnMap } = require('../../lib/hand-edit-diff');
  const { mapTallyOf } = require('../../console/checkpoint-view-logic');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const CONCERN = "Director's edit E1: the map prints 2 cards; a map prints 3 to 5.";
  /** Everyone and the counts as the page builds them from the payload (brief 4.6d: the payload sends no count). */
  const countOf = (data) => mapTallyOf(data, data.outline);

  /**
   * The stop after the director struck b4 and sent the map back: the map in hand is theirs,
   * its check still fails, and the concern is about their strike. Jamie is on the roster and
   * in no beat; p3.jpg is kept and placed nowhere; the whiteboard is never a kept photo.
   */
  function atMap() {
    const left = clone(MAP);
    left.leftOut.push(left.sections[1].beats.splice(2, 1)[0]);
    return {
      theme: 'journalist',
      outline: left,
      _mapBaseline: clone(MAP),
      _outlineHandEdits: standingOnMap(null, MAP, left),
      _mapCheck: { mapKey: mapKey(left), passed: false, failures: [{ type: 'card-count', message: 'The map prints 2 cards.' }], concerns: [CONCERN] },
      weave: clone(WEAVE),
      sessionConfig: { roster: ['Alex', 'Morgan', 'Riley', 'Sarah', 'Jamie'] },
      sessionPhotos: ['/s/hero.jpg', '/s/p2.jpg', '/s/p3.jpg', '/s/whiteboard.jpg'],
      whiteboardPhotoPath: '/s/whiteboard.jpg',
      // Task 4.12e: as the rework leaves the stop, the slot cleared and the note filed in the
      // round it was sent in (stopRound), where the payload reads the round's note.
      _outlineFeedback: null,
      _outlineHandEditReport: { checked: ['E1'], changed: [] },
      directorGateNotes: [{ gate: 'outline', kind: 'rejection', round: 1, stopRound: 1, text: 'Strike the paternity card.', at: 't' }],
      outlineRevisionCount: 1,
      humanOutlineRevisionCount: 1,
      evaluationHistory: [{ phase: 'outline', ready: true, overallScore: 1 }]
    };
  }

  it("sends the map's keys, and no evaluation, no questions and no thesis", async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, atMap());
    // Brief 4.6c: the documents by id (evidenceIndex), and the roster and the kept photos
    // the count reads, so the page names each document and rebuilds the count as edited.
    // Brief 4.6d: the count is the page's alone, so the payload sends no tally. Task 4.14b: the
    // photos the map places that the director left out, which the page marks. Task 4.14e: a
    // send-back whose rework did not run (roundDidNotRun). Brief 4.14a: the meeting's changes the
    // weave carries, each by its id and its place.
    expect(Object.keys(data).sort()).toEqual([
      'checkFailures', 'concerns', 'directorGateNotes', 'evidenceIndex', 'handEditReport', 'humanRevisionCount', 'keptPhotos',
      'leftOutPhotos', 'mapSlots', 'maxRevisions', 'meetingChanges', 'outline', 'previousFeedback', 'revisionCount', 'roster',
      'roundDidNotRun', 'settledStory', 'trace'
    ]);
  });

  it("carries the map, the theme's slots, the settled story, the round's note, the notes and the counters", async () => {
    const state = atMap();
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, state);
    expect(data.outline).toEqual(state.outline);
    expect(data.mapSlots).toEqual(mapSlotsOf('journalist'));
    expect(data.mapSlots.map((slot) => slot.key)).toEqual(['lede', 'theStory', 'followTheMoney', 'thePlayers', 'whatsMissing', 'closing']);
    expect(data.settledStory).toEqual({ story: WEAVE.story, question: WEAVE.question });
    expect(data).toMatchObject({
      previousFeedback: 'Strike the paternity card.', revisionCount: 1, humanRevisionCount: 1, maxRevisions: REVISION_CAPS.OUTLINE,
      handEditReport: { checked: ['E1'], changed: [] }, directorGateNotes: state.directorGateNotes, trace: []
    });
  });

  it("carries what Everyone and the counts are built from: each player under the first section whose beats show them", async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, atMap());
    expect(countOf(data)).toEqual({
      everyone: [
        { slot: 'lede', heading: '', players: ['Alex', 'Morgan'] },
        { slot: 'theStory', heading: 'The Story', players: ['Riley'] }
      ],
      unplaced: ['Sarah', 'Jamie'],
      raised: [],
      cards: 2,
      photos: { placed: 2, of: 3 }
    });
  });

  it('counts a player the gap note raises, and the photos the director left out of the article as not kept', async () => {
    const state = atMap();
    state.outline.gapNote = { line: 'The record holds nothing Jamie did.', players: ['Jamie'] };
    state.characterIdMappings = { 'p3.jpg': { exclude: true } };
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, state);
    expect(countOf(data).raised).toEqual(['Jamie']);
    expect(countOf(data).photos).toEqual({ placed: 2, of: 2 });
  });

  it('shows a check still failing on the map in hand, and the concern beside the line of the edit it is about', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, atMap());
    expect(data.checkFailures).toEqual([{ type: 'card-count', message: 'The map prints 2 cards.' }]);
    expect(data.concerns).toEqual([{ text: CONCERN, editIds: ['E1'], places: [expect.objectContaining({ id: 'E1', path: 'leftOut[#b4]' })] }]);
  });

  it('shows no check run on another map: the mark survives the rollback to the map (R9), for the map it checked', async () => {
    const state = atMap();
    state._mapCheck.mapKey = 'another-map';
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, state);
    expect(data.checkFailures).toEqual([]);
    expect(data.concerns).toEqual([]);
  });

  it('survives the merge with the interrupt payload', async () => {
    const state = atMap();
    const merged = await buildCompleteCheckpointData({ type: CHECKPOINT_TYPES.OUTLINE, outline: state.outline }, state);
    expect(merged.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(countOf(merged).unplaced).toEqual(['Sarah', 'Jamie']);
    expect(merged.checkFailures).toHaveLength(1);
  });
});

// 4.7b (the integrator's ruling 6): the settled story replaces the outline's thesis at the
// article stop. It comes from settledStoryOf (lib/map.js), the function the map's stop uses,
// so both stops show the story and the question the director settled at the meeting.
describe('4.7b: the settled story at the article stop', () => {
  const { buildCompleteCheckpointData } = require('../../server.js');
  const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const atArticle = () => ({ evaluationHistory: [], contentBundle: null, weave: JSON.parse(JSON.stringify(WEAVE)) });

  it("sends the story and the question the director settled at the meeting, as the map's stop does, and no outline thesis", async () => {
    const article = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, atArticle());
    const map = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, atArticle());
    expect(article.settledStory).toEqual({ story: WEAVE.story, question: WEAVE.question });
    expect(article.settledStory).toEqual(map.settledStory);
    expect(article).not.toHaveProperty('outlineThesis');
  });

  it('is null on a thread with no weave', async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { evaluationHistory: [], contentBundle: null });
    expect(data.settledStory).toBeNull();
  });

  it('survives the merge with the interrupt payload', async () => {
    const state = atArticle();
    const merged = await buildCompleteCheckpointData({ type: CHECKPOINT_TYPES.ARTICLE, contentBundle: null }, state);
    expect(merged.settledStory).toEqual({ story: WEAVE.story, question: WEAVE.question });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6c: the map's payload names its documents, and carries what its count reads
// ═══════════════════════════════════════════════════════════════════════════
//
// The map's page names each card's and each beat's document through the stop's
// evidenceIndex, as the story meeting names each receipt's, and rebuilds Everyone and the
// counts with mapTally's own inputs: the roster with the canon's full names and the photos
// kept for the article.
describe("4.6c: the map's payload carries the documents by id, the roster and the kept photos", () => {
  const { buildCompleteCheckpointData } = require('../../server.js');
  const { reworkFixtureState } = require('../../lib/__tests__/fixtures/rework-state');

  it("names each exposed document by the server's id rule, the index the story meeting's payload carries", async () => {
    const state = reworkFixtureState('journalist');
    const map = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, state);
    const meeting = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, state);
    expect(map.evidenceIndex).toEqual(meeting.evidenceIndex);
    // The names console/__tests__/checkpoint-view-logic-map.test.js's INDEX gives the page.
    expect(Object.entries(map.evidenceIndex).map(([id, doc]) => [id, doc.name, doc.owner, doc.type])).toEqual([
      ['ale003', 'ALE003 - The sale', 'Alex Reeves', 'memory'],
      ['mor001', 'MOR001 - The envelope', 'Morgan Reed', 'memory'],
      ['p-dna', 'DNA test', 'Sarah Blackwood', 'paper'],
      ['p-rescued', 'Rescued letter', '', 'paper']
    ]);
  });

  it("carries the roster with its full names and the photos kept for the article, the inputs the page's count reads", async () => {
    const state = reworkFixtureState('journalist');
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, state);
    expect(data.roster).toEqual([
      { name: 'Alex', fullName: 'Alex Reeves' }, { name: 'Morgan', fullName: 'Morgan Reed' },
      { name: 'Sarah', fullName: 'Sarah Blackwood' }, { name: 'Riley', fullName: 'Riley Torres' }
    ]);
    expect(data.keptPhotos).toEqual(['hero.jpg', 'p2.jpg']);
  });

  it('survives the merge with the interrupt payload', async () => {
    const state = reworkFixtureState('journalist');
    const merged = await buildCompleteCheckpointData({ type: CHECKPOINT_TYPES.OUTLINE, outline: state.outline }, state);
    expect(Object.keys(merged.evidenceIndex)).toHaveLength(4);
    expect(merged.roster).toHaveLength(4);
    expect(merged.keptPhotos).toEqual(['hero.jpg', 'p2.jpg']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6d: the map's payload carries what the page reads, and no count of its own
// ═══════════════════════════════════════════════════════════════════════════
//
// The page builds Everyone and the counts from the roster and the kept photos the payload
// carries (console/checkpoint-view-logic.js mapTallyOf, task 4.6c), so the payload sends no
// tally (the integrator's ruling 3 on the follow-ups' findings; delete-last).
describe("4.6d: the map's payload carries no tally", () => {
  const { buildCompleteCheckpointData } = require('../../server.js');
  const { reworkFixtureState } = require('../../lib/__tests__/fixtures/rework-state');
  const { mapTallyOf } = require('../../console/checkpoint-view-logic');

  it('sends no tally: the page counts from the roster and the kept photos it carries', async () => {
    const state = reworkFixtureState('journalist');
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, state);
    expect(data).not.toHaveProperty('tally');
    expect(mapTallyOf(data, data.outline)).toMatchObject({ unplaced: [], cards: 3, photos: { placed: 2, of: 2 } });
  });

  it('survives the merge with the interrupt payload with none', async () => {
    const state = reworkFixtureState('journalist');
    const merged = await buildCompleteCheckpointData({ type: CHECKPOINT_TYPES.OUTLINE, outline: state.outline }, state);
    expect(merged).not.toHaveProperty('tally');
    expect(mapTallyOf(merged, merged.outline).unplaced).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10c: the article payload names each card's document
// ═══════════════════════════════════════════════════════════════════════════
//
// The desk names a card's document through the stop's evidenceIndex, as the story meeting names
// a receipt and the map a beat's card (receiptView; brief 4.10b). The article payload carries
// the index the meeting's and the map's payloads carry (buildEvidenceIndex), so a card's mark
// reads its document's name and owner, never "the document it cites" (4.10b's hand-off).
describe("4.10c: the article payload names each card's document", () => {
  const { buildCompleteCheckpointData } = require('../../server.js');
  const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');
  const { factCheckContentBundle } = require('../../lib/content-bundle-fact-check');
  const { deskMarks, deskMarksAt } = require('../../console/checkpoint-view-logic');

  /** A state at the desk: the article's ale003 card holds a sentence its memory does not. */
  const atDesk = () => {
    const state = reworkFixtureState('journalist');
    const bundle = JSON.parse(JSON.stringify(PREVIOUS_BUNDLE));
    bundle.sections[0].content[1].content = 'Marcus said the sale was worth every cent he lost.';
    state.contentBundle = bundle;
    state._articleFactCheck = factCheckContentBundle({ contentBundle: bundle, evidenceBundle: state.evidenceBundle, roster: [], sessionPhotos: [] });
    return state;
  };

  it("sends the index the story meeting's and the map's payloads send", async () => {
    const state = atDesk();
    const article = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, state);
    expect(article.evidenceIndex).toEqual((await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, state)).evidenceIndex);
    expect(article.evidenceIndex).toEqual((await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, state)).evidenceIndex);
    expect(Object.keys(article.evidenceIndex)).toEqual(['ale003', 'mor001', 'p-dna', 'p-rescued']);
  });

  it("a card's mark at the desk names its document by its name and owner", async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, atDesk());
    expect(deskMarksAt(deskMarks(data, data.contentBundle), { kind: 'block', section: 0, block: 1 }).map((m) => m.text))
      .toEqual(["This card's text does not match ALE003 - The sale (Alex Reeves) word for word."]);
  });

  it('survives the merge with the interrupt payload', async () => {
    const state = atDesk();
    const merged = await buildCompleteCheckpointData({ type: CHECKPOINT_TYPES.ARTICLE, contentBundle: state.contentBundle }, state);
    expect(Object.keys(merged.evidenceIndex)).toEqual(['ale003', 'mor001', 'p-dna', 'p-rescued']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.12e: the round line carries the note the director sent the stop back with
// ═══════════════════════════════════════════════════════════════════════════
//
// The map's and the desk's payloads read `previousFeedback` from `_outlineFeedback` and
// `_articleFeedback`, which each reworker clears before the stop opens, so in a real run the
// map's round 2 read "Round 2" alone and the desk printed no note (4.12d's verification). The
// note survives in directorGateNotes: the send-back files it as a rejection note at its stop,
// in the round it was sent in (`stopRound`, server.js appendGateNote).
describe('4.12e: at round 2 or later the map and the desk carry the note they were sent back with', () => {
  const { buildResumePayload } = require('../../server.js');
  const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');
  const { _testing: { incrementOutlineRevision, incrementArticleRevision } } = require('../../lib/workflow/graph');
  const { stopPage } = require('../../lib/stop-pages');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const MAP_NOTE = 'Move the vote earlier.';
  const DESK_NOTE = 'Tighten the closing.';
  /** A rejection note as appendGateNote files it: at its stop, in the round it was sent in. */
  const rejection = (gate, stopRound, text) => ({ gate, kind: 'rejection', round: stopRound, stopRound, text, at: 't' });

  /** The map as reviseOutline leaves it after the director sent round `round - 1` back: the slot cleared, the notes as filed. */
  const mapAt = (round, notes) => ({ ...reworkFixtureState('journalist'), _outlineFeedback: null, humanOutlineRevisionCount: round - 1, directorGateNotes: notes });
  /** The desk as reviseContentBundle leaves it after the director sent round `round - 1` back. */
  const deskAt = (round, notes) => ({
    ...reworkFixtureState('journalist'), contentBundle: clone(PREVIOUS_BUNDLE), _articleFeedback: null, humanArticleRevisionCount: round - 1, directorGateNotes: notes
  });

  it("the map's payload at round 2 carries the note from the director's notes, and the map's page says it on the round line", async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, mapAt(2, [rejection('outline', 1, MAP_NOTE)]));
    expect(data.previousFeedback).toBe(MAP_NOTE);
    const page = stopPage('outline', { type: 'outline', ...data });
    expect(page.lines.filter((line) => line.tone === 'note').map((line) => line.label || line.text))
      .toEqual(expect.arrayContaining(['Round 2', `You sent the map back with: "${MAP_NOTE}"`]));
  });

  it("the desk's payload at round 2 carries the note, and the desk's page says it in the round's record", async () => {
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, deskAt(2, [rejection('article', 1, DESK_NOTE)]));
    expect(data.previousFeedback).toBe(DESK_NOTE);
    const page = stopPage('article', { type: 'article', ...data });
    expect(page.lines.find((line) => line.label === 'You sent it back with')).toMatchObject({ tone: 'note', text: DESK_NOTE, folded: true });
  });

  it('carries the note a send-back filed, once the round\'s rework has cleared its slot', async () => {
    // The map: the server files the note (buildResumePayload), the round opens
    // (incrementOutlineRevision), and the rework clears the slot it consumed.
    const atMap = { ...reworkFixtureState('journalist'), directorGateNotes: [] };
    const mapSent = buildResumePayload({ outline: 'send-back', note: MAP_NOTE }, atMap, 'journalist', CHECKPOINT_TYPES.OUTLINE);
    expect(mapSent.error).toBeNull();
    const mapSentState = { ...atMap, ...mapSent.stateUpdates };
    const { humanOutlineRevisionCount } = await incrementOutlineRevision(mapSentState);
    const mapRound2 = { ...mapSentState, humanOutlineRevisionCount, _outlineFeedback: null };
    expect((await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, mapRound2)).previousFeedback).toBe(MAP_NOTE);

    // The desk, the same way, with the article payload the console sends back.
    const atDesk = { ...reworkFixtureState('journalist'), contentBundle: clone(PREVIOUS_BUNDLE), directorGateNotes: [] };
    const deskSent = buildResumePayload({ article: false, articleFeedback: DESK_NOTE }, atDesk, 'journalist', CHECKPOINT_TYPES.ARTICLE);
    expect(deskSent.error).toBeNull();
    const deskSentState = { ...atDesk, ...deskSent.stateUpdates };
    const { humanArticleRevisionCount } = await incrementArticleRevision(deskSentState);
    const deskRound2 = { ...deskSentState, humanArticleRevisionCount, _articleFeedback: null };
    expect((await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, deskRound2)).previousFeedback).toBe(DESK_NOTE);
  });

  it('carries the note that opened the round the stop is in: at round 3, the second send-back\'s', async () => {
    const mapNotes = [rejection('outline', 1, 'Lead with the bonus.'), rejection('outline', 2, MAP_NOTE)];
    expect((await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, mapAt(3, mapNotes))).previousFeedback).toBe(MAP_NOTE);
    const deskNotes = [rejection('article', 1, 'Cut the bar scene.'), rejection('article', 2, DESK_NOTE)];
    expect((await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, deskAt(3, deskNotes))).previousFeedback).toBe(DESK_NOTE);
  });

  it('carries no note where no send-back opened the round: round 1, an approval note, another stop\'s note', async () => {
    const approval = { ...rejection('outline', 1, 'Keep the bonus beat.'), kind: 'approval' };
    const cases = [
      ['round 1', mapAt(1, []), deskAt(1, [])],
      ['an approval note', mapAt(2, [approval]), deskAt(2, [{ ...approval, gate: 'article' }])],
      ["another stop's note", mapAt(2, [rejection('article', 1, DESK_NOTE)]), deskAt(2, [rejection('outline', 1, MAP_NOTE)])]
    ];
    for (const [name, map, desk] of cases) {
      expect([name, (await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, map)).previousFeedback]).toEqual([name, null]);
      expect([name, (await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, desk)).previousFeedback]).toEqual([name, null]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14e: a send-back whose rework did not run (the final review's ruling 5). The map's and
// the desk's payloads say so, shaped as the story meeting's is ({round, at, note}), from the
// stop's rework record (lib/workflow/state.js roundDidNotRunAt).
// ═══════════════════════════════════════════════════════════════════════════
describe('4.14e: the map and the desk say a send-back did not run', () => {
  const { MAP } = require('../../lib/__tests__/fixtures/rework-state');
  const GAVE_UP = {
    round: 'send-back', note: 'Tighten the money section.', countsBefore: {}, failures: 3,
    at: '2026-10-04T10:00:00.000Z', error: 'SDK timeout after 900s', status: 'did-not-run'
  };
  const SAID = { round: 'send-back', at: '2026-10-04T10:00:00.000Z', note: 'Tighten the money section.' };

  it('the map\'s payload carries the round that did not run, and null when every round ran', async () => {
    const map = { theme: 'journalist', outline: JSON.parse(JSON.stringify(MAP)), evaluationHistory: [] };
    expect((await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { ...map, _outlineRework: GAVE_UP })).roundDidNotRun).toEqual(SAID);
    expect((await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, map)).roundDidNotRun).toBeNull();
    // An automatic pass that gave up runs inside the stop's round: no round of the director's did not run.
    expect((await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, { ...map, _outlineRework: { ...GAVE_UP, round: null, note: null } })).roundDidNotRun).toBeNull();
  });

  it('the desk\'s payload carries the round that did not run, and null when every round ran', async () => {
    const desk = { evaluationHistory: [], contentBundle: null };
    expect((await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { ...desk, _articleRework: GAVE_UP })).roundDidNotRun).toEqual(SAID);
    expect((await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, desk)).roundDidNotRun).toBeNull();
    // Each stop reads its own record.
    expect((await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, { ...desk, _outlineRework: GAVE_UP })).roundDidNotRun).toBeNull();
  });
});
