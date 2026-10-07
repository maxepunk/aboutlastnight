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
 * So: the always-visible state is opt-in, the map (Outline.js, task 4.9) opts in at
 * every pencil host, and Article opts in nowhere. The console has no DOM harness
 * (reports/CLAUDE.md), so this is a source contract — which is exactly the right shape
 * for it, since the regression is a class name in the wrong file.
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

  it('has an opt-in always-visible rule, and it is scoped to the opt-in class or the desk rail', () => {
    // A DESCENDANT selector: a host may hold its button at any depth (a direct child,
    // or inside a row of the host's own), and a child selector silently misses every
    // button that is not a direct child.
    expect(css).toContain(`.${ALWAYS} .article-block__edit-btn`);
    expect(css).not.toContain(`.${ALWAYS} > .article-block__edit-btn`);
    // The always-on declaration must never be reachable from the plain host: that
    // is the article-overlap regression. Task 4.3 adds the one other place it may be:
    // the desk's rail, a column of its own beside the article's block, where the
    // pencil sits in the rail's flow and covers no prose.
    const alwaysRules = css
      .split('}')
      .filter((block) => /display:\s*inline-flex/.test(block) && /article-block__edit-btn/.test(block))
      .filter((block) => !block.includes(':hover') && !block.includes(':focus-within') && !block.includes('--editing'));
    expect(alwaysRules.length).toBeGreaterThan(1);
    alwaysRules.forEach((block) => {
      expect(block.includes(ALWAYS) || block.includes('.desk-rail .article-block__edit-btn')).toBe(true);
    });
  });

  it('puts the desk\'s pencil in the rail\'s flow, and the rail in a column of its own (task 4.3)', () => {
    const railPencil = css.slice(css.indexOf('.desk-rail .article-block__edit-btn {'));
    const railBody = railPencil.slice(0, railPencil.indexOf('}'));
    expect(railBody).toMatch(/position:\s*static/);
    expect(railBody).toMatch(/display:\s*inline-flex/);
    const row = css.slice(css.indexOf('.desk-row {'));
    const rowBody = row.slice(0, row.indexOf('}'));
    expect(rowBody).toMatch(/display:\s*grid/);
    expect(rowBody).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  });

  it('reserves the button gutter on the opt-in hosts', () => {
    expect(css).toMatch(new RegExp('\\.' + ALWAYS + '\\s*\\{[^}]*padding-right'));
  });

  it('no opt-in host cancels that gutter with a padding shorthand', () => {
    // Each of the map's pencil hosts (task 4.9) carries its own padding. A `padding`
    // shorthand there has equal specificity and comes later in the file, so it would
    // silently reset padding-right and the pencil would sit over the line it was given a
    // gutter to clear: the hosts use the longhands.
    ['.map__head {', '.map__gap {', '.map__section-head {', '.map__beat {', '.map__length {'].forEach((selector) => {
      const hostRule = css.slice(css.indexOf(selector));
      const body = hostRule.slice(0, hostRule.indexOf('}'));
      expect(`${selector} ${css.includes(selector)}`).toBe(`${selector} true`);
      expect(`${selector} ${/(^|[^-])padding:/.test(body)}`).toBe(`${selector} false`);
    });
  });
});

// Phase 4, task 4.9: the outline stop is the map. Every line the director edits there is a
// pencil host in the always-visible mode (the integrator's ruling 6): the headline and the
// deck, the gap note, each section's heading and job, each beat and the expected length. A
// host's line sits at its left and its controls under it, so the corner is free.
describe('Outline.js opts in at every pencil host', () => {
  const src = read('components/checkpoints/Outline.js');
  const hosts = count(src, "' + ALWAYS");

  it('declares the opt-in pair once', () => {
    expect(count(src, `const ALWAYS = '${BASE} ${ALWAYS}';`)).toBe(1);
  });

  // Piece 4 (brief 4D): a move is a card on the board, whose words open from Edit the words when it
  // is selected, so it is no pencil host.
  it('routes every pencil host of the map through it: the head, the gap note, each section and the length', () => {
    ["'map__head ' + ALWAYS", "'map__gap ' + ALWAYS", "'map__section-head ' + ALWAYS", "'map__length ' + ALWAYS"]
      .forEach((host) => expect(`${host} ${count(src, host)}`).toBe(`${host} 1`));
    expect(`'map__beat ' + ALWAYS ${count(src, "'map__beat ' + ALWAYS")}`).toBe("'map__beat ' + ALWAYS 0");
    expect(hosts).toBe(4);
  });

  it('has one editable host per editBtn call site', () => {
    expect(count(src, 'editBtn(')).toBe(hosts);
  });

  it('never writes a bare --editable host (which would be hover-only again)', () => {
    // Every literal occurrence of the base class must come from the ALWAYS pair.
    expect(count(src, BASE + "'")).toBe(0);
    expect(count(src, BASE + ' ')).toBe(count(src, `${BASE} ${ALWAYS}`));
  });
});

// Phase 4, task 4.3 (spec 2026-10-02 section 6.3): the article stop is the director's desk,
// with every editor visible. The pins that stood here held the article's 13 pencils hidden
// until hover, because a corner button covered the prose at 19 of 54 blocks. On the desk
// each piece of the article is a row whose controls (the pencil, and for a block move,
// delete and insert) sit in a rail, a column of its own beside it, so they are always
// visible and never on the prose: no host is hover-only and none carries the corner overlay.
describe('Article.js puts every pencil in the desk\'s rail', () => {
  const src = read('components/checkpoints/Article.js');

  it('carries no hover-only host and no corner overlay', () => {
    expect(count(src, BASE)).toBe(0);
    expect(count(src, ALWAYS)).toBe(0);
  });

  it('renders its one pencil inside deskRow, the rail every editable piece goes through', () => {
    expect(count(src, 'editBtn(')).toBe(1);
    const row = src.slice(src.indexOf('function deskRow('));
    // Task 4.14g: the pencil waits for an editor left open (editHeld).
    expect(row.slice(0, row.indexOf('\n  }\n'))).toContain("React.createElement('div', { className: 'desk-rail' }, editBtn(onEdit, editHeld)");
  });

  it('gives each piece of the article its row: blocks, section headings, the headline, the byline, the hero, sidebar cards, tracker rows', () => {
    // One definition and seven call sites.
    expect(count(src, 'deskRow(')).toBe(8);
  });
});
