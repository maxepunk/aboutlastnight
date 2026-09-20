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
