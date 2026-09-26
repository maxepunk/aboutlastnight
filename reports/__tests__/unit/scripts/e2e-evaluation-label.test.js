/**
 * The harness labels a model's score as the console does (phase 2, brief 2.4).
 *
 * The harness runs main() on require, so this is a source-level pin in the style of
 * e2e-trace.test.js. The wording itself is pinned in
 * console/__tests__/checkpoint-view-logic.test.js; the harness prints it from that
 * module and carries none of its own.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'scripts', 'e2e-walkthrough.js'), 'utf8'
);

function body(signature) {
  const block = SRC.slice(SRC.indexOf(signature));
  return block.slice(0, block.indexOf('\n}\n'));
}

describe('e2e-walkthrough labels the evaluation score', () => {
  it('prints the view\'s calibration phrase under the score, with no wording of its own', () => {
    const fn = body('function displayEvaluationStatus(');
    expect(fn).toMatch(/ViewLogic\.evaluationView\(evaluation\)/);
    expect(fn).toMatch(/view\.calibration/);
    expect(fn).not.toMatch(/uncalibrated/i);
  });
});
