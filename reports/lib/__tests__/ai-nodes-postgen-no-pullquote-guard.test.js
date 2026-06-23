const fs = require('fs');
const path = require('path');

describe('generateContentBundle post-gen logging — dead pullQuote guards removed (CR-8)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'workflow', 'nodes', 'ai-nodes.js'),
    'utf8'
  );

  it('no longer computes minPullQuotes', () => {
    expect(src).not.toMatch(/minPullQuotes/);
  });

  it('no longer computes pullQuoteCount', () => {
    expect(src).not.toMatch(/pullQuoteCount/);
  });

  it('no longer claims pull quotes trigger a revision loop', () => {
    expect(src).not.toMatch(/INSUFFICIENT pull quotes/);
  });

  it('still logs the inline evidence-card check (kept)', () => {
    expect(src).toMatch(/minInlineCards/);
  });
});
