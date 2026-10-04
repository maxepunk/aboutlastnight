/**
 * 4.14e: the map and the desk say a send-back did not run, wired (the final review's ruling 5).
 *
 * The console has no DOM harness (reports/CLAUDE.md), so the line's logic is pinned in
 * console/__tests__/checkpoint-view-logic-rework.test.js and its wiring here, on the source
 * text, in the style of console-desk-marks.test.js: each stop builds the line from its payload's
 * roundDidNotRun and its own note box, and shows it as a status line where the director acts on
 * it, the map in the lines on what happened since the director last looked, the desk above its
 * note box. The harness's pages (lib/stop-pages.js) print the same line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('4.14e: the map and the desk show the line for a send-back that did not run', () => {
  it("Outline.js builds the line from the payload and the map's note box, and shows it among the round's lines", () => {
    const src = read('console/components/checkpoints/Outline.js');
    expect(src).toContain("const didNotRun = ViewLogic.reworkDidNotRunLine(data && data.roundDidNotRun, note, 'map');");
    expect(src).toMatch(/const roundLines = didNotRun \|\| view\.round/);
    expect(src).toContain("didNotRun && React.createElement('p', { className: 'map__did-not-run', role: 'status' }, didNotRun)");
  });

  it("Article.js builds the line from the payload and the desk's note box, and shows it above the note box", () => {
    const src = read('console/components/checkpoints/Article.js');
    expect(src).toContain("const didNotRun = ViewLogic.reworkDidNotRunLine(data && data.roundDidNotRun, feedbackText, 'article');");
    const line = src.indexOf("didNotRun && React.createElement('p', { className: 'desk__did-not-run', role: 'status' }, didNotRun)");
    expect(line).toBeGreaterThan(-1);
    expect(line).toBeLessThan(src.indexOf("htmlFor: 'article-note'"));
  });

  it('the line has the meeting\'s style at each stop', () => {
    expect(read('console/console.css')).toMatch(/\.meeting__did-not-run,\s*\.map__did-not-run,\s*\.desk__did-not-run\s*\{/);
  });
});
