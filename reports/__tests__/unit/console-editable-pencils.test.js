/**
 * The inline edit pencil has TWO reveal modes, and mixing them up is a measured
 * defect in both directions.
 *
 *   `article-block--editable`         hidden until :hover / :focus-within
 *   `article-block--editable-always`  rendered at low opacity, always
 *
 * Direction 1 (R4 F1 / R5 F5): `Outline.js` emitted NEITHER class at any of its
 * 13 pencil call sites, so every pencil was `display: none` forever, the whole
 * rich editor layer (outline-edit-logic.js plus its unit tests plus the
 * client-side validateOutlineShape gate) was unreachable, and the only edit path
 * was a raw 20-row JSON textarea.
 *
 * Direction 2 (review fix 1): making the pencil always visible for EVERY host
 * put a 24px button on top of the article's own prose at 19 of 54 rendered
 * blocks, because `Article.js`'s hosts are full-width per-block containers whose
 * first line reaches the top-right corner.
 *
 * So: the always-visible state is opt-in, Outline opts in at every site, and
 * Article opts in nowhere. The console has no DOM harness (reports/CLAUDE.md), so
 * this is a source contract — which is exactly the right shape for it, since the
 * regression is a class name in the wrong file.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');

const BASE = 'article-block--editable';
const ALWAYS = 'article-block--editable-always';

/** Count occurrences of `needle` in `haystack`. */
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

describe('inline edit pencil: default reveal is hover/focus', () => {
  const css = read('console.css');

  it('the base button is display:none', () => {
    const rule = css.slice(css.indexOf('.article-block__edit-btn {'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toMatch(/display:\s*none/);
    expect(body).not.toMatch(/display:\s*inline-flex/);
  });

  it('is revealed by :hover and :focus-within on the default host', () => {
    expect(css).toContain(`.${BASE}:hover .article-block__edit-btn`);
    expect(css).toContain(`.${BASE}:focus-within .article-block__edit-btn`);
  });

  it('is revealed while a section editor is open', () => {
    expect(css).toContain('.outline-section--editing .article-block__edit-btn');
  });

  it('has an opt-in always-visible rule, and it is scoped to the opt-in class', () => {
    // A DESCENDANT selector: the button sits at three different depths across the
    // opt-in host shapes (direct child, inside .outline-section__header, inside a
    // plain .flex row), so a child selector silently misses two of them.
    expect(css).toContain(`.${ALWAYS} .article-block__edit-btn`);
    expect(css).not.toContain(`.${ALWAYS} > .article-block__edit-btn`);
    // The always-on declaration must never be reachable from the plain host: that
    // is the article-overlap regression.
    const alwaysRules = css
      .split('}')
      .filter((block) => /display:\s*inline-flex/.test(block) && /article-block__edit-btn/.test(block))
      .filter((block) => !block.includes(':hover') && !block.includes(':focus-within') && !block.includes('--editing'));
    expect(alwaysRules.length).toBeGreaterThan(0);
    alwaysRules.forEach((block) => {
      expect(block).toContain(ALWAYS);
    });
  });

  it('reserves the button gutter on the opt-in hosts', () => {
    expect(css).toMatch(new RegExp('\\.' + ALWAYS + '\\s*\\{[^}]*padding-right'));
  });
});

describe('Outline.js opts in at every pencil host', () => {
  const src = read('components/checkpoints/Outline.js');

  it('declares the opt-in pair once and uses it for the section wrapper', () => {
    expect(src).toContain(`const ALWAYS = '${BASE} ${ALWAYS}';`);
    expect(src).toContain("const EDITABLE = 'outline-section ' + ALWAYS;");
  });

  it('routes all 14 pencil hosts through it: 12 section wrappers + the 2 THE STORY rows', () => {
    // The 12 `.outline-section` wrappers.
    expect(count(src, 'className: EDITABLE')).toBe(12);
    // The arc row and the arc-interweaving row, which are not section wrappers.
    expect(count(src, "'outline-section__arc ' + ALWAYS")).toBe(1);
    expect(count(src, "gap-sm mt-sm ' + ALWAYS")).toBe(1);
  });

  it('has one editable host per editBtn call site', () => {
    const hosts = count(src, 'className: EDITABLE') +
      count(src, "'outline-section__arc ' + ALWAYS") +
      count(src, "gap-sm mt-sm ' + ALWAYS");
    expect(count(src, 'editBtn(')).toBe(hosts);
    expect(hosts).toBe(14);
  });

  it('renders the thesis panel through the opt-in host and its own editing key (spec 2026-09-19 §6.1)', () => {
    expect(src).toContain("className: EDITABLE + ' outline-thesis'");
    expect(src).toContain("setEditingBlock({ type: 'section', key: 'thesis' })");
    expect(src).toContain("isEditing('section', 'thesis')");
    expect(src).toContain('EditLogic.buildThesisPayload(');
  });

  it('never writes a bare --editable host (which would be hover-only again)', () => {
    // Every literal occurrence of the base class must come from the ALWAYS pair.
    expect(count(src, BASE + "'")).toBe(0);
    expect(count(src, BASE + ' ')).toBe(count(src, `${BASE} ${ALWAYS}`));
  });
});

describe('Article.js never opts in', () => {
  const src = read('components/checkpoints/Article.js');

  it('carries no always-visible host', () => {
    // 19 of 54 rendered blocks had the button on top of their own text.
    expect(count(src, ALWAYS)).toBe(0);
  });

  it('still marks every pencil host as editable (hover/focus reveal)', () => {
    const hosts = count(src, BASE);
    expect(hosts).toBe(13);
    expect(count(src, 'editBtn(')).toBe(hosts);
  });
});
