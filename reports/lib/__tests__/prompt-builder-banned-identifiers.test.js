/**
 * F4 (X-3) regression guard: the live article prompt must not anchor the model
 * on retired identifiers (jav042/JAV042, "Victoria", "Jamie Woods").
 *
 * Phase 3 (3.2): the EVIDENCE-CARD INLINE EXAMPLE is gone with the rest of the old
 * journalist instruction (its card text carried an id and timestamp prefix, against
 * T12, and its paragraphs narrated a scene). The block shapes now show "..." where
 * content goes (prompt-files-no-leakable-examples.test.js). The guard stays on the
 * whole source.
 */
const fs = require('fs');
const path = require('path');

describe('F4: no retired identifiers in the article prompt source', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'prompt-builder.js'),
    'utf8'
  );

  it('carries no example card any more', () => {
    expect(src).not.toContain('EVIDENCE-CARD INLINE EXAMPLE:');
  });

  it('the prompt builder contains no retired token id anywhere (jav042/JAV042)', () => {
    expect(/jav042/i.test(src)).toBe(false);
  });

  it('the prompt builder contains no retired character name anywhere (Victoria / Jamie Woods)', () => {
    expect(src).not.toMatch(/Victoria/);
    expect(src).not.toMatch(/Jamie Woods/);
  });
});

/**
 * F9 scoped the token ban in buildValidationPrompt and buildRevisionPrompt. Phase 3
 * (3.2; M25) deleted both: no node called them, and they kept rules the rulings had
 * changed.
 */
describe('M25: the dead validation and revision builders are gone', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'prompt-builder.js'), 'utf8');

  it.each(['buildValidationPrompt', 'buildRevisionPrompt'])('%s', (name) => {
    expect(src).not.toContain(`async ${name}`);
    const { PromptBuilder } = require('../prompt-builder');
    expect(PromptBuilder.prototype[name]).toBeUndefined();
  });
});
