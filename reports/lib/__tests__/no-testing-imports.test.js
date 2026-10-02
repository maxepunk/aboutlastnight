/**
 * Production code imports helpers by name, never through another module's
 * `_testing` export (phase 2 final fix wave, item 11).
 *
 * evaluator-nodes.js reached into arc-specialist-nodes' and ai-nodes' `_testing` for
 * the writers' builders the judges share (extractEvidenceSummary, buildSessionFacts,
 * outlineWriterInputs, reworkHeroImage, getPromptBuilder). Each is now a named
 * export; the `_testing` aliases stay only where tests (or scripts/render-prompts.js,
 * which renders older trees) read them.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/** Every production .js file under lib/, plus server.js. */
function productionFiles() {
  const out = [path.join(ROOT, 'server.js')];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (entry.name.endsWith('.js')) {
        out.push(full);
      }
    }
  };
  walk(path.join(ROOT, 'lib'));
  return out;
}

describe('no production module imports another module\'s _testing', () => {
  it('finds no statement that both requires a module and reads its _testing', () => {
    const offenders = productionFiles().flatMap((file) => {
      const src = fs.readFileSync(file, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
      return src.split(';')
        .filter((stmt) => /\b_testing\b/.test(stmt) && /\brequire\(/.test(stmt))
        .map((stmt) => `${path.relative(ROOT, file)}: ${stmt.trim().replace(/\s+/g, ' ').slice(0, 120)}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe('the helpers the judges share are named exports', () => {
  it.each([
    // Phase 3 (3.9): the article judge's PHOTOS is built from the article writer's inputs.
    // The 4b fix batch: the one rule for a kept photo, which the evaluator's fact check
    // arguments read, and the one hero entry the outline judge prints. Task 4c-fix: the
    // whiteboard's filename, which the fact check's arguments read too.
    ['lib/workflow/nodes/ai-nodes.js', ['getPromptBuilder', 'buildSessionFacts', 'buildAvailablePhotos', 'outlineWriterInputs', 'articleWriterInputs', 'reworkHeroImage', 'isPhotoExcluded', 'heroPhotoEntry', 'whiteboardFilenameOf']],
    ['lib/workflow/nodes/arc-specialist-nodes.js', ['extractEvidenceSummary', 'hasInterweavingPlan']]
  ])('%s', (file, names) => {
    const mod = require(path.join(ROOT, file));
    names.forEach((name) => expect(`${name}: ${typeof mod[name]}`).toBe(`${name}: function`));
  });
});
