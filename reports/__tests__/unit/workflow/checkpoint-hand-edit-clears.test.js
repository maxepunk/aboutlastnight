/**
 * The hand-edit diff and its report must not survive the gate they belong to
 * (spec 2026-09-19 §4.4). The revisers deliberately do not clear them (C3).
 */
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const { _testing: { checkpointOutline, checkpointArticle } } = require('../../../lib/workflow/nodes/checkpoint-nodes');

const DIFF = { kind: 'outline', sections: [{ key: 'lede', changes: [{ path: 'lede.hook', before: 'a', after: 'b' }] }] };
const REPORT = { checked: ['lede'], changed: [] };

test('outline approve returns null for both steering fields', async () => {
  const result = await checkpointOutline({ outline: {}, evaluationHistory: [], _outlineHandEdits: DIFF, _outlineHandEditReport: REPORT }, {});
  expect(result).toMatchObject({ outlineApproved: true, _outlineHandEdits: null, _outlineHandEditReport: null });
});

test('article approve returns null for both steering fields', async () => {
  const result = await checkpointArticle({ contentBundle: {}, evaluationHistory: [], _articleHandEdits: DIFF, _articleHandEditReport: REPORT }, {});
  expect(result).toMatchObject({ articleApproved: true, _articleHandEdits: null, _articleHandEditReport: null });
});

test('a resume that skips (already approved) does not touch them', async () => {
  const o = await checkpointOutline({ outlineApproved: true, _outlineHandEdits: DIFF }, {});
  expect(o).not.toHaveProperty('_outlineHandEdits');
  const a = await checkpointArticle({ articleApproved: true, _articleHandEdits: DIFF }, {});
  expect(a).not.toHaveProperty('_articleHandEdits');
});

// Brief 2.7 (integrator ruling): the trace describes the current round, and approval
// ends it, so each stop's trace follows that side's hand-edit fields: cleared on
// approve, untouched by a skip or a send back (the server resets it on a send back).
describe('the trace is cleared on approve, exactly where the hand-edit fields are (phase 2, brief 2.7)', () => {
  const { checkpointInterrupt } = require('../../mocks/checkpoint-helpers.mock');
  const TRACE = [{ pass: 1, round: 1, trigger: 'evaluation', findings: {}, before: {}, at: 't' }];

  test('outline approve returns null for the outline trace and leaves the article trace alone', async () => {
    const result = await checkpointOutline({ outline: {}, evaluationHistory: [], _outlineTrace: TRACE, _articleTrace: TRACE }, {});
    expect(result).toMatchObject({ outlineApproved: true, _outlineTrace: null });
    expect(result).not.toHaveProperty('_articleTrace');
  });

  test('article approve returns null for the article trace and leaves the outline trace alone', async () => {
    const result = await checkpointArticle({ contentBundle: {}, evaluationHistory: [], _articleTrace: TRACE, _outlineTrace: TRACE }, {});
    expect(result).toMatchObject({ articleApproved: true, _articleTrace: null });
    expect(result).not.toHaveProperty('_outlineTrace');
  });

  // Parity across every branch of both checkpoint nodes: approve, send back, skip.
  const BRANCHES = [
    ['approve', () => checkpointInterrupt.mockReturnValueOnce({ approved: true }), false],
    ['send back', () => checkpointInterrupt.mockReturnValueOnce({ approved: false, feedback: 'Rework it.' }), false],
    ['skip (already approved)', () => {}, true]
  ];

  test.each(BRANCHES)('outline %s: the trace is written exactly when the hand-edit fields are', async (_name, arrange, approved) => {
    arrange();
    const result = await checkpointOutline({ outline: {}, evaluationHistory: [], outlineApproved: approved, _outlineTrace: TRACE, _outlineHandEdits: DIFF }, {});
    expect('_outlineTrace' in result).toBe('_outlineHandEdits' in result);
    if ('_outlineTrace' in result) expect(result._outlineTrace).toBeNull();
  });

  test.each(BRANCHES)('article %s: the trace is written exactly when the hand-edit fields are', async (_name, arrange, approved) => {
    arrange();
    const result = await checkpointArticle({ contentBundle: {}, evaluationHistory: [], articleApproved: approved, _articleTrace: TRACE, _articleHandEdits: DIFF }, {});
    expect('_articleTrace' in result).toBe('_articleHandEdits' in result);
    if ('_articleTrace' in result) expect(result._articleTrace).toBeNull();
  });
});
