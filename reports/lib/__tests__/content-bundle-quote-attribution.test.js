const { SchemaValidator } = require('../schema-validator');

describe('content-bundle quote content-block — F3 crystallization (CR-2)', () => {
  const validator = new SchemaValidator();

  function bundleWithQuoteBlock(quoteBlock) {
    return {
      metadata: {
        sessionId: '1221',
        theme: 'journalist',
        generatedAt: '2027-02-22T18:00:00.000Z'
      },
      headline: { main: 'A headline long enough' },
      sections: [
        {
          id: 'the-story',
          type: 'narrative',
          content: [
            { type: 'paragraph', text: 'Setup prose.' },
            quoteBlock,
            { type: 'paragraph', text: 'Payoff prose.' }
          ]
        }
      ]
    };
  }

  it('accepts a crystallization quote block with attribution OMITTED', () => {
    const result = validator.validate(
      'content-bundle',
      bundleWithQuoteBlock({ type: 'quote', text: 'The room rewrote the night it had just lived.' })
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('still accepts a verbatim quote block WITH attribution', () => {
    const result = validator.validate(
      'content-bundle',
      bundleWithQuoteBlock({ type: 'quote', text: "I never touched the account.", attribution: 'Skyler' })
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a quote block with no text', () => {
    const result = validator.validate(
      'content-bundle',
      bundleWithQuoteBlock({ type: 'quote', attribution: 'Skyler' })
    );
    expect(result.valid).toBe(false);
  });
});
