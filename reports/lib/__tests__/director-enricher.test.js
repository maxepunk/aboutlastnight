const { DIRECTOR_NOTES_ENRICHED_SCHEMA, buildEnrichmentPrompt, enrichDirectorNotes, createFallback } = require('../director-enricher');

describe('DIRECTOR_NOTES_ENRICHED_SCHEMA', () => {
  it('carries the four indexes and nothing else at the top level', () => {
    // B3: rawProse is supplied by the caller, not round-tripped through the model.
    expect(Object.keys(DIRECTOR_NOTES_ENRICHED_SCHEMA.properties).sort()).toEqual([
      'characterMentions', 'entityNotes', 'postInvestigationDevelopments',
      'quotes', 'transactionReferences'
    ]);
  });

  it('defines characterMentions as an object of arrays keyed by canonical name', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.characterMentions;
    expect(prop.type).toBe('object');
    expect(prop.additionalProperties.type).toBe('array');
    const item = prop.additionalProperties.items;
    expect(item.properties.excerpt.type).toBe('string');
    expect(item.properties.proseOffset.type).toBe('integer');
    expect(item.properties.timeAnchor.type).toBe('string');
    expect(item.properties.linkedCharacters.type).toBe('array');
    expect(item.properties.kind.type).toBe('string');
  });

  it('defines entityNotes with NPC and shell-account arrays', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.entityNotes;
    expect(prop.properties.npcsReferenced.type).toBe('array');
    expect(prop.properties.shellAccountsReferenced.type).toBe('array');
    expect(prop.properties.shellAccountsReferenced.items.properties.account.type).toBe('string');
    expect(prop.properties.shellAccountsReferenced.items.properties.directorSuspicion.type).toBe('string');
  });

  it('defines transactionReferences with linked-transaction detail', () => {
    const item = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.transactionReferences.items;
    expect(item.properties.excerpt.type).toBe('string');
    expect(item.properties.linkedTransactions.type).toBe('array');
    const tx = item.properties.linkedTransactions.items;
    expect(tx.properties.timestamp.type).toBe('string');
    expect(tx.properties.tokenId.type).toBe('string');
    expect(tx.properties.tokenOwner.type).toBe('string');
    expect(tx.properties.sellingTeam.type).toBe('string');
    expect(tx.properties.amount.type).toBe('string');
    expect(item.properties.confidence.enum).toEqual(['high', 'medium', 'low']);
    expect(item.properties.linkReasoning.type).toBe('string');
  });

  it('defines quotes with speaker, text, addressee, context, confidence', () => {
    const item = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.quotes.items;
    expect(item.properties.speaker.type).toBe('string');
    expect(item.properties.text.type).toBe('string');
    expect(item.properties.addressee.type).toBe('string');
    expect(item.properties.context.type).toBe('string');
    // B3: aligned with transactionReferences; 'medium' used to fail validation.
    expect(item.properties.confidence.enum).toEqual(['high', 'medium', 'low']);
    expect(item.required).toEqual(expect.arrayContaining(['speaker', 'text']));
  });

  it('defines postInvestigationDevelopments with headline, detail, subjects', () => {
    const item = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.postInvestigationDevelopments.items;
    expect(item.properties.headline.type).toBe('string');
    expect(item.properties.detail.type).toBe('string');
    expect(item.properties.subjects.type).toBe('array');
    expect(item.properties.bearingOnNarrative.type).toBe('string');
  });

  it('does NOT include the legacy observations.{behaviorPatterns,...} field', () => {
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.observations).toBeUndefined();
  });
});

describe('buildEnrichmentPrompt', () => {
  const sampleContext = {
    rawProse: 'Vic was working the room. Remi said "do you want to trade a little" to Mel.',
    roster: ['Vic', 'Remi', 'Mel'],
    accusation: { accused: ['Morgan'], charge: 'Murder of Marcus' },
    npcs: ['Blake', 'Marcus', 'Nova'],
    shellAccounts: [{ name: 'Marcus friend', total: 930000, tokenCount: 3 }],
    detectiveEvidenceLog: [{ token: 'tay004', owner: 'Taylor Chase', time: '09:40 PM', evidence: '...' }],
    scoringTimeline: [{ time: '09:40 PM', type: 'Sale', detail: 'tay004/Taylor Chase', team: 'Cass', amount: '+$450,000' }]
  };

  it('returns systemPrompt and userPrompt strings', () => {
    const out = buildEnrichmentPrompt(sampleContext);
    expect(typeof out.systemPrompt).toBe('string');
    expect(typeof out.userPrompt).toBe('string');
    expect(out.systemPrompt.length).toBeGreaterThan(0);
    expect(out.userPrompt.length).toBeGreaterThan(0);
  });

  it('system prompt forbids summarization and requires verbatim excerpts', () => {
    const { systemPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(systemPrompt).toMatch(/not.*summariz/i);
    // B3: the echo-the-prose rule is gone; what remains is the grounding rule.
    expect(systemPrompt).toMatch(/verbatim substring of the prose/i);
  });

  it('user prompt contains all context sections as XML tags', () => {
    const { userPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(userPrompt).toContain('<ROSTER>');
    expect(userPrompt).toContain('<ACCUSATION>');
    expect(userPrompt).toContain('<NPCS>');
    expect(userPrompt).toContain('<SHELL_ACCOUNTS>');
    expect(userPrompt).toContain('<DETECTIVE_EVIDENCE_LOG>');
    expect(userPrompt).toContain('<SCORING_TIMELINE>');
    expect(userPrompt).toContain('<DIRECTOR_NOTES_RAW>');
    expect(userPrompt).toContain('<ENRICHMENT_RULES>');
  });

  it('user prompt includes the raw director prose unmodified', () => {
    const { userPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(userPrompt).toContain(sampleContext.rawProse);
  });

  it('rules appear LAST in user prompt for recency bias', () => {
    const { userPrompt } = buildEnrichmentPrompt(sampleContext);
    const rulesIdx = userPrompt.lastIndexOf('<ENRICHMENT_RULES>');
    const notesIdx = userPrompt.lastIndexOf('<DIRECTOR_NOTES_RAW>');
    expect(rulesIdx).toBeGreaterThan(notesIdx);
  });

  it('lists roster members inside <ROSTER>', () => {
    const { userPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(userPrompt).toMatch(/<ROSTER>[\s\S]*Vic[\s\S]*Remi[\s\S]*Mel[\s\S]*<\/ROSTER>/);
  });

  it('handles empty optional context gracefully', () => {
    const minimal = {
      rawProse: 'Short note.',
      roster: [],
      accusation: null,
      npcs: [],
      shellAccounts: [],
      detectiveEvidenceLog: [],
      scoringTimeline: []
    };
    const { userPrompt } = buildEnrichmentPrompt(minimal);
    expect(userPrompt).toContain('Short note.');
    expect(userPrompt).toContain('<ROSTER>');
  });
});

describe('createFallback', () => {
  it('preserves rawProse and returns empty indexes', () => {
    const fallback = createFallback('some prose');
    expect(fallback.rawProse).toBe('some prose');
    expect(fallback.characterMentions).toEqual({});
    expect(fallback.entityNotes).toEqual({ npcsReferenced: [], shellAccountsReferenced: [] });
    expect(fallback.quotes).toEqual([]);
    expect(fallback.transactionReferences).toEqual([]);
    expect(fallback.postInvestigationDevelopments).toEqual([]);
  });
});

describe('enrichDirectorNotes', () => {
  const baseContext = {
    rawProse: 'Vic was working the room. "do you want to trade a little" Remi said to Mel.',
    roster: ['Vic', 'Remi', 'Mel'],
    accusation: { accused: ['Morgan'], charge: 'Murder' },
    npcs: ['Blake'],
    shellAccounts: [],
    detectiveEvidenceLog: [],
    scoringTimeline: []
  };

  it('runs the enrichment at effort medium, not the global xhigh', async () => {
    // 2026-09-19 operator gate: at xhigh on Opus 4.8 this call ended its first turn
    // after thinking alone (25K chars of summary, no output) at ~320s, the SDK's
    // structured-output enforcement re-requested, and the cycle repeated for 20
    // minutes. medium completed in 165s and high in 375s, both with a full result.
    const sdk = jest.fn().mockResolvedValue({ characterMentions: {}, quotes: [], transactionReferences: [], whiteboard: null, playerFocus: null, entityNotes: {}, postInvestigationDevelopments: [] });
    await enrichDirectorNotes(baseContext, sdk);
    expect(sdk.mock.calls[0][0].effort).toBe('medium');
  });

  it('invokes sdk with opus model, schema, and disableTools', async () => {
    const sdk = jest.fn().mockResolvedValue({
      rawProse: baseContext.rawProse,
      characterMentions: {},
      entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });

    await enrichDirectorNotes(baseContext, sdk);

    expect(sdk).toHaveBeenCalledTimes(1);
    const call = sdk.mock.calls[0][0];
    expect(call.model).toBe('opus');
    expect(call.disableTools).toBe(true);
    expect(call.jsonSchema).toBe(DIRECTOR_NOTES_ENRICHED_SCHEMA);
    // No per-call timeout — the call inherits the standardized model default
    // from lib/llm/client.js MODEL_TIMEOUTS (currently 10 min uniformly).
    expect(call.timeoutMs).toBeUndefined();
    expect(call.label).toBe('Director notes enrichment');
  });

  it('returns the SDK result on success', async () => {
    const expected = {
      rawProse: baseContext.rawProse,
      characterMentions: { Vic: [{ excerpt: 'Vic was working the room.' }] },
      entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [{ speaker: 'Remi', text: 'do you want to trade a little', confidence: 'high' }],
      transactionReferences: [],
      postInvestigationDevelopments: []
    };
    const sdk = jest.fn().mockResolvedValue(expected);

    const result = await enrichDirectorNotes(baseContext, sdk);
    expect(result).toEqual(expected);
  });

  it('returns fallback when SDK throws', async () => {
    const sdk = jest.fn().mockRejectedValue(new Error('timeout'));
    const result = await enrichDirectorNotes(baseContext, sdk);
    expect(result.rawProse).toBe(baseContext.rawProse);
    expect(result.characterMentions).toEqual({});
    expect(result.quotes).toEqual([]);
    expect(result.transactionReferences).toEqual([]);
  });

  it('returns fallback when SDK returns result missing required rawProse', async () => {
    const sdk = jest.fn().mockResolvedValue({ characterMentions: {} });
    const result = await enrichDirectorNotes(baseContext, sdk);
    expect(result.rawProse).toBe(baseContext.rawProse);
  });

  it('returns fallback with empty prose when input rawProse is missing', async () => {
    const sdk = jest.fn();
    const result = await enrichDirectorNotes({ ...baseContext, rawProse: '' }, sdk);
    expect(result.rawProse).toBe('');
    expect(sdk).not.toHaveBeenCalled();
  });
});

describe('buildEnrichmentPrompt — destructure defaults and accusation branches', () => {
  it('applies defaults when optional fields are omitted entirely', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p' });
    expect(userPrompt).toContain('<ROSTER>\n(none provided)\n</ROSTER>');
    expect(userPrompt).toContain('<ACCUSATION>\n(none provided)\n</ACCUSATION>');
    expect(userPrompt).toContain('<NPCS>\n(none)\n</NPCS>');
    expect(userPrompt).toContain('<SHELL_ACCOUNTS>\n(none)\n</SHELL_ACCOUNTS>');
  });

  it('uses "unspecified" fallbacks when accusation has missing sub-fields', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', accusation: {} });
    expect(userPrompt).toContain('Accused: unspecified');
    expect(userPrompt).toContain('Charge: unspecified');
  });
});

describe('enrichDirectorNotes — normalizes missing optional fields on success', () => {
  it('substitutes defaults for any omitted fields in the SDK result', async () => {
    const sdk = jest.fn().mockResolvedValue({ rawProse: 'p' });
    const result = await enrichDirectorNotes({ rawProse: 'p', roster: ['A'] }, sdk);
    expect(result.rawProse).toBe('p');
    expect(result.characterMentions).toEqual({});
    expect(result.entityNotes).toEqual({ npcsReferenced: [], shellAccountsReferenced: [] });
    expect(result.quotes).toEqual([]);
    expect(result.transactionReferences).toEqual([]);
    expect(result.postInvestigationDevelopments).toEqual([]);
  });
});

describe('buildEnrichmentPrompt — defensive input guards', () => {
  it('accepts accusation.accused as a string and coerces to array', () => {
    const { userPrompt } = buildEnrichmentPrompt({
      rawProse: 'p',
      accusation: { accused: 'Morgan', charge: 'Murder' }
    });
    expect(userPrompt).toContain('Accused: Morgan');
  });

  it('accepts roster as non-array by coercing to empty', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', roster: null });
    expect(userPrompt).toContain('<ROSTER>\n(none provided)\n</ROSTER>');
  });

  it('accepts npcs as non-array by coercing to empty', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', npcs: null });
    expect(userPrompt).toContain('<NPCS>\n(none)\n</NPCS>');
  });
});

describe('enrichDirectorNotes — verbatim check', () => {
  it('falls back when SDK returns a non-verbatim rawProse', async () => {
    const input = 'Vic worked the room.';
    const sdk = jest.fn().mockResolvedValue({
      rawProse: 'Vic worked the room (summarized).',
      characterMentions: {}, entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [], transactionReferences: [], postInvestigationDevelopments: []
    });

    const result = await enrichDirectorNotes({ rawProse: input, roster: [] }, sdk);
    expect(result.rawProse).toBe(input);
    expect(result.characterMentions).toEqual({});
  });

  it('accepts SDK result when rawProse matches exactly', async () => {
    const input = 'Vic worked the room.';
    const sdk = jest.fn().mockResolvedValue({
      rawProse: input,
      characterMentions: { Vic: [{ excerpt: 'Vic worked the room.' }] },
      entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [], transactionReferences: [], postInvestigationDevelopments: []
    });

    const result = await enrichDirectorNotes({ rawProse: input, roster: [] }, sdk);
    expect(result.rawProse).toBe(input);
    expect(result.characterMentions).toEqual({ Vic: [{ excerpt: 'Vic worked the room.' }] });
  });
});

describe('DIRECTOR_NOTES_ENRICHED_SCHEMA — tightened constraints', () => {
  it('declares additionalProperties: false at the top level', () => {
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.additionalProperties).toBe(false);
  });

  it('declares proseOffset as integer with minimum 0 on characterMentions items', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.characterMentions.additionalProperties.items.properties.proseOffset;
    expect(prop.type).toBe('integer');
    expect(prop.minimum).toBe(0);
  });

  it('declares proseOffset as integer with minimum 0 on transactionReferences items', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.transactionReferences.items.properties.proseOffset;
    expect(prop.type).toBe('integer');
    expect(prop.minimum).toBe(0);
  });

  it('declares proseOffset as integer with minimum 0 on quotes items', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.quotes.items.properties.proseOffset;
    expect(prop.type).toBe('integer');
    expect(prop.minimum).toBe(0);
  });

  it('declares proseOffset as integer with minimum 0 on postInvestigationDevelopments items', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.postInvestigationDevelopments.items.properties.proseOffset;
    expect(prop.type).toBe('integer');
    expect(prop.minimum).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B3: the enricher discarded the whole Opus payload whenever the echoed rawProse
// differed by one byte. data/062726/ and data/071826/inputs/director-notes.json
// both carry the fallback signature (all four indexes empty) over 3.8K-5.0K
// characters of prose with 9-12 quoted utterances, so article generation ran with
// no quote bank and no transaction links and invented speakers and attribution.
// The server holds the prose; the model has no reason to echo it.
// ═══════════════════════════════════════════════════════════════════════════════
describe('DIRECTOR_NOTES_ENRICHED_SCHEMA — prose is not round-tripped (B3)', () => {
  it('does not ask the model for rawProse at all', () => {
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.rawProse).toBeUndefined();
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.required || []).not.toContain('rawProse');
  });

  it('accepts confidence "medium" on a quote (enums aligned across the schema)', () => {
    const Ajv = require('ajv');
    const validate = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true })
      .compile(DIRECTOR_NOTES_ENRICHED_SCHEMA);

    const ok = validate({
      characterMentions: {},
      entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [{ speaker: 'Remi', text: 'do you want to trade', confidence: 'medium' }],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });

    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);
  });

  it('uses the same confidence enum on quotes and transactionReferences', () => {
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.quotes.items.properties.confidence.enum)
      .toEqual(['high', 'medium', 'low']);
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.transactionReferences.items.properties.confidence.enum)
      .toEqual(['high', 'medium', 'low']);
  });
});

describe('ENRICHMENT prompts — no verbatim-echo rule (B3)', () => {
  it('drops the rule that told the model to echo rawProse', () => {
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt({ rawProse: 'p' });
    expect(systemPrompt).not.toMatch(/rawProse/);
    expect(userPrompt).not.toMatch(/rawProse/);
  });

  it('keeps a positive verbatim requirement on excerpts and quotes', () => {
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt({ rawProse: 'p' });
    expect(systemPrompt).toMatch(/verbatim substring of the prose/i);
    expect(userPrompt).toMatch(/verbatim substring of the prose/i);
  });
});

describe('enrichDirectorNotes — keeps the payload the model produced (B3)', () => {
  const prose = 'Vic was working the room. "do you want to trade a little" Remi said to Mel.';
  const context = { rawProse: prose, roster: ['Vic', 'Remi', 'Mel'] };

  const modelPayload = () => ({
    characterMentions: { Vic: [{ excerpt: 'Vic was working the room.' }] },
    entityNotes: { npcsReferenced: ['Blake'], shellAccountsReferenced: [] },
    quotes: [{ speaker: 'Remi', text: 'do you want to trade a little', confidence: 'high' }],
    transactionReferences: [{ excerpt: 'Vic was working the room.', linkedTransactions: [], confidence: 'low' }],
    postInvestigationDevelopments: []
  });

  it('keeps the indexes and supplies the prose from the input, not the model', async () => {
    const sdk = jest.fn().mockResolvedValue(modelPayload());

    const result = await enrichDirectorNotes(context, sdk);

    expect(result.rawProse).toBe(prose);
    expect(result.characterMentions).toEqual({ Vic: [{ excerpt: 'Vic was working the room.' }] });
    expect(result.quotes).toHaveLength(1);
    expect(result.transactionReferences).toHaveLength(1);
    expect(result._enrichmentFallback).toBeUndefined();
    expect(result._enrichmentWarnings).toBeUndefined();
  });

  it('keeps the indexes even when the model echoes a prose that differs by one character', async () => {
    // The exact condition that silently emptied 062726 and 071826.
    const sdk = jest.fn().mockResolvedValue({ ...modelPayload(), rawProse: prose + ' ' });

    const result = await enrichDirectorNotes(context, sdk);

    expect(result.rawProse).toBe(prose);
    expect(result.quotes).toHaveLength(1);
    expect(result.characterMentions.Vic).toBeDefined();
    expect(result._enrichmentFallback).toBeUndefined();
  });
});

describe('enrichDirectorNotes — quote grounding (B3)', () => {
  const prose = 'Vic was working the room. "do you want to trade a little" Remi said to Mel.';

  it('drops a quote that is not in the prose and counts it, keeping the grounded one', async () => {
    const sdk = jest.fn().mockResolvedValue({
      quotes: [
        { speaker: 'Remi', text: 'do you want to trade a little', confidence: 'high' },
        { speaker: 'Mel', text: 'I never touched the account', confidence: 'low' }  // invented
      ]
    });

    const result = await enrichDirectorNotes({ rawProse: prose, roster: ['Vic'] }, sdk);

    expect(result.quotes).toEqual([
      { speaker: 'Remi', text: 'do you want to trade a little', confidence: 'high' }
    ]);
    expect(result._enrichmentWarnings).toEqual({ droppedQuotes: 1 });
  });

  it('keeps a quote whose curly quotes and whitespace differ from the prose', async () => {
    const curlyProse = 'Remi said “do you  want to trade” to Mel.';
    const sdk = jest.fn().mockResolvedValue({
      quotes: [{ speaker: 'Remi', text: "do you want to trade", confidence: 'high' }]
    });

    const result = await enrichDirectorNotes({ rawProse: curlyProse, roster: ['Remi'] }, sdk);

    expect(result.quotes).toHaveLength(1);
    expect(result._enrichmentWarnings).toBeUndefined();
  });

  it('drops a quote with empty text', async () => {
    const sdk = jest.fn().mockResolvedValue({
      quotes: [{ speaker: 'Remi', text: '   ' }]
    });

    const result = await enrichDirectorNotes({ rawProse: prose, roster: ['Remi'] }, sdk);

    expect(result.quotes).toEqual([]);
    expect(result._enrichmentWarnings).toEqual({ droppedQuotes: 1 });
  });
});

describe('enrichDirectorNotes — the fallback is visible (B3)', () => {
  const prose = 'Vic was working the room.';

  it('marks a thrown SDK failure with _enrichmentFallback.reason', async () => {
    const sdk = jest.fn().mockRejectedValue(new Error('SDK timeout after 900000ms idle'));

    const result = await enrichDirectorNotes({ rawProse: prose }, sdk);

    expect(result).toEqual({
      ...createFallback(prose),
      _enrichmentFallback: { reason: 'SDK timeout after 900000ms idle' }
    });
  });

  it('marks a non-object SDK result with _enrichmentFallback.reason', async () => {
    const sdk = jest.fn().mockResolvedValue(null);

    const result = await enrichDirectorNotes({ rawProse: prose }, sdk);

    expect(result.rawProse).toBe(prose);
    expect(result._enrichmentFallback.reason).toMatch(/no object/i);
  });
});

describe('enrichDirectorNotes — an all-empty reply is a fallback, not a result (Task 1 Minor)', () => {
  const { enrichDirectorNotes } = require('../director-enricher');
  const LONG_PROSE = 'They circled each other all morning. '.repeat(15); // > 400 chars
  const EMPTY_REPLY = { characterMentions: {}, quotes: [], transactionReferences: [] };

  it('marks an all-empty reply over substantial prose', async () => {
    expect(LONG_PROSE.length).toBeGreaterThan(400);
    const sdk = jest.fn().mockResolvedValue(EMPTY_REPLY);

    const result = await enrichDirectorNotes({ rawProse: LONG_PROSE }, sdk);

    // Schema-valid, so it used to look identical to notes with nothing in them.
    // The input-review banner (Task 4.5) needs to be able to tell the difference.
    expect(result._enrichmentFallback).toEqual({ reason: 'model returned no indexes' });
    expect(result.rawProse).toBe(LONG_PROSE);
  });

  it('does NOT mark short prose, where empty indexes are plausible', async () => {
    const sdk = jest.fn().mockResolvedValue(EMPTY_REPLY);
    const result = await enrichDirectorNotes({ rawProse: 'Quiet session.' }, sdk);
    expect(result._enrichmentFallback).toBeUndefined();
  });

  it('does NOT mark a reply that indexed anything at all', async () => {
    const cases = [
      { ...EMPTY_REPLY, characterMentions: { Vic: [{ excerpt: 'They circled each other all morning.' }] } },
      { ...EMPTY_REPLY, quotes: [{ speaker: 'Vic', text: 'They circled each other all morning.' }] },
      { ...EMPTY_REPLY, transactionReferences: [{ excerpt: 'x', linkedTransactions: [], confidence: 'low' }] }
    ];
    for (const reply of cases) {
      const result = await enrichDirectorNotes({ rawProse: LONG_PROSE }, jest.fn().mockResolvedValue(reply));
      expect(result._enrichmentFallback).toBeUndefined();
    }
  });
});

describe('normalizeForGrounding folds dashes (the JSDoc already claimed it)', () => {
  const { enrichDirectorNotes } = require('../director-enricher');

  it('keeps a quote the model retyped with an em-dash where the prose has a hyphen', async () => {
    const prose = 'Vic said the deal was already done - signed, filed, forgotten.';
    const sdk = jest.fn().mockResolvedValue({
      characterMentions: {}, transactionReferences: [],
      quotes: [{ speaker: 'Vic', text: 'the deal was already done — signed, filed, forgotten.' }]
    });

    const result = await enrichDirectorNotes({ rawProse: prose }, sdk);

    expect(result.quotes).toHaveLength(1);
    expect(result._enrichmentWarnings).toBeUndefined();
  });
});

describe('ENRICHMENT prompts define the medium confidence band (Task 1 Minor)', () => {
  const { buildEnrichmentPrompt } = require('../director-enricher');

  it('the system rule and the user rules both say what medium means', () => {
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt({ rawProse: 'x' });
    [systemPrompt, userPrompt].forEach((text) => {
      // "high iff speaker named adjacent; otherwise low" left medium undefined,
      // so the enum's middle value was unreachable by instruction.
      expect(text).toMatch(/"medium"/);
      expect(text).toMatch(/same sentence/i);
      expect(text).toMatch(/surrounding paragraph/i);
    });
  });
});
