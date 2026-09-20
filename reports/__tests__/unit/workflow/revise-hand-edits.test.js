/**
 * Revisers see the director's hand edits and report what they did to them; every
 * writer sees the standing notes (spec 2026-09-19 §4.3, §4.4, §5.3).
 *
 * getSdkClient returns config.configurable.sdkClient as-is, so a jest.fn that
 * records its options IS the model here. No paid calls.
 */
const {
  reviseOutline, reviseContentBundle, generateOutline, generateContentBundle,
  createMockPromptBuilder, _testing: { buildOutlineRevisionPrompt, buildArticleRevisionPrompt }
} = require('../../../lib/workflow/nodes/ai-nodes');
const { diffOutline, diffBundle } = require('../../../lib/hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const OUTLINE = { lede: { hook: 'Old hook', keyTension: 'T', primaryArc: 'A' }, closing: { finalQuestion: 'Q' } };
const EDITED = (() => { const o = clone(OUTLINE); o.lede.hook = 'New hook'; return o; })();
const NOTES = [
  { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the vote arc.', at: 't1' },
  { gate: 'outline', kind: 'rejection', round: 1, text: 'Tighten the lede.', at: 't2' }
];

function sdkReturning(value) {
  const sdk = jest.fn(async () => clone(value));
  return sdk;
}
function cfg(sdk, builder = createMockPromptBuilder()) {
  return { configurable: { sdkClient: sdk, promptBuilder: builder, theme: 'journalist' } };
}
const promptOf = (sdk) => sdk.mock.calls[0][0].prompt;

describe('reviseOutline', () => {
  const diff = diffOutline(OUTLINE, EDITED);

  it('puts <HAND_EDITS> in the prompt and does NOT clear the diff', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, _outlineFeedback: 'Tighten the lede.', outlineRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('<HAND_EDITS>');
    expect(promptOf(sdk)).toContain('lede.hook: was "Old hook" -> now "New hook"');
    expect(result).not.toHaveProperty('_outlineHandEdits');
  });

  it('reports kept edits: checked names the scopes, changed is empty', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, outlineRevisionCount: 1 }, cfg(sdk));
    expect(result._outlineHandEditReport).toEqual({ checked: ['lede'], changed: [] });
  });

  it('reports a reverted edit', async () => {
    const sdk = sdkReturning(OUTLINE);           // the model put the old hook back
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, outlineRevisionCount: 1 }, cfg(sdk));
    expect(result._outlineHandEditReport).toEqual({ checked: ['lede'], changed: ['lede'] });
  });

  it('rewrites the report on a second pass (no feedback slot, diff still present)', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: OUTLINE, _outlineHandEdits: diff, _outlineFeedback: null, _outlineHandEditReport: { checked: ['lede'], changed: ['lede'] }, outlineRevisionCount: 2 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('<HAND_EDITS>');
    expect(result._outlineHandEditReport).toEqual({ checked: ['lede'], changed: [] });
  });

  it('report is null and no block is rendered when there are no hand edits', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: OUTLINE, _outlineHandEdits: null, outlineRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).not.toContain('HAND_EDITS');
    expect(result._outlineHandEditReport).toBeNull();
  });

  it('passes the standing notes, excluding the one it is acting on', async () => {
    const sdk = sdkReturning(EDITED);
    await reviseOutline({ _previousOutline: OUTLINE, directorGateNotes: NOTES, _outlineFeedback: 'Tighten the lede.', outlineRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('- [arc-selection, rejection 1] Drop the vote arc.');
    expect(promptOf(sdk)).not.toContain('- [outline, rejection 1] Tighten the lede.');
    expect(promptOf(sdk)).toContain('HUMAN FEEDBACK');
  });

  it('on an evaluator-driven pass (no feedback) every note is passed', async () => {
    const sdk = sdkReturning(EDITED);
    await reviseOutline({ _previousOutline: OUTLINE, directorGateNotes: NOTES, _outlineFeedback: null, outlineRevisionCount: 2 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('- [outline, rejection 1] Tighten the lede.');
  });

  it('still nulls the feedback slot and the previous outline on success', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: OUTLINE, _outlineFeedback: 'x', outlineRevisionCount: 1 }, cfg(sdk));
    expect(result._outlineFeedback).toBeNull();
    expect(result._previousOutline).toBeNull();
  });
});

describe('reviseContentBundle', () => {
  const BUNDLE = { headline: { main: 'Old', kicker: 'K', deck: 'D' }, sections: [{ id: 's1', type: 'narrative', heading: 'H', content: [{ type: 'paragraph', text: 'P' }] }] };
  const EDITED_BUNDLE = (() => { const b = clone(BUNDLE); b.headline.main = 'New'; return b; })();
  const diff = diffBundle(BUNDLE, EDITED_BUNDLE);

  it('renders the block, keeps the diff, reports kept edits', async () => {
    const sdk = sdkReturning(EDITED_BUNDLE);
    const result = await reviseContentBundle({ _previousContentBundle: EDITED_BUNDLE, _articleHandEdits: diff, articleRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('headline.main: was "Old" -> now "New"');
    expect(result).not.toHaveProperty('_articleHandEdits');
    expect(result._articleHandEditReport).toEqual({ checked: ['headline'], changed: [] });
  });

  it('reports a reverted headline', async () => {
    const sdk = sdkReturning(BUNDLE);
    const result = await reviseContentBundle({ _previousContentBundle: EDITED_BUNDLE, _articleHandEdits: diff, articleRevisionCount: 1 }, cfg(sdk));
    expect(result._articleHandEditReport).toEqual({ checked: ['headline'], changed: ['headline'] });
  });

  it('passes the standing notes, excluding the current article feedback', async () => {
    const sdk = sdkReturning(EDITED_BUNDLE);
    const notes = [...NOTES, { gate: 'article', kind: 'rejection', round: 1, text: 'Name the shell.', at: 't3' }];
    await reviseContentBundle({ _previousContentBundle: BUNDLE, directorGateNotes: notes, _articleFeedback: 'Name the shell.', articleRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('- [outline, rejection 1] Tighten the lede.');
    expect(promptOf(sdk)).not.toContain('- [article, rejection 1] Name the shell.');
  });
});

describe('generators pass options.gateNotes', () => {
  it('generateOutline passes every note as options.gateNotes', async () => {
    const builder = createMockPromptBuilder();
    builder.buildOutlinePrompt = jest.fn(builder.buildOutlinePrompt);
    const sdk = sdkReturning(OUTLINE);
    await generateOutline({ selectedArcs: ['a'], narrativeArcs: [], arcEvidencePackages: [], directorGateNotes: NOTES, _outlineGuidance: 'Lead with the money.' }, cfg(sdk, builder));
    const options = builder.buildOutlinePrompt.mock.calls[0][7];
    expect(options).toEqual({ directorGuidance: 'Lead with the money.', gateNotes: NOTES });
  });

  it('generateContentBundle passes every note as options.gateNotes', async () => {
    const builder = createMockPromptBuilder();
    builder.buildArticlePrompt = jest.fn(builder.buildArticlePrompt);
    const sdk = sdkReturning({ headline: { main: 'x' }, sections: [] });
    await generateContentBundle({ outline: OUTLINE, arcEvidencePackages: [], directorGateNotes: NOTES }, cfg(sdk, builder));
    const options = builder.buildArticlePrompt.mock.calls[0][7];
    expect(options).toEqual({ directorGuidance: null, gateNotes: NOTES });
  });

  it('with no notes the generators pass an empty list (prompt unchanged)', async () => {
    const builder = createMockPromptBuilder();
    builder.buildOutlinePrompt = jest.fn(builder.buildOutlinePrompt);
    await generateOutline({ selectedArcs: ['a'], narrativeArcs: [], arcEvidencePackages: [] }, cfg(sdkReturning(OUTLINE), builder));
    expect(builder.buildOutlinePrompt.mock.calls[0][7]).toEqual({ directorGuidance: null, gateNotes: [] });
  });
});

describe('revision prompt builders accept gateNotes', () => {
  const promptBuilder = createMockPromptBuilder();
  it('outline revision renders the notes inside <DIRECTOR_GUIDANCE> after <RULES>', async () => {
    const prompt = await buildOutlineRevisionPrompt({ _outlineGuidance: null }, 'CTX', 'PREV', promptBuilder, NOTES);
    expect(prompt).toContain('- [arc-selection, rejection 1] Drop the vote arc.');
    expect(prompt.indexOf('<DIRECTOR_GUIDANCE>')).toBeGreaterThan(prompt.indexOf('<RULES>'));
  });
  it('article revision likewise, and omits the section with neither guidance nor notes', async () => {
    const withNotes = await buildArticleRevisionPrompt({ _outlineGuidance: null }, 'CTX', 'PREV', promptBuilder, NOTES);
    expect(withNotes).toContain('- [outline, rejection 1] Tighten the lede.');
    const bare = await buildArticleRevisionPrompt({ _outlineGuidance: null }, 'CTX', 'PREV', promptBuilder, []);
    expect(bare).not.toContain('DIRECTOR_GUIDANCE');
  });
});
