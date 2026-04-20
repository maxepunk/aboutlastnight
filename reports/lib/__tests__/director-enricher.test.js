const { DIRECTOR_NOTES_ENRICHED_SCHEMA } = require('../director-enricher');

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
