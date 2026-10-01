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
    // Final fix wave: a link names its timeline row by key, and nothing else. The
    // model never sees a memory id, so the schema has no field to echo one into.
    const tx = item.properties.linkedTransactions.items;
    expect(Object.keys(tx.properties)).toEqual(['key']);
    expect(tx.required).toEqual(['key']);
    expect(tx.additionalProperties).toBe(false);
    expect(item.properties.confidence.enum).toEqual(['high', 'medium', 'low']);
    expect(item.properties.linkReasoning.type).toBe('string');
  });

  it('defines quotes with speaker, text, addressee, context, correction, confidence', () => {
    const item = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.quotes.items;
    expect(item.properties.speaker.type).toBe('string');
    expect(item.properties.text.type).toBe('string');
    expect(item.properties.addressee.type).toBe('string');
    expect(item.properties.context.type).toBe('string');
    expect(item.properties.correction.type).toBe('string');
    // B3: aligned with transactionReferences; 'medium' used to fail validation.
    expect(item.properties.confidence.enum).toEqual(['high', 'medium', 'low']);
    // Phase 3 (3.6): a speaker may be unknown, so only the words and the director's
    // words around them are required.
    expect(item.required).toEqual(['text', 'context']);
  });

  it('defines an epilogue item as the director\'s sentence and an index of subjects, with no headline or reading of its own (phase 3, 3.6)', () => {
    const item = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.postInvestigationDevelopments.items;
    expect(Object.keys(item.properties).sort()).toEqual(['detail', 'proseOffset', 'subjects']);
    expect(item.required).toEqual(['detail']);
    expect(item.properties.subjects.type).toBe('array');
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

  it('system prompt forbids summarization and points to the rules, where the verbatim rule is', () => {
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(systemPrompt).toMatch(/not.*summariz/i);
    // B3: the echo-the-prose rule is gone; what remains is the grounding rule. Since
    // the 3.6 fix batch (item 5) each rule is stated once, in <ENRICHMENT_RULES>.
    expect(systemPrompt).toContain('<ENRICHMENT_RULES>');
    expect(userPrompt).toMatch(/verbatim substring of the prose/i);
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
    // Phase 3 (3.6): the quote carries the director's words around it, which name its speaker.
    const expected = {
      rawProse: baseContext.rawProse,
      characterMentions: { Vic: [{ excerpt: 'Vic was working the room.' }] },
      entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [{ speaker: 'Remi', text: 'do you want to trade a little', context: '"do you want to trade a little" Remi said to Mel.', confidence: 'high' }],
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
      // Phase 3 (3.6): a quote carries the director's words around it.
      quotes: [{ speaker: 'Remi', text: 'do you want to trade', context: 'Later, Remi said "do you want to trade".', confidence: 'medium' }],
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

  it('keeps a positive verbatim requirement on excerpts and quotes, stated once (3.6 fix batch, item 5)', () => {
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt({ rawProse: 'p' });
    expect(userPrompt).toMatch(/verbatim substring of the prose/i);
    expect(systemPrompt).not.toMatch(/verbatim substring of the prose/i);
  });
});

describe('enrichDirectorNotes — keeps the payload the model produced (B3)', () => {
  const prose = 'Vic was working the room. "do you want to trade a little" Remi said to Mel.';
  const context = { rawProse: prose, roster: ['Vic', 'Remi', 'Mel'] };

  const modelPayload = () => ({
    characterMentions: { Vic: [{ excerpt: 'Vic was working the room.' }] },
    entityNotes: { npcsReferenced: ['Blake'], shellAccountsReferenced: [] },
    // Phase 3 (3.6): the context names the speaker, so the speaker is kept.
    quotes: [{ speaker: 'Remi', text: 'do you want to trade a little', context: '"do you want to trade a little" Remi said to Mel.', confidence: 'high' }],
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
    const context = '"do you want to trade a little" Remi said to Mel.';
    const sdk = jest.fn().mockResolvedValue({
      quotes: [
        { speaker: 'Remi', text: 'do you want to trade a little', context, confidence: 'high' },
        { speaker: 'Mel', text: 'I never touched the account', context, confidence: 'low' }  // invented
      ]
    });

    const result = await enrichDirectorNotes({ rawProse: prose, roster: ['Vic'] }, sdk);

    expect(result.quotes).toEqual([
      { speaker: 'Remi', text: 'do you want to trade a little', context, confidence: 'high' }
    ]);
    expect(result._enrichmentWarnings).toEqual({ droppedQuotes: 1 });
  });

  it('keeps a quote whose curly quotes and whitespace differ from the prose', async () => {
    const curlyProse = 'Remi said “do you  want to trade” to Mel.';
    const sdk = jest.fn().mockResolvedValue({
      // Phase 3 (3.6): the context is grounded the same way, curly quotes and all.
      quotes: [{ speaker: 'Remi', text: "do you want to trade", context: 'Remi said "do you want to trade" to Mel.', confidence: 'high' }]
    });

    const result = await enrichDirectorNotes({ rawProse: curlyProse, roster: ['Remi'] }, sdk);

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].speaker).toBe('Remi');
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
      // Phase 3 (3.6): with the director's words around it, which name the speaker.
      quotes: [{ speaker: 'Vic', text: 'the deal was already done — signed, filed, forgotten.', context: prose }]
    });

    const result = await enrichDirectorNotes({ rawProse: prose }, sdk);

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].speaker).toBe('Vic');
    expect(result._enrichmentWarnings).toBeUndefined();
  });
});

describe('ENRICHMENT prompts define the medium confidence band (Task 1 Minor)', () => {
  const { buildEnrichmentPrompt } = require('../director-enricher');

  it('the rules say what medium means (stated once, in the user rules, since the 3.6 fix batch)', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'x' });
    // "high iff speaker named adjacent; otherwise low" left medium undefined,
    // so the enum's middle value was unreachable by instruction.
    expect(userPrompt).toMatch(/"medium"/);
    expect(userPrompt).toMatch(/same sentence/i);
    expect(userPrompt).toMatch(/surrounding paragraph/i);
  });

  it('the schema states the bands in the rules\' own words (M5: "adjacent" against "same sentence")', () => {
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt({ rawProse: 'x' });
    const bands = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.quotes.items.properties.confidence.description;
    expect(bands).toMatch(/same sentence/);
    expect(bands).not.toMatch(/adjacent/);
    expect(userPrompt).toContain(bands);
    expect(systemPrompt).not.toContain(bands);
  });
});

describe('the accusation block (phase 2, brief 2.2)', () => {
  it('stops dropping the parse\'s notes on the accusation', () => {
    const { userPrompt } = buildEnrichmentPrompt({
      rawProse: 'p',
      accusation: { verdictKind: 'culprit', accused: ['Vic'], charge: 'Murder', notes: 'Nine votes; Alex held out.' }
    });
    expect(userPrompt).toContain('<ACCUSATION>\nAccused: Vic\nCharge: Murder\nNotes: Nine votes; Alex held out.\n</ACCUSATION>');
  });

  it('says a verdict with no culprit names no one, never "unspecified" and never the victim', () => {
    const { userPrompt } = buildEnrichmentPrompt({
      rawProse: 'p',
      accusation: { verdictKind: 'overdose', accused: [], charge: 'Accidental overdose', notes: 'deadlocked 4 to 4' }
    });
    const block = userPrompt.slice(userPrompt.indexOf('<ACCUSATION>'), userPrompt.indexOf('</ACCUSATION>'));
    expect(block).toContain("Accused: none (the room's verdict names no culprit: an overdose)");
    expect(block).toContain('Charge: Accidental overdose');
    expect(block).toContain('Notes: deadlocked 4 to 4');
    expect(block).not.toMatch(/unspecified|Marcus/);
  });

  it('omits the Notes line when the parse kept none', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', accusation: { accused: ['Vic'], charge: 'Murder' } });
    expect(userPrompt).not.toContain('Notes:');
  });
});

describe('the corrections block (phase 2, brief 2.2)', () => {
  it('renders one correction as written, last in the prompt', () => {
    // Phase 3 (3.5): the line after the block speaks only to what the parse reads
    // from the source text (D15), not to "anything in the source text".
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', corrections: 'Blake said it, not Vic.' });
    expect(userPrompt.endsWith('</ENRICHMENT_RULES>\n\n<DIRECTOR_CORRECTIONS>\nBlake said it, not Vic.\n</DIRECTOR_CORRECTIONS>\nApply these corrections to what you parse from the source text; where a correction and the source text differ, the correction is right.\n')).toBe(true);
  });

  it('takes the session\'s list and numbers the corrections in order', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', corrections: ['first', 'second'] });
    expect(userPrompt).toContain('<DIRECTOR_CORRECTIONS>\n1. first\n\n2. second\n</DIRECTOR_CORRECTIONS>');
  });

  it('adds nothing when there are no corrections', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', corrections: [] });
    expect(userPrompt.endsWith('</ENRICHMENT_RULES>\n')).toBe(true);
  });

  it('rawProse stays the caller\'s string (the corrections never rewrite it)', async () => {
    const sdk = jest.fn().mockResolvedValue({ characterMentions: {}, quotes: [], transactionReferences: [] });
    const result = await enrichDirectorNotes({ rawProse: 'Vic to Ashe: "very interesting."', corrections: ['It was Blake.'] }, sdk);
    expect(result.rawProse).toBe('Vic to Ashe: "very interesting."');
  });
});

describe('the enricher never carries a buried memory id (phase 2 final fix wave)', () => {
  const { keyedScoringTimeline, resolveTransactionLinks } = require('../director-enricher');
  const TIMELINE = [
    { time: '09:26 PM', type: 'Sale', team: 'Elephant', amount: '+$450,000' },
    // A row from an older projection that still carried the id in `detail`.
    { time: '09:40 PM', type: 'Sale', detail: 'tay004/Taylor Chase', team: 'Cass', amount: '+$75,000' }
  ];

  it('keys each timeline row tx-1, tx-2, ... and prints only its time, type, account and amount', () => {
    expect(keyedScoringTimeline(TIMELINE)).toEqual([
      { key: 'tx-1', time: '09:26 PM', type: 'Sale', team: 'Elephant', amount: '+$450,000' },
      { key: 'tx-2', time: '09:40 PM', type: 'Sale', team: 'Cass', amount: '+$75,000' }
    ]);
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', scoringTimeline: TIMELINE });
    expect(userPrompt).toContain('"key": "tx-2"');
    expect(`${systemPrompt}\n${userPrompt}`).not.toMatch(/tay004|Taylor/);
  });

  it('asks the model to name each linked row by its key, once, in the user rules', () => {
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt({ rawProse: 'p' });
    expect(userPrompt).toContain('naming each linked row by its key');
    expect(systemPrompt).not.toContain('naming each linked row by its key');
  });

  it('maps each key back to its row as time, amount and account; an unknown key is dropped and counted', () => {
    const { transactionReferences, droppedLinks } = resolveTransactionLinks([
      { excerpt: 'Kai paid Blake', linkedTransactions: [{ key: 'tx-2' }, { key: 'tx-9' }], confidence: 'high', linkReasoning: 'time and amount', tokenId: 'tay004' }
    ], TIMELINE);
    expect(transactionReferences).toEqual([{
      excerpt: 'Kai paid Blake',
      linkedTransactions: [{ timestamp: '09:40 PM', amount: '$75,000', sellingTeam: 'Cass' }],
      confidence: 'high',
      linkReasoning: 'time and amount'
    }]);
    expect(droppedLinks).toBe(1);
  });

  it("keeps a link only when the notes hold its observation word for word; one they do not is dropped and counted (fix batch, item 3)", async () => {
    // <TRANSACTION_LINKS> prints each link's excerpt under a label that calls it the
    // director's words, so a paraphrased observation never reaches it.
    const sdk = jest.fn().mockResolvedValue({
      characterMentions: {}, quotes: [], postInvestigationDevelopments: [],
      transactionReferences: [
        { excerpt: 'Vic was  working\nthe room.', linkedTransactions: [{ key: 'tx-1' }], confidence: 'high' },
        { excerpt: 'Vic sold a large batch to Blake late in the evening.', linkedTransactions: [{ key: 'tx-2' }], confidence: 'medium' }
      ]
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await enrichDirectorNotes({ rawProse: 'Vic was working the room. Blake kept to the bar.', scoringTimeline: TIMELINE }, sdk);
    warn.mockRestore();
    expect(result.transactionReferences).toEqual([{
      excerpt: 'Vic was  working\nthe room.',
      linkedTransactions: [{ timestamp: '09:26 PM', amount: '$450,000', sellingTeam: 'Elephant' }],
      confidence: 'high'
    }]);
    expect(result._enrichmentWarnings).toEqual({ droppedExcerpts: 1 });
  });

  it('enrichDirectorNotes resolves the links against the timeline it was given, and warns of a dropped one', async () => {
    const sdk = jest.fn().mockResolvedValue({
      characterMentions: {}, quotes: [], postInvestigationDevelopments: [],
      transactionReferences: [{ excerpt: 'Vic was working the room.', linkedTransactions: [{ key: 'tx-1' }, { key: 'sar004' }], confidence: 'medium' }]
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await enrichDirectorNotes({ rawProse: 'Vic was working the room.', scoringTimeline: TIMELINE }, sdk);
    warn.mockRestore();
    expect(result.transactionReferences[0].linkedTransactions).toEqual([{ timestamp: '09:26 PM', amount: '$450,000', sellingTeam: 'Elephant' }]);
    expect(result._enrichmentWarnings).toEqual({ droppedLinks: 1 });
    expect(JSON.stringify(result)).not.toMatch(/sar004|tay004/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 (3.6): the director's notes, unguessed. A quote's speaker and wording come
// from the notes as the director corrected them at the input review, its context is
// the director's own words around it, and an epilogue item is the director's
// sentence. On 092026 the notes say "Vic to Ashe" and the director corrected the line
// to Blake, with different wording; an overheard line named no speaker at all.
// ═══════════════════════════════════════════════════════════════════════════════
describe("the director's notes, unguessed (phase 3, 3.6)", () => {
  const PROSE = [
    'Early on, Sam and Sarah talked.',
    'Overheard near the end: "Oh, Sam exposed everything."',
    'Vic to Ashe: "My company is very interesting."',
    'Remi was not available for comment after the investigation. According to his assistant, he is on a short vacation.'
  ].join(' ');
  const CORRECTION = 'The line to Ashe was Blake, not Vic, and Blake said "my company would be very interested".';
  const run = async (payload) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      return await enrichDirectorNotes({ rawProse: PROSE, corrections: [CORRECTION] }, jest.fn().mockResolvedValue(payload));
    } finally {
      warn.mockRestore();
    }
  };

  it('keeps a quote whose speaker the notes do not record, with no speaker', async () => {
    const quote = { text: 'Oh, Sam exposed everything.', context: 'Overheard near the end: "Oh, Sam exposed everything."', confidence: 'low' };
    const result = await run({ quotes: [quote] });
    expect(result.quotes).toEqual([quote]);
  });

  it('leaves the speaker out when only the quoted words name them, never the director\'s', async () => {
    const result = await run({
      quotes: [{ speaker: 'Sam', text: 'Oh, Sam exposed everything.', context: 'Overheard near the end: "Oh, Sam exposed everything."', confidence: 'medium' }]
    });
    expect(result.quotes).toEqual([
      { text: 'Oh, Sam exposed everything.', context: 'Overheard near the end: "Oh, Sam exposed everything."', confidence: 'low' }
    ]);
    expect(result._enrichmentWarnings).toEqual({ unrecordedSpeakers: 1 });
  });

  it('keeps a corrected speaker and wording, with the notes\' words around it and the correction that applied', async () => {
    const corrected = {
      speaker: 'Blake',
      addressee: 'Ashe',
      text: 'my company would be very interested',
      context: 'Vic to Ashe: "My company is very interesting."',
      correction: CORRECTION,
      confidence: 'high'
    };
    const result = await run({ quotes: [corrected] });
    expect(result.quotes).toEqual([corrected]);
    expect(result._enrichmentWarnings).toBeUndefined();
  });

  it('keeps only a context copied from the notes; the quote stays', async () => {
    const result = await run({
      quotes: [{
        speaker: 'Blake', text: 'My company is very interesting.',
        context: 'Prose attributes this to Vic but the correction says Blake.',
        correction: CORRECTION, confidence: 'high'
      }]
    });
    expect(result.quotes).toEqual([
      { speaker: 'Blake', text: 'My company is very interesting.', correction: CORRECTION, confidence: 'high' }
    ]);
    expect(result._enrichmentWarnings).toEqual({ droppedContexts: 1 });
  });

  it('a correction the director\'s corrections do not hold leaves the speaker and addressee out, never the notes\' names (fix batch, item 2)', async () => {
    // The model's correction says the director changed this quote, but the director's
    // corrections do not hold it. Keeping the notes' names could print the line in the
    // mouth the director corrected it away from (T12), so the bank says "speaker not
    // recorded" instead.
    const result = await run({
      quotes: [{
        speaker: 'Vic', addressee: 'Ashe', text: 'My company is very interesting.',
        context: 'Vic to Ashe: "My company is very interesting."',
        correction: 'The director said it was Blake.', confidence: 'high'
      }]
    });
    expect(result.quotes).toEqual([
      { text: 'My company is very interesting.', context: 'Vic to Ashe: "My company is very interesting."', confidence: 'low' }
    ]);
    expect(result._enrichmentWarnings).toEqual({ droppedCorrections: 1, unrecordedSpeakers: 1 });
  });

  it('keeps an epilogue item as the director\'s sentences alone, and drops one the notes do not hold', async () => {
    const result = await run({
      postInvestigationDevelopments: [
        {
          headline: 'Remi unavailable for comment',
          detail: 'Remi was not available for comment after the investigation. According to his assistant, he is on a short vacation.',
          subjects: ['Remi'],
          bearingOnNarrative: 'The accused left town.',
          proseOffset: 120
        },
        { headline: 'Remi fled', detail: 'Remi fled to the Cayman Islands.', subjects: ['Remi'] }
      ]
    });
    expect(result.postInvestigationDevelopments).toEqual([{
      detail: 'Remi was not available for comment after the investigation. According to his assistant, he is on a short vacation.',
      subjects: ['Remi'],
      proseOffset: 120
    }]);
    expect(result._enrichmentWarnings).toEqual({ droppedEpilogueItems: 1 });
  });

  it('tells the model where a quote\'s speaker and wording come from, once, in the user rules', () => {
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt({ rawProse: PROSE, corrections: [CORRECTION] });
    const rules = userPrompt.slice(userPrompt.indexOf('<ENRICHMENT_RULES>'), userPrompt.indexOf('</ENRICHMENT_RULES>'));
    expect(rules).toMatch(/take that from the correction/);
    expect(rules).toMatch(/leave the speaker out/i);
    expect(`${systemPrompt}\n${userPrompt}`.match(/leave the speaker out/gi)).toHaveLength(1);
    expect(`${systemPrompt}\n${userPrompt}`).not.toMatch(/inferable/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Task 3.6 fix batch. Code keeps a quote's context or an epilogue detail only when
// the notes hold it as one piece, so the rules ask for one unbroken passage (item
// 1). Each rule is stated once per call, with its reason (item 5). A link needs the
// notes to describe the sale; an account's name never makes one (item 9, T4).
// ═══════════════════════════════════════════════════════════════════════════════
describe('the enricher rules (task 3.6 fix batch)', () => {
  const rulesOf = (userPrompt) =>
    userPrompt.slice(userPrompt.indexOf('<ENRICHMENT_RULES>'), userPrompt.indexOf('</ENRICHMENT_RULES>'));
  const ruleNumbered = (rules, n) => (rules.split('\n').find(line => line.startsWith(`${n}. `)) || '');

  describe('one unbroken passage (item 1)', () => {
    // The review's probe: the speaker is named two sentences before the quote.
    const NOTES = 'Jess walked over to Sarah at the bar. The room was loud. She leaned in. "You deserve to know the truth."';
    const run = async (quote) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        return await enrichDirectorNotes({ rawProse: NOTES }, jest.fn().mockResolvedValue({ quotes: [quote] }));
      } finally {
        warn.mockRestore();
      }
    };

    it('asks for the context as one unbroken passage from the quote\'s sentence to the sentence that names the speaker', () => {
      const quoteRule = ruleNumbered(rulesOf(buildEnrichmentPrompt({ rawProse: NOTES }).userPrompt), 4);
      expect(quoteRule).toMatch(/^4\. quotes:/);
      expect(quoteRule).toContain("The context is one unbroken passage copied whole from the prose: the quote's sentence, together with the sentence that names the speaker and every sentence between them");
    });

    it('asks for each epilogue item as one unbroken passage', () => {
      const epilogueRule = ruleNumbered(rulesOf(buildEnrichmentPrompt({ rawProse: NOTES }).userPrompt), 5);
      expect(epilogueRule).toMatch(/^5\. postInvestigationDevelopments \(the epilogue\):/);
      expect(epilogueRule).toContain('as one unbroken passage of the prose');
      expect(epilogueRule).not.toMatch(/sentence or sentences/);
    });

    it('keeps the speaker of the probe when the context is the passage the rule asks for', async () => {
      const result = await run({
        speaker: 'Jess', addressee: 'Sarah', text: 'You deserve to know the truth.',
        context: NOTES, confidence: 'medium'
      });
      expect(result.quotes).toEqual([{
        speaker: 'Jess', addressee: 'Sarah', text: 'You deserve to know the truth.', context: NOTES, confidence: 'medium'
      }]);
      expect(result._enrichmentWarnings).toBeUndefined();
    });

    it('leaves the probe\'s speaker unrecorded when the context joins the two named sentences, which is why the rule asks for one passage', async () => {
      const result = await run({
        speaker: 'Jess', text: 'You deserve to know the truth.',
        context: 'Jess walked over to Sarah at the bar. She leaned in. "You deserve to know the truth."', confidence: 'medium'
      });
      expect(result.quotes).toEqual([{ text: 'You deserve to know the truth.', confidence: 'low' }]);
      expect(result._enrichmentWarnings).toEqual({ droppedContexts: 1, unrecordedSpeakers: 1 });
    });
  });

  describe('each rule once per call, with its reason (item 5)', () => {
    const { systemPrompt, userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', corrections: ['c'] });
    const both = `${systemPrompt}\n${userPrompt}`;
    const rules = rulesOf(userPrompt);

    it('states the rules once, in <ENRICHMENT_RULES>, and the system prompt points there', () => {
      expect(systemPrompt).toContain('<ENRICHMENT_RULES>');
      [
        'verbatim substring of the prose',
        'canonical names from the provided <ROSTER>',
        'naming each linked row by its key',
        'each unambiguous direct speech',
        'explicit post-investigation marker',
        'Empty arrays are always valid',
        DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.quotes.items.properties.confidence.description
      ].forEach((phrase) => {
        expect(`${phrase}: ${both.split(phrase).length - 1}`).toBe(`${phrase}: 1`);
        expect(rules).toContain(phrase);
      });
    });

    it('gives the verbatim, quote and epilogue rules each its reason', () => {
      expect(ruleNumbered(rules, 1)).toContain("The writers print these as the director's own words, so code keeps only what the prose or a correction holds word for word.");
      expect(ruleNumbered(rules, 4)).toContain("The writers print each line in its speaker's mouth, so code keeps a speaker only when the context or correction you copy names them.");
      expect(ruleNumbered(rules, 5)).toContain("The writers take the article's follow-up news from these details alone, printed as the director's own words.");
    });
  });

  describe('the link rule (item 9)', () => {
    // An observation about Remi, and an account someone named Remi.
    const probe = buildEnrichmentPrompt({
      rawProse: 'Remi spent the evening at the bar with Sarah.',
      roster: ['Remi', 'Sarah'],
      shellAccounts: [{ name: 'Remi', total: 450000, tokenCount: 2 }],
      scoringTimeline: [{ time: '09:26 PM', type: 'Sale', team: 'Remi', amount: '+$450,000' }]
    });
    const linkRule = ruleNumbered(rulesOf(probe.userPrompt), 3);

    it('links an observation to a row only when the notes describe that sale and its time and amount converge', () => {
      expect(linkRule).toMatch(/^3\. transactionReferences:/);
      expect(linkRule).toContain('only when the notes describe that sale (someone seen selling, or a deal with Blake) and its time and amount converge with the row');
      // "actor" convergence was the opening for a name match: the account's name is
      // the only actor a timeline row carries.
      expect(`${probe.systemPrompt}\n${probe.userPrompt}`).not.toMatch(/actor/);
    });

    it("never links an observation about a character to the account named after them on the name alone, and says why", () => {
      expect(linkRule).toContain("An account's name matching a character never makes a link: a seller can give an account any name, another character's included, so the name says nothing about who sold.");
    });
  });
});
