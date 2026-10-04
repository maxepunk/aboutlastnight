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
const { diffOutline, diffBundle, standingAfterSendBack, SEND_BACK_PASS, CHANGED_EDITS_KEY } = require('../../../lib/hand-edit-diff');

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

  it('puts <HAND_EDITS> in the prompt and does NOT clear the edits', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, _outlineFeedback: 'Tighten the lede.', outlineRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('<HAND_EDITS>');
    expect(promptOf(sdk)).toContain('E1 (lede, hook): "New hook"');
    expect(result).not.toHaveProperty('_outlineHandEdits');
  });

  it('reports kept edits: checked names the ids, changed is empty', async () => {
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, outlineRevisionCount: 1 }, cfg(sdk));
    expect(result._outlineHandEditReport).toEqual({ checked: ['E1'], changed: [] });
  });

  // FA, requirement 8: code puts back an edit an automatic pass changed, and the report records it.
  it('puts back an edit an automatic pass reverted, and reports the pass and the restore', async () => {
    const sdk = sdkReturning(OUTLINE);           // the model put the old hook back
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, outlineRevisionCount: 1 }, cfg(sdk));
    expect(result.outline.lede.hook).toBe('New hook');
    expect(result._outlineHandEditReport).toEqual({
      checked: ['E1'],
      changed: [{
        id: 'E1', scope: 'lede', where: 'lede, hook', cut: false, removed: false, moved: false,
        director: 'New hook', became: 'Old hook', pass: 1, automatic: true, reason: null, restored: true
      }]
    });
  });

  it('a later pass adds to the round\'s report (no feedback slot, edits still present)', async () => {
    const earlier = { checked: ['E1'], changed: [] };
    const sdk = sdkReturning(EDITED);
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: diff, _outlineFeedback: null, _outlineHandEditReport: earlier, outlineRevisionCount: 2 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('<HAND_EDITS>');
    expect(result._outlineHandEditReport).toEqual({ checked: ['E1'], changed: [] });
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

  it('renders the block, keeps the edits, reports kept edits', async () => {
    const sdk = sdkReturning(EDITED_BUNDLE);
    const result = await reviseContentBundle({ _previousContentBundle: EDITED_BUNDLE, _articleHandEdits: diff, articleRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('E1 (headline, main): "New"');
    expect(result).not.toHaveProperty('_articleHandEdits');
    expect(result._articleHandEditReport).toEqual({ checked: ['E1'], changed: [] });
  });

  it('puts back a headline an automatic pass reverted, and reports the restore', async () => {
    const sdk = sdkReturning(BUNDLE);
    const result = await reviseContentBundle({ _previousContentBundle: EDITED_BUNDLE, _articleHandEdits: diff, articleRevisionCount: 1 }, cfg(sdk));
    expect(result.contentBundle.headline.main).toBe('New');
    expect(result._articleHandEditReport.changed).toEqual([{
      id: 'E1', scope: 'headline', where: 'headline, main', cut: false, removed: false, moved: false,
      director: 'New', became: 'Old', pass: 1, automatic: true, reason: null, restored: true
    }]);
  });

  // FA fix round 1, finding 1: an automatic pass that changes a photo the director moved
  // stores it once: kept where the director put it with the pass's caption, or moved back
  // there as the pass left it.
  it('an automatic pass that changes a moved photo\'s caption stores the photo once, in the director\'s section', async () => {
    const PHOTO = { type: 'photo', filename: 'p3.jpg', caption: 'Vic, Remi and Alex' };
    const withPhotoIn = (index, caption = PHOTO.caption) => {
      const b = clone(BUNDLE);
      b.sections.push({ id: 's2', type: 'narrative', heading: 'Closing', content: [{ type: 'paragraph', text: 'Q' }] });
      b.sections[index].content.push({ ...PHOTO, caption });
      return b;
    };
    const standing = standingAfterSendBack(null, withPhotoIn(0), withPhotoIn(1), 'bundle');
    const photos = (bundle) => bundle.sections.map((s) => s.content.filter((x) => x.type === 'photo').map((x) => x.caption));
    for (const returned of [withPhotoIn(1, 'At the bar'), withPhotoIn(0, 'At the bar')]) {
      const result = await reviseContentBundle(
        { _previousContentBundle: withPhotoIn(1), _articleHandEdits: standing, articleRevisionCount: 1 },
        cfg(sdkReturning(returned))
      );
      expect(photos(result.contentBundle)).toEqual([[], ['At the bar']]);
    }
  });

  it('passes the standing notes, excluding the current article feedback', async () => {
    const sdk = sdkReturning(EDITED_BUNDLE);
    const notes = [...NOTES, { gate: 'article', kind: 'rejection', round: 1, text: 'Name the shell.', at: 't3' }];
    await reviseContentBundle({ _previousContentBundle: BUNDLE, directorGateNotes: notes, _articleFeedback: 'Name the shell.', articleRevisionCount: 1 }, cfg(sdk));
    expect(promptOf(sdk)).toContain('- [outline, rejection 1] Tighten the lede.');
    expect(promptOf(sdk)).not.toContain('- [article, rejection 1] Name the shell.');
  });
});

// F1 (spec 2026-10-02 section 7): a send-back's rework may change one of the director's
// edits only where the note's structural change means it no longer fits, and says why.
// The rework call's schema, built in code from the stored one, gains that list; the node
// takes the list out before it stores the output, so nothing after the rework meets it.
describe('the list of changed edits lives only in the rework call (F1)', () => {
  const contentBundleSchema = require('../../../lib/schemas/content-bundle.schema.json');
  const outlineSchema = require('../../../lib/schemas/outline.schema.json');
  const BUNDLE = {
    headline: { main: 'The Room Voted', kicker: 'NovaNews', deck: 'Nine players, one verdict' },
    sections: [
      { id: 'the-story', type: 'narrative', heading: 'The Story', content: [{ type: 'paragraph', text: 'Mel built the first theory around the fight.' }] },
      { id: 'closing', type: 'narrative', heading: 'Closing', content: [{ type: 'paragraph', text: 'Whether the verdict costs Alex anything is still open.' }] }
    ]
  };
  const HEADLINE = 'Alex Reeves Pointed the Room at Jess Kane';
  const DIRECTORS = (() => {
    const b = clone(BUNDLE);
    b.headline.main = HEADLINE;
    b.sections[1].content[0].text = 'Alex wanted Marcus out of the company, and the January demand says so.';
    return b;
  })();
  const standing = () => standingAfterSendBack(null, BUNDLE, DIRECTORS, 'bundle');
  const REASON = 'The note asked the closing to end on the open question, which this line answered.';
  const REWORKED = (() => {
    const b = clone(DIRECTORS);
    b.sections[1].content[0].text = 'Whether the January demand costs Alex anything is still open.';
    b[CHANGED_EDITS_KEY] = [{ id: 'E2', reason: REASON }];
    return b;
  })();
  const sendBack = (overrides = {}) => ({
    _previousContentBundle: DIRECTORS, _articleHandEdits: standing(), _articleFeedback: 'End the closing on the open question.',
    articleRevisionCount: 0, humanArticleRevisionCount: 1, ...overrides
  });
  const schemaOf = (sdk) => sdk.mock.calls[0][0].jsonSchema;

  it('a send-back with edits asks the rework for the changed edits through a schema built from the stored one', async () => {
    const sdk = sdkReturning(REWORKED);
    await reviseContentBundle(sendBack(), cfg(sdk));
    const schema = schemaOf(sdk);
    expect(schema).not.toBe(contentBundleSchema);
    expect(schema.properties[CHANGED_EDITS_KEY]).toEqual(expect.objectContaining({ type: 'array' }));
    expect(schema.properties[CHANGED_EDITS_KEY].items.required).toEqual(['id', 'reason']);
    expect(schema.required).toContain(CHANGED_EDITS_KEY);
    const { [CHANGED_EDITS_KEY]: _list, ...rest } = schema.properties;
    expect(rest).toEqual(contentBundleSchema.properties);
    expect(contentBundleSchema.properties).not.toHaveProperty(CHANGED_EDITS_KEY);   // the stored schema is untouched
  });

  it('an automatic pass, or a send-back with no edit, keeps the stored schema', async () => {
    const auto = sdkReturning(DIRECTORS);
    await reviseContentBundle(sendBack({ _articleFeedback: null, articleRevisionCount: 1 }), cfg(auto));
    expect(schemaOf(auto)).toBe(contentBundleSchema);
    const plain = sdkReturning(DIRECTORS);
    await reviseContentBundle(sendBack({ _articleHandEdits: null }), cfg(plain));
    expect(schemaOf(plain)).toBe(contentBundleSchema);
  });

  it('the stored bundle never carries the list; the report keeps the reason', async () => {
    const sdk = sdkReturning(REWORKED);
    const result = await reviseContentBundle(sendBack(), cfg(sdk));
    expect(result.contentBundle).not.toHaveProperty(CHANGED_EDITS_KEY);
    expect(JSON.stringify(result.contentBundle)).not.toContain(REASON);
    // A send-back's rework is not restored (FA): the note may change an edit, and it says why.
    expect(result.contentBundle.sections[1].content[0].text).toBe('Whether the January demand costs Alex anything is still open.');
    expect(result._articleHandEditReport).toEqual({
      checked: ['E1', 'E2'],
      changed: [{
        id: 'E2', scope: 'section:closing', where: 'section "closing", paragraph', cut: false, removed: false, moved: false,
        director: 'Alex wanted Marcus out of the company, and the January demand says so.',
        became: 'Whether the January demand costs Alex anything is still open.',
        pass: SEND_BACK_PASS, automatic: false, reason: REASON, restored: false
      }]
    });
  });

  it('the outline\'s rework gets the list on a send-back and stores the outline without it', async () => {
    const outlineStanding = standingAfterSendBack(null, OUTLINE, EDITED, 'outline');
    const returned = { ...clone(EDITED), [CHANGED_EDITS_KEY]: [] };
    const sdk = sdkReturning(returned);
    const result = await reviseOutline({ _previousOutline: EDITED, _outlineHandEdits: outlineStanding, _outlineFeedback: 'Tighten the lede.', outlineRevisionCount: 0 }, cfg(sdk));
    expect(schemaOf(sdk).properties).toHaveProperty(CHANGED_EDITS_KEY);
    expect(outlineSchema.properties).not.toHaveProperty(CHANGED_EDITS_KEY);
    expect(result.outline).not.toHaveProperty(CHANGED_EDITS_KEY);
    expect(result._outlineHandEditReport).toEqual({ checked: ['E1'], changed: [] });
  });

  it('the report accumulates over the round: the send-back rework\'s change, then an automatic pass\'s, flagged', async () => {
    const first = await reviseContentBundle(sendBack(), cfg(sdkReturning(REWORKED)));
    const reworked = first.contentBundle;
    // Automatic pass 1 starts from the send-back's output, which carries E1 alone, and
    // changes the director's headline: recorded with the pass, flagged, and no reason.
    const autoOutput = clone(reworked);
    autoOutput.headline.main = 'The Room Named Alex';
    const second = await reviseContentBundle({
      _previousContentBundle: reworked, _articleHandEdits: standing(), _articleFeedback: null,
      _articleHandEditReport: first._articleHandEditReport, articleRevisionCount: 1
    }, cfg(sdkReturning(autoOutput)));
    expect(second._articleHandEditReport).toEqual({
      checked: ['E1', 'E2'],
      changed: [
        first._articleHandEditReport.changed[0],
        {
          id: 'E1', scope: 'headline', where: 'headline, main', cut: false, removed: false, moved: false,
          director: HEADLINE, became: 'The Room Named Alex', pass: 1, automatic: true, reason: null, restored: true
        }
      ]
    });
    expect(second.contentBundle.headline.main).toBe(HEADLINE);
  });
});

describe('generators pass options.gateNotes', () => {
  it('generateOutline passes every note as options.gateNotes', async () => {
    const builder = createMockPromptBuilder();
    builder.buildOutlinePrompt = jest.fn(builder.buildOutlinePrompt);
    const sdk = sdkReturning(OUTLINE);
    const directorNotes = { rawProse: 'Blake worked the room all morning.' };
    const evidenceBundle = { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] } };
    await generateOutline({ selectedArcs: ['a'], narrativeArcs: [], directorGateNotes: NOTES, _outlineGuidance: 'Lead with the money.', directorNotes, evidenceBundle }, cfg(sdk, builder));
    const options = builder.buildOutlinePrompt.mock.calls[0][6];
    // brief 1.5 added directorNotes: the outline writer reads the director's own
    // account of the morning, which until now only the article writer saw;
    // brief 1.3 added shouldConsider: the arc evaluation's advisories;
    // brief 2.1 added evidenceBundle: the record view renders from it;
    // brief 2.2 added the director's input-review corrections and photo descriptions.
    expect(options).toEqual({ directorGuidance: 'Lead with the money.', gateNotes: NOTES, directorNotes, shouldConsider: [], evidenceBundle, directorCorrections: [], photoDescriptions: null });
  });

  it('generateContentBundle passes every note as options.gateNotes', async () => {
    const builder = createMockPromptBuilder();
    builder.buildArticlePrompt = jest.fn(builder.buildArticlePrompt);
    const sdk = sdkReturning({ headline: { main: 'x' }, sections: [] });
    await generateContentBundle({ outline: OUTLINE, directorGateNotes: NOTES }, cfg(sdk, builder));
    const options = builder.buildArticlePrompt.mock.calls[0][6];
    // Phase 3 (3.9) added photos: the hero, then every photo the director kept (none here).
    // Phase 4 (brief 4.6): the outline judge's advisories (shouldConsider) went with it.
    expect(options).toEqual({ directorGuidance: null, gateNotes: NOTES, evidenceBundle: null, directorCorrections: [], photoDescriptions: null, photos: [] });
  });

  it('with no notes the generators pass an empty list (prompt unchanged)', async () => {
    const builder = createMockPromptBuilder();
    builder.buildOutlinePrompt = jest.fn(builder.buildOutlinePrompt);
    await generateOutline({ selectedArcs: ['a'], narrativeArcs: [] }, cfg(sdkReturning(OUTLINE), builder));
    expect(builder.buildOutlinePrompt.mock.calls[0][6]).toEqual({ directorGuidance: null, gateNotes: [], directorNotes: null, shouldConsider: [], evidenceBundle: null, directorCorrections: [], photoDescriptions: null });
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
