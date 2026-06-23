/**
 * F4 (X-3) regression guard: the live article prompt must not anchor the model
 * on retired identifiers (jav042/JAV042, "Victoria", "Jamie Woods").
 * The EVIDENCE-CARD INLINE EXAMPLE must use neutral placeholders instead.
 */
const fs = require('fs');
const path = require('path');

describe('F4: no retired identifiers in the article prompt source', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'prompt-builder.js'),
    'utf8'
  );

  // Scope the assertion to the EVIDENCE-CARD INLINE EXAMPLE block so we don't
  // accidentally trip on unrelated prose elsewhere in the file.
  const exampleStart = src.indexOf('EVIDENCE-CARD INLINE EXAMPLE:');
  const exampleEnd = src.indexOf('CRYSTALLIZATION & VERBATIM MOMENTS:');
  const example = src.slice(exampleStart, exampleEnd);

  it('locates the example block', () => {
    expect(exampleStart).toBeGreaterThan(-1);
    expect(exampleEnd).toBeGreaterThan(exampleStart);
  });

  it('contains no retired token id (jav042/JAV042)', () => {
    expect(/jav042/i.test(example)).toBe(false);
  });

  it('contains no retired character names (Victoria / Jamie Woods)', () => {
    expect(example).not.toMatch(/Victoria/);
    expect(example).not.toMatch(/Jamie Woods/);
  });

  it('uses neutral placeholders (tok001 + [Character A])', () => {
    expect(example).toContain('tok001');
    expect(example).toContain('[Character A]');
  });

  it('the prompt builder contains no retired token id anywhere (jav042/JAV042)', () => {
    expect(/jav042/i.test(src)).toBe(false);
  });
});

describe('F9: buildValidationPrompt token ban is scoped', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'prompt-builder.js'),
    'utf8'
  );
  const start = src.indexOf('async buildValidationPrompt');
  const end = src.indexOf('getPhaseRequirements');
  const fn = src.slice(start, end);

  it('locates buildValidationPrompt', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('detective checklist no longer flags unqualified "token"', () => {
    expect(fn).not.toContain('("token", "Act 3"');
  });

  it('journalist checklist no longer flags unqualified "token/tokens"', () => {
    expect(fn).not.toContain('"token/tokens"');
  });

  it('both checklists allow the in-world phrase "memory token"', () => {
    const occurrences = (fn.match(/memory token/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

describe('F9: buildRevisionPrompt token ban is scoped', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'prompt-builder.js'),
    'utf8'
  );
  const start = src.indexOf('async buildRevisionPrompt');
  const end = src.indexOf('async buildValidationPrompt');
  const fn = src.slice(start, end);

  it('locates buildRevisionPrompt', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('detective revision checklist no longer bans unqualified "tokens"', () => {
    expect(fn).not.toContain('terminology ("tokens"');
  });

  it('journalist revision checklist no longer bans unqualified "tokens"', () => {
    expect(fn).not.toContain('language ("tokens"');
  });

  it('both revision checklists allow the in-world phrase "memory token"', () => {
    const occurrences = (fn.match(/memory token/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
