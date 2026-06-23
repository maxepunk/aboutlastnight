/**
 * F9 (X-2) regression guard: the live article evaluator must ban the BARE
 * "token" system label but explicitly ALLOW the in-world phrase "memory token".
 * Both themes. Asserted against the source of the CRITICAL CHECKS block.
 */
const fs = require('fs');
const path = require('path');

describe('F9: evaluator token ban is scoped to bare token', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'evaluator-nodes.js'),
    'utf8'
  );

  // Isolate the CRITICAL CHECKS block so unrelated "token" mentions elsewhere
  // (e.g. tokenId in schemas) don't pollute the assertion.
  const start = src.indexOf('CRITICAL CHECKS:');
  const block = src.slice(start, start + 800);

  it('locates the CRITICAL CHECKS block', () => {
    expect(start).toBeGreaterThan(-1);
  });

  it('scopes the ban to the bare system label and allows "memory token"', () => {
    // After the fix, the ban is qualified as the "bare system label" and the
    // in-world phrase "memory token" is explicitly allowed.
    expect(block).toMatch(/memory token/);
    expect(block).toMatch(/bare system label "token"/);
  });

  it('does not contain the old unscoped instruction', () => {
    expect(block).not.toContain('MUST NOT contain "token"');
    expect(block).not.toContain('contain "token", "Act');
  });

  it('the structural antiPatterns criterion also allows "memory token"', () => {
    const idx = src.indexOf('Are anti-patterns avoided?');
    expect(idx).toBeGreaterThan(-1);
    const criterionBlock = src.slice(idx, idx + 500); // covers both adjacent theme variants
    expect(criterionBlock).toMatch(/memory token/);
  });
});
