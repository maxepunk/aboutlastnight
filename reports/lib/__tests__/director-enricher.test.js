const { DIRECTOR_NOTES_ENRICHED_SCHEMA, buildEnrichmentPrompt, enrichDirectorNotes, createFallback } = require('../director-enricher');

describe('DIRECTOR_NOTES_ENRICHED_SCHEMA', () => {
  it('requires rawProse as the source of truth', () => {
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.required).toContain('rawProse');
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.rawProse.type).toBe('string');
  });

  it('defines characterMentions as an object of arrays keyed by canonical name', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.characterMentions;
    expect(prop.type).toBe('object');
    expect(prop.additionalProperties.type).toBe('array');
    const item = prop.additionalProperties.items;
    expect(item.properties.excerpt.type).toBe('string');
    expect(item.properties.proseOffset.type).toBe('number');
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
    expect(item.properties.confidence.enum).toEqual(['high', 'low']);
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

  it('system prompt forbids summarization and requires rawProse verbatim', () => {
    const { systemPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(systemPrompt).toMatch(/not.*summariz/i);
    expect(systemPrompt).toMatch(/verbatim/i);
    expect(systemPrompt).toMatch(/rawProse.*MUST equal the input/i);
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
    expect(call.timeoutMs).toBe(10 * 60 * 1000);
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
