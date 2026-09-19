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
